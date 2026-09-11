import { describe, it, expect } from 'vitest';
import { InterruptAnalyzer } from '../src/combat/interrupts.js';
import { DispelAnalyzer } from '../src/combat/dispels.js';
import { makeContext, interrupt, dispel } from './helpers.js';

describe('InterruptAnalyzer', () => {
  it('counts interrupts by a source and groups by target', () => {
    const events = [
      interrupt(0, 50, 'Boss A'),
      interrupt(500, 50, 'Boss A'),
      interrupt(1000, 60, 'Boss B'),
      interrupt(1500, 50, 'Boss A', 9), // other source, ignored
    ];
    const analyzer = new InterruptAnalyzer();
    const result = analyzer.analyze(makeContext({ events }));

    const metrics = result.metrics.interrupt as {
      count: number;
      distinctTargets: number;
      byTarget: Array<{ targetId: number; count: number }>;
    };

    expect(metrics.count).toBe(3);
    expect(metrics.distinctTargets).toBe(2);
    const bossA = metrics.byTarget.find((t) => t.targetId === 50);
    expect(bossA?.count).toBe(2);
  });
});

describe('DispelAnalyzer', () => {
  it('counts dispels by a source and groups by target', () => {
    const events = [dispel(0, 10, 'Ally A'), dispel(200, 20, 'Ally B')];
    const analyzer = new DispelAnalyzer();
    const result = analyzer.analyze(makeContext({ events }));

    const metrics = result.metrics.dispel as {
      count: number;
      byTarget: Array<{ targetId: number; count: number }>;
    };

    expect(metrics.count).toBe(2);
    expect(metrics.byTarget).toHaveLength(2);
  });

  it('returns zero dispels when none occurred', () => {
    const analyzer = new DispelAnalyzer();
    const result = analyzer.analyze(makeContext());
    const metrics = result.metrics.dispel as { count: number };
    expect(metrics.count).toBe(0);
  });
});
