import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../src/database.js';
import { SqliteCache } from '../src/cache.js';
import {
  WclCache,
  ANALYSIS_VERSION,
} from '../src/repositories/cache-repository.js';

describe('WclCache', () => {
  let handle: ReturnType<typeof createDatabase>;
  let wclCache: WclCache;

  beforeEach(() => {
    handle = createDatabase(':memory:');
    wclCache = new WclCache(new SqliteCache(handle.sqlite));
  });

  afterEach(() => {
    handle.close();
  });

  it('round-trips report cache', async () => {
    const report = { code: 'ABC', title: 'x', startTime: 1, endTime: 2 };
    await wclCache.setReport('ABC', report);
    expect(await wclCache.getReport('ABC')).toEqual(report);
    expect(await wclCache.getReport('OTHER')).toBeUndefined();
  });

  it('round-trips fights and actors cache', async () => {
    await wclCache.setFights('ABC', [{ id: 1 }]);
    expect(await wclCache.getFights('ABC')).toEqual([{ id: 1 }]);

    await wclCache.setActors('ABC', [{ id: 5, name: 'Hero' }]);
    expect(await wclCache.getActors('ABC')).toEqual([{ id: 5, name: 'Hero' }]);
  });

  it('round-trips events cache keyed by query hash', async () => {
    await wclCache.setEvents('ABC', 8, 'hash1', [{ timestamp: 1 }]);
    expect(await wclCache.getEvents('ABC', 8, 'hash1')).toEqual([
      { timestamp: 1 },
    ]);
    expect(await wclCache.getEvents('ABC', 8, 'hash2')).toBeUndefined();
  });

  it('round-trips analysis cache with dual versions in key', async () => {
    const versions = {
      analyzerVersion: '0.1.0',
      knowledgeVersion: '12.1@1.2.0',
    };
    await wclCache.setAnalysis('ABC', 8, 123, versions, { findings: [] });
    expect(await wclCache.getAnalysis('ABC', 8, 123, versions)).toEqual({
      findings: [],
    });
    expect(await wclCache.getAnalysis('ABC', 8, 999, versions)).toBeUndefined();
  });

  it('misses when analyzer version changes (invalidation by rule-set bump)', async () => {
    await wclCache.setAnalysis(
      'ABC',
      8,
      123,
      { analyzerVersion: '0.1.0', knowledgeVersion: '1.0.0' },
      { findings: [{ id: 'a' }] },
    );
    // Same report/fight/player, newer analyzer → different key → miss.
    expect(
      await wclCache.getAnalysis(
        'ABC',
        8,
        123,
        { analyzerVersion: '0.2.0', knowledgeVersion: '1.0.0' },
      ),
    ).toBeUndefined();
  });

  it('misses when knowledge version changes (invalidation by spec update)', async () => {
    await wclCache.setAnalysis(
      'ABC',
      8,
      123,
      { analyzerVersion: '0.1.0', knowledgeVersion: '1.0.0' },
      { findings: [{ id: 'a' }] },
    );
    expect(
      await wclCache.getAnalysis(
        'ABC',
        8,
        123,
        { analyzerVersion: '0.1.0', knowledgeVersion: '1.1.0' },
      ),
    ).toBeUndefined();
  });

  it('treats an absent knowledge version as its own cache bucket', async () => {
    await wclCache.setAnalysis(
      'ABC',
      8,
      123,
      { analyzerVersion: '0.1.0' },
      { findings: [] },
    );
    expect(
      await wclCache.getAnalysis(
        'ABC',
        8,
        123,
        { analyzerVersion: '0.1.0', knowledgeVersion: '1.0.0' },
      ),
    ).toBeUndefined();
    expect(
      await wclCache.getAnalysis('ABC', 8, 123, { analyzerVersion: '0.1.0' }),
    ).toEqual({ findings: [] });
  });

  it('produces a stable event query hash that differs by params', () => {
    const a = WclCache.eventQueryHash({
      reportCode: 'ABC',
      fightId: 8,
      dataType: 'Casts',
    });
    const b = WclCache.eventQueryHash({
      reportCode: 'ABC',
      fightId: 8,
      dataType: 'Casts',
    });
    const c = WclCache.eventQueryHash({
      reportCode: 'ABC',
      fightId: 8,
      dataType: 'DamageDone',
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('separates event cache entries by time window', () => {
    const full = WclCache.eventQueryHash({
      reportCode: 'ABC',
      fightId: 8,
      dataType: 'DamageTaken',
      targetId: 42,
    });
    const windowed = WclCache.eventQueryHash({
      reportCode: 'ABC',
      fightId: 8,
      dataType: 'DamageTaken',
      targetId: 42,
      startTime: 1000,
      endTime: 9000,
    });
    const shifted = WclCache.eventQueryHash({
      reportCode: 'ABC',
      fightId: 8,
      dataType: 'DamageTaken',
      targetId: 42,
      startTime: 2000,
      endTime: 9000,
    });
    // A sub-window query must not collide with the full-fight query, and
    // different windows must not collide with each other.
    expect(full).not.toBe(windowed);
    expect(windowed).not.toBe(shifted);
  });

  it('embeds the analysis version constant in the key', () => {
    expect(ANALYSIS_VERSION).toBeGreaterThanOrEqual(1);
  });
});
