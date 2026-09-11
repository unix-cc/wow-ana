import type { FactSet } from '@wcl/domain';
import type { PriorityEvaluationResult } from '@wcl/analysis-engine';
import type { FightDeathReview } from './app-service.js';

/**
 * Bounded projections of the deterministic layers for MCP tools.
 *
 * The analysis engine / combat-facts output is objective but can be verbose
 * (every cast, every idle window, every cooldown delay sample). These views
 * keep the numbers while capping arrays, so a host AI can reason over them
 * without drowning in raw rows — the progressive-disclosure alternative to
 * raw event tools.
 */

export const FACTS_VIEW_OPTIONS = {
  /** Keep the top N abilities by cast count. */
  topAbilities: 20,
  /** Sample at most this many idle windows. */
  idleWindowSample: 5,
  /** Sample at most this many cooldown delay rows per usage. */
  cooldownDelaySample: 6,
  /** Keep the top N damage abilities by total damage. */
  damageAbilities: 20,
  /** Keep the top N damage targets by total damage. */
  damageTargets: 10,
  /** Keep at most this many death incidents. */
  deathIncidents: 10,
  /** Sample at most this many damage-taken rows per death incident. */
  takenEventSample: 8,
  /** Keep at most this many dispel / interrupt target rows. */
  utilityTargets: 10,
  /** Keep at most this many death incidents in the death-review view. */
  reviewDeaths: 20,
  /** Keep at most this many attacker rows per death incident. */
  reviewTopSources: 3,
  /** Keep at most this many healer rows per death incident. */
  reviewHealers: 2,
  /** Keep at most this many wipe clusters in the death-review view. */
  reviewWipes: 5,
  /** Keep at most this many add-suspicion rows in the death-review view. */
  reviewAdds: 10,
} as const;

/** Top abilities by cast count, sorted desc, capped. */
export interface CastAbilityView {
  abilityId?: number | undefined;
  abilityName?: string | undefined;
  count: number;
  avgIntervalMs?: number | undefined;
}

export interface GcdView {
  totalGcd: number;
  idleMs: number;
  idlePercent: number;
  idleWindowCount: number;
  /** First N idle windows (chronological). */
  idleWindowSample: Array<{ start: number; end: number; durationMs: number }>;
}

export interface CooldownUsageView {
  abilityId?: number | undefined;
  abilityName?: string | undefined;
  cooldownMs: number;
  actualCasts: number;
  expectedCasts: number;
  averageDelayMs?: number | undefined;
  maxDelayMs?: number | undefined;
  /** Sample of delay rows (chronological, capped). */
  delaySample: Array<{ timestamp: number; idealTimestamp: number; delayMs: number }>;
  delaySampleCapped: boolean;
}

export interface BuffUptimeView {
  abilityId?: number | undefined;
  abilityName?: string | undefined;
  /** Fraction of the fight window active (0..1). */
  uptime: number;
  downtimeMs: number;
  refreshCount: number;
  maxStacks?: number | undefined;
  avgStacks?: number | undefined;
}

export interface ResourceSeriesView {
  resourceType?: string | undefined;
  eventCount: number;
  peak: number;
  min: number;
  totalGained: number;
  totalSpent: number;
}

export interface DamageAbilityView {
  abilityId?: number | undefined;
  abilityName?: string | undefined;
  count: number;
  total: number;
  critCount: number;
  hitCount: number;
}

export interface DamageView {
  totalDamage: number;
  /** Total damage over the fight duration, rounded. */
  dps: number;
  /** last - first damage event timestamp. */
  activeTimeMs: number;
  /** Top abilities by total damage, capped. */
  abilities: DamageAbilityView[];
  abilitiesCapped: boolean;
}

export interface DeathIncidentView {
  timestamp: number;
  takenTotal: number;
  /** Damage-taken rows before the death, chronological, capped. */
  takenSample: Array<{
    timestamp: number;
    abilityName?: string | undefined;
    abilityId?: number | undefined;
    sourceName?: string | undefined;
    amount: number;
  }>;
  takenSampleCapped: boolean;
}

export interface TargetDamageView {
  targetId?: number | undefined;
  targetName?: string | undefined;
  hits: number;
  total: number;
}

export interface TargetView {
  targetCount: number;
  switches: number;
  targets: TargetDamageView[];
  targetsCapped: boolean;
}

export interface UtilityByTargetView {
  targetId?: number | undefined;
  targetName?: string | undefined;
  count: number;
}

export interface DispelView {
  count: number;
  byTarget: UtilityByTargetView[];
  byTargetCapped: boolean;
}

export interface InterruptView {
  count: number;
  distinctTargets: number;
  byTarget: UtilityByTargetView[];
  byTargetCapped: boolean;
}

/**
 * The combat-facts view served by the `get_combat_facts` MCP tool. Every
 * array is capped; capping is always reported so consumers never mistake a
 * sample for the full set.
 */
export interface CombatFactsView {
  fightId: number;
  durationMs: number;
  player: { id: number; name?: string | undefined };
  casts: { totalCasts: number; abilities: CastAbilityView[]; abilitiesCapped: boolean };
  gcd?: GcdView | undefined;
  cooldowns?: CooldownUsageView[] | undefined;
  buffs?: BuffUptimeView[] | undefined;
  resources?: ResourceSeriesView[] | undefined;
  damage?: DamageView | undefined;
  deaths?: DeathIncidentView[] | undefined;
  target?: TargetView | undefined;
  dispel?: DispelView | undefined;
  interrupt?: InterruptView | undefined;
}

/** Build a bounded view over a computed fact set. Pure and deterministic. */
export function buildCombatFactsView(set: FactSet): CombatFactsView {
  const durationMs = Math.max(0, set.fight.endTime - set.fight.startTime);
  const view: CombatFactsView = {
    fightId: set.fight.id,
    durationMs,
    player: { id: set.player.id },
    casts: { totalCasts: set.cast?.totalCasts ?? 0, abilities: [], abilitiesCapped: false },
  };
  if (set.player.name !== undefined) view.player.name = set.player.name;

  const abilities: CastAbilityView[] = [...(set.cast?.abilities ?? [])]
    .sort((a, b) => b.count - a.count)
    .slice(0, FACTS_VIEW_OPTIONS.topAbilities)
    .map((ability) => {
      const entry: CastAbilityView = { count: ability.count };
      if (ability.abilityId !== undefined) entry.abilityId = ability.abilityId;
      if (ability.abilityName !== undefined) entry.abilityName = ability.abilityName;
      if (ability.avgIntervalMs !== undefined) entry.avgIntervalMs = ability.avgIntervalMs;
      return entry;
    });
  view.casts.abilities = abilities;
  const totalAbilities = set.cast?.abilities.length ?? 0;
  view.casts.abilitiesCapped = totalAbilities > abilities.length;

  const gcd = set.gcd;
  if (gcd !== undefined) {
    view.gcd = {
      totalGcd: gcd.totalGcd,
      idleMs: gcd.idleMs,
      idlePercent: gcd.idlePercent,
      idleWindowCount: gcd.idleWindows.length,
      idleWindowSample: gcd.idleWindows
        .slice(0, FACTS_VIEW_OPTIONS.idleWindowSample)
        .map((window) => ({
          start: window.start,
          end: window.end,
          durationMs: window.durationMs,
        })),
    };
  }

  const cooldowns = set.cooldown;
  if (cooldowns !== undefined) {
    view.cooldowns = cooldowns.usages.map((usage) => {
      const entry: CooldownUsageView = {
        cooldownMs: usage.cooldownMs,
        actualCasts: usage.actualCasts,
        expectedCasts: usage.expectedCasts,
        delaySample: usage.delays
          .slice(0, FACTS_VIEW_OPTIONS.cooldownDelaySample)
          .map((delay) => ({
            timestamp: delay.timestamp,
            idealTimestamp: delay.idealTimestamp,
            delayMs: delay.delayMs,
          })),
        delaySampleCapped: usage.delays.length > FACTS_VIEW_OPTIONS.cooldownDelaySample,
      };
      if (usage.abilityId !== undefined) entry.abilityId = usage.abilityId;
      if (usage.abilityName !== undefined) entry.abilityName = usage.abilityName;
      if (usage.averageDelayMs !== undefined) entry.averageDelayMs = usage.averageDelayMs;
      if (usage.maxDelayMs !== undefined) entry.maxDelayMs = usage.maxDelayMs;
      return entry;
    });
  }

  const buffs = set.buff;
  if (buffs !== undefined) {
    view.buffs = buffs.buffs.map((buff) => {
      const entry: BuffUptimeView = {
        uptime: buff.uptime,
        downtimeMs: buff.downtimeMs,
        refreshCount: buff.refreshCount,
      };
      if (buff.abilityId !== undefined) entry.abilityId = buff.abilityId;
      if (buff.abilityName !== undefined) entry.abilityName = buff.abilityName;
      if (buff.maxStacks !== undefined) entry.maxStacks = buff.maxStacks;
      if (buff.avgStacks !== undefined) entry.avgStacks = buff.avgStacks;
      return entry;
    });
  }

  const resources = set.resource;
  if (resources !== undefined) {
    view.resources = resources.resources.map((resource) => {
      const entry: ResourceSeriesView = {
        eventCount: resource.eventCount,
        peak: resource.peak,
        min: resource.min,
        totalGained: resource.totalGained,
        totalSpent: resource.totalSpent,
      };
      if (resource.resourceType !== undefined) entry.resourceType = resource.resourceType;
      return entry;
    });
  }

  const damage = set.damage;
  if (damage !== undefined) {
    const abilities = damage.abilities
      .slice(0, FACTS_VIEW_OPTIONS.damageAbilities)
      .map((ability) => {
        const entry: DamageAbilityView = {
          count: ability.count,
          total: ability.total,
          critCount: ability.critCount,
          hitCount: ability.hitCount,
        };
        if (ability.abilityId !== undefined) entry.abilityId = ability.abilityId;
        if (ability.abilityName !== undefined) entry.abilityName = ability.abilityName;
        return entry;
      });
    view.damage = {
      totalDamage: damage.totalDamage,
      dps: durationMs > 0 ? Math.round(damage.totalDamage / (durationMs / 1000)) : 0,
      activeTimeMs:
        damage.firstTimestamp !== undefined && damage.lastTimestamp !== undefined
          ? damage.lastTimestamp - damage.firstTimestamp
          : 0,
      abilities,
      abilitiesCapped:
        damage.abilities.length > FACTS_VIEW_OPTIONS.damageAbilities,
    };
  }

  const deaths = set.death;
  if (deaths !== undefined) {
    view.deaths = deaths.deaths
      .slice(0, FACTS_VIEW_OPTIONS.deathIncidents)
      .map((incident) => ({
        timestamp: incident.timestamp,
        takenTotal: incident.takenTotal,
        takenSample: incident.takenEvents
          .slice(0, FACTS_VIEW_OPTIONS.takenEventSample)
          .map((taken) => ({
            timestamp: taken.timestamp,
            abilityName: taken.abilityName,
            abilityId: taken.abilityId,
            sourceName: taken.sourceName,
            amount: taken.amount,
          })),
        takenSampleCapped:
          incident.takenEvents.length > FACTS_VIEW_OPTIONS.takenEventSample,
      }));
  }

  const target = set.target;
  if (target !== undefined) {
    const targets = target.targets
      .slice(0, FACTS_VIEW_OPTIONS.damageTargets)
      .map((entry) => ({
        targetId: entry.targetId,
        targetName: entry.targetName,
        hits: entry.hits,
        total: entry.total,
      }));
    view.target = {
      targetCount: target.targetCount,
      switches: target.switches,
      targets,
      targetsCapped: target.targets.length > FACTS_VIEW_OPTIONS.damageTargets,
    };
  }

  const dispel = set.dispel;
  if (dispel !== undefined) {
    view.dispel = {
      count: dispel.count,
      byTarget: dispel.byTarget
        .slice(0, FACTS_VIEW_OPTIONS.utilityTargets)
        .map((entry) => ({
          targetId: entry.targetId,
          targetName: entry.targetName,
          count: entry.count,
        })),
      byTargetCapped: dispel.byTarget.length > FACTS_VIEW_OPTIONS.utilityTargets,
    };
  }

  const interrupt = set.interrupt;
  if (interrupt !== undefined) {
    view.interrupt = {
      count: interrupt.count,
      distinctTargets: interrupt.distinctTargets,
      byTarget: interrupt.byTarget
        .slice(0, FACTS_VIEW_OPTIONS.utilityTargets)
        .map((entry) => ({
          targetId: entry.targetId,
          targetName: entry.targetName,
          count: entry.count,
        })),
      byTargetCapped: interrupt.byTarget.length > FACTS_VIEW_OPTIONS.utilityTargets,
    };
  }

  return view;
}

/**
 * Verdict-stream digest served by the `analyze_fight` MCP tool. Keeps the
 * breakdown + a bounded sample of the decisions a coach would cite, dropping
 * the full decision table.
 */
export interface RotationDigest {
  scenario: 'st' | 'aoe' | 'unknown';
  breakdown: Record<string, number>;
  decisionCount: number;
  /** Decisions that never produced a clear verdict (why we held back). */
  unknownCount: number;
  knowledge: {
    specName: string;
    knowledgeVersion: string;
    patch?: string | undefined;
  };
  samples: Array<{
    time: number;
    verdict: string;
    actualKey: string;
    expectedKey?: string | undefined;
    expectedRuleId?: string | undefined;
    acceptableRuleId?: string | undefined;
  }>;
  samplesCapped: boolean;
  /**
   * Combat segments inferred from decision-time gaps — a Mythic+ dungeon
   * chains trash/boss pulls with out-of-combat runs between them, and the
   * per-segment split lets the host model talk about "pull 3" instead of a
   * wall of timestamps. Only present when the fight splits into more than
   * one segment (raid fights stay a single implicit segment). Times are
   * report-relative, matching `samples[].time`.
   */
  engagements?: Array<{
    startMs: number;
    endMs: number;
    decisions: number;
    /** mistake + suboptimal + acceptable decisions in the segment. */
    flagged: number;
  }>;
  engagementsCapped?: boolean;
}

const ROTATION_DIGEST_OPTIONS = {
  /** Sample per deviation verdict. */
  perVerdict: 4,
  /** Decision-time gap that splits two combat segments (ms). */
  engagementGapMs: 15_000,
  /** Max engagement rows kept in the digest. */
  engagements: 20,
  /** Truncate reason-free long keys? Not applied — keys are short by design. */
} as const;

export function buildRotationDigest(
  result: PriorityEvaluationResult,
): RotationDigest {
  const samples: RotationDigest['samples'] = [];
  const interesting = new Set(['mistake', 'suboptimal', 'acceptable']);
  const picked: Record<string, number> = { mistake: 0, suboptimal: 0, acceptable: 0 };
  let capped = false;
  for (const decision of result.decisions) {
    if (!interesting.has(decision.verdict)) continue;
    const taken = picked[decision.verdict] ?? 0;
    if (taken >= ROTATION_DIGEST_OPTIONS.perVerdict) {
      capped = true;
      continue;
    }
    picked[decision.verdict] = taken + 1;
    const sample: RotationDigest['samples'][number] = {
      time: decision.time,
      verdict: decision.verdict,
      actualKey: decision.actualKey,
    };
    if (decision.expectedKey !== undefined) sample.expectedKey = decision.expectedKey;
    if (decision.expectedRuleId !== undefined) {
      sample.expectedRuleId = decision.expectedRuleId;
    }
    if (decision.acceptableRuleId !== undefined) {
      sample.acceptableRuleId = decision.acceptableRuleId;
    }
    samples.push(sample);
  }

  const digest: RotationDigest = {
    scenario: result.scenario,
    breakdown: { ...result.breakdown },
    decisionCount: result.decisions.length,
    unknownCount: result.breakdown.unknown ?? 0,
    knowledge: {
      specName: result.knowledge.specName,
      knowledgeVersion: result.knowledge.knowledgeVersion,
    },
    samples,
    samplesCapped: capped,
  };
  if (result.knowledge.patch !== undefined) {
    digest.knowledge.patch = result.knowledge.patch;
  }

  // Engagement segmentation (M+ pulls): split the decision stream wherever
  // two consecutive decisions are more than `engagementGapMs` apart — the
  // player was running between pulls. Only surfaced when it actually splits.
  if (result.decisions.length > 1) {
    const gap = ROTATION_DIGEST_OPTIONS.engagementGapMs;
    const flagged = new Set(['mistake', 'suboptimal', 'acceptable']);
    const segments: NonNullable<RotationDigest['engagements']> = [];
    let current = {
      startMs: result.decisions[0]!.time,
      endMs: result.decisions[0]!.time,
      decisions: 0,
      flagged: 0,
    };
    for (const decision of result.decisions) {
      if (decision.time - current.endMs > gap) {
        segments.push(current);
        current = {
          startMs: decision.time,
          endMs: decision.time,
          decisions: 0,
          flagged: 0,
        };
      }
      current.endMs = decision.time;
      current.decisions += 1;
      if (flagged.has(decision.verdict)) current.flagged += 1;
    }
    segments.push(current);
    if (segments.length > 1) {
      digest.engagementsCapped = segments.length > ROTATION_DIGEST_OPTIONS.engagements;
      digest.engagements = segments.slice(0, ROTATION_DIGEST_OPTIONS.engagements);
    }
  }

  return digest;
}

/* ------------------------------------------------------------------ *
 * Death / wipe / add review view (served by analyze_death_review)
 * ------------------------------------------------------------------ */

export interface ReviewDeathView {
  playerName: string;
  role: 'tank' | 'healer' | 'dps' | 'unknown';
  /** Fight-relative death time (ms). */
  relativeMs: number;
  cause: 'burst-kill' | 'sustained' | 'environment' | 'no-data' | 'unknown';
  /** Damage taken inside the pre-death window. */
  takenTotal: number;
  /** Effective healing received inside the pre-death window. */
  healingReceived: number;
  healCount: number;
  /** Heal attempts including fully-overhealed rows (healer WAS casting). */
  healAttempts: number;
  /** Overhealed portion inside the window. */
  overhealInWindow: number;
  /** Effective healing per healer inside the window, capped. */
  healers: Array<{
    playerName?: string | undefined;
    count: number;
    total: number;
  }>;
  /**
   * A healer died shortly before this victim (healing-gap explanation):
   * name, how long before, and whether they had healed this player earlier.
   */
  healerDiedBefore?: {
    playerName: string;
    diedMsBefore: number;
    hadHealedVictim: boolean;
  } | undefined;
  hits: number;
  burstMs: number;
  /** Human-readable factual summary; quote it instead of recomputing. */
  summary: string;
  /** The last non-zero damaging hit before death. */
  killer?:
    | {
        sourceName?: string | undefined;
        abilityName?: string | undefined;
        amount: number;
        at: number;
      }
    | undefined;
  /** Top attackers by damage, capped. */
  topSources: Array<{
    sourceName?: string | undefined;
    hits: number;
    total: number;
  }>;
}

export interface ReviewWipeView {
  startAtMs: number;
  endAtMs: number;
  firstDeathPlayerName: string;
  deaths: Array<{ playerName: string; role: string; relativeMs: number }>;
}

export interface ReviewAddView {
  mobName?: string | undefined;
  mobId: number;
  recentAdd: boolean;
  confidence: 'high' | 'medium' | 'low';
  note: string;
  firstTouchedAtMs?: number | undefined;
  touchedByPlayerName?: string | undefined;
}

export interface DeathReviewView {
  reportCode: string;
  fightId: number;
  fightName: string;
  deathCount: number;
  wipeCount: number;
  addCount: number;
  deaths: ReviewDeathView[];
  deathsCapped: boolean;
  wipes: ReviewWipeView[];
  wipesCapped: boolean;
  adds: ReviewAddView[];
  addsCapped: boolean;
}

/**
 * Bounded projection of a whole-fight death / wipe / add review. Every number
 * is deterministic (engine-computed); ADD rows are *suspicions* with
 * confidence levels, never verdicts.
 */
export function buildDeathReviewView(
  review: FightDeathReview,
): DeathReviewView {
  const deaths = review.deaths
    .slice(0, FACTS_VIEW_OPTIONS.reviewDeaths)
    .map((death) => {
      const entry: ReviewDeathView = {
        playerName: death.playerName,
        role: death.role,
        relativeMs: death.relativeMs,
        cause: death.cause,
        takenTotal: death.takenTotal,
        healingReceived: death.healingReceived,
        healCount: death.healCount,
        healAttempts: death.healAttempts,
        overhealInWindow: death.overhealInWindow,
        healers: death.healers
          .slice(0, FACTS_VIEW_OPTIONS.reviewHealers)
          .map((healer) => ({
            playerName: healer.playerName,
            count: healer.count,
            total: healer.total,
          })),
        hits: death.hits,
        burstMs: death.burstMs,
        summary: death.summary,
        topSources: death.topSources
          .slice(0, FACTS_VIEW_OPTIONS.reviewTopSources)
          .map((source) => ({
            sourceName: source.sourceName,
            hits: source.hits,
            total: source.total,
          })),
      };
      if (death.healerDiedBefore !== undefined) {
        entry.healerDiedBefore = {
          playerName: death.healerDiedBefore.playerName,
          diedMsBefore: death.healerDiedBefore.diedMsBefore,
          hadHealedVictim: death.healerDiedBefore.hadHealedVictim,
        };
      }
      if (death.killer !== undefined) {
        entry.killer = {
          sourceName: death.killer.sourceName,
          abilityName: death.killer.abilityName,
          amount: death.killer.amount,
          at: death.killer.at,
        };
      }
      return entry;
    });

  const wipes = review.wipes
    .slice(0, FACTS_VIEW_OPTIONS.reviewWipes)
    .map((wipe) => ({
      startAtMs: wipe.startAtMs,
      endAtMs: wipe.endAtMs,
      firstDeathPlayerName: wipe.firstDeathPlayerName,
      deaths: wipe.deaths.map((d) => ({
        playerName: d.playerName,
        role: d.role,
        relativeMs: d.relativeMs,
      })),
    }));

  const adds = review.adds
    .slice(0, FACTS_VIEW_OPTIONS.reviewAdds)
    .map((add) => {
      const entry: ReviewAddView = {
        mobId: add.mobId,
        recentAdd: add.recentAdd,
        confidence: add.confidence,
        note: add.note,
      };
      if (add.mobName !== undefined) entry.mobName = add.mobName;
      if (add.firstTouchedAtMs !== undefined) {
        entry.firstTouchedAtMs = add.firstTouchedAtMs;
      }
      if (add.touchedBy !== undefined) {
        entry.touchedByPlayerName = add.touchedBy.playerName;
      }
      return entry;
    });

  return {
    reportCode: review.reportCode,
    fightId: review.fightId,
    fightName: review.fightName,
    deathCount: review.deaths.length,
    wipeCount: review.wipes.length,
    addCount: review.adds.length,
    deaths,
    deathsCapped: review.deaths.length > FACTS_VIEW_OPTIONS.reviewDeaths,
    wipes,
    wipesCapped: review.wipes.length > FACTS_VIEW_OPTIONS.reviewWipes,
    adds,
    addsCapped: review.adds.length > FACTS_VIEW_OPTIONS.reviewAdds,
  };
}
