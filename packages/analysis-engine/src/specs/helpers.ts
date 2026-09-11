import type { CombatEvent, Finding } from '@wcl/domain';
import type { SpecRule } from './types.js';
import { isMythicPlusRun } from '../fight-context.js';
import {
  castsBySource,
  eventsOfAbility,
  findIdleWindows,
  totalIdleMs,
} from '../core/timeline.js';

/** Extract casts of an ability (by id or name) from a player's events. */
export function abilityCasts(
  events: CombatEvent[],
  sourceId: number,
  abilityId: number,
  abilityName: string,
): CombatEvent[] {
  return eventsOfAbility(
    events.filter(
      (event) => event.type === 'cast' && event.sourceId === sourceId,
    ),
    abilityId,
    abilityName,
  );
}

/**
 * Downgrade a "never used your big cooldown" finding for Mythic+ runs.
 *
 * In a Mythic+ dungeon the whole run is one fight, so a zero-cast
 * big-cooldown finding is ambiguous: the build may simply not take the
 * talent, and events cannot tell that apart from "had it and never used
 * it". The finding is downgraded to `low` with an explicit caveat so it
 * reads as a hint, not an accusation.
 */
export function downgradeForDungeon(
  findings: Finding[],
  ruleId: string,
  caveat: { description: string; recommendation: string },
): Finding[] {
  return findings.map((finding) => {
    if (
      finding.id === ruleId &&
      finding.category === 'cooldown' &&
      /基本未使用/.test(finding.title)
    ) {
      return {
        ...finding,
        severity: 'low',
        description: `${finding.description}${caveat.description}`,
        recommendation: `${finding.recommendation ?? ''}${caveat.recommendation}`,
      };
    }
    return finding;
  });
}

/**
 * Sum the total active time of a buff from apply/refresh/remove events,
 * measured against [fightStart, fightEnd].
 */
export function buffActiveMs(
  events: CombatEvent[],
  targetId: number,
  abilityId: number,
  abilityName: string,
  fightStart: number,
  fightEnd: number,
): { activeMs: number; refreshCount: number } {
  const buffEvents = events.filter(
    (event) =>
      event.targetId === targetId &&
      (event.rawType === 'applybuff' ||
        event.rawType === 'refreshbuff' ||
        event.rawType === 'removebuff') &&
      (event.abilityId === abilityId || event.abilityName === abilityName),
  );

  const sorted = [...buffEvents].sort((a, b) => a.timestamp - b.timestamp);
  let stacks = 0;
  let lastChange = fightStart;
  let lastActive = false;
  let activeMs = 0;
  let refreshCount = 0;

  for (const event of sorted) {
    const span = event.timestamp - lastChange;
    if (span > 0 && lastActive && stacks > 0) {
      activeMs += span;
    }
    lastChange = event.timestamp;

    if (event.rawType === 'applybuff') {
      stacks += 1;
      lastActive = true;
    } else if (event.rawType === 'removebuff') {
      stacks = Math.max(0, stacks - 1);
      lastActive = stacks > 0;
    } else if (event.rawType === 'refreshbuff') {
      refreshCount += 1;
      if (stacks === 0) {
        stacks = 1;
        lastActive = true;
      }
    }
  }

  const tailSpan = fightEnd - lastChange;
  if (tailSpan > 0 && lastActive && stacks > 0) {
    activeMs += tailSpan;
  }

  return { activeMs, refreshCount };
}

/**
 * Sum the total time during which a player keeps a debuff/DoT active on at
 * least one target. Multiple simultaneous applications count once.
 */
export function debuffActiveMs(
  events: CombatEvent[],
  sourceId: number,
  abilityId: number,
  abilityName: string,
  fightStart: number,
  fightEnd: number,
): { activeMs: number } {
  const debuffEvents = events.filter(
    (event) =>
      event.sourceId === sourceId &&
      (event.rawType === 'applydebuff' ||
        event.rawType === 'refreshdebuff' ||
        event.rawType === 'removedebuff') &&
      (event.abilityId === abilityId || event.abilityName === abilityName),
  );

  const sorted = [...debuffEvents].sort((a, b) => a.timestamp - b.timestamp);
  let active = 0;
  let lastChange = fightStart;
  let activeMs = 0;

  for (const event of sorted) {
    const span = event.timestamp - lastChange;
    if (span > 0 && active > 0) {
      activeMs += span;
    }
    lastChange = event.timestamp;

    if (event.rawType === 'applydebuff') {
      active += 1;
    } else if (event.rawType === 'removedebuff') {
      active = Math.max(0, active - 1);
    } else if (event.rawType === 'refreshdebuff' && active === 0) {
      active = 1;
    }
  }

  const tailSpan = fightEnd - lastChange;
  if (tailSpan > 0 && active > 0) {
    activeMs += tailSpan;
  }

  return { activeMs };
}

/**
 * Factory for a big-cooldown delay rule. Casts should land near
 * fightStart + n*cooldown; sustained multi-second delays push the burst or
 * defensive window back.
 *
 * Evidence carries the expected-vs-actual timepoint pair: each cast's
 * `timestamp` (actual) vs `expectedAt` (its ideal slot). `confidence` should
 * come from Spec Knowledge (`CooldownKnowledge` / ability entry).
 *
 * `defensive: true` marks a *reactive* tank/healer cooldown: its usage is
 * fight-driven (danger patterns), so a slot model can only ever be a
 * reference. Findings are capped at `low` severity and worded as a hint —
 * the same honest-ambiguity stance the Blood DK knowledge documents.
 */
export function makeCooldownDelayRule(options: {
  id: string;
  name: string;
  description: string;
  abilityId: number;
  abilityName: string;
  /**
   * Player-facing name, normally the Spec Knowledge `name` (official zh-CN,
   * e.g. `奥术涌动 (Arcane Surge)`). `abilityName` stays the English game name
   * used for event matching; without this the finding would read
   * "Arcane Surge 使用存在延迟" to a Chinese player.
   */
  abilityDisplayName?: string | undefined;
  cooldownMs: number;
  /** Confidence of the knowledge that declared this cooldown (0..1). */
  confidence?: number | undefined;
  minDurationMs?: number;
  delayThresholdMs?: number;
  /** Reactive defensive cooldown — findings become low-severity references. */
  defensive?: boolean;
}): SpecRule {
  const minDurationMs = options.minDurationMs ?? 60_000;
  const delayThresholdMs = options.delayThresholdMs ?? 5_000;
  const shown = options.abilityDisplayName ?? options.abilityName;

  return {
    id: options.id,
    name: options.name,
    description: options.description,
    evaluate(context): Finding[] {
      const { player, fight, events } = context;
      const durationMs = Math.max(0, fight.endTime - fight.startTime);
      if (durationMs < minDurationMs) return [];
      const fightId = fight.id;

      const casts = abilityCasts(
        events,
        player.id,
        options.abilityId,
        options.abilityName,
      );
      if (casts.length < 2) {
        // A long-CD ability used less than twice over a long fight is itself a
        // problem even though there are no delays to measure.
        const expectedCasts = Math.floor(durationMs / options.cooldownMs);
        if (expectedCasts >= 3) {
          return [
            {
              id: options.id,
              category: 'cooldown',
              severity: options.defensive ? 'low' : 'high',
              title: options.defensive
                ? `${shown} 使用次数偏少（参考）`
                : `${shown} 基本未使用`,
              description: `战斗时长 ${Math.round(durationMs / 1000)}s，${shown} 理论可用 ${expectedCasts} 次，实际仅使用 ${casts.length} 次。${
                options.defensive
                  ? '（防御技能按需使用，战斗可能不需要更多；本条仅供参考。）'
                  : ''
              }`,
              evidence: [
                { fightId, value: casts.length, unit: '次' },
                { fightId, value: expectedCasts, unit: '次' },
              ],
              ...(options.confidence !== undefined
                ? { confidence: options.confidence }
                : {}),
              expected: { ability: shown, expectedCasts },
              actual: { casts: casts.length },
              recommendation: options.defensive
                ? `${shown} 是防御技能，按承压节奏使用；若整场承压较高而仍未使用，可回顾是否漏开。`
                : `在合适时机使用 ${shown}，让关键爆发 / 防御技能发挥价值。`,
            },
          ];
        }
        return [];
      }

      const delays: Array<{
        timestamp: number;
        idealTime: number;
        delayMs: number;
      }> = [];
      for (const cast of casts) {
        const elapsed = cast.timestamp - fight.startTime;
        const slot = Math.round(elapsed / options.cooldownMs);
        const idealTime = fight.startTime + slot * options.cooldownMs;
        const delay = Math.max(0, cast.timestamp - idealTime);
        delays.push({ timestamp: cast.timestamp, idealTime, delayMs: delay });
      }

      const avgDelay =
        delays.reduce((sum, d) => sum + d.delayMs, 0) / delays.length;
      const maxDelay = Math.max(...delays.map((d) => d.delayMs));

      if (avgDelay < delayThresholdMs) return [];

      return [
        {
          id: options.id,
          category: 'cooldown',
          severity: options.defensive
            ? 'low'
            : avgDelay > 15_000
              ? 'high'
              : 'medium',
          title: options.defensive
            ? `${shown} 使用节奏偏晚（参考）`
            : `${shown} 使用存在延迟`,
          description: `${shown} 平均延迟 ${Math.round(avgDelay / 1000)}s，最大延迟 ${Math.round(maxDelay / 1000)}s（共使用 ${casts.length} 次）。${
            options.defensive
              ? '（防御技能按危险窗口使用，晚于理论槽位不一定是错误；本条仅供参考。）'
              : ''
          }`,
          ...(options.confidence !== undefined
            ? { confidence: options.confidence }
            : {}),
          expected: { ability: shown, cooldownMs: options.cooldownMs },
          actual: { casts: casts.length, avgDelayMs: avgDelay, maxDelayMs: maxDelay },
          evidence: delays.map((d) => ({
            timestamp: d.timestamp,
            expectedAt: d.idealTime,
            fightId,
            ability: shown,
            abilityId: options.abilityId,
            value: d.delayMs,
            unit: 'ms',
            note: 'actual cast vs ideal cooldown slot',
          })),
          recommendation: options.defensive
            ? `${shown} 是防御技能，按承压节奏使用；本条仅供节奏参考，不作为定责依据。`
            : `冷却就绪后尽快使用 ${shown}，使爆发 / 防御窗口与战斗节奏对齐。`,
        },
      ];
    },
  };
}

/**
 * Factory for the GCD idle rule, shared by every spec analyzer.
 */
export function makeGcdIdleRule(id: string, name = 'GCD idle time'): SpecRule {
  const IDLE_THRESHOLD_PERCENT = 0.15;

  return {
    id,
    name,
    description:
      'Excessive time without casting wastes GCDs and reduces output.',
    evaluate(context): Finding[] {
      const { player, fight, report, events } = context;
      const durationMs = Math.max(0, fight.endTime - fight.startTime);
      if (durationMs < 30_000) return [];
      // Mythic+ runs span the whole dungeon: movement between pulls and
      // out-of-combat gaps look like "idle" but are not rotation downtime.
      // The cast-gap model only holds for continuous single-boss fights.
      if (isMythicPlusRun(report, fight)) return [];

      const casts = castsBySource(events, player.id);
      const idleWindows = findIdleWindows(
        casts,
        fight.startTime,
        fight.endTime,
        2_000,
      );
      const idleMs = totalIdleMs(idleWindows);
      const idlePercent = durationMs > 0 ? idleMs / durationMs : 0;

      if (idlePercent < IDLE_THRESHOLD_PERCENT) return [];

      return [
        {
          id,
          category: 'rotation',
          severity: idlePercent > 0.3 ? 'high' : 'medium',
          title: 'GCD 空转过多',
          description: `战斗时长 ${Math.round(durationMs / 1000)}s，空转 ${Math.round(idleMs / 1000)}s（${(idlePercent * 100).toFixed(1)}%）。`,
          durationMs: idleMs,
          expected: { idleRatioTarget: 0.15 },
          actual: { idlePercent: Math.round(idlePercent * 1000) / 1000, idleMs },
          evidence: idleWindows.map((window) => ({
            timestamp: window.start,
            fightId: fight.id,
            value: window.durationMs,
            unit: 'ms',
          })),
          recommendation: '使用填充技能填补 GCD，减少空转窗口。',
        },
      ];
    },
  };
}
