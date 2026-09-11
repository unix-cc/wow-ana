import { isAbsolute, resolve } from 'node:path';
import { config, envRootDir, logger } from '@wcl/shared';
import {
  createDatabase,
  SqliteCache,
  WclCache,
  type CacheStore,
  type DatabaseHandle,
} from '@wcl/storage';

/**
 * Owns the SQLite database handle and the WclCache derived from it.
 * Keeps the SQLite lifecycle (open/close) in one place so services and the
 * adapters (MCP / web) never touch raw connections.
 *
 * Importing `@wcl/shared` first also guarantees `.env` is loaded before the
 * database path is read (shared/config loads dotenv as an import side effect).
 */
export class DatabaseService {
  private handle: DatabaseHandle | undefined;
  readonly cache: WclCache | undefined;
  /** Generic string KV over the same SQLite file (e.g. chat session store). */
  readonly kv: CacheStore | undefined;

  constructor(options?: { dbPath?: string | undefined }) {
    const dbPath = options?.dbPath ?? defaultDbPath();
    if (dbPath === ':memory:') {
      this.handle = createDatabase(':memory:');
    } else if (dbPath) {
      this.handle = createDatabase(dbPath);
    }
    if (this.handle) {
      const store = new SqliteCache(this.handle.sqlite);
      this.cache = new WclCache(store);
      this.kv = store;
    }
  }

  close(): void {
    this.handle?.close();
    this.handle = undefined;
  }
}

/**
 * Resolve the configured database path.
 *
 * `DATABASE_URL` in `.env` is typically a relative path (`wcl-cache.db`). It
 * must anchor to the `.env` directory (workspace root), NOT the process CWD —
 * otherwise starting the server from different directories silently creates
 * multiple database files and splits the cache (real incident: a root
 * `wcl-cache.db` and a stale `apps/web/wcl-cache.db` coexisted).
 */
function defaultDbPath(): string | undefined {
  const raw = config.databaseUrl;
  if (raw === undefined || raw === '') return undefined;
  const resolved = isAbsolute(raw) ? raw : resolve(envRootDir, raw);
  if (resolved !== raw) {
    logger.info(`DATABASE_URL "${raw}" resolved to ${resolved}`);
  }
  return resolved;
}
