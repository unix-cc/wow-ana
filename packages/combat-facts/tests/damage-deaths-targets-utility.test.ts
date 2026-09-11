import { describe, it, expect } from 'vitest';
import type { CombatEvent } from '@wcl/domain';
import { makeInput } from './helpers.js';
import {
  computeDamageFacts,
  computeDeathFacts,
  computeTargetFacts,
  computeDispelFacts,
  computeInterruptFacts,
} from '../src/index.js';

function damage(
  timestamp: number,
  sourceId: number,
  targetId: number,
  amount: number,
  extra?: Partial<CombatEvent>,
): CombatEvent {
  return {
    timestamp,
    type: 'damage',
    sourceId,
    targetId,
    amount,
    fightId: 8,
    ...extra,
  };
}

describe('computeDamageFacts', () => {
  it('groups damage by ability id with crit split and totals', () => {
    const events = [
      damage(1000, 1, 10, 100, { abilityId: 11, abilityName: 'Fireball' }),
      damage(2000, 1, 10, 200, {
        abilityId: 11,
        abilityName: 'Fireball',
        hitType: 'crit',
      }),
      damage(3000, 1, 10, 50, { abilityId: 12, abilityName: 'Pyro' }),
      // Another source's damage must not count.
      damage(4000, 2, 10, 999, { abilityId: 11, abilityName: 'Fireball' }),
    ];

    const facts = computeDamageFacts(makeInput({ events }));
    expect(facts.type).toBe('damage');
    expect(facts.totalDamage).toBe(350);
    expect(facts.firstTimestamp).toBe(1000);
    expect(facts.lastTimestamp).toBe(3000);

    expect(facts.abilities).toHaveLength(2);
    const fireball = facts.abilities[0];
    expect(fireball?.type).toBe('damage.ability');
    expect(fireball?.count).toBe(2);
    expect(fireball?.total).toBe(300);
    expect(fireball?.critCount).toBe(1);
    expect(fireball?.hitCount).toBe(1);
  });

  it('falls back to ability name when the id is missing', () => {
    const events = [
      damage(1000, 1, 10, 10, { abilityName: 'Unknown' }),
      damage(2000, 1, 10, 10, { abilityName: 'Unknown' }),
    ];
    const facts = computeDamageFacts(makeInput({ events }));
    expect(facts.abilities).toHaveLength(1);
    expect(facts.abilities[0]?.count).toBe(2);
  });

  it('returns zeroed facts for no damage', () => {
    const facts = computeDamageFacts(makeInput());
    expect(facts.totalDamage).toBe(0);
    expect(facts.abilities).toEqual([]);
    expect(facts.firstTimestamp).toBeUndefined();
    expect(facts.lastTimestamp).toBeUndefined();
  });
});

describe('computeDeathFacts', () => {
  const events: CombatEvent[] = [
    // Outside the default 5s window [5000, 10000]: excluded.
    damage(0, 5, 1, 50_000, { abilityId: 23, abilityName: 'Old' }),
    damage(6000, 5, 1, 100, { abilityId: 21, abilityName: 'Smash' }),
    damage(9000, 5, 1, 200, { abilityId: 22, abilityName: 'Crunch' }),
    {
      timestamp: 10_000,
      type: 'death',
      targetId: 1,
      sourceId: 5,
      fightId: 8,
    },
    // Someone else's death does not count.
    {
      timestamp: 11_000,
      type: 'death',
      targetId: 9,
      sourceId: 5,
      fightId: 8,
    },
  ];

  it('collects each death with its pre-death damage window', () => {
    const facts = computeDeathFacts(makeInput({ events }));
    expect(facts.type).toBe('death');
    expect(facts.deaths).toHaveLength(1);

    const incident = facts.deaths[0];
    expect(incident?.type).toBe('death.incident');
    expect(incident?.timestamp).toBe(10_000);
    expect(incident?.takenTotal).toBe(300);
    expect(incident?.takenEvents).toHaveLength(2);
    expect(incident?.takenEvents[0]?.timestamp).toBe(6000);
    expect(incident?.takenEvents[1]?.amount).toBe(200);
  });

  it('honours a custom window and target', () => {
    const narrow = computeDeathFacts(makeInput({ events }), {
      targetId: 1,
      preDeathWindowMs: 1500,
    });
    const incident = narrow.deaths[0];
    expect(incident?.takenEvents).toHaveLength(1);
    expect(incident?.takenTotal).toBe(200);
  });
});

describe('computeTargetFacts', () => {
  it('counts targets, switches, and skips events without targetId', () => {
    const events = [
      damage(1000, 1, 10, 100),
      damage(2000, 1, 10, 100),
      damage(3000, 1, 20, 50), // switch 1
      damage(4000, 1, 10, 100), // switch 2
      { timestamp: 4500, type: 'damage', sourceId: 1, amount: 5, fightId: 8 }, // no target
      damage(5000, 2, 10, 999), // other source
    ];

    const facts = computeTargetFacts(makeInput({ events }));
    expect(facts.type).toBe('target');
    expect(facts.targetCount).toBe(2);
    expect(facts.switches).toBe(2);

    const primary = facts.targets[0];
    expect(primary?.targetId).toBe(10);
    expect(primary?.hits).toBe(3);
    expect(primary?.total).toBe(300);
    expect(facts.targets[1]?.targetId).toBe(20);
  });
});

describe('computeDispelFacts', () => {
  it('counts all dispels but groups only those with a target', () => {
    const events: CombatEvent[] = [
      {
        timestamp: 1000,
        type: 'dispel',
        sourceId: 1,
        targetId: 7,
        fightId: 8,
      },
      {
        timestamp: 2000,
        type: 'dispel',
        sourceId: 1,
        targetId: 7,
        fightId: 8,
      },
      { timestamp: 3000, type: 'dispel', sourceId: 1, fightId: 8 }, // no target
      { timestamp: 4000, type: 'dispel', sourceId: 2, targetId: 7, fightId: 8 },
    ];

    const facts = computeDispelFacts(makeInput({ events }));
    expect(facts.type).toBe('dispel');
    expect(facts.count).toBe(3);
    expect(facts.byTarget).toHaveLength(1);
    expect(facts.byTarget[0]?.count).toBe(2);
  });
});

describe('computeInterruptFacts', () => {
  it('counts interrupts and distinct targets', () => {
    const events: CombatEvent[] = [
      {
        timestamp: 1000,
        type: 'interrupt',
        sourceId: 1,
        targetId: 7,
        fightId: 8,
      },
      {
        timestamp: 2000,
        type: 'interrupt',
        sourceId: 1,
        targetId: 8,
        fightId: 8,
      },
      {
        timestamp: 3000,
        type: 'interrupt',
        sourceId: 2,
        targetId: 9,
        fightId: 8,
      },
    ];

    const facts = computeInterruptFacts(makeInput({ events }));
    expect(facts.type).toBe('interrupt');
    expect(facts.count).toBe(2);
    expect(facts.distinctTargets).toBe(2);
    expect(facts.byTarget.map((entry) => entry.targetId)).toEqual([7, 8]);
  });
});
