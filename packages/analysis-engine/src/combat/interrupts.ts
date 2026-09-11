import { computeInterruptFacts } from '@wcl/combat-facts';
import type { Analyzer, AnalysisResult } from '../types.js';
import { toFactsInput } from '../core/facts-input.js';

export interface InterruptStats {
  /** Total interrupt events where this source was the interrupter. */
  count: number;
  /** Distinct targets interrupted. */
  distinctTargets: number;
  /** Interrupts attributed to each target. */
  byTarget: Array<{
    targetId?: number | undefined;
    targetName?: string | undefined;
    count: number;
  }>;
}

/**
 * Interrupt analyzer. It no longer scans events itself: it consumes the
 * `interrupt` Combat Facts and projects them into the legacy metric shape.
 */
export class InterruptAnalyzer implements Analyzer {
  constructor(private readonly options?: { sourceId?: number | undefined }) {}

  analyze(context: Parameters<Analyzer['analyze']>[0]): AnalysisResult {
    const facts = computeInterruptFacts(toFactsInput(context), {
      sourceId: this.options?.sourceId,
    });

    return {
      findings: [],
      metrics: {
        interrupt: {
          count: facts.count,
          distinctTargets: facts.distinctTargets,
          byTarget: facts.byTarget.map((fact) => ({
            targetId: fact.targetId,
            targetName: fact.targetName,
            count: fact.count,
          })),
        } satisfies InterruptStats,
      },
    };
  }
}
