import { computeDispelFacts } from '@wcl/combat-facts';
import type { Analyzer, AnalysisResult } from '../types.js';
import { toFactsInput } from '../core/facts-input.js';

export interface DispelStats {
  /** Total dispel events where this source was the dispeller. */
  count: number;
  /** Dispel events by target. */
  byTarget: Array<{
    targetId?: number | undefined;
    targetName?: string | undefined;
    count: number;
  }>;
}

/**
 * Dispel analyzer. It no longer scans events itself: it consumes the
 * `dispel` Combat Facts and projects them into the legacy metric shape.
 */
export class DispelAnalyzer implements Analyzer {
  constructor(private readonly options?: { sourceId?: number | undefined }) {}

  analyze(context: Parameters<Analyzer['analyze']>[0]): AnalysisResult {
    const facts = computeDispelFacts(toFactsInput(context), {
      sourceId: this.options?.sourceId,
    });

    return {
      findings: [],
      metrics: {
        dispel: {
          count: facts.count,
          byTarget: facts.byTarget.map((fact) => ({
            targetId: fact.targetId,
            targetName: fact.targetName,
            count: fact.count,
          })),
        } satisfies DispelStats,
      },
    };
  }
}
