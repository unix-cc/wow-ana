import type { CombatEvent, Fight, Player } from '@wcl/domain';

/**
 * Minimum input required to compute facts about one actor in one fight.
 *
 * Facts depend on the internal combat model only — never on raw WCL payloads
 * and never on Spec Knowledge.
 */
export interface FactsInput {
  fight: Fight;
  player: Player;
  events: CombatEvent[];
}

/** Facts computed *by* an actor (casts, resources, ...). */
export interface SourceFactsOptions {
  sourceId?: number | undefined;
}

/** Facts computed *on* an actor (buffs received, ...). */
export interface TargetFactsOptions {
  targetId?: number | undefined;
}

export interface GcdFactsOptions extends SourceFactsOptions {
  gcdMs?: number | undefined;
  idleThresholdMs?: number | undefined;
}

/** A cooldown declared by Spec Knowledge, not by WCL. */
export interface CooldownDefinition {
  abilityId?: number | undefined;
  abilityName?: string | undefined;
  cooldownMs: number;
}

export interface CooldownFactsOptions extends SourceFactsOptions {
  cooldowns: CooldownDefinition[];
}

/** Death facts options: the tracked target plus its pre-death window. */
export interface DeathFactsOptions extends TargetFactsOptions {
  preDeathWindowMs?: number | undefined;
}

export interface CombatFactsOptions extends GcdFactsOptions, TargetFactsOptions {
  cooldowns?: CooldownDefinition[] | undefined;
  /**
   * Opt-in fact groups. The always-on groups (cast/gcd/buff/resource) keep
   * their cost profile; these heavier groups are computed only on request so
   * a caller can follow "Analysis Requirement → Data Requirement".
   */
  damage?: boolean | undefined;
  death?: boolean | undefined;
  target?: boolean | undefined;
  dispel?: boolean | undefined;
  interrupt?: boolean | undefined;
  /** Pre-death damage window for death facts (default 5000 ms). */
  preDeathWindowMs?: number | undefined;
}
