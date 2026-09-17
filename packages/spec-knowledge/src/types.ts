import type { KnowledgeSource, SpecKnowledgeRef } from '@wcl/domain';

/**
 * Spec Knowledge — the theory of how a specialization is meant to be played.
 *
 * Strictly separated from Combat Facts:
 *
 * ```text
 * Combat Facts    = 实际发生了什么  (from WCL, via @wcl/combat-facts)
 * Spec Knowledge  = 理论上应该怎么做 (from patch notes / simc / community)
 * ```
 *
 * Every entry carries a `source` and a `confidence`. The Analysis Engine must
 * not produce a `mistake` verdict from knowledge below
 * `MIN_MISTAKE_CONFIDENCE` (see `@wcl/domain`).
 */

export type AbilityKind = 'damage' | 'filler' | 'cooldown' | 'defensive' | 'aoe';

export interface AbilityKnowledge {
  /** Stable key used by rules and priority actions, e.g. `kill_command`. */
  key: string;
  /**
   * Game spell id as reported by WCL. `undefined` while the id is awaiting
   * verification — an unresolvable ability can never be matched to events,
   * so rules targeting it stay dormant until the id is filled in.
   */
  abilityId?: number | undefined;
  name: string;
  kind: AbilityKind;
  /** Cooldown in ms when the ability is gated by one. */
  cooldownMs?: number | undefined;
  /**
   * Minimum `actual / theoretical` cast ratio below which usage counts as
   * low. This is knowledge; the *severity* of the finding is engine policy.
   */
  minCastRatio?: number | undefined;
  source: KnowledgeSource;
  confidence: number;
}

export interface BuffKnowledge {
  key: string;
  /** Game spell id when verified; undefined while pending verification. */
  abilityId?: number | undefined;
  name: string;
  kind: 'buff' | 'debuff';
  /** Who carries it: the player (`self`) or the enemy (`enemy`). */
  appliesTo: 'self' | 'enemy';
  /** True when the aura is a numeric stack counter (e.g. Arcane Charges). */
  stacks?: boolean | undefined;
  /** Expected fraction of fight time the aura should be active (0..1). */
  expectedUptime?: number | undefined;
  source: KnowledgeSource;
  confidence: number;
}

export interface ResourceKnowledge {
  /** WCL resource label, e.g. `Focus`, `Mana`. */
  type: string;
  /** Resource cap when the spec has a hard cap. */
  cap?: number | undefined;
  source: KnowledgeSource;
  confidence: number;
}

export interface CooldownKnowledge {
  key: string;
  /** Game spell id when verified; undefined while pending verification. */
  abilityId?: number | undefined;
  name: string;
  cooldownMs: number;
  kind: 'offensive' | 'defensive';
  /**
   * Burst-window duration in ms when this cooldown opens a distinct
   * "burst phase" (e.g. Arcane Surge's empowered window, Avatar's 20 s
   * buff). Absent = the cooldown is NOT a burst anchor: short builders
   * (Arcane Orb, Kill Command) and marker/debuff abilities (Colossus
   * Smash, Execution Sentence) deliberately carry no value.
   *
   * Cast-anchored semantics: the burst window is
   * `[castTime, castTime + burstDurationMs]` — WCL's Buffs channel does
   * not return burst-aura events (verified on real logs, 2026-09), so the
   * window is anchored to the cast timestamp, not to aura state.
   *
   * The value is game knowledge (wowhead/icy-veins spell durations), an
   * approximation for window bucketing — it NEVER feeds a verdict, it only
   * decides which decisions are counted as in-burst vs filler.
   */
  burstDurationMs?: number | undefined;
  source: KnowledgeSource;
  confidence: number;
}

/**
 * A stack-counter predicate: the aura `key` must carry between `min` and
 * `max` stacks (both inclusive). Example: `齐射=25` → min 25 / max 25;
 * `齐射<12` → max 11; `充能<3` → max 2.
 */
export interface StackPredicate {
  /** Buff key that is a numeric stack counter. */
  key: string;
  min?: number | undefined;
  max?: number | undefined;
}

/**
 * A decision condition. Every field is optional: unspecified dimensions are
 * simply not constrained.
 */
export interface PriorityCondition {
  /** Minimum number of simultaneously active targets. */
  targetCountMin?: number | undefined;
  targetCountMax?: number | undefined;
  /** Resource amount thresholds (absolute). */
  resourceMin?: number | undefined;
  resourceMax?: number | undefined;
  /** Aura keys that must be active / must be missing. */
  buffActive?: string[] | undefined;
  buffMissing?: string[] | undefined;
  /** Stack-counter ranges (e.g. Arcane Charges, 齐射 stacks). */
  buffStacks?: StackPredicate[] | undefined;
  /** Ability keys whose cooldown must be ready. */
  cooldownReady?: string[] | undefined;
  /** Fight phase ids the rule applies to (encounter knowledge). */
  fightPhase?: string[] | undefined;
}

/**
 * `Condition → Action`. A priority list is **not** an ordered skill list:
 * the engine evaluates rules top-down against the live combat state and takes
 * the first action whose conditions hold.
 */
export interface PriorityRule {
  id: string;
  /** Ability key to cast when the conditions hold. */
  action: string;
  when: PriorityCondition;
  /**
   * Scenario the rule belongs to. `aoe` rules (e.g. 目标≥3 的弹幕) are
   * **removed entirely** from single-/dual-target evaluation — they do not
   * merely fail their target-count condition, they do not exist in that
   * scenario. Unset means the rule applies in both scenarios.
   */
  scenario?: 'st' | 'aoe' | undefined;
  source: KnowledgeSource;
  confidence: number;
  /** Why this rule exists — surfaced to the AI as explanation material. */
  rationale?: string | undefined;
}

export interface SpecKnowledge extends SpecKnowledgeRef {
  abilities: AbilityKnowledge[];
  buffs: BuffKnowledge[];
  debuffs: BuffKnowledge[];
  resources: ResourceKnowledge[];
  cooldowns: CooldownKnowledge[];
  /** Ordered `Condition → Action` list, most important first. */
  priority: PriorityRule[];
  /**
   * Supplementary rotational knowledge that does not fit the
   * Condition → Action shape (openers, channelling tricks, window micro).
   */
  notes?: KnowledgeNote[] | undefined;
  /** Every distinct source referenced by this knowledge entry. */
  sources: KnowledgeSource[];
  /** ISO date the entry becomes valid (patch launch). */
  effectiveFrom?: string | undefined;
  /** ISO date the entry stops being valid. */
  effectiveTo?: string | undefined;
}

export interface KnowledgeNote {
  id: string;
  title: string;
  /** Free-form prose, e.g. burst openers or channelling mechanics. */
  content: string;
  source: KnowledgeSource;
  confidence: number;
}
