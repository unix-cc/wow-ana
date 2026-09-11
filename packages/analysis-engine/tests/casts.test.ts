import { describe, it, expect } from 'vitest';
import { CastAnalyzer } from '../src/combat/casts.js';
import { makeContext, cast } from './helpers.js';

describe('CastAnalyzer', () => {
  it('counts total casts and per-ability stats', () => {
    const events = [
      cast(0, 1, 'Cobra Shot'),
      cast(500, 1, 'Cobra Shot'),
      cast(3000, 2, 'Barbed Shot'),
      cast(4500, 1, 'Cobra Shot'),
    ];
    const analyzer = new CastAnalyzer();
    const result = analyzer.analyze(makeContext({ events }));

    const metrics = result.metrics.cast as {
      totalCasts: number;
      abilities: Array<{
        abilityId: number;
        count: number;
        minIntervalMs: number;
        maxIntervalMs: number;
        avgIntervalMs: number;
      }>;
    };

    expect(metrics.totalCasts).toBe(4);
    expect(metrics.abilities).toHaveLength(2);

    const cobra = metrics.abilities.find((a) => a.abilityId === 1);
    expect(cobra?.count).toBe(3);
    expect(cobra?.minIntervalMs).toBe(500);
    expect(cobra?.maxIntervalMs).toBe(4000);
    expect(cobra?.avgIntervalMs).toBe(2250);

    const barbed = metrics.abilities.find((a) => a.abilityId === 2);
    expect(barbed?.count).toBe(1);
    expect(barbed?.minIntervalMs).toBeUndefined();
  });

  it('returns zero casts when the player casts nothing', () => {
    const analyzer = new CastAnalyzer();
    const result = analyzer.analyze(makeContext());
    const metrics = result.metrics.cast as { totalCasts: number };
    expect(metrics.totalCasts).toBe(0);
  });

  it('filters by explicit sourceId', () => {
    const events = [cast(0, 1, 'Cobra Shot', 1), cast(100, 2, 'Other', 9)];
    const analyzer = new CastAnalyzer({ sourceId: 9 });
    const result = analyzer.analyze(makeContext({ events }));
    const metrics = result.metrics.cast as {
      totalCasts: number;
      abilities: Array<{ abilityId: number }>;
    };
    expect(metrics.totalCasts).toBe(1);
    expect(metrics.abilities[0]?.abilityId).toBe(2);
  });
});
