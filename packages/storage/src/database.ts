import {
  drizzle,
  type BetterSQLite3Database,
} from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import * as schema from './schema.js';

export interface DatabaseHandle {
  sqlite: BetterSQLite3Database<typeof schema>;
  close(): void;
}

/**
 * Open (or create) the SQLite database at the given path.
 * Pass ':memory:' for an in-memory database (used by tests).
 */
export function createDatabase(
  dbPath: string,
  options?: { migrate?: boolean },
): DatabaseHandle {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const drizzleDb = drizzle(sqlite, { schema });

  if (options?.migrate !== false) {
    migrate(drizzleDb, { migrationsFolder: getMigrationsFolder() });
  }

  return {
    sqlite: drizzleDb,
    close() {
      sqlite.close();
    },
  };
}

function getMigrationsFolder(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, '..', 'drizzle');
}
