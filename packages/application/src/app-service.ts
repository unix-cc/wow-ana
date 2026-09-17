import type {
  Report,
  Fight,
  Player,
  CombatEvent,
  AnalysisContext,
  AnalysisVersion,
} from '@wcl/domain';
import type {
  WclClient,
  EventDataType,
  EncounterRankings,
  RankingEntry,
} from '@wcl/wcl-client';
import { buildReportUrl, buildRankingsUrl } from '@wcl/wcl-client';
import {
  CastAnalyzer,
  GcdAnalyzer,
  CooldownAnalyzer,
  BuffAnalyzer,
  DamageAnalyzer,
  TargetAnalyzer,
  DeathAnalyzer,
  ResourceAnalyzer,
  InterruptAnalyzer,
  DispelAnalyzer,
  SpecRegistry,
  prioritizeFindings,
  computeScore,
  evaluateRotation,
  isMythicPlusRun,
  mythicPlusKeyLevel,
  ANALYZER_VERSION,
  mergeMetrics,
  buildDeathIncident,
  clusterWipes,
  suggestAdds,
  roleOfSpec,
  type AnalysisResult,
  type RankingReference,
  type DeathIncident,
  type ReviewDeathPoint,
  type WipeEvent,
  type AddSuspicion,
  type MobTouchInfo,
} from '@wcl/analysis-engine';
import { buildCombatFacts, type FactsInput } from '@wcl/combat-facts';
import { createDefaultRegistry, type SpecKnowledge } from '@wcl/spec-knowledge';
import type { WclCache } from '@wcl/storage';
import {
  buildCombatFactsView,
  buildRotationDigest,
  type BurstPhaseDigest,
  type CombatFactsView,
  type RotationDigest,
  type RuleAdherenceDigest,
} from './analysis-views.js';
import {
  buildReferenceComparison,
  unavailableComparison,
  type ComparisonSide,
  type ComparisonTarget,
  type ReferenceComparison,
  type RuleComparisonRule,
  type VerdictSide,
} from './reference-compare.js';

/** Hard cap for raw event exports served to MCP hosts (audit risk H). */
export const MAX_RAW_EVENT_LIMIT = 500;

/**
 * How many baseline rows the ranking reference uses.
 *
 * The reference exists to answer one question — "how far is this run from the
 * very top?" — so the top handful is all that is needed. Keeping WCL's full
 * 100-row page made the pool label misleading ("前 100 名" implies a cohort),
 * compressed every percentile into noise, and shipped 10× the payload for no
 * analytical gain. The API has no row-limit argument (verified), so this is a
 * deliberate client-side cap.
 */
export const REFERENCE_POOL_SIZE = 10;

/**
 * WCL class slugs used by the rankings API, keyed by spec name.
 *
 * ⚠️ Only *unambiguous* spec names belong here. `Frost` (Mage | Death Knight),
 * `Holy` (Paladin | Priest), `Restoration` (Druid | Shaman) and `Protection`
 * (Paladin | Warrior) each name two different classes, and a wrong slug would
 * silently attach another class's leaderboard to the player. Those four are
 * resolved from the actor's class instead (see `classForPlayer`).
 */
const SPEC_TO_CLASS: Record<string, string> = {
  'Beast Mastery': 'Hunter',
  Marksmanship: 'Hunter',
  Survival: 'Hunter',
  Arcane: 'Mage',
  Fire: 'Mage',
  Elemental: 'Shaman',
  Enhancement: 'Shaman',
  Blood: 'DeathKnight',
  Unholy: 'DeathKnight',
  Retribution: 'Paladin',
  Arms: 'Warrior',
  Fury: 'Warrior',
  Balance: 'Druid',
  Feral: 'Druid',
  Guardian: 'Druid',
  Brewmaster: 'Monk',
  Mistweaver: 'Monk',
  Windwalker: 'Monk',
  Assassination: 'Rogue',
  Outlaw: 'Rogue',
  Subtlety: 'Rogue',
  Affliction: 'Warlock',
  Demonology: 'Warlock',
  Destruction: 'Warlock',
  Shadow: 'Priest',
  Discipline: 'Priest',
  Havoc: 'DemonHunter',
  Vengeance: 'DemonHunter',
  Devourer: 'DemonHunter',
  Devastation: 'Evoker',
  Preservation: 'Evoker',
  Augmentation: 'Evoker',
};

/**
 * Normalize a class label to WCL's rankings slug: the site writes
 * `Death Knight` / `Demon Hunter` while the API expects `DeathKnight` /
 * `DemonHunter` (verified live 2026-09-10 — the spaced form returns 0 rows).
 */
export function rankingsClassName(raw: string): string {
  return raw.replace(/[^A-Za-z]/g, '');
}

/** Map a spec name to the WCL class name used by the rankings API. */
export function classForSpec(specName: string): string | undefined {
  return SPEC_TO_CLASS[specName];
}

/**
 * Resolve the rankings class for a player, preferring the actor's own class
 * (`player.className`, populated from the report actor's `subType`) over the
 * spec-name guess. The class is always authoritative — and it is the only way
 * to place `Frost` / `Holy` / `Restoration` / `Protection` in a class at all.
 */
export function classForPlayer(player: {
  className?: string | undefined;
  specName?: string | undefined;
}): string | undefined {
  if (player.className !== undefined && player.className.length > 0) {
    const normalized = rankingsClassName(player.className);
    if (normalized.length > 0) return normalized;
  }
  return player.specName !== undefined ? classForSpec(player.specName) : undefined;
}

export interface GetPlayerEventsOptions {
  fightId: number;
  dataType: EventDataType;
  sourceId?: number | undefined;
  targetId?: number | undefined;
  abilityId?: number | undefined;
  limit?: number | undefined;
}

export interface PlayerSummary {
  playerId: number;
  name: string;
  spec?: string | undefined;
  type: string;
}

export interface AnalyzePlayerOptions {
  fightId: number;
  playerId: number;
  cooldowns?: Array<{
    abilityId?: number | undefined;
    abilityName?: string | undefined;
    cooldownMs: number;
  }>;
  include?: Array<
    | 'summary'
    | 'rotation'
    | 'cooldowns'
    | 'buffs'
    | 'resources'
    | 'damage'
    | 'deaths'
  >;
}

/** Options for a bounded raw-event export (limit is clamped to 500). */
export interface RawEventExportOptions {
  limit?: number | undefined;
}

/** Options shared by the combat-facts / analyze-fight / spec-knowledge tools. */
export interface FightPlayerOptions {
  fightId: number;
  playerId: number;
  cooldowns?: AnalyzePlayerOptions['cooldowns'];
}

/** Options for the whole-fight death / wipe / add review (Phase O). */
export interface FightReviewOptions {
  fightId: number;
  /** Pre-death damage window in ms (default 8000). */
  windowMs?: number | undefined;
  /** Max gap between deaths still counted as one wipe in ms (default 15000). */
  wipeGapMs?: number | undefined;
  /** Min distinct dead players for a wipe (default 3). */
  wipeMinPlayers?: number | undefined;
}

/** Whole-fight death / wipe / add review output (Phase O). */
export interface FightDeathReview {
  reportCode: string;
  fightId: number;
  fightName: string;
  deaths: DeathIncident[];
  wipes: WipeEvent[];
  adds: AddSuspicion[];
}

/**
 * Application service that coordinates the WCL client, the deterministic
 * analysis engine, and the cache. Both the MCP adapter and the web backend
 * call these methods; they hold no business logic of their own.
 */
export class AppService {
  private readonly specRegistry = new SpecRegistry();
  private readonly knowledgeRegistry = createDefaultRegistry();

  constructor(
    private readonly client: WclClient,
    /**
     * Optional analysis result cache (Phase I). When provided,
     * analyzePlayer / analyzeFight read through it keyed by analyzer +
     * knowledge version: a cache hit skips the deterministic analysis and the
     * reference-rankings fetch; a miss recomputes and backfills. When absent,
     * the legacy behaviour (always compute) is preserved.
     */
    private readonly analysisCache?: Pick<
      WclCache,
      'getAnalysis' | 'setAnalysis'
    >,
  ) {}

  /**
   * Dual version identity of an analysis run: the analyzer version plus the
   * Spec Knowledge version live at the fight's date (when the spec has one).
   * Both travel into the result's `versions` and the analysis cache key.
   *
   * @param fightEpochMs epoch ms of the fight start. WCL reports use two
   *   time frames: `report.startTime` is epoch, while `fight.startTime` and
   *   event timestamps are report-relative offsets. Callers must pass the
   *   SUM (`report.startTime + fight.startTime`) — passing the raw relative
   *   offset silently resolves against 1970 and never finds knowledge
   *   (regression found on real log fXdMjWKJbpna6yHv, fixed 2026-09-09).
   */
  private buildAnalysisVersion(
    player: Player,
    fightEpochMs: number,
  ): AnalysisVersion {
    const knowledge = this.knowledgeRegistry.resolve(player, fightEpochMs);
    const version: AnalysisVersion = {
      analyzerVersion: ANALYZER_VERSION,
    };
    if (knowledge !== undefined) {
      version.knowledgeVersion = knowledge.knowledgeVersion;
    }
    return version;
  }

  async getReport(reportCode: string): Promise<Report> {
    return this.client.getReport(reportCode);
  }

  async getFights(reportCode: string): Promise<Fight[]> {
    return this.client.getFights(reportCode);
  }

  async getPlayers(reportCode: string, fightId: number): Promise<Player[]> {
    const [players, friendlies] = await Promise.all([
      this.client.getActors(reportCode),
      this.client.getFightFriendlies(reportCode, fightId),
    ]);

    const playerActors = players.filter((p) => p.type === 'Player');
    // A Player actor's `subType` is its class (`Paladin`, `Death Knight`, …) —
    // verified live on a real report. Keep it on the domain player: it is the
    // only authoritative class source, and four spec names are ambiguous.
    const withClass = playerActors.map((p) =>
      p.subType !== undefined && p.subType.length > 0
        ? { ...p, className: p.subType }
        : p,
    );
    if (friendlies.length === 0) {
      return withClass;
    }

    const specByActor = new Map(
      friendlies.map((entry) => [entry.actorId, entry.specName]),
    );
    const friendlyIds = new Set(friendlies.map((entry) => entry.actorId));

    return withClass
      .filter((p) => friendlyIds.has(p.id))
      .map((p) => {
        const specName = specByActor.get(p.id);
        return specName !== undefined ? { ...p, specName } : p;
      });
  }

  async getPlayerSummary(
    reportCode: string,
    fightId: number,
    playerId: number,
  ): Promise<PlayerSummary | undefined> {
    const players = await this.getPlayers(reportCode, fightId);
    const player = players.find((p) => p.id === playerId);
    if (!player) return undefined;
    return {
      playerId: player.id,
      name: player.name,
      spec: player.specName,
      type: player.type,
    };
  }

  async getPlayerEvents(
    reportCode: string,
    fightId: number,
    options: GetPlayerEventsOptions,
  ): Promise<CombatEvent[]> {
    return this.client.getEvents({
      reportCode,
      fightId,
      dataType: options.dataType,
      sourceId: options.sourceId,
      targetId: options.targetId,
      abilityId: options.abilityId,
      limit: options.limit,
    });
  }

  async getPlayerCasts(
    reportCode: string,
    fightId: number,
    playerId: number,
    options?: RawEventExportOptions,
  ): Promise<CombatEvent[]> {
    const events = await this.client.getPlayerCasts({
      reportCode,
      fightId,
      sourceId: playerId,
    });
    return events.slice(0, clampEventLimit(options?.limit));
  }

  async getPlayerBuffs(
    reportCode: string,
    fightId: number,
    playerId: number,
    options?: RawEventExportOptions,
  ): Promise<CombatEvent[]> {
    const events = await this.client.getPlayerBuffs({
      reportCode,
      fightId,
      sourceId: playerId,
    });
    return events.slice(0, clampEventLimit(options?.limit));
  }

  async getPlayerDamage(
    reportCode: string,
    fightId: number,
    playerId: number,
    options?: RawEventExportOptions,
  ): Promise<CombatEvent[]> {
    const events = await this.client.getPlayerDamage({
      reportCode,
      fightId,
      sourceId: playerId,
    });
    return events.slice(0, clampEventLimit(options?.limit));
  }

  async getPlayerDeaths(
    reportCode: string,
    fightId: number,
    playerId: number,
    options?: RawEventExportOptions,
  ): Promise<CombatEvent[]> {
    // A player's own death appears with the player as the event target.
    const events = await this.client.getPlayerDeaths({
      reportCode,
      fightId,
      targetId: playerId,
    });
    return events.slice(0, clampEventLimit(options?.limit));
  }

  /**
   * Load the shared combat context (report/fight/player/events/summary) that
   * analyze / facts / knowledge tools all need. Throws when the fight is
   * missing; an unknown player degrades to a fallback actor.
   */
  private async loadCombatContext(
    reportCode: string,
    fightId: number,
    playerId: number,
  ): Promise<{
    report: Report;
    fight: Fight;
    player: Player;
    events: CombatEvent[];
    summary: PlayerSummary | undefined;
  }> {
    const [report, fights, players, events] = await Promise.all([
      this.client.getReport(reportCode),
      this.client.getFights(reportCode),
      this.getPlayers(reportCode, fightId),
      this.loadPlayerEvents(reportCode, fightId, playerId),
    ]);

    const fight = fights.find((f) => f.id === fightId);
    if (!fight) {
      throw new Error(`Fight ${fightId} not found in report ${reportCode}.`);
    }

    const actor = players.find((p) => p.id === playerId);
    const summary: PlayerSummary | undefined = actor
      ? {
          playerId: actor.id,
          name: actor.name,
          spec: actor.specName,
          type: actor.type,
        }
      : undefined;

    const fallbackPlayer: Player = {
      id: playerId,
      name: summary?.name ?? 'Unknown',
      type: 'Player',
    };

    return {
      report,
      fight,
      player: actor ?? fallbackPlayer,
      events,
      summary,
    };
  }

  /**
   * Run deterministic analysis over a player's fight data.
   */
  async analyzePlayer(
    reportCode: string,
    options: AnalyzePlayerOptions,
  ): Promise<{ summary: PlayerSummary | undefined; result: AnalysisResult }> {
    const { fightId, playerId } = options;
    const { report, fight, player, events, summary } =
      await this.loadCombatContext(reportCode, fightId, playerId);

    const context: AnalysisContext = { report, fight, player, events };
    const versions = this.buildAnalysisVersion(
      player,
      report.startTime + fight.startTime,
    );

    const cached = await this.readAnalysisCache(
      reportCode,
      fightId,
      playerId,
      versions,
    );
    if (cached !== undefined) {
      return { summary, result: cached };
    }

    const result = await this.runAnalyzers(context, options);
    const reference = await this.buildReference(context, result);
    const final: AnalysisResult = {
      ...result,
      versions,
      ...(reference ? { reference } : {}),
    };
    await this.writeAnalysisCache(reportCode, fightId, playerId, versions, final);
    return { summary, result: final };
  }

  /**
   * Progressive-disclosure view of the objective combat-facts layer (Phase C).
   * Prefer over raw event tools when the host AI needs "what happened" without
   * drowning in per-event rows.
   */
  async getCombatFacts(
    reportCode: string,
    options: FightPlayerOptions,
  ): Promise<CombatFactsView> {
    const { fightId, playerId } = options;
    const { fight, player, events } = await this.loadCombatContext(
      reportCode,
      fightId,
      playerId,
    );
    const facts = buildCombatFacts(
      { fight, player, events } satisfies FactsInput,
      {
        sourceId: playerId,
        targetId: playerId,
        cooldowns: options.cooldowns,
        damage: true,
        death: true,
        target: true,
        dispel: true,
        interrupt: true,
      },
    );
    return buildCombatFactsView(facts);
  }

  /**
   * Resolve the Spec Knowledge live for a player at the fight's date. Throws
   * when the spec is unknown or no knowledge version was live then.
   */
  async getSpecKnowledge(
    reportCode: string,
    options: FightPlayerOptions,
  ): Promise<SpecKnowledge> {
    const { fightId, playerId } = options;
    const { report, fight, player } = await this.loadCombatContext(
      reportCode,
      fightId,
      playerId,
    );
    // fight.startTime is report-relative — the epoch needs the report base.
    const knowledge = this.knowledgeRegistry.resolve(
      player,
      report.startTime + fight.startTime,
    );
    if (knowledge === undefined) {
      const spec = player.specName ?? `id ${player.id}`;
      throw new Error(`没有可用的职业知识：${spec}（该专精未知或无此战斗日期的知识版本）。`);
    }
    return knowledge;
  }

  /**
   * One-shot full analysis: deterministic analyzers + the Condition→Action
   * verdict stream (Phase E/F) merged into a single result, plus a bounded
   * rotation digest the AI can cite. analyze_player behaviour is unchanged.
   */
  async analyzeFight(
    reportCode: string,
    options: AnalyzePlayerOptions,
  ): Promise<{
    summary: PlayerSummary | undefined;
    result: AnalysisResult;
    rotation?: RotationDigest | undefined;
  }> {
    const { fightId, playerId } = options;
    const { report, fight, player, events, summary } =
      await this.loadCombatContext(reportCode, fightId, playerId);

    const context: AnalysisContext = { report, fight, player, events };
    const versions = this.buildAnalysisVersion(
      player,
      report.startTime + fight.startTime,
    );

    // Local, cheap replay over the events — runs once regardless of cache
    // state (needed for the digest on a hit, for the finding merge on a miss).
    const rotationEval = evaluateRotation(context);

    let result = await this.readAnalysisCache(
      reportCode,
      fightId,
      playerId,
      versions,
    );

    if (result === undefined) {
      result = await this.runAnalyzers(context, options);

      if (
        rotationEval.result !== undefined &&
        rotationEval.findings.length > 0
      ) {
        const merged = prioritizeFindings([
          ...result.findings,
          ...rotationEval.findings,
        ]);
        result = {
          ...result,
          findings: merged,
          score: { overall: computeScore(merged) },
        };
      }

      const reference = await this.buildReference(context, result);
      const final: AnalysisResult = {
        ...result,
        versions,
        ...(reference ? { reference } : {}),
      };
      await this.writeAnalysisCache(
        reportCode,
        fightId,
        playerId,
        versions,
        final,
      );
      result = final;
    }

    return {
      summary,
      result,
      rotation:
        rotationEval.result !== undefined
          ? buildRotationDigest(rotationEval.result)
          : undefined,
    };
  }

  /**
   * Head-to-head comparison against a **ranked run of the same encounter and
   * spec** (Phase AF: 榜首逐场对标).
   *
   * The aggregate baseline says how far behind the player is; this says *where*.
   * It re-runs the very same deterministic pipeline on the ranked run's player
   * (the rankings entry carries `reportCode` / `fightId`, so the run can be
   * located and re-analysed) and diffs rate-normalised metrics + findings.
   *
   * Cost: one extra full analysis (roughly a dozen WCL round-trips) on the
   * reference run. That is why it is an explicit request rather than something
   * every analysis does — the own-run side is usually a cache hit.
   *
   * Degradations are explicit (`status`), never a half-empty table: a private
   * report, a renamed player or a missing ranking entry all say so.
   */
  async compareToTopRun(
    reportCode: string,
    options: AnalyzePlayerOptions & { rankIndex?: number | undefined },
  ): Promise<ReferenceComparison> {
    const { fightId, playerId } = options;
    const rankIndex = options.rankIndex ?? 0;

    const own = await this.analyzeFight(reportCode, { fightId, playerId });
    const ownPlayerName = own.summary?.name ?? `#${playerId}`;
    const [report, ownFight, players] = await Promise.all([
      this.client.getReport(reportCode),
      this.client.getFights(reportCode),
      this.getPlayers(reportCode, fightId),
    ]);
    const ownFightResolved =
      ownFight.find((f) => f.id === fightId) ?? ownFight[0];
    const ownPlayer = players.find((p) => p.id === playerId);
    const ownEpochMs = report.startTime + (ownFightResolved?.startTime ?? 0);
    const ownRules =
      own.rotation?.rules !== undefined && ownPlayer !== undefined
        ? this.toRuleComparisonRules(own.rotation.rules, ownPlayer, ownEpochMs)
        : undefined;
    const ownDurationMs = fightDurationMs(ownFightResolved);

    const reference = own.result.reference;
    const entry = reference?.top[rankIndex];
    const mineKeyLevel = reference?.source.keyLevel;

    const mineIdentity: ReferenceComparison['mine'] = { playerName: ownPlayerName };
    if (mineKeyLevel !== undefined) mineIdentity.keyLevel = mineKeyLevel;
    if (ownDurationMs !== undefined) mineIdentity.durationMs = ownDurationMs;

    const mine = toComparisonSide(
      ownPlayerName,
      ownDurationMs,
      own.result,
      await this.abilityNamesOf(reportCode),
    );

    if (!entry) {
      return unavailableComparison(
        'no-reference',
        '本场没有可用的排行榜基线（该副本/专精未取到榜单，或榜单为空），因此无法逐场对标榜首。',
        mineIdentity,
      );
    }

    const target: ComparisonTarget = {
      name: entry.name,
      rank: rankIndex + 1,
      amount: entry.amount,
    };
    if (entry.runUrl !== undefined) target.rankUrl = entry.runUrl;
    if (entry.keyLevel !== undefined) target.keyLevel = entry.keyLevel;
    if (entry.reportCode !== undefined) target.reportCode = entry.reportCode;
    if (entry.fightId !== undefined) target.fightId = entry.fightId;

    if (entry.reportCode === undefined || entry.fightId === undefined) {
      return unavailableComparison(
        'no-data',
        `榜首「${entry.name}」这一条榜单记录没有附带可用日志坐标（缺 report/fight），无法读取其战斗数据。可以点开榜单链接自行查看。`,
        mineIdentity,
      );
    }

    let theirPlayerId: number | undefined;
    try {
      const theirPlayers = await this.getPlayers(entry.reportCode, entry.fightId);
      theirPlayerId = matchPlayerByName(theirPlayers, entry.name)?.id;
    } catch (error) {
      return unavailableComparison(
        'no-data',
        `读取榜首「${entry.name}」所在报告（${entry.reportCode}）失败：${messageOf(
          error,
        )}。可能是报告已设为私密或已过期。`,
        mineIdentity,
      );
    }

    if (theirPlayerId === undefined) {
      return unavailableComparison(
        'player-not-found',
        `打开了榜首「${entry.name}」的报告，但参战名单里找不到同名玩家（可能已改名或日志缺损），因此无法读取其技能数据。`,
        mineIdentity,
      );
    }

    let theirsSide: ComparisonSide;
    let theirRotation: VerdictSide | undefined;
    let theirBurst: BurstPhaseDigest | undefined;
    let theirRules: RuleComparisonRule[] | undefined;
    try {
      const theirs = await this.analyzeFight(entry.reportCode, {
        fightId: entry.fightId,
        playerId: theirPlayerId,
      });
      const theirFight = (await this.client.getFights(entry.reportCode)).find(
        (f) => f.id === entry.fightId,
      );
      if (theirFight !== undefined && ownPlayer !== undefined) {
        const theirReport = await this.client.getReport(entry.reportCode);
        if (theirs.rotation?.rules !== undefined) {
          theirRules = this.toRuleComparisonRules(
            theirs.rotation.rules,
            ownPlayer,
            theirReport.startTime + theirFight.startTime,
          );
        }
      }
      theirsSide = toComparisonSide(
        entry.name,
        fightDurationMs(theirFight) ?? entry.durationMs,
        theirs.result,
        await this.abilityNamesOf(entry.reportCode),
      );
      theirRotation = toVerdictSide(theirs.rotation);
      theirBurst = theirs.rotation?.burst;
    } catch (error) {
      return unavailableComparison(
        'no-data',
        `拉取榜首「${entry.name}」的战斗数据失败：${messageOf(error)}。`,
        mineIdentity,
      );
    }

    const myRotation = toVerdictSide(own.rotation);
    const myBurst = own.rotation?.burst;

    return buildReferenceComparison({
      mine,
      theirs: theirsSide,
      target,
      ...(mineKeyLevel !== undefined ? { mineKeyLevel } : {}),
      ...(myRotation !== undefined ? { rotationMine: myRotation } : {}),
      ...(theirRotation !== undefined ? { rotationTheirs: theirRotation } : {}),
      ...(myBurst !== undefined && theirBurst !== undefined
        ? { burstMine: myBurst, burstTheirs: theirBurst }
        : {}),
      ...(ownRules !== undefined && theirRules !== undefined
        ? { rulesMine: ownRules, rulesTheirs: theirRules }
        : {}),
    });
  }

  /**
   * Report-scoped ability-name table, defensively fetched: naming is a
   * presentation concern, so a failure degrades to "no names" (the comparison
   * then simply omits the per-ability table) instead of failing the request.
   */
  private async abilityNamesOf(reportCode: string): Promise<Map<number, string>> {
    try {
      return await this.client.getAbilityNames(reportCode);
    } catch {
      return new Map<number, string>();
    }
  }

  /**
   * Lift a rotation digest's per-rule adherence into comparison rules with a
   * display label (the knowledge ability name, e.g. 奥术弹幕). The label is
   * resolved from knowledge — WCL events carry no ability names.
   */
  private toRuleComparisonRules(
    digest: RuleAdherenceDigest,
    player: Player,
    fightEpochMs: number,
  ): RuleComparisonRule[] {
    const knowledge = this.knowledgeRegistry.resolve(player, fightEpochMs);
    const nameByKey = new Map(
      (knowledge?.abilities ?? []).map((a) => [a.key, a.name]),
    );
    return digest.rules.map((r) => {
      const out: RuleComparisonRule = {
        ruleId: r.ruleId,
        label: nameByKey.get(r.actionKey) ?? r.actionKey,
        actionKey: r.actionKey,
        decisions: r.decisions,
        obeyed: r.obeyed,
        correct: r.correct,
        suboptimal: r.suboptimal,
        mistake: r.mistake,
        unknown: r.unknown,
      };
      if (r.actionAbilityId !== undefined) out.actionAbilityId = r.actionAbilityId;
      if (r.confidence !== undefined) out.confidence = r.confidence;
      return out;
    });
  }

  /**
   * Whole-fight death / wipe / add review (Phase O).
   *
   * Fetches the full-roster death stream plus, for every dead player, their
   * whole-fight damage taken — WCL returns "damage taken by actor X" when the
   * DamageTaken query carries sourceID = X (verified on a real log). Then runs
   * the deterministic death-review helpers. Add attribution stays evidence-
   * backed: without threat tables it reports candidates with confidence, never
   * hard accusations.
   */
  async analyzeDeathReview(
    reportCode: string,
    options: FightReviewOptions,
  ): Promise<FightDeathReview> {
    const { fightId } = options;
    const [report, fights, players] = await Promise.all([
      this.client.getReport(reportCode),
      this.client.getFights(reportCode),
      this.getPlayers(reportCode, fightId),
    ]);
    const fight = fights.find((f) => f.id === fightId);
    if (!fight) {
      throw new Error(`Fight ${fightId} not found in report ${reportCode}.`);
    }

    // Mythic+ pulls chain from trash pack to pack inside one fight; a wipe
    // cascade there can trail 30-60s behind the first casualty (release /
    // rebuff / brez gaps), so widen the cluster gap. Raid wipes resolve in
    // seconds and keep the default.
    const mythicPlus = isMythicPlusRun(report, fight);
    const wipeGapMs = options.wipeGapMs ?? (mythicPlus ? 60_000 : undefined);
    const friendlySourceIds = new Set(players.map((p) => p.id));

    const playerById = new Map(players.map((p) => [p.id, p]));
    const playerNameById = new Map(players.map((p) => [p.id, p.name]));
    const roleById = new Map(
      players.map((p) => [p.id, roleOfSpec(p.specName)] as const),
    );

    // NPC/Boss actors give mob names for the attribution summaries.
    const actors = await this.client.getActors(reportCode);
    const mobNameById = new Map(
      actors
        .filter((a) => a.type !== 'Player')
        .map((a) => [a.id, a.name]),
    );

    const emptyReview: FightDeathReview = {
      reportCode,
      fightId,
      fightName: fight.name ?? `Fight ${fight.id}`,
      deaths: [],
      wipes: [],
      adds: [],
    };

    const deathEvents = await this.client.getEvents({
      reportCode,
      fightId,
      dataType: 'Deaths',
    });
    const deathPoints: ReviewDeathPoint[] = [];
    for (const event of deathEvents) {
      if (event.type !== 'death' || event.targetId === undefined) continue;
      const player = playerById.get(event.targetId);
      deathPoints.push({
        timestamp: event.timestamp,
        playerId: event.targetId,
        playerName: player?.name ?? `#${event.targetId}`,
        specName: player?.specName,
      });
    }
    if (deathPoints.length === 0) return emptyReview;

    // Whole-fight damage taken + healing received per dead player (deduped),
    // then window locally.
    const deadIds = [...new Set(deathPoints.map((d) => d.playerId))];
    const takenByPlayer = new Map<number, CombatEvent[]>();
    const healingByPlayer = new Map<number, CombatEvent[]>();
    await Promise.all(
      deadIds.map(async (playerId) => {
        const [taken, healing] = await Promise.all([
          this.client.getEvents({
            reportCode,
            fightId,
            dataType: 'DamageTaken',
            sourceId: playerId,
          }),
          // Verified live (Phase T): Healing + targetID=player returns heals
          // received; amount>0 rows are effective (overhealed rows are 0).
          this.client.getEvents({
            reportCode,
            fightId,
            dataType: 'Healing',
            targetId: playerId,
          }),
        ]);
        takenByPlayer.set(playerId, taken);
        healingByPlayer.set(playerId, healing);
      }),
    );

    const incidents = deathPoints.map((death) =>
      buildDeathIncident(
        death,
        takenByPlayer.get(death.playerId) ?? [],
        {
          windowMs: options.windowMs,
          fightStart: fight.startTime,
          mobNameById,
          friendlySourceIds,
          // Healer-death attribution: the whole death timeline + roster
          // roles/names let the incident explain a healing gap with
          // "the healer died N s earlier" when that is what happened.
          priorDeaths: deathPoints,
          roleById,
          playerNameById,
        },
        healingByPlayer.get(death.playerId) ?? [],
      ),
    );

    const wipes = clusterWipes(deathPoints, {
      wipeGapMs,
      wipeMinPlayers: options.wipeMinPlayers,
    }).map((group) => toWipeEvent(group, playerById, fight.startTime));

    // First-touch lookup for every mob that damaged a dead player in-window.
    const mobIds = [
      ...new Set(
        incidents.flatMap((incident) =>
          incident.mobFirstAttacks.map((m) => m.sourceId),
        ),
      ),
    ];
    const mobTouches = new Map<number, MobTouchInfo>();
    await Promise.all(
      mobIds.map(async (mobId) => {
        const hits = await this.client.getEvents({
          reportCode,
          fightId,
          dataType: 'DamageDone',
          targetId: mobId,
        });
        const first = hits[0];
        if (!first?.sourceId) return;
        const player = playerById.get(first.sourceId);
        const info: MobTouchInfo = { mobId, mobName: mobNameById.get(mobId) };
        if (first.timestamp !== undefined) {
          info.firstTouchedAt = first.timestamp;
        }
        if (player) {
          info.touchedBy = {
            playerId: first.sourceId,
            playerName: player.name,
            role: roleOfSpec(player.specName),
          };
        }
        mobTouches.set(mobId, info);
      }),
    );

    const adds = suggestAdds(incidents, mobTouches, {
      fightStart: fight.startTime,
      playerNameById,
      roleById,
    });

    return {
      reportCode,
      fightId,
      fightName: fight.name ?? `Fight ${fight.id}`,
      deaths: incidents,
      wipes,
      adds,
    };
  }

  /** Read the analysis cache when one is wired; returns undefined on miss. */
  private async readAnalysisCache(
    reportCode: string,
    fightId: number,
    playerId: number,
    versions: AnalysisVersion,
  ): Promise<AnalysisResult | undefined> {
    if (this.analysisCache === undefined) return undefined;
    const cached = await this.analysisCache.getAnalysis(
      reportCode,
      fightId,
      playerId,
      versions,
    );
    return cached as AnalysisResult | undefined;
  }

  /** Backfill the analysis cache when one is wired. */
  private async writeAnalysisCache(
    reportCode: string,
    fightId: number,
    playerId: number,
    versions: AnalysisVersion,
    result: AnalysisResult,
  ): Promise<void> {
    if (this.analysisCache === undefined) return;
    await this.analysisCache.setAnalysis(
      reportCode,
      fightId,
      playerId,
      versions,
      result,
    );
  }

  /**
   * Build the same-instance top-ranking baseline (top-100 of the fight's
   * encounter for the player's spec). Used by the AI to compare the player
   * against high performers; every claim must cite this source when present.
   */
  private async buildReference(
    context: AnalysisContext,
    result: AnalysisResult,
  ): Promise<RankingReference | undefined> {
    const specName = context.player.specName;
    const encounterId = context.fight.boss;
    if (!specName || encounterId === undefined) return undefined;
    const className = classForPlayer(context.player);
    if (!className) return undefined;

    let rankings: EncounterRankings | undefined;
    try {
      rankings = await this.client.getEncounterRankings({
        encounterId,
        className,
        specName,
        limit: REFERENCE_POOL_SIZE,
      });
    } catch {
      // Reference data is best-effort; absence must never break the analysis.
      return undefined;
    }
    if (!rankings || rankings.rankings.length === 0) return undefined;

    const amounts = rankings.rankings
      .map((entry) => entry.amount)
      .sort((a, b) => a - b);

    const damage = result.metrics.damage as
      | { dps?: number | undefined }
      | undefined;
    const playerDps = damage?.dps;

    const p50 = percentile(amounts, 0.5);
    const dungeon = isMythicPlusRun(context.report, context.fight);
    const keyLevel = mythicPlusKeyLevel(context.report, context.fight);

    // Keystone levels actually present in the pool. The API cannot filter by
    // key level (HardModeLevelRankFilter has no keystone values — verified
    // 2026-09-10), so the observed range is what honestly describes the pool.
    const poolLevels = keyLevels(rankings.rankings);

    // The WCL *zone* (not the in-game zone): rankings are zone-scoped, so the
    // report's zone id is what addresses the right rankings page.
    const rankingsZoneId = context.report.zone?.id;

    const source: RankingReference['source'] = {
      encounterId,
      encounterName: rankings.encounterName,
      metric: rankings.metric,
      className,
      specName,
      page: rankings.page,
      count: rankings.rankings.length,
      // characterRankings cannot be filtered by keystone level (the
      // hard-mode-level enum has no keystone values — verified live
      // 2026-09-10), so the pool is whatever the top rows happen to contain:
      // for a Mythic+ dungeon that is the highest keys seen (observed +19~+21),
      // i.e. a high-level cohort far above a typical player. State that
      // explicitly so downstream never frames it as a same-key-level peer set.
      // The pool is intentionally tiny (REFERENCE_POOL_SIZE) and therefore a
      // *ceiling*: percentages must always be phrased as a gap to this sample,
      // never as a population percentile.
      pool: dungeon
        ? `Mythic+ 该本最高层前 ${rankings.rankings.length} 名${
            poolLevels ? `（池内层级 +${poolLevels.min}~+${poolLevels.max}）` : ''
          }（排行榜不按层数过滤，以最高层为准）`
        : `同副本历史最佳前 ${rankings.rankings.length} 名`,
      ...(poolLevels !== undefined ? { poolLevels } : {}),
      // Zone-scoped rankings page for this class/spec — the player can open it
      // and inspect the baseline themselves rather than trusting a percentile.
      ...(rankingsZoneId !== undefined
        ? {
            rankingsUrl: buildRankingsUrl({
              zoneId: rankingsZoneId,
              encounterId,
              className,
              specName,
              dungeon,
            }),
          }
        : {}),
    };
    if (keyLevel !== undefined) {
      source.keyLevel = keyLevel;
    }

    const reference: RankingReference = {
      source,
      // The whole pool is small by design, so the ranked list is the pool.
      top: rankings.rankings.map((entry) => ({
        name: entry.name,
        server: entry.server?.name,
        amount: entry.amount,
        score: entry.score,
        // Raw WCL field name is internalized here: the engine model speaks
        // `keyLevel` (keystone / hard-mode level of the ranked run).
        keyLevel: entry.hardModeLevel,
        ...(entry.duration > 0 ? { durationMs: entry.duration } : {}),
        // Permalink straight to the ranked run — the concrete "外链" a player
        // can open to watch how the top parse was actually played.
        ...(entry.report?.code
          ? {
              runUrl: buildReportUrl(
                entry.report.code,
                entry.report.fightID > 0 ? entry.report.fightID : undefined,
              ),
            }
          : {}),
        // ...and where it lives, so it can be re-fetched for a head-to-head
        // comparison (Phase AF). Same internalization as `keyLevel`: the raw
        // `report.code` / `report.fightID` shape stops here.
        ...(entry.report?.code ? { reportCode: entry.report.code } : {}),
        ...(entry.report !== undefined && entry.report.fightID > 0
          ? { fightId: entry.report.fightID }
          : {}),
      })),
      stats: {
        min: amounts[0] ?? 0,
        p25: percentile(amounts, 0.25),
        p50,
        p75: percentile(amounts, 0.75),
        p90: percentile(amounts, 0.9),
        max: amounts[amounts.length - 1] ?? 0,
        mean:
          amounts.length > 0
            ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length
            : 0,
      },
      player:
        playerDps !== undefined
          ? {
              dps: playerDps,
              percentilePct: percentileRank(amounts, playerDps),
              gapVsP50Pct:
                p50 > 0
                  ? Math.round(((playerDps / p50 - 1) * 100) * 10) / 10
                  : undefined,
            }
          : undefined,
    };
    return reference;
  }

  private async loadPlayerEvents(
    reportCode: string,
    fightId: number,
    playerId: number,
  ): Promise<CombatEvent[]> {
    const [
      casts,
      buffs,
      damage,
      deaths,
      debuffs,
      resources,
      interrupts,
      dispels,
      damageTaken,
    ] = await Promise.all([
      this.client.getPlayerCasts({ reportCode, fightId, sourceId: playerId }),
      this.client.getPlayerBuffs({ reportCode, fightId, sourceId: playerId }),
      this.client.getPlayerDamage({
        reportCode,
        fightId,
        sourceId: playerId,
      }),
      // WCL Deaths reports the deceased actor as the event *target*; querying
      // by targetId returns this player's own deaths (audit §10.1, Phase K1).
      this.client.getPlayerDeaths({
        reportCode,
        fightId,
        targetId: playerId,
      }),
      // Debuffs travel in their own dataType: player-applied debuffs (e.g.
      // Flame Shock) drive debuff-uptime rules. The Buffs dataType result may
      // also contain debuff events, so buff-series events are filtered below
      // and this query is the single authoritative source for debuffs
      // (audit §10.2, Phase K2).
      this.client.getEvents({
        reportCode,
        fightId,
        dataType: 'Debuffs',
        sourceId: playerId,
      }),
      this.client.getEvents({
        reportCode,
        fightId,
        dataType: 'Resources',
        sourceId: playerId,
      }),
      this.client.getEvents({
        reportCode,
        fightId,
        dataType: 'Interrupts',
        sourceId: playerId,
      }),
      this.client.getEvents({
        reportCode,
        fightId,
        dataType: 'Dispels',
        sourceId: playerId,
      }),
      // Player damage *taken* feeds the DeathAnalyzer pre-death attribution
      // window; without it metrics.death.deaths is always empty (audit §10.1,
      // Phase K1). WCL exposes damage-taken records keyed by the *victim* in
      // the sourceID filter for the DamageTaken dataType (verified against a
      // real M+ log in Phase O); the targetID filter returns no/malformed
      // rows, so the victim goes in sourceId.
      this.client.getEvents({
        reportCode,
        fightId,
        dataType: 'DamageTaken',
        sourceId: playerId,
      }),
    ]);

    return [
      ...casts,
      // Keep only buff-series events (apply/refresh/remove buff) from the
      // Buffs dataType; debuff-series rows are dropped to prevent the same
      // applydebuff arriving via both Buffs and Debuffs from double-counting.
      ...buffs.filter((event) => event.type === 'buff'),
      ...debuffs,
      ...damage,
      ...deaths,
      ...resources,
      ...interrupts,
      ...dispels,
      ...damageTaken,
    ];
  }

  private async runAnalyzers(
    context: AnalysisContext,
    options: AnalyzePlayerOptions,
  ): Promise<AnalysisResult> {
    const include = options.include ?? [
      'summary',
      'rotation',
      'cooldowns',
      'buffs',
      'resources',
      'damage',
      'deaths',
    ];

    const analyzers = [
      include.includes('rotation') ? new CastAnalyzer() : undefined,
      include.includes('rotation') ? new GcdAnalyzer() : undefined,
      include.includes('cooldowns') && options.cooldowns
        ? new CooldownAnalyzer(options.cooldowns)
        : undefined,
      include.includes('buffs') ? new BuffAnalyzer() : undefined,
      include.includes('resources') ? new ResourceAnalyzer() : undefined,
      include.includes('damage') ? new DamageAnalyzer() : undefined,
      include.includes('damage') ? new TargetAnalyzer() : undefined,
      include.includes('deaths') ? new DeathAnalyzer() : undefined,
      new InterruptAnalyzer(),
      new DispelAnalyzer(),
    ].filter((analyzer): analyzer is NonNullable<typeof analyzer> =>
      Boolean(analyzer),
    );

    const findings: AnalysisResult['findings'] = [];
    const metrics: AnalysisResult['metrics'] = {};

    for (const analyzer of analyzers) {
      const partial = await analyzer.analyze(context);
      findings.push(...partial.findings);
      mergeMetrics(metrics, partial.metrics, analyzer.constructor.name);
    }

    const specAnalyzer = this.specRegistry.findForPlayer(context.player);
    if (specAnalyzer) {
      const specResult = await specAnalyzer.analyze(context);
      findings.push(...specResult.findings);
      mergeMetrics(metrics, { spec: specResult.spec }, specAnalyzer.constructor.name);
      mergeMetrics(metrics, specResult.metrics, specAnalyzer.constructor.name);
    }

    const prioritized = prioritizeFindings(findings);
    return {
      findings: prioritized,
      metrics,
      score: { overall: computeScore(prioritized) },
    };
  }
}

/** Build the {@link WipeEvent} projection for a clustered death group. */
function toWipeEvent(
  group: ReviewDeathPoint[],
  playerById: Map<number, Player>,
  fightStart: number,
): WipeEvent {
  const sorted = [...group].sort((a, b) => a.timestamp - b.timestamp);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) {
    throw new Error('Wipe group must not be empty.');
  }
  return {
    deaths: sorted.map((death) => ({
      playerId: death.playerId,
      playerName: playerById.get(death.playerId)?.name ?? death.playerName,
      role: roleOfSpec(death.specName),
      relativeMs: death.timestamp - fightStart,
    })),
    startAtMs: first.timestamp - fightStart,
    endAtMs: last.timestamp - fightStart,
    firstDeathPlayerName: first.playerName,
    triggerDeathIndex: 0,
  };
}

/** Clamp a raw-event export limit into [1, MAX_RAW_EVENT_LIMIT]. */
function clampEventLimit(limit: number | undefined): number {  if (limit === undefined || !Number.isFinite(limit)) {
    return MAX_RAW_EVENT_LIMIT;
  }
  return Math.min(Math.max(1, Math.floor(limit)), MAX_RAW_EVENT_LIMIT);
}

/** Nearest-rank percentile of sorted ascending values (0-100). */
function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const rank = q * (sorted.length - 1);
  const lower = sorted[Math.floor(rank)] ?? 0;
  const upper = sorted[Math.ceil(rank)] ?? lower;
  return lower + (upper - lower) * (rank - Math.floor(rank));
}

/** Fraction of sorted values strictly below `value`, as a percentage. */
function percentileRank(sorted: number[], value: number): number {
  if (sorted.length === 0) return 0;
  const below = sorted.filter((entry) => entry < value).length;
  return Math.round((below / sorted.length) * 100);
}

/**
 * Keystone-level range present in a baseline pool, or `undefined` when the
 * entries carry no level (raid parses). Describes the pool honestly instead of
 * implying a same-key-level cohort the API cannot actually select.
 */
function keyLevels(
  entries: RankingEntry[],
): { min: number; max: number } | undefined {
  const levels = entries
    .map((entry) => entry.hardModeLevel)
    .filter((level): level is number => typeof level === 'number' && level > 0);
  if (levels.length === 0) return undefined;
  return { min: Math.min(...levels), max: Math.max(...levels) };
}

/** Fight length in ms, or `undefined` when either endpoint is missing. */
function fightDurationMs(fight: Fight | undefined): number | undefined {
  if (fight?.startTime === undefined || fight.endTime === undefined) {
    return undefined;
  }
  return Math.max(0, fight.endTime - fight.startTime);
}

/**
 * Project a rotation digest into the comparison's verdict distribution shape.
 * Returns undefined when the spec has no live knowledge (no digest at all).
 */
function toVerdictSide(
  digest: RotationDigest | undefined,
): VerdictSide | undefined {
  if (digest === undefined) return undefined;
  return {
    scenario: digest.scenario,
    decisionCount: digest.decisionCount,
    breakdown: digest.breakdown,
  };
}

/**
 * Match a rankings entry's player name against a fight roster. Rankings names
 * are display names, so an exact match wins; a trimmed, case-insensitive pass
 * catches spacing / casing drift without ever guessing by class or spec.
 */
function matchPlayerByName(players: Player[], name: string): Player | undefined {
  const exact = players.find((p) => p.name === name);
  if (exact) return exact;
  const wanted = name.trim().toLowerCase();
  return players.find((p) => p.name.trim().toLowerCase() === wanted);
}

/**
 * Reduce a deterministic analysis result to the comparable scalars the
 * head-to-head model needs. Reads only what the analyzers already computed —
 * `metrics.cast` / `metrics.gcd` / `metrics.damage` — and never re-derives a
 * number from raw events.
 *
 * `abilityNames` resolves the ids: normalized events carry `abilityId` but no
 * name (WCL's event JSON has no nested ability object), so the caller passes
 * the report's `masterData.abilities` table.
 */
function toComparisonSide(
  playerName: string,
  durationMs: number | undefined,
  result: AnalysisResult,
  abilityNames: Map<number, string>,
): ComparisonSide {
  const cast = result.metrics.cast as
    | {
        totalCasts?: number | undefined;
        abilities?: Array<{
          abilityId?: number | undefined;
          abilityName?: string | undefined;
          count?: number | undefined;
        }>;
      }
    | undefined;
  const gcd = result.metrics.gcd as
    | { totalGcd?: number | undefined; idlePercent?: number | undefined }
    | undefined;
  const damage = result.metrics.damage as { dps?: number | undefined } | undefined;

  const abilities: ComparisonSide['abilities'] = [];
  for (const ability of cast?.abilities ?? []) {
    if (typeof ability.count !== 'number' || ability.count <= 0) continue;
    const name =
      ability.abilityName ??
      (ability.abilityId !== undefined ? abilityNames.get(ability.abilityId) : undefined);
    // An unresolvable ability cannot be labelled, and a table row of raw ids
    // is noise — skip it rather than guess a name.
    if (name === undefined) continue;
    abilities.push({
      name,
      count: ability.count,
      ...(ability.abilityId !== undefined ? { abilityId: ability.abilityId } : {}),
    });
  }

  const side: ComparisonSide = {
    playerName,
    durationMs: durationMs ?? 0,
    abilities,
    findings: result.findings.map((finding) => ({
      id: finding.id,
      title: finding.title,
    })),
  };
  if (typeof cast?.totalCasts === 'number') side.totalCasts = cast.totalCasts;
  if (typeof gcd?.totalGcd === 'number') side.totalGcd = gcd.totalGcd;
  if (typeof gcd?.idlePercent === 'number') side.idlePercent = gcd.idlePercent;
  if (typeof damage?.dps === 'number') side.dps = damage.dps;
  return side;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
