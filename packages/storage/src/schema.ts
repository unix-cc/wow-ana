import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

/**
 * Generic key-value cache backed by SQLite.
 *
 * The `key` encodes the cache domain + version, e.g.:
 *   report:{reportCode}
 *   fight:{reportCode}
 *   actors:{reportCode}
 *   events:{reportCode}:{fightId}:{queryHash}
 *   analysis:v1:{reportCode}:{fightId}:{playerId}
 *
 * Storing the analysis version in the key ensures old results never pollute
 * a newer algorithm's cache entry.
 */
export const cacheEntries = sqliteTable(
  'cache_entries',
  {
    key: text('key').notNull(),
    value: text('value').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.key] }),
  }),
);

export type CacheEntry = typeof cacheEntries.$inferSelect;
export type NewCacheEntry = typeof cacheEntries.$inferInsert;
