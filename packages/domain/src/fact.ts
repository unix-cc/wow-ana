import type { Evidence } from './analysis.js';

/**
 * Generic view of a combat fact.
 *
 * A Combat Fact is an **objective, program-computed observation** derived from
 * normalized combat events. Facts never decide whether something is good or
 * bad — they only describe what happened. The decision belongs to the
 * Analysis Engine (see `Verdict`).
 *
 * Every fact carries optional `evidence` so any later Finding can be traced
 * back to concrete timestamps / abilities / values.
 */
export interface CombatFact {
  /** Stable discriminator, e.g. `cast.ability`, `buff.uptime`. */
  type: string;
  /** Fight-absolute timestamp (ms) when the fact describes a point in time. */
  timestamp?: number | undefined;
  /** Primary numeric value of the fact (count, ratio, ms, ...). */
  value?: number | undefined;
  /** Primary subject of the fact (ability name, resource type, ...). */
  source?: string | undefined;
  /** Secondary subject (target name) when the fact is directional. */
  target?: string | undefined;
  /** Traceable evidence backing this fact. */
  evidence?: Evidence[] | undefined;
}

/** A single idle window where the player was not casting. */
export interface IdleWindow {
  start: number;
  end: number;
  durationMs: number;
}

/** Cast facts for one ability. */
export interface AbilityCastFact extends CombatFact {
  type: 'cast.ability';
  abilityId?: number | undefined;
  abilityName?: string | undefined;
  count: number;
  firstTimestamp?: number | undefined;
  lastTimestamp?: number | undefined;
  minIntervalMs?: number | undefined;
  maxIntervalMs?: number | undefined;
  avgIntervalMs?: number | undefined;
}

export interface CastFacts extends CombatFact {
  type: 'cast';
  totalCasts: number;
  abilities: AbilityCastFact[];
}

/** Per-cast delay sample relative to the ideal cooldown cadence. */
export interface CooldownDelaySample {
  /** Actual cast timestamp (fight-absolute ms). */
  timestamp: number;
  /** Ideal (on-cadence) timestamp for this cast. */
  idealTimestamp: number;
  /** `max(0, timestamp - idealTimestamp)`. */
  delayMs: number;
}

export interface CooldownUsageFact extends CombatFact {
  type: 'cooldown.usage';
  abilityId?: number | undefined;
  abilityName?: string | undefined;
  /** Configured cooldown length in ms (from Spec Knowledge, not from WCL). */
  cooldownMs: number;
  actualCasts: number;
  /** Theoretical casts allowed by the fight duration. */
  expectedCasts: number;
  averageDelayMs?: number | undefined;
  maxDelayMs?: number | undefined;
  missedFinalCast?: boolean | undefined;
  /** Raw delay samples; the evidence source for delay findings. */
  delays: CooldownDelaySample[];
}

export interface CooldownFacts extends CombatFact {
  type: 'cooldown';
  usages: CooldownUsageFact[];
}

export interface BuffUptimeFact extends CombatFact {
  type: 'buff.uptime';
  abilityId?: number | undefined;
  abilityName?: string | undefined;
  /** Fraction of the fight window the buff was active (0..1). */
  uptime: number;
  downtimeMs: number;
  maxStacks?: number | undefined;
  avgStacks?: number | undefined;
  refreshCount: number;
}

export interface BuffFacts extends CombatFact {
  type: 'buff';
  buffs: BuffUptimeFact[];
}

export interface ResourceSeriesFact extends CombatFact {
  type: 'resource.series';
  resourceType?: string | undefined;
  eventCount: number;
  peak: number;
  min: number;
  /** When the peak was observed; keeps the aggregate traceable. */
  peakTimestamp?: number | undefined;
  /** When the minimum was observed. */
  minTimestamp?: number | undefined;
  totalGained: number;
  totalSpent: number;
}

export interface ResourceFacts extends CombatFact {
  type: 'resource';
  resources: ResourceSeriesFact[];
}

export interface GcdFacts extends CombatFact {
  type: 'gcd';
  totalGcd: number;
  idleMs: number;
  /** Idle time as a fraction of the fight duration (0..1). */
  idlePercent: number;
  idleWindows: IdleWindow[];
}

/** Damage dealt by one ability (grouped by ability id, falling back to name). */
export interface DamageAbilityFact extends CombatFact {
  type: 'damage.ability';
  abilityId?: number | undefined;
  abilityName?: string | undefined;
  count: number;
  total: number;
  critCount: number;
  hitCount: number;
}

/** Damage dealt by a source, broken down by ability. */
export interface DamageFacts extends CombatFact {
  type: 'damage';
  totalDamage: number;
  /** Timestamp of the first damage event (undefined when nothing landed). */
  firstTimestamp?: number | undefined;
  /** Timestamp of the last damage event. */
  lastTimestamp?: number | undefined;
  /** Sorted by total damage descending. */
  abilities: DamageAbilityFact[];
}

/** One damage-taken event inside a pre-death window. */
export interface DamageTakenSample {
  timestamp: number;
  abilityName?: string | undefined;
  abilityId?: number | undefined;
  sourceName?: string | undefined;
  amount: number;
}

/** One death of the tracked target, with its pre-death damage window. */
export interface DeathIncidentFact extends CombatFact {
  type: 'death.incident';
  timestamp: number;
  /** Damage taken during the pre-death window. */
  takenTotal: number;
  /** Chronological damage-taken samples. */
  takenEvents: DamageTakenSample[];
}

export interface DeathFacts extends CombatFact {
  type: 'death';
  deaths: DeathIncidentFact[];
}

/** Damage dealt to one target. */
export interface TargetDamageFact extends CombatFact {
  type: 'target.damage';
  targetId?: number | undefined;
  targetName?: string | undefined;
  /** Number of damage events against this target. */
  hits: number;
  /** Total damage dealt to this target. */
  total: number;
}

export interface TargetFacts extends CombatFact {
  type: 'target';
  /** Distinct targets that received damage. */
  targetCount: number;
  /** Number of target switches in the damage timeline. */
  switches: number;
  /** Sorted by total damage descending. */
  targets: TargetDamageFact[];
}

/** Dispels initiated by the tracked source against one target. */
export interface DispelByTargetFact extends CombatFact {
  type: 'dispel.target';
  targetId?: number | undefined;
  targetName?: string | undefined;
  count: number;
}

export interface DispelFacts extends CombatFact {
  type: 'dispel';
  /** Total dispel events where the source was the dispeller. */
  count: number;
  /** Sorted by count descending. */
  byTarget: DispelByTargetFact[];
}

/** Interrupts initiated by the tracked source against one target. */
export interface InterruptByTargetFact extends CombatFact {
  type: 'interrupt.target';
  targetId?: number | undefined;
  targetName?: string | undefined;
  count: number;
}

export interface InterruptFacts extends CombatFact {
  type: 'interrupt';
  /** Total interrupt events where the source was the interrupter. */
  count: number;
  distinctTargets: number;
  /** Sorted by count descending. */
  byTarget: InterruptByTargetFact[];
}

/**
 * The complete set of facts computed for one player in one fight.
 *
 * Facts are grouped by domain; each group is optional so a caller can compute
 * only what its analyzers need (Analysis Requirement → Data Requirement).
 */
export interface FactSet {
  fight: { id: number; startTime: number; endTime: number };
  player: { id: number; name?: string | undefined };
  cast?: CastFacts | undefined;
  gcd?: GcdFacts | undefined;
  cooldown?: CooldownFacts | undefined;
  buff?: BuffFacts | undefined;
  resource?: ResourceFacts | undefined;
  damage?: DamageFacts | undefined;
  death?: DeathFacts | undefined;
  target?: TargetFacts | undefined;
  dispel?: DispelFacts | undefined;
  interrupt?: InterruptFacts | undefined;
}

/** Flatten a FactSet into a list of concrete facts (stable order). */
export function listFacts(set: FactSet): CombatFact[] {
  const facts: CombatFact[] = [];
  if (set.cast) {
    facts.push(set.cast, ...set.cast.abilities);
  }
  if (set.gcd) facts.push(set.gcd);
  if (set.cooldown) facts.push(set.cooldown, ...set.cooldown.usages);
  if (set.buff) facts.push(set.buff, ...set.buff.buffs);
  if (set.resource) facts.push(set.resource, ...set.resource.resources);
  if (set.damage) facts.push(set.damage, ...set.damage.abilities);
  if (set.death) facts.push(set.death, ...set.death.deaths);
  if (set.target) facts.push(set.target, ...set.target.targets);
  if (set.dispel) facts.push(set.dispel, ...set.dispel.byTarget);
  if (set.interrupt) facts.push(set.interrupt, ...set.interrupt.byTarget);
  return facts;
}
