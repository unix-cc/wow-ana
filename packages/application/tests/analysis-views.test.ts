import { describe, it, expect } from 'vitest';
import type { FactSet } from '@wcl/domain';
import {
  buildCombatFactsView,
  buildDeathReviewView,
  buildRotationDigest,
  FACTS_VIEW_OPTIONS,
} from '../src/analysis-views.js';
import type { FightDeathReview } from '../src/app-service.js';

function baseSet(overrides?: Partial<FactSet>): FactSet {
  return {
    fight: { id: 8, startTime: 0, endTime: 100_000 },
    player: { id: 42, name: 'Hero' },
    ...overrides,
  };
}

describe('buildCombatFactsView damage / death / target / utility sections', () => {
  it('projects damage facts with dps and capped ability rows', () => {
    const set = baseSet({
      damage: {
        type: 'damage',
        totalDamage: 250_000,
        firstTimestamp: 10_000,
        lastTimestamp: 90_000,
        abilities: Array.from({ length: 25 }, (_, i) => ({
          type: 'damage.ability' as const,
          abilityId: i + 1,
          abilityName: `A${i}`,
          count: 1,
          total: 10_000 - i,
          critCount: 0,
          hitCount: 1,
        })),
      },
    });

    const view = buildCombatFactsView(set);
    expect(view.damage?.totalDamage).toBe(250_000);
    // 250k damage over 100s = 2500 dps.
    expect(view.damage?.dps).toBe(2500);
    expect(view.damage?.activeTimeMs).toBe(80_000);
    expect(view.damage?.abilities).toHaveLength(
      FACTS_VIEW_OPTIONS.damageAbilities,
    );
    expect(view.damage?.abilitiesCapped).toBe(true);
    expect(view.damage?.abilities[0]?.abilityName).toBe('A0');
  });

  it('projects death incidents with capped taken samples', () => {
    const set = baseSet({
      death: {
        type: 'death',
        deaths: [
          {
            type: 'death.incident',
            timestamp: 50_000,
            takenTotal: 900,
            takenEvents: Array.from({ length: 12 }, (_, i) => ({
              timestamp: 49_000 + i * 50,
              amount: 75,
            })),
          },
        ],
      },
    });

    const view = buildCombatFactsView(set);
    expect(view.deaths).toHaveLength(1);
    const incident = view.deaths?.[0];
    expect(incident?.timestamp).toBe(50_000);
    expect(incident?.takenTotal).toBe(900);
    expect(incident?.takenSample).toHaveLength(
      FACTS_VIEW_OPTIONS.takenEventSample,
    );
    expect(incident?.takenSampleCapped).toBe(true);
  });

  it('projects target / dispel / interrupt groups', () => {
    const set = baseSet({
      target: {
        type: 'target',
        targetCount: 2,
        switches: 1,
        targets: [
          { type: 'target.damage', targetId: 5, hits: 4, total: 400 },
          { type: 'target.damage', targetId: 6, hits: 1, total: 100 },
        ],
      },
      dispel: {
        type: 'dispel',
        count: 3,
        byTarget: [{ type: 'dispel.target', targetId: 5, count: 3 }],
      },
      interrupt: {
        type: 'interrupt',
        count: 2,
        distinctTargets: 2,
        byTarget: [
          { type: 'interrupt.target', targetId: 5, count: 1 },
          { type: 'interrupt.target', targetId: 6, count: 1 },
        ],
      },
    });

    const view = buildCombatFactsView(set);
    expect(view.target?.targetCount).toBe(2);
    expect(view.target?.switches).toBe(1);
    expect(view.target?.targetsCapped).toBe(false);
    expect(view.target?.targets[0]).toMatchObject({ targetId: 5, hits: 4, total: 400 });

    expect(view.dispel?.count).toBe(3);
    expect(view.dispel?.byTargetCapped).toBe(false);

    expect(view.interrupt?.count).toBe(2);
    expect(view.interrupt?.distinctTargets).toBe(2);
  });

  it('keeps the view stable when the opt-in groups are absent', () => {
    const view = buildCombatFactsView(baseSet());
    expect(view.damage).toBeUndefined();
    expect(view.deaths).toBeUndefined();
    expect(view.target).toBeUndefined();
    expect(view.dispel).toBeUndefined();
    expect(view.interrupt).toBeUndefined();
    expect(view.casts.totalCasts).toBe(0);
  });
});

function deathReview(overrides?: Partial<FightDeathReview>): FightDeathReview {
  return {
    reportCode: 'ABC123',
    fightId: 8,
    fightName: '密谋小径',
    deaths: [
      {
        deathAt: 1_134_000,
        relativeMs: 1_134_000,
        playerId: 42,
        playerName: '西爱',
        role: 'healer',
        windowMs: 8000,
        hits: 2,
        takenTotal: 844_348,
        burstMs: 600,
        killer: {
          sourceId: 53,
          sourceName: '亵渎傀�?',
          abilityId: 1_294_827,
          abilityName: '灵魂撕裂',
          amount: 512_000,
          at: 1_134_000,
        },
        topSources: [
          { sourceId: 53, sourceName: '亵渎傀�?', hits: 2, total: 844_348 },
          { sourceId: 54, sourceName: '影裔勇士', hits: 1, total: 50_000 },
        ],
        mobFirstAttacks: [],
        healingReceived: 120_000,
        healCount: 3,
        healAttempts: 4,
        overhealInWindow: 30_000,
        healers: [
          { playerId: 45, playerName: '�̵�', count: 3, total: 120_000 },
        ],
        healerDiedBefore: {
          playerId: 46,
          playerName: '����',
          diedMsBefore: 12_000,
          hadHealedVictim: true,
        },
        cause: 'burst-kill',
        summary: '0.6s 内两�? 844,348，被亵渎傀�? #53 秒杀',
      },
    ],
    wipes: [
      {
        deaths: [
          { playerId: 42, playerName: '西爱', role: 'healer', relativeMs: 1_134_000 },
          { playerId: 43, playerName: '土豆', role: 'dps', relativeMs: 1_160_000 },
        ],
        startAtMs: 1_134_000,
        endAtMs: 1_175_000,
        firstDeathPlayerName: '西爱',
        triggerDeathIndex: 0,
      },
    ],
    adds: [
      {
        mobId: 53,
        mobName: '亵渎傀�?',
        firstTouchedAtMs: 1_086_700,
        touchedBy: { playerId: 6, playerName: '铁墙', role: 'tank' },
        firstHitPlayerAtMs: 1_088_800,
        relatedDeathPlayerName: '西爱',
        recentAdd: false,
        confidence: 'medium',
        note: '坦克 #6 于死亡前 11.2s 首次接触该�?',
      },
    ],
    ...overrides,
  };
}

describe('buildDeathReviewView', () => {
  it('projects deaths, wipes and adds with honest counts', () => {
    const view = buildDeathReviewView(deathReview());

    expect(view.reportCode).toBe('ABC123');
    expect(view.fightName).toBe('密谋小径');
    expect(view.deathCount).toBe(1);
    expect(view.wipeCount).toBe(1);
    expect(view.addCount).toBe(1);

    const death = view.deaths[0]!;
    expect(death.playerName).toBe('西爱');
    expect(death.cause).toBe('burst-kill');
    expect(death.takenTotal).toBe(844_348);
    expect(death.healingReceived).toBe(120_000);
    expect(death.healCount).toBe(3);
    expect(death.healAttempts).toBe(4);
    expect(death.overhealInWindow).toBe(30_000);
    expect(death.healers).toEqual([
      { playerName: '�̵�', count: 3, total: 120_000 },
    ]);
    expect(death.healerDiedBefore).toMatchObject({
      playerName: '����',
      hadHealedVictim: true,
    });
    expect(death.healers[0]?.total).toBe(120_000);
    expect(death.killer?.sourceName).toBe('亵渎傀�?');
    expect(death.topSources).toHaveLength(2);
    expect(deathsNotCapped(view)).toBe(false);

    const wipe = view.wipes[0]!;
    expect(wipe.firstDeathPlayerName).toBe('西爱');
    expect(wipe.deaths).toHaveLength(2);

    const add = view.adds[0]!;
    expect(add.confidence).toBe('medium');
    expect(add.touchedByPlayerName).toBe('铁墙');
    expect(view.addsCapped).toBe(false);
  });

  it('caps every array and reports the capping', () => {
    const many = Array.from({ length: FACTS_VIEW_OPTIONS.reviewDeaths + 5 }, (_, i) => ({
      deathAt: i * 1000,
      relativeMs: i * 1000,
      playerId: i,
      playerName: `P${i}`,
      role: 'dps' as const,
      windowMs: 8000,
      hits: 1,
      takenTotal: 1,
      burstMs: 0,
      killer: undefined,
      topSources: [],
      mobFirstAttacks: [],
      healingReceived: 0,
      healCount: 0,
      healAttempts: 0,
      overhealInWindow: 0,
      healers: [],
      cause: 'unknown' as const,
      summary: 's',
    }));

    const view = buildDeathReviewView(
      deathReview({ deaths: many }),
    );

    expect(view.deathCount).toBe(many.length);
    expect(view.deaths).toHaveLength(FACTS_VIEW_OPTIONS.reviewDeaths);
    expect(view.deathsCapped).toBe(true);
  });

  it('keeps an empty review honest (no fabricated rows)', () => {
    const view = buildDeathReviewView(
      deathReview({ deaths: [], wipes: [], adds: [] }),
    );
    expect(view.deathCount).toBe(0);
    expect(view.wipeCount).toBe(0);
    expect(view.addCount).toBe(0);
    expect(view.deaths).toEqual([]);
    expect(view.wipes).toEqual([]);
    expect(view.adds).toEqual([]);
  });
});

describe('buildRotationDigest engagement segmentation', () => {
  const result = (
    times: number[],
    verdicts: string[] = [],
  ): Parameters<typeof buildRotationDigest>[0] => ({
    decisions: times.map((time, i) => ({
      time,
      actualKey: 'x',
      actualAbilityId: 1,
      verdict: (verdicts[i] ?? 'unknown') as 'unknown',
    })),
    breakdown: { unknown: times.length },
    skippedUnmappedCasts: 0,
    scenario: 'st',
    knowledge: { specName: 'TestSpec', knowledgeVersion: '0.0.0' },
  });

  it('splits a Mythic+ dungeon into pull segments by decision-time gaps', () => {
    const digest = buildRotationDigest(
      result(
        [0, 2_000, 4_000, 40_000, 42_000, 120_000],
        ['correct', 'mistake', 'correct', 'correct', 'suboptimal', 'correct'],
      ),
    );
    expect(digest.engagements).toEqual([
      { startMs: 0, endMs: 4_000, decisions: 3, flagged: 1 },
      { startMs: 40_000, endMs: 42_000, decisions: 2, flagged: 1 },
      { startMs: 120_000, endMs: 120_000, decisions: 1, flagged: 0 },
    ]);
    expect(digest.engagementsCapped).toBe(false);
  });

  it('omits engagements for a continuous (raid) fight', () => {
    const digest = buildRotationDigest(result([0, 1_500, 3_000, 4_500]));
    expect(digest.engagements).toBeUndefined();
    expect(digest.engagementsCapped).toBeUndefined();
  });
});

function deathsNotCapped(view: ReturnType<typeof buildDeathReviewView>): boolean {
  return view.deathsCapped;
}
