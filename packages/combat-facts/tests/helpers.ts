import type { CombatEvent, Fight, Player } from '@wcl/domain';
import type { FactsInput } from '../src/types.js';

export function makeInput(overrides?: {
  playerId?: number;
  fightStart?: number;
  fightEnd?: number;
  events?: CombatEvent[];
}): FactsInput {
  const playerId = overrides?.playerId ?? 1;
  const fightStart = overrides?.fightStart ?? 0;
  const fightEnd = overrides?.fightEnd ?? 100_000;

  const fight: Fight = {
    id: 8,
    name: 'Fight 8',
    startTime: fightStart,
    endTime: fightEnd,
  };
  const player: Player = { id: playerId, name: 'Hero', type: 'Player' };

  return { fight, player, events: overrides?.events ?? [] };
}

export function cast(
  timestamp: number,
  abilityId: number,
  abilityName: string,
  sourceId = 1,
): CombatEvent {
  return {
    timestamp,
    type: 'cast',
    sourceId,
    abilityId,
    abilityName,
    fightId: 8,
  };
}

export function buff(
  timestamp: number,
  rawType: 'applybuff' | 'refreshbuff' | 'removebuff',
  abilityId: number,
  abilityName: string,
  targetId = 1,
): CombatEvent {
  return {
    timestamp,
    type: 'buff',
    rawType,
    sourceId: 1,
    targetId,
    abilityId,
    abilityName,
    fightId: 8,
  };
}

export function resource(
  timestamp: number,
  resourceType: string,
  resourceAmount: number,
  delta: number,
  sourceId = 1,
): CombatEvent {
  return {
    timestamp,
    type: 'resource',
    sourceId,
    resourceType,
    resourceAmount,
    amount: delta,
    fightId: 8,
  };
}
