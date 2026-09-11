import { computeDamageFacts } from '@wcl/combat-facts';
import type { Analyzer, AnalysisResult } from '../types.js';
import { toFactsInput } from '../core/facts-input.js';

export interface DamageByAbility {
  abilityId?: number | undefined;
  abilityName?: string | undefined;
  count: number;
  total: number;
  critCount: number;
  hitCount: number;
}

export interface DamageAnalysis {
  totalDamage: number;
  dps: number;
  activeTimeMs: number;
  byAbility: DamageByAbility[];
}

/**
 * Damage analyzer. It no longer scans events itself: it consumes the
 * `damage` Combat Facts and projects them into the legacy metric shape.
 *
 * DPS is computed against the fight duration; callers are responsible for
 * deciding which duration basis (fight vs active) to use.
 */
export class DamageAnalyzer implements Analyzer {
  constructor(
    private readonly options?: {
      sourceId?: number | undefined;
      fightDurationMs?: number | undefined;
    },
  ) {}

  analyze(context: Parameters<Analyzer['analyze']>[0]): AnalysisResult {
    const { fight } = context;
    const facts = computeDamageFacts(toFactsInput(context), {
      sourceId: this.options?.sourceId,
    });

    const durationMs =
      this.options?.fightDurationMs ??
      Math.max(0, fight.endTime - fight.startTime);

    const byAbility: DamageByAbility[] = facts.abilities.map((fact) => ({
      abilityId: fact.abilityId,
      abilityName: fact.abilityName,
      count: fact.count,
      total: fact.total,
      critCount: fact.critCount,
      hitCount: fact.hitCount,
    }));

    const dps =
      durationMs > 0 ? facts.totalDamage / (durationMs / 1000) : 0;

    return {
      findings: [],
      metrics: {
        damage: {
          totalDamage: facts.totalDamage,
          dps: Math.round(dps),
          activeTimeMs:
            facts.firstTimestamp !== undefined && facts.lastTimestamp !== undefined
              ? facts.lastTimestamp - facts.firstTimestamp
              : 0,
          byAbility,
        } satisfies DamageAnalysis,
      },
    };
  }
}
