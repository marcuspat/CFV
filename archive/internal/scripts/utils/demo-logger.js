/**
 * Demo Logger System for Cognitive Fabric Visualizer
 *
 * Provides comprehensive logging with multiple output formats and levels.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export class DemoLogger {
  constructor(options = {}) {
    this.options = {
      level: options.level || 'info',
      file: options.file || 'scripts/logs/demo.log',
      console: options.console !== false,
      maxSize: options.maxSize || '10MB',
      maxFiles: options.maxFiles || 5,
      format: options.format || 'json',
      timestamps: options.timestamps !== false,
      colors: options.colors !== false,
      ...options
    };

    this.logs = [];
    this.startTime = Date.now();
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };

    this.currentLevel = this.levels[this.options.level] || this.levels.info;
  }

  log(level, message, meta = {}) {
    if (this.levels[level] > this.currentLevel) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      meta,
      elapsed: Date.now() - this.startTime
    };

    // Add to memory logs
    this.logs.push(logEntry);

    // Console output
    if (this.options.console) {
      this.consoleLog(logEntry);
    }

    // File output (async, non-blocking)
    if (this.options.file) {
      this.fileLog(logEntry);
    }
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  consoleLog(logEntry) {
    const { timestamp, level, message, meta, elapsed } = logEntry;
    const elapsedStr = this.formatElapsedTime(elapsed);

    let formattedMessage;

    if (this.options.format === 'json') {
      formattedMessage = JSON.stringify(logEntry);
    } else {
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      const timeStr = new Date(timestamp).toLocaleTimeString();
      formattedMessage = `[${timeStr}] [${elapsedStr}] ${level}: ${message}${metaStr}`;
    }

    // Apply colors if enabled and running in terminal
    if (this.options.colors && process.stdout.isTTY) {
      formattedMessage = this.applyColors(formattedMessage, level);
    }

    console.log(formattedMessage);
  }

  async fileLog(logEntry) {
    try {
      const logLine = JSON.stringify(logEntry) + '\n';

      // Ensure log directory exists
      const logDir = require('path').dirname(this.options.file);
      await mkdir(logDir, { recursive: true });

      // Append to file
      await writeFile(this.options.file, logLine, { flag: 'a' });
    } catch (error) {
      // Don't let logging errors crash the demo
      console.error('Failed to write to log file:', error.message);
    }
  }

  applyColors(message, level) {
    const colors = {
      ERROR: '\x1b[31m', // Red
      WARN: '\x1b[33m',  // Yellow
      INFO: '\x1b[36m',  // Cyan
      DEBUG: '\x1b[37m', // White
      RESET: '\x1b[0m'
    };

    return `${colors[level] || ''}${message}${colors.RESET}`;
  }

  formatElapsedTime(ms) {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(0);
      return `${minutes}m ${seconds}s`;
    }
  }

  getRecentLogs(count = 50) {
    return this.logs.slice(-count);
  }

  getLogsByLevel(level) {
    return this.logs.filter(log => log.level.toLowerCase() === level.toLowerCase());
  }

  getLogsInTimeRange(startTime, endTime) {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();

    return this.logs.filter(log => {
      const logTime = new Date(log.timestamp).getTime();
      return logTime >= start && logTime <= end;
    });
  }

  async exportLogs(filePath, format = 'json') {
    const logData = {
      summary: {
        totalLogs: this.logs.length,
        timeRange: {
          start: this.logs[0]?.timestamp,
          end: this.logs[this.logs.length - 1]?.timestamp
        },
        levels: this.getLevelSummary(),
        generatedAt: new Date().toISOString()
      },
      logs: this.logs
    };

    let content;

    switch (format) {
      case 'json':
        content = JSON.stringify(logData, null, 2);
        break;
      case 'csv':
        content = this.logsToCSV(this.logs);
        break;
      case 'txt':
        content = this.logsToText(this.logs);
        break;
      default:
        content = JSON.stringify(logData, null, 2);
    }

    await writeFile(filePath, content);
    return filePath;
  }

  getLevelSummary() {
    const summary = {
      ERROR: 0,
      WARN: 0,
      INFO: 0,
      DEBUG: 0
    };

    this.logs.forEach(log => {
      if (summary.hasOwnProperty(log.level)) {
        summary[log.level]++;
      }
    });

    return summary;
  }

  logsToCSV(logs) {
    const headers = ['timestamp', 'level', 'message', 'meta', 'elapsed'];
    const rows = logs.map(log => [
      log.timestamp,
      log.level,
      `"${log.message.replace(/"/g, '""')}"`, // Escape quotes
      `"${JSON.stringify(log.meta).replace(/"/g, '""')}"`,
      log.elapsed
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  logsToText(logs) {
    return logs.map(log => {
      const time = new Date(log.timestamp).toLocaleString();
      const meta = Object.keys(log.meta).length > 0 ? ` | ${JSON.stringify(log.meta)}` : '';
      return `[${time}] [${this.formatElapsedTime(log.elapsed)}] ${log.level}: ${log.message}${meta}`;
    }).join('\n');
  }

  clearLogs() {
    this.logs = [];
    this.startTime = Date.now();
  }

  setLevel(level) {
    if (this.levels.hasOwnProperty(level)) {
      this.currentLevel = this.levels[level];
      this.options.level = level;
    }
  }

  // Performance logging helpers
  logPerformance(operation, startTime, endTime, metadata = {}) {
    const duration = endTime - startTime;
    this.info(`Performance: ${operation}`, {
      duration: `${duration}ms`,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      ...metadata
    });
  }

  logApiCall(method, url, startTime, endTime, statusCode, error = null) {
    const duration = endTime - startTime;
    const level = error ? 'error' : statusCode >= 400 ? 'warn' : 'debug';

    this[level](`API: ${method} ${url}`, {
      statusCode,
      duration: `${duration}ms`,
      success: statusCode < 400 && !error,
      error: error?.message
    });
  }

  logCognitiveAnalysis(conversationId, analysis, processingTime) {
    this.info(`Cognitive analysis completed`, {
      conversationId,
      processingTime: `${processingTime}ms`,
      factualScore: analysis.factualScore?.toFixed(3),
      logicalScore: analysis.logicalScore?.toFixed(3),
      creativeScore: analysis.creativeScore?.toFixed(3),
      metacognitiveScore: analysis.metacognitiveScore?.toFixed(3),
      overallScore: ((analysis.factualScore + analysis.logicalScore + analysis.creativeScore + analysis.metacognitiveScore) / 4).toFixed(3)
    });
  }

  logVisualization(conversationId, visualizationId, renderTime, nodeCount, edgeCount) {
    this.info(`Visualization generated`, {
      conversationId,
      visualizationId,
      renderTime: `${renderTime}ms`,
      complexity: `${nodeCount + edgeCount} nodes/edges`,
      efficiency: `${((nodeCount + edgeCount) / renderTime).toFixed(2)} nodes/ms`
    });
  }

  logPhaseStart(phaseName) {
    this.info(`Phase started: ${phaseName}`, { phase: phaseName, type: 'phase_start' });
  }

  logPhaseEnd(phaseName, duration, success, error = null) {
    const level = success ? 'info' : 'error';
    this[level](`Phase ${success ? 'completed' : 'failed'}: ${phaseName}`, {
      phase: phaseName,
      duration: `${duration}ms`,
      success,
      error: error?.message,
      type: 'phase_end'
    });
  }

  logSystemMetrics(metrics) {
    this.debug('System metrics', {
      memory: {
        used: `${(metrics.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        total: `${(metrics.memory.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        external: `${(metrics.memory.external / 1024 / 1024).toFixed(2)}MB`
      },
      cpu: `${metrics.cpu.usage.toFixed(1)}%`,
      uptime: `${metrics.uptime}ms`
    });
  }

  // Demo-specific logging methods
  logDemoStart(config) {
    this.info('🚀 Cognitive Fabric Visualizer Demo Started', {
      version: '1.0.0',
      config: {
        conversations: config.conversations,
        output: config.output,
        skipValidation: config.skipValidation
      }
    });
  }

  logDemoComplete(results) {
    this.info('✅ Cognitive Fabric Visualizer Demo Completed', {
      duration: `${Math.round(results.duration / 1000)}s`,
      success: results.success,
      conversationsProcessed: results.conversations?.filter(c => c.status === 'processed').length || 0,
      visualizationsGenerated: results.conversations?.filter(c => c.visualization?.status === 'generated').length || 0,
      errors: results.errors?.length || 0,
      validation: results.validation?.overallStatus || 'unknown'
    });
  }

  logDemoError(error, context = {}) {
    this.error(`❌ Demo Error: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    });
  }

  createChildLogger(context) {
    const child = new DemoLogger(this.options);
    child.context = context;

    // Override log method to add context
    const originalLog = child.log.bind(child);
    child.log = function(level, message, meta = {}) {
      originalLog(level, message, { ...meta, context: child.context });
    };

    return child;
  }
}

export default DemoLogger;