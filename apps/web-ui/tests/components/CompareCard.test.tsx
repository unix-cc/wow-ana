// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompareCard } from '../../src/components/CompareCard';
import { ReferenceCard } from '../../src/components/ReferenceCard';
import type { ComparisonView } from '../../src/types';

function comparison(overrides?: Partial<ComparisonView>): ComparisonView {
  return {
    status: 'ok',
    notice:
      '对照的是同副本同专精的榜首实况（第 1 名：Qingxingood，+21）。' +
      '两场不是同层同条件的对照：层数、装等与路线差异都未剥离，DPS 差额不能单独当作手法差距。' +
      '表中只比较「速率」类指标（每分钟次数、占比），因为两场战斗时长不同，绝对次数不可比。',
    target: {
      name: 'Qingxingood',
      rank: 1,
      keyLevel: 21,
      amount: 305_872,
      runUrl: 'https://cn.warcraftlogs.com/reports/DykTVdzMJwhvBKm2#fight=28',
    },
    mine: { playerName: '黑脸法', keyLevel: 10, durationMs: 1_775_000 },
    rows: [
      {
        key: 'dps',
        label: 'DPS',
        unit: 'amount',
        mine: 176_561,
        theirs: 298_876,
        deltaPct: -40.9,
        better: 'higher',
        note: '两者层数不同（本场 +10 / 榜首 +21），装等与路线差异未剥离',
      },
      {
        key: 'idle',
        label: '未施法时间占比',
        unit: 'pct',
        mine: 72.6,
        theirs: 62.7,
        deltaPct: 15.8,
        better: 'lower',
      },
    ],
    abilities: [
      { name: '奥术飞弹', minePerMin: 11.97, theirsPerMin: 13.45, deltaPct: -11 },
      { name: '奥术弹幕', minePerMin: 9.94, theirsPerMin: 12.06, deltaPct: -17.6 },
    ],
    findingsOnlyMine: ['涌动 使用存在延迟'],
    findingsShared: ['飞弹 vs 涌动：失误'],
    ...overrides,
  };
}

describe('CompareCard', () => {
  it('renders both players, the rate table and the honest caveats', () => {
    render(<CompareCard comparison={comparison()} />);

    expect(screen.getByText('榜首逐场对标')).toBeTruthy();
    expect(screen.getByText(/第 1 名 Qingxingood/)).toBeTruthy();
    expect(screen.getByText(/我：黑脸法/)).toBeTruthy();
    // Rate table, with the engine's numbers verbatim.
    expect(screen.getByText('176561')).toBeTruthy();
    expect(screen.getByText('298876')).toBeTruthy();
    expect(screen.getByText('-40.9%')).toBeTruthy();
    // The key-level confound is stated, never implied away.
    expect(screen.getByText(/装等与路线差异未剥离/)).toBeTruthy();
    expect(screen.getByText(/不能单独当作手法差距/)).toBeTruthy();
  });

  it('links the reference run in the card header with safe rel/target', () => {
    render(<CompareCard comparison={comparison()} />);
    const link = screen.getByText('打开榜首那一场 ↗');
    expect(link.getAttribute('href')).toBe(
      'https://cn.warcraftlogs.com/reports/DykTVdzMJwhvBKm2#fight=28',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    // Placement is part of the contract: it must sit in the header, beside the
    // name it refers to — not at the bottom of a long card.
    expect(link.closest('.compare-head')).not.toBeNull();
  });

  it('also offers the permalink when the comparison failed, if it knows the run', () => {
    render(
      <CompareCard
        comparison={comparison({
          status: 'no-data',
          notice: '拉取榜首的战斗数据失败。',
          rows: [],
          abilities: [],
          findingsOnlyMine: [],
          findingsShared: [],
        })}
      />,
    );
    const link = screen.getByText('打开榜首那一场 ↗');
    expect(link.closest('.compare-head')).not.toBeNull();
  });

  it('warns instead of comparing verdicts when scenarios differ', () => {
    render(
      <CompareCard
        comparison={comparison({
          rotation: {
            comparable: false,
            scenarioMine: 'st',
            scenarioTheirs: 'aoe',
            decisionCountMine: 888,
            decisionCountTheirs: 1139,
            breakdownMine: { correct: 222, mistake: 21, unknown: 518 },
            breakdownTheirs: { correct: 229, mistake: 13, unknown: 748 },
            correctRateMine: 60,
            correctRateTheirs: 58.6,
          },
        })}
      />,
    );
    expect(screen.getByText(/判定档不可直接横比/)).toBeTruthy();
    expect(screen.getByText(/我 单目标/)).toBeTruthy();
  });

  it('explains an empty difference instead of showing an empty list', () => {
    render(
      <CompareCard
        comparison={comparison({ findingsOnlyMine: [], findingsShared: ['A', 'B'] })}
      />,
    );
    expect(screen.getByText(/没有「只有我有」的条目/)).toBeTruthy();
  });

  it('degrades honestly when the comparison could not be built', () => {
    render(
      <CompareCard
        comparison={comparison({
          status: 'player-not-found',
          notice: '打开了榜首的报告，但参战名单里找不到同名玩家。',
          rows: [],
          abilities: [],
          findingsOnlyMine: [],
          findingsShared: [],
        })}
      />,
    );
    expect(screen.getByText('未能完成')).toBeTruthy();
    expect(screen.getByText(/找不到同名玩家/)).toBeTruthy();
    // No fabricated table.
    expect(screen.queryByText('差距')).toBeNull();
  });
});

describe('CompareCard burst phase', () => {
  const phase = {
    comparable: true,
    anchorsMine: [{ name: '涌动 (Arcane Surge)', castCount: 12 }],
    anchorsTheirs: [{ name: '涌动 (Arcane Surge)', castCount: 15 }],
    inBurstDecisionsMine: 84,
    inBurstDecisionsTheirs: 110,
    fillerDecisionsMine: 541,
    fillerDecisionsTheirs: 702,
    perWindowDecisionsMine: 7.0,
    perWindowDecisionsTheirs: 7.3,
    inBurstCorrectRateMine: 74.2,
    inBurstCorrectRateTheirs: 93.1,
    fillerCorrectRateMine: 88.4,
    fillerCorrectRateTheirs: 89.5,
  };

  it('renders the burst-vs-filler phase table when the comparison carries it', () => {
    render(<CompareCard comparison={comparison({ phase })} />);
    expect(screen.getByText('爆发期 vs 非爆发期手法')).toBeTruthy();
    expect(screen.getByText(/每次爆发窗口的决策数/)).toBeTruthy();
    expect(screen.getByText('爆发期内正确率')).toBeTruthy();
    expect(screen.getByText('74.2%')).toBeTruthy();
    expect(screen.getByText('93.1%')).toBeTruthy();
    expect(screen.getByText(/涌动 \(Arcane Surge\) ×12/)).toBeTruthy();
    expect(screen.getByText(/涌动 \(Arcane Surge\) ×15/)).toBeTruthy();
    // Honest caveat: the window is cast-anchored with knowledge durations.
    expect(screen.getByText(/只用于分桶/)).toBeTruthy();
  });

  it('explains non-comparable phases as a talent-shape difference, not a verdict', () => {
    render(
      <CompareCard
        comparison={comparison({
          phase: { ...phase, comparable: false, anchorsTheirs: [] },
        })}
      />,
    );
    expect(screen.getByText(/天赋构型差异/)).toBeTruthy();
    expect(screen.getByText(/不是手法定责/)).toBeTruthy();
  });
});

describe('CompareCard rule adherence', () => {
  const rules = {
    rules: [
      {
        ruleId: 'arcane.barrage_salvo25',
        label: '弹幕 (Arcane Barrage)',
        mineDecisions: 10,
        mineAdherenceRate: 50,
        theirsDecisions: 20,
        theirsAdherenceRate: 95,
        deltaPp: -45,
        mineMistakes: 2,
        theirsMistakes: 0,
        confidence: 0.8,
        comparable: true,
      },
      {
        ruleId: 'arcane.surge_low_sample',
        label: '涌动 (Arcane Surge)',
        mineDecisions: 2,
        mineAdherenceRate: 50,
        theirsDecisions: 2,
        theirsAdherenceRate: 100,
        mineMistakes: 0,
        theirsMistakes: 0,
        confidence: 0.7,
        comparable: false,
      },
    ],
  };

  it('renders the per-rule obedience table with rates and deltas', () => {
    render(<CompareCard comparison={comparison({ rules })} />);
    expect(screen.getByText('规则遵守度（条件出现时，是否打了该打的技能）')).toBeTruthy();
    expect(screen.getByText('弹幕 (Arcane Barrage)')).toBeTruthy();
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
    expect(screen.getByText('95%')).toBeTruthy();
    expect(screen.getByText('-45pp')).toBeTruthy();
    expect(screen.getByText('失误 2/0')).toBeTruthy();
  });

  it('labels below-sample rows as 样本少 instead of inventing a delta', () => {
    render(<CompareCard comparison={comparison({ rules })} />);
    expect(screen.getAllByText('样本少').length).toBeGreaterThan(0);
    expect(screen.queryByText('-50pp')).toBeNull();
  });
});

describe('ReferenceCard compare trigger', () => {
  const reference = {
    encounterName: '诸王之眠',
    metric: 'dps',
    className: 'Mage',
    specName: 'Arcane',
    count: 10,
    stats: { p50: 300_000 },
    topRuns: [
      {
        name: 'Qingxingood',
        amount: 305_872,
        keyLevel: 21,
        runUrl: 'https://cn.warcraftlogs.com/reports/DykTVdzMJwhvBKm2#fight=28',
      },
    ],
  };

  it('offers the comparison button when a handler is provided', () => {
    const onCompare = vi.fn();
    render(<ReferenceCard reference={reference} onCompare={onCompare} />);
    fireEvent.click(screen.getByText(/与榜首逐场对比/));
    expect(onCompare).toHaveBeenCalledTimes(1);
  });

  it('hides the button when there is no handler (e.g. no baseline)', () => {
    render(<ReferenceCard reference={reference} />);
    expect(screen.queryByText(/与榜首逐场对比/)).toBeNull();
  });
});
