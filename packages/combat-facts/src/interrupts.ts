import type { InterruptByTargetFact, InterruptFacts } from '@wcl/domain';
import type { FactsInput, SourceFactsOptions } from './types.js';
import { eventsOfType } from './timeline.js';

/**
 * Interrupt facts: how many interrupts the tracked source landed and on
 * whom. WCL does not always expose whether an interrupt landed on a cast,
 * so these are raw counts and a target distribution.
 */
export function computeInterruptFacts(
  input: FactsInput,
  options?: SourceFactsOptions,
): InterruptFacts {
  const sourceId = options?.sourceId ?? input.player.id;

  const interruptEvents = eventsOfType(input.events, 'interrupt').filter(
    (event) => event.sourceId === sourceId,
  );

  const byTarget = new Map<number, InterruptByTargetFact>();
  for (const event of interruptEvents) {
    if (event.targetId === undefined) continue;
    const fact = byTarget.get(event.targetId) ?? {
      type: 'interrupt.target',
      targetId: event.targetId,
      targetName: event.targetName,
      count: 0,
    };
    fact.count += 1;
    byTarget.set(event.targetId, fact);
  }

  return {
    type: 'interrupt',
    count: interruptEvents.length,
    distinctTargets: byTarget.size,
    byTarget: Array.from(byTarget.values()).sort((a, b) => b.count - a.count),
  };
}
