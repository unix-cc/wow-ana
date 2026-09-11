import { stableHash } from '@wcl/shared';
import type { CacheStore } from '../cache.js';

/**
 * The analysis cache structure version. Bump this only when the *shape* of
 * the cached payload or the key format changes; content-driven invalidation
 * (analyzer rules / spec knowledge updates) is handled by the dual version
 * arguments of {@link WclCache.getAnalysis} / {@link WclCache.setAnalysis}.
 */
export const ANALYSIS_VERSION = 1;

/**
 * Dual version identity of an analysis run (Phase I). Both parts participate
 * in the cache key, so a rule-set upgrade or a Spec Knowledge bump naturally
 * misses the cache and re-analyzes — no manual invalidation needed.
 */
export interface AnalysisCacheVersions {
  /** Version of the deterministic analyzer / rule set. */
  analyzerVersion: string;
  /** Version of the Spec Knowledge used; absent when the spec had none. */
  knowledgeVersion?: string | undefined;
}

function jsonParse<T>(value: string | undefined): T | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function analysisKey(
  reportCode: string,
  fightId: number,
  playerId: number,
  versions: AnalysisCacheVersions,
): string {
  const analyzer = encodeURIComponent(versions.analyzerVersion);
  const knowledge = encodeURIComponent(versions.knowledgeVersion ?? 'none');
  return `analysis:v${ANALYSIS_VERSION}:${analyzer}:${knowledge}:${reportCode}:${fightId}:${playerId}`;
}

/**
 * Typed, versioned cache for WCL domain objects. Encapsulates cache-key
 * construction so the rest of the system does not worry about formatting.
 */
export class WclCache {
  private readonly store: CacheStore;

  constructor(store: CacheStore) {
    this.store = store;
  }

  async getReport(reportCode: string): Promise<unknown | undefined> {
    return jsonParse(await this.store.get(`report:${reportCode}`));
  }

  async setReport(reportCode: string, report: unknown): Promise<void> {
    await this.store.set(`report:${reportCode}`, JSON.stringify(report));
  }

  async getFights(reportCode: string): Promise<unknown | undefined> {
    return jsonParse(await this.store.get(`fight:${reportCode}`));
  }

  async setFights(reportCode: string, fights: unknown): Promise<void> {
    await this.store.set(`fight:${reportCode}`, JSON.stringify(fights));
  }

  async getActors(reportCode: string): Promise<unknown | undefined> {
    return jsonParse(await this.store.get(`actors:${reportCode}`));
  }

  async setActors(reportCode: string, actors: unknown): Promise<void> {
    await this.store.set(`actors:${reportCode}`, JSON.stringify(actors));
  }

  async getEvents(
    reportCode: string,
    fightId: number,
    queryHash: string,
  ): Promise<unknown | undefined> {
    return jsonParse(
      await this.store.get(`events:${reportCode}:${fightId}:${queryHash}`),
    );
  }

  async setEvents(
    reportCode: string,
    fightId: number,
    queryHash: string,
    events: unknown,
  ): Promise<void> {
    await this.store.set(
      `events:${reportCode}:${fightId}:${queryHash}`,
      JSON.stringify(events),
    );
  }

  async getAnalysis(
    reportCode: string,
    fightId: number,
    playerId: number,
    versions: AnalysisCacheVersions,
  ): Promise<unknown | undefined> {
    return jsonParse(
      await this.store.get(analysisKey(reportCode, fightId, playerId, versions)),
    );
  }

  async setAnalysis(
    reportCode: string,
    fightId: number,
    playerId: number,
    versions: AnalysisCacheVersions,
    result: unknown,
  ): Promise<void> {
    await this.store.set(
      analysisKey(reportCode, fightId, playerId, versions),
      JSON.stringify(result),
    );
  }

  static eventQueryHash(params: {
    reportCode: string;
    fightId: number;
    dataType?: string | undefined;
    sourceId?: number | undefined;
    targetId?: number | undefined;
    abilityId?: number | undefined;
    startTime?: number | undefined;
    endTime?: number | undefined;
  }): string {
    const raw = JSON.stringify([
      params.dataType,
      params.sourceId,
      params.targetId,
      params.abilityId,
      params.startTime,
      params.endTime,
    ]);
    return stableHash(raw);
  }

  /** Instance form of {@link eventQueryHash}, satisfying WclClientCache. */
  eventQueryHash(params: {
    reportCode: string;
    fightId: number;
    dataType?: string | undefined;
    sourceId?: number | undefined;
    targetId?: number | undefined;
    abilityId?: number | undefined;
    startTime?: number | undefined;
    endTime?: number | undefined;
  }): string {
    return WclCache.eventQueryHash(params);
  }
}
