import { computeGcdFacts } from '@wcl/combat-facts';
import type { Analyzer, AnalysisResult } from '../types.js';
import { toFactsInput } from '../core/facts-input.js';

export interface TimeWindow {
  start: number;
  end: number;
  durationMs: number;
}

export interface GcdAnalysis {
  totalGcd: number;
  /** Total idle time (ms) where the player was not casting. */
  idleMs: number;
  /** Idle time as a fraction of the fight duration. */
  idlePercent: number;
  idleWindows: TimeWindow[];
}

/**
 * GCD / downtime analyzer, projecting `gcd` Combat Facts into metrics.
 *
 * Idle time is a fact here, not yet a problem: forced downtime (boss
 * invulnerability, mechanics, movement) is evaluated by the spec rules.
 */
export class GcdAnalyzer implements Analyzer {
  constructor(
    private readonly options?: {
      sourceId?: number | undefined;
      gcdMs?: number | undefined;
      idleThresholdMs?: number | undefined;
    },
  ) {}

  analyze(context: Parameters<Analyzer['analyze']>[0]): AnalysisResult {
    const facts = computeGcdFacts(toFactsInput(context), {
      sourceId: this.options?.sourceId,
      gcdMs: this.options?.gcdMs,
      idleThresholdMs: this.options?.idleThresholdMs,
    });

    return {
      findings: [],
      metrics: {
        gcd: {
          totalGcd: facts.totalGcd,
          idleMs: facts.idleMs,
          idlePercent: facts.idlePercent,
          idleWindows: facts.idleWindows,
        } satisfies GcdAnalysis,
      },
    };
  }
}
