/**
 * Logging utility for Cognitive Fabric Visualizer
 */

import { config } from '../config';

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
  metadata?: any;
  error?: Error;
  requestId?: string;
  userId?: string;
  conversationId?: string;
}

class Logger {
  private logLevel: LogLevel;

  constructor() {
    this.logLevel = this.parseLogLevel(config.LOG_LEVEL);
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level) {
      case 'error':
        return LogLevel.ERROR;
      case 'warn':
        return LogLevel.WARN;
      case 'info':
        return LogLevel.INFO;
      case 'debug':
        return LogLevel.DEBUG;
      default:
        return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const requestId = entry.requestId ? ` [${entry.requestId}]` : '';
    const userId = entry.userId ? ` [user:${entry.userId}]` : '';
    const conversationId = entry.conversationId ? ` [conv:${entry.conversationId}]` : '';

    let message = `${timestamp} ${entry.level.toUpperCase()}${requestId}${userId}${conversationId} - ${entry.message}`;

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      message += ` | Metadata: ${JSON.stringify(entry.metadata)}`;
    }

    if (entry.error) {
      message += ` | Error: ${entry.error.message}`;
      if (entry.error.stack) {
        message += ` | Stack: ${entry.error.stack}`;
      }
    }

    return message;
  }

  private writeLog(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    const formattedMessage = this.formatMessage(entry);

    // Console output
    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.INFO:
        console.log(formattedMessage);
        break;
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
    }

    // In production, consider implementing external logging service integration
    // Examples: Winston, Papertrail, LogDNA, etc.
    // This is a placeholder for future production logging enhancements
  }

  public error(message: string, metadata?: any, error?: Error): void {
    this.writeLog({
      level: LogLevel.ERROR,
      message,
      timestamp: new Date(),
      metadata,
      error,
    });
  }

  public warn(message: string, metadata?: any): void {
    this.writeLog({
      level: LogLevel.WARN,
      message,
      timestamp: new Date(),
      metadata,
    });
  }

  public info(message: string, metadata?: any): void {
    this.writeLog({
      level: LogLevel.INFO,
      message,
      timestamp: new Date(),
      metadata,
    });
  }

  public debug(message: string, metadata?: any): void {
    this.writeLog({
      level: LogLevel.DEBUG,
      message,
      timestamp: new Date(),
      metadata,
    });
  }

  // Specialized logging methods for different contexts
  public logRequest(requestId: string, method: string, url: string, metadata?: any): void {
    this.info('HTTP Request', {
      ...metadata,
      method,
      url,
      requestId,
    });
  }

  public logCognitiveProcessing(conversationId: string, dimension: string, accuracy: number, target: number): void {
    const logLevel = accuracy >= target ? LogLevel.INFO : LogLevel.WARN;
    this.writeLog({
      level: logLevel,
      message: `Cognitive processing completed`,
      timestamp: new Date(),
      metadata: {
        conversationId,
        dimension,
        accuracy,
        target,
        thresholdMet: accuracy >= target,
      },
      conversationId,
    });
  }

  public logWebSocketConnection(clientId: string, userId?: string): void {
    this.info('WebSocket connection established', {
      clientId,
      userId,
    });
  }

  public logWebSocketDisconnection(clientId: string, reason?: string): void {
    this.info('WebSocket connection closed', {
      clientId,
      reason,
    });
  }

  public logDatabaseQuery(query: string, duration: number, metadata?: any): void {
    this.debug('Database query executed', {
      query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
      duration: `${duration}ms`,
      ...metadata,
    });
  }

  public logCacheOperation(operation: 'hit' | 'miss' | 'set' | 'delete', key: string, metadata?: any): void {
    this.debug('Cache operation', {
      operation,
      key,
      ...metadata,
    });
  }

  public logPerformanceMetric(metric: string, value: number, unit: string, metadata?: any): void {
    this.info('Performance metric', {
      metric,
      value,
      unit,
      ...metadata,
    });
  }

  // Context-aware logging with request information
  public createRequestLogger(requestId: string, userId?: string, conversationId?: string) {
    return {
      error: (message: string, metadata?: any, error?: Error) => {
        this.error(message, { ...metadata, requestId, userId, conversationId }, error);
      },
      warn: (message: string, metadata?: any) => {
        this.warn(message, { ...metadata, requestId, userId, conversationId });
      },
      info: (message: string, metadata?: any) => {
        this.info(message, { ...metadata, requestId, userId, conversationId });
      },
      debug: (message: string, metadata?: any) => {
        this.debug(message, { ...metadata, requestId, userId, conversationId });
      },
    };
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const logError = (message: string, metadata?: any, error?: Error): void => {
  logger.error(message, metadata, error);
};

export const logWarn = (message: string, metadata?: any): void => {
  logger.warn(message, metadata);
};

export const logInfo = (message: string, metadata?: any): void => {
  logger.info(message, metadata);
};

export const logDebug = (message: string, metadata?: any): void => {
  logger.debug(message, metadata);
};

export default logger;