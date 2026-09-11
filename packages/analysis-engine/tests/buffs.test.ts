import { describe, it, expect } from 'vitest';
import { BuffAnalyzer } from '../src/combat/buffs.js';
import { makeContext, buff } from './helpers.js';

describe('BuffAnalyzer', () => {
  it('computes uptime from apply/remove events', () => {
    const fightStart = 0;
    const fightEnd = 10_000;
    const events = [
      buff(1000, 'applybuff', 200, 'Bestial Wrath'),
      buff(6000, 'removebuff', 200, 'Bestial Wrath'),
    ];
    const analyzer = new BuffAnalyzer();
    const result = analyzer.analyze(
      makeContext({ events, fightStart, fightEnd }),
    );

    const buffs = (
      result.metrics.buff as {
        buffs: Array<{ uptime: number; downtimeMs: number; maxStacks: number }>;
      }
    ).buffs;

    expect(buffs).toHaveLength(1);
    // active 1000..6000 = 5000ms / 10000ms
    expect(buffs[0]?.uptime).toBeCloseTo(0.5, 5);
    expect(buffs[0]?.downtimeMs).toBe(5000);
  });

  it('tracks maximum stacks via apply/remove', () => {
    const events = [
      buff(0, 'applybuff', 200, 'Barbed Shot'),
      buff(1000, 'applybuff', 200, 'Barbed Shot'), // 2 stacks
      buff(2000, 'applybuff', 200, 'Barbed Shot'), // 3 stacks
      buff(3000, 'removebuff', 200, 'Barbed Shot'),
      buff(4000, 'removebuff', 200, 'Barbed Shot'),
      buff(5000, 'removebuff', 200, 'Barbed Shot'),
    ];
    const analyzer = new BuffAnalyzer();
    const result = analyzer.analyze(makeContext({ events, fightEnd: 10_000 }));
    const buffs = (
      result.metrics.buff as {
        buffs: Array<{ maxStacks: number; avgStacks: number }>;
      }
    ).buffs;
    expect(buffs[0]?.maxStacks).toBe(3);
  });

  it('counts refreshes separately', () => {
    const events = [
      buff(0, 'applybuff', 200, 'Barbed Shot'),
      buff(1000, 'refreshbuff', 200, 'Barbed Shot'),
      buff(2000, 'refreshbuff', 200, 'Barbed Shot'),
    ];
    const analyzer = new BuffAnalyzer();
    const result = analyzer.analyze(makeContext({ events, fightEnd: 10_000 }));
    const buffs = (
      result.metrics.buff as {
        buffs: Array<{ refreshCount: number }>;
      }
    ).buffs;
    expect(buffs[0]?.refreshCount).toBe(2);
  });

  it('returns no buffs when the player has none', () => {
    const analyzer = new BuffAnalyzer();
    const result = analyzer.analyze(makeContext());
    const buffs = (result.metrics.buff as { buffs: unknown[] }).buffs;
    expect(buffs).toEqual([]);
  });
});
