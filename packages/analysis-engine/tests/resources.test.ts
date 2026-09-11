import { describe, it, expect } from 'vitest';
import { ResourceAnalyzer } from '../src/combat/resources.js';
import { makeContext, resource } from './helpers.js';

describe('ResourceAnalyzer', () => {
  it('summarizes gains, spends, peak and minimum per resource type', () => {
    const events = [
      resource(0, 'Focus', 20, 20),
      resource(500, 'Focus', 60, 40),
      resource(1000, 'Focus', 20, -40),
      resource(1500, 'Mana', 500, 500),
    ];
    const analyzer = new ResourceAnalyzer();
    const result = analyzer.analyze(makeContext({ events }));

    const resources = (
      result.metrics.resource as {
        resources: Array<{
          resourceType: string;
          eventCount: number;
          peak: number;
          min: number;
          totalGained: number;
          totalSpent: number;
        }>;
      }
    ).resources;

    expect(resources).toHaveLength(2);

    const focus = resources.find((r) => r.resourceType === 'Focus');
    expect(focus?.eventCount).toBe(3);
    expect(focus?.peak).toBe(60);
    expect(focus?.min).toBe(20);
    expect(focus?.totalGained).toBe(60);
    expect(focus?.totalSpent).toBe(40);

    const mana = resources.find((r) => r.resourceType === 'Mana');
    expect(mana?.peak).toBe(500);
  });

  it('returns no resources when none are spent/gained', () => {
    const analyzer = new ResourceAnalyzer();
    const result = analyzer.analyze(makeContext());
    const resources = (
      result.metrics.resource as {
        resources: unknown[];
      }
    ).resources;
    expect(resources).toEqual([]);
  });
});
