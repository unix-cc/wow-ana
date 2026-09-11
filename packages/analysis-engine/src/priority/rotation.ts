import type { AnalysisContext, Finding } from '@wcl/domain';
import {
  createDefaultRegistry,
  type SpecKnowledge,
} from '@wcl/spec-knowledge';
import { isMythicPlusRun } from '../fight-context.js';
import { evaluatePriority } from './evaluator.js';
import { buildObservedDecisions } from './state.js';
import {
  buildRotationFindings,
  type RotationFindingOptions,
} from './verdict-findings.js';
import type { PriorityEvaluationResult } from './types.js';

/**
 * End-to-end rotation evaluation for one player in one fight (Phase F).
 *
 * ```text
 * AnalysisContext + SpecKnowledge (resolved by spec + fight date)
 *   → buildObservedDecisions()   (event replay, one state per GCD)
 *   → evaluatePriority()         (Condition→Action, 5-tier verdict)
 *   → buildRotationFindings()    (verdict stream → Findings)
 * ```
 *
 * Pure adapter: it is NOT wired into the default `SpecRegistry` analyzers —
 * callers (tests, MCP tools, the app service) opt in explicitly. Specs without
 * knowledge (or without a version live at the fight date) yield an empty
 * result instead of a confident verdict.
 */

export interface RotationEvaluationOptions extends RotationFindingOptions {
  /** Knowledge to evaluate against. Resolved from the player + fight date when omitted. */
  knowledge?: SpecKnowledge | undefined;
  /** Cap on sampled decisions (deterministic subsample). */
  maxSamples?: number | undefined;
  /**
   * Mythic+ handling. Default `'evaluate'` (opened 2026-09-09): dungeon runs
   * are evaluated with two domain gates keeping the verdicts honest —
   * single-target rules only *explain* in multi-target scenarios
   * (see `scenarioGate`), and rules below the mistake-confidence gate never
   * anchor a verdict. `'skip'` restores the Phase V whole-dungeon silence
   * for callers that want it.
   */
  mythicPlus?: 'skip' | 'evaluate' | undefined;
}

export interface RotationEvaluation {
  /** Deviation findings (empty when nothing to report or spec unsupported). */
  findings: Finding[];
  /** Raw evaluator output when knowledge resolved, else undefined. */
  result?: PriorityEvaluationResult | undefined;
}

const defaultRegistry = createDefaultRegistry();

export function evaluateRotation(
  context: AnalysisContext,
  options?: RotationEvaluationOptions,
): RotationEvaluation {
  // Mythic+ opened for evaluation (2026-09-09, real-log verified). Two domain
  // gates keep the verdicts honest inside a whole-dungeon run:
  //   1. untagged single-target rules only *explain* in multi-target
  //      scenarios (`scenarioGate`) — AoE is judged solely by scenario:'aoe'
  //      rules, and specs without them stay silent there (Blood DK, Arms
  //      pre-knowledge);
  //   2. never-observed abilities are filtered (Phase V) and rules below the
  //      mistake-confidence gate never anchor a verdict.
  // Measured on fXdMjWKJbpna6yHv fight13 after the gates: mistake ≤2% for
  // every spec (was 21–90%+ before). `mythicPlus: 'skip'` restores the
  // Phase V whole-dungeon silence.
  if (
    isMythicPlusRun(context.report, context.fight) &&
    options?.mythicPlus === 'skip'
  ) {
    return { findings: [], result: undefined };
  }

  // WCL frames: report.startTime is epoch, fight.startTime is
  // report-relative. The knowledge registry needs the epoch — the sum.
  const resolved =
    options?.knowledge ??
    defaultRegistry.resolve(
      context.player,
      context.report.startTime + context.fight.startTime,
    );
  if (resolved === undefined) {
    return { findings: [], result: undefined };
  }

  const { decisions } = buildObservedDecisions({
    playerId: context.player.id,
    events: context.events,
    knowledge: resolved,
  });

  // Rules whose action ability was never cast in the whole fight cannot be
  // the expected action: events cannot distinguish "untalented" from
  // "available but never used", and the cooldown replay treats a never-cast
  // ability as permanently ready — exactly the false-positive class found on
  // real logs (Fire Elemental 133x, Bladestorm as top expected action).
  // Zero-usage coverage stays with the spec-rule layer (cooldown-delay rules).
  const observedKeys = new Set(decisions.map((decision) => decision.actualKey));
  const usableRules = resolved.priority.filter((rule) =>
    observedKeys.has(rule.action),
  );
  const knowledge =
    usableRules.length === resolved.priority.length
      ? resolved
      : { ...resolved, priority: usableRules };

  const result = evaluatePriority({
    knowledge,
    decisions,
    maxSamples: options?.maxSamples,
  });

  const { findings } = buildRotationFindings(result, knowledge, {
    fightId: context.fight.id,
    includeVerdicts: options?.includeVerdicts,
    maxEvidencePerFinding: options?.maxEvidencePerFinding,
  });

  return { findings, result };
}
