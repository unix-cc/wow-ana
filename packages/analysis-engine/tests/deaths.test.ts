import { describe, it, expect } from 'vitest';
import { DeathAnalyzer } from '../src/combat/deaths.js';
import { makeContext, death, damage } from './helpers.js';

describe('DeathAnalyzer', () => {
  it('collects damage taken in the window before death', () => {
    const events = [
      damage(1, 900, 'Mech Hit', 5000, 'normal', 50),
      damage(2, 901, 'DoT Tick', 3000, 'normal', 51),
      death(2000),
    ];
    const analyzer = new DeathAnalyzer({ preDeathWindowMs: 5000 });
    const result = analyzer.analyze(makeContext({ events }));

    const deaths = (
      result.metrics.death as {
        deaths: Array<{
          timestamp: number;
          takenTotal: number;
          takenEvents: unknown[];
        }>;
      }
    ).deaths;

    expect(deaths).toHaveLength(1);
    expect(deaths[0]?.timestamp).toBe(2000);
    expect(deaths[0]?.takenTotal).toBe(8000);
    expect(deaths[0]?.takenEvents).toHaveLength(2);
  });

  it('excludes damage outside the pre-death window', () => {
    const events = [
      damage(1, 900, 'Old Hit', 10_000, 'normal', 50), // far before window
      damage(1900, 901, 'Recent', 2000, 'normal', 51),
      death(2000),
    ];
    const analyzer = new DeathAnalyzer({ preDeathWindowMs: 100 });
    const result = analyzer.analyze(makeContext({ events }));
    const deaths = (
      result.metrics.death as {
        deaths: Array<{ takenTotal: number; takenEvents: unknown[] }>;
      }
    ).deaths;
    // only the damage at 1900 (within last 100ms) is included
    expect(deaths[0]?.takenTotal).toBe(2000);
    expect(deaths[0]?.takenEvents).toHaveLength(1);
  });

  it('returns no deaths for a surviving player', () => {
    const analyzer = new DeathAnalyzer();
    const result = analyzer.analyze(makeContext());
    const deaths = (result.metrics.death as { deaths: unknown[] }).deaths;
    expect(deaths).toEqual([]);
  });
});
