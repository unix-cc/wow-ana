import { z } from 'zod';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * dotenv only reads `.env` from the current working directory by default, but
 * pnpm runs scripts with cwd set to the package directory (e.g. apps/web).
 * Walk up from this module to find the workspace root `.env` so credentials
 * load no matter how the server is started.
 */
function findEnvPath(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 12; depth += 1) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const envPath = findEnvPath();
if (envPath) {
  loadEnv({ path: envPath });
} else {
  loadEnv();
}

/**
 * Directory of the `.env` file this process loaded (workspace root in the
 * standard layout), or `process.cwd()` when no `.env` was found. Relative
 * filesystem paths from configuration (e.g. DATABASE_URL) must be resolved
 * against this directory — never against the process CWD, which varies with
 * how the server is started (repo root vs. apps/web) and would silently
 * split one logical database into several files.
 */
export const envRootDir: string = envPath ? dirname(envPath) : process.cwd();

const EnvSchema = z.object({
  WCL_CLIENT_ID: z.string().optional(),
  WCL_CLIENT_SECRET: z.string().optional(),
  WCL_API_URL: z.string().default('https://www.warcraftlogs.com/api/v2/client'),
  DATABASE_URL: z.string().optional(),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
});

export interface AppConfig {
  wclClientId?: string | undefined;
  wclClientSecret?: string | undefined;
  wclApiUrl: string;
  databaseUrl?: string | undefined;
  logLevel: string;
}

const envResult = EnvSchema.safeParse(process.env);

if (!envResult.success) {
  throw new Error(
    `Invalid environment configuration: ${envResult.error.message}`,
  );
}

const env = envResult.data;

export const config: AppConfig = {
  wclClientId: env.WCL_CLIENT_ID,
  wclClientSecret: env.WCL_CLIENT_SECRET,
  wclApiUrl: env.WCL_API_URL,
  databaseUrl: env.DATABASE_URL,
  logLevel: env.LOG_LEVEL,
};

export function hasWclCredentials(): boolean {
  return Boolean(config.wclClientId && config.wclClientSecret);
}
