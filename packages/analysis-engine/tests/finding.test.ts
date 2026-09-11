import { describe, it, expect } from 'vitest';
import type { Verdict } from '@wcl/domain';
import {
  comparisonFinding,
  evidencePoint,
  severityForVerdict,
} from '../src/core/finding.js';

describe('severityForVerdict', () => {
  it('maps each verdict tier to a severity', () => {
    expect(severityForVerdict('mistake', 0.9)).toBe('high');
    expect(severityForVerdict('mistake', 0.6)).toBe('medium');
    expect(severityForVerdict('suboptimal')).toBe('medium');
    expect(severityForVerdict('acceptable')).toBe('low');
    expect(severityForVerdict('correct')).toBe('info');
    expect(severityForVerdict('unknown')).toBe('info');
  });
});

describe('evidencePoint', () => {
  it('keeps only provided keys', () => {
    const evidence = evidencePoint({
      timestamp: 1000,
      expectedAt: 900,
      ability: 'Arcane Blast',
      fightId: 8,
    });
    expect(evidence).toEqual({
      timestamp: 1000,
      expectedAt: 900,
      ability: 'Arcane Blast',
      fightId: 8,
    });
  });

  it('omits unspecified keys entirely', () => {
    const evidence = evidencePoint({ note: 'proc' });
    expect(evidence).toEqual({ note: 'proc' });
    expect('timestamp' in evidence).toBe(false);
  });
});

describe('comparisonFinding', () => {
  it('derives severity from the verdict and stamps comparison fields', () => {
    const finding = comparisonFinding({
      id: 'r.test',
      category: 'rotation',
      verdict: 'mistake',
      confidence: 0.9,
      title: 't',
      description: 'd',
      expected: { ability: 'A' },
      actual: { ability: 'B' },
      evidence: [],
    });
    expect(finding.severity).toBe('high');
    expect(finding.verdict).toBe('mistake');
    expect(finding.confidence).toBe(0.9);
    expect(finding.expected).toEqual({ ability: 'A' });
    expect(finding.actual).toEqual({ ability: 'B' });
  });

  it('keeps explicit severity and leaves optional fields unset', () => {
    const finding = comparisonFinding({
      id: 'r.test',
      category: 'cooldown',
      severity: 'medium',
      title: 't',
      description: 'd',
      evidence: [],
    });
    expect(finding.severity).toBe('medium');
    expect(finding.verdict).toBeUndefined();
    expect(finding.confidence).toBeUndefined();
    expect('expected' in finding).toBe(false);
  });

  it('covers every verdict tier without throwing', () => {
    const verdicts: Verdict[] = [
      'correct',
      'acceptable',
      'suboptimal',
      'mistake',
      'unknown',
    ];
    for (const verdict of verdicts) {
      const finding = comparisonFinding({
        id: `r.${verdict}`,
        category: 'rotation',
        verdict,
        title: verdict,
        description: verdict,
        evidence: [],
      });
      expect(finding.severity).toBe(severityForVerdict(verdict));
    }
  });
});
