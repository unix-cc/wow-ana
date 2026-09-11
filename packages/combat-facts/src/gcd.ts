import type { GcdFacts, IdleWindow } from '@wcl/domain';
import type { FactsInput, GcdFactsOptions } from './types.js';
import { castsBySource, findIdleWindows, totalIdleMs } from './timeline.js';

const DEFAULT_GCD_MS = 1500;

/**
 * GCD / downtime facts: how many global cooldowns were spent and how much of
 * the fight passed without a cast.
 *
 * Note: high idle time is a fact, not yet a problem — forced downtime
 * (boss invulnerability, mechanics, movement) is evaluated later.
 */
export function computeGcdFacts(
  input: FactsInput,
  options?: GcdFactsOptions,
): GcdFacts {
  const sourceId = options?.sourceId ?? input.player.id;
  const gcdMs = options?.gcdMs ?? DEFAULT_GCD_MS;
  const idleThresholdMs = options?.idleThresholdMs ?? gcdMs;

  const casts = castsBySource(input.events, sourceId);
  const fightStart = input.fight.startTime;
  const fightEnd = input.fight.endTime;

  const totalGcd = countGcds(casts, gcdMs, fightStart, fightEnd);
  const idleWindows: IdleWindow[] = findIdleWindows(
    casts,
    fightStart,
    fightEnd,
    idleThresholdMs,
  ).map((window) => ({
    start: window.start,
    end: window.end,
    durationMs: window.durationMs,
  }));
  const idleMs = totalIdleMs(idleWindows);
  const durationMs = Math.max(0, fightEnd - fightStart);
  const idlePercent =
    durationMs > 0 ? Math.round((idleMs / durationMs) * 1000) / 1000 : 0;

  return {
    type: 'gcd',
    totalGcd,
    idleMs,
    idlePercent,
    idleWindows,
  };
}

/**
 * Count GCDs as the number of casts whose timestamp differs from the previous
 * cast by at least `gcdMs`. Consecutive casts closer than a GCD are merged.
 */
function countGcds(
  casts: ReturnType<typeof castsBySource>,
  gcdMs: number,
  fightStart: number,
  fightEnd: number,
): number {
  if (casts.length === 0) return 0;

  let gcds = 1;
  for (let i = 1; i < casts.length; i += 1) {
    const prev = casts[i - 1];
    const curr = casts[i];
    if (prev && curr && curr.timestamp - prev.timestamp >= gcdMs) {
      gcds += 1;
    }
  }

  const maxPossible = Math.max(1, Math.floor((fightEnd - fightStart) / gcdMs));
  return Math.min(gcds, maxPossible);
}
