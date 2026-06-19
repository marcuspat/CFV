/**
 * Logging utility for Cognitive Fabric Visualizer — backed by pino.
 *
 * Reads LOG_LEVEL directly from the environment (default 'info') so it has no
 * dependency on the strict config module and can be used from the earliest
 * boot path. The public API (logger.info/warn/error/debug + the specialized
 * helpers) is preserved so existing call sites are unchanged. `pinoLogger` is
 * exported for pino-http.
 */
import dotenv from 'dotenv';
import pino, { Logger as PinoLogger } from 'pino';

dotenv.config();

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  error?: Error;
  requestId?: string;
  userId?: string;
  conversationId?: string;
}

const VALID_LEVELS = ['error', 'warn', 'info', 'debug'];
const level = VALID_LEVELS.includes(process.env.LOG_LEVEL ?? '')
  ? (process.env.LOG_LEVEL as string)
  : 'info';

// Shared pino instance (also consumed by pino-http for request logging).
// Synchronous destination so logs flush reliably, incl. fatal messages emitted
// right before process.exit() in the startup validator.
export const pinoLogger: PinoLogger = pino(
  {
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  },
  pino.destination({ sync: true })
);

type Meta = Record<string, unknown> | undefined;

class Logger {
  private base: PinoLogger = pinoLogger;

  error(message: string, metadata?: Meta, error?: Error): void {
    this.base.error({ ...(metadata ?? {}), ...(error ? { err: error } : {}) }, message);
  }

  warn(message: string, metadata?: Meta): void {
    this.base.warn(metadata ?? {}, message);
  }

  info(message: string, metadata?: Meta): void {
    this.base.info(metadata ?? {}, message);
  }

  debug(message: string, metadata?: Meta): void {
    this.base.debug(metadata ?? {}, message);
  }

  // --- Specialized helpers (preserved API; delegate to the levels above) ---
  logRequest(requestId: string, method: string, url: string, metadata?: Meta): void {
    this.info('HTTP Request', { ...metadata, method, url, requestId });
  }

  logCognitiveProcessing(conversationId: string, dimension: string, accuracy: number, target: number): void {
    const meta = { conversationId, dimension, accuracy, target, thresholdMet: accuracy >= target };
    if (accuracy >= target) this.info('Cognitive processing completed', meta);
    else this.warn('Cognitive processing completed', meta);
  }

  logWebSocketConnection(clientId: string, userId?: string): void {
    this.info('WebSocket connection established', { clientId, userId });
  }

  logWebSocketDisconnection(clientId: string, reason?: string): void {
    this.info('WebSocket connection closed', { clientId, reason });
  }

  logDatabaseQuery(query: string, duration: number, metadata?: Meta): void {
    this.debug('Database query executed', {
      query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
      duration: `${duration}ms`,
      ...metadata,
    });
  }

  logCacheOperation(operation: 'hit' | 'miss' | 'set' | 'delete', key: string, metadata?: Meta): void {
    this.debug('Cache operation', { operation, key, ...metadata });
  }

  logPerformanceMetric(metric: string, value: number, unit: string, metadata?: Meta): void {
    this.info('Performance metric', { metric, value, unit, ...metadata });
  }

  // Context-aware logging with request information.
  createRequestLogger(requestId: string, userId?: string, conversationId?: string) {
    const ctx = { requestId, userId, conversationId };
    return {
      error: (message: string, metadata?: Meta, error?: Error) =>
        this.error(message, { ...metadata, ...ctx }, error),
      warn: (message: string, metadata?: Meta) => this.warn(message, { ...metadata, ...ctx }),
      info: (message: string, metadata?: Meta) => this.info(message, { ...metadata, ...ctx }),
      debug: (message: string, metadata?: Meta) => this.debug(message, { ...metadata, ...ctx }),
    };
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const logError = (message: string, metadata?: Meta, error?: Error): void =>
  logger.error(message, metadata, error);
export const logWarn = (message: string, metadata?: Meta): void => logger.warn(message, metadata);
export const logInfo = (message: string, metadata?: Meta): void => logger.info(message, metadata);
export const logDebug = (message: string, metadata?: Meta): void => logger.debug(message, metadata);

export default logger;
