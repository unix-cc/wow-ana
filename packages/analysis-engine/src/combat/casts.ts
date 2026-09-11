import { computeCastFacts } from '@wcl/combat-facts';
import type { Analyzer, AnalysisResult } from '../types.js';
import { toFactsInput } from '../core/facts-input.js';

export interface AbilityCastStats {
  abilityId?: number | undefined;
  abilityName?: string | undefined;
  count: number;
  firstTimestamp?: number | undefined;
  lastTimestamp?: number | undefined;
  minIntervalMs?: number | undefined;
  maxIntervalMs?: number | undefined;
  avgIntervalMs?: number | undefined;
}

export interface CastAnalysis {
  totalCasts: number;
  abilities: AbilityCastStats[];
}

/**
 * Cast analyzer. It no longer scans events itself: it consumes the `cast`
 * Combat Facts and projects them into the legacy metric shape.
 */
export class CastAnalyzer implements Analyzer {
  constructor(private readonly options?: { sourceId?: number | undefined }) {}

  analyze(context: Parameters<Analyzer['analyze']>[0]): AnalysisResult {
    const facts = computeCastFacts(toFactsInput(context), {
      sourceId: this.options?.sourceId,
    });

    const abilities: AbilityCastStats[] = facts.abilities.map((fact) => ({
      abilityId: fact.abilityId,
      abilityName: fact.abilityName,
      count: fact.count,
      firstTimestamp: fact.firstTimestamp,
      lastTimestamp: fact.lastTimestamp,
      minIntervalMs: fact.minIntervalMs,
      maxIntervalMs: fact.maxIntervalMs,
      avgIntervalMs: fact.avgIntervalMs,
    }));

    return {
      findings: [],
      metrics: {
        cast: {
          totalCasts: facts.totalCasts,
          abilities,
        } satisfies CastAnalysis,
      },
    };
  }
}
