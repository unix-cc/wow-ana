import { describe, it, expect } from 'vitest';
import { computeCastFacts } from '../src/casts.js';
import { makeInput, cast } from './helpers.js';

describe('computeCastFacts', () => {
  it('counts casts per ability and measures intervals', () => {
    const facts = computeCastFacts(
      makeInput({
        events: [
          cast(0, 1, 'Cobra Shot'),
          cast(500, 1, 'Cobra Shot'),
          cast(3000, 2, 'Barbed Shot'),
          cast(4500, 1, 'Cobra Shot'),
        ],
      }),
    );

    expect(facts.totalCasts).toBe(4);
    expect(facts.abilities).toHaveLength(2);

    const cobra = facts.abilities.find((a) => a.abilityId === 1);
    expect(cobra?.count).toBe(3);
    expect(cobra?.minIntervalMs).toBe(500);
    expect(cobra?.maxIntervalMs).toBe(4000);
    expect(cobra?.avgIntervalMs).toBe(2250);
  });

  it('attaches one evidence entry per cast so findings stay traceable', () => {
    const facts = computeCastFacts(
      makeInput({ events: [cast(0, 34026, 'Kill Command')] }),
    );

    expect(facts.abilities[0]?.evidence).toEqual([
      {
        fightId: 8,
        timestamp: 0,
        ability: 'Kill Command',
        abilityId: 34026,
      },
    ]);
  });

  it('does not assert goodness — only reports what happened', () => {
    const facts = computeCastFacts(makeInput({ events: [] }));
    expect(facts.totalCasts).toBe(0);
    expect(facts.abilities).toEqual([]);
    expect(facts.type).toBe('cast');
  });

  it('honours an explicit source id', () => {
    const facts = computeCastFacts(
      makeInput({
        events: [cast(0, 1, 'Cobra Shot', 1), cast(100, 2, 'Other', 9)],
      }),
      { sourceId: 9 },
    );
    expect(facts.totalCasts).toBe(1);
    expect(facts.abilities[0]?.abilityId).toBe(2);
  });
});
