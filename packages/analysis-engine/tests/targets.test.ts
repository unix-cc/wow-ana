import { describe, it, expect } from 'vitest';
import { TargetAnalyzer } from '../src/combat/targets.js';
import { makeContext, damage } from './helpers.js';

describe('TargetAnalyzer', () => {
  it('counts distinct targets, switches and ranks by damage', () => {
    const events = [
      damage(0, 1, 'A', 1000, 'normal', 1, 10),
      damage(100, 1, 'A', 1000, 'normal', 1, 10),
      damage(500, 1, 'A', 500, 'normal', 1, 20), // switch to 20
      damage(900, 1, 'A', 300, 'normal', 1, 10), // switch back to 10
    ];
    const analyzer = new TargetAnalyzer();
    const result = analyzer.analyze(makeContext({ events }));

    const metrics = result.metrics.target as {
      targetCount: number;
      switches: number;
      targets: Array<{ targetId: number; hits: number; total: number }>;
    };

    expect(metrics.targetCount).toBe(2);
    // switches: 10->20 at 500, 20->10 at 900 = 2
    expect(metrics.switches).toBe(2);

    const target10 = metrics.targets.find((t) => t.targetId === 10);
    expect(target10?.hits).toBe(3);
    expect(target10?.total).toBe(2300);

    const target20 = metrics.targets.find((t) => t.targetId === 20);
    expect(target20?.total).toBe(500);

    // ranked by total descending: 10 (2300) before 20 (500)
    expect(metrics.targets[0]?.targetId).toBe(10);
  });

  it('returns zero targets with no damage', () => {
    const analyzer = new TargetAnalyzer();
    const result = analyzer.analyze(makeContext());
    const metrics = result.metrics.target as {
      targetCount: number;
      switches: number;
      targets: unknown[];
    };
    expect(metrics.targetCount).toBe(0);
    expect(metrics.switches).toBe(0);
    expect(metrics.targets).toEqual([]);
  });
});
