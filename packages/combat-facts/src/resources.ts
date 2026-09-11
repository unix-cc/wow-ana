import type { ResourceFacts, ResourceSeriesFact } from '@wcl/domain';
import type { FactsInput, SourceFactsOptions } from './types.js';

interface Accumulator {
  resourceType: string;
  eventCount: number;
  peak: number;
  min: number;
  peakTimestamp: number | undefined;
  minTimestamp: number | undefined;
  totalGained: number;
  totalSpent: number;
}

/**
 * Resource facts: per-resource-type gain / spend / peak series.
 *
 * Overflow detection needs a resource cap that WCL does not universally
 * expose, so this layer reports peaks and totals and leaves overcap
 * estimation to the Analysis Engine (using Spec Knowledge caps).
 *
 * Per-event evidence is intentionally not attached: resource events are one
 * or two orders of magnitude more numerous than casts. Traceability is kept
 * through `peakTimestamp` / `minTimestamp` instead.
 */
export function computeResourceFacts(
  input: FactsInput,
  options?: SourceFactsOptions,
): ResourceFacts {
  const sourceId = options?.sourceId ?? input.player.id;

  const resourceEvents = input.events
    .filter((event) => event.type === 'resource')
    .filter((event) => event.sourceId === sourceId);

  const byType = new Map<string, Accumulator>();

  for (const event of resourceEvents) {
    const resourceType = event.resourceType ?? 'unknown';
    const series =
      byType.get(resourceType) ??
      ({
        resourceType,
        eventCount: 0,
        peak: Number.NEGATIVE_INFINITY,
        min: Number.POSITIVE_INFINITY,
        peakTimestamp: undefined,
        minTimestamp: undefined,
        totalGained: 0,
        totalSpent: 0,
      } satisfies Accumulator);

    series.eventCount += 1;

    const current = event.resourceAmount;
    if (current !== undefined) {
      if (current > series.peak) {
        series.peak = current;
        series.peakTimestamp = event.timestamp;
      }
      if (current < series.min) {
        series.min = current;
        series.minTimestamp = event.timestamp;
      }
    }

    const delta = event.amount;
    if (delta !== undefined && delta > 0) {
      series.totalGained += delta;
    } else if (delta !== undefined && delta < 0) {
      series.totalSpent += -delta;
    }

    byType.set(resourceType, series);
  }

  const resources: ResourceSeriesFact[] = Array.from(byType.values()).map(
    (series) => ({
      type: 'resource.series',
      resourceType: series.resourceType,
      eventCount: series.eventCount,
      peak: Number.isFinite(series.peak) ? series.peak : 0,
      min: Number.isFinite(series.min) ? series.min : 0,
      peakTimestamp: series.peakTimestamp,
      minTimestamp: series.minTimestamp,
      totalGained: series.totalGained,
      totalSpent: series.totalSpent,
    }),
  );

  return { type: 'resource', resources };
}
