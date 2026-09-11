import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryCache, SqliteCache } from '../src/cache.js';
import { createDatabase } from '../src/database.js';

describe('MemoryCache', () => {
  it('stores and retrieves values', async () => {
    const cache = new MemoryCache();
    await cache.set('k', 'v');
    expect(await cache.get('k')).toBe('v');
  });

  it('expires values after ttl', async () => {
    vi.useFakeTimers();
    try {
      const cache = new MemoryCache();
      await cache.set('k', 'v', 1000);
      vi.advanceTimersByTime(1001);
      expect(await cache.get('k')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns undefined for missing keys', async () => {
    const cache = new MemoryCache();
    expect(await cache.get('missing')).toBeUndefined();
  });

  it('deletes values', async () => {
    const cache = new MemoryCache();
    await cache.set('k', 'v');
    await cache.delete('k');
    expect(await cache.get('k')).toBeUndefined();
  });
});

describe('SqliteCache', () => {
  let handle: ReturnType<typeof createDatabase>;
  let cache: SqliteCache;

  beforeEach(() => {
    handle = createDatabase(':memory:');
    cache = new SqliteCache(handle.sqlite);
  });

  afterEach(() => {
    handle.close();
  });

  it('stores and retrieves values', async () => {
    await cache.set('k', 'v');
    expect(await cache.get('k')).toBe('v');
  });

  it('returns undefined for missing keys', async () => {
    expect(await cache.get('missing')).toBeUndefined();
  });

  it('expires values after ttl', async () => {
    vi.useFakeTimers();
    try {
      await cache.set('k', 'v', 1000);
      expect(await cache.get('k')).toBe('v');
      vi.advanceTimersByTime(1001);
      expect(await cache.get('k')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('upserts on duplicate key', async () => {
    await cache.set('k', 'v1');
    await cache.set('k', 'v2');
    expect(await cache.get('k')).toBe('v2');
  });

  it('deletes values', async () => {
    await cache.set('k', 'v');
    await cache.delete('k');
    expect(await cache.get('k')).toBeUndefined();
  });
});
