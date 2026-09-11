import type { AnalysisContext } from '@wcl/domain';
import type { FactsInput } from '@wcl/combat-facts';

/**
 * Bridge from the legacy `AnalysisContext` (raw events + metadata) to the
 * Combat Facts input. Analyzers must consume **facts**, not events — this is
 * the only place the conversion happens.
 */
export function toFactsInput(context: AnalysisContext): FactsInput {
  return {
    fight: context.fight,
    player: context.player,
    events: context.events,
  };
}

export type { FactsInput };
