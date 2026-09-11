import type { Finding, FindingSeverity } from '@wcl/domain';

export const SEVERITY_ORDER: readonly FindingSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
];

const SEVERITY_PENALTY: Record<FindingSeverity, number> = {
  critical: 30,
  high: 15,
  medium: 8,
  low: 3,
  info: 0,
};

/**
 * Rank of a severity for ordering purposes. Lower ranks are more severe and
 * should be surfaced first to the AI.
 */
export function severityRank(severity: FindingSeverity): number {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

/**
 * Sort findings so the most severe come first, preserving the original
 * relative order within the same severity (stable sort). This gives the AI a
 * deterministic Impact x Confidence ordering to focus on.
 */
export function prioritizeFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity),
  );
}

/**
 * Heuristic overall score in [0, 100]. This is NOT an estimated DPS loss or a
 * ranking percentile; it is a deterministic reflection of the severity and
 * quantity of findings so the AI can quickly gauge how much attention a fight
 * needs.
 */
export function computeScore(findings: readonly Finding[]): number {
  const penalty = findings.reduce(
    (sum, finding) => sum + SEVERITY_PENALTY[finding.severity],
    0,
  );
  return Math.max(0, Math.min(100, 100 - penalty));
}
