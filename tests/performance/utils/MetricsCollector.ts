/**
 * Comprehensive metrics collector for performance testing
 */

import { performance, MemoryUsage, CpuUsage } from 'os';
import { EventEmitter } from 'events';

export interface PerformanceMetrics {
  timestamp: number;
  cpu: CPUMetrics;
  memory: MemoryMetrics;
  network: NetworkMetrics;
  disk: DiskMetrics;
  process: ProcessMetrics;
  application: ApplicationMetrics;
}

export interface CPUMetrics {
  usage: number;
  loadAverage: number[];
  coreCount: number;
  model: string;
  speed: number;
}

export interface MemoryMetrics {
  total: number;
  free: number;
  used: number;
  percentage: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  rss: number;
}

export interface NetworkMetrics {
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
  connections: number;
  latency: number;
}

export interface DiskMetrics {
  reads: number;
  writes: number;
  bytesRead: number;
  bytesWritten: number;
  queueLength: number;
  utilization: number;
}

export interface ProcessMetrics {
  uptime: number;
  pid: number;
  ppid: number;
  cpuUsage: NodeJS.CpuUsage;
  memoryUsage: NodeJS.MemoryUsage;
  fileDescriptors: number;
}

export interface ApplicationMetrics {
  activeConnections: number;
  requestsPerSecond: number;
  responseTime: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  errorRate: number;
  databaseConnections: {
    postgres: number;
    neo4j: number;
    redis: number;
  };
  cacheHitRate: number;
  activeWebSocketConnections: number;
}

export class MetricsCollector extends EventEmitter {
  private isCollecting = false;
  private collectionInterval?: NodeJS.Timeout;
  private metrics: PerformanceMetrics[] = [];
  private requestTimes: number[] = [];
  private errorCount = 0;
  private requestCount = 0;
  private lastNetworkStats: any = {};
  private lastDiskStats: any = {};
  private startTime = Date.now();

  constructor(private collectionIntervalMs = 1000) {
    super();
  }

  start(): void {
    if (this.isCollecting) {
      return;
    }

    this.isCollecting = true;
    this.startTime = Date.now();

    this.collectionInterval = setInterval(() => {
      this.collectMetrics();
    }, this.collectionIntervalMs);

    this.emit('started');
  }

  stop(): PerformanceMetrics[] {
    if (!this.isCollecting) {
      return this.metrics;
    }

    this.isCollecting = false;

    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }

    this.emit('stopped', this.metrics);
    return this.metrics;
  }

  recordRequest(duration: number, isError = false): void {
    this.requestTimes.push(duration);
    this.requestCount++;

    if (isError) {
      this.errorCount++;
    }

    // Keep only last 1000 request times for percentile calculations
    if (this.requestTimes.length > 1000) {
      this.requestTimes = this.requestTimes.slice(-1000);
    }
  }

  private collectMetrics(): void {
    try {
      const metrics: PerformanceMetrics = {
        timestamp: Date.now(),
        cpu: this.collectCPUMetrics(),
        memory: this.collectMemoryMetrics(),
        network: this.collectNetworkMetrics(),
        disk: this.collectDiskMetrics(),
        process: this.collectProcessMetrics(),
        application: this.collectApplicationMetrics()
      };

      this.metrics.push(metrics);

      // Keep only last 10 minutes of metrics at 1-second intervals
      if (this.metrics.length > 600) {
        this.metrics = this.metrics.slice(-600);
      }

      this.emit('metrics', metrics);

      // Check for performance thresholds
      this.checkThresholds(metrics);

    } catch (error) {
      this.emit('error', error);
    }
  }

  private collectCPUMetrics(): CPUMetrics {
    const cpus = require('os').cpus();
    const loadAvg = require('os').loadavg();

    // Calculate CPU usage (approximation)
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu: any) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - (idle / total * 100);

    return {
      usage: Math.round(usage * 100) / 100,
      loadAverage: loadAvg,
      coreCount: cpus.length,
      model: cpus[0]?.model || 'Unknown',
      speed: cpus[0]?.speed || 0
    };
  }

  private collectMemoryMetrics(): MemoryMetrics {
    const os = require('os');
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const memUsage = process.memoryUsage();

    return {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      percentage: Math.round((usedMem / totalMem) * 10000) / 100,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      rss: memUsage.rss
    };
  }

  private collectNetworkMetrics(): NetworkMetrics {
    // This is a simplified version - in production, you'd want to use
    // system-specific network monitoring tools
    const activeConnections = this.getActiveConnections();

    return {
      bytesIn: 0, // Would need system-specific implementation
      bytesOut: 0,
      packetsIn: 0,
      packetsOut: 0,
      connections: activeConnections,
      latency: 0 // Would need to implement ping/latency measurement
    };
  }

  private collectDiskMetrics(): DiskMetrics {
    // Simplified disk metrics - production would use system calls
    return {
      reads: 0,
      writes: 0,
      bytesRead: 0,
      bytesWritten: 0,
      queueLength: 0,
      utilization: 0
    };
  }

  private collectProcessMetrics(): ProcessMetrics {
    const cpuUsage = process.cpuUsage();
    const memoryUsage = process.memoryUsage();

    return {
      uptime: process.uptime(),
      pid: process.pid,
      ppid: process.ppid,
      cpuUsage: cpuUsage,
      memoryUsage: memoryUsage,
      fileDescriptors: 0 // Would need OS-specific implementation
    };
  }

  private collectApplicationMetrics(): ApplicationMetrics {
    const responseTimeMetrics = this.calculateResponseTimeMetrics();
    const errorRate = this.requestCount > 0 ?
      (this.errorCount / this.requestCount) * 100 : 0;

    return {
      activeConnections: this.getActiveConnections(),
      requestsPerSecond: this.calculateRequestsPerSecond(),
      responseTime: responseTimeMetrics,
      errorRate: Math.round(errorRate * 100) / 100,
      databaseConnections: {
        postgres: 0, // Would need to monitor actual DB connections
        neo4j: 0,
        redis: 0
      },
      cacheHitRate: 0, // Would need Redis client metrics
      activeWebSocketConnections: 0 // Would need WebSocket server metrics
    };
  }

  private calculateResponseTimeMetrics() {
    if (this.requestTimes.length === 0) {
      return { avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...this.requestTimes].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      avg: Math.round((this.requestTimes.reduce((a, b) => a + b, 0) / len) * 100) / 100,
      p50: Math.round(sorted[Math.floor(len * 0.5)] * 100) / 100,
      p95: Math.round(sorted[Math.floor(len * 0.95)] * 100) / 100,
      p99: Math.round(sorted[Math.floor(len * 0.99)] * 100) / 100
    };
  }

  private calculateRequestsPerSecond(): number {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    return elapsedSeconds > 0 ? Math.round((this.requestCount / elapsedSeconds) * 100) / 100 : 0;
  }

  private getActiveConnections(): number {
    // This would need to be implemented based on your web server
    // For now, return a placeholder
    return 0;
  }

  private checkThresholds(metrics: PerformanceMetrics): void {
    // Check CPU threshold
    if (metrics.cpu.usage > 80) {
      this.emit('threshold:cpu', {
        current: metrics.cpu.usage,
        threshold: 80,
        severity: metrics.cpu.usage > 90 ? 'critical' : 'warning'
      });
    }

    // Check memory threshold
    if (metrics.memory.percentage > 75) {
      this.emit('threshold:memory', {
        current: metrics.memory.percentage,
        threshold: 75,
        severity: metrics.memory.percentage > 90 ? 'critical' : 'warning'
      });
    }

    // Check response time threshold
    if (metrics.application.responseTime.p95 > 200) {
      this.emit('threshold:response-time', {
        current: metrics.application.responseTime.p95,
        threshold: 200,
        severity: metrics.application.responseTime.p95 > 1000 ? 'critical' : 'warning'
      });
    }

    // Check error rate threshold
    if (metrics.application.errorRate > 1) {
      this.emit('threshold:error-rate', {
        current: metrics.application.errorRate,
        threshold: 1,
        severity: metrics.application.errorRate > 5 ? 'critical' : 'warning'
      });
    }
  }

  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  getLatestMetrics(): PerformanceMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  getMetricsSummary(): any {
    if (this.metrics.length === 0) {
      return null;
    }

    const cpuUsages = this.metrics.map(m => m.cpu.usage);
    const memoryUsages = this.metrics.map(m => m.memory.percentage);
    const responseTimes = this.metrics.map(m => m.application.responseTime.avg);

    return {
      duration: (this.metrics[this.metrics.length - 1].timestamp - this.metrics[0].timestamp) / 1000,
      samples: this.metrics.length,
      cpu: {
        avg: Math.round((cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length) * 100) / 100,
        max: Math.max(...cpuUsages),
        min: Math.min(...cpuUsages)
      },
      memory: {
        avg: Math.round((memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length) * 100) / 100,
        max: Math.max(...memoryUsages),
        min: Math.min(...memoryUsages)
      },
      responseTime: {
        avg: Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 100) / 100,
        max: Math.max(...responseTimes),
        min: Math.min(...responseTimes)
      },
      requests: {
        total: this.requestCount,
        errors: this.errorCount,
        errorRate: Math.round((this.errorCount / this.requestCount) * 10000) / 100
      }
    };
  }

  reset(): void {
    this.metrics = [];
    this.requestTimes = [];
    this.errorCount = 0;
    this.requestCount = 0;
    this.startTime = Date.now();
  }
}

export default MetricsCollector;