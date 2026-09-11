import type { Evidence } from '@wcl/domain';
import type {
  AnalysisBrief,
  BriefEvidence,
  BriefFinding,
  BriefInput,
  BriefOptions,
  BriefReference,
} from './types.js';

/**
 * Deterministic input trimming for the AI reasoning layer.
 *
 * The model must never see the full AnalysisResult / event stream: findings
 * are severity-ranked and capped, evidence is sampled per finding, metrics are
 * reduced to finite scalar / short-array leaves and capped, and the reference
 * baseline is projected without the top-rows table. Every transformation here
 * is a pure function of its input — the same input always yields the same
 * brief, which keeps prompts reproducible across runs.
 */

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const DEFAULTS: Record<keyof BriefOptions, number> = {
  maxFindings: 24,
  maxEvidencePerFinding: 6,
  maxDescriptionChars: 220,
  maxMetricEntries: 40,
  maxMetricArrayLength: 12,
};

/** Baseline runs shipped with their permalinks (deliberately tiny). */
const MAX_TOP_RUNS = 3;

function severityRank(severity: string): number {
  return SEVERITY_RANK[severity] ?? 5;
}

function clampPositive(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  return Number.isFinite(resolved) && resolved >= 0 ? Math.floor(resolved) : fallback;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  // Cut on a character boundary when possible to avoid splitting surrogate
  // pairs; falling back to the raw slice keeps the behaviour deterministic.
  let end = maxChars;
  while (end > 0 && (text.charCodeAt(end) & 0xfc00) === 0xdc00) end -= 1;
  return `${text.slice(0, end)}…`;
}

function isScalar(value: unknown): value is number | string | boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' || typeof value === 'boolean';
}

function isScalarArray(value: unknown, maxLength: number): value is unknown[] {
  if (!Array.isArray(value)) return false;
  if (value.length > maxLength) return true; // truncated below
  return value.every(isScalar);
}

/**
 * Flatten a metric entry to one or more leaf values that are safe for the
 * model. Nested objects recurse one extra level; oversized scalar arrays are
 * truncated; everything else is dropped (never emitted as `undefined`).
 */
function appendMetricLeaves(
  key: string,
  value: unknown,
  out: Array<[string, unknown]>,
  maxArrayLength: number,
  depth: number,
): void {
  if (depth > 2) return;
  if (isScalar(value)) {
    out.push([key, value]);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return;
    if (isScalarArray(value, maxArrayLength)) {
      out.push([key, value.slice(0, maxArrayLength)]);
    }
    return;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [childKey, child] of entries) {
      if (child !== undefined) {
        appendMetricLeaves(`${key}.${childKey}`, child, out, maxArrayLength, depth + 1);
      }
    }
  }
}

/** Project a reference baseline without the top-100 rows. */
function projectReference(
  reference: NonNullable<BriefInput['reference']>,
): BriefReference {
  const result: BriefReference = {};
  const src = reference.source;
  if (src !== undefined) {
    if (src.encounterName !== undefined) result.encounterName = src.encounterName;
    if (src.metric !== undefined) result.metric = src.metric;
    if (src.className !== undefined) result.className = src.className;
    if (src.specName !== undefined) result.specName = src.specName;
    if (src.count !== undefined) result.count = src.count;
    // Pool semantics and key level must survive the projection: the system
    // prompt keys its percentile wording on `pool` (an all-time-best set must
    // never be described as a same-key-level cohort), and `keyLevel` is the
    // only field telling the model the run is a Mythic+ dungeon.
    if (src.pool !== undefined) result.pool = src.pool;
    if (src.keyLevel !== undefined) result.keyLevel = src.keyLevel;
    if (src.rankingsUrl !== undefined) result.rankingsUrl = src.rankingsUrl;
    if (
      src.poolLevels !== undefined &&
      Number.isFinite(src.poolLevels.min) &&
      Number.isFinite(src.poolLevels.max)
    ) {
      result.poolLevels = { min: src.poolLevels.min, max: src.poolLevels.max };
    }
  }
  // Only a handful of concrete runs are shipped: enough for the player to open
  // a top parse and see how it was played, without shipping the leaderboard.
  const topRuns = (reference.top ?? [])
    .filter((row) => typeof row.runUrl === 'string' && row.runUrl.length > 0)
    .slice(0, MAX_TOP_RUNS)
    .map((row) => {
      const projected: NonNullable<BriefReference['topRuns']>[number] = {};
      if (row.name !== undefined) projected.name = row.name;
      if (typeof row.amount === 'number' && Number.isFinite(row.amount)) {
        projected.amount = Math.round(row.amount);
      }
      if (row.keyLevel !== undefined) projected.keyLevel = row.keyLevel;
      if (row.runUrl !== undefined) projected.runUrl = row.runUrl;
      return projected;
    });
  if (topRuns.length > 0) result.topRuns = topRuns;
  if (reference.stats !== undefined) {
    const stats: NonNullable<BriefReference['stats']> = {};
    for (const key of ['min', 'p25', 'p50', 'p75', 'p90', 'max', 'mean'] as const) {
      const raw = reference.stats[key];
      if (typeof raw === 'number' && Number.isFinite(raw)) stats[key] = raw;
    }
    if (Object.keys(stats).length > 0) result.stats = stats;
  }
  if (reference.player !== undefined) {
    const player: NonNullable<BriefReference['player']> = {};
    const { dps, percentilePct, gapVsP50Pct } = reference.player;
    if (typeof dps === 'number' && Number.isFinite(dps)) player.dps = dps;
    if (
      typeof percentilePct === 'number' &&
      Number.isFinite(percentilePct)
    ) {
      player.percentilePct = Math.min(100, Math.max(0, percentilePct));
    }
    if (typeof gapVsP50Pct === 'number' && Number.isFinite(gapVsP50Pct)) {
      player.gapVsP50Pct = Math.round(gapVsP50Pct * 10) / 10;
    }
    if (Object.keys(player).length > 0) result.player = player;
  }
  return result;
}

function projectEvidence(
  evidence: Array<Partial<Evidence>> | undefined,
  maxPerFinding: number,
): BriefEvidence[] {
  if (evidence === undefined || evidence.length === 0) return [];
  const kept: BriefEvidence[] = [];
  for (const point of evidence) {
    const projected: BriefEvidence = {};
    if (typeof point.timestamp === 'number') projected.timestamp = point.timestamp;
    if (typeof point.expectedAt === 'number') projected.expectedAt = point.expectedAt;
    if (typeof point.ability === 'string' && point.ability.length > 0) {
      projected.ability = point.ability;
    }
    if (typeof point.abilityId === 'number') projected.abilityId = point.abilityId;
    if (typeof point.value === 'number' && Number.isFinite(point.value)) {
      projected.value = point.value;
    }
    if (typeof point.unit === 'string' && point.unit.length > 0) {
      projected.unit = point.unit;
    }
    if (typeof point.note === 'string' && point.note.length > 0) {
      projected.note = point.note;
    }
    if (Object.keys(projected).length > 0) kept.push(projected);
    if (kept.length >= maxPerFinding) break;
  }
  return kept;
}

export function buildBrief(input: BriefInput, options?: BriefOptions): AnalysisBrief {
  const opts = {
    maxFindings: clampPositive(options?.maxFindings, DEFAULTS.maxFindings),
    maxEvidencePerFinding: clampPositive(
      options?.maxEvidencePerFinding,
      DEFAULTS.maxEvidencePerFinding,
    ),
    maxDescriptionChars: clampPositive(
      options?.maxDescriptionChars,
      DEFAULTS.maxDescriptionChars,
    ),
    maxMetricEntries: clampPositive(options?.maxMetricEntries, DEFAULTS.maxMetricEntries),
    maxMetricArrayLength: clampPositive(
      options?.maxMetricArrayLength,
      DEFAULTS.maxMetricArrayLength,
    ),
  };

  // Severity-ranked, stable: findings of equal rank keep their engine order.
  const ranked = [...input.findings].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity),
  );
  const keptFindings = ranked.slice(0, opts.maxFindings);

  const findings: BriefFinding[] = keptFindings.map((finding) => {
    const projected: BriefFinding = {
      id: finding.id,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      evidence: projectEvidence(finding.evidence, opts.maxEvidencePerFinding),
    };
    if (finding.description !== undefined && finding.description.length > 0) {
      projected.description = truncate(
        finding.description,
        opts.maxDescriptionChars,
      );
    }
    if (finding.verdict !== undefined) projected.verdict = finding.verdict;
    if (typeof finding.confidence === 'number') {
      projected.confidence = Math.min(1, Math.max(0, finding.confidence));
    }
    if (
      finding.recommendation !== undefined &&
      finding.recommendation.length > 0
    ) {
      projected.recommendation = truncate(finding.recommendation, 160);
    }
    return projected;
  });

  // Deterministic leaf projection of metrics, key-sorted and capped.
  const metricLeaves: Array<[string, unknown]> = [];
  if (input.metrics !== undefined) {
    const entries = Object.entries(input.metrics).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    for (const [key, value] of entries) {
      if (value === undefined) continue;
      appendMetricLeaves(
        key,
        value,
        metricLeaves,
        opts.maxMetricArrayLength,
        0,
      );
      if (metricLeaves.length >= opts.maxMetricEntries) break;
    }
  }
  const metrics: Record<string, unknown> = {};
  for (const [key, value] of metricLeaves.slice(0, opts.maxMetricEntries)) {
    metrics[key] = value;
  }

  const meta: AnalysisBrief['meta'] = {
    versions: input.versions ?? {},
  };
  if (input.meta?.playerName !== undefined) meta.playerName = input.meta.playerName;
  if (input.meta?.specName !== undefined) meta.specName = input.meta.specName;
  if (input.meta?.fightName !== undefined) meta.fightName = input.meta.fightName;
  if (input.meta?.durationMs !== undefined) meta.durationMs = input.meta.durationMs;
  if (input.meta?.reportTitle !== undefined) meta.reportTitle = input.meta.reportTitle;
  if (input.meta?.reportUrl !== undefined) meta.reportUrl = input.meta.reportUrl;
  if (
    input.score !== undefined &&
    typeof input.score.overall === 'number' &&
    Number.isFinite(input.score.overall)
  ) {
    meta.overallScore = Math.min(100, Math.max(0, Math.round(input.score.overall)));
  }

  const brief: AnalysisBrief = {
    meta,
    findings,
    metrics,
    sources: findings.map((finding) => finding.id),
  };
  if (input.reference !== undefined) {
    const projected = projectReference(input.reference);
    if (Object.keys(projected).length > 0) brief.reference = projected;
  }
  return brief;
}
