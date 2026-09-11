import { describe, it, expect } from 'vitest';
import { computeBuffFacts } from '../src/buffs.js';
import { computeGcdFacts } from '../src/gcd.js';
import { computeResourceFacts } from '../src/resources.js';
import { makeInput, buff, resource, cast } from './helpers.js';

describe('computeBuffFacts', () => {
  it('measures uptime against the fight window', () => {
    const facts = computeBuffFacts(
      makeInput({
        fightEnd: 10_000,
        events: [
          buff(1_000, 'applybuff', 200, 'Bestial Wrath'),
          buff(6_000, 'removebuff', 200, 'Bestial Wrath'),
        ],
      }),
    );

    expect(facts.buffs).toHaveLength(1);
    expect(facts.buffs[0]?.uptime).toBeCloseTo(0.5, 5);
    expect(facts.buffs[0]?.downtimeMs).toBe(5_000);
  });

  it('tracks stacks and refreshes', () => {
    const facts = computeBuffFacts(
      makeInput({
        fightEnd: 10_000,
        events: [
          buff(0, 'applybuff', 200, 'Barbed Shot'),
          buff(1_000, 'applybuff', 200, 'Barbed Shot'),
          buff(2_000, 'refreshbuff', 200, 'Barbed Shot'),
        ],
      }),
    );

    expect(facts.buffs[0]?.maxStacks).toBe(2);
    expect(facts.buffs[0]?.refreshCount).toBe(1);
  });

  it('records the apply/remove timeline as evidence', () => {
    const facts = computeBuffFacts(
      makeInput({
        fightEnd: 10_000,
        events: [
          buff(1_000, 'applybuff', 200, 'Bestial Wrath'),
          buff(6_000, 'removebuff', 200, 'Bestial Wrath'),
        ],
      }),
    );

    expect(facts.buffs[0]?.evidence?.map((e) => e.note)).toEqual([
      'applybuff',
      'removebuff',
    ]);
  });
});

describe('computeGcdFacts', () => {
  it('reports idle windows and their share of the fight', () => {
    const facts = computeGcdFacts(
      makeInput({
        fightEnd: 10_000,
        events: [cast(0, 1, 'A'), cast(9_000, 2, 'B')],
      }),
    );

    expect(facts.totalGcd).toBe(2);
    expect(facts.idleMs).toBe(9_000);
    expect(facts.idlePercent).toBe(0.9);
    expect(facts.idleWindows).toEqual([
      { start: 0, end: 9_000, durationMs: 9_000 },
    ]);
  });
});

describe('computeResourceFacts', () => {
  it('summarizes gains, spends, peak and minimum per resource type', () => {
    const facts = computeResourceFacts(
      makeInput({
        events: [
          resource(0, 'Focus', 20, 20),
          resource(500, 'Focus', 60, 40),
          resource(1_000, 'Focus', 20, -40),
          resource(1_500, 'Mana', 500, 500),
        ],
      }),
    );

    expect(facts.resources).toHaveLength(2);
    const focus = facts.resources.find((r) => r.resourceType === 'Focus');
    expect(focus?.eventCount).toBe(3);
    expect(focus?.peak).toBe(60);
    expect(focus?.peakTimestamp).toBe(500);
    expect(focus?.min).toBe(20);
    expect(focus?.totalGained).toBe(60);
    expect(focus?.totalSpent).toBe(40);
  });
});
