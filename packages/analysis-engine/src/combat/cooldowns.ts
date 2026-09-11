import { computeCooldownFacts } from '@wcl/combat-facts';
import type { Analyzer, AnalysisResult } from '../types.js';
import { toFactsInput } from '../core/facts-input.js';

export interface CooldownUsage {
  abilityId?: number | undefined;
  abilityName?: string | undefined;
  /** Cooldown length in milliseconds. */
  cooldownMs: number;
  actualCasts: number;
  /** Theoretical number of casts allowed by the fight duration. */
  expectedCasts: number;
  /** Average delay (ms) of each cast relative to its ideal cadence. */
  averageDelayMs?: number | undefined;
  /** Maximum observed delay (ms) relative to the ideal cadence. */
  maxDelayMs?: number | undefined;
  /** True when the cooldown could have been used once more before fight end. */
  missedFinalCast?: boolean | undefined;
}

export interface CooldownAnalysis {
  usages: CooldownUsage[];
}

/**
 * Cooldown analyzer. Cooldown lengths come from Spec Knowledge (passed in by
 * the caller); the cadence math is done by the `cooldown` Combat Facts.
 */
export class CooldownAnalyzer implements Analyzer {
  constructor(
    private readonly cooldowns: Array<{
      abilityId?: number | undefined;
      abilityName?: string | undefined;
      cooldownMs: number;
    }>,
    private readonly options?: { sourceId?: number | undefined },
  ) {}

  analyze(context: Parameters<Analyzer['analyze']>[0]): AnalysisResult {
    const facts = computeCooldownFacts(toFactsInput(context), {
      sourceId: this.options?.sourceId,
      cooldowns: this.cooldowns,
    });

    const usages: CooldownUsage[] = facts.usages.map((fact) => ({
      abilityId: fact.abilityId,
      abilityName: fact.abilityName,
      cooldownMs: fact.cooldownMs,
      actualCasts: fact.actualCasts,
      expectedCasts: fact.expectedCasts,
      averageDelayMs: fact.averageDelayMs,
      maxDelayMs: fact.maxDelayMs,
      missedFinalCast: fact.missedFinalCast,
    }));

    return {
      findings: [],
      metrics: { cooldown: { usages } satisfies CooldownAnalysis },
    };
  }
}
