import { describe, it, expect } from 'vitest';
import type { CombatEvent } from '@wcl/domain';
import {
  buildDeathIncident,
  clusterWipes,
  suggestAdds,
  type ReviewDeathPoint,
  type MobTouchInfo,
} from '../src/combat/death-review.js';
import { isTankSpec, isHealerSpec, roleOfSpec } from '../src/combat/roles.js';

function taken(
  at: number,
  sourceId: number,
  targetId: number,
  amount: number,
  extra?: { abilityId?: number; abilityName?: string; hitType?: 'absorb' },
): CombatEvent {
  return {
    timestamp: at,
    type: 'damage',
    fightId: 13,
    sourceId,
    targetId,
    amount,
    abilityId: extra?.abilityId,
    abilityName: extra?.abilityName,
    hitType: extra?.hitType,
  };
}

const DEATH_AT = 1_000_000; // report-absolute
const FIGHT_START = 900_000;

function deathPoint(over?: Partial<ReviewDeathPoint>): ReviewDeathPoint {
  return {
    timestamp: DEATH_AT,
    playerId: 1572,
    playerName: '路鸣泽',
    specName: 'Elemental',
    ...over,
  };
}

describe('clusterWipes', () => {
  it('groups deaths within the gap and requires enough distinct players', () => {
    const deaths: ReviewDeathPoint[] = [
      deathPoint({ timestamp: 1_000_000, playerId: 1, playerName: 'A' }),
      deathPoint({ timestamp: 1_008_000, playerId: 2, playerName: 'B' }),
      deathPoint({ timestamp: 1_015_000, playerId: 3, playerName: 'C' }),
      deathPoint({ timestamp: 1_200_000, playerId: 1, playerName: 'A' }),
    ];
    const wipes = clusterWipes(deaths, { wipeGapMs: 15_000, wipeMinPlayers: 3 });
    expect(wipes).toHaveLength(1);
    expect(wipes[0]).toHaveLength(3);
  });

  it('does not call a solo death a wipe', () => {
    const deaths: ReviewDeathPoint[] = [
      deathPoint({ playerId: 1, playerName: 'A' }),
    ];
    expect(clusterWipes(deaths)).toHaveLength(0);
  });
});

describe('buildDeathIncident', () => {
  it('classifies a short multi-hit death as burst-kill with the last hit as killer', () => {
    const events = [
      taken(DEATH_AT - 600, 2168, 1572, 496_000, { abilityId: 1310761 }),
      taken(DEATH_AT - 20, 2170, 1572, 348_230, { abilityId: 267105 }),
    ];
    const incident = buildDeathIncident(deathPoint(), events, { fightStart: FIGHT_START });
    expect(incident.hits).toBe(2);
    expect(incident.takenTotal).toBe(844_230);
    expect(incident.burstMs).toBe(600);
    expect(incident.cause).toBe('burst-kill');
    expect(incident.killer).toMatchObject({
      sourceId: 2170,
      amount: 348_230,
      abilityId: 267105,
    });
    expect(incident.mobFirstAttacks).toEqual([
      { sourceId: 2168, at: DEATH_AT - 600 },
      { sourceId: 2170, at: DEATH_AT - 20 },
    ]);
    expect(incident.role).toBe('dps');
    expect(incident.summary).toContain('最后一击');
  });

  it('classifies sustained deaths (long window, many hits)', () => {
    const events = Array.from({ length: 40 }, (_, i) =>
      taken(DEATH_AT - 7600 + i * 200, 10, 1572, 20_000),
    );
    const incident = buildDeathIncident(deathPoint(), events, { fightStart: FIGHT_START });
    expect(incident.hits).toBeGreaterThan(30);
    expect(incident.burstMs).toBeGreaterThan(5000);
    expect(incident.cause).toBe('sustained');
    expect(incident.takenTotal).toBe(incident.hits * 20_000);
  });

  it('attributes environment-dominated deaths to environment', () => {
    const events = [
      taken(DEATH_AT - 1000, -1, 1572, 800_000),
      taken(DEATH_AT - 300, 2170, 1572, 100_000),
    ];
    const incident = buildDeathIncident(deathPoint(), events, { fightStart: FIGHT_START });
    expect(incident.cause).toBe('environment');
    expect(incident.topSources[0]).toMatchObject({
      sourceId: -1,
      sourceName: 'Environment',
    });
  });

  it('reports no-data when the window has no damaging hit', () => {
    const incident = buildDeathIncident(deathPoint(), [], { fightStart: FIGHT_START });
    expect(incident.cause).toBe('no-data');
    expect(incident.killer).toBeUndefined();
  });

  it('resolves mob names from the lookup map', () => {
    const events = [taken(DEATH_AT - 100, 2170, 1572, 300_000)];
    const incident = buildDeathIncident(deathPoint(), events, {
      fightStart: FIGHT_START,
      mobNameById: new Map([[2170, '洪流图腾']]),
    });
    expect(incident.topSources[0]?.sourceName).toBe('洪流图腾');
    expect(incident.killer?.sourceName).toBe('洪流图腾');
  });

  it('excludes self-source ticks from the damage count (shield ticks are not damage taken)', () => {
    const events = [
      taken(DEATH_AT - 300, 1572, 1572, 4_628, { hitType: 'absorb' }), // self shield
      taken(DEATH_AT - 100, 2170, 1572, 348_230), // real mob hit
    ];
    const incident = buildDeathIncident(deathPoint(), events, {
      fightStart: FIGHT_START,
    });
    expect(incident.hits).toBe(1);
    expect(incident.takenTotal).toBe(348_230);
    expect(incident.killer).toMatchObject({ sourceId: 2170 });
    expect(incident.mobFirstAttacks).toEqual([{ sourceId: 2170, at: DEATH_AT - 100 }]);
  });

  it('never reports a friendly player as a mob attacker in the add pipeline', () => {
    const events = [
      taken(DEATH_AT - 2000, 1572, 1572, 3_968, { hitType: 'absorb' }), // self tick
      taken(DEATH_AT - 500, 1573, 1572, 2_567), // teammate damage (friendly)
      taken(DEATH_AT - 100, 2170, 1572, 348_230), // real mob hit
    ];
    const incident = buildDeathIncident(deathPoint(), events, {
      fightStart: FIGHT_START,
      friendlySourceIds: new Set([1573]),
    });
    expect(incident.mobFirstAttacks.every((m) => m.sourceId !== 1572 && m.sourceId !== 1573)).toBe(true);
    expect(incident.hits).toBe(1);
    expect(incident.killer).toMatchObject({ sourceId: 2170 });
  });

  it('counts only effective in-window heals toward healingReceived', () => {
    const heal = (
      at: number,
      amount: number,
      extra?: Partial<CombatEvent>,
    ): CombatEvent => ({
      timestamp: at,
      type: 'heal',
      sourceId: 1573,
      targetId: 1572,
      amount,
      fightId: 13,
      ...extra,
    });
    const healing = [
      heal(DEATH_AT - 1_000, 200_000), // effective, in window
      heal(DEATH_AT - 500, 0), // fully overhealed → ignored
      heal(DEATH_AT - 200, undefined), // no amount → ignored
      heal(DEATH_AT - 20_000, 999_999), // outside the 8s window → ignored
      // Healing dataType also returns buff/other rows → ignored by type.
      { timestamp: DEATH_AT - 100, type: 'buff', targetId: 1572, fightId: 13 },
    ];
    const events = [taken(DEATH_AT - 1_500, 2170, 1572, 600_000)];

    const incident = buildDeathIncident(
      deathPoint(),
      events,
      { fightStart: FIGHT_START },
      healing,
    );

    expect(incident.healingReceived).toBe(200_000);
    expect(incident.healCount).toBe(1);
    expect(incident.summary).toContain('缺口 400,000');
  });

  it('reports fully-overhealed attempts distinctly from zero healing', () => {
    // Healer WAS casting, but every heal landed on a full-health target
    // before the burst — a different story from "no one healed at all".
    const healing: CombatEvent[] = [
      {
        timestamp: DEATH_AT - 1_500,
        type: 'heal',
        sourceId: 2131,
        targetId: 1572,
        amount: 0,
        overheal: 90_000,
        fightId: 13,
      },
      {
        timestamp: DEATH_AT - 700,
        type: 'heal',
        sourceId: 2131,
        targetId: 1572,
        amount: 0,
        overheal: 45_500,
        fightId: 13,
      },
    ];
    const events = [taken(DEATH_AT - 200, 2170, 1572, 600_000)];

    const incident = buildDeathIncident(
      deathPoint(),
      events,
      { fightStart: FIGHT_START },
      healing,
    );

    expect(incident.healingReceived).toBe(0);
    expect(incident.healCount).toBe(0);
    expect(incident.healAttempts).toBe(2);
    expect(incident.overhealInWindow).toBe(135_500);
    expect(incident.summary).toContain('窗口内无有效治疗');
    expect(incident.summary).toContain('全部过量');
  });

  it('mentions the overhealed portion alongside a partial healing gap', () => {
    const healing: CombatEvent[] = [
      {
        timestamp: DEATH_AT - 1_000,
        type: 'heal',
        sourceId: 2131,
        targetId: 1572,
        amount: 150_000,
        overheal: 25_000,
        fightId: 13,
      },
    ];
    const events = [taken(DEATH_AT - 1_500, 2170, 1572, 600_000)];

    const incident = buildDeathIncident(
      deathPoint(),
      events,
      { fightStart: FIGHT_START },
      healing,
    );

    expect(incident.healingReceived).toBe(150_000);
    expect(incident.healCount).toBe(1);
    expect(incident.healAttempts).toBe(1);
    expect(incident.overhealInWindow).toBe(25_000);
    expect(incident.summary).toContain('缺口 450,000');
    expect(incident.summary).toContain('另有 25,000 过量');
  });

  it('attributes the window healing per healer with names', () => {
    const heal = (at: number, sourceId: number, amount: number): CombatEvent => ({
      timestamp: at,
      type: 'heal',
      sourceId,
      targetId: 1572,
      amount,
      fightId: 13,
    });
    const healing = [
      heal(DEATH_AT - 3_000, 2131, 80_000),
      heal(DEATH_AT - 2_000, 2131, 40_000),
      heal(DEATH_AT - 1_000, 1573, 30_000),
    ];
    const events = [taken(DEATH_AT - 3_500, 2170, 1572, 300_000)];

    const incident = buildDeathIncident(
      deathPoint(),
      events,
      {
        fightStart: FIGHT_START,
        playerNameById: new Map([
          [2131, 'Zkkqs'],
          [1573, 'Tudou'],
        ]),
      },
      healing,
    );

    expect(incident.healers).toEqual([
      { playerId: 2131, playerName: 'Zkkqs', count: 2, total: 120_000 },
      { playerId: 1573, playerName: 'Tudou', count: 1, total: 30_000 },
    ]);
    expect(incident.summary).toContain('来源 Zkkqs、Tudou');
    expect(incident.healerDiedBefore).toBeUndefined();
  });

  it('explains a healing gap with the healer who died earlier (nearest, had-healed flag)', () => {
    // Real-log shape (YR1c6fNvbGjtVdgH fight1): healer Zkkqs died 41s before
    // the victim; the victim then died with no effective healing in window.
    const heal = (at: number, sourceId: number, amount: number): CombatEvent => ({
      timestamp: at,
      type: 'heal',
      sourceId,
      targetId: 1572,
      amount,
      fightId: 13,
    });
    const priorDeaths: ReviewDeathPoint[] = [
      deathPoint({
        timestamp: DEATH_AT - 41_000,
        playerId: 2131,
        playerName: 'Zkkqs',
        specName: 'Holy',
      }),
    ];
    const events = [taken(DEATH_AT - 1_500, 2170, 1572, 500_000)];

    const incident = buildDeathIncident(
      deathPoint(),
      events,
      {
        fightStart: FIGHT_START,
        priorDeaths,
        roleById: new Map([
          [2131, 'healer'],
          [1572, 'dps'],
        ]),
        playerNameById: new Map([[2131, 'Zkkqs']]),
      },
      // Zkkqs healed the victim earlier in the fight, before dying.
      [heal(DEATH_AT - 60_000, 2131, 120_000)],
    );

    expect(incident.healerDiedBefore).toMatchObject({
      playerId: 2131,
      playerName: 'Zkkqs',
      hadHealedVictim: true,
    });
    expect(incident.healerDiedBefore?.diedMsBefore).toBe(41_000);
    expect(incident.summary).toContain('Zkkqs');
    expect(incident.summary).toContain('41.0s 前阵亡');
    expect(incident.summary).toContain('此前曾治疗该玩家');
  });

  it('does not attribute the gap when the dead player was not a healer', () => {
    const priorDeaths: ReviewDeathPoint[] = [
      deathPoint({
        timestamp: DEATH_AT - 5_000,
        playerId: 1573,
        playerName: 'Tudou',
        specName: 'Arms',
      }),
    ];
    const events = [taken(DEATH_AT - 1_500, 2170, 1572, 500_000)];

    const incident = buildDeathIncident(
      deathPoint(),
      events,
      {
        fightStart: FIGHT_START,
        priorDeaths,
        roleById: new Map([
          [1573, 'dps'],
          [1572, 'dps'],
        ]),
      },
      [],
    );

    expect(incident.healerDiedBefore).toBeUndefined();
    expect(incident.summary).toContain('窗口内无有效治疗');
  });

  it('does not attribute when the healer died long before (outside the window)', () => {
    const priorDeaths: ReviewDeathPoint[] = [
      deathPoint({
        timestamp: DEATH_AT - 300_000, // 5 minutes earlier — unrelated
        playerId: 2131,
        playerName: 'Zkkqs',
        specName: 'Holy',
      }),
    ];
    const events = [taken(DEATH_AT - 1_500, 2170, 1572, 500_000)];

    const incident = buildDeathIncident(
      deathPoint(),
      events,
      {
        fightStart: FIGHT_START,
        priorDeaths,
        roleById: new Map([
          [2131, 'healer'],
          [1572, 'dps'],
        ]),
      },
      [],
    );

    expect(incident.healerDiedBefore).toBeUndefined();
  });

  it('does not attribute when healing covered the damage taken', () => {
    const priorDeaths: ReviewDeathPoint[] = [
      deathPoint({
        timestamp: DEATH_AT - 10_000,
        playerId: 2131,
        playerName: 'Zkkqs',
        specName: 'Holy',
      }),
    ];
    const healing: CombatEvent[] = [
      {
        timestamp: DEATH_AT - 1_000,
        type: 'heal',
        sourceId: 1573,
        targetId: 1572,
        amount: 800_000,
        fightId: 13,
      },
    ];
    const events = [taken(DEATH_AT - 1_500, 2170, 1572, 500_000)];

    const incident = buildDeathIncident(
      deathPoint(),
      events,
      {
        fightStart: FIGHT_START,
        priorDeaths,
        roleById: new Map([
          [2131, 'healer'],
          [1573, 'dps'],
          [1572, 'dps'],
        ]),
      },
      healing,
    );

    // Healing covered the damage — a dead healer is not the story here.
    expect(incident.healerDiedBefore).toBeUndefined();
    expect(incident.summary).toContain('已覆盖受击');
  });

  it('reports no effective healing honestly when none was received', () => {
    const events = [taken(DEATH_AT - 6_000, 2170, 1572, 600_000)];
    const incident = buildDeathIncident(
      deathPoint(),
      events,
      { fightStart: FIGHT_START },
      [],
    );
    expect(incident.healingReceived).toBe(0);
    expect(incident.healCount).toBe(0);
    expect(incident.healAttempts).toBe(0);
    expect(incident.summary).toContain('窗口内无有效治疗');
    expect(incident.summary).not.toContain('过量');
  });

  it('distinguishes fully-overhealed attempts from no healing at all', () => {
    // Real WCL shape (verified live): fully-overhealed rows carry amount 0
    // and overheal > 0. The healer WAS casting — the target was at full
    // health when the burst landed. That is a different story from silence.
    const overhealOnly = (at: number, overheal: number): CombatEvent => ({
      timestamp: at,
      type: 'heal',
      sourceId: 2131,
      targetId: 1572,
      amount: 0,
      overheal,
      fightId: 13,
    });
    const events = [taken(DEATH_AT - 1_500, 2170, 1572, 500_000)];

    const incident = buildDeathIncident(
      deathPoint(),
      events,
      { fightStart: FIGHT_START },
      [
        overhealOnly(DEATH_AT - 2_000, 80_000),
        overhealOnly(DEATH_AT - 1_000, 40_000),
      ],
    );

    expect(incident.healingReceived).toBe(0);
    expect(incident.healCount).toBe(0);
    expect(incident.healAttempts).toBe(2);
    expect(incident.overhealInWindow).toBe(120_000);
    expect(incident.summary).toContain('2 次治疗尝试全部过量 120,000');
    expect(incident.summary).toContain('目标满血后被打爆');
  });

  it('appends the partial overheal total to a healing gap', () => {
    const heal = (at: number, amount: number, overheal: number): CombatEvent => ({
      timestamp: at,
      type: 'heal',
      sourceId: 2131,
      targetId: 1572,
      amount,
      overheal,
      fightId: 13,
    });
    const events = [taken(DEATH_AT - 1_500, 2170, 1572, 500_000)];

    const incident = buildDeathIncident(
      deathPoint(),
      events,
      { fightStart: FIGHT_START },
      [heal(DEATH_AT - 1_000, 200_000, 50_000)],
    );

    expect(incident.healingReceived).toBe(200_000);
    expect(incident.healAttempts).toBe(1);
    expect(incident.overhealInWindow).toBe(50_000);
    expect(incident.summary).toContain('缺口 300,000');
    expect(incident.summary).toContain('另有 50,000 过量');
  });

  it('omits the healing phrase when there was no damage to heal', () => {
    const incident = buildDeathIncident(
      deathPoint(),
      [],
      { fightStart: FIGHT_START },
      [],
    );
    expect(incident.cause).toBe('no-data');
    expect(incident.summary).not.toContain('有效治疗');
  });
});

describe('suggestAdds', () => {
  const touched: MobTouchInfo = {
    mobId: 2170,
    mobName: '洪流图腾',
    firstTouchedAt: DEATH_AT - 5000,
    touchedBy: { playerId: 2131, playerName: 'Zkkqs', role: 'healer' },
  };

  function incidentsWith(mobSourceId: number, mobHitAt = DEATH_AT - 200): Parameters<typeof suggestAdds>[0] {
    const events = [taken(mobHitAt, mobSourceId, 1572, 348_230)];
    return [
      buildDeathIncident(deathPoint(), events, {
        fightStart: FIGHT_START,
        mobNameById: new Map([[2170, '洪流图腾']]),
      }),
    ];
  }

  it('flags a non-tank first-touch shortly before the death as an add suspect', () => {
    const suspects = suggestAdds(
      incidentsWith(2170),
      new Map([[2170, touched]]),
      { fightStart: FIGHT_START },
    );
    expect(suspects).toHaveLength(1);
    expect(suspects[0]).toMatchObject({
      mobName: '洪流图腾',
      touchedBy: { playerName: 'Zkkqs', role: 'healer' },
      recentAdd: true,
      confidence: 'medium',
    });
    expect(suspects[0]?.note).toContain('Zkkqs');
  });

  it('treats a tank-touch as an add-wave narrative, not an accusation', () => {
    const tankTouch: MobTouchInfo = {
      ...touched,
      touchedBy: { playerId: 1571, playerName: 'Devilkin', role: 'tank' },
    };
    const suspects = suggestAdds(incidentsWith(2170), new Map([[2170, tankTouch]]), {
      fightStart: FIGHT_START,
    });
    expect(suspects[0]?.confidence).toBe('medium');
    expect(suspects[0]?.note).toContain('坦克');
  });

  it('does not accuse when the mob attacked long before any touch', () => {
    const oldTouch: MobTouchInfo = {
      ...touched,
      firstTouchedAt: DEATH_AT - 200_000, // not a recent add
    };
    const suspects = suggestAdds(
      incidentsWith(2170),
      new Map([[2170, oldTouch]]),
      { fightStart: FIGHT_START },
    );
    expect(suspects).toHaveLength(0);
  });

  it('notes when the mob was never touched by any player', () => {
    const suspects = suggestAdds(incidentsWith(999), new Map(), { fightStart: FIGHT_START });
    expect(suspects).toHaveLength(1);
    expect(suspects[0]?.confidence).toBe('low');
    expect(suspects[0]?.note).toContain('没有被任何玩家攻击过');
  });

  it('does not accuse the tank when it touched the mob only after the death', () => {
    // Regression: the mob hit the player at t-200ms; the tank only touched it
    // *after* the death. This is a mob entering combat on its own, not an
    // accusation against anyone.
    const lateTankTouch: MobTouchInfo = {
      mobId: 2170,
      mobName: '洪流图腾',
      firstTouchedAt: DEATH_AT + 1765,
      touchedBy: { playerId: 1571, playerName: 'Devilkin', role: 'tank' },
    };
    const suspects = suggestAdds(incidentsWith(2170), new Map([[2170, lateTankTouch]]), {
      fightStart: FIGHT_START,
    });
    expect(suspects).toHaveLength(1);
    expect(suspects[0]?.confidence).toBe('low');
    expect(suspects[0]?.recentAdd).toBe(false);
    expect(suspects[0]?.note).toContain('先攻击');
    expect(suspects[0]?.note).not.toContain('拉入');
  });
});

describe('roles', () => {
  it('classifies specs into roles', () => {
    expect(isTankSpec('Blood')).toBe(true);
    expect(isTankSpec('Protection')).toBe(true);
    expect(isHealerSpec('Holy')).toBe(true);
    expect(roleOfSpec('Arcane')).toBe('dps');
    expect(roleOfSpec(undefined)).toBe('unknown');
  });
});
