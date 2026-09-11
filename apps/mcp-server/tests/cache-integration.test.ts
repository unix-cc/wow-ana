import { describe, it, expect, vi } from 'vitest';
import {
  WclClient,
  GraphqlClient,
  AuthManager,
  RateLimitManager,
} from '@wcl/wcl-client';
import { createDatabase, SqliteCache, WclCache } from '@wcl/storage';

/**
 * Composition-root integration test: a real SQLite-backed WclCache wired into
 * WclClient must make the second identical request hit the cache and skip WCL.
 * Network is mocked; the cache + client + auth are the real implementations.
 */
describe('WCL cache integration', () => {
  it('serves a repeated report lookup from SQLite without a second GraphQL call', async () => {
    const fetchImpl = vi.fn();
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    const auth = new AuthManager({
      clientId: 'id',
      clientSecret: 'secret',
      tokenUrl: 'https://example.com/token',
    });
    const graphql = new GraphqlClient({
      tokenProvider: auth,
      rateLimiter: new RateLimitManager(),
      apiUrl: 'https://example.com/api',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const db = createDatabase(':memory:');
    const cache = new WclCache(new SqliteCache(db.sqlite));
    const client = new WclClient({ graphql, cache });

    fetchImpl.mockResolvedValueOnce(
      okJson({ access_token: 't', expires_in: 3600 }),
    );
    fetchImpl.mockResolvedValue(
      okJson({
        data: {
          reportData: {
            report: {
              code: 'ABC123',
              title: 'Raid',
              startTime: 1,
              endTime: 2,
              zone: { id: 1000, name: 'Nerub-ar Palace' },
            },
          },
        },
      }),
    );

    try {
      const first = await client.getReport('ABC123');
      const second = await client.getReport('ABC123');

      expect(first.code).toBe('ABC123');
      expect(second.code).toBe('ABC123');
      // 1 token request + 1 GraphQL request; second report lookup is cached
      expect(fetchImpl).toHaveBeenCalledTimes(2);

      // The cached copy is persisted and re-readable from a fresh client
      // backed by the same SQLite file (survives the instance).
      const fresh = new WclCache(new SqliteCache(db.sqlite));
      const cached = await fresh.getReport('ABC123');
      expect(cached).toEqual({
        code: 'ABC123',
        title: 'Raid',
        startTime: 1,
        endTime: 2,
        zone: { id: 1000, name: 'Nerub-ar Palace' },
      });
    } finally {
      db.close();
    }
  });
});

function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    headers: new Headers(),
  } as unknown as Response;
}
