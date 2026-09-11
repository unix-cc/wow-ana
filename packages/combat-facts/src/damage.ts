import type { CombatEvent, DamageAbilityFact, DamageFacts } from '@wcl/domain';
import type { FactsInput, SourceFactsOptions } from './types.js';
import { eventsOfType } from './timeline.js';

/**
 * Damage facts: total damage dealt by a source and its per-ability
 * breakdown (count / total / crit split).
 *
 * Objective only — whether a damage profile is "good" is decided later by
 * the Analysis Engine against Spec Knowledge or ranking references.
 */
export function computeDamageFacts(
  input: FactsInput,
  options?: SourceFactsOptions,
): DamageFacts {
  const sourceId = options?.sourceId ?? input.player.id;
  const damageEvents = eventsOfType(input.events, 'damage').filter(
    (event) => event.sourceId === sourceId,
  );

  const byAbility = groupDamageByAbility(damageEvents);
  const abilities = Object.values(byAbility).sort((a, b) => b.total - a.total);
  const totalDamage = abilities.reduce((sum, group) => sum + group.total, 0);

  let firstTimestamp: number | undefined;
  let lastTimestamp: number | undefined;
  for (const event of damageEvents) {
    if (firstTimestamp === undefined || event.timestamp < firstTimestamp) {
      firstTimestamp = event.timestamp;
    }
    if (lastTimestamp === undefined || event.timestamp > lastTimestamp) {
      lastTimestamp = event.timestamp;
    }
  }

  return {
    type: 'damage',
    totalDamage,
    firstTimestamp,
    lastTimestamp,
    abilities,
  };
}

function groupDamageByAbility(
  events: CombatEvent[],
): Record<string, DamageAbilityFact> {
  const groups: Record<string, DamageAbilityFact> = {};

  for (const event of events) {
    const key =
      event.abilityId !== undefined
        ? `id:${event.abilityId}`
        : `name:${event.abilityName ?? 'unknown'}`;
    const group = groups[key] ?? {
      type: 'damage.ability',
      abilityId: event.abilityId,
      abilityName: event.abilityName,
      count: 0,
      total: 0,
      critCount: 0,
      hitCount: 0,
    };
    group.count += 1;
    group.total += event.amount ?? 0;
    if (event.hitType === 'crit') {
      group.critCount += 1;
    } else {
      group.hitCount += 1;
    }
    groups[key] = group;
  }

  return groups;
}
