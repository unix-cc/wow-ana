/**
 * Typed cache used by WclClient for cache-aside behaviour.
 * Implemented by @wcl/storage's WclCache; wcl-client depends only on this
 * interface so the transport layer stays decoupled from storage internals.
 */
export interface WclClientCache {
  getReport(reportCode: string): Promise<unknown | undefined>;
  setReport(reportCode: string, report: unknown): Promise<void>;
  getFights(reportCode: string): Promise<unknown | undefined>;
  setFights(reportCode: string, fights: unknown): Promise<void>;
  getActors(reportCode: string): Promise<unknown | undefined>;
  setActors(reportCode: string, actors: unknown): Promise<void>;
  getEvents(
    reportCode: string,
    fightId: number,
    queryHash: string,
  ): Promise<unknown | undefined>;
  setEvents(
    reportCode: string,
    fightId: number,
    queryHash: string,
    events: unknown,
  ): Promise<void>;
  eventQueryHash(params: {
    reportCode: string;
    fightId: number;
    dataType?: string | undefined;
    sourceId?: number | undefined;
    targetId?: number | undefined;
    abilityId?: number | undefined;
    startTime?: number | undefined;
    endTime?: number | undefined;
  }): string;
}
