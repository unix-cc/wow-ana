import { config } from './config.js';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const currentLevel: LogLevel = config.logLevel as LogLevel;

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

function emit(level: LogLevel, message: string): void {
  if (!shouldLog(level)) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  if (level === 'error' || level === 'fatal') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  trace: (...args: unknown[]) => emit('trace', formatArgs(args)),
  debug: (...args: unknown[]) => emit('debug', formatArgs(args)),
  info: (...args: unknown[]) => emit('info', formatArgs(args)),
  warn: (...args: unknown[]) => emit('warn', formatArgs(args)),
  error: (...args: unknown[]) => emit('error', formatArgs(args)),
  fatal: (...args: unknown[]) => emit('fatal', formatArgs(args)),
};
