import type { DamageTakenSample, DeathFacts, DeathIncidentFact } from '@wcl/domain';
import type { DeathFactsOptions, FactsInput } from './types.js';
import { eventsOfType } from './timeline.js';

export const DEFAULT_PRE_DEATH_WINDOW_MS = 5000;

/**
 * Death facts: every death of the tracked target plus the damage it took
 * during a window before each death — the objective basis for attribution
 * (burst kill vs sustained healing deficit vs environment).
 */
export function computeDeathFacts(
  input: FactsInput,
  options?: DeathFactsOptions,
): DeathFacts {
  const targetId = options?.targetId ?? input.player.id;
  const windowMs = options?.preDeathWindowMs ?? DEFAULT_PRE_DEATH_WINDOW_MS;

  const deaths = eventsOfType(input.events, 'death')
    .filter((event) => event.targetId === targetId)
    .sort((a, b) => a.timestamp - b.timestamp);

  const takenByTarget = eventsOfType(input.events, 'damage')
    .filter((event) => event.targetId === targetId)
    .sort((a, b) => a.timestamp - b.timestamp);

  const incidents: DeathIncidentFact[] = deaths.map((death) => {
    const windowStart = death.timestamp - windowMs;
    const takenEvents: DamageTakenSample[] = takenByTarget
      .filter(
        (event) =>
          event.timestamp >= windowStart && event.timestamp <= death.timestamp,
      )
      .map((event) => ({
        timestamp: event.timestamp,
        abilityName: event.abilityName,
        abilityId: event.abilityId,
        sourceName: event.sourceName,
        amount: event.amount ?? 0,
      }));

    const takenTotal = takenEvents.reduce(
      (sum, event) => sum + event.amount,
      0,
    );

    return {
      type: 'death.incident',
      timestamp: death.timestamp,
      takenTotal,
      takenEvents,
    };
  });

  return { type: 'death', deaths: incidents };
}
