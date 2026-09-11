import { describe, it, expect } from 'vitest';
import type {
  AnalysisVersion,
  CombatFact,
  FactSet,
  Finding,
  SpecKnowledgeRef,
} from '../src/index.js';
import {
  canEscalateToMistake,
  listFacts,
  MIN_MISTAKE_CONFIDENCE,
  CONFIDENCE_SCALE,
} from '../src/index.js';

describe('Combat Facts model', () => {
  it('describes per-ability casts with traceable evidence', () => {
    const set: FactSet = {
      fight: { id: 8, startTime: 0, endTime: 60_000 },
      player: { id: 1, name: 'Hero' },
      cast: {
        type: 'cast',
        totalCasts: 2,
        abilities: [
          {
            type: 'cast.ability',
            abilityId: 34026,
            abilityName: 'Kill Command',
            count: 2,
            firstTimestamp: 0,
            lastTimestamp: 6_000,
            avgIntervalMs: 6_000,
            evidence: [
              { fightId: 8, timestamp: 0, ability: 'Kill Command' },
              { fightId: 8, timestamp: 6_000, ability: 'Kill Command' },
            ],
          },
        ],
      },
    };

    expect(listFacts(set)).toHaveLength(2);
    const ability = set.cast?.abilities[0];
    expect(ability?.count).toBe(2);
    expect(ability?.evidence?.[1]?.timestamp).toBe(6_000);
  });

  it('flattens every populated fact group in a stable order', () => {
    const set: FactSet = {
      fight: { id: 8, startTime: 0, endTime: 10_000 },
      player: { id: 1 },
      cast: { type: 'cast', totalCasts: 1, abilities: [] },
      gcd: {
        type: 'gcd',
        totalGcd: 1,
        idleMs: 0,
        idlePercent: 0,
        idleWindows: [],
      },
      cooldown: {
        type: 'cooldown',
        usages: [
          {
            type: 'cooldown.usage',
            abilityName: 'Bestial Wrath',
            cooldownMs: 90_000,
            actualCasts: 1,
            expectedCasts: 1,
            delays: [],
          },
        ],
      },
      buff: {
        type: 'buff',
        buffs: [
          {
            type: 'buff.uptime',
            abilityName: 'Barbed Shot',
            uptime: 0.9,
            downtimeMs: 1_000,
            refreshCount: 2,
          },
        ],
      },
      resource: {
        type: 'resource',
        resources: [
          {
            type: 'resource.series',
            resourceType: 'Focus',
            eventCount: 3,
            peak: 100,
            min: 10,
            totalGained: 200,
            totalSpent: 180,
          },
        ],
      },
    };

    const types = listFacts(set).map((fact: CombatFact) => fact.type);
    expect(types).toEqual([
      'cast',
      'gcd',
      'cooldown',
      'cooldown.usage',
      'buff',
      'buff.uptime',
      'resource',
      'resource.series',
    ]);
  });
});

describe('Verdict confidence guard', () => {
  it('refuses mistake verdicts below the confidence floor', () => {
    expect(canEscalateToMistake(MIN_MISTAKE_CONFIDENCE)).toBe(true);
    expect(canEscalateToMistake(0.59)).toBe(false);
    expect(canEscalateToMistake(Number.NaN)).toBe(false);
  });

  it('keeps the documented confidence scale monotonic', () => {
    expect(CONFIDENCE_SCALE.explicit).toBeGreaterThan(
      CONFIDENCE_SCALE.theorycraft,
    );
    expect(CONFIDENCE_SCALE.theorycraft).toBeGreaterThan(
      CONFIDENCE_SCALE.verified,
    );
    expect(CONFIDENCE_SCALE.verified).toBeGreaterThan(
      CONFIDENCE_SCALE.conditional,
    );
    expect(CONFIDENCE_SCALE.conditional).toBeGreaterThanOrEqual(
      MIN_MISTAKE_CONFIDENCE,
    );
  });
});

describe('Finding model', () => {
  it('carries expected / actual / verdict / confidence', () => {
    const finding: Finding = {
      id: 'bm_hunter.kill_command_usage',
      category: 'rotation',
      severity: 'medium',
      title: 'Kill Command 使用不足',
      description: '理论 10 次，实际 5 次',
      evidence: [{ fightId: 8, timestamp: 1_000, value: 1, unit: '次' }],
      confidence: 0.8,
      verdict: 'suboptimal',
      expected: { casts: 10 },
      actual: { casts: 5 },
    };

    expect(finding.verdict).toBe('suboptimal');
    expect(finding.expected).toEqual({ casts: 10 });
    expect(finding.actual).toEqual({ casts: 5 });
    expect(canEscalateToMistake(finding.confidence ?? 0)).toBe(true);
  });
});

describe('Versioning model', () => {
  it('records analyzer and knowledge versions together', () => {
    const ref: SpecKnowledgeRef = {
      specId: 253,
      specName: 'Beast Mastery',
      className: 'Hunter',
      patch: '12.1',
      knowledgeVersion: '1.0.0',
    };
    const version: AnalysisVersion = {
      analyzerVersion: '1.2.0',
      knowledgeVersion: ref.knowledgeVersion,
    };

    expect(version.analyzerVersion).toBe('1.2.0');
    expect(version.knowledgeVersion).toBe('1.0.0');
  });
});
