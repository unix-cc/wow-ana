import { computeDeathFacts, DEFAULT_PRE_DEATH_WINDOW_MS } from '@wcl/combat-facts';
import type { Analyzer, AnalysisResult } from '../types.js';
import { toFactsInput } from '../core/facts-input.js';

export interface DeathEventDetail {
  timestamp: number;
  /** Damage taken from this source during the pre-death window. */
  takenTotal: number;
  takenEvents: Array<{
    timestamp: number;
    abilityName?: string | undefined;
    abilityId?: number | undefined;
    sourceName?: string | undefined;
    amount: number;
  }>;
}

export interface DeathAnalysis {
  deaths: DeathEventDetail[];
}

/**
 * Death analyzer. It no longer scans events itself: it consumes the `death`
 * Combat Facts (each incident already carries its pre-death damage window)
 * and projects them into the legacy metric shape.
 */
export class DeathAnalyzer implements Analyzer {
  constructor(
    private readonly options?: {
      targetId?: number | undefined;
      preDeathWindowMs?: number | undefined;
    },
  ) {}

  analyze(context: Parameters<Analyzer['analyze']>[0]): AnalysisResult {
    const facts = computeDeathFacts(toFactsInput(context), {
      targetId: this.options?.targetId,
      preDeathWindowMs:
        this.options?.preDeathWindowMs ?? DEFAULT_PRE_DEATH_WINDOW_MS,
    });

    const deaths: DeathEventDetail[] = facts.deaths.map((incident) => ({
      timestamp: incident.timestamp,
      takenTotal: incident.takenTotal,
      takenEvents: incident.takenEvents.map((taken) => ({
        timestamp: taken.timestamp,
        abilityName: taken.abilityName,
        abilityId: taken.abilityId,
        sourceName: taken.sourceName,
        amount: taken.amount,
      })),
    }));

    return {
      findings: [],
      metrics: { death: { deaths } satisfies DeathAnalysis },
    };
  }
}
