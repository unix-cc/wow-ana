import type { CombatEvent } from '@wcl/domain';
import type { SpecKnowledge } from '@wcl/spec-knowledge';
import type { ObservedDecision, DecisionState } from './types.js';
import {
  buildKnowledgeIndex,
  normalizedNameToken,
  resolveAbility,
} from './knowledge-index.js';

/**
 * Replay a player's normalized combat events into one `ObservedDecision` per
 * GCD choice. This is the bridge from the internal combat model to the
 * priority evaluator:
 *
 * ```text
 * CombatEvent[] + SpecKnowledge → buildObservedDecisions() → ObservedDecision[]
 *                                                              → evaluatePriority()
 * ```
 *
 * The replayer is **knowledge-driven but knowledge-free in judgement**: it uses
 * Spec Knowledge only to *label* events (spell id / aura id → ability key),
 * never to decide whether a choice was good.
 *
 * ## Decision points
 *
 * A GCD choice is the *start* of a cast. The replayer therefore emits one
 * decision per `begincast` (spells with a cast time / channel) and one per
 * `cast` for instant abilities, which WCL logs without a `begincast`. The
 * completing `cast` of a spell that already produced a `begincast` is not a
 * new decision.
 *
 * ## Reconstruction caveats (honesty over precision)
 *
 * - WCL aura stack events carry the *new total* in a `stack` field that the
 *   internal combat model does not expose. Stack counters are therefore
 *   rebuilt by ±1 increments (`applybuffstack` +1 / `removebuffstack` -1).
 *   Logs that skip intermediate stack events make the counter drift; a
 *   stack-aware normalizer is a later-phase improvement.
 * - Auras active at the pull (pre-cast buffs) are not retroactively applied.
 * - Resource values are converted to percent-of-cap only when the spec
 *   declares a hard cap (`ResourceKnowledge.cap`). Mana-style pools without a
 *   cap stay `undefined` → resource conditions evaluate to `unknown`.
 * - Cooldowns start at `begincast` when one exists, else at `cast`.
 */

export interface ReplayInput {
  /** The actor whose decisions are replayed. */
  playerId: number;
  events: CombatEvent[];
  knowledge: SpecKnowledge;
  /** Trailing window used to count active enemies, default 5000 ms. */
  targetWindowMs?: number | undefined;
}

export interface ReplayOutput {
  /** Mapped decisions in chronological order. */
  decisions: ObservedDecision[];
  /** Player casts/begincasts that matched no knowledge ability. */
  skippedUnmappedCasts: number;
}

interface BuffEntry {
  active: boolean;
  stacks: number;
}

const BUFF_RAW_TYPES = new Set([
  'applybuff',
  'refreshbuff',
  'removebuff',
  'applybuffstack',
  'refreshbuffstack',
  'removebuffstack',
  'applydebuff',
  'refreshdebuff',
  'removedebuff',
]);

function buffTrackerKey(abilityId?: number | undefined, abilityName?: string | undefined): string | undefined {
  if (abilityId !== undefined) return `id:${abilityId}`;
  if (abilityName !== undefined) return `name:${normalizedNameToken(abilityName)}`;
  return undefined;
}

function buffKnowledgeKey(buff: { abilityId?: number | undefined; name: string }): string | undefined {
  if (buff.abilityId !== undefined) return `id:${buff.abilityId}`;
  return `name:${normalizedNameToken(buff.name)}`;
}

export function buildObservedDecisions(input: ReplayInput): ReplayOutput {
  const { playerId, knowledge } = input;
  const index = buildKnowledgeIndex(knowledge);
  const targetWindowMs = input.targetWindowMs ?? 5000;

  const events = [...input.events].sort((a, b) => a.timestamp - b.timestamp);

  // Feed-coverage flags: constant for the whole replay. Absence of a buff in
  // a fight whose buff feed we watched is *observable absence* (not active);
  // a fight with no buff events at all is not.
  let hadBuffEvents = false;
  let hadResourceEvents = false;
  let hadDamageEvents = false;
  for (const event of events) {
    if (
      (event.type === 'buff' || event.type === 'debuff') &&
      event.targetId === playerId &&
      typeof event.rawType === 'string' &&
      BUFF_RAW_TYPES.has(event.rawType)
    ) {
      hadBuffEvents = true;
      break;
    }
  }
  for (const event of events) {
    if (event.type === 'resource' && event.sourceId === playerId) {
      hadResourceEvents = true;
      break;
    }
  }
  for (const event of events) {
    if (event.type === 'damage' && event.sourceId === playerId) {
      hadDamageEvents = true;
      break;
    }
  }

  // Buff state by tracker key (`id:N` / `name:token`).
  const buffs = new Map<string, BuffEntry>();
  const applyBuff = (key: string | undefined, viaRefresh: boolean): void => {
    if (key === undefined) return;
    const entry = buffs.get(key);
    if (viaRefresh) {
      // refreshbuff only *starts* the aura when it was absent; stacks carry on.
      if (!entry?.active) buffs.set(key, { active: true, stacks: 1 });
      return;
    }
    if (entry?.active) {
      buffs.set(key, { active: true, stacks: (entry.stacks ?? 0) + 1 });
    } else {
      buffs.set(key, { active: true, stacks: 1 });
    }
  };

  // Resource amount by (lower-cased) type.
  const resourceByType = new Map<string, number>();

  // next-ready time per ability key.
  const nextReadyByKey = new Map<string, number>();

  // Ability keys whose begincast has not completed yet.
  const pendingBegincasts = new Set<string>();

  // Most recent player-damage timestamp per enemy target (sliding window).
  const lastHitByTarget = new Map<number, number>();

  const decisions: ObservedDecision[] = [];
  let skippedUnmappedCasts = 0;

  const snapshot = (time: number): DecisionState => {
    // Purge stale enemies.
    const cutoff = time - targetWindowMs;
    for (const [targetId, lastHit] of lastHitByTarget) {
      if (lastHit < cutoff) lastHitByTarget.delete(targetId);
    }

    const buffsActive = new Set<string>();
    const buffStacks = new Map<string, number>();
    for (const buff of index.buffsByKey.values()) {
      const key = buffKnowledgeKey(buff);
      if (key === undefined) continue;
      const entry = buffs.get(key);
      if (entry?.active) buffsActive.add(buff.key);
      if (index.stackBuffKeys.has(buff.key)) {
        buffStacks.set(buff.key, entry?.stacks ?? 0);
      }
    }

    const ready = new Set<string>();
    for (const key of index.cooldownMsByKey.keys()) {
      const next = nextReadyByKey.get(key);
      if (next === undefined || time >= next) ready.add(key);
    }

    let resource: number | undefined;
    for (const res of knowledge.resources) {
      const amount = resourceByType.get(res.type.toLowerCase());
      if (amount === undefined) continue;
      const cap = res.cap;
      if (cap !== undefined && cap > 0) {
        resource = Math.round((amount / cap) * 1000) / 10;
        break;
      }
    }

    return {
      time,
      buffsActive,
      buffStacks,
      ready,
      resource,
      targetCount: lastHitByTarget.size,
      observable: {
        buff: hadBuffEvents,
        resource: hadResourceEvents,
        targetCount: hadDamageEvents,
      },
    };
  };

  const registerDecision = (event: CombatEvent, abilityKey: string): void => {
    const state = snapshot(event.timestamp);
    decisions.push({
      time: event.timestamp,
      actualKey: abilityKey,
      actualAbilityId: event.abilityId,
      state,
    });
  };

  const startCooldown = (abilityKey: string, time: number): void => {
    const cd = index.cooldownMsByKey.get(abilityKey);
    if (cd !== undefined) nextReadyByKey.set(abilityKey, time + cd);
  };

  for (const event of events) {
    if ((event.type === 'buff' || event.type === 'debuff') && event.targetId === playerId) {
      const rawType = event.rawType;
      if (typeof rawType !== 'string' || !BUFF_RAW_TYPES.has(rawType)) continue;
      const key = buffTrackerKey(event.abilityId, event.abilityName);
      if (key === undefined) continue;
      if (rawType === 'removebuff' || rawType === 'removedebuff' || rawType === 'removebuffstack') {
        const entry = buffs.get(key);
        if (rawType === 'removebuff' || rawType === 'removedebuff') {
          buffs.set(key, { active: false, stacks: 0 });
        } else {
          const stacks = Math.max(0, (entry?.stacks ?? 1) - 1);
          buffs.set(key, { active: stacks > 0, stacks });
        }
      } else if (rawType === 'refreshbuff' || rawType === 'refreshbuffstack' || rawType === 'refreshdebuff') {
        applyBuff(key, true);
      } else if (rawType === 'applybuffstack') {
        applyBuff(key, false);
      } else {
        // applybuff / applydebuff
        applyBuff(key, false);
      }
      continue;
    }

    if (event.type === 'resource' && event.sourceId === playerId) {
      if (event.resourceType !== undefined && event.resourceAmount !== undefined) {
        resourceByType.set(event.resourceType.toLowerCase(), event.resourceAmount);
      }
      continue;
    }

    if (event.type === 'damage' && event.sourceId === playerId) {
      if (event.targetIsFriendly === true) continue;
      if (event.targetId === undefined) continue;
      lastHitByTarget.set(event.targetId, event.timestamp);
      continue;
    }

    if (event.type === 'begincast' || event.type === 'cast') {
      if (event.sourceId !== playerId) continue;
      const ability = resolveAbility(index, event);
      if (ability === undefined) {
        skippedUnmappedCasts += 1;
        continue;
      }
      const key = ability.key;
      if (event.type === 'begincast') {
        pendingBegincasts.add(key);
        registerDecision(event, key);
        startCooldown(key, event.timestamp);
      } else {
        // cast
        if (pendingBegincasts.has(key)) {
          // Completion of a casted spell — not a new GCD choice.
          pendingBegincasts.delete(key);
        } else {
          // Instant ability: the cast *is* the decision.
          registerDecision(event, key);
          startCooldown(key, event.timestamp);
        }
      }
      continue;
    }
  }

  return { decisions, skippedUnmappedCasts };
}
