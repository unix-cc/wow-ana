import type { AnalysisContext, AnalysisVersion, Finding } from '@wcl/domain';

/**
 * Version of the deterministic rule set / analyzers in this package.
 *
 * Keep in sync with the `version` field in analysis-engine/package.json.
 * Bumping it changes the analysis cache key so previously cached results are
 * automatically invalidated (Phase I dual versioning).
 *
 * 0.11.0 — the ranking reference pool shrank from 100 rows to 10
 * (`REFERENCE_POOL_SIZE`), which changes stats, gapVsP50Pct and the pool label
 * on every battle. Without this bump, cached results would keep serving the
 * old 100-row baseline.
 *
 * 0.12.0 — `reference.top[]` now carries `reportCode` / `fightId` so a ranked
 * run can be *located* and re-analysed head-to-head (Phase AF). Cached rows
 * lack those fields, so the cache must be invalidated for the comparison to
 * work on previously analysed fights.
 *
 * 0.13.0 — rotation digest gains a cast-anchored burst-phase split
 * (`burstWindows` in the evaluator, `rotation.burst` in the digest, `phase`
 * in the head-to-head comparison). Cached digests lack the new field, so the
 * cache must be invalidated for the burst-vs-filler comparison to appear.
 *
 * 0.14.0 — rotation digest gains per-rule adherence (`rotation.rules`, then
 * `rules` in the head-to-head comparison): when a Condition→Action rule was
 * the expected action, how often the player obeyed it. Cached digests lack
 * the new field, so the cache must be invalidated for the rule-level
 * comparison to appear.
 */
export const ANALYZER_VERSION = '0.14.0';

/**
 * A deterministic analysis rule. Each rule inspects the provided context and
 * returns zero or more findings. Rules must be pure functions of the context.
 */
export interface AnalysisRule {
  id: string;
  name: string;
  description: string;
  evaluate(context: AnalysisContext): Finding[];
}

/**
 * Reference baseline: the top parses of the same encounter (same-instance
 * leaderboard, e.g. top-100 of a dungeon/boss for the player's spec). Every
 * analysis claim must be traceable to real data; this reference is the source
 * the AI cites when comparing the player against high performers.
 */
export interface RankingReference {
  source: {
    encounterId: number;
    encounterName: string;
    metric: string;
    className: string;
    specName: string;
    page: number;
    count: number;
    /**
     * Human label of the baseline pool's semantics. `characterRankings`
     * cannot be filtered by keystone level (its hard-mode-level enum has no
     * keystone values — verified live 2026-09-10), so for Mythic+ fights the
     * pool is whatever the top rows contain: the highest keys observed (e.g.
     * `+19~+21`), NOT the player's key-level cohort.
     *
     * The pool is a small top-N sample (see `REFERENCE_POOL_SIZE` in
     * @wcl/application) and therefore a **ceiling**, not a peer group:
     * percentile / gap claims must be phrased against this elite sample, never
     * as a population percentile.
     */
    pool?: string | undefined;
    /** Keystone level when the fight is a Mythic+ dungeon run. */
    keyLevel?: number | undefined;
    /**
     * Keystone-level range actually observed across the baseline pool entries.
     * The pool cannot be filtered by level (the API's hard-mode-level enum has
     * no keystone values), so the honest way to describe it is the range it
     * happens to contain — e.g. `+19~+21` for a top-100 Mythic+ dungeon set.
     */
    poolLevels?: { min: number; max: number } | undefined;
    /**
     * Link to the encounter's rankings page for this class/spec, so the player
     * can inspect the baseline instead of trusting a percentile.
     */
    rankingsUrl?: string | undefined;
  };
  top: Array<{
    name: string;
    server?: string | undefined;
    amount: number;
    score?: number | undefined;
    /**
     * Keystone / hard-mode level of the ranked run. Semantically named here;
     * the raw WCL field (`hardModeLevel`) is mapped at the wcl-client
     * boundary and never crosses into the engine model.
     */
    keyLevel?: number | undefined;
    /** Duration of the ranked run in ms. */
    durationMs?: number | undefined;
    /** Permalink to the ranked run's report + fight. */
    runUrl?: string | undefined;
    /**
     * Where the ranked run lives, so it can be re-fetched and analysed
     * head-to-head (Phase AF: 榜首逐场对标). The raw WCL shape is
     * `report.code` / `report.fightID`; it is internalized at the wcl-client
     * boundary like `keyLevel`.
     */
    reportCode?: string | undefined;
    /** Fight id inside {@link reportCode}. */
    fightId?: number | undefined;
  }>;
  stats: {
    min: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    max: number;
    mean: number;
  };
  player?:
    | {
        dps: number;
        /** Position inside the baseline pool (0-100). */
        percentilePct: number;
        /**
         * Player dps relative to the pool median in percent
         * ((dps / p50 - 1) * 100). More informative than a raw percentile
         * when the pool is an all-time best set far above the player's level.
         */
        gapVsP50Pct?: number | undefined;
      }
    | undefined;
}

/**
 * Aggregate analysis result produced by an Analyzer.
 *
 * `metrics` carries the deterministic, strongly-typed output of whichever
 * analyzers ran. It is an open record so that per-domain analyzers can each
 * contribute their own shape without coupling this module to them.
 */
export interface AnalysisResult {
  findings: Finding[];
  metrics: Record<string, unknown>;
  /** Heuristic overall score in [0, 100] derived from the findings. */
  score?: { overall: number } | undefined;
  /** Same-instance top-ranking baseline for comparison, when available. */
  reference?: RankingReference | undefined;
  /**
   * Provenance of this result: the analyzer version that produced it and the
   * Spec Knowledge version used, when one was live for the spec. Persisted
   * with the result so historical outputs stay reproducible.
   */
  versions?: AnalysisVersion | undefined;
}

/**
 * Deterministic combat analyzer.
 */
export interface Analyzer {
  analyze(context: AnalysisContext): Promise<AnalysisResult> | AnalysisResult;
}
