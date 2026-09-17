import type { Finding } from '@wcl/domain';
import type { BurstPhaseDigest } from './analysis-views.js';

/**
 * Head-to-head comparison against a **ranked run of the same dungeon & spec**
 * (Phase AF: 榜首逐场对标).
 *
 * Why this exists: the aggregate baseline (`RankingReference`) answers "离顶尖
 * 有多远" with a single number, but it cannot answer "我具体差在哪". That needs
 * the *other* player's own event stream — which is exactly what a rankings
 * entry points at (`report.code` + `report.fightID`). So we re-run the same
 * deterministic pipeline on their run and diff the two.
 *
 * ## The honesty problem (read before changing anything here)
 *
 * The two runs are **not a controlled experiment**: the baseline is the top of
 * the leaderboard (observed `+20~+21`), the player's own run is typically far
 * below (e.g. `+10`). Therefore:
 *
 * - Absolute DPS is **not** a clean skill measure — higher keys come with
 *   better gear and different routes. It is reported, but always with a note,
 *   and never as "this is how much better they are".
 * - Only **rate-normalised** quantities are compared: per-minute casts, per
 *   minute GCDs, idle share, per-ability casts per minute. Different fight
 *   lengths would otherwise make raw counts meaningless.
 * - The engine's severity language is preserved: a finding they *also* have is
 *   not "your fault"; a finding only the player has is where the delta is.
 *
 * Everything in here is deterministic — no model output, no invented numbers.
 */

/** Abilities kept in the comparison table (top-N by the reference run's rate). */
export const MAX_COMPARE_ABILITIES = 8;

export interface ComparisonRow {
  key: string;
  label: string;
  unit: 'perMin' | 'pct' | 'amount' | 'number';
  mine?: number | undefined;
  theirs?: number | undefined;
  /** (mine - theirs) / theirs * 100. Positive = I am higher. */
  deltaPct?: number | undefined;
  /** Which direction is desirable, so the UI colours it honestly. */
  better: 'higher' | 'lower' | 'neutral';
  /** Caveat shown next to the number (e.g. key-level confound). */
  note?: string | undefined;
}

export interface AbilityComparison {
  name: string;
  abilityId?: number | undefined;
  minePerMin: number;
  theirsPerMin: number;
  deltaPct?: number | undefined;
}

/** One side of the comparison, already reduced to comparable scalars. */
export interface ComparisonSide {
  playerName: string;
  durationMs: number;
  dps?: number | undefined;
  totalCasts?: number | undefined;
  totalGcd?: number | undefined;
  /** Idle share as a fraction (0..1) — the engine's `gcd.idlePercent`. */
  idlePercent?: number | undefined;
  abilities: Array<{
    abilityId?: number | undefined;
    name: string;
    count: number;
  }>;
  findings: Pick<Finding, 'id' | 'title'>[];
}

export interface ComparisonTarget {
  name: string;
  rank: number;
  rankUrl?: string | undefined;
  keyLevel?: number | undefined;
  amount: number;
  reportCode?: string | undefined;
  fightId?: number | undefined;
}

/** One side's Condition→Action verdict distribution (Phase E rotation digest). */
export interface VerdictSide {
  scenario: 'st' | 'aoe' | 'unknown';
  decisionCount: number;
  breakdown: Record<string, number>;
}

export interface RotationComparison {
  /**
   * True when both runs were evaluated in the same scenario (single-target vs
   * AoE). Different scenarios mean the verdicts classify *different* expected
   * actions, so the distributions are **not** comparable — the UI must say so
   * rather than show a misleading bar chart.
   */
  comparable: boolean;
  mine: VerdictSide;
  theirs: VerdictSide;
  /** Share of *decided* actions that were correct (unknowns excluded), %. */
  correctRateMine?: number | undefined;
  correctRateTheirs?: number | undefined;
}

/**
 * One side of the burst-vs-filler phase split (cast-anchored bucketing).
 * Bucketing only: the `inBurst` flag never feeds a verdict, it only says
 * whether a decision happened inside a burst window.
 */
export interface PhaseSide {
  /** Burst anchors declared by knowledge (incl. zero-cast ones), capped. */
  anchors: Array<{
    key: string;
    name: string;
    castCount: number;
    durationMs: number;
  }>;
  inBurstDecisions: number;
  fillerDecisions: number;
  totalBurstMs: number;
  inBurstCorrectRate?: number | undefined;
  fillerCorrectRate?: number | undefined;
  /** Mean decisions per opened window (in-burst decisions / opened windows). */
  perWindowDecisions?: number | undefined;
}

export interface PhaseComparison {
  /**
   * True when both sides opened at least one burst window. A side with zero
   * cast windows may simply not have the talent — comparing a spec shape
   * against nothing would be a false accusation, so the UI says so.
   */
  comparable: boolean;
  mine: PhaseSide;
  theirs: PhaseSide;
}

/** Minimum per-side decisions before a rule row gets a delta. */
export const MIN_RULE_SAMPLE = 3;

/**
 * One Condition→Action rule's obedience on one side of the comparison.
 * `label` is resolved by the caller (knowledge ability name); everything
 * else is engine numbers.
 */
export interface RuleComparisonRule {
  ruleId: string;
  /** Display label — demanded ability name (knowledge name). */
  label: string;
  actionKey: string;
  actionAbilityId?: number | undefined;
  decisions: number;
  obeyed: number;
  correct: number;
  suboptimal: number;
  mistake: number;
  unknown: number;
  confidence?: number | undefined;
}

export interface RuleComparisonEntry {
  ruleId: string;
  label: string;
  actionKey: string;
  actionAbilityId?: number | undefined;
  mine: { decisions: number; obeyed: number; adherenceRate?: number | undefined };
  theirs: { decisions: number; obeyed: number; adherenceRate?: number | undefined };
  /** mine rate − theirs rate, in percentage points. Positive = I obeyed more. */
  deltaPp?: number | undefined;
  mineMistakes: number;
  theirsMistakes: number;
  confidence?: number | undefined;
  /** False when either side has fewer than MIN_RULE_SAMPLE decisions. */
  comparable: boolean;
}

export interface RuleComparison {
  /** Sorted by |delta| (biggest gap first), capped. */
  rules: RuleComparisonEntry[];
  capped: boolean;
}

/** Share of decided (non-unknown) decisions that came back `correct`. */
function correctRate(side: VerdictSide): number | undefined {
  const correct = side.breakdown.correct ?? 0;
  const decided = side.decisionCount - (side.breakdown.unknown ?? 0);
  if (decided <= 0) return undefined;
  return round((correct / decided) * 100, 1);
}

export interface ReferenceComparison {
  /**
   * `ok` — both sides parsed and the diff is meaningful.
   * The other values are honest degradations: we say what is missing instead
   * of silently showing a half-empty table.
   */
  status: 'ok' | 'no-reference' | 'player-not-found' | 'no-data';
  /** Plain-language statement of what was and was not compared. */
  notice: string;
  target?: ComparisonTarget | undefined;
  mine: { playerName: string; keyLevel?: number | undefined; durationMs?: number | undefined };
  rows: ComparisonRow[];
  abilities: AbilityComparison[];
  /**
   * Condition→Action verdict distribution on both sides. This is the sharpest
   * "where exactly am I behind" signal the engine can produce, because it
   * classifies every decision rather than only the ones that became findings.
   */
  rotation?: RotationComparison | undefined;
  /**
   * Burst-phase vs filler split on both sides (cast-anchored bucketing).
   * Answers "is the gap in burst windows or in the filler phase" without
   * mixing the two very different playstyles.
   */
  phase?: PhaseComparison | undefined;
  /**
   * Per-rule obedience: "when the condition held, the top player obeyed X%,
   * you obeyed Y%" — the sharpest hand-level comparison the engine can
   * produce, because it aligns the two streams on the same condition buckets
   * instead of comparing aggregate rates.
   */
  rules?: RuleComparison | undefined;
  /** Finding titles only the player hit — the actionable delta. */
  findingsOnlyMine: string[];
  /** Finding titles the reference run hit too — not a differentiator. */
  findingsShared: string[];
}

function perMinute(count: number | undefined, durationMs: number): number | undefined {
  if (count === undefined || !Number.isFinite(count)) return undefined;
  if (durationMs <= 0) return undefined;
  return Math.round((count / (durationMs / 60000)) * 100) / 100;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** (mine - theirs) / theirs, in percent. Undefined when it cannot be formed. */
function deltaPct(mine: number | undefined, theirs: number | undefined): number | undefined {
  if (mine === undefined || theirs === undefined) return undefined;
  if (!Number.isFinite(mine) || !Number.isFinite(theirs) || theirs === 0) return undefined;
  return round((mine / theirs - 1) * 100, 1);
}

function pushRow(
  rows: ComparisonRow[],
  row: {
    key: string;
    label: string;
    unit: ComparisonRow['unit'];
    mine?: number | undefined;
    theirs?: number | undefined;
    better: ComparisonRow['better'];
    note?: string | undefined;
  },
): void {
  const out: ComparisonRow = {
    key: row.key,
    label: row.label,
    unit: row.unit,
    better: row.better,
  };
  if (row.mine !== undefined) out.mine = row.mine;
  if (row.theirs !== undefined) out.theirs = row.theirs;
  const delta = deltaPct(row.mine, row.theirs);
  if (delta !== undefined) out.deltaPct = delta;
  if (row.note !== undefined) out.note = row.note;
  rows.push(out);
}

/**
 * Build the comparison model. Pure: it takes both sides' already-computed
 * scalars and produces the render model, with no I/O and no invention.
 */
export function buildReferenceComparison(input: {
  mine: ComparisonSide;
  theirs: ComparisonSide;
  target: ComparisonTarget;
  /** Keystone level of the player's own run, when it is a Mythic+ fight. */
  mineKeyLevel?: number | undefined;
  /** Verdict digests, when both runs' specs have live knowledge. */
  rotationMine?: VerdictSide | undefined;
  rotationTheirs?: VerdictSide | undefined;
  /** Burst-phase digests, when both runs' specs declare burst anchors. */
  burstMine?: BurstPhaseDigest | undefined;
  burstTheirs?: BurstPhaseDigest | undefined;
  /** Per-rule adherence, when both runs' specs have live knowledge. */
  rulesMine?: RuleComparisonRule[] | undefined;
  rulesTheirs?: RuleComparisonRule[] | undefined;
}): ReferenceComparison {
  const { mine, theirs, target } = input;
  const rows: ComparisonRow[] = [];

  pushRow(rows, {
    key: 'dps',
    label: 'DPS',
    unit: 'amount',
    mine: mine.dps,
    theirs: theirs.dps,
    better: 'higher',
    // Deliberately worded as a confound, not a verdict.
    note:
      target.keyLevel !== undefined && input.mineKeyLevel !== undefined
        ? `两者层数不同（本场 +${input.mineKeyLevel} / 榜首 +${target.keyLevel}），装等与路线差异未剥离`
        : '两场战斗并非同层同条件，差额含装备与路线因素',
  });
  pushRow(rows, {
    key: 'castsPerMin',
    label: '施法次数 / 分钟',
    unit: 'perMin',
    mine: perMinute(mine.totalCasts, mine.durationMs),
    theirs: perMinute(theirs.totalCasts, theirs.durationMs),
    better: 'higher',
  });
  pushRow(rows, {
    key: 'gcdPerMin',
    label: 'GCD 次数 / 分钟',
    unit: 'perMin',
    mine: perMinute(mine.totalGcd, mine.durationMs),
    theirs: perMinute(theirs.totalGcd, theirs.durationMs),
    better: 'higher',
  });
  const idleMine = mine.idlePercent !== undefined ? round(mine.idlePercent * 100, 1) : undefined;
  const idleTheirs =
    theirs.idlePercent !== undefined ? round(theirs.idlePercent * 100, 1) : undefined;
  pushRow(rows, {
    key: 'idle',
    label: '未施法时间占比',
    unit: 'pct',
    mine: idleMine,
    theirs: idleTheirs,
    better: 'lower',
  });

  // ---- per-ability rates
  // Keyed by spell id when both sides have one (the stable identity), falling
  // back to the display name only for the rare id-less entry.
  const abilityKey = (ability: {
    abilityId?: number | undefined;
    name: string;
  }): string =>
    ability.abilityId !== undefined ? `#${ability.abilityId}` : `n:${ability.name}`;

  const names = new Set<string>();
  for (const ability of theirs.abilities) names.add(abilityKey(ability));
  for (const ability of mine.abilities) names.add(abilityKey(ability));

  type Totals = { count: number; name: string; abilityId?: number | undefined };
  const sum = (
    list: ComparisonSide['abilities'],
  ): Map<string, Totals> => {
    const out = new Map<string, Totals>();
    for (const ability of list) {
      const key = abilityKey(ability);
      const existing = out.get(key);
      out.set(key, {
        count: (existing?.count ?? 0) + ability.count,
        name: existing?.name ?? ability.name,
        abilityId: ability.abilityId ?? existing?.abilityId,
      });
    }
    return out;
  };
  const mineByName = sum(mine.abilities);
  const theirsByName = sum(theirs.abilities);

  const abilities: AbilityComparison[] = [];
  for (const key of names) {
    const minePerMin = perMinute(mineByName.get(key)?.count, mine.durationMs);
    const theirsPerMin = perMinute(theirsByName.get(key)?.count, theirs.durationMs);
    if (minePerMin === undefined && theirsPerMin === undefined) continue;
    // Prefer the reference run's spelling (it is the yardstick being shown).
    const name = theirsByName.get(key)?.name ?? mineByName.get(key)?.name ?? key;
    const entry: AbilityComparison = {
      name,
      minePerMin: minePerMin ?? 0,
      theirsPerMin: theirsPerMin ?? 0,
    };
    const abilityId = theirsByName.get(key)?.abilityId ?? mineByName.get(key)?.abilityId;
    if (abilityId !== undefined) entry.abilityId = abilityId;
    const delta = deltaPct(entry.minePerMin, entry.theirsPerMin);
    if (delta !== undefined) entry.deltaPct = delta;
    abilities.push(entry);
  }
  // Sort by the reference run's usage: their rotation defines the yardstick.
  abilities.sort(
    (a, b) => b.theirsPerMin - a.theirsPerMin || b.minePerMin - a.minePerMin,
  );

  // ---- finding diff, keyed by rule id (stable across runs)
  const theirsIds = new Set(theirs.findings.map((f) => f.id));
  const findingsOnlyMine = mine.findings
    .filter((f) => !theirsIds.has(f.id))
    .map((f) => f.title);
  const findingsShared = mine.findings
    .filter((f) => theirsIds.has(f.id))
    .map((f) => f.title);

  const notices = [
    `对照的是同副本同专精的榜首实况（第 ${target.rank} 名：${target.name}` +
      `${target.keyLevel !== undefined ? `，+${target.keyLevel}` : ''}）。`,
    '两场不是同层同条件的对照：层数、装等与路线差异都未剥离，DPS 差额不能单独当作手法差距。',
    '表中只比较「速率」类指标（每分钟次数、占比），因为两场战斗时长不同，绝对次数不可比。',
  ];

  const rotation =
    input.rotationMine !== undefined && input.rotationTheirs !== undefined
      ? buildRotationComparison(input.rotationMine, input.rotationTheirs)
      : undefined;

  const phase =
    input.burstMine !== undefined && input.burstTheirs !== undefined
      ? buildPhaseComparison(input.burstMine, input.burstTheirs)
      : undefined;

  const rules =
    input.rulesMine !== undefined && input.rulesTheirs !== undefined
      ? buildRuleComparison(input.rulesMine, input.rulesTheirs)
      : undefined;

  return {
    status: 'ok',
    notice: notices.join(''),
    target,
    mine: {
      playerName: mine.playerName,
      ...(input.mineKeyLevel !== undefined ? { keyLevel: input.mineKeyLevel } : {}),
      durationMs: mine.durationMs,
    },
    rows,
    abilities: abilities.slice(0, MAX_COMPARE_ABILITIES),
    ...(rotation !== undefined ? { rotation } : {}),
    ...(phase !== undefined ? { phase } : {}),
    ...(rules !== undefined ? { rules } : {}),
    findingsOnlyMine,
    findingsShared,
  };
}

function buildRotationComparison(
  mine: VerdictSide,
  theirs: VerdictSide,
): RotationComparison {
  const out: RotationComparison = {
    comparable: mine.scenario === theirs.scenario && mine.scenario !== 'unknown',
    mine,
    theirs,
  };
  const mineRate = correctRate(mine);
  const theirsRate = correctRate(theirs);
  if (mineRate !== undefined) out.correctRateMine = mineRate;
  if (theirsRate !== undefined) out.correctRateTheirs = theirsRate;
  return out;
}

function buildPhaseComparison(
  mine: BurstPhaseDigest,
  theirs: BurstPhaseDigest,
): PhaseComparison {
  const toSide = (digest: BurstPhaseDigest): PhaseSide => {
    const opened = digest.anchors.reduce((sum, a) => sum + a.castCount, 0);
    const side: PhaseSide = {
      anchors: digest.anchors,
      inBurstDecisions: digest.inBurstDecisions,
      fillerDecisions: digest.fillerDecisions,
      totalBurstMs: digest.totalBurstMs,
    };
    if (digest.inBurstCorrectRate !== undefined) {
      side.inBurstCorrectRate = digest.inBurstCorrectRate;
    }
    if (digest.fillerCorrectRate !== undefined) {
      side.fillerCorrectRate = digest.fillerCorrectRate;
    }
    if (opened > 0 && digest.inBurstDecisions > 0) {
      side.perWindowDecisions = round(digest.inBurstDecisions / opened, 1);
    }
    return side;
  };
  const mineOpened = mine.anchors.some((a) => a.castCount > 0);
  const theirsOpened = theirs.anchors.some((a) => a.castCount > 0);
  return {
    comparable: mineOpened && theirsOpened,
    mine: toSide(mine),
    theirs: toSide(theirs),
  };
}

function adherenceRate(obeyed: number, decisions: number): number | undefined {
  if (decisions <= 0) return undefined;
  return round((obeyed / decisions) * 100, 1);
}

function buildRuleComparison(
  mine: RuleComparisonRule[],
  theirs: RuleComparisonRule[],
): RuleComparison {
  const theirsByRule = new Map(theirs.map((r) => [r.ruleId, r]));
  const ids = new Set<string>();
  for (const r of mine) ids.add(r.ruleId);
  for (const r of theirs) ids.add(r.ruleId);

  const rules: RuleComparisonEntry[] = [];
  for (const ruleId of ids) {
    const m = mine.find((r) => r.ruleId === ruleId);
    const t = theirsByRule.get(ruleId);
    if (m === undefined || t === undefined) continue; // only both-sided rows
    const mineRate = adherenceRate(m.obeyed, m.decisions);
    const theirsRate = adherenceRate(t.obeyed, t.decisions);
    const comparable = m.decisions >= MIN_RULE_SAMPLE && t.decisions >= MIN_RULE_SAMPLE;
    const entry: RuleComparisonEntry = {
      ruleId,
      label: m.label,
      actionKey: m.actionKey,
      mine: {
        decisions: m.decisions,
        obeyed: m.obeyed,
        ...(mineRate !== undefined ? { adherenceRate: mineRate } : {}),
      },
      theirs: {
        decisions: t.decisions,
        obeyed: t.obeyed,
        ...(theirsRate !== undefined ? { adherenceRate: theirsRate } : {}),
      },
      mineMistakes: m.mistake,
      theirsMistakes: t.mistake,
      comparable,
    };
    if (m.actionAbilityId !== undefined) entry.actionAbilityId = m.actionAbilityId;
    if (m.confidence !== undefined) entry.confidence = m.confidence;
    if (comparable && mineRate !== undefined && theirsRate !== undefined) {
      entry.deltaPp = round(mineRate - theirsRate, 1);
    }
    rules.push(entry);
  }

  // Biggest gap first; ties by the reference side's decision count.
  rules.sort(
    (a, b) =>
      Math.abs(b.deltaPp ?? 0) - Math.abs(a.deltaPp ?? 0) ||
      b.theirs.decisions - a.theirs.decisions,
  );

  return { rules, capped: false };
}

/** Assemble a `ReferenceComparison` that explains why nothing could be built. */
export function unavailableComparison(
  status: Exclude<ReferenceComparison['status'], 'ok'>,
  notice: string,
  mine: ReferenceComparison['mine'],
): ReferenceComparison {
  return {
    status,
    notice,
    mine,
    rows: [],
    abilities: [],
    findingsOnlyMine: [],
    findingsShared: [],
  };
}
