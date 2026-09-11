import type { BuffFacts, BuffUptimeFact, CombatEvent, Evidence } from '@wcl/domain';
import type { FactsInput, TargetFactsOptions } from './types.js';

type BuffEvent = CombatEvent;

function isBuffEvent(
  event: CombatEvent,
): event is BuffEvent & { rawType: string } {
  return (
    (event.type === 'buff' || event.type === 'debuff') &&
    typeof event.rawType === 'string'
  );
}

/**
 * Buff / debuff uptime facts measured against the fight window
 * [startTime, endTime].
 *
 * Stacks are summed across apply (+1) and remove (-1); a refresh re-applies
 * while the buff is already present and only starts it when absent.
 */
export function computeBuffFacts(
  input: FactsInput,
  options?: TargetFactsOptions,
): BuffFacts {
  const targetId = options?.targetId ?? input.player.id;
  const fightStart = input.fight.startTime;
  const fightEnd = input.fight.endTime;
  const durationMs = Math.max(0, fightEnd - fightStart);

  const buffEvents = input.events
    .filter(isBuffEvent)
    .filter((event) => event.targetId === targetId);

  const byAbility = groupBuffs(buffEvents);

  const buffs: BuffUptimeFact[] = Object.values(byAbility).map((group) => {
    const sorted = [...group].sort((a, b) => a.timestamp - b.timestamp);
    const { activeMs, maxStacks, avgStacks } = computeUptime(
      sorted,
      fightStart,
      fightEnd,
    );
    const refreshCount = sorted.filter(
      (event) => event.rawType === 'refreshbuff',
    ).length;

    const evidence: Evidence[] = sorted
      .filter(
        (event) =>
          event.rawType === 'applybuff' || event.rawType === 'removebuff',
      )
      .map((event) => ({
        fightId: input.fight.id,
        timestamp: event.timestamp,
        ability: event.abilityName,
        abilityId: event.abilityId,
        note: event.rawType,
      }));

    return {
      type: 'buff.uptime',
      abilityId: sorted[0]?.abilityId,
      abilityName: sorted[0]?.abilityName,
      uptime: durationMs > 0 ? activeMs / durationMs : 0,
      downtimeMs: Math.max(0, durationMs - activeMs),
      maxStacks,
      avgStacks,
      refreshCount,
      evidence,
    };
  });

  return { type: 'buff', buffs };
}

function groupBuffs(events: BuffEvent[]): Record<string, BuffEvent[]> {
  const groups: Record<string, BuffEvent[]> = {};
  for (const event of events) {
    const key =
      event.abilityId !== undefined
        ? `id:${event.abilityId}`
        : `name:${event.abilityName ?? 'unknown'}`;
    const group = groups[key] ?? [];
    group.push(event);
    groups[key] = group;
  }
  return groups;
}

function computeUptime(
  sorted: BuffEvent[],
  fightStart: number,
  fightEnd: number,
): { activeMs: number; maxStacks: number; avgStacks: number } {
  let stacks = 0;
  let maxStacks = 0;
  let lastChangeTime = fightStart;
  let lastWasActive = false;
  let accumulatedStackTime = 0;
  let accumulatedActiveTime = 0;

  const flush = (until: number): void => {
    const span = Math.max(0, until - lastChangeTime);
    if (span > 0) {
      accumulatedStackTime += stacks * span;
      if (lastWasActive && stacks > 0) {
        accumulatedActiveTime += span;
      }
    }
  };

  for (const event of sorted) {
    flush(event.timestamp);

    if (event.rawType === 'removebuff' && stacks > 0) {
      stacks -= 1;
    } else if (event.rawType === 'applybuff') {
      stacks += 1;
    } else if (event.rawType === 'refreshbuff' && stacks === 0) {
      stacks += 1;
    }

    maxStacks = Math.max(maxStacks, stacks);
    lastChangeTime = event.timestamp;
    lastWasActive = stacks > 0;
  }

  flush(fightEnd);

  const span = Math.max(0, fightEnd - fightStart);
  const avgStacks = span > 0 ? accumulatedStackTime / span : 0;

  return {
    activeMs: accumulatedActiveTime,
    maxStacks,
    avgStacks: Math.round(avgStacks * 1000) / 1000,
  };
}
