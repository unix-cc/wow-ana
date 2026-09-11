import { describe, it, expect } from 'vitest';
import type { CombatEvent } from '@wcl/domain';
import type { DecisionState } from '../src/priority/types.js';
import { buildObservedDecisions } from '../src/priority/state.js';
import {
  makePriorityKnowledge,
  TEST_ABILITIES,
  TEST_BUFFS,
  TEST_RESOURCES,
  fillerRule,
} from './priority-fixtures.js';

const BL = TEST_ABILITIES.blast.abilityId;
const MS = TEST_ABILITIES.missiles.abilityId;
const ORB = TEST_ABILITIES.orb.abilityId;
const SURGE = TEST_ABILITIES.surge.abilityId;
const PROC = TEST_BUFFS.proc.abilityId;
const SALVO = TEST_BUFFS.salvo.abilityId;
const CHARGES = TEST_BUFFS.charges.abilityId;

function makeKnowledge() {
  return makePriorityKnowledge({
    abilities: [
      TEST_ABILITIES.blast,
      TEST_ABILITIES.missiles,
      TEST_ABILITIES.barrage,
      TEST_ABILITIES.orb,
      TEST_ABILITIES.surge,
    ],
    buffs: [
      TEST_BUFFS.proc,
      TEST_BUFFS.charges,
      TEST_BUFFS.salvo,
    ],
    resources: TEST_RESOURCES,
    rules: [fillerRule('blast', 'test.filler')],
  });
}

function cast(
  timestamp: number,
  abilityId: number,
  abilityName: string,
  sourceId = 1,
): CombatEvent {
  return { timestamp, type: 'cast', sourceId, abilityId, abilityName, fightId: 8 };
}

function begincast(
  timestamp: number,
  abilityId: number,
  abilityName: string,
  sourceId = 1,
): CombatEvent {
  return { timestamp, type: 'begincast', sourceId, abilityId, abilityName, fightId: 8 };
}

function selfBuff(
  timestamp: number,
  rawType: string,
  abilityId: number,
  abilityName: string,
  sourceId = 1,
): CombatEvent {
  return {
    timestamp,
    type: 'buff',
    rawType,
    sourceId,
    targetId: sourceId,
    abilityId,
    abilityName,
    fightId: 8,
  };
}

function damageOn(
  timestamp: number,
  targetId: number,
  targetIsFriendly = false,
  sourceId = 1,
): CombatEvent {
  return {
    timestamp,
    type: 'damage',
    sourceId,
    targetId,
    abilityId: 900,
    abilityName: 'Bolt',
    amount: 100,
    hitType: 'normal',
    targetIsFriendly,
    fightId: 8,
  };
}

function focus(
  timestamp: number,
  amount: number,
  delta: number,
  sourceId = 1,
): CombatEvent {
  return {
    timestamp,
    type: 'resource',
    sourceId,
    resourceType: 'Focus',
    resourceAmount: amount,
    amount: delta,
    fightId: 8,
  };
}

describe('buildObservedDecisions', () => {
  it('emits one decision per begincast for casted spells, none for the completion cast', () => {
    const events = [
      begincast(1000, SURGE, 'Surge'),
      cast(4600, SURGE, 'Surge'), // completion of the channel
      begincast(2000, BL, 'Blast'),
      cast(5000, BL, 'Blast'),
    ];
    const { decisions, skippedUnmappedCasts } = buildObservedDecisions({
      playerId: 1,
      events,
      knowledge: makeKnowledge(),
    });
    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toMatchObject({ time: 1000, actualKey: 'surge' });
    expect(decisions[1]).toMatchObject({ time: 2000, actualKey: 'blast' });
    expect(skippedUnmappedCasts).toBe(0);
  });

  it('emits one decision per instant cast', () => {
    const events = [
      cast(0, MS, 'Missiles'),
      cast(1500, MS, 'Missiles'),
      cast(3000, BL, 'Blast'),
    ];
    const { decisions } = buildObservedDecisions({
      playerId: 1,
      events,
      knowledge: makeKnowledge(),
    });
    expect(decisions.map((d) => d.actualKey)).toEqual(['missiles', 'missiles', 'blast']);
  });

  it('counts casts that hit no knowledge ability as unmapped', () => {
    const events = [
      cast(0, MS, 'Missiles'),
      cast(1500, 999, 'Pet Swipe'), // pet / unmodeled ability
      cast(3000, BL, 'Blast'),
    ];
    const { decisions, skippedUnmappedCasts } = buildObservedDecisions({
      playerId: 1,
      events,
      knowledge: makeKnowledge(),
    });
    expect(decisions).toHaveLength(2);
    expect(skippedUnmappedCasts).toBe(1);
  });

  it('tracks self-buff presence and stack counters from ±1 stack events', () => {
    const events = [
      selfBuff(0, 'applybuff', PROC, 'Proc'),
      selfBuff(0, 'applybuff', SALVO, 'Salvo'), // 1
      selfBuff(1000, 'applybuffstack', SALVO, 'Salvo'), // 2
      selfBuff(2000, 'applybuffstack', SALVO, 'Salvo'), // 3
      cast(3000, BL, 'Blast'),
      selfBuff(3500, 'removebuff', PROC, 'Proc'),
      selfBuff(4000, 'removebuffstack', SALVO, 'Salvo'), // 2
      cast(4500, BL, 'Blast'),
      selfBuff(5000, 'removebuff', SALVO, 'Salvo'), // gone
      cast(5500, BL, 'Blast'),
    ];
    const { decisions } = buildObservedDecisions({
      playerId: 1,
      events,
      knowledge: makeKnowledge(),
    });
    expect(decisions).toHaveLength(3);

    const first = decisions[0]?.state as DecisionState;
    expect(first.buffsActive.has('proc')).toBe(true);
    expect(first.buffsActive.has('salvo')).toBe(true);
    expect(first.buffStacks.get('salvo')).toBe(3);

    const second = decisions[1]?.state as DecisionState;
    expect(second.buffsActive.has('proc')).toBe(false);
    expect(second.buffStacks.get('salvo')).toBe(2);

    const third = decisions[2]?.state as DecisionState;
    expect(third.buffsActive.has('salvo')).toBe(false);
    expect(third.buffStacks.get('salvo')).toBe(0);
  });

  it('derives cooldown readiness from knowledge cooldownMs', () => {
    const events = [
      cast(0, ORB, 'Orb'), // cd 20s -> ready again at 20000
      cast(10_000, BL, 'Blast'), // orb still on cd
      begincast(21_000, BL, 'Blast'), // orb back up
    ];
    const { decisions } = buildObservedDecisions({
      playerId: 1,
      events,
      knowledge: makeKnowledge(),
    });
    const at10k = decisions[1]?.state as DecisionState;
    expect(at10k.ready.has('orb')).toBe(false);
    const at21k = decisions[2]?.state as DecisionState;
    expect(at21k.ready.has('orb')).toBe(true);
  });

  it('converts resource amounts to percent-of-cap only when a cap exists', () => {
    const events = [focus(1000, 42, 0), cast(2000, BL, 'Blast')];
    const { decisions } = buildObservedDecisions({
      playerId: 1,
      events,
      knowledge: makeKnowledge(),
    });
    const state = decisions[0]?.state as DecisionState;
    expect(state.resource).toBe(42);
    expect(state.observable.resource).toBe(true);
  });

  it('counts distinct enemies damaged inside the trailing window', () => {
    const events = [
      damageOn(0, 11),
      damageOn(500, 12),
      cast(1000, BL, 'Blast'), // 2 enemies in window
      cast(7000, BL, 'Blast'), // stale -> 0 enemies
    ];
    const { decisions } = buildObservedDecisions({
      playerId: 1,
      events,
      knowledge: makeKnowledge(),
      targetWindowMs: 5000,
    });
    const near = decisions[0]?.state as DecisionState;
    expect(near.targetCount).toBe(2);
    const later = decisions[1]?.state as DecisionState;
    expect(later.targetCount).toBe(0);
  });

  it('ignores friendly damage and marks target count unobservable without a damage feed', () => {
    const events = [
      damageOn(0, 55, true), // friendly — excluded
      cast(1000, BL, 'Blast'),
    ];
    const { decisions } = buildObservedDecisions({
      playerId: 1,
      events,
      knowledge: makeKnowledge(),
    });
    const state = decisions[0]?.state as DecisionState;
    expect(state.targetCount).toBe(0);
    expect(state.observable.targetCount).toBe(true); // damage feed exists
  });

  it('marks buff observability false when no buff events reach the player', () => {
    const events = [cast(0, BL, 'Blast'), cast(1500, MS, 'Missiles')];
    const { decisions } = buildObservedDecisions({
      playerId: 1,
      events,
      knowledge: makeKnowledge(),
    });
    const state = decisions[0]?.state as DecisionState;
    expect(state.observable.buff).toBe(false);
    expect(state.buffsActive.size).toBe(0);
  });
});
