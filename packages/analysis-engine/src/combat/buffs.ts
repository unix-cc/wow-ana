import { computeBuffFacts } from '@wcl/combat-facts';
import type { Analyzer, AnalysisResult } from '../types.js';
import { toFactsInput } from '../core/facts-input.js';

export interface BuffUptime {
  abilityId?: number | undefined;
  abilityName?: string | undefined;
  /** Fraction of fight time the buff was active. */
  uptime: number;
  /** Total time the buff was absent (ms). */
  downtimeMs: number;
  maxStacks?: number | undefined;
  avgStacks?: number | undefined;
  refreshCount: number;
}

export interface BuffAnalysis {
  buffs: BuffUptime[];
}

/**
 * Buff / debuff uptime analyzer, projecting `buff` Combat Facts into metrics.
 *
 * `uptime` is measured against the fight window [startTime, endTime].
 */
export class BuffAnalyzer implements Analyzer {
  constructor(
    private readonly options?: {
      targetId?: number | undefined;
    },
  ) {}

  analyze(context: Parameters<Analyzer['analyze']>[0]): AnalysisResult {
    const facts = computeBuffFacts(toFactsInput(context), {
      targetId: this.options?.targetId,
    });

    const buffs: BuffUptime[] = facts.buffs.map((fact) => ({
      abilityId: fact.abilityId,
      abilityName: fact.abilityName,
      uptime: fact.uptime,
      downtimeMs: fact.downtimeMs,
      maxStacks: fact.maxStacks,
      avgStacks: fact.avgStacks,
      refreshCount: fact.refreshCount,
    }));

    return {
      findings: [],
      metrics: { buff: { buffs } satisfies BuffAnalysis },
    };
  }
}
