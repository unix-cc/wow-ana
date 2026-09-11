import { describe, it, expect } from 'vitest';
import { RuleEngine } from '../src/core/rule-engine.js';
import type { AnalysisRule, AnalysisContext } from '../src/types.js';

const baseContext = {
  report: {
    code: 'ABC',
    startTime: 0,
    endTime: 100,
    zone: { id: 1, name: 'z' },
  },
  fight: { id: 1, name: 'f', startTime: 0, endTime: 100 },
  player: { id: 1, name: 'Hero', type: 'Player' as const },
  events: [],
} as AnalysisContext;

describe('RuleEngine', () => {
  it('aggregates findings from rules', () => {
    const rule: AnalysisRule = {
      id: 'test.rule',
      name: 'Test',
      description: 'A rule',
      evaluate: () => [
        {
          id: 'test.finding',
          category: 'rotation',
          severity: 'high',
          title: 'Found',
          description: 'desc',
          evidence: [],
        },
      ],
    };
    const engine = new RuleEngine([rule]);
    const result = engine.analyze(baseContext);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.id).toBe('test.finding');
  });

  it('returns no findings when no rules match', () => {
    const engine = new RuleEngine([]);
    const result = engine.analyze(baseContext);
    expect(result.findings).toEqual([]);
  });
});
