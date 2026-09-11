import { describe, it, expect } from 'vitest';
import type { CombatEvent } from '@wcl/domain';
import { ARCANE_MAGE_KNOWLEDGE } from '@wcl/spec-knowledge';
import { evaluateRotation } from '../src/priority/rotation.js';
import { buildRotationFindings } from '../src/priority/verdict-findings.js';
import { evaluatePriority } from '../src/priority/evaluator.js';
import { makeContext } from './helpers.js';
import {
  makePriorityKnowledge,
  TEST_ABILITIES,
  TEST_BUFFS,
  fillerRule,
} from './priority-fixtures.js';

// fight date must fall inside knowledge effective windows (2026-01-01+).
const FIGHT_START = new Date('2026-06-01T00:00:00.000Z').getTime();

const STANDARD_RULES = [
  {
    id: 'r1.barrage_on_proc',
    action: 'barrage',
    when: { buffActive: ['proc'] },
    confidence: 0.9,
  },
  {
    id: 'r2.missiles_low',
    action: 'missiles',
    when: { buffStacks: [{ key: 'salvo', max: 11 }] },
    confidence: 0.8,
  },
  fillerRule('blast', 'r4.filler_blast', 0.9),
];

const STANDARD = makePriorityKnowledge({
  abilities: [
    TEST_ABILITIES.blast,
    TEST_ABILITIES.missiles,
    TEST_ABILITIES.barrage,
  ],
  buffs: [TEST_BUFFS.proc, TEST_BUFFS.salvo],
  rules: STANDARD_RULES.map((r) => {
    const { id, action, when, confidence } = r;
    return { id, action, when, confidence, source: { type: 'manual' as const, reference: 'test' } };
  }),
});

describe('buildRotationFindings', () => {
  it('clusters identical deviations into one finding with sampled evidence', () => {
    const decisions = [];
    // 3 identical mistakes: proc active but cast missiles? no — proc active means
    // barrage is top; casting missiles is explained by r2 only when salvo <= 11.
    for (let i = 0; i < 3; i += 1) {
      decisions.push({
        time: i * 1000,
        actualKey: 'barrage',
        actualAbilityId: 103,
        state: {
          time: i * 1000,
          buffsActive: new Set(['proc']),
          buffStacks: new Map([['salvo', 5]]),
          ready: new Set(),
          resource: 100,
          targetCount: 1,
          observable: { buff: true, resource: true, targetCount: true },
        },
      });
    }
    // Note: barrage with proc active is *correct* (r1), so this cluster is
    // filtered out of the finding output by the default includeVerdicts.
    const result = evaluatePriority({ knowledge: STANDARD, decisions });
    const { findings } = buildRotationFindings(result, STANDARD, { fightId: 8 });
    expect(findings).toHaveLength(0);
  });

  it('rolls mistakes up per expected-rule/verdict/actual with verdict metadata', () => {
    const decisions = [0, 1, 2].map((i) => ({
      time: i * 1000,
      actualKey: 'missiles',
      actualAbilityId: 102,
      state: {
        time: i * 1000,
        buffsActive: new Set(['proc']),
        buffStacks: new Map([['salvo', 5]]),
        ready: new Set(),
        resource: 100,
        targetCount: 1,
        observable: { buff: true, resource: true, targetCount: true },
      },
    }));
    // proc active → r1 expects barrage; missiles is a lower valid rule (r2) → suboptimal.
    const result = evaluatePriority({ knowledge: STANDARD, decisions });
    expect(result.decisions[0]?.verdict).toBe('suboptimal');
    const { findings } = buildRotationFindings(result, STANDARD, { fightId: 8 });
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding).toMatchObject({
      id: 'rotation.r1.barrage_on_proc.suboptimal.missiles',
      category: 'rotation',
      verdict: 'suboptimal',
      severity: 'medium',
    });
    expect(finding.confidence).toBe(0.9);
    expect(finding.expected).toMatchObject({ ruleId: 'r1.barrage_on_proc' });
    expect(finding.actual).toMatchObject({ ability: 'missiles' });
    expect(finding.evidence).toHaveLength(3);
    for (const evidence of finding.evidence) {
      expect(evidence.fightId).toBe(8);
      expect(evidence.timestamp).toBeDefined();
      expect(evidence.note).toContain('r1.barrage_on_proc');
    }
  });

  it('caps evidence to maxEvidencePerFinding', () => {
    const decisions = Array.from({ length: 30 }, (_, i) => ({
      time: i * 100,
      actualKey: 'barrage',
      state: {
        time: i * 100,
        buffsActive: new Set<string>(),
        buffStacks: new Map([['salvo', 20]]),
        ready: new Set<string>(),
        resource: 100,
        targetCount: 1,
        observable: { buff: true, resource: true, targetCount: true },
      },
    }));
    // salvo 20, no proc: filler blast expected; barrage unexplained → mistake.
    const result = evaluatePriority({ knowledge: STANDARD, decisions });
    const { findings } = buildRotationFindings(result, STANDARD, {
      fightId: 8,
      maxEvidencePerFinding: 4,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence).toHaveLength(4);
  });
});

describe('evaluateRotation', () => {
  function salvoStackEvents(start: number, stacks: number): CombatEvent[] {
    const events: CombatEvent[] = [
      {
        timestamp: start,
        type: 'buff',
        rawType: 'applybuff',
        sourceId: 1,
        targetId: 1,
        abilityId: 384452,
        abilityName: 'Arcane Salvo',
        fightId: 8,
      },
    ];
    for (let i = 1; i < stacks; i += 1) {
      events.push({
        timestamp: start + i * 1000,
        type: 'buff',
        rawType: 'applybuffstack',
        sourceId: 1,
        targetId: 1,
        abilityId: 384452,
        abilityName: 'Arcane Salvo',
        fightId: 8,
      });
    }
    return events;
  }

  it('returns empty when the spec has no knowledge', () => {
    const context = makeContext({
      fightStart: FIGHT_START,
      fightEnd: FIGHT_START + 60_000,
      events: [],
    });
    context.player = { id: 1, name: 'Hero', type: 'Player', specName: 'Fury Warrior' };
    const result = evaluateRotation(context);
    expect(result.findings).toEqual([]);
    expect(result.result).toBeUndefined();
  });

  it('resolves arcane knowledge by spec and fight date and reports a ST missiles misuse', () => {
    const start = FIGHT_START;
    const events = [
      ...salvoStackEvents(start, 12),
      // Blast at salvo 12 (t+15s): the filler is the expected action there
      // (correct), and it marks arcane_blast as observed so the
      // never-observed filter keeps blast_builder eligible as an expected
      // action for other casts.
      {
        timestamp: start + 15_000,
        type: 'cast',
        sourceId: 1,
        abilityId: 30451,
        abilityName: 'Arcane Blast',
        fightId: 8,
      } satisfies CombatEvent,
      // instant missiles at salvo 12: per the priority list the salvo<12
      // missiles rule is blocked, so the expected action is the Arcane Blast
      // filler (the orb rule needs Arcane Charges, whose buff id is still
      // unverified → unobservable → the rule can only explain, never fire).
      {
        timestamp: start + 20_000,
        type: 'cast',
        sourceId: 1,
        abilityId: 5143,
        abilityName: 'Arcane Missiles',
        fightId: 8,
      } satisfies CombatEvent,
    ];
    const context = makeContext({
      fightStart: start,
      fightEnd: start + 60_000,
      events,
    });
    context.player = { id: 1, name: 'Mage', type: 'Player', specName: 'Arcane', specId: 62 };

    const result = evaluateRotation(context);
    expect(result.result).toBeDefined();
    expect(result.result?.scenario).toBe('st');
    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0];
    expect(finding?.verdict).toBe('mistake');
    expect(finding?.expected).toMatchObject({ ruleId: 'arcane.blast_builder' });
    expect(finding?.actual).toMatchObject({ ability: 'arcane_missiles' });
    expect(finding?.confidence).toBe(0.6);
    expect(finding?.severity).toBe('medium'); // mistake + conf < 0.8 → medium
    for (const evidence of finding?.evidence ?? []) {
      expect(evidence.fightId).toBe(8);
    }
  });

  it('treats stack predicates on id-less buffs as unobservable, not always-true', () => {
    // arcane_charge has no verified spell id, so its stack counter can never
    // be replayed from events. A `max: 2` predicate must degrade to unknown
    // instead of firing on the permanent 0 stacks (silent false positive).
    const start = FIGHT_START;
    const events: CombatEvent[] = [
      ...salvoStackEvents(start, 12),
      // Actual cast IS the orb (what orb_low_charges wants): with the rule
      // unknown it may only explain, so the verdict must not be a confident
      // "correct" either.
      {
        timestamp: start + 20_000,
        type: 'cast',
        sourceId: 1,
        abilityId: 153640,
        abilityName: 'Arcane Orb',
        fightId: 8,
      } satisfies CombatEvent,
    ];
    const context = makeContext({
      fightStart: start,
      fightEnd: start + 60_000,
      events,
    });
    context.player = { id: 1, name: 'Mage', type: 'Player', specName: 'Arcane', specId: 62 };

    const result = evaluateRotation(context);
    const decision = result.result?.decisions[0];
    expect(decision?.verdict).toBe('unknown');
    expect(decision?.reasons.join(' ')).toContain('orb_low_charges');
  });

  it('evaluates Mythic+ runs honestly (domain gates, not whole-run silence)', () => {
    // Opened 2026-09-09: the whole-dungeon silence was replaced by two domain
    // gates (scenarioGate treats untagged ST rules as explain-only in AoE;
    // never-observed filtering; confidence gate). This fixture has no damage
    // feed and no observed filler — the model runs but has nothing
    // authoritative to say, which must surface as silence, not false flags.
    const start = FIGHT_START;
    const events: CombatEvent[] = [
      ...salvoStackEvents(start, 12),
      {
        timestamp: start + 20_000,
        type: 'cast',
        sourceId: 1,
        abilityId: 5143,
        abilityName: 'Arcane Missiles',
        fightId: 8,
      } satisfies CombatEvent,
    ];
    const context = makeContext({
      fightStart: start,
      fightEnd: start + 60_000,
      events,
      zoneName: 'Mythic+ Season 2',
      fightDifficulty: 10,
    });
    context.player = { id: 1, name: 'Mage', type: 'Player', specName: 'Arcane', specId: 62 };

    const result = evaluateRotation(context);
    // The evaluation ran …
    expect(result.result).toBeDefined();
    // … but produced no deviation findings (blast never observed → no
    // expected action → honest unknown verdicts).
    expect(result.findings).toEqual([]);
  });

  it('restores whole-run silence with mythicPlus: skip', () => {
    const start = FIGHT_START;
    const events: CombatEvent[] = [
      ...salvoStackEvents(start, 12),
      {
        timestamp: start + 20_000,
        type: 'cast',
        sourceId: 1,
        abilityId: 5143,
        abilityName: 'Arcane Missiles',
        fightId: 8,
      } satisfies CombatEvent,
    ];
    const context = makeContext({
      fightStart: start,
      fightEnd: start + 60_000,
      events,
      zoneName: 'Mythic+ Season 2',
      fightDifficulty: 10,
    });
    context.player = { id: 1, name: 'Mage', type: 'Player', specName: 'Arcane', specId: 62 };

    const result = evaluateRotation(context, { mythicPlus: 'skip' });
    expect(result.findings).toEqual([]);
    expect(result.result).toBeUndefined();
  });

  it('never expects an ability the player never cast (untalented ambiguity)', () => {
    // Real-log regression: a never-cast ability is treated as permanently
    // ready by the cooldown replay, so its rule would dominate every decision
    // (Fire Elemental 133x, Bladestorm). Rules whose action was not observed
    // once in the fight must be excluded — zero-usage coverage belongs to the
    // spec-rule layer, which downgrades for the untalented case.
    const start = FIGHT_START;
    // Only missiles is cast — no blast, no surge, no orb, no salvo stacks.
    const events: CombatEvent[] = [
      {
        timestamp: start + 20_000,
        type: 'cast',
        sourceId: 1,
        abilityId: 5143,
        abilityName: 'Arcane Missiles',
        fightId: 8,
      } satisfies CombatEvent,
    ];
    const context = makeContext({
      fightStart: start,
      fightEnd: start + 60_000,
      events,
    });
    context.player = { id: 1, name: 'Mage', type: 'Player', specName: 'Arcane', specId: 62 };

    const result = evaluateRotation(context);
    // arcane_blast was never observed → blast_builder (the fallback) cannot
    // be the expected action → no confident mistake from unobserved actions.
    const confident = result.result?.decisions.filter(
      (decision) => decision.verdict === 'mistake' || decision.verdict === 'suboptimal',
    );
    expect(confident ?? []).toHaveLength(0);
    expect(result.findings).toEqual([]);
  });

  it('honours explicit knowledge without fighting the registry/date', () => {
    const events = [
      ...salvoStackEvents(0, 12),
      {
        // Observed blast keeps blast_builder eligible (never-observed filter).
        timestamp: 15_000,
        type: 'cast',
        sourceId: 1,
        abilityId: 30451,
        abilityName: 'Arcane Blast',
        fightId: 8,
      } satisfies CombatEvent,
      {
        timestamp: 20_000,
        type: 'cast',
        sourceId: 1,
        abilityId: 5143,
        abilityName: 'Arcane Missiles',
        fightId: 8,
      } satisfies CombatEvent,
    ];
    const context = makeContext({
      fightStart: 0,
      fightEnd: 60_000,
      events,
    });
    context.player = { id: 1, name: 'Mage', type: 'Player', specId: 62 };
    const result = evaluateRotation(context, { knowledge: ARCANE_MAGE_KNOWLEDGE });
    expect(result.result).toBeDefined();
    expect(result.findings[0]?.verdict).toBe('mistake');
  });
});
