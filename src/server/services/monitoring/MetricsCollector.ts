/**
 * Metrics Collector Service
 * Central service for collecting and managing performance metrics
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import * as os from 'os';
import * as fs from 'fs/promises';
import { join } from 'path';
import { DEFAULT_MONITORING_CONFIG, MONITORING_CATEGORIES, METRIC_TYPES } from '../../../config/monitoring.js';

export interface Metric {
  id: string;
  name: string;
  category: string;
  type: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface MetricSnapshot {
  timestamp: number;
  metrics: Metric[];
  systemInfo: SystemInfo;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  nodeVersion: string;
  uptime: number;
  loadAverage: number[];
  cpuCount: number;
  totalMemory: number;
  freeMemory: number;
  usedMemory: number;
  memoryUsage: number;
}

export class MetricsCollector extends EventEmitter {
  private metrics: Map<string, Metric> = new Map();
  private timers: Map<string, number> = new Map();
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private config = DEFAULT_MONITORING_CONFIG;
  private collectionInterval?: NodeJS.Timeout;
  private metricsHistory: MetricSnapshot[] = [];
  private maxHistorySize = 1000; // Keep last 1000 snapshots

  constructor() {
    super();
    this.setupCollectionInterval();
  }

  /**
   * Configure the metrics collector
   */
  configure(config: Partial<typeof DEFAULT_MONITORING_CONFIG>): void {
    this.config = { ...this.config, ...config };
    if (this.config.enabled) {
      this.setupCollectionInterval();
    } else {
      this.stopCollection();
    }
  }

  /**
   * Record a counter metric
   */
  incrementCounter(name: string, value: number = 1, tags?: Record<string, string>): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);

    this.recordMetric({
      id: this.generateMetricId(name, METRIC_TYPES.COUNTER),
      name,
      category: this.inferCategory(name),
      type: METRIC_TYPES.COUNTER,
      value: current + value,
      unit: 'count',
      timestamp: Date.now(),
      tags
    });
  }

  /**
   * Record a gauge metric (current value)
   */
  setGauge(name: string, value: number, unit: string = 'value', tags?: Record<string, string>): void {
    this.recordMetric({
      id: this.generateMetricId(name, METRIC_TYPES.GAUGE),
      name,
      category: this.inferCategory(name),
      type: METRIC_TYPES.GAUGE,
      value,
      unit,
      timestamp: Date.now(),
      tags
    });
  }

  /**
   * Record a histogram metric
   */
  recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
    const values = this.histograms.get(name) || [];
    values.push(value);

    // Keep only last 1000 values
    if (values.length > 1000) {
      values.shift();
    }

    this.histograms.set(name, values);

    this.recordMetric({
      id: this.generateMetricId(name, METRIC_TYPES.HISTOGRAM),
      name,
      category: this.inferCategory(name),
      type: METRIC_TYPES.HISTOGRAM,
      value,
      unit: 'value',
      timestamp: Date.now(),
      tags
    });
  }

  /**
   * Start a timer for measuring duration
   */
  startTimer(name: string, tags?: Record<string, string>): string {
    const timerId = `${name}_${Date.now()}_${Math.random()}`;
    this.timers.set(timerId, performance.now());
    return timerId;
  }

  /**
   * End a timer and record the duration
   */
  endTimer(timerId: string, tags?: Record<string, string>): number | null {
    const startTime = this.timers.get(timerId);
    if (!startTime) return null;

    const duration = performance.now() - startTime;
    this.timers.delete(timerId);

    const name = timerId.split('_').slice(0, -2).join('_');
    this.recordMetric({
      id: this.generateMetricId(name, METRIC_TYPES.TIMER),
      name,
      category: this.inferCategory(name),
      type: METRIC_TYPES.TIMER,
      value: duration,
      unit: 'ms',
      timestamp: Date.now(),
      tags
    });

    return duration;
  }

  /**
   * Record execution time for a function
   */
  async recordExecutionTime<T>(
    name: string,
    fn: () => Promise<T> | T,
    tags?: Record<string, string>
  ): Promise<T> {
    const timerId = this.startTimer(name, tags);
    try {
      const result = await fn();
      this.endTimer(timerId, tags);
      return result;
    } catch (error) {
      this.endTimer(timerId, { ...tags, error: 'true' });
      throw error;
    }
  }

  /**
   * Get current metrics snapshot
   */
  getSnapshot(): MetricSnapshot {
    return {
      timestamp: Date.now(),
      metrics: Array.from(this.metrics.values()),
      systemInfo: this.getSystemInfo()
    };
  }

  /**
   * Get metrics history
   */
  getHistory(limit?: number): MetricSnapshot[] {
    if (limit) {
      return this.metricsHistory.slice(-limit);
    }
    return [...this.metricsHistory];
  }

  /**
   * Get metrics by category
   */
  getMetricsByCategory(category: string): Metric[] {
    return Array.from(this.metrics.values()).filter(m => m.category === category);
  }

  /**
   * Get metrics by name pattern
   */
  getMetricsByNamePattern(pattern: RegExp): Metric[] {
    return Array.from(this.metrics.values()).filter(m => pattern.test(m.name));
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.counters.clear();
    this.histograms.clear();
    this.timers.clear();
  }

  /**
   * Export metrics to JSON
   */
  exportMetrics(): string {
    return JSON.stringify({
      timestamp: Date.now(),
      config: this.config,
      snapshot: this.getSnapshot(),
      history: this.metricsHistory.slice(-10) // Last 10 snapshots
    }, null, 2);
  }

  private recordMetric(metric: Metric): void {
    this.metrics.set(metric.id, metric);
    this.emit('metric', metric);
  }

  private generateMetricId(name: string, type: string): string {
    return `${name}_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private inferCategory(name: string): string {
    if (name.includes('cpu') || name.includes('memory') || name.includes('disk')) {
      return MONITORING_CATEGORIES.SYSTEM;
    }
    if (name.includes('database') || name.includes('query') || name.includes('db')) {
      return MONITORING_CATEGORIES.DATABASE;
    }
    if (name.includes('network') || name.includes('latency') || name.includes('throughput')) {
      return MONITORING_CATEGORIES.NETWORK;
    }
    if (name.includes('agent') || name.includes('coordination') || name.includes('swarm')) {
      return MONITORING_CATEGORIES.AGENTS;
    }
    if (name.includes('api') || name.includes('http') || name.includes('response')) {
      return MONITORING_CATEGORIES.API;
    }
    if (name.includes('error') || name.includes('exception') || name.includes('failure')) {
      return MONITORING_CATEGORIES.ERRORS;
    }
    return MONITORING_CATEGORIES.APPLICATION;
  }

  private getSystemInfo(): SystemInfo {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    return {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      uptime: os.uptime(),
      loadAverage: os.loadavg(),
      cpuCount: os.cpus().length,
      totalMemory,
      freeMemory,
      usedMemory,
      memoryUsage: (usedMemory / totalMemory) * 100
    };
  }

  private setupCollectionInterval(): void {
    if (!this.config.enabled) return;

    this.collectionInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.cleanupOldMetrics();
      this.saveSnapshot();
    }, this.config.interval);
  }

  private collectSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Memory metrics
    this.setGauge('memory.rss', memUsage.rss, 'bytes');
    this.setGauge('memory.heap_used', memUsage.heapUsed, 'bytes');
    this.setGauge('memory.heap_total', memUsage.heapTotal, 'bytes');
    this.setGauge('memory.external', memUsage.external, 'bytes');
    this.setGauge('memory.usage_percent', this.getSystemInfo().memoryUsage, 'percent');

    // CPU metrics
    this.setGauge('cpu.user', cpuUsage.user, 'microseconds');
    this.setGauge('cpu.system', cpuUsage.system, 'microseconds');

    // System metrics
    const loadAvg = os.loadavg();
    this.setGauge('system.load_1m', loadAvg[0], 'load');
    this.setGauge('system.load_5m', loadAvg[1], 'load');
    this.setGauge('system.load_15m', loadAvg[2], 'load');

    // Process metrics
    this.setGauge('process.uptime', process.uptime(), 'seconds');
    this.setGauge('process.pid', process.pid, 'count');
  }

  private cleanupOldMetrics(): void {
    const now = Date.now();
    const retentionMs = this.config.retention.metrics * 24 * 60 * 60 * 1000;

    for (const [id, metric] of this.metrics.entries()) {
      if (now - metric.timestamp > retentionMs) {
        this.metrics.delete(id);
      }
    }
  }

  private saveSnapshot(): void {
    const snapshot = this.getSnapshot();
    this.metricsHistory.push(snapshot);

    // Keep only recent snapshots
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }

    this.emit('snapshot', snapshot);
  }

  private stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.stopCollection();
    this.clearMetrics();
    this.removeAllListeners();
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();