import { describe, it, expect } from 'vitest';
import { CooldownAnalyzer } from '../src/combat/cooldowns.js';
import { makeContext, cast } from './helpers.js';

describe('CooldownAnalyzer', () => {
  it('compares actual vs expected casts and measures delay', () => {
    // 100s fight, 30s cooldown -> expected floor(100/30)+1 = 4
    const fightStart = 0;
    const fightEnd = 100_000;
    const events = [
      cast(0, 100, 'Bestial Wrath'),
      cast(32_000, 100, 'Bestial Wrath'), // 2s late
      cast(61_000, 100, 'Bestial Wrath'), // 1s late
      cast(93_000, 100, 'Bestial Wrath'), // 3s late
    ];
    const analyzer = new CooldownAnalyzer([
      { abilityId: 100, abilityName: 'Bestial Wrath', cooldownMs: 30_000 },
    ]);
    const result = analyzer.analyze(
      makeContext({ events, fightStart, fightEnd }),
    );

    const usages = (
      result.metrics.cooldown as {
        usages: Array<{
          actualCasts: number;
          expectedCasts: number;
          averageDelayMs: number;
          maxDelayMs: number;
        }>;
      }
    ).usages;

    expect(usages).toHaveLength(1);
    expect(usages[0]?.actualCasts).toBe(4);
    expect(usages[0]?.expectedCasts).toBe(4);
    // delays: cast1 at 0 (0), cast2 at 32k (2k late), cast3 at 61k (1k late),
    // cast4 at 93k (3k late) -> avg 1.5s
    expect(usages[0]?.averageDelayMs).toBe(1500);
    expect(usages[0]?.maxDelayMs).toBe(3000);
  });

  it('flags a missed final cast when usage is below expected', () => {
    const fightEnd = 100_000;
    const events = [
      cast(0, 100, 'Bestial Wrath'),
      cast(30_000, 100, 'Bestial Wrath'),
    ];
    const analyzer = new CooldownAnalyzer([
      { abilityId: 100, cooldownMs: 30_000 },
    ]);
    const result = analyzer.analyze(
      makeContext({ events, fightStart: 0, fightEnd }),
    );
    const usage = (
      result.metrics.cooldown as {
        usages: Array<{
          actualCasts: number;
          expectedCasts: number;
          missedFinalCast: boolean;
        }>;
      }
    ).usages[0];

    expect(usage?.actualCasts).toBe(2);
    expect(usage?.expectedCasts).toBe(4);
    expect(usage?.missedFinalCast).toBe(true);
  });

  it('handles an ability never cast', () => {
    const analyzer = new CooldownAnalyzer([
      { abilityId: 999, cooldownMs: 30_000 },
    ]);
    const result = analyzer.analyze(makeContext({ fightEnd: 100_000 }));
    const usage = (
      result.metrics.cooldown as {
        usages: Array<{
          actualCasts: number;
          expectedCasts: number;
          missedFinalCast?: boolean;
        }>;
      }
    ).usages[0];
    expect(usage?.actualCasts).toBe(0);
    expect(usage?.missedFinalCast).toBeUndefined();
  });
});
