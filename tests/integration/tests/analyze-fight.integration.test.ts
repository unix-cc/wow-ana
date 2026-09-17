import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { AppService } from '@wcl/application';
import { WclCache, MemoryCache } from '@wcl/storage';
import type { WclClient } from '@wcl/wcl-client';
import type { Fight, Player, Report, CombatEvent } from '@wcl/domain';

interface FixtureBundle {
  meta: {
    id: string;
    specName: string;
    specId: number;
    knowledgeVersion: string;
    durationMs: number;
  };
  report: Report;
  fight: Fight;
  player: Player;
  events: CombatEvent[];
}

function loadFixture(file: string): FixtureBundle {
  const raw = readFileSync(new URL(file, import.meta.url), 'utf8');
  const parsed = JSON.parse(raw) as FixtureBundle;
  // The rankings reference needs an encounter id on the fight.
  parsed.fight = { ...parsed.fight, boss: 1000 };
  return parsed;
}

const BM_FIXTURE = loadFixture('../../fixtures/combat/hunter-bm-basic.json');
const ARCANE_FIXTURE = loadFixture('../../fixtures/combat/mage-arcane-basic.json');

const BM_EXPECTED = [
  'bm_hunter.kill_command_usage',
  'bm_hunter.gcd_idle',
  'bm_hunter.barbed_shot_uptime',
];

interface CachedClient {
  client: WclClient;
  rankingsCalls: () => number;
}

/**
 * A WclClient backed by a golden fixture: report/fight/player constants come
 * from the JSON and the seven event feeds are filtered subsets of its events.
 * getEncounterRankings is a counted mock so cache hits are observable.
 */
function makeClient(fixture: FixtureBundle): CachedClient {
  const casts = fixture.events.filter((event) => event.type === 'cast');
  const buffs = fixture.events.filter((event) => event.type === 'buff');
  const rankings = vi.fn().mockResolvedValue({
    encounterId: 1000,
    className: fixture.meta.specName === 'Arcane' ? 'Mage' : 'Hunter',
    specName: fixture.meta.specName,
    rankings: [
      { name: 'TopLog', amount: 900_000 },
      { name: 'Second', amount: 700_000 },
    ],
  });

  const client = {
    getReport: vi.fn().mockResolvedValue(fixture.report),
    getFights: vi.fn().mockResolvedValue([fixture.fight]),
    getActors: vi.fn().mockResolvedValue([fixture.player]),
    getFightFriendlies: vi.fn().mockResolvedValue([
      { actorId: fixture.player.id, specName: fixture.meta.specName },
    ]),
    getPlayerCasts: vi.fn().mockResolvedValue(casts),
    getPlayerBuffs: vi.fn().mockResolvedValue(buffs),
    getPlayerDamage: vi.fn().mockResolvedValue([]),
    getPlayerDeaths: vi.fn().mockResolvedValue([]),
    getEvents: vi.fn().mockResolvedValue([]),
    getEncounterRankings: rankings,
  } as unknown as WclClient;

  return { client, rankingsCalls: () => rankings.mock.calls.length };
}

describe('analyze-fight end-to-end (AppService + engine + knowledge + cache)', () => {
  it('BM fixture produces its intended findings and knowledge version', async () => {
    const { client } = makeClient(BM_FIXTURE);
    const service = new AppService(client);
    const outcome = await service.analyzeFight(BM_FIXTURE.report.code, {
      fightId: BM_FIXTURE.fight.id,
      playerId: BM_FIXTURE.player.id,
    });

    expect(outcome.summary?.spec).toBe('Beast Mastery');
    expect(outcome.result.score?.overall).toBeTypeOf('number');
    expect(outcome.result.versions?.knowledgeVersion).toBe('1.1.0');
    const ids = outcome.result.findings.map((finding) => finding.id);
    expect(ids).toEqual(expect.arrayContaining(BM_EXPECTED));

    // 60s BM fight with an AFK tail must not produce a rotation digest unless
    // the knowledge replay sees a decision; assert presence is irrelevant —
    // but the score and severity-ranked findings must be deterministic.
    const first = outcome.result.findings[0];
    expect(first?.severity).toBe('high');
  });

  it('BM result is served from the analysis cache on a repeated call', async () => {
    const { client, rankingsCalls } = makeClient(BM_FIXTURE);
    const service = new AppService(client, new WclCache(new MemoryCache()));

    const first = await service.analyzeFight(BM_FIXTURE.report.code, {
      fightId: BM_FIXTURE.fight.id,
      playerId: BM_FIXTURE.player.id,
    });
    expect(rankingsCalls()).toBe(1);

    const second = await service.analyzeFight(BM_FIXTURE.report.code, {
      fightId: BM_FIXTURE.fight.id,
      playerId: BM_FIXTURE.player.id,
    });
    expect(rankingsCalls()).toBe(1); // cache hit → no reference re-fetch
    expect(second.result).toEqual(first.result);
    expect(second.result.versions).toEqual(first.result.versions);
  });

  it('Arcane fixture drives the rotation verdict stream end to end', async () => {
    const { client } = makeClient(ARCANE_FIXTURE);
    const service = new AppService(client);
    const outcome = await service.analyzeFight(ARCANE_FIXTURE.report.code, {
      fightId: ARCANE_FIXTURE.fight.id,
      playerId: ARCANE_FIXTURE.player.id,
    });

    expect(outcome.result.versions?.knowledgeVersion).toBe('1.5.0');
    expect(outcome.rotation).toBeDefined();
    expect(outcome.rotation?.scenario).toBe('st');
    expect(outcome.rotation?.knowledge.knowledgeVersion).toBe('1.5.0');

    // The salvo-12 missiles misuse must surface as a rotation mistake merged
    // into the final findings (Phase E/F verdict stream through AppService).
    // Expected action is the blast filler: the orb rule depends on Arcane
    // Charges, whose buff id is unverified → unobservable → explain-only.
    const rotationMistake = outcome.result.findings.find((finding) => {
      const expected = finding.expected as { ruleId?: string } | undefined;
      return finding.verdict === 'mistake' && expected?.ruleId === 'arcane.blast_builder';
    });
    expect(rotationMistake).toBeDefined();
    expect(rotationMistake?.actual).toMatchObject({ ability: 'arcane_missiles' });
  });
});
