import { describe, it, expect } from 'vitest';
import {
  buildAnalysisArtifact,
  MAX_ARTIFACT_FINDINGS,
  MAX_ARTIFACT_TOP_RUNS,
  MAX_EVIDENCE_PER_FINDING,
} from '../src/artifact.js';
import type { AnalysisPayload } from '../src/pipeline.js';
import type { Finding } from '@wcl/domain';

/** Fight start (report-relative ms) — evidence times share this coordinate. */
const FIGHT_START = 25_302_116;

function finding(overrides?: Partial<Finding>): Finding {
  return {
    id: 'f1',
    category: 'cooldown',
    severity: 'high',
    title: '狂野怒火 使用存在延迟',
    description: '平均延迟 4.2s',
    evidence: [
      {
        // Absolute report-relative: FIGHT_START + 92_300 → 01:32.3 in-fight.
        timestamp: FIGHT_START + 92_300,
        expectedAt: FIGHT_START + 88_100,
        ability: '狂野怒火 (Bestial Wrath)',
        abilityId: 19574,
        value: 4200,
        unit: 'ms',
        note: 'actual cast vs ideal cooldown slot',
      },
    ],
    ...overrides,
  };
}

function payload(overrides?: Partial<AnalysisPayload>): AnalysisPayload {
  return {
    report: {
      code: 'ABC123',
      title: '深渊测试',
      startTime: 0,
      endTime: 200_000,
      zone: { id: 55, name: 'Mythic+ Season 2' },
    },
    fight: {
      id: 8,
      name: '高阶督军',
      startTime: FIGHT_START,
      endTime: FIGHT_START + 192_000,
    },
    player: { id: 42, name: 'Hero', type: 'Player', specName: 'Beast Mastery' },
    summary: {
      playerId: 42,
      name: 'Hero',
      spec: 'Beast Mastery',
      type: 'Player',
    },
    result: {
      findings: [finding()],
      metrics: { damage: { dps: 125_400 } },
      score: { overall: 82 },
    },
    ...overrides,
  };
}

describe('buildAnalysisArtifact', () => {
  it('describes the run and the score from the deterministic result', () => {
    const artifact = buildAnalysisArtifact(payload(), {
      reportUrl: 'https://cn.warcraftlogs.com/reports/ABC123#fight=8',
    });

    expect(artifact.kind).toBe('analysis');
    expect(artifact.run).toMatchObject({
      reportCode: 'ABC123',
      reportTitle: '深渊测试',
      fightId: 8,
      fightName: '高阶督军',
      durationMs: 192_000,
      playerId: 42,
      playerName: 'Hero',
      specName: 'Beast Mastery',
    });
    expect(artifact.score).toBe(82);
    expect(artifact.reportUrl).toBe(
      'https://cn.warcraftlogs.com/reports/ABC123#fight=8',
    );
  });

  it('orders findings worst-first and projects evidence', () => {
    const artifact = buildAnalysisArtifact(
      payload({
        result: {
          findings: [
            finding({ id: 'low', severity: 'low', title: '低' }),
            finding({ id: 'crit', severity: 'critical', title: '严重' }),
            finding({ id: 'med', severity: 'medium', title: '中' }),
          ],
          metrics: {},
        },
      }),
    );

    expect(artifact.findings.map((f) => f.id)).toEqual(['crit', 'med', 'low']);
    // Evidence times are rebased to fight-relative so the cards show 01:32.3
    // rather than a clock 7 hours into the report.
    expect(artifact.findings[0]?.evidence[0]).toEqual({
      timestamp: 92_300,
      expectedAt: 88_100,
      ability: '狂野怒火 (Bestial Wrath)',
      abilityId: 19574,
      value: 4200,
      unit: 'ms',
      note: 'actual cast vs ideal cooldown slot',
    });
  });

  it('drops evidence times that precede the fight start', () => {
    const artifact = buildAnalysisArtifact(
      payload({
        result: {
          findings: [
            finding({
              evidence: [
                { timestamp: FIGHT_START - 5_000, value: 1, unit: 'ms' },
                { timestamp: FIGHT_START + 1_000, value: 2, unit: 'ms' },
              ],
            }),
          ],
          metrics: {},
        },
      }),
    );

    const evidence = artifact.findings[0]?.evidence ?? [];
    // The unrebasable point keeps its value but loses the nonsense time.
    expect(evidence[0]?.timestamp).toBeUndefined();
    expect(evidence[0]?.value).toBe(1);
    expect(evidence[1]?.timestamp).toBe(1_000);
  });

  it('caps findings and evidence so one turn can never blow up the DOM', () => {
    const many = Array.from({ length: MAX_ARTIFACT_FINDINGS + 5 }, (_, i) =>
      finding({
        id: `f${i}`,
        evidence: Array.from({ length: MAX_EVIDENCE_PER_FINDING + 3 }, (_, j) => ({
          timestamp: FIGHT_START + j * 1000,
        })),
      }),
    );
    const artifact = buildAnalysisArtifact(
      payload({ result: { findings: many, metrics: {} } }),
    );

    expect(artifact.findings).toHaveLength(MAX_ARTIFACT_FINDINGS);
    expect(artifact.findingsCapped).toBe(true);
    expect(artifact.findings[0]?.evidence).toHaveLength(MAX_EVIDENCE_PER_FINDING);
    expect(artifact.findings[0]?.evidenceCapped).toBe(true);
  });

  it('drops non-scalar expected/actual fields rather than shipping junk', () => {
    const artifact = buildAnalysisArtifact(
      payload({
        result: {
          findings: [
            finding({
              expected: {
                ability: '狂野怒火 (Bestial Wrath)',
                cooldownMs: 90_000,
                nested: { deep: 1 },
                list: [1, 2, 3],
              },
              actual: { casts: 3, avgDelayMs: 4200, weird: null },
            }),
          ],
          metrics: {},
        },
      }),
    );

    expect(artifact.findings[0]?.expected).toEqual({
      ability: '狂野怒火 (Bestial Wrath)',
      cooldownMs: 90_000,
    });
    expect(artifact.findings[0]?.actual).toEqual({ casts: 3, avgDelayMs: 4200 });
  });

  it('ships the whole capped pool of runs, each with its permalink', () => {
    const top = Array.from({ length: 12 }, (_, i) => ({
      name: `Runner${i + 1}`,
      amount: 300_000 - i * 1000,
      keyLevel: 21,
      runUrl: `https://cn.warcraftlogs.com/reports/run${i + 1}#fight=1`,
    }));
    const artifact = buildAnalysisArtifact(
      payload({
        result: {
          findings: [],
          metrics: {},
          reference: {
            source: {
              encounterId: 61762,
              encounterName: "King's Rest",
              metric: 'dps',
              className: 'Hunter',
              specName: 'Beast Mastery',
              page: 1,
              count: 12,
            },
            top,
            stats: { p50: 260_000 },
          },
        },
      }),
    );

    // The pool is 10 by design, so the UI receives all of it — the cap here is
    // only a guard against a future larger pool blowing up the card.
    expect(artifact.reference?.topRuns).toHaveLength(MAX_ARTIFACT_TOP_RUNS);
    expect(MAX_ARTIFACT_TOP_RUNS).toBe(10);
    expect(artifact.reference?.topRuns[0]?.runUrl).toBe(
      'https://cn.warcraftlogs.com/reports/run1#fight=1',
    );
  });

  it('keeps the reference pool semantics, links and top runs', () => {
    const artifact = buildAnalysisArtifact(
      payload({
        result: {
          findings: [],
          metrics: {},
          reference: {
            source: {
              encounterId: 61762,
              encounterName: "King's Rest",
              metric: 'dps',
              className: 'Hunter',
              specName: 'Beast Mastery',
              page: 1,
              count: 100,
              pool: 'Mythic+ 该本最高层前 100 名（池内层级 +19~+21）',
              keyLevel: 10,
              poolLevels: { min: 19, max: 21 },
              rankingsUrl: 'https://cn.warcraftlogs.com/zone/rankings/55#dungeon=61762',
            },
            top: [
              {
                name: 'TopLog',
                amount: 312_456.7,
                keyLevel: 21,
                runUrl: 'https://cn.warcraftlogs.com/reports/rrr111#fight=4',
              },
            ],
            stats: {
              min: 1,
              p25: 2,
              p50: 260_000,
              p75: 4,
              p90: 5,
              max: 6,
              mean: 7,
            },
            player: { dps: 125_400, percentilePct: 42, gapVsP50Pct: -51.8 },
          },
        },
      }),
    );

    const reference = artifact.reference;
    expect(reference?.keyLevel).toBe(10);
    expect(reference?.poolLevels).toEqual({ min: 19, max: 21 });
    expect(reference?.rankingsUrl).toContain('#dungeon=61762');
    expect(reference?.player?.gapVsP50Pct).toBe(-51.8);
    expect(reference?.topRuns[0]).toEqual({
      name: 'TopLog',
      amount: 312_456.7,
      keyLevel: 21,
      runUrl: 'https://cn.warcraftlogs.com/reports/rrr111#fight=4',
    });
  });

  it('includes the rotation digest only when the caller supplies one', () => {
    const withoutRotation = buildAnalysisArtifact(payload());
    expect(withoutRotation.rotation).toBeUndefined();

    const withRotation = buildAnalysisArtifact(payload(), {
      rotation: {
        scenario: 'st',
        breakdown: { correct: 80, mistake: 2 },
        decisionCount: 100,
        unknownCount: 3,
        knowledge: { specName: 'Beast Mastery', knowledgeVersion: '1.0.0' },
        samples: [
          { time: FIGHT_START + 55_000, verdict: 'mistake', actualKey: 'stormkeeper' },
        ],
        samplesCapped: false,
        engagements: [
          { startMs: FIGHT_START, endMs: FIGHT_START + 60_000, decisions: 40, flagged: 2 },
        ],
      },
    });
    expect(withRotation.rotation).toMatchObject({
      scenario: 'st',
      decisionCount: 100,
      knowledgeVersion: '1.0.0',
    });
    // Decision times and engagement windows are rebased too.
    expect(withRotation.rotation?.samples[0]?.time).toBe(55_000);
    expect(withRotation.rotation?.engagements?.[0]).toEqual({
      startMs: 0,
      endMs: 60_000,
      decisions: 40,
      flagged: 2,
    });
  });

  it('never invents a score when the engine did not produce one', () => {
    const artifact = buildAnalysisArtifact(
      payload({ result: { findings: [], metrics: {} } }),
    );
    expect(artifact.score).toBeUndefined();
    expect('score' in artifact).toBe(false);
  });
});
