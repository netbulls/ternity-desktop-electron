import { app } from 'electron';
import { join } from 'path';
import { appendFileSync, statSync, renameSync, existsSync, mkdirSync } from 'fs';
import { is } from '@electron-toolkit/utils';

// ============================================================
// Log levels
// ============================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ============================================================
// Config — environment-aware
// ============================================================

const MAX_LOG_SIZE = 2 * 1024 * 1024; // 2 MB — rotate when exceeded

// Dev builds: log everything. Packaged builds: info and above (skip debug noise from polling)
const MIN_LEVEL: LogLevel = is.dev ? 'debug' : 'info';

// Console output: always in dev, only warn+ in packaged (keeps stdout clean)
const CONSOLE_MIN_LEVEL: LogLevel = is.dev ? 'debug' : 'warn';

// ============================================================
// File setup
// ============================================================

let logDir: string | null = null;
let logPath: string | null = null;

function ensureLogDir(): void {
  if (logDir) return;
  logDir = join(app.getPath('userData'), 'logs');
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  logPath = join(logDir, 'app.log');
}

function rotateIfNeeded(): void {
  if (!logPath) return;
  try {
    const stats = statSync(logPath);
    if (stats.size > MAX_LOG_SIZE) {
      const prev = join(logDir!, 'app.prev.log');
      if (existsSync(prev)) {
        renameSync(prev, join(logDir!, 'app.prev2.log'));
      }
      renameSync(logPath, prev);
    }
  } catch {
    // File doesn't exist yet — that's fine
  }
}

// ============================================================
// Core write
// ============================================================

function writeLog(level: LogLevel, tag: string, args: unknown[]): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return;

  const ts = new Date().toISOString();
  const prefix = `${ts} [${level.toUpperCase().padEnd(5)}] [${tag}]`;
  const msg = args
    .map((a) => {
      if (a instanceof Error) return `${a.message}\n${a.stack}`;
      if (typeof a === 'object' && a !== null) {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    })
    .join(' ');

  const line = `${prefix} ${msg}\n`;

  // Console — verbose in dev, quiet in packaged
  if (LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[CONSOLE_MIN_LEVEL]) {
    const consoleFn = level === 'error' ? console.error
      : level === 'warn' ? console.warn
      : console.log;
    consoleFn(`[${tag}]`, ...args);
  }

  // File — always written (persisted for post-mortem debugging)
  try {
    ensureLogDir();
    rotateIfNeeded();
    appendFileSync(logPath!, line);
  } catch {
    // Logging should never crash the app
  }
}

// ============================================================
// Public API — createLogger('tag') → { debug, info, warn, error }
// ============================================================

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function createLogger(tag: string): Logger {
  return {
    debug: (...args) => writeLog('debug', tag, args),
    info: (...args) => writeLog('info', tag, args),
    warn: (...args) => writeLog('warn', tag, args),
    error: (...args) => writeLog('error', tag, args),
  };
}

/** Get the log file path (for displaying to users or opening in finder). */
export function getLogPath(): string {
  ensureLogDir();
  return logPath!;
}
