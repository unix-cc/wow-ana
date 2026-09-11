import type { Evidence, FindingCategory, FindingSeverity, Verdict } from '@wcl/domain';

/**
 * Structural projection of the deterministic analysis output that is safe to
 * hand to an LLM. The builder (`buildBrief`) applies deterministic trimming so
 * the input to the model is bounded regardless of how large the raw
 * AnalysisResult / evidence stream was.
 *
 * Package dependencies are kept minimal: only `@wcl/domain` types plus zod.
 * Consumers (web / MCP / application) pass their richer `AnalysisResult` /
 * `RankingReference` objects straight in — structural typing keeps this module
 * decoupled from the engine package.
 */

/** A single trimmed evidence point that made it into the brief. */
export interface BriefEvidence {
  timestamp?: number | undefined;
  expectedAt?: number | undefined;
  ability?: string | undefined;
  abilityId?: number | undefined;
  value?: number | undefined;
  unit?: string | undefined;
  note?: string | undefined;
}

/** A finding kept after severity-ranked trimming. */
export interface BriefFinding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  /** May be truncated by `maxDescriptionChars`. */
  description?: string | undefined;
  verdict?: Verdict | undefined;
  confidence?: number | undefined;
  recommendation?: string | undefined;
  evidence: BriefEvidence[];
}

/**
 * Same-encounter baseline projected for the model: everything the AI needs to
 * reason about percentile/ranking comparisons, without shipping the whole
 * top-100 rows table.
 */
export interface BriefReference {
  encounterName?: string | undefined;
  metric?: string | undefined;
  className?: string | undefined;
  specName?: string | undefined;
  /** Leaderboard sample size (e.g. 100). */
  count?: number | undefined;
  /**
   * Semantics of the baseline pool. When set (e.g. "Mythic+ 全层数历史最佳
   * top100"), the model must not frame percentilePct as a same-key-level peer
   * ranking — the pool is an all-time best set far above the player's level.
   */
  pool?: string | undefined;
  /** Keystone level of the analyzed fight, when it is a Mythic+ run. */
  keyLevel?: number | undefined;
  /** Keystone-level range the baseline pool actually contains (e.g. 19..21). */
  poolLevels?: { min: number; max: number } | undefined;
  /** Link to the encounter's rankings page (class/spec filtered). */
  rankingsUrl?: string | undefined;
  /**
   * A few of the baseline's best runs, with permalinks. Kept tiny (3) on
   * purpose: the point is that the player can open one and watch how it was
   * played, not to ship the whole leaderboard.
   */
  topRuns?:
    | Array<{
        name?: string | undefined;
        amount?: number | undefined;
        keyLevel?: number | undefined;
        runUrl?: string | undefined;
      }>
    | undefined;
  /** Same-spec leaderboard percentiles. */
  stats?: Partial<
    Record<'min' | 'p25' | 'p50' | 'p75' | 'p90' | 'max' | 'mean', number>
  > | undefined;
  /** Where the analyzed player ranks inside the sample. */
  player?:
    | {
        dps?: number | undefined;
        percentilePct?: number | undefined;
        /** Player dps vs pool median, in percent. */
        gapVsP50Pct?: number | undefined;
      }
    | undefined;
}

export interface BriefVersions {
  analyzerVersion?: string | undefined;
  knowledgeVersion?: string | undefined;
  /** Knowledge patch the versions refer to, when known (e.g. '12.1'). */
  patch?: string | undefined;
}

/** Free-form identifiers the caller wants the model to see. */
export interface BriefMeta {
  playerName?: string | undefined;
  specName?: string | undefined;
  fightName?: string | undefined;
  /** Fight duration in ms. */
  durationMs?: number | undefined;
  reportTitle?: string | undefined;
  /** Permalink to the analyzed report (fight-focused when known). */
  reportUrl?: string | undefined;
}

/**
 * The bounded, model-ready brief. `sources` lists every finding id the model
 * is allowed to cite — the provenance integrity set for structured output.
 */
export interface AnalysisBrief {
  meta: BriefMeta & { overallScore?: number | undefined; versions: BriefVersions };
  findings: BriefFinding[];
  /** Trimmed to scalar/short-array values only, key-sorted. */
  metrics: Record<string, unknown>;
  reference?: BriefReference | undefined;
  sources: string[];
}

/** Deterministic trimming knobs. All optional; defaults cap token growth. */
export interface BriefOptions {
  /** Keep at most this many findings (severity-ranked). Default 24. */
  maxFindings?: number | undefined;
  /** Keep at most this many evidence points per finding. Default 6. */
  maxEvidencePerFinding?: number | undefined;
  /** Truncate each finding description to this many chars. Default 220. */
  maxDescriptionChars?: number | undefined;
  /** Include at most this many metric entries. Default 40. */
  maxMetricEntries?: number | undefined;
  /** Largest array of primitives allowed as a metric value. Default 12. */
  maxMetricArrayLength?: number | undefined;
}

/**
 * Everything `buildBrief` needs. Structural subset of AnalysisResult +
 * reference + metadata so the package never imports the engine.
 */
export interface BriefInput {
  findings: Array<{
    id: string;
    category: FindingCategory;
    severity: FindingSeverity;
    title: string;
    description?: string | undefined;
    verdict?: Verdict | undefined;
    confidence?: number | undefined;
    recommendation?: string | undefined;
    evidence?: Array<Partial<Evidence>> | undefined;
  }>;
  metrics?: Record<string, unknown> | undefined;
  score?: { overall?: number | undefined } | undefined;
  reference?: {
    source?: {
      encounterName?: string | undefined;
      metric?: string | undefined;
      className?: string | undefined;
      specName?: string | undefined;
      count?: number | undefined;
      pool?: string | undefined;
      keyLevel?: number | undefined;
      poolLevels?: { min: number; max: number } | undefined;
      rankingsUrl?: string | undefined;
    } | undefined;
    top?: Array<{
      name?: string | undefined;
      amount?: number | undefined;
      keyLevel?: number | undefined;
      runUrl?: string | undefined;
    }> | undefined;
    stats?:
      | Partial<Record<'min' | 'p25' | 'p50' | 'p75' | 'p90' | 'max' | 'mean', number>>
      | undefined;
    player?:
      | {
          dps?: number | undefined;
          percentilePct?: number | undefined;
          gapVsP50Pct?: number | undefined;
        }
      | undefined;
  } | undefined;
  meta?: Partial<BriefMeta> | undefined;
  versions?: BriefVersions | undefined;
}
