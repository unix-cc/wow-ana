import type { Verdict } from '@wcl/domain';
import type { SpecKnowledge } from '@wcl/spec-knowledge';

/**
 * Verdict scale used by the priority evaluator. `mistake` is only reachable
 * when the underlying rule has confidence >= MIN_MISTAKE_CONFIDENCE and every
 * relevant state dimension was observable.
 */
export type { Verdict };

/**
 * The state snapshot at one player decision (one GCD choice).
 *
 * All dimensions are keyed by the **knowledge keys** (ability / buff keys),
 * never by raw WCL ids — the evaluator works purely on resolved knowledge.
 */
export interface DecisionState {
  /** Fight-absolute timestamp of the decision. */
  time: number;
  /** Self aura keys currently active on the player. */
  buffsActive: Set<string>;
  /** Stack-counter keys -> current stacks (only for `stacks: true` auras). */
  buffStacks: Map<string, number>;
  /** Ability keys whose cooldown is up (ready to cast). */
  ready: Set<string>;
  /**
   * Current resource as **percent of cap (0..100)** when the spec declares a
   * hard cap (ResourceKnowledge.cap) and the feed carries resource events.
   * `undefined` when the unit cannot be reconstructed (e.g. Mana without a
   * known cap) — resource conditions must then evaluate to `unknown`.
   */
  resource?: number | undefined;
  /** Distinct enemies damaged by the player shortly before the decision. */
  targetCount: number;
  /**
   * Which dimensions were actually observable from the fetched events.
   * A missing feed must degrade to `unknown`, never to a confident verdict.
   */
  observable: { buff: boolean; resource: boolean; targetCount: boolean };
}

/** The player's actual choice at one decision point. */
export interface ObservedDecision {
  time: number;
  actualKey: string;
  actualAbilityId?: number | undefined;
  state: DecisionState;
}

/**
 * One cast-anchored burst window definition. The window itself is
 * `[castTime, castTime + durationMs]` — anchored to cast timestamps, never
 * to aura state (WCL's Buffs channel does not return burst-aura events,
 * probe-verified 2026-09). Knowledge declares which cooldowns open a burst
 * window via `CooldownKnowledge.burstDurationMs`.
 */
export interface BurstWindow {
  /** Cooldown key (knowledge key, e.g. `arcane_surge`). */
  key: string;
  name: string;
  abilityId?: number | undefined;
  /** Window length in ms. */
  durationMs: number;
  /** Fight-absolute cast timestamps that opened windows. */
  casts: number[];
}

/** One evaluated decision. */
export interface DecisionRecord {
  time: number;
  actualKey: string;
  actualAbilityId?: number | undefined;
  /** Action the priority list required, when determinable. */
  expectedKey?: string | undefined;
  expectedRuleId?: string | undefined;
  /** Spell id of `expectedKey` (from knowledge), for display-name lookup. */
  expectedAbilityId?: number | undefined;
  /** Rule that legitimately explains the actual cast (later priority). */
  acceptableRuleId?: string | undefined;
  verdict: Verdict;
  /** Confidence of the rule that anchored this verdict. */
  confidence?: number | undefined;
  /** Why the verdict could not be stronger (unobservable dimensions). */
  reasons: string[];
  /** 0-based rule index of `expectedKey` inside `knowledge.priority`. */
  expectedRuleIndex?: number | undefined;
  /**
   * True when this decision fell inside a burst window (cast-anchored, see
   * `BurstWindow`). Bucketing only — it never feeds a verdict.
   */
  inBurst?: boolean | undefined;
}

export interface PriorityEvaluationResult {
  /** Every sampled decision, in chronological order. */
  decisions: DecisionRecord[];
  breakdown: Record<Verdict, number>;
  /** Number of rule evaluations skipped because the action was unmapped. */
  skippedUnmappedCasts: number;
  /**
   * Cast-anchored burst windows (knowledge cooldowns that declare
   * `burstDurationMs`). Empty/absent when the spec declares no burst
   * anchors or none of them was ever cast.
   */
  burstWindows?: BurstWindow[] | undefined;
  /**
   * Scene the fight was evaluated in: the majority scenario across sampled
   * decisions whose target count was observable. Falls back to `'st'` when no
   * decision carried a target count.
   */
  scenario: 'st' | 'aoe';
  /** Knowledge used for this evaluation, for provenance. */
  knowledge: { specName: string; knowledgeVersion: string; patch?: string | undefined };
}

export interface EvaluateInput {
  /** Spec Knowledge whose `priority` drives the evaluation. */
  knowledge: SpecKnowledge;
  /** Ordered player decisions to evaluate. */
  decisions: ObservedDecision[];
  /** Fallback when no rule matched a decision (unmapped action handling). */
  maxSamples?: number | undefined;
}
