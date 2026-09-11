import { describe, it, expect } from 'vitest';
import { computeCooldownFacts } from '../src/cooldowns.js';
import { makeInput, cast } from './helpers.js';

const BESTIAL_WRATH = { abilityId: 19574, abilityName: 'Bestial Wrath' };

describe('computeCooldownFacts', () => {
  it('compares actual casts against the theoretical maximum', () => {
    const facts = computeCooldownFacts(
      makeInput({
        fightEnd: 300_000,
        events: [
          cast(0, BESTIAL_WRATH.abilityId, BESTIAL_WRATH.abilityName),
          cast(200_000, BESTIAL_WRATH.abilityId, BESTIAL_WRATH.abilityName),
        ],
      }),
      { cooldowns: [{ ...BESTIAL_WRATH, cooldownMs: 90_000 }] },
    );

    const usage = facts.usages[0];
    expect(usage?.actualCasts).toBe(2);
    expect(usage?.expectedCasts).toBe(4);
    expect(usage?.missedFinalCast).toBe(true);
  });

  it('records expected vs actual timestamps for every delayed cast', () => {
    const facts = computeCooldownFacts(
      makeInput({
        fightEnd: 300_000,
        events: [
          cast(0, BESTIAL_WRATH.abilityId, BESTIAL_WRATH.abilityName),
          cast(104_000, BESTIAL_WRATH.abilityId, BESTIAL_WRATH.abilityName),
        ],
      }),
      { cooldowns: [{ ...BESTIAL_WRATH, cooldownMs: 90_000 }] },
    );

    const usage = facts.usages[0];
    expect(usage?.delays).toEqual([
      { timestamp: 0, idealTimestamp: 0, delayMs: 0 },
      { timestamp: 104_000, idealTimestamp: 90_000, delayMs: 14_000 },
    ]);
    expect(usage?.maxDelayMs).toBe(14_000);
    expect(usage?.evidence?.[0]?.note).toBe('ideal 90000');
  });

  it('keeps a perfect cadence free of delay evidence', () => {
    const facts = computeCooldownFacts(
      makeInput({
        fightEnd: 200_000,
        events: [
          cast(0, BESTIAL_WRATH.abilityId, BESTIAL_WRATH.abilityName),
          cast(90_000, BESTIAL_WRATH.abilityId, BESTIAL_WRATH.abilityName),
        ],
      }),
      { cooldowns: [{ ...BESTIAL_WRATH, cooldownMs: 90_000 }] },
    );

    const usage = facts.usages[0];
    expect(usage?.averageDelayMs).toBe(0);
    expect(usage?.evidence).toEqual([]);
  });

  it('never invents a delay when the cooldown definition is missing', () => {
    const facts = computeCooldownFacts(
      makeInput({ events: [cast(0, 1, 'A'), cast(10, 1, 'A')] }),
      { cooldowns: [{ abilityId: 1, abilityName: 'A', cooldownMs: 0 }] },
    );
    expect(facts.usages[0]?.delays).toEqual([]);
    expect(facts.usages[0]?.maxDelayMs).toBeUndefined();
  });
});
