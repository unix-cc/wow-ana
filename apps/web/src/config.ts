export interface WebConfig {
  host: string;
  port: number;
}

/**
 * Read host/port from the environment with safe defaults. PORT=0 is not
 * allowed; if the value is invalid, fall back to 8787.
 */
export function loadWebConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  const rawPort = Number(env.PORT ?? '8787');
  const port = Number.isInteger(rawPort) && rawPort > 0 ? rawPort : 8787;
  return { host: env.HOST ?? '127.0.0.1', port };
}
