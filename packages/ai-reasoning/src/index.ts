/**
 * @wcl/ai-reasoning — the bounded, structured interface between the
 * deterministic analysis pipeline and the LLM.
 *
 * ```text
 * AnalysisResult + reference + meta
 *   → buildBrief()          (deterministic input trimming → AnalysisBrief)
 *   → SYSTEM_PROMPT / buildUserContent()
 *   → model
 *   → parseAiReport()       (Zod structured output; degrades on failure)
 *   → checkProvenance()     (every AI claim cites a real brief source)
 * ```
 *
 * The package never sends raw combat events to the model and never lets the
 * model compute base numbers: knowledge and arithmetic stay in the engine.
 */

export * from './types.js';
export * from './brief.js';
export * from './schema.js';
export * from './prompt.js';
