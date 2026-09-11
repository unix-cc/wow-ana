import { describe, it, expect } from 'vitest';
import { GcdAnalyzer } from '../src/combat/gcd.js';
import { makeContext, cast } from './helpers.js';

describe('GcdAnalyzer', () => {
  it('counts GCDs and idle time within the fight window', () => {
    const fightStart = 0;
    const fightEnd = 10_000;
    const events = [
      cast(0, 1, 'A'),
      cast(1500, 1, 'B'),
      cast(3000, 1, 'C'),
      cast(9000, 1, 'D'), // 6s gap -> idle
    ];
    const analyzer = new GcdAnalyzer({ gcdMs: 1500 });
    const result = analyzer.analyze(
      makeContext({ events, fightStart, fightEnd }),
    );

    const metrics = result.metrics.gcd as {
      totalGcd: number;
      idleMs: number;
      idlePercent: number;
      idleWindows: Array<{ start: number; end: number; durationMs: number }>;
    };

    // 4 casts separated by >= 1500ms each count as 4 GCDs
    expect(metrics.totalGcd).toBe(4);
    // idle: gap 3000->9000 = 6000ms (tail 1000ms is below the gcd threshold)
    expect(metrics.idleMs).toBe(6000);
    expect(metrics.idlePercent).toBe(0.6);
    expect(metrics.idleWindows).toHaveLength(1);
    expect(metrics.idleWindows[0]).toEqual({
      start: 3000,
      end: 9000,
      durationMs: 6000,
    });
  });

  it('merges casts closer than a GCD into one GCD bucket', () => {
    const fightEnd = 10_000;
    const events = [
      cast(0, 1, 'A'),
      cast(200, 1, 'B'), // within gcd of previous
      cast(1700, 1, 'C'),
    ];
    const analyzer = new GcdAnalyzer({ gcdMs: 1500 });
    const result = analyzer.analyze(
      makeContext({ events, fightStart: 0, fightEnd }),
    );
    const metrics = result.metrics.gcd as { totalGcd: number };
    // A, B merged (gap 200 < 1500), C is new -> 2 GCDs
    expect(metrics.totalGcd).toBe(2);
  });

  it('reports zero GCD and full idle for an empty fight', () => {
    const analyzer = new GcdAnalyzer();
    const result = analyzer.analyze(
      makeContext({ fightStart: 0, fightEnd: 10_000 }),
    );
    const metrics = result.metrics.gcd as {
      totalGcd: number;
      idleMs: number;
      idlePercent: number;
    };
    expect(metrics.totalGcd).toBe(0);
    expect(metrics.idleMs).toBe(10_000);
    expect(metrics.idlePercent).toBe(1);
  });
});
