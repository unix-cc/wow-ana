import { describe, it, expect } from 'vitest';
import { buildBrief } from '../src/index.js';
import type { BriefInput } from '../src/index.js';

function finding(overrides: Partial<BriefInput['findings'][number]> = {}): BriefInput['findings'][number] {
  return {
    id: 'f1',
    category: 'rotation',
    severity: 'medium',
    title: 'GCD 空转',
    description: '战斗存在较多 GCD 空转窗口',
    evidence: [],
    ...overrides,
  };
}

/** Deterministic baseline input: out-of-order severities, many findings. */
function baseInput(): BriefInput {
  const findings: BriefInput['findings'] = [
    finding({ id: 'med1', severity: 'medium', title: '中等 1' }),
    finding({ id: 'crit', severity: 'critical', title: '致命', evidence: [] }),
    finding({ id: 'inf', severity: 'info', title: '提示', evidence: [] }),
    finding({ id: 'high', severity: 'high', title: '高', evidence: [] }),
    finding({
      id: 'low1',
      severity: 'low',
      title: '低',
      evidence: [{ timestamp: 1, value: 2, unit: 'ms', note: 'x' }],
    }),
  ];
  return {
    findings,
    metrics: {
      zeta: 3,
      alpha: { inner: 1, nested: { deep: 2 } },
      series: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
      objectArray: [{ a: 1 }],
      nan: Number.NaN,
      str: 'ok',
      flag: true,
      empty: [],
    },
    score: { overall: 87.4 },
    reference: {
      source: {
        encounterName: "King's Rest",
        metric: 'dps',
        specName: 'Arcane',
        count: 100,
        pool: 'Mythic+ 该本最高层前 100 名（池内层级 +19~+21）（排行榜不按层数过滤，以最高层为准）',
        keyLevel: 10,
        poolLevels: { min: 19, max: 21 },
        rankingsUrl:
          'https://cn.warcraftlogs.com/zone/rankings/55#dungeon=61762&class=Mage&spec=Arcane',
      },
      top: [
        {
          name: 'A',
          amount: 999999,
          keyLevel: 21,
          runUrl: 'https://cn.warcraftlogs.com/reports/aaa#fight=4',
        },
        {
          name: 'B',
          amount: 888888,
          keyLevel: 21,
          runUrl: 'https://cn.warcraftlogs.com/reports/bbb#fight=2',
        },
        {
          name: 'C',
          amount: 777777,
          keyLevel: 20,
          runUrl: 'https://cn.warcraftlogs.com/reports/ccc#fight=9',
        },
        { name: 'D', amount: 666666, keyLevel: 20 },
        {
          name: 'E',
          amount: 555555,
          keyLevel: 20,
          runUrl: 'https://cn.warcraftlogs.com/reports/eee#fight=1',
        },
      ],
      stats: { min: 1, p50: 5, max: Number.NaN },
      player: { dps: 900, percentilePct: 140 },
    },
    meta: { playerName: 'Mage', specName: '奥法', durationMs: 120_000 },
    versions: { analyzerVersion: '0.1.0', knowledgeVersion: '1.2.0', patch: '12.1' },
  };
}

describe('buildBrief input trimming', () => {
  it('severity-ranks findings (critical first) and caps the count', () => {
    const brief = buildBrief(baseInput(), { maxFindings: 3 });
    expect(brief.findings.map((f) => f.id)).toEqual(['crit', 'high', 'med1']);
    expect(brief.sources).toEqual(['crit', 'high', 'med1']);
  });

  it('keeps all findings by default when below the cap', () => {
    const brief = buildBrief(baseInput());
    expect(brief.findings.map((f) => f.id)).toEqual(['crit', 'high', 'med1', 'low1', 'inf']);
  });

  it('stamps overallScore clamped & rounded into meta', () => {
    const brief = buildBrief(baseInput());
    expect(brief.meta.overallScore).toBe(87);
  });

  it('caps and projects evidence, dropping empty objects', () => {
    const input = baseInput();
    input.findings[0] = finding({
      id: 'many',
      severity: 'high',
      evidence: Array.from({ length: 20 }, (_, i) => ({
        timestamp: i,
        note: `p${i}`,
      })),
    });
    const brief = buildBrief(input, { maxEvidencePerFinding: 3 });
    const ev = brief.findings.find((f) => f.id === 'many')?.evidence;
    expect(ev).toHaveLength(3);
    expect(ev?.[0]).toEqual({ timestamp: 0, note: 'p0' });
  });

  it('truncates long descriptions with an ellipsis', () => {
    const input = baseInput();
    input.findings[0] = finding({ severity: 'critical', description: 'x'.repeat(300) });
    const brief = buildBrief(input, { maxDescriptionChars: 50 });
    expect(brief.findings[0]?.description?.length).toBe(51); // 50 + '…'
    expect(brief.findings[0]?.description?.endsWith('…')).toBe(true);
  });

  it('flattens one level of nested metrics, keeps scalar arrays truncated', () => {
    const brief = buildBrief(baseInput(), { maxMetricArrayLength: 5 });
    expect(brief.metrics['alpha.inner']).toBe(1);
    expect(brief.metrics['alpha.nested.deep']).toBe(2);
    expect(brief.metrics.series).toEqual([1, 2, 3, 4, 5]);
    expect(brief.metrics.zeta).toBe(3);
  });

  it('drops non-scalar arrays, NaN, and empty arrays from metrics', () => {
    const brief = buildBrief(baseInput());
    expect('objectArray' in brief.metrics).toBe(false);
    expect('nan' in brief.metrics).toBe(false);
    expect('empty' in brief.metrics).toBe(false);
    expect(brief.metrics.str).toBe('ok');
    expect(brief.metrics.flag).toBe(true);
  });

  it('caps metric entries deterministically', () => {
    const input = baseInput();
    input.metrics = {};
    for (let i = 0; i < 60; i += 1) input.metrics[`k${String(i).padStart(2, '0')}`] = i;
    const brief = buildBrief(input, { maxMetricEntries: 10 });
    expect(Object.keys(brief.metrics)).toHaveLength(10);
    expect(Object.keys(brief.metrics)[0]).toBe('k00');
  });

  it('projects reference without the top rows and clamps the percentile', () => {
    const brief = buildBrief(baseInput());
    expect(brief.reference?.encounterName).toBe("King's Rest");
    expect(brief.reference?.count).toBe(100);
    expect(brief.reference?.stats).toEqual({ min: 1, p50: 5 });
    expect(brief.reference?.player?.percentilePct).toBe(100); // clamped from 140
    // Pool semantics + key level must reach the model, otherwise it cannot
    // tell an all-time-best pool from a same-key-level cohort.
    expect(brief.reference?.pool).toContain('最高层');
    expect(brief.reference?.keyLevel).toBe(10);
    expect(brief.reference?.poolLevels).toEqual({ min: 19, max: 21 });
    expect(brief.reference?.rankingsUrl).toContain('/zone/rankings/55#dungeon=61762');
    expect('top' in (brief.reference ?? {})).toBe(false);
  });

  it('ships only linkable baseline runs, capped at three', () => {
    const brief = buildBrief(baseInput());
    const runs = brief.reference?.topRuns ?? [];
    // D carries no runUrl → dropped; the rest are capped at MAX_TOP_RUNS = 3.
    expect(runs).toHaveLength(3);
    expect(runs.map((r) => r.name)).toEqual(['A', 'B', 'C']);
    expect(runs[0]?.runUrl).toBe('https://cn.warcraftlogs.com/reports/aaa#fight=4');
    // Amounts are rounded integers — the model must not read false precision.
    expect(runs[0]?.amount).toBe(999999);
    expect(runs[0]?.keyLevel).toBe(21);
  });

  it('carries the analyzed run permalink when the caller provides one', () => {
    const input = baseInput();
    input.meta = { ...input.meta, reportUrl: 'https://cn.warcraftlogs.com/reports/xyz#fight=13' };
    const brief = buildBrief(input);
    expect(brief.meta.reportUrl).toBe('https://cn.warcraftlogs.com/reports/xyz#fight=13');
  });

  it('keeps verdict/confidence so the model can honour the gating rules', () => {
    const input = baseInput();
    input.findings[0] = finding({
      severity: 'high',
      verdict: 'mistake',
      confidence: 0.9,
      recommendation: '冷却好了就用',
    });
    const brief = buildBrief(input);
    const kept = brief.findings.find((f) => f.id === 'f1');
    expect(kept?.verdict).toBe('mistake');
    expect(kept?.confidence).toBe(0.9);
    expect(kept?.recommendation).toBe('冷却好了就用');
  });

  it('omits reference/meta when absent', () => {
    const brief = buildBrief({ findings: [finding()] });
    expect(brief.reference).toBeUndefined();
    expect(brief.meta.overallScore).toBeUndefined();
    expect(brief.meta.playerName).toBeUndefined();
    expect(brief.sources).toEqual(['f1']);
  });

  it('is deterministic: same input produces identical JSON', () => {
    const a = JSON.stringify(buildBrief(baseInput()));
    const b = JSON.stringify(buildBrief(baseInput()));
    expect(a).toBe(b);
  });
});
