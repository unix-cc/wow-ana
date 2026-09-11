import { describe, it, expect } from 'vitest';
import { DamageAnalyzer } from '../src/combat/damage.js';
import { makeContext, damage } from './helpers.js';

describe('DamageAnalyzer', () => {
  it('computes total damage, dps and breakdown by ability', () => {
    const fightEnd = 10_000;
    const events = [
      damage(0, 1, 'Cobra Shot', 1000),
      damage(500, 1, 'Cobra Shot', 500, 'crit'),
      damage(2000, 2, 'Kill Command', 2500),
    ];
    const analyzer = new DamageAnalyzer();
    const result = analyzer.analyze(
      makeContext({ events, fightStart: 0, fightEnd }),
    );

    const metrics = result.metrics.damage as {
      totalDamage: number;
      dps: number;
      activeTimeMs: number;
      byAbility: Array<{
        abilityId: number;
        total: number;
        count: number;
        critCount: number;
        hitCount: number;
      }>;
    };

    expect(metrics.totalDamage).toBe(4000);
    // 4000 over 10s
    expect(metrics.dps).toBe(400);
    expect(metrics.activeTimeMs).toBe(2000);

    const cobra = metrics.byAbility.find((a) => a.abilityId === 1);
    expect(cobra?.total).toBe(1500);
    expect(cobra?.count).toBe(2);
    expect(cobra?.critCount).toBe(1);
    expect(cobra?.hitCount).toBe(1);

    const kill = metrics.byAbility.find((a) => a.abilityId === 2);
    expect(kill?.total).toBe(2500);
  });

  it('returns zero damage for no damage events', () => {
    const analyzer = new DamageAnalyzer();
    const result = analyzer.analyze(makeContext({ fightEnd: 10_000 }));
    const metrics = result.metrics.damage as {
      totalDamage: number;
      dps: number;
    };
    expect(metrics.totalDamage).toBe(0);
    expect(metrics.dps).toBe(0);
  });
});
