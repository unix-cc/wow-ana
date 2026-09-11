import { computeResourceFacts } from '@wcl/combat-facts';
import type { Analyzer, AnalysisResult } from '../types.js';
import { toFactsInput } from '../core/facts-input.js';

export interface ResourceSeries {
  resourceType?: string | undefined;
  /** Number of resource events observed. */
  eventCount: number;
  /** Highest resource amount observed. */
  peak: number;
  /** Lowest resource amount observed. */
  min: number;
  /** Total resource gained (sum of positive amounts). */
  totalGained: number;
  /** Total resource spent (sum of negative amounts). */
  totalSpent: number;
}

export interface ResourceAnalysis {
  resources: ResourceSeries[];
}

/**
 * Resource analyzer, projecting `resource` Combat Facts into metrics.
 *
 * Overcap detection needs a resource cap which WCL does not universally
 * expose; the Analysis Engine supplies the cap from Spec Knowledge.
 */
export class ResourceAnalyzer implements Analyzer {
  constructor(private readonly options?: { sourceId?: number | undefined }) {}

  analyze(context: Parameters<Analyzer['analyze']>[0]): AnalysisResult {
    const facts = computeResourceFacts(toFactsInput(context), {
      sourceId: this.options?.sourceId,
    });

    const resources: ResourceSeries[] = facts.resources.map((fact) => ({
      resourceType: fact.resourceType,
      eventCount: fact.eventCount,
      peak: fact.peak,
      min: fact.min,
      totalGained: fact.totalGained,
      totalSpent: fact.totalSpent,
    }));

    return {
      findings: [],
      metrics: { resource: { resources } satisfies ResourceAnalysis },
    };
  }
}
