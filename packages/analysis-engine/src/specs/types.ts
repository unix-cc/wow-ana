import type { AnalysisContext, Finding } from '@wcl/domain';

/**
 * Result of a specialization-specific analysis.
 */
export interface SpecAnalysisResult {
  spec: string;
  metrics: Record<string, unknown>;
  findings: Finding[];
}

/**
 * A deterministic specialization analyzer. Specialization logic is kept
 * separate from the generic combat analyzers.
 */
export interface SpecAnalyzer {
  getSpec(): string;
  analyze(
    context: AnalysisContext,
  ): Promise<SpecAnalysisResult> | SpecAnalysisResult;
}

/**
 * A deterministic analysis rule specific to a specialization. Rules must be
 * pure functions of the context and return findings with traceable evidence.
 */
export interface SpecRule {
  id: string;
  name: string;
  description: string;
  evaluate(context: AnalysisContext): Finding[];
}
