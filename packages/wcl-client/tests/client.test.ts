import { describe, it, expect, vi } from 'vitest';
import { GraphqlClient } from '../src/graphql.js';
import { WclClient } from '../src/client.js';
import { AuthManager } from '../src/auth.js';
import { RateLimitManager } from '../src/rate-limit.js';
import type { WclClientCache } from '../src/types/cache.js';

class MemoryWclCache implements WclClientCache {
  private readonly store = new Map<string, string>();

  private async rw(key: string, value?: unknown): Promise<unknown | undefined> {
    if (value === undefined) {
      const raw = this.store.get(key);
      return raw === undefined ? undefined : JSON.parse(raw);
    }
    this.store.set(key, JSON.stringify(value));
    return undefined;
  }

  getReport(code: string) {
    return this.rw(`report:${code}`);
  }
  setReport(code: string, v: unknown) {
    return this.rw(`report:${code}`, v);
  }
  getFights(code: string) {
    return this.rw(`fight:${code}`);
  }
  setFights(code: string, v: unknown) {
    return this.rw(`fight:${code}`, v);
  }
  getActors(code: string) {
    return this.rw(`actors:${code}`);
  }
  setActors(code: string, v: unknown) {
    return this.rw(`actors:${code}`, v);
  }
  getEvents(code: string, fightId: number, hash: string) {
    return this.rw(`events:${code}:${fightId}:${hash}`);
  }
  setEvents(code: string, fightId: number, hash: string, v: unknown) {
    return this.rw(`events:${code}:${fightId}:${hash}`, v);
  }
  eventQueryHash(params: {
    reportCode: string;
    fightId: number;
    dataType?: string | undefined;
    sourceId?: number | undefined;
    targetId?: number | undefined;
    abilityId?: number | undefined;
  }): string {
    return JSON.stringify([
      params.dataType,
      params.sourceId,
      params.targetId,
      params.abilityId,
    ]);
  }
}

function makeHarness(cache?: WclClientCache) {
  const fetchImpl = vi.fn();
  globalThis.fetch = fetchImpl as unknown as typeof fetch;

  const auth = new AuthManager({
    clientId: 'id',
    clientSecret: 'secret',
    tokenUrl: 'https://example.com/token',
  });

  const limiter = new RateLimitManager();
  const graphql = new GraphqlClient({
    tokenProvider: auth,
    rateLimiter: limiter,
    apiUrl: 'https://example.com/api',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  const client = new WclClient({ graphql, cache });
  return { fetchImpl, client };
}

function makeHarnessWithCache() {
  return makeHarness(new MemoryWclCache());
}

function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    headers: new Headers(),
  } as unknown as Response;
}

describe('WclClient', () => {
  it('gets report metadata', async () => {
    const { fetchImpl, client } = makeHarness();
    fetchImpl.mockResolvedValueOnce(
      okJson({ access_token: 't', expires_in: 3600 }),
    );
    fetchImpl.mockResolvedValueOnce(
      okJson({
        data: {
          reportData: {
            report: {
              code: 'ABC123',
              title: 'Raid Night',
              owner: { id: 1, name: 'Someone' },
              startTime: 100,
              endTime: 200,
              zone: { id: 1000, name: 'Nerub-ar Palace' },
            },
          },
        },
      }),
    );

    const report = await client.getReport('ABC123');
    expect(report.code).toBe('ABC123');
    expect(report.title).toBe('Raid Night');
    expect(report.owner).toBe('Someone');
    expect(report.zone.name).toBe('Nerub-ar Palace');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws a safe error when report is missing', async () => {
    const { fetchImpl, client } = makeHarness();
    fetchImpl.mockResolvedValueOnce(
      okJson({ access_token: 't', expires_in: 3600 }),
    );
    fetchImpl.mockResolvedValueOnce(
      okJson({ data: { reportData: { report: null } } }),
    );
    await expect(client.getReport('MISSING')).rejects.toThrow(
      /not found or the token lacks access/,
    );
  });

  it('paginates events via nextPageTimestamp', async () => {
    const { fetchImpl, client } = makeHarness();
    fetchImpl.mockResolvedValueOnce(
      okJson({ access_token: 't', expires_in: 3600 }),
    );
    fetchImpl.mockResolvedValueOnce(
      okJson({
        data: {
          reportData: {
            report: {
              events: {
                data: [{ timestamp: 1, type: 'cast' }],
                nextPageTimestamp: 500,
              },
            },
          },
        },
      }),
    );
    fetchImpl.mockResolvedValueOnce(
      okJson({
        data: {
          reportData: {
            report: {
              events: {
                data: [{ timestamp: 501, type: 'cast' }],
                nextPageTimestamp: undefined,
              },
            },
          },
        },
      }),
    );

    const events = await client.getEvents({
      reportCode: 'ABC123',
      fightId: 8,
      startTime: 0,
      endTime: 1000,
    });

    expect(events).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('limits events to maxEvents', async () => {
    const { fetchImpl, client } = makeHarness();
    fetchImpl.mockResolvedValueOnce(
      okJson({ access_token: 't', expires_in: 3600 }),
    );
    // single page returns more than limit; the slice should cap it
    fetchImpl.mockResolvedValueOnce(
      okJson({
        data: {
          reportData: {
            report: {
              events: {
                data: [
                  { timestamp: 1, type: 'cast' },
                  { timestamp: 2, type: 'cast' },
                  { timestamp: 3, type: 'cast' },
                ],
                nextPageTimestamp: undefined,
              },
            },
          },
        },
      }),
    );

    const events = await client.getEvents({
      reportCode: 'ABC123',
      fightId: 8,
      startTime: 0,
      endTime: 1000,
      limit: 2,
    });

    expect(events).toHaveLength(2);
  });

  it('retries getActors when WCL answers with a null masterData', async () => {
    const { fetchImpl, client } = makeHarness();
    fetchImpl.mockResolvedValueOnce(
      okJson({ access_token: 't', expires_in: 3600 }),
    );
    // First answer: the transient quirk (report exists, masterData null).
    fetchImpl.mockResolvedValueOnce(
      okJson({ data: { reportData: { report: { masterData: null } } } }),
    );
    // Retry returns the real payload.
    fetchImpl.mockResolvedValueOnce(
      okJson({
        data: {
          reportData: {
            report: {
              masterData: {
                actors: [{ id: 7, name: 'Hero', type: 'Player' }],
              },
            },
          },
        },
      }),
    );

    const actors = await client.getActors('ABC123');
    expect(actors).toHaveLength(1);
    expect(actors[0]).toMatchObject({ id: 7, name: 'Hero', type: 'Player' });
  });

  it('gives up on getActors after bounded retries with a clear error', async () => {
    const { fetchImpl, client } = makeHarness();
    fetchImpl.mockResolvedValueOnce(
      okJson({ access_token: 't', expires_in: 3600 }),
    );
    fetchImpl.mockResolvedValue(
      okJson({ data: { reportData: { report: { masterData: null } } } }),
    );

    await expect(client.getActors('ABC123')).rejects.toThrow(
      /empty masterData for ABC123 after 3 attempts/,
    );
  });

  it('retries getFights when WCL answers with a null or empty fights list', async () => {
    const { fetchImpl, client } = makeHarness();
    fetchImpl.mockResolvedValueOnce(
      okJson({ access_token: 't', expires_in: 3600 }),
    );
    // First answer: the transient quirk (report exists, fights null).
    fetchImpl.mockResolvedValueOnce(
      okJson({ data: { reportData: { report: { fights: null } } } }),
    );
    // Second answer: still transient (empty array).
    fetchImpl.mockResolvedValueOnce(
      okJson({ data: { reportData: { report: { fights: [] } } } }),
    );
    // Retry returns the real payload.
    fetchImpl.mockResolvedValueOnce(
      okJson({
        data: {
          reportData: {
            report: {
              fights: [
                {
                  id: 1,
                  startTime: 181,
                  endTime: 134_717,
                  name: '密谋小径',
                },
              ],
            },
          },
        },
      }),
    );

    const fights = await client.getFights('ABC123');
    expect(fights).toHaveLength(1);
    expect(fights[0]).toMatchObject({ id: 1, name: '密谋小径' });
  });

  it('gives up on getFights after bounded retries with a clear error', async () => {
    const { fetchImpl, client } = makeHarness();
    fetchImpl.mockResolvedValueOnce(
      okJson({ access_token: 't', expires_in: 3600 }),
    );
    fetchImpl.mockResolvedValue(
      okJson({ data: { reportData: { report: { fights: null } } } }),
    );

    await expect(client.getFights('ABC123')).rejects.toThrow(
      /no fights for ABC123 after 3 attempts/,
    );
  });

  it('retries the third transient shape: masterData present but actors null', async () => {
    const { fetchImpl, client } = makeHarness();
    fetchImpl.mockResolvedValueOnce(
      okJson({ access_token: 't', expires_in: 3600 }),
    );
    // Real-world shape seen on live runs (2026-09-09): masterData is a
    // non-null object whose actors array is null.
    fetchImpl.mockResolvedValueOnce(
      okJson({
        data: { reportData: { report: { masterData: { actors: null } } } },
      }),
    );
    fetchImpl.mockResolvedValueOnce(
      okJson({
        data: {
          reportData: {
            report: {
              masterData: {
                actors: [{ id: 9, name: 'Hero2', type: 'Player' }],
              },
            },
          },
        },
      }),
    );

    const actors = await client.getActors('ABC123');
    expect(actors).toHaveLength(1);
    expect(actors[0]).toMatchObject({ id: 9, name: 'Hero2' });
  });

  it('does not retry getActors for a genuinely missing report', async () => {
    const { fetchImpl, client } = makeHarness();
    fetchImpl.mockResolvedValueOnce(
      okJson({ access_token: 't', expires_in: 3600 }),
    );
    fetchImpl.mockResolvedValueOnce(
      okJson({ data: { reportData: { report: null } } }),
    );

    await expect(client.getActors('MISSING')).rejects.toThrow(
      /not found or the token lacks access/,
    );
    // Token call + exactly one API call — no retries burned on a 404.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('serves a second getReport from cache without calling WCL', async () => {
    const { fetchImpl, client } = makeHarnessWithCache();
    fetchImpl.mockResolvedValueOnce(
      okJson({ access_token: 't', expires_in: 3600 }),
    );
    fetchImpl.mockResolvedValue(
      okJson({
        data: {
          reportData: {
            report: {
              code: 'ABC123',
              title: 'R',
              startTime: 1,
              endTime: 2,
              zone: { id: 1, name: 'z' },
            },
          },
        },
      }),
    );

    const first = await client.getReport('ABC123');
    const second = await client.getReport('ABC123');

    expect(first.code).toBe('ABC123');
    expect(second.code).toBe('ABC123');
    // token fetch + one GraphQL call, second read is served from cache
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('serves a second getEvents from cache without calling WCL', async () => {
    const { fetchImpl, client } = makeHarnessWithCache();
    fetchImpl.mockResolvedValueOnce(
      okJson({ access_token: 't', expires_in: 3600 }),
    );
    fetchImpl.mockResolvedValue(
      okJson({
        data: {
          reportData: {
            report: {
              events: {
                data: [{ timestamp: 1, type: 'cast' }],
                nextPageTimestamp: undefined,
              },
            },
          },
        },
      }),
    );

    const params = {
      reportCode: 'ABC123',
      fightId: 8,
      startTime: 0,
      endTime: 1000,
    };
    const first = await client.getEvents(params);
    const second = await client.getEvents(params);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    // token fetch + one GraphQL events call; second served from cache
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('getEncounterRankings pool cap', () => {
  /** WCL always answers with a full 100-row page; `limit` is ours. */
  function rankingsResponse(rows: number): Response {
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        data: {
          worldData: {
            encounter: {
              name: "King's Rest",
              characterRankings: {
                page: 1,
                hasMorePages: true,
                count: 100,
                rankings: Array.from({ length: rows }, (_, i) => ({
                  name: 'Runner' + (i + 1),
                  class: 'Shaman',
                  spec: 'Elemental',
                  amount: 300_000 - i * 1000,
                  duration: 1_800_000,
                  hardModeLevel: 21,
                  startTime: 1_700_000_000_000,
                  report: { code: 'r' + (i + 1), fightID: 1, startTime: 1 },
                  server: { id: 1, name: 'S', region: '国服' },
                })),
              },
            },
          },
        },
      }),
    } as unknown as Response;
  }

  it('keeps only the requested top rows, and `count` as the raw page count', async () => {
    const { fetchImpl, client } = makeHarness();
    fetchImpl.mockResolvedValueOnce(okJson({ access_token: 't', expires_in: 3600 }));
    fetchImpl.mockResolvedValueOnce(rankingsResponse(100));

    const result = await client.getEncounterRankings({
      encounterId: 61762,
      className: 'Shaman',
      specName: 'Elemental',
      limit: 10,
    });

    expect(result?.rankings).toHaveLength(10);
    expect(result?.rankings[0]?.name).toBe('Runner1');
    expect(result?.rankings[9]?.name).toBe('Runner10');
    // `count` describes the page WCL sent, not the pool we kept — keeping the
    // two distinct is what stops "前 100 名" leaking into the label.
    expect(result?.count).toBe(100);
  });

  it('returns the full page when no limit is given', async () => {
    const { fetchImpl, client } = makeHarness();
    fetchImpl.mockResolvedValueOnce(okJson({ access_token: 't', expires_in: 3600 }));
    fetchImpl.mockResolvedValueOnce(rankingsResponse(100));

    const result = await client.getEncounterRankings({
      encounterId: 61762,
      className: 'Shaman',
      specName: 'Elemental',
    });

    expect(result?.rankings).toHaveLength(100);
  });

  it('ignores a nonsense limit rather than slicing to nothing', async () => {
    const { fetchImpl, client } = makeHarness();
    fetchImpl.mockResolvedValueOnce(okJson({ access_token: 't', expires_in: 3600 }));
    fetchImpl.mockResolvedValueOnce(rankingsResponse(20));

    const result = await client.getEncounterRankings({
      encounterId: 61762,
      className: 'Shaman',
      specName: 'Elemental',
      limit: 0,
    });

    expect(result?.rankings).toHaveLength(20);
  });
});

describe('getAbilityNames', () => {
  it('maps gameID to name, in the site locale', async () => {
    const { fetchImpl, client } = makeHarness();
    fetchImpl.mockResolvedValueOnce(okJson({ access_token: 't', expires_in: 3600 }));
    fetchImpl.mockResolvedValueOnce(
      okJson({
        data: {
          reportData: {
            report: {
              masterData: {
                abilities: [
                  { gameID: 0, name: 'Unknown Ability' },
                  { gameID: 5143, name: '奥术飞弹' },
                  { gameID: 44425, name: '奥术弹幕' },
                ],
              },
            },
          },
        },
      }),
    );

    const names = await client.getAbilityNames('ABC123');
    // gameID 0 is WCL's placeholder, never a real spell.
    expect(names.has(0)).toBe(false);
    expect(names.get(5143)).toBe('奥术飞弹');
    expect(names.get(44425)).toBe('奥术弹幕');
    expect(names.size).toBe(2);
  });

  it('skips blank names and tolerates a null masterData', async () => {
    const { fetchImpl, client } = makeHarness();
    fetchImpl.mockResolvedValueOnce(okJson({ access_token: 't', expires_in: 3600 }));
    fetchImpl.mockResolvedValueOnce(
      okJson({
        data: {
          reportData: {
            report: {
              masterData: { abilities: [{ gameID: 7 }, { gameID: 8, name: '' }] },
            },
          },
        },
      }),
    );
    expect((await client.getAbilityNames('ABC123')).size).toBe(0);

    // The auth token is cached after the first call — only the payload is queued.
    fetchImpl.mockResolvedValueOnce(
      okJson({ data: { reportData: { report: { masterData: null } } } }),
    );
    expect((await client.getAbilityNames('ABC123')).size).toBe(0);
  });
});
