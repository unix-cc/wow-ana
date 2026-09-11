import { describe, it, expect } from 'vitest';
import { prioritizeFindings, computeScore } from '../src/core/scoring.js';
import type { Finding } from '@wcl/domain';

function finding(severity: Finding['severity'], title: string): Finding {
  return {
    id: `test.${title}`,
    category: 'rotation',
    severity,
    title,
    description: title,
    evidence: [],
  };
}

describe('prioritizeFindings', () => {
  it('orders findings by severity from critical to info', () => {
    const findings = [
      finding('info', 'info'),
      finding('high', 'high'),
      finding('medium', 'medium'),
      finding('critical', 'critical'),
      finding('low', 'low'),
    ];
    expect(prioritizeFindings(findings).map((f) => f.severity)).toEqual([
      'critical',
      'high',
      'medium',
      'low',
      'info',
    ]);
  });

  it('preserves relative order within the same severity', () => {
    const findings = [
      finding('high', 'first'),
      finding('medium', 'first'),
      finding('high', 'second'),
      finding('medium', 'second'),
    ];
    const result = prioritizeFindings(findings).map((f) => f.title);
    expect(result).toEqual(['first', 'second', 'first', 'second']);
  });

  it('does not mutate the input', () => {
    const findings = [finding('info', 'info'), finding('high', 'high')];
    prioritizeFindings(findings);
    expect(findings.map((f) => f.severity)).toEqual(['info', 'high']);
  });
});

describe('computeScore', () => {
  it('returns 100 with no findings', () => {
    expect(computeScore([])).toBe(100);
  });

  it('subtracts penalties by severity', () => {
    expect(computeScore([finding('high', 'high')])).toBe(85);
    expect(computeScore([finding('high', 'high'), finding('low', 'low')])).toBe(
      82,
    );
  });

  it('clamps to zero for many severe findings', () => {
    const findings = Array.from({ length: 5 }, () => finding('critical', 'c'));
    expect(computeScore(findings)).toBe(0);
  });
});
