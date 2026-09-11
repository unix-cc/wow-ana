import type { Report } from './report.js';
import type { Fight } from './report.js';
import type { Player } from './player.js';
import type { CombatEvent } from './event.js';

export type FindingCategory =
  | 'rotation'
  | 'cooldown'
  | 'buff'
  | 'resource'
  | 'target'
  | 'damage'
  | 'mechanic'
  | 'death'
  | 'uptime'
  | 'movement';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * The outcome of evaluating an actual decision against Spec Knowledge.
 *
 * A priority mismatch alone is **not** a mistake: the engine must first rule
 * out target death, forced downtime, mechanics, resource state, cooldown
 * state and movement before escalating.
 */
export type Verdict =
  | 'correct'
  | 'acceptable'
  | 'suboptimal'
  | 'mistake'
  | 'unknown';

/**
 * Lowest confidence at which knowledge may produce a `mistake` verdict.
 * Weaker knowledge may only yield `suboptimal` / `unknown` / suggestions.
 */
export const MIN_MISTAKE_CONFIDENCE = 0.6;

/** Whether knowledge of this confidence is strong enough to call a mistake. */
export function canEscalateToMistake(confidence: number): boolean {
  return Number.isFinite(confidence) && confidence >= MIN_MISTAKE_CONFIDENCE;
}

export interface Evidence {
  /** Actual event timestamp (what happened). */
  timestamp?: number | undefined;
  /**
   * Ideal timestamp the event *should* have happened at, when the evidence is
   * an expected-vs-actual comparison (e.g. a cooldown cast vs its ideal slot).
   * Lets consumers draw the actual/expected timepoint pair without re-deriving
   * the expectation from the finding text.
   */
  expectedAt?: number | undefined;
  ability?: string | undefined;
  abilityId?: number | undefined;
  value?: number | undefined;
  unit?: string | undefined;
  /**
   * Fight the evidence belongs to. Required for a Finding to be traceable
   * when results are persisted or compared across fights.
   */
  fightId?: number | undefined;
  /** WCL event identity when the source log exposes one. */
  eventId?: string | undefined;
  /** Human-readable explanation of what this evidence proves. */
  note?: string | undefined;
}

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  timestamp?: number | undefined;
  durationMs?: number | undefined;
  evidence: Evidence[];
  impact?: {
    estimated?: boolean | undefined;
    value?: number | undefined;
    unit?: string | undefined;
  };
  recommendation?: string | undefined;
  /**
   * How much the engine trusts this finding (0..1). Derived from the
   * confidence of the underlying Spec Knowledge and the completeness of the
   * observed data. Findings backed by weak knowledge must not use the
   * `mistake` verdict — see `canEscalateToMistake`.
   */
  confidence?: number | undefined;
  /** Evaluation result. `undefined` keeps legacy threshold rules valid. */
  verdict?: Verdict | undefined;
  /** What Spec Knowledge expected, when the finding is a comparison. */
  expected?: unknown;
  /** What the player actually did, when the finding is a comparison. */
  actual?: unknown;
}

export interface AnalysisContext {
  report: Report;
  fight: Fight;
  player: Player;
  events: CombatEvent[];
}

/**
 * Provenance of an analysis run. Both versions must be persisted with the
 * result so a historical report can always be reproduced and compared.
 */
export interface AnalysisVersion {
  /** Semver of the analysis engine / rule set that produced the result. */
  analyzerVersion: string;
  /** Semver of the Spec Knowledge used, when any was loaded. */
  knowledgeVersion?: string | undefined;
}
