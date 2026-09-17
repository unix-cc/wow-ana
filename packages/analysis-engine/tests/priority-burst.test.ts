import { describe, it, expect } from 'vitest';
import type { DecisionState, ObservedDecision } from '../src/priority/types.js';
import { evaluatePriority } from '../src/priority/evaluator.js';
import { ARCANE_MAGE_KNOWLEDGE } from '@wcl/spec-knowledge';
import {
  makePriorityKnowledge,
  TEST_ABILITIES,
  TEST_BUFFS,
  TEST_RESOURCES,
  TEST_SOURCE,
  fillerRule,
} from './priority-fixtures.js';

/**
 * Burst-window bucketing (cast-anchored). WCL's Buffs channel does not return
 * burst-aura events (probe-verified 2026-09), so windows are
 * `[burstCastTime, burstCastTime + burstDurationMs]` and the `inBurst` flag
 * only buckets decisions — it never feeds a verdict.
 */

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
  time: number,
  overrides: Partial<ObservedDecision> = {},
): ObservedDecision {
  return { time, actualKey, state: makeState({ time }), ...overrides };
}

describe('burst window bucketing (cast-anchored)', () => {
  it('marks decisions inside [cast, cast+duration] as inBurst', () => {
    const knowledge = makePriorityKnowledge({
      abilities: [TEST_ABILITIES.surge, TEST_ABILITIES.blast],
      buffs: [TEST_BUFFS.proc],
      resources: TEST_RESOURCES,
      cooldowns: [
        {
          key: 'surge',
          abilityId: 105,
          name: 'Surge',
          cooldownMs: 90_000,
          kind: 'offensive',
          burstDurationMs: 6_000,
          source: TEST_SOURCE,
          confidence: 0.9,
        },
      ],
      rules: [fillerRule('blast', 'blast_filler')],
    });

    const result = evaluatePriority({
      knowledge,
      decisions: [
        decision('surge', 1000),
        decision('blast', 1500), // inside window
        decision('blast', 3000), // inside window
        decision('blast', 8000), // outside window
      ],
    });

    const byTime = new Map(result.decisions.map((d) => [d.time, d]));
    expect(byTime.get(1000)?.inBurst).toBe(true); // the burst cast itself
    expect(byTime.get(1500)?.inBurst).toBe(true);
    expect(byTime.get(3000)?.inBurst).toBe(true);
    expect(byTime.get(8000)?.inBurst).toBe(false);

    expect(result.burstWindows).toHaveLength(1);
    expect(result.burstWindows?.[0]).toMatchObject({
      key: 'surge',
      durationMs: 6_000,
      casts: [1000],
    });
  });

  it('omits burstWindows when the spec declares no burst anchors', () => {
    const result = evaluatePriority({
      knowledge: makePriorityKnowledge({
        abilities: [TEST_ABILITIES.blast],
        buffs: [],
        resources: TEST_RESOURCES,
        rules: [fillerRule('blast', 'blast_filler')],
      }),
      decisions: [decision('blast', 1000)],
    });
    expect(result.burstWindows).toBeUndefined();
    expect(result.decisions[0]?.inBurst).toBeUndefined();
  });

  it('keeps declared-but-never-cast anchors visible with an empty cast list', () => {
    const knowledge = makePriorityKnowledge({
      abilities: [TEST_ABILITIES.surge, TEST_ABILITIES.blast],
      buffs: [],
      resources: TEST_RESOURCES,
      cooldowns: [
        {
          key: 'surge',
          abilityId: 105,
          name: 'Surge',
          cooldownMs: 90_000,
          kind: 'offensive',
          burstDurationMs: 6_000,
          source: TEST_SOURCE,
          confidence: 0.9,
        },
      ],
      rules: [fillerRule('blast', 'blast_filler')],
    });

    const result = evaluatePriority({
      knowledge,
      decisions: [decision('blast', 1000), decision('blast', 2000)],
    });

    expect(result.burstWindows).toHaveLength(1);
    expect(result.burstWindows?.[0]?.casts).toEqual([]);
    expect(result.decisions.every((d) => d.inBurst !== true)).toBe(true);
  });

  it('merges windows across multiple burst anchors', () => {
    const knowledge = makePriorityKnowledge({
      abilities: [
        TEST_ABILITIES.surge,
        TEST_ABILITIES.blast,
        { ...TEST_ABILITIES.blast, key: 'avatar', abilityId: 106, name: 'Avatar' },
      ],
      buffs: [],
      resources: TEST_RESOURCES,
      cooldowns: [
        {
          key: 'surge',
          abilityId: 105,
          name: 'Surge',
          cooldownMs: 90_000,
          kind: 'offensive',
          burstDurationMs: 6_000,
          source: TEST_SOURCE,
          confidence: 0.9,
        },
        {
          key: 'avatar',
          abilityId: 106,
          name: 'Avatar',
          cooldownMs: 90_000,
          kind: 'offensive',
          burstDurationMs: 20_000,
          source: TEST_SOURCE,
          confidence: 0.9,
        },
      ],
      rules: [fillerRule('blast', 'blast_filler')],
    });

    const result = evaluatePriority({
      knowledge,
      decisions: [
        decision('surge', 1000),
        decision('blast', 5000), // surge window (ends 7000)
        decision('avatar', 8000),
        decision('blast', 20000), // avatar window (ends 28000)
        decision('blast', 30000), // outside both
      ],
    });

    const byTime = new Map(result.decisions.map((d) => [d.time, d]));
    expect(byTime.get(5000)?.inBurst).toBe(true);
    expect(byTime.get(20000)?.inBurst).toBe(true);
    expect(byTime.get(30000)?.inBurst).toBe(false);
    expect(result.burstWindows?.map((w) => w.key)).toEqual(['surge', 'avatar']);
  });

  it('real Arcane knowledge anchors surge casts and buckets the window', () => {
    const surge = ARCANE_MAGE_KNOWLEDGE.cooldowns.find(
      (c) => c.key === 'arcane_surge',
    );
    expect(surge?.burstDurationMs).toBe(6_000);

    const rules = [fillerRule('arcane_blast', 'blast_filler')];
    const knowledge = makePriorityKnowledge({
      abilities: [
        ...ARCANE_MAGE_KNOWLEDGE.abilities,
      ],
      buffs: ARCANE_MAGE_KNOWLEDGE.buffs,
      resources: ARCANE_MAGE_KNOWLEDGE.resources,
      cooldowns: ARCANE_MAGE_KNOWLEDGE.cooldowns,
      rules,
    });

    const result = evaluatePriority({
      knowledge,
      decisions: [
        decision('arcane_surge', 1000),
        decision('arcane_blast', 2000),
        decision('arcane_blast', 9000),
      ],
    });

    const byTime = new Map(result.decisions.map((d) => [d.time, d]));
    expect(byTime.get(1000)?.inBurst).toBe(true);
    expect(byTime.get(2000)?.inBurst).toBe(true);
    expect(byTime.get(9000)?.inBurst).toBe(false);
    expect(result.burstWindows?.[0]).toMatchObject({
      key: 'arcane_surge',
      casts: [1000],
    });
  });
});
