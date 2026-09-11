import { canEscalateToMistake, type Verdict } from '@wcl/domain';
import type { PriorityCondition, PriorityRule, SpecKnowledge } from '@wcl/spec-knowledge';
import { buildKnowledgeIndex, type KnowledgeIndex } from './knowledge-index.js';
import type {
  DecisionRecord,
  DecisionState,
  EvaluateInput,
  ObservedDecision,
  PriorityEvaluationResult,
} from './types.js';

/**
 * Condition → Action priority evaluator.
 *
 * Evaluates every sampled GCD decision of a player against the `Condition →
 * Action` priority list of a `SpecKnowledge` entry and produces one 5-tier
 * `Verdict` per decision.
 *
 * ## Tier semantics (authoritative mapping)
 *
 * - **correct** — the player performed the top deterministic rule's action.
 * - **suboptimal** — a strictly better option was *deterministically* fireable
 *   (its conditions all held, observable) and the player instead performed a
 *   different, still condition-valid lower-priority action. Requires the
 *   expected rule to clear `MIN_MISTAKE_CONFIDENCE`.
 * - **acceptable** — the player performed a condition-valid action while the
 *   better option existed, but the expected rule's confidence is below
 *   `MIN_MISTAKE_CONFIDENCE`, so "better" is not authoritative enough to call
 *   suboptimal.
 * - **mistake** — the expected rule deterministically fired and no rule —
 *   fireable or indeterminate — explains the actual action. Gated by
 *   `canEscalateToMistake` and full observability of the expected rule.
 * - **unknown** — the expected action could not be determined (no rule fired;
 *   relevant state unobservable; an indeterminate rule might explain the
 *   actual cast; or the expected rule is too weak to escalate).
 *
 * A priority mismatch alone is **never** a mistake — see the guard rails
 * above and `@wcl/domain` `Verdict`.
 *
 * ## Scenario handling
 *
 * `scenario: 'aoe'` rules are **removed entirely** from single-/dual-target
 * evaluation (they do not merely fail their target-count condition). When the
 * target count is unobservable, aoe rules can only *explain* a cast
 * (yielding `unknown`), never fire.
 */

export interface PriorityEvaluatorContext {
  knowledge: SpecKnowledge;
  index: KnowledgeIndex;
}

/** 'fire' = conditions all hold; 'blocked' = some condition observably false;
 *  'unknown' = no condition false, but some condition is unobservable. */
export type ConditionOutcome = 'fire' | 'blocked' | 'unknown';

export type Scenario = 'aoe' | 'st' | 'unknown';

export function resolveScenario(state: DecisionState): Scenario {
  if (!state.observable.targetCount) return 'unknown';
  return state.targetCount >= 3 ? 'aoe' : 'st';
}

/** Whether a rule participates in a scenario, or may only explain. */
export type ScenarioGate = 'in' | 'out' | 'uncertain';

export function scenarioGate(rule: PriorityRule, scenario: Scenario): ScenarioGate {
  if (rule.scenario === undefined) {
    // Untagged rules encode the spec's single-target rotation. In multi-target
    // scenarios they may *explain* a cast but never anchor the expected
    // action: real M+ logs (fXdMjWKJbpna6yHv, 2026-09-09) showed them firing
    // as the expected action in AoE pulls → 24% suboptimal (Arcane) and 21%
    // mistake (Arms) — pure knowledge-coverage artifacts, because the specs'
    // actual AoE actions had no aoe-tagged rule to explain them. Judging the
    // ST rotation in AoE is only honest once the knowledge carries
    // scenario:'aoe' rules; until then the model stays silent there.
    // ('st' and 'unknown' keep the legacy behaviour: untagged rules fire.)
    return scenario === 'aoe' ? 'uncertain' : 'in';
  }
  if (scenario === 'unknown') {
    // Target count unobservable: a scenario-locked rule can explain a cast
    // but can never anchor a confident verdict.
    return 'uncertain';
  }
  return rule.scenario === scenario ? 'in' : 'out';
}

function evalPredicates(
  condition: PriorityCondition,
  state: DecisionState,
  ctx: PriorityEvaluatorContext,
): ConditionOutcome {
  const index = ctx.index;
  let outcome: ConditionOutcome = 'fire';

  const combine = (dimension: ConditionOutcome): void => {
    if (outcome === 'blocked') return; // blocked is terminal
    if (dimension === 'blocked') outcome = 'blocked';
    else if (dimension === 'unknown' && outcome === 'fire') outcome = 'unknown';
  };

  if (condition.targetCountMin !== undefined || condition.targetCountMax !== undefined) {
    if (!state.observable.targetCount) {
      combine('unknown');
    } else {
      const count = state.targetCount;
      if (condition.targetCountMin !== undefined && count < condition.targetCountMin) {
        combine('blocked');
      } else if (condition.targetCountMax !== undefined && count > condition.targetCountMax) {
        combine('blocked');
      } else {
        combine('fire');
      }
    }
  }

  if (condition.resourceMin !== undefined || condition.resourceMax !== undefined) {
    if (!state.observable.resource || state.resource === undefined) {
      combine('unknown');
    } else if (
      (condition.resourceMin !== undefined && state.resource < condition.resourceMin) ||
      (condition.resourceMax !== undefined && state.resource > condition.resourceMax)
    ) {
      combine('blocked');
    } else {
      combine('fire');
    }
  }

  const buffKeys = [...(condition.buffActive ?? [])];
  if (buffKeys.length > 0) {
    if (!state.observable.buff) {
      combine('unknown');
    } else {
      let allActive = true;
      for (const key of buffKeys) {
        if (!index.buffsByKey.has(key)) {
          allActive = false;
          break;
        }
        if (!state.buffsActive.has(key)) {
          allActive = false;
          break;
        }
      }
      combine(allActive ? 'fire' : 'blocked');
    }
  }

  const missingKeys = [...(condition.buffMissing ?? [])];
  if (missingKeys.length > 0) {
    if (!state.observable.buff) {
      combine('unknown');
    } else {
      let allMissing = true;
      for (const key of missingKeys) {
        if (index.buffsByKey.has(key) && state.buffsActive.has(key)) {
          allMissing = false;
          break;
        }
      }
      combine(allMissing ? 'fire' : 'blocked');
    }
  }

  const stackPredicates = [...(condition.buffStacks ?? [])];
  if (stackPredicates.length > 0) {
    if (!state.observable.buff) {
      combine('unknown');
    } else {
      let predicatesHold = true;
      let allTrackable = true;
      for (const pred of stackPredicates) {
        if (!index.stackBuffKeys.has(pred.key)) {
          predicatesHold = false;
          break;
        }
        // A stack counter whose knowledge entry has no abilityId can never be
        // matched to events (ids are the primary key), so its stack value is
        // permanently unobservable. Treating 0 stacks as "predicate holds"
        // would make e.g. `充能<3` fire on every decision — a silent false
        // positive. Honest downgrade: the condition cannot be verified.
        if (index.buffsByKey.get(pred.key)?.abilityId === undefined) {
          allTrackable = false;
          break;
        }
        const stacks = state.buffStacks.get(pred.key) ?? 0;
        if (pred.min !== undefined && stacks < pred.min) {
          predicatesHold = false;
          break;
        }
        if (pred.max !== undefined && stacks > pred.max) {
          predicatesHold = false;
          break;
        }
      }
      if (!allTrackable) {
        combine('unknown');
      } else {
        combine(predicatesHold ? 'fire' : 'blocked');
      }
    }
  }

  const cdKeys = [...(condition.cooldownReady ?? [])];
  if (cdKeys.length > 0) {
    for (const key of cdKeys) {
      if (!index.cooldownMsByKey.has(key)) {
        // No cooldown knowledge for this ability → readiness unobservable.
        combine('unknown');
        continue;
      }
      if (!state.ready.has(key)) {
        combine('blocked');
        break;
      }
    }
    combine('fire');
  }

  if ((condition.fightPhase?.length ?? 0) > 0) {
    // Phase feed not modeled yet: an encounter-phase condition is never
    // verifiable, so it must not anchor a confident verdict.
    combine('unknown');
  }

  return outcome;
}

export interface EvaluatedRule {
  rule: PriorityRule;
  /** 0-based index inside `knowledge.priority`. */
  ruleIndex: number;
  outcome: ConditionOutcome;
}

function evaluateDecision(
  decision: ObservedDecision,
  ctx: PriorityEvaluatorContext,
): DecisionRecord {
  const scenario = resolveScenario(decision.state);
  // Scenario-mismatched rules are *deleted*, not merely blocked: they can
  // neither fire nor explain an actual cast (see scenarioGate doc).
  const evaluated: EvaluatedRule[] = [];
  for (let i = 0; i < ctx.knowledge.priority.length; i += 1) {
    const rule = ctx.knowledge.priority[i];
    if (rule === undefined) continue;
    const gate = scenarioGate(rule, scenario);
    if (gate === 'out') continue;
    let outcome = evalPredicates(rule.when, decision.state, ctx);
    if (gate === 'uncertain' && outcome === 'fire') {
      // Scenario could not be confirmed — the rule may explain a cast but can
      // never fire.
      outcome = 'unknown';
    }
    evaluated.push({ rule, ruleIndex: i, outcome });
  }
  const fireable = evaluated.filter((entry) => entry.outcome === 'fire');
  const reasons: string[] = [];

  const expected = fireable[0];

  if (expected === undefined) {
    const indeterminate = evaluated
      .filter((entry) => entry.outcome === 'unknown')
      .slice(0, 3)
      .map((entry) => entry.rule.id);
    if (indeterminate.length > 0) {
      reasons.push(`no rule deterministically fired; indeterminate: ${indeterminate.join(', ')}`);
    } else {
      reasons.push('no rule deterministically fired');
    }
    return { time: decision.time, actualKey: decision.actualKey, actualAbilityId: decision.actualAbilityId, verdict: 'unknown', reasons };
  }

  const expectedId = expected.rule.id;
  const expectedIndex = expected.ruleIndex;

  if (expected.rule.action === decision.actualKey) {
    return {
      time: decision.time,
      actualKey: decision.actualKey,
      actualAbilityId: decision.actualAbilityId,
      expectedKey: expected.rule.action,
      expectedRuleId: expectedId,
      verdict: 'correct',
      confidence: expected.rule.confidence,
      expectedRuleIndex: expectedIndex,
      reasons,
    };
  }

  // Mismatch: does a fireable lower-priority rule explain the actual action?
  const explain = fireable.find(
    (entry) => entry.rule.action === decision.actualKey && entry.rule.id !== expectedId,
  );

  if (explain !== undefined) {
    reasons.push(
      `expected ${expectedId} (${expected.rule.action}) but cast ${decision.actualKey} follows lower rule ${explain.rule.id}`,
    );
    if (canEscalateToMistake(expected.rule.confidence)) {
      return {
        time: decision.time,
        actualKey: decision.actualKey,
        actualAbilityId: decision.actualAbilityId,
        expectedKey: expected.rule.action,
        expectedRuleId: expectedId,
        acceptableRuleId: explain.rule.id,
        verdict: 'suboptimal',
        confidence: expected.rule.confidence,
        expectedRuleIndex: expectedIndex,
        reasons,
      };
    }
    reasons.push(
      `expected rule ${expectedId} has confidence ${expected.rule.confidence} < MIN_MISTAKE_CONFIDENCE; downgraded from suboptimal to acceptable`,
    );
    return {
      time: decision.time,
      actualKey: decision.actualKey,
      actualAbilityId: decision.actualAbilityId,
      expectedKey: expected.rule.action,
      expectedRuleId: expectedId,
      acceptableRuleId: explain.rule.id,
      verdict: 'acceptable',
      confidence: expected.rule.confidence,
      expectedRuleIndex: expectedIndex,
      reasons,
    };
  }

  // Not explained by any fireable rule. Is it explained by an indeterminate
  // one (unobservable trigger we cannot rule out)?
  const indeterminateMatch = evaluated.find(
    (entry) => entry.outcome === 'unknown' && entry.rule.action === decision.actualKey,
  );
  if (indeterminateMatch !== undefined) {
    reasons.push(
      `cast ${decision.actualKey} may be explained by ${indeterminateMatch.rule.id}, whose conditions are not fully observable`,
    );
    return {
      time: decision.time,
      actualKey: decision.actualKey,
      actualAbilityId: decision.actualAbilityId,
      expectedKey: expected.rule.action,
      expectedRuleId: expectedId,
      verdict: 'unknown',
      expectedRuleIndex: expectedIndex,
      reasons,
    };
  }

  // Unexplained deviation with a confident, fully observable expectation.
  if (canEscalateToMistake(expected.rule.confidence)) {
    reasons.push(
      `expected ${expectedId} (${expected.rule.action}) but cast ${decision.actualKey}; no rule explains it`,
    );
    return {
      time: decision.time,
      actualKey: decision.actualKey,
      actualAbilityId: decision.actualAbilityId,
      expectedKey: expected.rule.action,
      expectedRuleId: expectedId,
      verdict: 'mistake',
      confidence: expected.rule.confidence,
      expectedRuleIndex: expectedIndex,
      reasons,
    };
  }

  reasons.push(
    `expected rule ${expectedId} has confidence ${expected.rule.confidence} < MIN_MISTAKE_CONFIDENCE; cannot escalate to mistake`,
  );
  return {
    time: decision.time,
    actualKey: decision.actualKey,
    actualAbilityId: decision.actualAbilityId,
    expectedKey: expected.rule.action,
    expectedRuleId: expectedId,
    verdict: 'unknown',
    expectedRuleIndex: expectedIndex,
    reasons,
  };
}

/** Deterministic subsample: first, last and evenly spaced middle decisions. */
function subsample<T>(items: T[], max?: number | undefined): T[] {
  if (max === undefined || items.length <= max) return items;
  if (max <= 0) return [];
  if (max === 1) return [items[0] as T];
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) {
    const idx = Math.round(i * step);
    out.push(items[idx] as T);
  }
  return out;
}

export function evaluatePriority(input: EvaluateInput): PriorityEvaluationResult {
  const index = buildKnowledgeIndex(input.knowledge);
  const ctx: PriorityEvaluatorContext = { knowledge: input.knowledge, index };
  const sampled = subsample(input.decisions, input.maxSamples);

  const breakdown: Record<Verdict, number> = {
    correct: 0,
    acceptable: 0,
    suboptimal: 0,
    mistake: 0,
    unknown: 0,
  };

  const decisions: DecisionRecord[] = [];
  let skippedUnmappedCasts = 0;
  let aoeVotes = 0;
  let stVotes = 0;

  for (const decision of sampled) {
    if (!index.abilitiesByKey.has(decision.actualKey)) {
      skippedUnmappedCasts += 1;
      continue;
    }
    const scenario = resolveScenario(decision.state);
    if (scenario === 'aoe') aoeVotes += 1;
    else if (scenario === 'st') stVotes += 1;

    const record = evaluateDecision(decision, ctx);
    decisions.push(record);
    breakdown[record.verdict] += 1;
  }

  return {
    decisions,
    breakdown,
    skippedUnmappedCasts,
    scenario: aoeVotes > stVotes ? 'aoe' : 'st',
    knowledge: {
      specName: input.knowledge.specName,
      knowledgeVersion: input.knowledge.knowledgeVersion,
      ...(input.knowledge.patch !== undefined ? { patch: input.knowledge.patch } : {}),
    },
  };
}
