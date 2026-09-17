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

  it('splits burst vs filler phases when both sides declare burst anchors', () => {
    const burst = (overrides = {}) => ({
      anchors: [
        { key: 'arcane_surge', name: '涌动 (Arcane Surge)', castCount: 3, durationMs: 6_000 },
      ],
      inBurstDecisions: 21,
      fillerDecisions: 300,
      totalBurstMs: 18_000,
      inBurstCorrectRate: 85.7,
      fillerCorrectRate: 90.2,
      ...overrides,
    });

    const comparison = buildReferenceComparison({
      mine: side(),
      theirs: side(),
      target,
      burstMine: burst(),
      burstTheirs: burst({ inBurstCorrectRate: 97.5, inBurstDecisions: 24 }),
    });

    expect(comparison.phase).toBeDefined();
    expect(comparison.phase?.comparable).toBe(true);
    expect(comparison.phase?.mine.perWindowDecisions).toBe(7); // 21/3
    expect(comparison.phase?.mine.inBurstCorrectRate).toBe(85.7);
    expect(comparison.phase?.theirs.inBurstCorrectRate).toBe(97.5);
    expect(comparison.phase?.theirs.perWindowDecisions).toBe(8); // 24/3
    expect(comparison.phase?.mine.anchors[0]?.castCount).toBe(3);
  });

  it('marks the phase comparison non-comparable when one side never cast a burst', () => {
    const comparison = buildReferenceComparison({
      mine: side(),
      theirs: side(),
      target,
      burstMine: {
        anchors: [
          { key: 'avatar', name: '天神下凡 (Avatar)', castCount: 4, durationMs: 20_000 },
        ],
        inBurstDecisions: 60,
        fillerDecisions: 200,
        totalBurstMs: 80_000,
      },
      burstTheirs: {
        anchors: [
          { key: 'avatar', name: '天神下凡 (Avatar)', castCount: 0, durationMs: 20_000 },
        ],
        inBurstDecisions: 0,
        fillerDecisions: 250,
        totalBurstMs: 0,
      },
    });

    // Zero-cast side may simply not have the talent — honest non-comparison,
    // not a false accusation.
    expect(comparison.phase?.comparable).toBe(false);
    expect(comparison.phase?.theirs.perWindowDecisions).toBeUndefined();
  });

  it('omits the phase block when either digest is missing', () => {
    const burst = {
      anchors: [{ key: 'arcane_surge', name: '涌动', castCount: 2, durationMs: 6_000 }],
      inBurstDecisions: 14,
      fillerDecisions: 200,
      totalBurstMs: 12_000,
    };
    const comparison = buildReferenceComparison({
      mine: side(),
      theirs: side(),
      target,
      burstMine: burst,
      // burstTheirs absent — e.g. the reference spec declares no anchors
    });
    expect(comparison.phase).toBeUndefined();
  });

  it('aligns the two streams on the same condition buckets (per-rule obedience)', () => {
    const mineRules = [
      {
        ruleId: 'arcane.barrage_salvo25',
        label: '弹幕 (Arcane Barrage)',
        actionKey: 'arcane_barrage',
        decisions: 10,
        obeyed: 5,
        correct: 5,
        suboptimal: 3,
        mistake: 2,
        unknown: 0,
        confidence: 0.8,
      },
      {
        ruleId: 'arcane.soul_barrage',
        label: '弹幕 (Arcane Barrage)',
        actionKey: 'arcane_barrage',
        decisions: 4,
        obeyed: 4,
        correct: 4,
        suboptimal: 0,
        mistake: 0,
        unknown: 0,
        confidence: 0.8,
      },
    ];
    const theirsRules = [
      {
        ruleId: 'arcane.barrage_salvo25',
        label: '弹幕 (Arcane Barrage)',
        actionKey: 'arcane_barrage',
        decisions: 20,
        obeyed: 19,
        correct: 19,
        suboptimal: 1,
        mistake: 0,
        unknown: 0,
        confidence: 0.8,
      },
      {
        ruleId: 'arcane.soul_barrage',
        label: '弹幕 (Arcane Barrage)',
        actionKey: 'arcane_barrage',
        decisions: 6,
        obeyed: 6,
        correct: 6,
        suboptimal: 0,
        mistake: 0,
        unknown: 0,
        confidence: 0.8,
      },
    ];

    const comparison = buildReferenceComparison({
      mine: side(),
      theirs: side(),
      target,
      rulesMine: mineRules,
      rulesTheirs: theirsRules,
    });

    expect(comparison.rules).toBeDefined();
    const salvo = comparison.rules?.rules.find(
      (r) => r.ruleId === 'arcane.barrage_salvo25',
    );
    expect(salvo?.mine.adherenceRate).toBe(50); // 5/10
    expect(salvo?.theirs.adherenceRate).toBe(95); // 19/20
    expect(salvo?.deltaPp).toBe(-45);
    expect(salvo?.comparable).toBe(true);
    expect(salvo?.label).toBe('弹幕 (Arcane Barrage)');
    // Biggest gap first.
    expect(comparison.rules?.rules[0]?.ruleId).toBe('arcane.barrage_salvo25');
  });

  it('gates rule rows below the sample minimum from deltas', () => {
    const comparison = buildReferenceComparison({
      mine: side(),
      theirs: side(),
      target,
      rulesMine: [
        {
          ruleId: 'r1',
          label: 'A',
          actionKey: 'a',
          decisions: 2,
          obeyed: 1,
          correct: 1,
          suboptimal: 0,
          mistake: 1,
          unknown: 0,
          confidence: 0.9,
        },
      ],
      rulesTheirs: [
        {
          ruleId: 'r1',
          label: 'A',
          actionKey: 'a',
          decisions: 5,
          obeyed: 5,
          correct: 5,
          suboptimal: 0,
          mistake: 0,
          unknown: 0,
          confidence: 0.9,
        },
      ],
    });
    const row = comparison.rules?.rules[0];
    expect(row?.comparable).toBe(false);
    expect(row?.deltaPp).toBeUndefined();
    // Rates still shown (they are facts), only the delta is withheld.
    expect(row?.mine.adherenceRate).toBe(50);
  });

  it('omits the rules block when either side has no adherence digest', () => {
    const comparison = buildReferenceComparison({
      mine: side(),
      theirs: side(),
      target,
    });
    expect(comparison.rules).toBeUndefined();
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
