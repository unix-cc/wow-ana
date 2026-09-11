import { describe, it, expect } from 'vitest';
import type { ReferenceComparison } from '@wcl/application';
import {
  buildComparisonView,
  MAX_COMPARE_ABILITY_ROWS,
  MAX_COMPARE_FINDINGS,
} from '../src/compare.js';

function comparison(overrides?: Partial<ReferenceComparison>): ReferenceComparison {
  return {
    status: 'ok',
    notice: '对照的是同副本同专精的榜首实况',
    target: {
      name: 'Qingxingood',
      rank: 1,
      amount: 305_872,
      keyLevel: 21,
      rankUrl: 'https://cn.warcraftlogs.com/reports/DykTVdzMJwhvBKm2#fight=28',
      reportCode: 'DykTVdzMJwhvBKm2',
      fightId: 28,
    },
    mine: { playerName: '黑脸法', keyLevel: 10, durationMs: 1_775_000 },
    rows: [
      { key: 'dps', label: 'DPS', unit: 'amount', mine: 176_561, theirs: 298_876, deltaPct: -40.9, better: 'higher', note: '层数不同' },
      { key: 'idle', label: '未施法时间占比', unit: 'pct', mine: 72.6, theirs: 62.7, deltaPct: 15.8, better: 'lower' },
    ],
    abilities: [{ name: '奥术飞弹', minePerMin: 11.97, theirsPerMin: 13.45, deltaPct: -11 }],
    findingsOnlyMine: ['涌动 使用存在延迟'],
    findingsShared: ['飞弹 vs 涌动：失误'],
    ...overrides,
  };
}

describe('buildComparisonView', () => {
  it('projects the model into the render shape', () => {
    const view = buildComparisonView(comparison());
    expect(view.status).toBe('ok');
    expect(view.target?.name).toBe('Qingxingood');
    // The engine calls it rankUrl; the card calls it runUrl (it links a run).
    expect(view.target?.runUrl).toBe(
      'https://cn.warcraftlogs.com/reports/DykTVdzMJwhvBKm2#fight=28',
    );
    expect(view.rows).toHaveLength(2);
    expect(view.mine.keyLevel).toBe(10);
  });

  it('drops undefined optionals instead of emitting nulls', () => {
    const view = buildComparisonView(
      comparison({
        target: { name: 'X', rank: 1, amount: 1 },
        mine: { playerName: '我' },
        rows: [{ key: 'dps', label: 'DPS', unit: 'amount', better: 'higher' }],
      }),
    );
    expect('keyLevel' in (view.target ?? {})).toBe(false);
    expect('runUrl' in (view.target ?? {})).toBe(false);
    expect('durationMs' in view.mine).toBe(false);
    const row = view.rows[0];
    expect(row !== undefined && 'mine' in row).toBe(false);
    expect(row !== undefined && 'deltaPct' in row).toBe(false);
  });

  it('caps the ability table and both finding buckets', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      name: `技能${i}`,
      minePerMin: i,
      theirsPerMin: i + 1,
    }));
    const view = buildComparisonView(
      comparison({
        abilities: many,
        findingsOnlyMine: Array.from({ length: 40 }, (_, i) => `only${i}`),
        findingsShared: Array.from({ length: 40 }, (_, i) => `shared${i}`),
      }),
    );
    expect(view.abilities).toHaveLength(MAX_COMPARE_ABILITY_ROWS);
    expect(view.findingsOnlyMine).toHaveLength(MAX_COMPARE_FINDINGS);
    expect(view.findingsShared).toHaveLength(MAX_COMPARE_FINDINGS);
  });

  it('flattens the rotation comparison and keeps the scenario verdict', () => {
    const view = buildComparisonView(
      comparison({
        rotation: {
          comparable: false,
          mine: { scenario: 'st', decisionCount: 888, breakdown: { correct: 222, unknown: 518 } },
          theirs: { scenario: 'aoe', decisionCount: 1139, breakdown: { correct: 229, unknown: 748 } },
          correctRateMine: 60,
          correctRateTheirs: 58.6,
        },
      }),
    );
    expect(view.rotation?.comparable).toBe(false);
    expect(view.rotation?.scenarioMine).toBe('st');
    expect(view.rotation?.scenarioTheirs).toBe('aoe');
    expect(view.rotation?.correctRateMine).toBe(60);
    expect(view.rotation?.breakdownTheirs.correct).toBe(229);
  });

  it('passes a degraded status through with an empty table', () => {
    const view = buildComparisonView(
      comparison({
        status: 'player-not-found',
        notice: '名单里没有同名玩家',
        target: undefined,
        rows: [],
        abilities: [],
        findingsOnlyMine: [],
        findingsShared: [],
      }),
    );
    expect(view.status).toBe('player-not-found');
    expect(view.target).toBeUndefined();
    expect(view.rows).toEqual([]);
    expect(view.notice).toContain('同名玩家');
  });
});
