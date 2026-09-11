export { AppService } from './app-service.js';
export type {
  GetPlayerEventsOptions,
  PlayerSummary,
  AnalyzePlayerOptions,
  FightPlayerOptions,
  RawEventExportOptions,
  FightReviewOptions,
  FightDeathReview,
} from './app-service.js';
export {
  classForSpec,
  classForPlayer,
  rankingsClassName,
  REFERENCE_POOL_SIZE,
  MAX_RAW_EVENT_LIMIT,
} from './app-service.js';
// Deterministic merge guard for analyzer metrics; lives in the analysis
// engine since Phase R and is re-exported here for existing importers.
export { mergeMetrics } from '@wcl/analysis-engine';
export { buildWclClient } from './client-builder.js';
export { DatabaseService } from './database-service.js';
export {
  buildCombatFactsView,
  buildRotationDigest,
  buildDeathReviewView,
  FACTS_VIEW_OPTIONS,
} from './analysis-views.js';
// Head-to-head comparison against a ranked run (Phase AF).
export {
  buildReferenceComparison,
  unavailableComparison,
  MAX_COMPARE_ABILITIES,
} from './reference-compare.js';
export type {
  ReferenceComparison,
  ComparisonRow,
  ComparisonSide,
  ComparisonTarget,
  AbilityComparison,
  RotationComparison,
  VerdictSide,
} from './reference-compare.js';
export type {
  CombatFactsView,
  RotationDigest,
  DeathReviewView,
  ReviewDeathView,
  ReviewWipeView,
  ReviewAddView,
  CastAbilityView,
  GcdView,
  CooldownUsageView,
  BuffUptimeView,
  ResourceSeriesView,
} from './analysis-views.js';
