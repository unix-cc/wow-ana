import type {
  Evidence,
  Finding,
  FindingCategory,
  FindingSeverity,
  Verdict,
} from '@wcl/domain';

/**
 * Finding / Evidence construction helpers (Phase F).
 *
 * These are the single place where comparison-style findings are stamped with
 * `confidence / verdict / expected / actual` and where evidence gets its
 * traceability fields (`fightId`, and the expected-vs-actual timepoint pair
 * `timestamp` / `expectedAt`). Rules should build their findings through these
 * factories instead of hand-assembling literals, so the metadata stays
 * consistent across all analyzers.
 *
 * Severity-from-verdict mapping below is **engine policy**, not spec
 * knowledge — it decides how a verdict is surfaced, never what is correct.
 */

/** Severity used to surface a verdict tier. */
export function severityForVerdict(
  verdict: Verdict,
  confidence?: number | undefined,
): FindingSeverity {
  switch (verdict) {
    case 'mistake':
      // A confident, fully observable mistake is high; weaker mistakes medium.
      return confidence !== undefined && confidence >= 0.8 ? 'high' : 'medium';
    case 'suboptimal':
      return 'medium';
    case 'acceptable':
      return 'low';
    case 'correct':
      return 'info';
    case 'unknown':
      return 'info';
  }
}

export interface EvidencePointInput {
  /** Actual event timestamp (what happened). */
  timestamp?: number | undefined;
  /** Ideal timestamp the event should have happened at, if a comparison. */
  expectedAt?: number | undefined;
  ability?: string | undefined;
  abilityId?: number | undefined;
  value?: number | undefined;
  unit?: string | undefined;
  note?: string | undefined;
  /** Fight the evidence belongs to (traceability across persisted results). */
  fightId?: number | undefined;
}

/** Build an `Evidence` entry, dropping unspecified keys. */
export function evidencePoint(input: EvidencePointInput): Evidence {
  const evidence: Evidence = {};
  if (input.timestamp !== undefined) evidence.timestamp = input.timestamp;
  if (input.expectedAt !== undefined) evidence.expectedAt = input.expectedAt;
  if (input.ability !== undefined) evidence.ability = input.ability;
  if (input.abilityId !== undefined) evidence.abilityId = input.abilityId;
  if (input.value !== undefined) evidence.value = input.value;
  if (input.unit !== undefined) evidence.unit = input.unit;
  if (input.note !== undefined) evidence.note = input.note;
  if (input.fightId !== undefined) evidence.fightId = input.fightId;
  return evidence;
}

export interface ComparisonFindingInput {
  id: string;
  category: FindingCategory;
  title: string;
  description: string;
  /** Overrides the verdict-derived severity when both present. */
  severity?: FindingSeverity | undefined;
  /** Five-tier evaluation of the comparison, when decision-level. */
  verdict?: Verdict | undefined;
  /** Confidence of the knowledge that anchors this finding (0..1). */
  confidence?: number | undefined;
  /** What Spec Knowledge expected. */
  expected?: unknown;
  /** What the player actually did. */
  actual?: unknown;
  timestamp?: number | undefined;
  durationMs?: number | undefined;
  recommendation?: string | undefined;
  evidence: Evidence[];
}

/**
 * Assemble a Finding with consistent metadata. `severity` falls back to the
 * verdict-derived severity (see `severityForVerdict`) when only a verdict is
 * given; with neither, it defaults to `info`.
 */
export function comparisonFinding(input: ComparisonFindingInput): Finding {
  const severity: FindingSeverity =
    input.severity ??
    (input.verdict !== undefined
      ? severityForVerdict(input.verdict, input.confidence)
      : 'info');

  const finding: Finding = {
    id: input.id,
    category: input.category,
    severity,
    title: input.title,
    description: input.description,
    evidence: input.evidence,
  };
  if (input.timestamp !== undefined) finding.timestamp = input.timestamp;
  if (input.durationMs !== undefined) finding.durationMs = input.durationMs;
  if (input.recommendation !== undefined) {
    finding.recommendation = input.recommendation;
  }
  if (input.confidence !== undefined) finding.confidence = input.confidence;
  if (input.verdict !== undefined) finding.verdict = input.verdict;
  if (input.expected !== undefined) finding.expected = input.expected;
  if (input.actual !== undefined) finding.actual = input.actual;
  return finding;
}
