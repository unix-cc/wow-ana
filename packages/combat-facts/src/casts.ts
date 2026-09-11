import type { AbilityCastFact, CastFacts, CombatEvent, Evidence } from '@wcl/domain';
import type { FactsInput, SourceFactsOptions } from './types.js';
import { castsBySource, intervalsBetween } from './timeline.js';

/**
 * Cast facts: how many times each ability was cast, and the timing between
 * consecutive casts of the same ability.
 *
 * Objective only — whether a cast count is "too low" is decided later by the
 * Analysis Engine using Spec Knowledge.
 */
export function computeCastFacts(
  input: FactsInput,
  options?: SourceFactsOptions,
): CastFacts {
  const sourceId = options?.sourceId ?? input.player.id;
  const casts = castsBySource(input.events, sourceId);
  const byAbility = groupCastsByAbility(casts);

  const abilities: AbilityCastFact[] = Object.values(byAbility).map((group) => {
    const intervals = intervalsBetween(group);
    const first = group[0];
    const last = group[group.length - 1];

    const evidence: Evidence[] = group.map((cast) => ({
      fightId: input.fight.id,
      timestamp: cast.timestamp,
      ability: cast.abilityName,
      abilityId: cast.abilityId,
    }));

    return {
      type: 'cast.ability',
      abilityId: first?.abilityId,
      abilityName: first?.abilityName,
      count: group.length,
      firstTimestamp: first?.timestamp,
      lastTimestamp: last?.timestamp,
      minIntervalMs: intervals.length ? Math.min(...intervals) : undefined,
      maxIntervalMs: intervals.length ? Math.max(...intervals) : undefined,
      avgIntervalMs: intervals.length
        ? Math.round(
            intervals.reduce((sum, interval) => sum + interval, 0) /
              intervals.length,
          )
        : undefined,
      evidence,
    };
  });

  return {
    type: 'cast',
    totalCasts: casts.length,
    abilities,
  };
}

function groupCastsByAbility(
  casts: CombatEvent[],
): Record<string, CombatEvent[]> {
  const groups: Record<string, CombatEvent[]> = {};
  for (const cast of casts) {
    const key =
      cast.abilityId !== undefined
        ? `id:${cast.abilityId}`
        : `name:${cast.abilityName ?? 'unknown'}`;
    const group = groups[key] ?? [];
    group.push(cast);
    groups[key] = group;
  }
  return groups;
}
