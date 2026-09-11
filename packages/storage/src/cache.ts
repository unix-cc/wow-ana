import { eq, like } from 'drizzle-orm';
import { cacheEntries } from './schema.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export interface CacheStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Enumerate stored keys with the given prefix. */
  listKeys(prefix: string): Promise<string[]>;
}

/**
 * A simple in-memory cache. Useful as a default and for tests.
 * The cache is intentionally keyed by opaque string so callers control
 * the key format (e.g. `analysis:v1:{report}:{fight}:{player}`).
 */
export class MemoryCache implements CacheStore {
  private readonly store = new Map<
    string,
    { value: string; expiresAt?: number | undefined }
  >();

  async get(key: string): Promise<string | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    const expiresAt = ttlMs !== undefined ? Date.now() + ttlMs : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async listKeys(prefix: string): Promise<string[]> {
    return [...this.store.keys()].filter((key) => key.startsWith(prefix));
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * SQLite-backed cache implementing CacheStore. Values are stored as JSON
 * strings in a single table, keyed by a versioned cache key.
 */
export class SqliteCache implements CacheStore {
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(db: BetterSQLite3Database<typeof schema>) {
    this.db = db;
  }

  async get(key: string): Promise<string | undefined> {
    const row = this.db
      .select({ value: cacheEntries.value, expiresAt: cacheEntries.expiresAt })
      .from(cacheEntries)
      .where(eq(cacheEntries.key, key))
      .get();

    if (!row) return undefined;

    if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) {
      this.db.delete(cacheEntries).where(eq(cacheEntries.key, key)).run();
      return undefined;
    }

    return row.value;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    const expiresAt = ttlMs !== undefined ? new Date(Date.now() + ttlMs) : null;

    this.db
      .insert(cacheEntries)
      .values({
        key,
        value,
        createdAt: new Date(),
        expiresAt,
      })
      .onConflictDoUpdate({
        target: cacheEntries.key,
        set: { value, expiresAt },
      })
      .run();
  }

  async delete(key: string): Promise<void> {
    this.db.delete(cacheEntries).where(eq(cacheEntries.key, key)).run();
  }

  async listKeys(prefix: string): Promise<string[]> {
    const rows = this.db
      .select({ key: cacheEntries.key })
      .from(cacheEntries)
      .where(like(cacheEntries.key, `${prefix}%`))
      .all();
    return rows.map((row) => row.key);
  }
}
