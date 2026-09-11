import { describe, it, expect, vi } from 'vitest';
import {
  AppService,
  classForPlayer,
  rankingsClassName,
  REFERENCE_POOL_SIZE,
} from '../src/app-service.js';
import { mergeMetrics } from '@wcl/analysis-engine';
import type { WclClient } from '@wcl/wcl-client';
import type { Fight, Player, Report } from '@wcl/domain';
import { WclCache, MemoryCache } from '@wcl/storage';

const report: Report = {
  code: 'ABC123',
  title: 'Raid',
  startTime: 0,
  endTime: 100_000,
  zone: { id: 1000, name: 'Nerub-ar Palace' },
};

const fight: Fight = {
  id: 8,
  name: 'Fight 8',
  startTime: 0,
  endTime: 100_000,
};

const player: Player = {
  id: 42,
  name: 'Hero',
  type: 'Player',
  specName: 'Beast Mastery',
};

function makeMockClient(): WclClient {
  return {
    getReport: vi.fn().mockResolvedValue(report),
    getFights: vi.fn().mockResolvedValue([fight]),
    getActors: vi.fn().mockResolvedValue([player]),
    getEvents: vi.fn().mockResolvedValue([]),
    getPlayerCasts: vi.fn().mockResolvedValue([]),
    getPlayerBuffs: vi.fn().mockResolvedValue([]),
    getPlayerDamage: vi.fn().mockResolvedValue([]),
    getPlayerDeaths: vi.fn().mockResolvedValue([]),
    getFightFriendlies: vi
      .fn()
      .mockResolvedValue([{ actorId: 42, specName: 'Beast Mastery' }]),
  } as unknown as WclClient;
}

describe('AppService', () => {
  it('returns report metadata', async () => {
    const service = new AppService(makeMockClient());
    expect(await service.getReport('ABC123')).toEqual(report);
  });

  it('lists fights', async () => {
    const service = new AppService(makeMockClient());
    expect(await service.getFights('ABC123')).toEqual([fight]);
  });

  it('returns player summary for a known player', async () => {
    const service = new AppService(makeMockClient());
    const summary = await service.getPlayerSummary('ABC123', 8, 42);
    expect(summary).toEqual({
      playerId: 42,
      name: 'Hero',
      spec: 'Beast Mastery',
      type: 'Player',
    });
  });

  it('returns undefined summary for an unknown player', async () => {
    const service = new AppService(makeMockClient());
    const summary = await service.getPlayerSummary('ABC123', 8, 999);
    expect(summary).toBeUndefined();
  });

  it('runs analysis and aggregates metrics from analyzers', async () => {
    const client = makeMockClient();
    // One cast + one damage event
    (client.getPlayerCasts as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        timestamp: 0,
        type: 'cast',
        sourceId: 42,
        abilityId: 1,
        abilityName: 'Cobra Shot',
        fightId: 8,
      },
      {
        timestamp: 1000,
        type: 'cast',
        sourceId: 42,
        abilityId: 1,
        abilityName: 'Cobra Shot',
        fightId: 8,
      },
    ]);
    (client.getPlayerDamage as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        timestamp: 0,
        type: 'damage',
        sourceId: 42,
        abilityId: 1,
        abilityName: 'Cobra Shot',
        amount: 500,
        fightId: 8,
      },
    ]);

    const service = new AppService(client);
    const { summary, result } = await service.analyzePlayer('ABC123', {
      fightId: 8,
      playerId: 42,
    });

    expect(summary?.name).toBe('Hero');

    const cast = result.metrics.cast as { totalCasts: number };
    expect(cast.totalCasts).toBe(2);

    const damage = result.metrics.damage as {
      totalDamage: number;
      dps: number;
    };
    expect(damage.totalDamage).toBe(500);
    // 500 damage over 100s fight -> 5 dps
    expect(damage.dps).toBe(5);
  });

  it('respects the include filter', async () => {
    const client = makeMockClient();
    const service = new AppService(client);
    const { result } = await service.analyzePlayer('ABC123', {
      fightId: 8,
      playerId: 42,
      include: ['summary', 'damage'],
    });

    expect(result.metrics.cast).toBeUndefined();
    expect(result.metrics.damage).toBeDefined();
  });

  it('runs cooldown analysis when cooldowns are provided', async () => {
    const client = makeMockClient();
    const service = new AppService(client);
    const { result } = await service.analyzePlayer('ABC123', {
      fightId: 8,
      playerId: 42,
      cooldowns: [
        { abilityId: 100, abilityName: 'Bestial Wrath', cooldownMs: 30_000 },
      ],
      include: ['cooldowns'],
    });

    const cooldown = result.metrics.cooldown as {
      usages: Array<{ abilityName: string }>;
    };
    expect(cooldown.usages[0]?.abilityName).toBe('Bestial Wrath');
  });

  it('runs the spec analyzer for Beast Mastery players', async () => {
    const service = new AppService(makeMockClient());
    const { result } = await service.analyzePlayer('ABC123', {
      fightId: 8,
      playerId: 42,
    });

    expect(result.metrics.spec).toBe('Beast Mastery Hunter');
    const bmCooldowns = result.metrics.bmCooldowns as unknown[];
    expect(bmCooldowns).toHaveLength(2);
  });

  it('returns a heuristic score and severity-prioritized findings', async () => {
    const service = new AppService(makeMockClient());
    const { result } = await service.analyzePlayer('ABC123', {
      fightId: 8,
      playerId: 42,
    });

    expect(result.score?.overall).toBeTypeOf('number');
    expect(result.score!.overall).toBeGreaterThanOrEqual(0);
    expect(result.score!.overall).toBeLessThanOrEqual(100);

    const severities = result.findings.map((f) => f.severity);
    expect(severities).toEqual([...severities].sort(bySeverity));
  });
});

const knowledgeLiveDate = new Date('2026-01-15T00:00:00Z').getTime();

/** A client whose fight starts inside the knowledge effective window. */
function datedClient(fightOverrides?: Partial<Fight>): WclClient {
  const client = makeMockClient();
  (client.getFights as ReturnType<typeof vi.fn>).mockResolvedValue([
    { ...fight, startTime: knowledgeLiveDate, ...fightOverrides },
  ]);
  return client;
}

describe('AppService Phase H insights', () => {
  it('caps raw event exports to the requested limit and the hard cap', async () => {
    const many = Array.from({ length: 700 }, (_, i) => ({ timestamp: i }));
    const client = makeMockClient();
    (client.getPlayerCasts as ReturnType<typeof vi.fn>).mockResolvedValue(many);
    (client.getPlayerBuffs as ReturnType<typeof vi.fn>).mockResolvedValue(many);
    const service = new AppService(client);

    const casts = await service.getPlayerCasts('ABC123', 8, 42);
    expect(casts).toHaveLength(500);

    const casts250 = await service.getPlayerCasts('ABC123', 8, 42, {
      limit: 250,
    });
    expect(casts250).toHaveLength(250);

    // Requesting more than the cap is clamped, never a crash.
    const castsBulk = await service.getPlayerCasts('ABC123', 8, 42, {
      limit: 10_000,
    });
    expect(castsBulk).toHaveLength(500);

    const buffs = await service.getPlayerBuffs('ABC123', 8, 42, { limit: 5 });
    expect(buffs).toHaveLength(5);
  });

  it('builds a bounded combat-facts view from cast events', async () => {
    const client = makeMockClient();
    (client.getPlayerCasts as ReturnType<typeof vi.fn>).mockResolvedValue([
      { timestamp: 0, type: 'cast', sourceId: 42, abilityId: 1, abilityName: 'Cobra Shot', fightId: 8 },
      { timestamp: 1500, type: 'cast', sourceId: 42, abilityId: 1, abilityName: 'Cobra Shot', fightId: 8 },
      { timestamp: 3000, type: 'cast', sourceId: 42, abilityId: 2, abilityName: 'Kill Command', fightId: 8 },
    ]);
    const service = new AppService(client);
    const view = await service.getCombatFacts('ABC123', {
      fightId: 8,
      playerId: 42,
    });

    expect(view.fightId).toBe(8);
    expect(view.player.id).toBe(42);
    expect(view.durationMs).toBe(100_000);
    expect(view.casts.totalCasts).toBe(3);
    const top = view.casts.abilities[0];
    expect(top).toMatchObject({ abilityName: 'Cobra Shot', count: 2 });
    expect(view.casts.abilitiesCapped).toBe(false);
    expect(view.casts.abilities.length).toBeLessThanOrEqual(20);
  });

  it('resolves live spec knowledge for a known spec and throws otherwise', async () => {
    const service = new AppService(datedClient());
    const knowledge = await service.getSpecKnowledge('ABC123', {
      fightId: 8,
      playerId: 42,
    });
    expect(knowledge.specName).toBe('Beast Mastery');
    expect(knowledge.knowledgeVersion).toBe('1.0.0');
    expect(knowledge.abilities.length).toBeGreaterThan(0);

    // An unsupported spec must degrade with a clear error, not a verdict.
    const client = datedClient();
    (client.getActors as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 42, name: 'Hero', type: 'Player', specName: 'Demonology' },
    ]);
    (client.getFightFriendlies as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const service2 = new AppService(client);
    await expect(
      service2.getSpecKnowledge('ABC123', { fightId: 8, playerId: 42 }),
    ).rejects.toThrow('没有可用的职业知识');
  });

  it('analyze_fight merges the verdict-stream rotation digest into the result', async () => {
    const service = new AppService(datedClient());
    const outcome = await service.analyzeFight('ABC123', {
      fightId: 8,
      playerId: 42,
    });

    expect(outcome.summary?.spec).toBe('Beast Mastery');
    expect(outcome.result.score?.overall).toBeTypeOf('number');
    // BM knowledge is live at the dated fight, so the rotation digest exists.
    expect(outcome.rotation).toBeDefined();
    expect(outcome.rotation?.knowledge.specName).toBe('Beast Mastery');
    expect(outcome.rotation?.scenario).toBe('st');
  });
});

describe('AppService Phase I dual versions + analysis cache', () => {
  const bossFight: Fight = {
    ...fight,
    startTime: knowledgeLiveDate,
    boss: 1000,
  };

  /**
   * Arguments of every `getEncounterRankings` call made on the uncached M+ path
   * — the pool cap is asserted through it (a warm analysis cache skips the
   * whole reference build, so a plain spy would see nothing).
   */
  const rankingCallArgs: Array<{ encounterId: number; limit?: number | undefined }> = [];

  /** A client with a boss fight + rankings fetch whose calls we can count. */
  function cachingClient(): {
    client: WclClient;
    rankingsCalls: () => number;
  } {
    const rankings = vi.fn().mockResolvedValue({
      encounterId: 1000,
      className: 'Hunter',
      specName: 'Beast Mastery',
      rankings: [
        { name: 'TopLog', amount: 900_000 },
        { name: 'Second', amount: 700_000 },
      ],
    });
    const client = makeMockClient() as WclClient & {
      getEncounterRankings: ReturnType<typeof vi.fn>;
    };
    (client.getFights as ReturnType<typeof vi.fn>).mockResolvedValue([
      bossFight,
    ]);
    client.getEncounterRankings = rankings;
    return {
      client: client as WclClient,
      rankingsCalls: () => rankings.mock.calls.length,
    };
  }

  it('populates versions with the analyzer and the live knowledge version', async () => {
    const service = new AppService(datedClient());
    const { result } = await service.analyzePlayer('ABC123', {
      fightId: 8,
      playerId: 42,
    });
    expect(result.versions?.analyzerVersion).toBeDefined();
    // Beast Mastery knowledge v1.0.0 is live at the dated fight.
    expect(result.versions?.knowledgeVersion).toBe('1.0.0');
  });

  it('gives the Mythic+ baseline openable links and its real level range', async () => {
    // A Mythic+ dungeon run: the whole run is one fight, the zone is a keystone
    // season, and the ranked runs carry keystone levels + report references.
    const dungeonReport: Report = {
      ...report,
      zone: { id: 55, name: 'Mythic+ Season 2' },
    };
    const dungeonFight: Fight = {
      id: 13,
      name: "King's Rest",
      startTime: 0,
      endTime: knowledgeLiveDate,
      boss: 61762,
      difficulty: 10,
      zoneId: 1762,
    };
    const client = datedClient();
    (client.getReport as ReturnType<typeof vi.fn>).mockResolvedValue(dungeonReport);
    (client.getFights as ReturnType<typeof vi.fn>).mockResolvedValue([dungeonFight]);
    const rankings = vi.fn(
      (params: { encounterId: number; limit?: number | undefined }) => {
        rankingCallArgs.push(params);
        return Promise.resolve({
          encounterId: 61762,
          encounterName: "King's Rest",
          metric: 'dps',
          className: 'Hunter',
          specName: 'Beast Mastery',
          page: 1,
          hasMorePages: true,
          count: 100,
          rankings: [
            {
              name: 'TopLog',
              amount: 900_000,
              duration: 1_800_000,
              hardModeLevel: 21,
              report: { code: 'rrr111', fightID: 4, startTime: 1 },
            },
            {
              name: 'Second',
              amount: 700_000,
              duration: 1_900_000,
              hardModeLevel: 19,
              report: { code: 'rrr222', fightID: 2, startTime: 2 },
            },
            {
              name: 'NoReport',
              amount: 500_000,
              duration: 2_000_000,
              hardModeLevel: 20,
            },
          ],
        });
      },
    );
    client.getEncounterRankings = rankings as unknown as typeof client.getEncounterRankings;
    rankingCallArgs.length = 0;

    const { result } = await new AppService(client).analyzePlayer('ABC123', {
      fightId: 13,
      playerId: 42,
    });
    const rankRef = result.reference;
    expect(rankRef).toBeDefined();
    expect(rankRef?.source.keyLevel).toBe(10);
    expect(rankRef?.source.poolLevels).toEqual({ min: 19, max: 21 });
    expect(rankRef?.source.pool).toContain('+19~+21');
    // The label states the pool we actually used (the mock returned 3 rows),
    // so the old "前 100 名" can never be implied.
    expect(rankRef?.source.pool).toContain('前 3 名');
    expect(rankRef?.source.count).toBe(3);
    expect(rankRef?.top).toHaveLength(3);
    expect(rankRef?.source.rankingsUrl).toBe(
      'https://cn.warcraftlogs.com/zone/rankings/55#dungeon=61762&class=Hunter&spec=Beast%20Mastery',
    );
    // Ranked runs get a real permalink; a run without a report reference does not.
    expect(rankRef?.top[0]?.runUrl).toBe(
      'https://cn.warcraftlogs.com/reports/rrr111#fight=4',
    );
    expect(rankRef?.top[0]?.durationMs).toBe(1_800_000);
    expect(rankRef?.top[2]?.runUrl).toBeUndefined();
  });

  it('caps the baseline pool when fetching rankings', async () => {
    // The pool size is a module constant, so assert the contract where it is
    // applied: the fetch must ask for exactly the capped number of rows rather
    // than WCL's full 100-row page. Asserted on the M+ path below, which is the
    // one that always reaches the rankings fetch (a warm analysis cache
    // short-circuits the whole reference build).
    expect(REFERENCE_POOL_SIZE).toBe(10);
    expect(rankingCallArgs.map((args) => args.limit)).toEqual([REFERENCE_POOL_SIZE]);
    expect(rankingCallArgs[0]?.encounterId).toBe(61762);
  });

  it('resolves knowledge from real WCL frames (epoch report base + relative fight)', async () => {
    // Regression (found on real log fXdMjWKJbpna6yHv, fixed 2026-09-09):
    // WCL's report.startTime is epoch while fight.startTime is a
    // report-relative offset. Passing the raw offset to the knowledge
    // registry resolves against 1970 and silently drops knowledgeVersion
    // (and the rotation digest). The fight epoch is the SUM.
    const reportBase = knowledgeLiveDate - 50_000;
    const client = makeMockClient();
    (client.getReport as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...report,
      startTime: reportBase,
      endTime: reportBase + 150_000,
    });
    (client.getFights as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...fight, startTime: 50_000, endTime: 150_000 },
    ]);
    const service = new AppService(client);
    const { result } = await service.analyzePlayer('ABC123', {
      fightId: 8,
      playerId: 42,
    });
    // 50_000 offset + reportBase lands exactly at knowledgeLiveDate.
    expect(result.versions?.knowledgeVersion).toBe('1.0.0');

    const specKnowledge = await service.getSpecKnowledge('ABC123', {
      fightId: 8,
      playerId: 42,
    });
    expect(specKnowledge.knowledgeVersion).toBe('1.0.0');
  });

  it('omits knowledgeVersion for specs without live knowledge', async () => {
    const client = makeMockClient();
    (client.getActors as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...player, specName: 'Demonology' },
    ]);
    (client.getFightFriendlies as ReturnType<typeof vi.fn>).mockResolvedValue([
      { actorId: 42, specName: 'Demonology' },
    ]);
    const service = new AppService(client);
    const { result } = await service.analyzePlayer('ABC123', {
      fightId: 8,
      playerId: 42,
    });
    expect(result.versions?.analyzerVersion).toBeDefined();
    expect(result.versions?.knowledgeVersion).toBeUndefined();
  });

  it('serves a repeated identical call from the cache (no rankings re-fetch)', async () => {
    const { client, rankingsCalls } = cachingClient();
    const service = new AppService(client, new WclCache(new MemoryCache()));

    const first = await service.analyzePlayer('ABC123', {
      fightId: 8,
      playerId: 42,
    });
    expect(rankingsCalls()).toBe(1);

    const second = await service.analyzePlayer('ABC123', {
      fightId: 8,
      playerId: 42,
    });
    expect(rankingsCalls()).toBe(1); // cache hit → analyzers + reference skipped
    expect(second.result).toEqual(first.result);
    expect(second.result.versions).toEqual(first.result.versions);
  });

  it('analyzeFight recomputes the rotation digest even on a cache hit', async () => {
    const { client, rankingsCalls } = cachingClient();
    const service = new AppService(client, new WclCache(new MemoryCache()));

    const first = await service.analyzeFight('ABC123', {
      fightId: 8,
      playerId: 42,
    });
    expect(rankingsCalls()).toBe(1);

    const second = await service.analyzeFight('ABC123', {
      fightId: 8,
      playerId: 42,
    });
    expect(rankingsCalls()).toBe(1); // hit
    expect(second.result).toEqual(first.result);
    // The digest is a local replay over the events, still produced on a hit.
    expect(second.rotation).toBeDefined();
    expect(second.rotation?.knowledge.knowledgeVersion).toBe('1.0.0');
  });

  it('keeps the legacy always-compute behaviour without a cache', async () => {
    const { client, rankingsCalls } = cachingClient();
    const service = new AppService(client); // no cache wired
    await service.analyzePlayer('ABC123', { fightId: 8, playerId: 42 });
    await service.analyzePlayer('ABC123', { fightId: 8, playerId: 42 });
    expect(rankingsCalls()).toBe(2);
  });
});

describe('AppService Phase K backlog fixes', () => {
  describe('K1: death analysis', () => {
    it('queries deaths by target and feeds the pre-death window from damage taken', async () => {
      const client = makeMockClient();
      const getPlayerDeaths = client.getPlayerDeaths as ReturnType<typeof vi.fn>;
      getPlayerDeaths.mockResolvedValue([
        {
          timestamp: 80_000,
          type: 'death',
          sourceId: 999,
          sourceName: 'The Boss',
          targetId: 42,
          targetName: 'Hero',
          fightId: 8,
        },
      ]);
      const getEvents = client.getEvents as ReturnType<typeof vi.fn>;
      getEvents.mockImplementation((params: { dataType?: string }) => {
        if (params.dataType === 'DamageTaken') {
          return Promise.resolve([
            {
              timestamp: 78_000,
              type: 'damage',
              sourceId: 999,
              abilityId: 200,
              abilityName: 'Tank Buster',
              targetId: 42,
              amount: 1200,
              hitType: 'normal',
              fightId: 8,
            },
            {
              timestamp: 79_000,
              type: 'damage',
              sourceId: 999,
              abilityId: 200,
              abilityName: 'Tank Buster',
              targetId: 42,
              amount: 800,
              hitType: 'normal',
              fightId: 8,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const service = new AppService(client);
      const { result } = await service.analyzePlayer('ABC123', {
        fightId: 8,
        playerId: 42,
        include: ['summary', 'damage', 'deaths'],
      });

      // WCL Deaths reports the deceased as the event *target* (audit §10.1).
      expect(getPlayerDeaths).toHaveBeenCalledWith({
        reportCode: 'ABC123',
        fightId: 8,
        targetId: 42,
      });
      const damageTakenCalls = getEvents.mock.calls.filter(
        (call) => (call[0] as { dataType?: string }).dataType === 'DamageTaken',
      );
      expect(damageTakenCalls.length).toBeGreaterThan(0);
      // WCL returns "damage taken by actor X" when sourceID = X (Phase O
      // verified on a real log); the victim must NOT go in targetId.
      expect(damageTakenCalls[0]?.[0]).toMatchObject({
        dataType: 'DamageTaken',
        sourceId: 42,
      });
      expect(damageTakenCalls[0]?.[0]).not.toHaveProperty('targetId');

      const death = result.metrics.death as {
        deaths: Array<{ takenTotal: number; takenEvents: unknown[] }>;
      };
      expect(death.deaths).toHaveLength(1);
      expect(death.deaths[0]?.takenTotal).toBe(2000);
      expect(death.deaths[0]?.takenEvents).toHaveLength(2);

      // Damage the player *took* must never leak into damage-done metrics.
      const damage = result.metrics.damage as { totalDamage: number };
      expect(damage.totalDamage).toBe(0);
    });

    it('raw getPlayerDeaths export returns the player target events', async () => {
      const client = makeMockClient();
      const getPlayerDeaths = client.getPlayerDeaths as ReturnType<typeof vi.fn>;
      getPlayerDeaths.mockResolvedValue([
        {
          timestamp: 80_000,
          type: 'death',
          sourceId: 999,
          targetId: 42,
          fightId: 8,
        },
      ]);
      const service = new AppService(client);
      const events = await service.getPlayerDeaths('ABC123', 8, 42);
      expect(events).toHaveLength(1);
      expect(getPlayerDeaths).toHaveBeenCalledWith({
        reportCode: 'ABC123',
        fightId: 8,
        targetId: 42,
      });
    });
  });

  describe('K2: debuff data source', () => {
    it('loads debuffs from the Debuffs dataType as the single source', async () => {
      const client = makeMockClient();
      (client.getActors as ReturnType<typeof vi.fn>).mockResolvedValue([
        { ...player, specName: 'Elemental' },
      ]);
      (client.getFightFriendlies as ReturnType<typeof vi.fn>).mockResolvedValue(
        [{ actorId: 42, specName: 'Elemental' }],
      );
      // A hostile WCL Buffs response that ALSO contains the debuff event: it
      // must be dropped so the same applydebuff is not counted twice.
      (client.getPlayerBuffs as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          timestamp: 1000,
          type: 'debuff',
          rawType: 'applydebuff',
          sourceId: 42,
          targetId: 2000,
          abilityId: 188389,
          abilityName: 'Flame Shock',
          fightId: 8,
        },
      ]);
      const getEvents = client.getEvents as ReturnType<typeof vi.fn>;
      getEvents.mockImplementation((params: { dataType?: string }) => {
        if (params.dataType === 'Debuffs') {
          return Promise.resolve([
            {
              timestamp: 1000,
              type: 'debuff',
              rawType: 'applydebuff',
              sourceId: 42,
              targetId: 2000,
              abilityId: 188389,
              abilityName: 'Flame Shock',
              fightId: 8,
            },
            {
              timestamp: 21_000,
              type: 'debuff',
              rawType: 'removedebuff',
              sourceId: 42,
              targetId: 2000,
              abilityId: 188389,
              abilityName: 'Flame Shock',
              fightId: 8,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const service = new AppService(client);
      const { result } = await service.analyzePlayer('ABC123', {
        fightId: 8,
        playerId: 42,
      });

      const debuffsCall = getEvents.mock.calls.find(
        (call) =>
          (call[0] as { dataType?: string }).dataType === 'Debuffs',
      );
      expect(debuffsCall?.[0]).toMatchObject({
        reportCode: 'ABC123',
        fightId: 8,
        dataType: 'Debuffs',
        sourceId: 42,
      });

      // 20s of Flame Shock over a 100s fight must be flagged as low uptime.
      // If the Buffs copy of applydebuff had survived, uptime would read ~100%
      // and this finding would be missing — the double-count regression.
      const ids = result.findings.map((f) => f.id);
      expect(ids).toContain('elemental_shaman.flame_shock_uptime');
      expect(
        result.findings.find((f) => f.id === 'elemental_shaman.flame_shock_uptime')
          ?.severity,
      ).toBe('high');
    });
  });

  describe('K3: metrics merge guard', () => {
    it('writes fresh keys into the shared record', () => {
      const target: Record<string, unknown> = {};
      mergeMetrics(target, { a: { x: 1 } }, 'source');
      expect(target.a).toEqual({ x: 1 });
    });

    it('tolerates identical values and never clobbers with undefined', () => {
      const target: Record<string, unknown> = { a: { x: 1 } };
      mergeMetrics(target, { a: { x: 1 }, b: undefined }, 'source');
      expect(target).toEqual({ a: { x: 1 } });
    });

    it('throws on a divergent key collision instead of silently overwriting', () => {
      const target: Record<string, unknown> = { spec: 'Arcane' };
      expect(() => mergeMetrics(target, { spec: { nope: true } }, 'later')).toThrow(
        'metrics key collision',
      );
      // The original value survives the aborted merge.
      expect(target.spec).toBe('Arcane');
    });
  });
});

describe('AppService Phase O death / wipe / add review', () => {
  interface RosterClientOptions {
    /** times (report-absolute ms) and playerIds of death events. */
    deaths?: Array<{ timestamp: number; playerId: number }> | undefined;
    /** damage-taken events keyed by the *victim* playerId (sourceId query). */
    takenByPlayer?: Record<number, unknown[]> | undefined;
    /** heals received keyed by the *recipient* playerId (targetId query). */
    healingByPlayer?: Record<number, unknown[]> | undefined;
    /** first hit against each mob (DamageDone targetId=mob). */
    mobFirstHits?: Record<number, unknown[]> | undefined;
  }

  function rosterClient(options: RosterClientOptions = {}): WclClient {
    const actors: Player[] = [
      { id: 42, name: 'Hero', type: 'Player', specName: 'Beast Mastery' },
      { id: 43, name: 'HealerX', type: 'Player', specName: 'Holy' },
      { id: 44, name: 'TankX', type: 'Player', specName: 'Blood' },
      { id: 5000, name: 'Huge Ogre', type: 'NPC' },
    ];
    const rosterFight: Fight = {
      id: 8,
      name: 'Fight 8',
      startTime: 0,
      endTime: 120_000,
    };
    const client = makeMockClient();
    (client.getFights as ReturnType<typeof vi.fn>).mockResolvedValue([rosterFight]);
    (client.getActors as ReturnType<typeof vi.fn>).mockResolvedValue(actors);
    (client.getFightFriendlies as ReturnType<typeof vi.fn>).mockResolvedValue([
      { actorId: 42, specName: 'Beast Mastery' },
      { actorId: 43, specName: 'Holy' },
      { actorId: 44, specName: 'Blood' },
    ]);
    const getEvents = client.getEvents as ReturnType<typeof vi.fn>;
    getEvents.mockImplementation((params: {
      dataType?: string;
      sourceId?: number;
      targetId?: number;
    }) => {
      if (params.dataType === 'Deaths') {
        return Promise.resolve(
          (options.deaths ?? []).map((d) => ({
            timestamp: d.timestamp,
            type: 'death',
            sourceId: -1,
            targetId: d.playerId,
            fightId: 8,
          })),
        );
      }
      if (params.dataType === 'DamageTaken') {
        return Promise.resolve(options.takenByPlayer?.[params.sourceId ?? -1] ?? []);
      }
      if (params.dataType === 'Healing') {
        return Promise.resolve(options.healingByPlayer?.[params.targetId ?? -1] ?? []);
      }
      if (params.dataType === 'DamageDone') {
        return Promise.resolve(options.mobFirstHits?.[params.targetId ?? -1] ?? []);
      }
      return Promise.resolve([]);
    });
    return client;
  }

  it('reports the full roster and clusters a 3-player wipe', async () => {
    const deaths = [
      { timestamp: 80_000, playerId: 42 },
      { timestamp: 84_000, playerId: 43 },
      { timestamp: 88_000, playerId: 44 },
      { timestamp: 30_000, playerId: 42 },
    ];
    const hit = (at: number, targetId: number, amount: number) => ({
      timestamp: at,
      type: 'damage',
      sourceId: 5000,
      targetId,
      amount,
      fightId: 8,
    });
    const client = rosterClient({
      deaths,
      takenByPlayer: {
        42: [hit(29_500, 42, 900_000), hit(79_500, 42, 400_000)],
        43: [hit(83_500, 43, 500_000)],
        44: [hit(87_500, 44, 400_000)],
      },
      healingByPlayer: {
        42: [
          { timestamp: 29_800, type: 'heal', sourceId: 43, targetId: 42, amount: 100_000, fightId: 8 },
          // Fully-overhealed rows carry amount 0 and must not count.
          { timestamp: 29_900, type: 'heal', sourceId: 43, targetId: 42, amount: 0, fightId: 8 },
          // Outside the death window (death at 30_000, window 8s → start 22_000).
          { timestamp: 10_000, type: 'heal', sourceId: 43, targetId: 42, amount: 5_000, fightId: 8 },
        ],
      },
      mobFirstHits: {
        5000: [{ timestamp: 29_500, type: 'damage', sourceId: 43, targetId: 5000, fightId: 8 }],
      },
    });

    const service = new AppService(client);
    const review = await service.analyzeDeathReview('ABC123', { fightId: 8 });

    expect(review.fightName).toBe('Fight 8');
    expect(review.deaths).toHaveLength(4);
    expect(review.deaths[3]).toMatchObject({
      playerName: 'Hero',
      cause: 'burst-kill',
      takenTotal: 900_000,
      healingReceived: 100_000,
      healCount: 1,
    });
    // The healing fetch must use the verified channel: targetID = recipient.
    const healingGetEvents = client.getEvents as ReturnType<typeof vi.fn>;
    const healingCall = healingGetEvents.mock.calls.find(
      (call) => (call[0] as { dataType?: string }).dataType === 'Healing',
    );
    expect(healingCall?.[0]).toMatchObject({ dataType: 'Healing', targetId: 42 });
    expect(review.deaths[3]?.killer).toMatchObject({
      sourceName: 'Huge Ogre',
      amount: 900_000,
    });

    // Wipe = 3 distinct players dying within 15s.
    expect(review.wipes).toHaveLength(1);
    expect(review.wipes[0]?.deaths).toHaveLength(3);
    expect(review.wipes[0]?.startAtMs).toBe(80_000);
    expect(review.wipes[0]?.firstDeathPlayerName).toBe('Hero');

    // The solo death's killer mob was first touched by a healer 500 ms before
    // the death → medium add candidate, no hard accusation.
    expect(review.adds).toHaveLength(1);
    expect(review.adds[0]).toMatchObject({
      mobName: 'Huge Ogre',
      touchedBy: { playerName: 'HealerX', role: 'healer' },
      recentAdd: true,
      confidence: 'medium',
      relatedDeathPlayerName: 'Hero',
    });
    expect(review.adds[0]?.note).toContain('HealerX');

    // The wipe deaths were long after the mob's first touch → no add there.
    const getEvents = client.getEvents as ReturnType<typeof vi.fn>;
    const deathsCall = getEvents.mock.calls.find(
      (call) => (call[0] as { dataType?: string }).dataType === 'Deaths',
    );
    expect(deathsCall?.[0]).not.toHaveProperty('sourceId');
    expect(deathsCall?.[0]).not.toHaveProperty('targetId');
  });

  it('returns an empty review when nobody died', async () => {
    const client = rosterClient({ deaths: [] });
    const service = new AppService(client);
    const review = await service.analyzeDeathReview('ABC123', { fightId: 8 });
    expect(review.deaths).toHaveLength(0);
    expect(review.wipes).toHaveLength(0);
    expect(review.adds).toHaveLength(0);
  });

  it('distinguishes no-healing from insufficient healing in the summary', async () => {
    const sustainedHits = Array.from({ length: 40 }, (_, i) => ({
      timestamp: 72_000 + i * 200,
      type: 'damage',
      sourceId: 5000,
      targetId: 42,
      amount: 20_000,
      fightId: 8,
    }));

    // Death with zero effective healing in the window.
    const noHealClient = rosterClient({
      deaths: [{ timestamp: 80_000, playerId: 42 }],
      takenByPlayer: { 42: sustainedHits },
    });
    const noHeal = await new AppService(noHealClient).analyzeDeathReview(
      'ABC123',
      { fightId: 8 },
    );
    expect(noHeal.deaths[0]?.cause).toBe('sustained');
    expect(noHeal.deaths[0]?.healingReceived).toBe(0);
    expect(noHeal.deaths[0]?.summary).toContain('窗口内无有效治疗');

    // Death with partial healing → explicit gap.
    const partialHealClient = rosterClient({
      deaths: [{ timestamp: 80_000, playerId: 42 }],
      takenByPlayer: { 42: sustainedHits },
      healingByPlayer: {
        42: [
          { timestamp: 75_000, type: 'heal', sourceId: 43, targetId: 42, amount: 300_000, fightId: 8 },
        ],
      },
    });
    const partial = await new AppService(partialHealClient).analyzeDeathReview(
      'ABC123',
      { fightId: 8 },
    );
    expect(partial.deaths[0]?.healingReceived).toBe(300_000);
    expect(partial.deaths[0]?.summary).toContain('缺口');
  });
});

const order: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function bySeverity(a: string, b: string): number {
  return (order[a] ?? 99) - (order[b] ?? 99);
}

describe('rankings class resolution', () => {
  it('normalizes spaced class labels to the API slug', () => {
    // The site writes "Death Knight"; the rankings API only answers to
    // "DeathKnight" (verified live — the spaced form returns 0 rows).
    expect(rankingsClassName('Death Knight')).toBe('DeathKnight');
    expect(rankingsClassName('Demon Hunter')).toBe('DemonHunter');
    expect(rankingsClassName('Paladin')).toBe('Paladin');
  });

  it('prefers the actor class over the spec-name guess', () => {
    // `Frost` exists in Mage and Death Knight; only the class disambiguates.
    expect(classForPlayer({ className: 'Death Knight', specName: 'Frost' })).toBe(
      'DeathKnight',
    );
    expect(classForPlayer({ className: 'Mage', specName: 'Frost' })).toBe('Mage');
  });

  it('falls back to the spec name when the actor class is missing', () => {
    expect(classForPlayer({ specName: 'Arms' })).toBe('Warrior');
    expect(classForPlayer({ specName: 'Retribution' })).toBe('Paladin');
    // Ambiguous names are deliberately NOT guessed — a wrong baseline is worse
    // than none.
    expect(classForPlayer({ specName: 'Frost' })).toBeUndefined();
    expect(classForPlayer({ specName: 'Restoration' })).toBeUndefined();
    expect(classForPlayer({ specName: 'Demonology' })).toBe('Warlock');
  });
});
