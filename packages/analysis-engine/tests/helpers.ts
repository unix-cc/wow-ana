import type { AnalysisContext, CombatEvent } from '@wcl/domain';

/**
 * Epoch base for the mock report. Real WCL frames: `report.startTime` is
 * epoch, `fight.startTime` and event timestamps are report-relative offsets,
 * and the knowledge registry resolves at `report.startTime + fight.startTime`.
 * The base sits inside every knowledge effective window (>= 2026-01-01).
 */
const REPORT_EPOCH_BASE = Date.parse('2026-01-01T00:00:00.000Z');

export function makeContext(overrides?: {
  playerId?: number;
  fightStart?: number;
  fightEnd?: number;
  events?: CombatEvent[];
  zoneName?: string;
  fightDifficulty?: 'N' | 'H' | 'M' | number;
  reportStart?: number;
}): AnalysisContext {
  const playerId = overrides?.playerId ?? 1;
  const fightStart = overrides?.fightStart ?? 0;
  const fightEnd = overrides?.fightEnd ?? 100_000;
  const reportStart = overrides?.reportStart ?? REPORT_EPOCH_BASE;

  return {
    report: {
      code: 'ABC123',
      startTime: reportStart,
      endTime: reportStart + Math.max(0, fightEnd - fightStart),
      zone: { id: 1000, name: overrides?.zoneName ?? 'Nerub-ar Palace' },
    },
    fight: {
      id: 8,
      name: 'Fight 8',
      startTime: fightStart,
      endTime: fightEnd,
      ...(overrides?.fightDifficulty !== undefined
        ? { difficulty: overrides.fightDifficulty }
        : {}),
    },
    player: {
      id: playerId,
      name: 'Hero',
      type: 'Player',
    },
    events: overrides?.events ?? [],
  };
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

export function damage(
  timestamp: number,
  abilityId: number,
  abilityName: string,
  amount: number,
  hitType: 'normal' | 'crit' = 'normal',
  sourceId = 1,
  targetId = 1,
): CombatEvent {
  return {
    timestamp,
    type: 'damage',
    sourceId,
    targetId,
    abilityId,
    abilityName,
    amount,
    hitType,
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

export function debuff(
  timestamp: number,
  rawType: 'applydebuff' | 'refreshdebuff' | 'removedebuff',
  abilityId: number,
  abilityName: string,
  targetId = 1,
): CombatEvent {
  return {
    timestamp,
    type: 'debuff',
    rawType,
    sourceId: 1,
    targetId,
    abilityId,
    abilityName,
    fightId: 8,
  };
}

export function death(timestamp: number, targetId = 1): CombatEvent {
  return {
    timestamp,
    type: 'death',
    targetId,
    sourceId: 2,
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

export function interrupt(
  timestamp: number,
  targetId: number,
  targetName: string,
  sourceId = 1,
): CombatEvent {
  return {
    timestamp,
    type: 'interrupt',
    sourceId,
    targetId,
    targetName,
    fightId: 8,
  };
}

export function dispel(
  timestamp: number,
  targetId: number,
  targetName: string,
  sourceId = 1,
): CombatEvent {
  return {
    timestamp,
    type: 'dispel',
    sourceId,
    targetId,
    targetName,
    fightId: 8,
  };
}
