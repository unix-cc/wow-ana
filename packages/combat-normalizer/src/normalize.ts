import type { CombatEvent, CombatEventType, HitType } from '@wcl/domain';

/**
 * Map a WCL numeric hitType to a domain HitType label.
 * WCL hitType mapping: 0=miss,1=absorb,2=block,3=crit,4=normal,5=resisting,
 * 6=dodge,7=parry,8=immune,9=reflect,10=glancing,11=evade.
 */
const HIT_TYPE_MAP: Record<number, HitType> = {
  0: 'miss',
  1: 'absorb',
  2: 'block',
  3: 'crit',
  4: 'normal',
  5: 'resist',
  6: 'dodge',
  7: 'parry',
  8: 'immune',
  9: 'reflect',
  10: 'glancing',
  11: 'evade',
};

const TYPE_MAP: Record<string, CombatEventType> = {
  cast: 'cast',
  begincast: 'begincast',
  damage: 'damage',
  heal: 'heal',
  applybuff: 'buff',
  refreshbuff: 'buff',
  removebuff: 'buff',
  applydebuff: 'debuff',
  refreshdebuff: 'debuff',
  removedebuff: 'debuff',
  energize: 'resource',
  drain: 'resource',
  death: 'death',
  interrupt: 'interrupt',
  dispel: 'dispel',
  combatantinfo: 'combatantinfo',
};

/**
 * Normalize a single raw WCL event object into a domain CombatEvent.
 * Accepts loosely-typed GraphQL output and extracts known fields defensively.
 */
export function normalizeEvent(
  raw: Record<string, unknown>,
  fightId: number,
): CombatEvent {
  const rawType = typeof raw.type === 'string' ? raw.type : undefined;
  const mappedType = TYPE_MAP[rawType ?? ''] ?? 'other';

  const abilityRaw = raw.ability;
  const ability =
    typeof abilityRaw === 'object' && abilityRaw !== null
      ? (abilityRaw as { name?: string; guid?: number })
      : undefined;

  const abilityName =
    ability?.name ?? (typeof abilityRaw === 'string' ? abilityRaw : undefined);

  const timestamp = typeof raw.timestamp === 'number' ? raw.timestamp : 0;
  const hitTypeRaw = typeof raw.hitType === 'number' ? raw.hitType : undefined;
  const amount = typeof raw.amount === 'number' ? raw.amount : undefined;
  // WCL heal rows carry the overhealed portion separately (fully-overhealed
  // rows are amount 0 + overheal > 0) — verified live on 2026-09-09.
  const overheal = typeof raw.overheal === 'number' ? raw.overheal : undefined;
  const resourceAmount =
    typeof raw.resourceAmount === 'number' ? raw.resourceAmount : undefined;

  return {
    timestamp,
    type: mappedType,
    rawType: rawType,
    sourceId: numberOr(raw.sourceID),
    sourceName: strOr(raw.sourceName),
    targetId: numberOr(raw.targetID),
    targetName: strOr(raw.targetName),
    abilityId: numberOr(raw.abilityGameID) ?? ability?.guid,
    abilityName,
    amount,
    overheal,
    resourceType: strOr(raw.resourceType),
    resourceAmount,
    hitType:
      hitTypeRaw !== undefined
        ? (HIT_TYPE_MAP[hitTypeRaw] ?? 'normal')
        : undefined,
    targetIsFriendly: boolOr(raw.targetIsFriendly),
    sourceIsFriendly: boolOr(raw.sourceIsFriendly),
    fightId,
  };
}

function numberOr(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function strOr(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function boolOr(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function normalizeEvents(
  rawEvents: Array<Record<string, unknown>>,
  fightId: number,
): CombatEvent[] {
  return rawEvents.map((event) => normalizeEvent(event, fightId));
}
