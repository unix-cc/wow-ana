/**
 * Phase E+F — Condition → Action priority evaluator + verdict findings.
 *
 * ```text
 * CombatEvent[] + SpecKnowledge → buildObservedDecisions() → ObservedDecision[]
 *                                            → evaluatePriority() → DecisionRecord[]
 *                                            → buildRotationFindings() → Finding[]
 * evaluateRotation(context) = registry 解析知识 → replay → verdict → findings
 * ```
 *
 * Exported for consumers (tests, MCP tools, reports) but intentionally **not**
 * wired into the default `SpecRegistry` analyzers yet — legacy threshold rules
 * keep working unchanged until Phase H integrates the verdict stream.
 */
export * from './types.js';
export * from './knowledge-index.js';
export * from './state.js';
export * from './evaluator.js';
export * from './verdict-findings.js';
export * from './rotation.js';
