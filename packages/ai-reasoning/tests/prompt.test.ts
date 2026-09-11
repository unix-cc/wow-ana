import { describe, it, expect } from 'vitest';
import {
  SYSTEM_PROMPT,
  buildUserContent,
  AI_JSON_ERROR_PREFIX,
  buildBrief,
} from '../src/index.js';
import type { BriefInput } from '../src/index.js';

describe('SYSTEM_PROMPT contract', () => {
  it('never hardcodes ability ids or cooldown numbers', () => {
    // Knowledge lives in spec-knowledge; the prompt must not smuggle any in.
    expect(SYSTEM_PROMPT).not.toMatch(/\b\d{4,}\b/);
    expect(SYSTEM_PROMPT.toLowerCase()).not.toContain('cooldownms');
  });

  it('keeps the explain-not-compute and provenance rules', () => {
    expect(SYSTEM_PROMPT).toContain('sourceId');
    expect(SYSTEM_PROMPT).toContain('禁止编造');
    expect(SYSTEM_PROMPT).toContain('不重新计算');
  });

  it('explains the verdict/confidence gating the model must respect', () => {
    expect(SYSTEM_PROMPT).toContain('mistake');
    expect(SYSTEM_PROMPT).toContain('suboptimal');
    expect(SYSTEM_PROMPT).toContain('acceptable');
    expect(SYSTEM_PROMPT).toContain('confidence');
    expect(SYSTEM_PROMPT).toContain('0.6');
  });

  it('exposes the JSON degraded-marker exit', () => {
    expect(SYSTEM_PROMPT).toContain(AI_JSON_ERROR_PREFIX);
  });

  it('guards the all-time-best pool wording and names the projected fields', () => {
    // The brief carries a flattened reference: the prompt must key on
    // `reference.pool` / `gapVsP50Pct`, and must forbid same-key-level
    // percentile phrasing against an all-time-best pool.
    expect(SYSTEM_PROMPT).toContain('reference.pool');
    expect(SYSTEM_PROMPT).toContain('gapVsP50Pct');
    expect(SYSTEM_PROMPT).toContain('同层');
    expect(SYSTEM_PROMPT).not.toContain('reference.source');
  });

  it('requires the external links the brief can carry', () => {
    // Links are the difference between "trust me" and "go look".
    for (const field of [
      'reference.rankingsUrl',
      'reference.topRuns',
      'meta.reportUrl',
      'reference.poolLevels',
    ]) {
      expect(SYSTEM_PROMPT).toContain(field);
    }
    expect(SYSTEM_PROMPT).toContain('禁止改写');
  });
});

describe('buildUserContent', () => {
  const input: BriefInput = {
    findings: [
      {
        id: 'f_ap',
        category: 'cooldown',
        severity: 'high',
        title: 'AP 延迟',
        description: '第二次 AP 延迟 4.2s',
        verdict: 'suboptimal',
        confidence: 0.9,
        evidence: [{ timestamp: 32_400, expectedAt: 28_200, value: 4_200, unit: 'ms' }],
      },
    ],
    metrics: { gcdIdleMs: 8_000 },
    score: { overall: 75 },
    meta: { playerName: 'Mage', specName: '奥法' },
    versions: { analyzerVersion: '0.2.0', knowledgeVersion: '1.2.0' },
  };

  it('serializes the brief as the full user content with the marker', () => {
    const content = buildUserContent(buildBrief(input));
    expect(content).toContain('【结构化分析结果】');
    expect(content).toContain('f_ap');
    expect(content).toContain('knowledgeVersion');
    expect(content).toContain('1.2.0');
  });

  it('never includes raw combat event lists', () => {
    const content = buildUserContent(buildBrief(input));
    expect(content.toLowerCase()).not.toMatch(/combatevents?|begincast|"events"/);
  });
});
