import type {
  Fight,
  Player,
  Report,
  CombatEvent,
  CastEvent,
  BuffEvent,
  DamageEvent,
  DeathEvent,
} from '@wcl/domain';
import type { GraphqlClient } from './graphql.js';
import {
  GET_REPORT_QUERY,
  GET_FIGHTS_QUERY,
  GET_ACTORS_QUERY,
  GET_FIGHT_FRIENDLIES_QUERY,
  GET_ABILITY_NAMES_QUERY,
} from './queries/metadata.js';
import { GET_EVENTS_QUERY } from './queries/events.js';
import { GET_ENCOUNTER_RANKINGS_QUERY } from './queries/rankings.js';
import { normalizeEvents } from '@wcl/combat-normalizer';
import type { EventQuery, EventsPage } from './types/events.js';
import type { WclClientCache } from './types/cache.js';
import { WclReportNotFoundError } from '@wcl/shared';

export interface WclClientOptions {
  graphql: GraphqlClient;
  cache?: WclClientCache | undefined;
}

interface RawReportQuery {
  reportData: {
    report: {
      code: string;
      title?: string;
      owner?: { id: number; name?: string };
      startTime: number;
      endTime: number;
      zone?: { id: number; name: string };
    } | null;
  };
}

interface RawFightsQuery {
  reportData: {
    report: {
      // Intermittently null / missing even for existing reports — every
      // layer is nullable (same lesson as masterData.actors).
      fights: Array<{
        id: number;
        name?: string;
        startTime: number;
        endTime: number;
        difficulty?: number;
        kill?: boolean;
        encounterID?: number;
        gameZone?: { id: number } | null;
        size?: number;
      }> | null;
    } | null;
  };
}

interface RawActorsQuery {
  reportData: {
    report: {
      // WCL intermittently returns masterData with a null actors array (a
      // third transient shape beyond masterData: null) — modelled honestly.
      masterData: {
        actors: Array<{
          id: number;
          name?: string;
          type?: string;
          subType?: string;
          server?: string;
          petOwner?: number;
        }> | null;
      } | null;
    } | null;
  };
}

interface RawAbilityNamesQuery {
  reportData: {
    report: {
      masterData: {
        abilities: Array<{
          gameID: number;
          name?: string;
        }> | null;
      } | null;
    } | null;
  };
}

interface RawFightFriendliesQuery {
  reportData: {
    report: {
      fights?: Array<{
        id: number;
        friendlyPlayers?: number[];
        friendlySpecs?: string[];
      }>;
    } | null;
  };
}

interface RawEventsQuery {
  reportData: {
    report: {
      events: {
        data: Array<Record<string, unknown>>;
        nextPageTimestamp?: number | null;
      } | null;
    } | null;
  };
}

/**
 * High-level WCL API client. Coordinates auth, GraphQL transport, pagination
 * and normalization. Independent of MCP and Analysis Engine.
 */
export class WclClient {
  private readonly graphql: GraphqlClient;
  private readonly cache: WclClientCache | undefined;

  constructor(options: WclClientOptions) {
    this.graphql = options.graphql;
    this.cache = options.cache;
  }

  async getReport(reportCode: string): Promise<Report> {
    if (this.cache) {
      const cached = await this.cache.getReport(reportCode);
      if (cached !== undefined) {
        return cached as Report;
      }
    }

    const data = await this.graphql.request<RawReportQuery>({
      query: GET_REPORT_QUERY,
      variables: { code: reportCode },
    });

    const report = data.reportData.report;
    if (!report) {
      throw new WclReportNotFoundError(
        `Report ${reportCode} not found or the token lacks access.`,
      );
    }

    const result: Report = {
      code: report.code,
      title: report.title,
      owner: report.owner?.name,
      startTime: report.startTime,
      endTime: report.endTime,
      zone: report.zone ?? { id: 0, name: 'Unknown' },
    };

    await this.cache?.setReport(reportCode, result);
    return result;
  }

  async getFights(reportCode: string): Promise<Fight[]> {
    if (this.cache) {
      const cached = await this.cache.getFights(reportCode);
      if (cached !== undefined) {
        return cached as Fight[];
      }
    }

    const result = await this.fetchFightsWithRetry(reportCode);
    await this.cache?.setFights(reportCode, result);
    return result;
  }

  /**
   * WCL intermittently answers the fights query with `fights: null` or an
   * empty array for reports that exist (observed live 2026-09-09: one
   * request returned a list missing the fight, the next returned it). A
   * real report always carries at least one fight, so treat null/empty as
   * transient and retry a bounded number of times.
   */
  private async fetchFightsWithRetry(
    reportCode: string,
    attempts = 3,
  ): Promise<Fight[]> {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const data = await this.graphql.request<RawFightsQuery>({
        query: GET_FIGHTS_QUERY,
        variables: { code: reportCode },
      });

      const report = data.reportData.report;
      if (!report) {
        // A missing report is never transient — do not retry.
        throw new WclReportNotFoundError(
          `Report ${reportCode} not found or the token lacks access.`,
        );
      }

      if (Array.isArray(report.fights) && report.fights.length > 0) {
        return report.fights.map((fight) => ({
          id: fight.id,
          name: fight.name ?? 'Unknown',
          startTime: fight.startTime,
          endTime: fight.endTime,
          boss: fight.encounterID,
          kill: fight.kill,
          difficulty: fight.difficulty,
          zoneId: fight.gameZone?.id,
          size: fight.size,
        }));
      }

      if (attempt < attempts) {
        await sleep(250 * attempt);
      }
    }
    throw new Error(
      `WCL returned no fights for ${reportCode} after ${attempts} attempts ` +
        '(transient API quirk); retry the request shortly.',
    );
  }

  async getActors(reportCode: string): Promise<Player[]> {
    if (this.cache) {
      const cached = await this.cache.getActors(reportCode);
      // A non-array cache entry is treated as a miss and self-heals by
      // refetching (unlike the events path, actors rows are tiny).
      if (Array.isArray(cached)) {
        return cached as Player[];
      }
    }

    const result = await this.fetchActorsWithRetry(reportCode);
    await this.cache?.setActors(reportCode, result);
    return result;
  }

  /**
   * Bulk `abilityGameID → ability name` table for a report.
   *
   * Needed because normalized combat events carry an id but no name (the raw
   * WCL event JSON has no nested ability object), so anything that has to
   * *display* an ability must resolve the id separately. `masterData.abilities`
   * returns the whole table in one request and, on the CN site, the official
   * Chinese names — verified live 2026-09-10. Ids the report never mentions are
   * absent; callers treat a missing id as "unknown ability".
   *
   * Not cached: it is a single small request, and the report-scoped cache
   * interface has no slot for it.
   */
  async getAbilityNames(reportCode: string): Promise<Map<number, string>> {
    const data = await this.graphql.request<RawAbilityNamesQuery>({
      query: GET_ABILITY_NAMES_QUERY,
      variables: { code: reportCode },
    });
    const rows = data.reportData.report?.masterData?.abilities ?? [];
    const names = new Map<number, string>();
    for (const row of rows) {
      // gameID 0 is WCL's "Unknown Ability" placeholder — never a real spell.
      if (row.gameID > 0 && typeof row.name === 'string' && row.name.length > 0) {
        names.set(row.gameID, row.name);
      }
    }
    return names;
  }

  /**
   * WCL intermittently answers the masterData query with `masterData: null`
   * even for reports that exist (observed on live logs; a plain retry
   * returns the real payload). Distinguish that transient quirk from a
   * genuine missing report and retry a bounded number of times.
   */
  private async fetchActorsWithRetry(
    reportCode: string,
    attempts = 3,
  ): Promise<Player[]> {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const data = await this.graphql.request<RawActorsQuery>({
        query: GET_ACTORS_QUERY,
        variables: { code: reportCode },
      });

      const report = data.reportData.report;
      if (!report) {
        // A missing report is never transient — do not retry.
        throw new WclReportNotFoundError(
          `Report ${reportCode} not found or the token lacks access.`,
        );
      }

      const masterData = report.masterData;
      if (masterData !== null && Array.isArray(masterData.actors)) {
        return masterData.actors.map((actor) => ({
          id: actor.id,
          name: actor.name ?? 'Unknown',
          type: (actor.type as Player['type']) ?? 'NPC',
          server: actor.server,
          petOwnerId: actor.petOwner,
          subType: actor.subType,
        }));
      }

      if (attempt < attempts) {
        await sleep(250 * attempt);
      }
    }
    throw new Error(
      `WCL returned empty masterData for ${reportCode} after ${attempts} attempts ` +
        '(transient API quirk); retry the request shortly.',
    );
  }

  /**
   * Fetch a fight's friendly participants as (actorId, specName) pairs.
   * WCL exposes these as index-aligned arrays on the fight. Returns undefined
   * when the fight cannot be found.
   */
  async getFightFriendlies(
    reportCode: string,
    fightId: number,
  ): Promise<Array<{ actorId: number; specName: string }>> {
    const data = await this.graphql.request<RawFightFriendliesQuery>({
      query: GET_FIGHT_FRIENDLIES_QUERY,
      variables: { code: reportCode },
    });

    const fight = data.reportData.report?.fights?.find((f) => f.id === fightId);
    const actorIds = fight?.friendlyPlayers ?? [];
    const specNames = fight?.friendlySpecs ?? [];

    const result: Array<{ actorId: number; specName: string }> = [];
    actorIds.forEach((actorId, index) => {
      const specName = specNames[index];
      if (specName !== undefined) {
        result.push({ actorId, specName });
      }
    });
    return result;
  }

  /**
   * Fetch a single page of raw events for a query.
   */
  async getEventsPage(params: EventQuery): Promise<EventsPage<CombatEvent>> {
    const { startTime, endTime } = await this.resolveEventWindow(params);
    const data = await this.graphql.request<RawEventsQuery>({
      query: GET_EVENTS_QUERY,
      variables: {
        code: params.reportCode,
        startTime,
        endTime,
        sourceID: params.sourceId,
        targetID: params.targetId,
        abilityID: params.abilityId,
        dataType: params.dataType,
        fightIDs: [params.fightId],
        limit: params.limit ?? 1000,
      },
      abortSignal: params.abortSignal,
    });

    const eventsNode = data.reportData.report?.events;
    if (!eventsNode) {
      throw new WclReportNotFoundError(
        `Report ${params.reportCode} not found or the token lacks access.`,
      );
    }

    return {
      events: normalizeEvents(
        eventsNode.data as Array<Record<string, unknown>>,
        params.fightId,
      ),
      nextPageTimestamp: eventsNode.nextPageTimestamp ?? undefined,
    };
  }

  /**
   * Iterate over all events for a query, following pagination via
   * nextPageTimestamp. Respects maxEvents and abort signals.
   */
  async getEvents(params: EventQuery): Promise<CombatEvent[]> {
    const maxEvents = params.limit ?? 100_000;

    if (this.cache) {
      const queryHash = this.cache.eventQueryHash({
        reportCode: params.reportCode,
        fightId: params.fightId,
        dataType: params.dataType,
        sourceId: params.sourceId,
        targetId: params.targetId,
        abilityId: params.abilityId,
        startTime: params.startTime,
        endTime: params.endTime,
      });
      const cached = await this.cache.getEvents(
        params.reportCode,
        params.fightId,
        queryHash,
      );
      if (cached !== undefined) {
        if (!Array.isArray(cached)) {
          throw new Error(
            `Cached events for ${params.reportCode}/${params.fightId} are not an array — cache is corrupted.`,
          );
        }
        const cachedEvents = cached as CombatEvent[];
        return cachedEvents.slice(0, maxEvents);
      }

      const events = await this.fetchAllEvents(params, maxEvents);
      await this.cache.setEvents(
        params.reportCode,
        params.fightId,
        queryHash,
        events,
      );
      return events;
    }

    return this.fetchAllEvents(params, maxEvents);
  }

  private async fetchAllEvents(
    params: EventQuery,
    maxEvents: number,
  ): Promise<CombatEvent[]> {
    const { startTime, endTime } = await this.resolveEventWindow(params);
    const events: CombatEvent[] = [];
    let cursor: number | undefined = startTime;

    for (let guard = 0; guard < 1000; guard += 1) {
      if (params.abortSignal?.aborted) {
        break;
      }
      const page = await this.getEventsPage({
        ...params,
        startTime: cursor,
        endTime,
      });
      events.push(...page.events);

      if (events.length >= maxEvents) {
        break;
      }
      if (page.nextPageTimestamp === undefined) {
        break;
      }
      cursor = page.nextPageTimestamp;
      if (cursor === undefined) {
        break;
      }
    }

    return events.slice(0, maxEvents);
  }

  /**
   * WCL requires explicit start/end timestamps for event queries. When the
   * caller omits them, resolve the fight's own window from the (cached) fight
   * metadata.
   */
  private async resolveEventWindow(
    params: EventQuery,
  ): Promise<{ startTime: number; endTime: number }> {
    if (params.startTime !== undefined && params.endTime !== undefined) {
      return { startTime: params.startTime, endTime: params.endTime };
    }
    const fights = await this.getFights(params.reportCode);
    const fight = fights.find((f) => f.id === params.fightId);
    if (!fight) {
      throw new Error(
        `Fight ${params.fightId} not found in report ${params.reportCode}.`,
      );
    }
    return { startTime: fight.startTime, endTime: fight.endTime };
  }

  async getPlayerCasts(params: EventQuery): Promise<CastEvent[]> {
    const events = await this.getEvents({
      ...params,
      dataType: 'Casts',
      sourceId: params.sourceId,
    });
    return events.filter(isCastEvent);
  }

  async getPlayerBuffs(params: EventQuery): Promise<BuffEvent[]> {
    const events = await this.getEvents({
      ...params,
      dataType: 'Buffs',
      sourceId: params.sourceId,
    });
    return events.filter(isBuffEvent);
  }

  async getPlayerDamage(params: EventQuery): Promise<DamageEvent[]> {
    const events = await this.getEvents({
      ...params,
      dataType: 'DamageDone',
      sourceId: params.sourceId,
    });
    return events.filter(isDamageEvent);
  }

  async getPlayerDeaths(params: EventQuery): Promise<DeathEvent[]> {
    const events = await this.getEvents({
      ...params,
      dataType: 'Deaths',
      sourceId: params.sourceId,
    });
    return events.filter(isDeathEvent);
  }

  /**
   * Fetch the top-ranking parses for an encounter and spec (same-instance
   * leaderboard reference — the baseline the analysis compares a player to).
   *
   * WCL returns 100 rows per page and offers **no row-limit argument**
   * (verified: `limit` is not in the field's argument list, and `count` /
   * `hasMorePages` describe pagination, not the population size). So `limit`
   * here is a deliberate client-side cap: the reference baseline only needs
   * the very top N runs, and keeping 100 skewed the pool label, the percentiles
   * and the payload for no benefit.
   *
   * Returns undefined when the encounter does not exist or the provider
   * returns no data.
   */
  async getEncounterRankings(params: {
    encounterId: number;
    className: string;
    specName: string;
    metric?: string | undefined;
    page?: number | undefined;
    /** Keep at most this many top rows. Omit for the full 100-row page. */
    limit?: number | undefined;
  }): Promise<EncounterRankings | undefined> {
    const data = await this.graphql.request<RawEncounterRankingsQuery>({
      query: GET_ENCOUNTER_RANKINGS_QUERY,
      variables: {
        encounterID: params.encounterId,
        className: params.className,
        specName: params.specName,
        metric: params.metric ?? 'dps',
        page: params.page ?? 1,
      },
    });

    const encounter = data.worldData.encounter;
    if (!encounter) return undefined;

    const parsed = parseRankingsJson(encounter.characterRankings);
    if (!parsed) return undefined;

    // Client-side cap (see the method comment): keep only the top N rows the
    // caller wants to reason about. `count` stays the raw page count so the
    // two are never confused for each other.
    const limit =
      params.limit !== undefined && Number.isFinite(params.limit) && params.limit > 0
        ? Math.floor(params.limit)
        : undefined;
    const rankings =
      limit !== undefined ? parsed.rankings.slice(0, limit) : parsed.rankings;

    return {
      encounterId: params.encounterId,
      encounterName: encounter.name,
      metric: params.metric ?? 'dps',
      className: params.className,
      specName: params.specName,
      page: parsed.page,
      hasMorePages: parsed.hasMorePages,
      count: parsed.count,
      rankings,
    };
  }
}

export interface RankingEntry {
  name: string;
  class: string;
  spec: string;
  /** The ranked metric value (e.g. dps). */
  amount: number;
  duration: number;
  hardModeLevel?: number | undefined;
  startTime: number;
  report?: { code: string; fightID: number; startTime: number } | undefined;
  server?:
    | { id?: number | undefined; name?: string | undefined; region?: string | undefined }
    | undefined;
  affixes?: number[] | undefined;
  medal?: string | undefined;
  score?: number | undefined;
}

export interface EncounterRankings {
  encounterId: number;
  encounterName: string;
  metric: string;
  className: string;
  specName: string;
  page: number;
  hasMorePages: boolean;
  /**
   * Rows WCL returned on this page (100, its fixed page size) — **not** the
   * population size, and not the number of rows `rankings` holds. Use
   * `rankings.length` for "how many rows the caller actually got".
   */
  count: number;
  /** Rows kept, already capped by the caller's `limit`. */
  rankings: RankingEntry[];
}

interface RawEncounterRankingsQuery {
  worldData: {
    encounter: {
      name: string;
      characterRankings: unknown;
    } | null;
  };
}

/** Parse the loosely-typed JSON rankings payload defensively. */
function parseRankingsJson(raw: unknown): {
  page: number;
  hasMorePages: boolean;
  count: number;
  rankings: RankingEntry[];
} | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.rankings)) return undefined;

  const rankings: RankingEntry[] = [];
  for (const item of obj.rankings) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name : '';
    if (!name) continue;
    const amount = typeof r.amount === 'number' ? r.amount : 0;
    const duration = typeof r.duration === 'number' ? r.duration : 0;
    const startTime = typeof r.startTime === 'number' ? r.startTime : 0;
    const server =
      typeof r.server === 'object' && r.server !== null
        ? {
            id: numOrUndef((r.server as Record<string, unknown>).id),
            name: strOrUndef((r.server as Record<string, unknown>).name),
            region: strOrUndef((r.server as Record<string, unknown>).region),
          }
        : undefined;
    const report =
      typeof r.report === 'object' && r.report !== null
        ? {
            code: strOrUndef((r.report as Record<string, unknown>).code) ?? '',
            fightID: numOrUndef((r.report as Record<string, unknown>).fightID) ?? 0,
            startTime: numOrUndef((r.report as Record<string, unknown>).startTime) ?? 0,
          }
        : undefined;

    rankings.push({
      name,
      class: strOrUndef(r.class) ?? '',
      spec: strOrUndef(r.spec) ?? '',
      amount,
      duration,
      hardModeLevel: numOrUndef(r.hardModeLevel),
      startTime,
      report,
      server,
      affixes: Array.isArray(r.affixes) ? r.affixes.map(Number) : undefined,
      medal: strOrUndef(r.medal),
      score: numOrUndef(r.score),
    });
  }

  return {
    page: numOrUndef(obj.page) ?? 1,
    hasMorePages: obj.hasMorePages === true,
    count: numOrUndef(obj.count) ?? rankings.length,
    rankings,
  };
}

function numOrUndef(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function strOrUndef(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Type guards replacing `as` casts in the getPlayer* helpers: the dataType
 * filter on the WCL side is trusted but verified, so a cache or API quirk
 * that returns a foreign event type is filtered out instead of lying to
 * downstream consumers via an unchecked cast.
 */
function isCastEvent(event: CombatEvent): event is CastEvent {
  return event.type === 'cast';
}

function isBuffEvent(event: CombatEvent): event is BuffEvent {
  return event.type === 'buff' || event.type === 'debuff';
}

function isDamageEvent(event: CombatEvent): event is DamageEvent {
  return event.type === 'damage';
}

function isDeathEvent(event: CombatEvent): event is DeathEvent {
  return event.type === 'death';
}
