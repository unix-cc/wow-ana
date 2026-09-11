import { describe, it, expect } from 'vitest';
import {
  buildReferenceComparison,
  unavailableComparison,
  MAX_COMPARE_ABILITIES,
  type ComparisonSide,
} from '../src/reference-compare.js';

function side(overrides?: Partial<ComparisonSide>): ComparisonSide {
  return {
    playerName: '我',
    durationMs: 600_000, // 10 minutes → a count of 100 is exactly 10/min
    dps: 100_000,
    totalCasts: 400,
    totalGcd: 200,
    idlePercent: 0.5,
    abilities: [{ name: '奥术飞弹', abilityId: 5143, count: 100 }],
    findings: [],
    ...overrides,
  };
}

const target = {
  name: '榜首',
  rank: 1,
  amount: 200_000,
  keyLevel: 21,
  reportCode: 'ABC',
  fightId: 4,
};

describe('buildReferenceComparison', () => {
  it('normalises counts to per-minute rates so different fight lengths compare', () => {
    const comparison = buildReferenceComparison({
      mine: side({ durationMs: 300_000, totalCasts: 100 }), // 5 min → 20/min
      theirs: side({ durationMs: 600_000, totalCasts: 240 }), // 10 min → 24/min
      target,
    });

    const casts = comparison.rows.find((row) => row.key === 'castsPerMin');
    expect(casts?.mine).toBe(20);
    expect(casts?.theirs).toBe(24);
    expect(casts?.deltaPct).toBe(-16.7);
  });

  it('expresses the DPS gap but always labels the key-level confound', () => {
    const comparison = buildReferenceComparison({
      mine: side({ dps: 150_000 }),
      theirs: side({ dps: 300_000 }),
      target,
      mineKeyLevel: 10,
    });

    const dps = comparison.rows.find((row) => row.key === 'dps');
    expect(dps?.deltaPct).toBe(-50);
    // The honest caveat is mandatory, not a nice-to-have.
    expect(dps?.note).toContain('+10');
    expect(dps?.note).toContain('+21');
    expect(comparison.notice).toContain('不能单独当作手法差距');
  });

  it('marks idle time as "lower is better"', () => {
    const comparison = buildReferenceComparison({
      mine: side({ idlePercent: 0.6 }),
      theirs: side({ idlePercent: 0.4 }),
      target,
    });
    const idle = comparison.rows.find((row) => row.key === 'idle');
    expect(idle?.better).toBe('lower');
    expect(idle?.mine).toBe(60);
    expect(idle?.theirs).toBe(40);
  });

  it('merges ability rows by spell id and sorts by the reference run rate', () => {
    const comparison = buildReferenceComparison({
      mine: side({
        abilities: [
          { name: '奥术飞弹', abilityId: 5143, count: 50 },
          { name: '奥术弹幕', abilityId: 44425, count: 10 },
        ],
      }),
      theirs: side({
        abilities: [
          { name: '奥术飞弹', abilityId: 5143, count: 100 },
          { name: '奥术冲击', abilityId: 30451, count: 80 },
        ],
      }),
      target,
    });

    expect(comparison.abilities.map((a) => a.name)).toEqual([
      '奥术飞弹', // 10/min on their side — highest
      '奥术冲击',
      '奥术弹幕',
    ]);
    // A missing ability reads as 0/min, not as "absent from the table".
    expect(comparison.abilities[2]?.minePerMin).toBe(1);
    expect(comparison.abilities[2]?.theirsPerMin).toBe(0);
  });

  it('sums split rows for the same ability id', () => {
    const comparison = buildReferenceComparison({
      mine: side({
        abilities: [
          { name: '奥术齐射', abilityId: 384452, count: 30 },
          { name: '奥术齐射', abilityId: 384452, count: 30 },
        ],
      }),
      theirs: side({ abilities: [{ name: '奥术齐射', abilityId: 384452, count: 60 }] }),
      target,
    });
    expect(comparison.abilities[0]?.minePerMin).toBe(6);
    expect(comparison.abilities[0]?.theirsPerMin).toBe(6);
  });

  it('caps the ability table', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      name: `技能${i}`,
      abilityId: 1000 + i,
      count: 20 - i,
    }));
    const comparison = buildReferenceComparison({
      mine: side({ abilities: [] }),
      theirs: side({ abilities: many }),
      target,
    });
    expect(comparison.abilities).toHaveLength(MAX_COMPARE_ABILITIES);
  });

  it('diffs findings by rule id, separating the actionable delta', () => {
    const comparison = buildReferenceComparison({
      mine: side({
        findings: [
          { id: 'arcane.surge_delay', title: '涌动 使用存在延迟' },
          { id: 'arcane.missiles_priority', title: '飞弹 vs 涌动：失误' },
        ],
      }),
      theirs: side({
        findings: [{ id: 'arcane.missiles_priority', title: '飞弹 vs 涌动：失误' }],
      }),
      target,
    });

    expect(comparison.findingsOnlyMine).toEqual(['涌动 使用存在延迟']);
    expect(comparison.findingsShared).toEqual(['飞弹 vs 涌动：失误']);
  });

  it('only calls the verdict distributions comparable in the same scenario', () => {
    const same = buildReferenceComparison({
      mine: side(),
      theirs: side(),
      target,
      rotationMine: {
        scenario: 'aoe',
        decisionCount: 100,
        breakdown: { correct: 60, suboptimal: 20, mistake: 5, unknown: 15 },
      },
      rotationTheirs: {
        scenario: 'aoe',
        decisionCount: 200,
        breakdown: { correct: 160, suboptimal: 20, mistake: 5, unknown: 15 },
      },
    });
    expect(same.rotation?.comparable).toBe(true);
    // unknown (15) is excluded from the denominator.
    expect(same.rotation?.correctRateMine).toBe(70.6);
    expect(same.rotation?.correctRateTheirs).toBe(86.5);

    const different = buildReferenceComparison({
      mine: side(),
      theirs: side(),
      target,
      rotationMine: { scenario: 'st', decisionCount: 100, breakdown: { correct: 60 } },
      rotationTheirs: { scenario: 'aoe', decisionCount: 100, breakdown: { correct: 60 } },
    });
    expect(different.rotation?.comparable).toBe(false);
  });

  it('omits the rotation block entirely when a digest is missing', () => {
    const comparison = buildReferenceComparison({
      mine: side(),
      theirs: side(),
      target,
    });
    expect(comparison.rotation).toBeUndefined();
  });

  it('never invents a delta when the other side is zero', () => {
    const comparison = buildReferenceComparison({
      mine: side({ dps: 100_000 }),
      theirs: side({ dps: 0 }),
      target,
    });
    const dps = comparison.rows.find((row) => row.key === 'dps');
    expect(dps?.deltaPct).toBeUndefined();
  });
});

describe('unavailableComparison', () => {
  it('carries the status, a plain-language reason and an empty table', () => {
    const comparison = unavailableComparison('player-not-found', '名单里没有同名玩家', {
      playerName: '我',
    });
    expect(comparison.status).toBe('player-not-found');
    expect(comparison.notice).toContain('名单里没有同名玩家');
    expect(comparison.rows).toEqual([]);
    expect(comparison.abilities).toEqual([]);
    expect(comparison.target).toBeUndefined();
  });
});
