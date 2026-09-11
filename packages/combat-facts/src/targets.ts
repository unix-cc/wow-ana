import type { TargetDamageFact, TargetFacts } from '@wcl/domain';
import type { FactsInput, SourceFactsOptions } from './types.js';
import { eventsOfType } from './timeline.js';

/**
 * Target facts: which targets a source damaged, how often it switched
 * targets in the damage timeline, and which target was primary.
 *
 * Events without a targetId do not count as a switch (consistent with the
 * legacy TargetAnalyzer semantics).
 */
export function computeTargetFacts(
  input: FactsInput,
  options?: SourceFactsOptions,
): TargetFacts {
  const sourceId = options?.sourceId ?? input.player.id;

  const damageEvents = eventsOfType(input.events, 'damage')
    .filter((event) => event.sourceId === sourceId)
    .sort((a, b) => a.timestamp - b.timestamp);

  const byTarget = new Map<number, TargetDamageFact>();
  let lastTargetId: number | undefined;
  let switches = 0;

  for (const event of damageEvents) {
    if (event.targetId === undefined) continue;

    if (lastTargetId !== undefined && lastTargetId !== event.targetId) {
      switches += 1;
    }
    lastTargetId = event.targetId;

    const fact = byTarget.get(event.targetId) ?? {
      type: 'target.damage',
      targetId: event.targetId,
      targetName: event.targetName,
      hits: 0,
      total: 0,
    };
    fact.hits += 1;
    fact.total += event.amount ?? 0;
    byTarget.set(event.targetId, fact);
  }

  const targets = Array.from(byTarget.values()).sort(
    (a, b) => b.total - a.total,
  );

  return {
    type: 'target',
    targetCount: targets.length,
    switches,
    targets,
  };
}
