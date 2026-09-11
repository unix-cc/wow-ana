import { computeTargetFacts } from '@wcl/combat-facts';
import type { Analyzer, AnalysisResult } from '../types.js';
import { toFactsInput } from '../core/facts-input.js';

export interface TargetHitStats {
  targetId?: number | undefined;
  targetName?: string | undefined;
  /** Number of damage events against this target. */
  hits: number;
  /** Total damage dealt to this target. */
  total: number;
}

export interface TargetAnalysis {
  /** Distinct targets that received damage. */
  targetCount: number;
  /** Number of target switches (changes of target in the damage timeline). */
  switches: number;
  /** Targets sorted by total damage descending. */
  targets: TargetHitStats[];
}

/**
 * Target analyzer. It no longer scans events itself: it consumes the
 * `target` Combat Facts and projects them into the legacy metric shape.
 */
export class TargetAnalyzer implements Analyzer {
  constructor(private readonly options?: { sourceId?: number | undefined }) {}

  analyze(context: Parameters<Analyzer['analyze']>[0]): AnalysisResult {
    const facts = computeTargetFacts(toFactsInput(context), {
      sourceId: this.options?.sourceId,
    });

    const targets: TargetHitStats[] = facts.targets.map((fact) => ({
      targetId: fact.targetId,
      targetName: fact.targetName,
      hits: fact.hits,
      total: fact.total,
    }));

    return {
      findings: [],
      metrics: {
        target: {
          targetCount: facts.targetCount,
          switches: facts.switches,
          targets,
        } satisfies TargetAnalysis,
      },
    };
  }
}
