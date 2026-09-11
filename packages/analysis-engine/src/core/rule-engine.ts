import type { AnalysisRule, Analyzer, AnalysisResult } from '../types.js';

/**
 * Runs a set of rules against a context and aggregates their findings.
 * Kept intentionally thin; rule authoring lives in the combat/ and specs/
 * modules added during Phase 3.
 */
export class RuleEngine implements Analyzer {
  private readonly rules: AnalysisRule[];

  constructor(rules: AnalysisRule[] = []) {
    this.rules = rules;
  }

  analyze(context: Parameters<Analyzer['analyze']>[0]): AnalysisResult {
    const findings = this.rules.flatMap((rule) => rule.evaluate(context));
    return { findings, metrics: {} };
  }
}
