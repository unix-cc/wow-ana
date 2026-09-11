export type CombatEventType =
  | 'cast'
  | 'damage'
  | 'heal'
  | 'buff'
  | 'debuff'
  | 'resource'
  | 'death'
  | 'interrupt'
  | 'dispel'
  | 'combatantinfo'
  | 'begincast'
  | 'other';

export type HitType =
  | 'normal'
  | 'crit'
  | 'miss'
  | 'dodge'
  | 'parry'
  | 'resist'
  | 'immune'
  | 'glancing'
  | 'block'
  | 'absorb'
  | 'reflect'
  | 'evade';

export interface CombatEvent {
  timestamp: number;
  type: CombatEventType;
  /** Original WCL event type (e.g. "applybuff", "refreshbuff"). */
  rawType?: string | undefined;
  sourceId?: number | undefined;
  sourceName?: string | undefined;
  targetId?: number | undefined;
  targetName?: string | undefined;
  abilityId?: number | undefined;
  abilityName?: string | undefined;
  abilityGuid?: number | undefined;
  amount?: number | undefined;
  /**
   * Overheal portion of a heal row (WCL `overheal`, verified live 2026-09-09:
   * fully-overhealed rows carry amount 0 + overheal > 0). Heals only.
   */
  overheal?: number | undefined;
  resourceType?: string | undefined;
  resourceAmount?: number | undefined;
  hitType?: HitType | undefined;
  fightId: number;
  targetIsFriendly?: boolean | undefined;
  sourceIsFriendly?: boolean | undefined;
}

export interface CastEvent extends CombatEvent {
  type: 'cast';
}

export interface BuffEvent extends CombatEvent {
  type: 'buff' | 'debuff';
}

export interface DamageEvent extends CombatEvent {
  type: 'damage';
}

export interface DeathEvent extends CombatEvent {
  type: 'death';
}

export interface ResourceEvent extends CombatEvent {
  type: 'resource';
}
