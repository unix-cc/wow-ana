/**
 * Provenance and versioning for Spec Knowledge.
 *
 * Spec Knowledge is not code: it is a claim about how a specialization is
 * supposed to be played. Every claim therefore carries where it came from and
 * how much we trust it. Low-confidence knowledge must never escalate to a
 * `mistake` verdict (see `MIN_MISTAKE_CONFIDENCE`).
 */

export type KnowledgeSourceType = 'official' | 'simc' | 'community' | 'manual';

export interface KnowledgeSource {
  type: KnowledgeSourceType;
  /** Pointer to the concrete source (patch note URL, simc profile, ...). */
  reference: string;
}

/**
 * Reference to the knowledge actually used for an analysis. Persisted with
 * the result so a historical fight can be re-read under the same rules.
 */
export interface SpecKnowledgeRef {
  /** WCL spec id when known (e.g. 253 = Beast Mastery). */
  specId?: number | undefined;
  specName: string;
  className?: string | undefined;
  /** Game patch the knowledge describes, e.g. "12.1". */
  patch?: string | undefined;
  /** Semver of the knowledge entry itself. */
  knowledgeVersion: string;
}

/** Confidence scale for knowledge entries. */
export const CONFIDENCE_SCALE = {
  /** Explicit, documented game mechanic. */
  explicit: 1.0,
  /** High-confidence theorycraft. */
  theorycraft: 0.9,
  /** Verified common strategy. */
  verified: 0.8,
  /** Conditional / situational strategy. */
  conditional: 0.6,
} as const;
