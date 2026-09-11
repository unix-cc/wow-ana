import { describe, it, expect } from 'vitest';
import type { PriorityRule } from '@wcl/spec-knowledge';
import type { DecisionState, ObservedDecision } from '../src/priority/types.js';
import { evaluatePriority, resolveScenario } from '../src/priority/evaluator.js';
import { ARCANE_MAGE_KNOWLEDGE } from '@wcl/spec-knowledge';
import {
  makePriorityKnowledge,
  TEST_ABILITIES,
  TEST_BUFFS,
  TEST_RESOURCES,
  TEST_SOURCE,
  fillerRule,
} from './priority-fixtures.js';

function makeState(overrides: Partial<DecisionState> = {}): DecisionState {
  return {
    time: 0,
    buffsActive: new Set<string>(),
    buffStacks: new Map<string, number>(),
    ready: new Set<string>(),
    resource: 100,
    targetCount: 1,
    observable: { buff: true, resource: true, targetCount: true },
    ...overrides,
  };
}

function decision(
  actualKey: string,
  state: DecisionState,
  overrides: Partial<ObservedDecision> = {},
): ObservedDecision {
  return { time: state.time, actualKey, state, ...overrides };
}

function rule(overrides: Partial<PriorityRule> & Pick<PriorityRule, 'id' | 'action'>): PriorityRule {
  return { when: {}, source: TEST_SOURCE, confidence: 0.9, ...overrides };
}

function standardKnowledge(rules: PriorityRule[]) {
  return makePriorityKnowledge({
    abilities: [
      TEST_ABILITIES.blast,
      TEST_ABILITIES.missiles,
      TEST_ABILITIES.barrage,
      TEST_ABILITIES.orb,
    ],
    buffs: [TEST_BUFFS.proc, TEST_BUFFS.charges, TEST_BUFFS.salvo],
    resources: TEST_RESOURCES,
    rules,
  });
}

//  0. barrage (aoe, targets ≥ 3)  → aoe_barrage   [scenario:'aoe']
//  1. barrage (proc active)      → barrage_on_proc
//  2. missiles (salvo < 12)      → missiles_low
//  3. barrage (salvo = 25)       → barrage_full
//  4. blast (filler, conf 0.9)
const STANDARD_RULES: PriorityRule[] = [
  rule({
    id: 'r0.aoe_barrage',
    action: 'barrage',
    when: { targetCountMin: 3 },
    scenario: 'aoe',
  }),
  rule({ id: 'r1.barrage_on_proc', action: 'barrage', when: { buffActive: ['proc'] } }),
  rule({ id: 'r2.missiles_low', action: 'missiles', when: { buffStacks: [{ key: 'salvo', max: 11 }] } }),
  rule({ id: 'r3.barrage_full', action: 'barrage', when: { buffStacks: [{ key: 'salvo', min: 25, max: 25 }] } }),
  fillerRule('blast', 'r4.filler_blast', 0.9),
];

const STANDARD = standardKnowledge(STANDARD_RULES);

describe('resolveScenario', () => {
  it('reads aoe/st from the observable target count, unknown otherwise', () => {
    expect(resolveScenario(makeState({ targetCount: 3 }))).toBe('aoe');
    expect(resolveScenario(makeState({ targetCount: 2 }))).toBe('st');
    expect(
      resolveScenario(makeState({ observable: { buff: true, resource: true, targetCount: false } })),
    ).toBe('unknown');
  });
});

describe('evaluatePriority verdicts', () => {
  it('marks correct when the top deterministic rule was followed', () => {
    const state = makeState({
      time: 1000,
      buffsActive: new Set(['proc']),
      buffStacks: new Map([['salvo', 5]]),
    });
    const result = evaluatePriority({ knowledge: STANDARD, decisions: [decision('barrage', state)] });
    expect(result.decisions[0]).toMatchObject({
      verdict: 'correct',
      expectedRuleId: 'r1.barrage_on_proc',
      expectedRuleIndex: 1,
    });
    expect(result.breakdown).toMatchObject({ correct: 1, suboptimal: 0, mistake: 0 });
  });

  it('marks suboptimal when a better deterministic rule fired but a lower valid one explains the cast', () => {
    // proc active → r1 wants barrage; player casts missiles which is valid via r2 (salvo 5).
    const state = makeState({
      time: 2000,
      buffsActive: new Set(['proc']),
      buffStacks: new Map([['salvo', 5]]),
    });
    const result = evaluatePriority({ knowledge: STANDARD, decisions: [decision('missiles', state)] });
    expect(result.decisions[0]).toMatchObject({
      verdict: 'suboptimal',
      expectedRuleId: 'r1.barrage_on_proc',
      acceptableRuleId: 'r2.missiles_low',
    });
  });

  it('marks mistake when the actual action has no valid or indeterminate explanation', () => {
    // salvo 15, no proc: r1/r2 blocked, r3 blocked → filler blast is expected.
    // Barrage has no fireable rule here and nothing indeterminate explains it.
    const state = makeState({
      time: 3000,
      buffsActive: new Set<string>(),
      buffStacks: new Map([['salvo', 15]]),
    });
    const result = evaluatePriority({ knowledge: STANDARD, decisions: [decision('barrage', state)] });
    expect(result.decisions[0]).toMatchObject({
      verdict: 'mistake',
      expectedRuleId: 'r4.filler_blast',
    });
    expect(result.breakdown.mistake).toBe(1);
  });

  it('degrades to unknown when the buff feed is missing and an indeterminate rule may explain the cast', () => {
    // No buff observability → r1/r2/r3 all indeterminate; actual barrage could be
    // explained by r1/r3, so we must NOT call it a mistake.
    const state = makeState({
      time: 4000,
      observable: { buff: false, resource: true, targetCount: true },
    });
    const result = evaluatePriority({ knowledge: STANDARD, decisions: [decision('barrage', state)] });
    expect(result.decisions[0]?.verdict).toBe('unknown');
    expect(result.decisions[0]?.expectedRuleId).toBe('r4.filler_blast');
  });

  it('returns unknown when no rule deterministically fires', () => {
    const knowledge = standardKnowledge([
      rule({
        id: 'only.barrage_when_high',
        action: 'barrage',
        when: { buffStacks: [{ key: 'salvo', min: 12 }] },
      }),
    ]);
    const state = makeState({
      time: 5000,
      observable: { buff: false, resource: true, targetCount: true },
    });
    const result = evaluatePriority({ knowledge, decisions: [decision('barrage', state)] });
    expect(result.decisions[0]?.verdict).toBe('unknown');
    expect(result.decisions[0]?.reasons.join(' ')).toContain('no rule deterministically fired');
  });

  it('downgrades weak-knowledge mismatches from suboptimal to acceptable', () => {
    // The top rule is only conf 0.5 (< MIN) → deviation to a valid lower rule
    // cannot be called suboptimal.
    const knowledge = standardKnowledge([
      fillerRule('blast', 'weak.filler_blast', 0.5),
      rule({ id: 'valid.missiles_on_proc', action: 'missiles', when: { buffActive: ['proc'] } }),
    ]);
    const state = makeState({
      time: 6000,
      buffsActive: new Set(['proc']),
    });
    const result = evaluatePriority({ knowledge, decisions: [decision('missiles', state)] });
    expect(result.decisions[0]).toMatchObject({
      verdict: 'acceptable',
      expectedRuleId: 'weak.filler_blast',
      acceptableRuleId: 'valid.missiles_on_proc',
    });
  });

  it('does not escalate to mistake when the expected rule is below MIN_MISTAKE_CONFIDENCE', () => {
    const knowledge = standardKnowledge([fillerRule('blast', 'weak.filler_blast', 0.5)]);
    const state = makeState({ time: 7000 });
    const result = evaluatePriority({ knowledge, decisions: [decision('barrage', state)] });
    expect(result.decisions[0]?.verdict).toBe('unknown');
    expect(result.decisions[0]?.reasons.join(' ')).toContain('MIN_MISTAKE_CONFIDENCE');
  });
});

describe('scenario handling', () => {
  const SCENARIO_RULES: PriorityRule[] = [
    rule({
      id: 's1.barrage_aoe',
      action: 'barrage',
      scenario: 'aoe',
      when: {
        buffStacks: [{ key: 'salvo', min: 12 }],
        cooldownReady: ['orb'],
        targetCountMin: 3,
      },
    }),
    rule({
      id: 's2.missiles_st',
      action: 'missiles',
      scenario: 'st',
      when: { buffActive: ['proc'] },
    }),
    fillerRule('blast', 's3.filler', 0.9),
  ];

  it('deletes aoe-only rules in single-target and st-only rules in aoe', () => {
    const knowledge = standardKnowledge(SCENARIO_RULES);

    // ST: proc active + salvo 12. s1 removed entirely, s2 fires → missiles.
    const st = makeState({
      time: 100,
      buffsActive: new Set(['proc']),
      buffStacks: new Map([['salvo', 12]]),
      targetCount: 1,
    });
    const stResult = evaluatePriority({ knowledge, decisions: [decision('missiles', st)] });
    expect(stResult.decisions[0]).toMatchObject({ verdict: 'correct', expectedRuleId: 's2.missiles_st' });

    // AOE: proc active, salvo 12, orb ready. s1 would fire (barrage); s2 is
    // deleted. Casting missiles is then an unexplained deviation → mistake.
    const aoe = makeState({
      time: 200,
      buffsActive: new Set(['proc']),
      buffStacks: new Map([['salvo', 12]]),
      ready: new Set(['orb']),
      targetCount: 4,
    });
    const aoeResult = evaluatePriority({ knowledge, decisions: [decision('missiles', aoe)] });
    expect(aoeResult.decisions[0]).toMatchObject({
      verdict: 'mistake',
      expectedRuleId: 's1.barrage_aoe',
    });
  });

  it('lets an aoe rule only explain (never fire) when the target count is unobservable', () => {
    const knowledge = standardKnowledge(SCENARIO_RULES);
    const state = makeState({
      time: 300,
      buffsActive: new Set(['proc']),
      buffStacks: new Map([['salvo', 12]]),
      ready: new Set(['orb']),
      observable: { buff: true, resource: true, targetCount: false },
    });
    // barrage is what the aoe rule wants, but we cannot confirm ≥3 targets →
    // verdict must not be confident (correct).
    const result = evaluatePriority({ knowledge, decisions: [decision('barrage', state)] });
    expect(result.decisions[0]?.verdict).not.toBe('correct');
  });
});

describe('evaluatePriority aggregation', () => {
  it('computes breakdown, majority scenario and skips unmapped decisions', () => {
    const rules = STANDARD_RULES;
    const knowledge = STANDARD;
    const decisions = [
      // correct in aoe
      decision(
        'barrage',
        makeState({ time: 0, targetCount: 4, buffsActive: new Set(['proc']) }),
      ),
      // correct in aoe
      decision(
        'barrage',
        makeState({ time: 1000, targetCount: 5, buffsActive: new Set(['proc']) }),
      ),
      // st correct
      decision(
        'blast',
        makeState({
          time: 2000,
          targetCount: 1,
          buffStacks: new Map([['salvo', 20]]),
        }),
      ),
      // unmapped
      decision('pet_swipe', makeState({ time: 3000 })),
    ];
    const result = evaluatePriority({ knowledge, decisions });
    expect(result.decisions).toHaveLength(3);
    expect(result.breakdown).toMatchObject({ correct: 3 });
    expect(result.skippedUnmappedCasts).toBe(1);
    expect(result.scenario).toBe('aoe');
    expect(result.knowledge).toEqual({ specName: 'TestSpec', knowledgeVersion: '0.0.0-test' });
  });

  it('respects maxSamples with an even, deterministic subsample', () => {
    const states = [0, 1000, 2000, 3000, 4000].map((time) =>
      decision(
        'blast',
        makeState({ time, buffsActive: new Set(['proc']) }),
      ),
    );
    const result = evaluatePriority({
      knowledge: standardKnowledge([fillerRule('blast', 'only.filler', 0.9)]),
      decisions: states,
      maxSamples: 3,
    });
    expect(result.decisions.map((d) => d.time)).toEqual([0, 2000, 4000]);
  });
});

describe('arcane knowledge integration', () => {
  it('never lets the aoe barrage rule anchor an expected action in single-target', () => {
    // salvo 12 + no proc + no clearcasting + single target: the aoe rule
    // arcane.barrage_orb_aoe must be *deleted*, so a barrage cast there is
    // never blessed by it.
    const state = makeState({
      time: 0,
      buffsActive: new Set<string>(),
      buffStacks: new Map([
        ['arcane_salvo', 12],
        ['arcane_charge', 4],
      ]),
      targetCount: 1,
    });
    const result = evaluatePriority({
      knowledge: ARCANE_MAGE_KNOWLEDGE,
      decisions: [decision('arcane_barrage', state)],
    });
    const record = result.decisions[0];
    expect(record?.expectedRuleId).not.toBe('arcane.barrage_orb_aoe');
    expect(result.scenario).toBe('st');
  });

  it('keeps untagged single-target rules from anchoring expected actions in aoe (M+ false-positive guard)', () => {
    // salvo 12 + single-target rule conditions hold, but 4 targets are up:
    // the untagged ST rotation may only *explain* the cast. Real M+ logs
    // measured 24% suboptimal / 21% mistake from exactly this mismatch
    // before the gate (fXdMjWKJbpna6yHv, 2026-09-09).
    const state = makeState({
      time: 0,
      buffsActive: new Set<string>(),
      buffStacks: new Map([['arcane_salvo', 5]]),
      targetCount: 4,
    });
    const result = evaluatePriority({
      knowledge: ARCANE_MAGE_KNOWLEDGE,
      decisions: [decision('arcane_missiles', state), decision('prismatic_bolt', state)],
    });
    // The untagged missiles rule cannot fire as expected action in aoe; the
    // only aoe-tagged arcane rule (barrage_orb_aoe) is blocked (no orb ready).
    // Both decisions must degrade honestly instead of judging the ST rotation.
    for (const record of result.decisions) {
      expect(record?.verdict).toBe('unknown');
      expect(record?.expectedRuleId).toBeUndefined();
    }
    expect(result.scenario).toBe('aoe');
  });
});
