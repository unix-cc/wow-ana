import type { DispelByTargetFact, DispelFacts } from '@wcl/domain';
import type { FactsInput, SourceFactsOptions } from './types.js';
import { eventsOfType } from './timeline.js';

/**
 * Dispel facts: how many dispels the tracked source initiated and against
 * whom. Events without a targetId count toward `count` but not `byTarget`.
 */
export function computeDispelFacts(
  input: FactsInput,
  options?: SourceFactsOptions,
): DispelFacts {
  const sourceId = options?.sourceId ?? input.player.id;

  const dispelEvents = eventsOfType(input.events, 'dispel').filter(
    (event) => event.sourceId === sourceId,
  );

  const byTarget = new Map<number, DispelByTargetFact>();
  for (const event of dispelEvents) {
    if (event.targetId === undefined) continue;
    const fact = byTarget.get(event.targetId) ?? {
      type: 'dispel.target',
      targetId: event.targetId,
      targetName: event.targetName,
      count: 0,
    };
    fact.count += 1;
    byTarget.set(event.targetId, fact);
  }

  return {
    type: 'dispel',
    count: dispelEvents.length,
    byTarget: Array.from(byTarget.values()).sort((a, b) => b.count - a.count),
  };
}
