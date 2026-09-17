import type { ReferenceComparison } from '@wcl/application';

/**
 * Render projection for the head-to-head comparison (Phase AF).
 *
 * Same contract as `artifact.ts`: the structured side of a turn is built
 * deterministically from the engine's output, never from model text. Caps are
 * mandatory — the comparison is shipped over SSE and rendered as a table, so a
 * pathological run must not be able to blow up the frame or the DOM.
 */

/** Ability rows kept (the engine already caps at MAX_COMPARE_ABILITIES). */
export const MAX_COMPARE_ABILITY_ROWS = 8;
/** Finding titles kept per bucket. */
export const MAX_COMPARE_FINDINGS = 8;

export interface ComparisonRowView {
  key: string;
  label: string;
  unit: 'perMin' | 'pct' | 'amount' | 'number';
  mine?: number | undefined;
  theirs?: number | undefined;
  deltaPct?: number | undefined;
  better: 'higher' | 'lower' | 'neutral';
  note?: string | undefined;
}

export interface ComparisonView {
  status: ReferenceComparison['status'];
  notice: string;
  target?:
    | {
        name: string;
        rank: number;
        keyLevel?: number | undefined;
        amount: number;
        runUrl?: string | undefined;
        reportCode?: string | undefined;
        fightId?: number | undefined;
      }
    | undefined;
  mine: {
    playerName: string;
    keyLevel?: number | undefined;
    durationMs?: number | undefined;
  };
  rows: ComparisonRowView[];
  abilities: Array<{
    name: string;
    minePerMin: number;
    theirsPerMin: number;
    deltaPct?: number | undefined;
  }>;
  rotation?:
    | {
        comparable: boolean;
        scenarioMine: string;
        scenarioTheirs: string;
        decisionCountMine: number;
        decisionCountTheirs: number;
        breakdownMine: Record<string, number>;
        breakdownTheirs: Record<string, number>;
        correctRateMine?: number | undefined;
        correctRateTheirs?: number | undefined;
      }
    | undefined;
  /** Burst-vs-filler phase split (cast-anchored bucketing). */
  phase?:
    | {
        comparable: boolean;
        anchorsMine: Array<{ name: string; castCount: number }>;
        anchorsTheirs: Array<{ name: string; castCount: number }>;
        inBurstDecisionsMine: number;
        inBurstDecisionsTheirs: number;
        fillerDecisionsMine: number;
        fillerDecisionsTheirs: number;
        perWindowDecisionsMine?: number | undefined;
        perWindowDecisionsTheirs?: number | undefined;
        inBurstCorrectRateMine?: number | undefined;
        inBurstCorrectRateTheirs?: number | undefined;
        fillerCorrectRateMine?: number | undefined;
        fillerCorrectRateTheirs?: number | undefined;
      }
    | undefined;
  /** Per-rule obedience: condition held → how often the demanded action. */
  rules?:
    | {
        rules: Array<{
          ruleId: string;
          label: string;
          mineDecisions: number;
          mineAdherenceRate?: number | undefined;
          theirsDecisions: number;
          theirsAdherenceRate?: number | undefined;
          deltaPp?: number | undefined;
          mineMistakes: number;
          theirsMistakes: number;
          confidence?: number | undefined;
          comparable: boolean;
        }>;
      }
    | undefined;
  findingsOnlyMine: string[];
  findingsShared: string[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Project the application-layer comparison into the render model. Pure and
 * total: missing data is omitted, never invented.
 */
export function buildComparisonView(
  comparison: ReferenceComparison,
): ComparisonView {
  const view: ComparisonView = {
    status: comparison.status,
    notice: comparison.notice,
    mine: {
      playerName: comparison.mine.playerName,
      ...(comparison.mine.keyLevel !== undefined
        ? { keyLevel: comparison.mine.keyLevel }
        : {}),
      ...(comparison.mine.durationMs !== undefined
        ? { durationMs: comparison.mine.durationMs }
        : {}),
    },
    rows: comparison.rows.map((row) => {
      const out: ComparisonRowView = {
        key: row.key,
        label: row.label,
        unit: row.unit,
        better: row.better,
      };
      if (isFiniteNumber(row.mine)) out.mine = row.mine;
      if (isFiniteNumber(row.theirs)) out.theirs = row.theirs;
      if (isFiniteNumber(row.deltaPct)) out.deltaPct = row.deltaPct;
      if (row.note !== undefined) out.note = row.note;
      return out;
    }),
    abilities: comparison.abilities.slice(0, MAX_COMPARE_ABILITY_ROWS).map((a) => {
      const out: ComparisonView['abilities'][number] = {
        name: a.name,
        minePerMin: a.minePerMin,
        theirsPerMin: a.theirsPerMin,
      };
      if (isFiniteNumber(a.deltaPct)) out.deltaPct = a.deltaPct;
      return out;
    }),
    findingsOnlyMine: comparison.findingsOnlyMine.slice(0, MAX_COMPARE_FINDINGS),
    findingsShared: comparison.findingsShared.slice(0, MAX_COMPARE_FINDINGS),
  };

  if (comparison.target !== undefined) {
    view.target = {
      name: comparison.target.name,
      rank: comparison.target.rank,
      amount: comparison.target.amount,
      ...(comparison.target.keyLevel !== undefined
        ? { keyLevel: comparison.target.keyLevel }
        : {}),
      ...(comparison.target.rankUrl !== undefined
        ? { runUrl: comparison.target.rankUrl }
        : {}),
      ...(comparison.target.reportCode !== undefined
        ? { reportCode: comparison.target.reportCode }
        : {}),
      ...(comparison.target.fightId !== undefined
        ? { fightId: comparison.target.fightId }
        : {}),
    };
  }

  if (comparison.rotation !== undefined) {
    const r = comparison.rotation;
    view.rotation = {
      comparable: r.comparable,
      scenarioMine: r.mine.scenario,
      scenarioTheirs: r.theirs.scenario,
      decisionCountMine: r.mine.decisionCount,
      decisionCountTheirs: r.theirs.decisionCount,
      breakdownMine: r.mine.breakdown,
      breakdownTheirs: r.theirs.breakdown,
      ...(r.correctRateMine !== undefined ? { correctRateMine: r.correctRateMine } : {}),
      ...(r.correctRateTheirs !== undefined
        ? { correctRateTheirs: r.correctRateTheirs }
        : {}),
    };
  }

  if (comparison.phase !== undefined) {
    const p = comparison.phase;
    view.phase = {
      comparable: p.comparable,
      anchorsMine: p.mine.anchors.map((a) => ({ name: a.name, castCount: a.castCount })),
      anchorsTheirs: p.theirs.anchors.map((a) => ({ name: a.name, castCount: a.castCount })),
      inBurstDecisionsMine: p.mine.inBurstDecisions,
      inBurstDecisionsTheirs: p.theirs.inBurstDecisions,
      fillerDecisionsMine: p.mine.fillerDecisions,
      fillerDecisionsTheirs: p.theirs.fillerDecisions,
      ...(p.mine.perWindowDecisions !== undefined
        ? { perWindowDecisionsMine: p.mine.perWindowDecisions }
        : {}),
      ...(p.theirs.perWindowDecisions !== undefined
        ? { perWindowDecisionsTheirs: p.theirs.perWindowDecisions }
        : {}),
      ...(p.mine.inBurstCorrectRate !== undefined
        ? { inBurstCorrectRateMine: p.mine.inBurstCorrectRate }
        : {}),
      ...(p.theirs.inBurstCorrectRate !== undefined
        ? { inBurstCorrectRateTheirs: p.theirs.inBurstCorrectRate }
        : {}),
      ...(p.mine.fillerCorrectRate !== undefined
        ? { fillerCorrectRateMine: p.mine.fillerCorrectRate }
        : {}),
      ...(p.theirs.fillerCorrectRate !== undefined
        ? { fillerCorrectRateTheirs: p.theirs.fillerCorrectRate }
        : {}),
    };
  }

  if (comparison.rules !== undefined) {
    view.rules = {
      rules: comparison.rules.rules.map((r) => {
        const out: NonNullable<ComparisonView['rules']>['rules'][number] = {
          ruleId: r.ruleId,
          label: r.label,
          mineDecisions: r.mine.decisions,
          theirsDecisions: r.theirs.decisions,
          mineMistakes: r.mineMistakes,
          theirsMistakes: r.theirsMistakes,
          comparable: r.comparable,
        };
        if (isFiniteNumber(r.mine.adherenceRate)) out.mineAdherenceRate = r.mine.adherenceRate;
        if (isFiniteNumber(r.theirs.adherenceRate)) out.theirsAdherenceRate = r.theirs.adherenceRate;
        if (isFiniteNumber(r.deltaPp)) out.deltaPp = r.deltaPp;
        if (isFiniteNumber(r.confidence)) out.confidence = r.confidence;
        return out;
      }),
    };
  }

  return view;
}
