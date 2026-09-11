import type { Finding, Verdict } from '@wcl/domain';
import type { SpecKnowledge } from '@wcl/spec-knowledge';
import { comparisonFinding, evidencePoint } from '../core/finding.js';
import type { DecisionRecord, PriorityEvaluationResult } from './types.js';

/**
 * Turn a priority-evaluation verdict stream into `Finding`s (Phase F).
 *
 * `DecisionRecord[]` are rolled up into **deviation clusters**: decisions that
 * share the same expected rule + verdict + actual ability (and, when present,
 * the acceptable rule that explains them). Each cluster becomes one Finding,
 * so a fight with 30 identical barrage-mistakes produces one high-signal
 * finding with sampled evidence — not 30 noisy ones.
 *
 * Only `mistake` / `suboptimal` / `acceptable` surface by default. `correct`
 * and `unknown` carry no advice value for a report.
 */

export const DEFAULT_INCLUDED_VERDICTS: Verdict[] = [
  'mistake',
  'suboptimal',
  'acceptable',
];

export interface RotationFindingOptions {
  /** Fight the evidence belongs to (traceability). */
  fightId?: number | undefined;
  /** Verdict tiers to surface. Defaults to mistake/suboptimal/acceptable. */
  includeVerdicts?: Verdict[] | undefined;
  /** Max evidence points per finding (sampled evenly). Default 8. */
  maxEvidencePerFinding?: number | undefined;
}

export interface RotationFindings {
  findings: Finding[];
}

function evenlySample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) {
    const index = Math.round(i * step);
    const item = items[index];
    if (item !== undefined) out.push(item);
  }
  return out;
}

interface ClusterKey {
  expectedRuleId: string;
  verdict: Verdict;
  actualKey: string;
  acceptableRuleId: string | undefined;
}

function clusterKey(record: DecisionRecord): ClusterKey {
  return {
    expectedRuleId: record.expectedRuleId ?? '(no-expected)',
    verdict: record.verdict,
    actualKey: record.actualKey,
    acceptableRuleId: record.acceptableRuleId,
  };
}

export function buildRotationFindings(
  result: PriorityEvaluationResult,
  knowledge: SpecKnowledge,
  options?: RotationFindingOptions,
): RotationFindings {
  const include = new Set<Verdict>(
    options?.includeVerdicts ?? DEFAULT_INCLUDED_VERDICTS,
  );
  const maxEvidence = options?.maxEvidencePerFinding ?? 8;

  const abilityName = new Map<string, string>();
  for (const ability of knowledge.abilities) {
    abilityName.set(ability.key, ability.name);
  }
  const ruleById = new Map(
    knowledge.priority.map((rule) => [rule.id, rule] as const),
  );

  const clusters = new Map<string, DecisionRecord[]>();
  for (const record of result.decisions) {
    if (!include.has(record.verdict)) continue;
    const key = clusterKey(record);
    const token = [
      key.expectedRuleId,
      key.verdict,
      key.actualKey,
      key.acceptableRuleId ?? '',
    ].join('|');
    const group = clusters.get(token) ?? [];
    group.push(record);
    clusters.set(token, group);
  }

  const findings: Finding[] = [];
  for (const records of clusters.values()) {
    const first = records[0];
    if (first === undefined) continue;
    const expectedRuleId = first.expectedRuleId ?? '(no-expected)';
    const expectedKey = first.expectedKey ?? '';
    const expectedRule = ruleById.get(expectedRuleId);
    const expectedName = abilityName.get(expectedKey) ?? expectedKey;
    const actualName = abilityName.get(first.actualKey) ?? first.actualKey;
    const verdict = first.verdict;
    const confidence = first.confidence;

    const count = records.length;
    const times = records.map((record) => record.time);
    const firstTime = times[0] ?? 0;
    const lastTime = times[times.length - 1] ?? firstTime;
    const sampled = evenlySample(records, maxEvidence);

    const verdictLabel: Record<Verdict, string> = {
      mistake: '失误',
      suboptimal: '次优',
      acceptable: '可接受但非最优',
      correct: '正确',
      unknown: '无法判定',
    };

    const description =
      `决策级判定 ${verdictLabel[verdict]} ×${count}` +
      `（占已评估决策 ${count}/${result.decisions.length || 0}）：` +
      `期望 ${expectedName}（规则 ${expectedRuleId}）但实际使用 ${actualName}` +
      (first.acceptableRuleId !== undefined
        ? `，可由 ${first.acceptableRuleId} 部分解释`
        : '') +
      `；首次 ${firstTime}ms，末次 ${lastTime}ms。`;

    const recommendation = expectedRule?.rationale
      ? `按优先级执行 ${expectedName}。${expectedRule.rationale}`
      : `按优先级执行 ${expectedName}（规则 ${expectedRuleId}）。`;

    findings.push(
      comparisonFinding({
        id: `rotation.${expectedRuleId}.${verdict}.${first.actualKey}`,
        category: 'rotation',
        verdict,
        confidence,
        title: `${expectedName} vs ${actualName}：${verdictLabel[verdict]}`,
        description,
        expected: {
          ability: expectedKey,
          abilityName: expectedName,
          ruleId: expectedRuleId,
          ruleIndex: first.expectedRuleIndex,
        },
        actual: { ability: first.actualKey, abilityName: actualName },
        recommendation,
        evidence: sampled.map((record) =>
          evidencePoint({
            timestamp: record.time,
            fightId: options?.fightId,
            ability: actualName,
            abilityId: record.actualAbilityId,
            note:
              record.acceptableRuleId !== undefined
                ? `expected ${expectedRuleId} (${expectedName}); lower rule ${record.acceptableRuleId} explains ${first.actualKey}`
                : `expected ${expectedRuleId} (${expectedName}) but cast ${first.actualKey}`,
          }),
        ),
      }),
    );
  }

  return { findings };
}
