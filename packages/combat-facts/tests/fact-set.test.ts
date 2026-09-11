import { describe, it, expect } from 'vitest';
import { buildCombatFacts } from '../src/fact-set.js';
import { listFacts } from '@wcl/domain';
import { makeInput, cast } from './helpers.js';

describe('buildCombatFacts', () => {
  it('computes the always-available groups', () => {
    const set = buildCombatFacts(
      makeInput({ events: [cast(0, 1, 'A')] }),
    );

    expect(set.cast?.totalCasts).toBe(1);
    expect(set.gcd?.totalGcd).toBe(1);
    expect(set.buff?.buffs).toEqual([]);
    expect(set.resource?.resources).toEqual([]);
    expect(set.cooldown).toBeUndefined();
    expect(set.player).toEqual({ id: 1, name: 'Hero' });
  });

  it('computes cooldown facts only when knowledge supplies cooldowns', () => {
    const set = buildCombatFacts(
      makeInput({ events: [cast(0, 1, 'A')] }),
      { cooldowns: [{ abilityId: 1, abilityName: 'A', cooldownMs: 5_000 }] },
    );

    expect(set.cooldown?.usages).toHaveLength(1);
  });

  it('produces a flattenable, evidence-backed fact list', () => {
    const set = buildCombatFacts(
      makeInput({ events: [cast(0, 1, 'A'), cast(2_000, 1, 'A')] }),
    );

    const facts = listFacts(set);
    expect(facts.map((fact) => fact.type)).toEqual([
      'cast',
      'cast.ability',
      'gcd',
      'buff',
      'resource',
    ]);
    expect(facts.every((fact) => fact.type.length > 0)).toBe(true);
  });

  it('computes the opt-in groups only when requested', () => {
    const input = makeInput({
      events: [
        cast(0, 1, 'A'),
        {
          timestamp: 1_000,
          type: 'damage',
          sourceId: 1,
          targetId: 5,
          amount: 42,
          abilityId: 9,
          abilityName: 'Bolt',
          fightId: 8,
        },
      ],
    });

    const withoutOptIn = buildCombatFacts(input);
    expect(withoutOptIn.damage).toBeUndefined();
    expect(withoutOptIn.death).toBeUndefined();
    expect(withoutOptIn.target).toBeUndefined();
    expect(withoutOptIn.dispel).toBeUndefined();
    expect(withoutOptIn.interrupt).toBeUndefined();

    const withOptIn = buildCombatFacts(input, {
      damage: true,
      target: true,
      dispel: true,
      interrupt: true,
    });
    expect(withOptIn.damage?.totalDamage).toBe(42);
    expect(withOptIn.target?.targetCount).toBe(1);
    expect(withOptIn.dispel?.count).toBe(0);
    expect(withOptIn.interrupt?.count).toBe(0);
    expect(withOptIn.death).toBeUndefined();

    const flattened = listFacts(withOptIn);
    expect(flattened.map((fact) => fact.type)).toContain('damage');
    expect(flattened.map((fact) => fact.type)).toContain('damage.ability');
    expect(flattened.map((fact) => fact.type)).toContain('target');
  });
});
