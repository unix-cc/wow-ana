import type { Finding } from '@wcl/domain';
import type { RankingReference } from '@wcl/analysis-engine';
import type { RotationDigest } from '@wcl/application';
import type { AnalysisPayload } from './pipeline.js';

/**
 * The **structured** side of an analysis turn.
 *
 * The UI principle for this project is: *the conversation is the entry point,
 * but the analysis is structured data — not a wall of Markdown*. The model is
 * only allowed to explain, prioritise and recommend (see `prompt.ts`); every
 * number, severity, timestamp and link it talks about already exists here,
 * computed deterministically by the analysis engine.
 *
 * So the artifact is the render model for the cards, and the LLM's Markdown is
 * just one more part in the same message. Nothing in here is model output.
 *
 * Every array is capped: a turn may carry at most `MAX_ARTIFACT_FINDINGS`
 * findings and `MAX_EVIDENCE_PER_FINDING` evidence points, so a pathological
 * fight can never blow up the DOM (or the SSE frame).
 */

export const MAX_ARTIFACT_FINDINGS = 24;
export const MAX_EVIDENCE_PER_FINDING = 6;
/**
 * Baseline runs shipped to the UI with their permalinks. The pool itself is
 * capped at `REFERENCE_POOL_SIZE` (10), so this shows the whole pool — the
 * player can open any of the top runs and watch how it was played.
 */
export const MAX_ARTIFACT_TOP_RUNS = 10;

export interface ArtifactEvidence {
  timestamp?: number | undefined;
  expectedAt?: number | undefined;
  ability?: string | undefined;
  abilityId?: number | undefined;
  value?: number | undefined;
  unit?: string | undefined;
  note?: string | undefined;
}

export interface ArtifactFinding {
  id: string;
  category: string;
  severity: string;
  title: string;
  description?: string | undefined;
  verdict?: string | undefined;
  confidence?: number | undefined;
  recommendation?: string | undefined;
  expected?: Record<string, unknown> | undefined;
  actual?: Record<string, unknown> | undefined;
  evidence: ArtifactEvidence[];
  /** True when evidence was dropped to respect the cap. */
  evidenceCapped?: boolean;
}

export interface ArtifactReference {
  encounterName: string;
  metric: string;
  className: string;
  specName: string;
  count: number;
  pool?: string | undefined;
  keyLevel?: number | undefined;
  poolLevels?: { min: number; max: number } | undefined;
  rankingsUrl?: string | undefined;
  stats: Partial<Record<'min' | 'p25' | 'p50' | 'p75' | 'p90' | 'max' | 'mean', number>>;
  player?:
    | {
        dps?: number | undefined;
        percentilePct?: number | undefined;
        gapVsP50Pct?: number | undefined;
      }
    | undefined;
  topRuns: Array<{
    name: string;
    amount: number;
    keyLevel?: number | undefined;
    runUrl?: string | undefined;
  }>;
}

export interface ArtifactRotation {
  scenario: 'st' | 'aoe' | 'unknown';
  breakdown: Record<string, number>;
  decisionCount: number;
  knowledgeVersion: string;
  /** Flagged decisions (mistake/suboptimal/acceptable) cited by category. */
  samples: Array<{
    time: number;
    verdict: string;
    actualKey: string;
    expectedKey?: string | undefined;
  }>;
  engagements?: Array<{ startMs: number; endMs: number; decisions: number; flagged: number }>;
}

export interface AnalysisArtifact {
  kind: 'analysis';
  /** Identity of the analysed run — the header of the report card. */
  run: {
    reportCode: string;
    reportTitle?: string | undefined;
    fightId: number;
    fightName?: string | undefined;
    durationMs?: number | undefined;
    playerId: number;
    playerName: string;
    specName?: string | undefined;
  };
  /** Heuristic engine score, not a DPS loss and not a percentile. */
  score?: number | undefined;
  /** Deterministic permalink to this exact run. */
  reportUrl?: string | undefined;
  findings: ArtifactFinding[];
  findingsCapped?: boolean;
  reference?: ArtifactReference | undefined;
  rotation?: ArtifactRotation | undefined;
}

/** Coarse progress steps surfaced as the Codex-style activity panel. */
export interface ActivityStep {
  /** Stable machine id, e.g. `report`. */
  id: string;
  /** Human label, e.g. 「读取 WCL 报告」. */
  label: string;
  status: 'running' | 'done' | 'failed';
  /** Optional one-line result, e.g. 「8 场战斗」. */
  detail?: string | undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Absolute report-relative ms → fight-relative ms. Returns undefined when the
 * value cannot be rebased (missing, or earlier than the fight start), so the
 * caller omits it instead of rendering a meaningless clock.
 */
function rebase(value: unknown, fightStart: number): number | undefined {
  if (!isFiniteNumber(value)) return undefined;
  const relative = value - fightStart;
  return relative >= 0 ? relative : undefined;
}

/** Keep only the scalar fields the cards can actually render. */
function projectRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (
      isFiniteNumber(entry) ||
      typeof entry === 'string' ||
      typeof entry === 'boolean'
    ) {
      out[key] = entry;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function projectFinding(finding: Finding, fightStart: number): ArtifactFinding {
  const all = finding.evidence ?? [];
  const kept: ArtifactEvidence[] = [];
  for (const point of all.slice(0, MAX_EVIDENCE_PER_FINDING)) {
    const evidence: ArtifactEvidence = {};
    // Evidence timestamps are **absolute report-relative** milliseconds (the
    // same coordinate as `fight.startTime`). The cards render clocks, so the
    // render model rebases them to fight-relative — otherwise a dungeon run
    // starting 7h into a report shows "422:20" instead of "02:18".
    // A time before the fight starts cannot be rebased, so it is dropped
    // rather than shown as a nonsense clock.
    const timestamp = rebase(point.timestamp, fightStart);
    if (timestamp !== undefined) evidence.timestamp = timestamp;
    const expectedAt = rebase(point.expectedAt, fightStart);
    if (expectedAt !== undefined) evidence.expectedAt = expectedAt;
    if (typeof point.ability === 'string') evidence.ability = point.ability;
    if (isFiniteNumber(point.abilityId)) evidence.abilityId = point.abilityId;
    if (isFiniteNumber(point.value)) evidence.value = point.value;
    if (typeof point.unit === 'string') evidence.unit = point.unit;
    if (typeof point.note === 'string') evidence.note = point.note;
    if (Object.keys(evidence).length > 0) kept.push(evidence);
  }

  const projected: ArtifactFinding = {
    id: finding.id,
    category: finding.category,
    severity: finding.severity,
    title: finding.title,
    evidence: kept,
  };
  if (finding.description !== undefined) projected.description = finding.description;
  if (finding.verdict !== undefined) projected.verdict = finding.verdict;
  if (isFiniteNumber(finding.confidence)) projected.confidence = finding.confidence;
  if (finding.recommendation !== undefined) {
    projected.recommendation = finding.recommendation;
  }
  const expected = projectRecord(finding.expected);
  if (expected !== undefined) projected.expected = expected;
  const actual = projectRecord(finding.actual);
  if (actual !== undefined) projected.actual = actual;
  if (all.length > kept.length) projected.evidenceCapped = true;
  return projected;
}

function projectReference(reference: RankingReference): ArtifactReference {
  const projected: ArtifactReference = {
    encounterName: reference.source.encounterName,
    metric: reference.source.metric,
    className: reference.source.className,
    specName: reference.source.specName,
    count: reference.source.count,
    stats: {},
    topRuns: reference.top.slice(0, MAX_ARTIFACT_TOP_RUNS).map((entry) => {
      const run: ArtifactReference['topRuns'][number] = {
        name: entry.name,
        amount: entry.amount,
      };
      if (entry.keyLevel !== undefined) run.keyLevel = entry.keyLevel;
      if (entry.runUrl !== undefined) run.runUrl = entry.runUrl;
      return run;
    }),
  };
  if (reference.source.pool !== undefined) projected.pool = reference.source.pool;
  if (reference.source.keyLevel !== undefined) {
    projected.keyLevel = reference.source.keyLevel;
  }
  if (reference.source.poolLevels !== undefined) {
    projected.poolLevels = reference.source.poolLevels;
  }
  if (reference.source.rankingsUrl !== undefined) {
    projected.rankingsUrl = reference.source.rankingsUrl;
  }
  for (const key of ['min', 'p25', 'p50', 'p75', 'p90', 'max', 'mean'] as const) {
    const value = reference.stats[key];
    if (isFiniteNumber(value)) projected.stats[key] = value;
  }
  if (reference.player !== undefined) {
    const player: NonNullable<ArtifactReference['player']> = {};
    if (isFiniteNumber(reference.player.dps)) player.dps = reference.player.dps;
    if (isFiniteNumber(reference.player.percentilePct)) {
      player.percentilePct = reference.player.percentilePct;
    }
    if (isFiniteNumber(reference.player.gapVsP50Pct)) {
      player.gapVsP50Pct = reference.player.gapVsP50Pct;
    }
    if (Object.keys(player).length > 0) projected.player = player;
  }
  return projected;
}

function projectRotation(digest: RotationDigest, fightStart: number): ArtifactRotation {
  const projected: ArtifactRotation = {
    scenario: digest.scenario,
    breakdown: digest.breakdown,
    decisionCount: digest.decisionCount,
    knowledgeVersion: digest.knowledge.knowledgeVersion,
    samples: digest.samples.slice(0, 12).flatMap((sample) => {
      // Same coordinate fix as evidence: decision times are report-relative.
      const time = rebase(sample.time, fightStart);
      if (time === undefined) return [];
      const out: ArtifactRotation['samples'][number] = {
        time,
        verdict: sample.verdict,
        actualKey: sample.actualKey,
      };
      if (sample.expectedKey !== undefined) out.expectedKey = sample.expectedKey;
      return [out];
    }),
  };
  if (digest.engagements !== undefined) {
    projected.engagements = digest.engagements.map((segment) => ({
      startMs: Math.max(0, segment.startMs - fightStart),
      endMs: Math.max(0, segment.endMs - fightStart),
      decisions: segment.decisions,
      flagged: segment.flagged,
    }));
  }
  return projected;
}

/** Severity rank used to order the cards (worst first). */
const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export interface BuildArtifactOptions {
  reportUrl?: string | undefined;
  rotation?: RotationDigest | undefined;
}

/**
 * Project one turn's deterministic analysis into the render model.
 *
 * Pure and total: it never throws and never invents data — anything missing
 * on the engine side is simply absent here.
 */
export function buildAnalysisArtifact(
  payload: AnalysisPayload,
  options?: BuildArtifactOptions,
): AnalysisArtifact {
  const { report, fight, player, summary, result } = payload;

  const ranked = [...result.findings].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 5) - (SEVERITY_RANK[b.severity] ?? 5),
  );
  const kept = ranked.slice(0, MAX_ARTIFACT_FINDINGS);

  // Evidence times share the report-relative coordinate with fight.startTime.
  const fightStart = fight.startTime ?? 0;

  const durationMs =
    fight.endTime !== undefined && fight.startTime !== undefined
      ? Math.max(0, fight.endTime - fight.startTime)
      : undefined;

  const artifact: AnalysisArtifact = {
    kind: 'analysis',
    run: {
      reportCode: report.code,
      fightId: fight.id,
      playerId: player.id,
      playerName: summary?.name ?? player.name,
    },
    findings: kept.map((finding) => projectFinding(finding, fightStart)),
  };

  if (report.title !== undefined) artifact.run.reportTitle = report.title;
  if (fight.name !== undefined) artifact.run.fightName = fight.name;
  if (durationMs !== undefined) artifact.run.durationMs = durationMs;
  const specName = summary?.spec ?? player.specName;
  if (specName !== undefined) artifact.run.specName = specName;
  if (ranked.length > kept.length) artifact.findingsCapped = true;

  const score = result.score?.overall;
  if (isFiniteNumber(score)) artifact.score = Math.round(score);

  if (options?.reportUrl !== undefined) artifact.reportUrl = options.reportUrl;
  if (result.reference !== undefined) {
    artifact.reference = projectReference(result.reference);
  }
  if (options?.rotation !== undefined) {
    artifact.rotation = projectRotation(options.rotation, fightStart);
  }
  return artifact;
}
