/**
 * Resource Monitor Service
 * Monitors system resources: CPU, memory, disk I/O, network, and custom metrics
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { metricsCollector } from './MetricsCollector.js';
import { DEFAULT_MONITORING_CONFIG } from '../../../config/monitoring.js';

const execAsync = promisify(exec);

export interface ResourceMetrics {
  cpu: CPUMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  network: NetworkMetrics;
  processes: ProcessMetrics;
  timestamp: number;
}

export interface CPUMetrics {
  usage: number; // percentage
  loadAverage: number[];
  cores: number;
  speed: number; // GHz
  usageByCore: number[];
  processes: number;
  contextSwitches: number;
  interrupts: number;
}

export interface MemoryMetrics {
  total: number; // bytes
  used: number; // bytes
  free: number; // bytes
  available: number; // bytes
  usage: number; // percentage
  swap: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  heap: {
    used: number;
    total: number;
    external: number;
    arrayBuffers: number;
  };
  buffers: number;
  cached: number;
}

export interface DiskMetrics {
  total: number; // bytes
  used: number; // bytes
  free: number; // bytes;
  usage: number; // percentage
  readOps: number;
  writeOps: number;
  readBytes: number;
  writeBytes: number;
  readTime: number; // ms
  writeTime: number; // ms
  ioTime: number; // ms
  queueDepth: number;
}

export interface NetworkMetrics {
  interfaces: NetworkInterface[];
  connections: {
    total: number;
    active: number;
    listening: number;
    timeWait: number;
  };
  bandwidth: {
    inbound: number; // bytes/s
    outbound: number; // bytes/s
    total: number; // bytes/s
  };
  packets: {
    inbound: number;
    outbound: number;
    errors: {
      inbound: number;
      outbound: number;
    };
    dropped: {
      inbound: number;
      outbound: number;
    };
  };
  latency: {
    average: number; // ms
    min: number; // ms
    max: number; // ms
  };
}

export interface NetworkInterface {
  name: string;
  type: string;
  speed: number; // Mbps
  mtu: number;
  status: 'up' | 'down';
  addresses: Array<{
    family: 'IPv4' | 'IPv6';
    address: string;
    netmask: string;
    internal: boolean;
  }>;
  stats: {
    rxBytes: number;
    txBytes: number;
    rxPackets: number;
    txPackets: number;
    rxErrors: number;
    txErrors: number;
    rxDropped: number;
    txDropped: number;
  };
}

export interface ProcessMetrics {
  total: number;
  running: number;
  sleeping: number;
  blocked: number;
  zombies: number;
  stopped: number;
  threads: number;
  load: number; // average processes in run queue
}

export class ResourceMonitor extends EventEmitter {
  private config = DEFAULT_MONITORING_CONFIG;
  private monitoringInterval?: NodeJS.Timeout;
  private previousMetrics?: ResourceMetrics;
  private metricsHistory: ResourceMetrics[] = [];
  private maxHistorySize = 1000;

  constructor() {
    super();
    this.setupMonitoring();
  }

  /**
   * Configure resource monitoring
   */
  configure(config: Partial<typeof DEFAULT_MONITORING_CONFIG>): void {
    this.config = { ...this.config, ...config };
    if (this.config.enabled) {
      this.setupMonitoring();
    } else {
      this.stopMonitoring();
    }
  }

  /**
   * Get current resource metrics
   */
  async getCurrentMetrics(): Promise<ResourceMetrics> {
    const [cpu, memory, disk, network, processes] = await Promise.all([
      this.getCPUMetrics(),
      this.getMemoryMetrics(),
      this.getDiskMetrics(),
      this.getNetworkMetrics(),
      this.getProcessMetrics()
    ]);

    const metrics: ResourceMetrics = {
      cpu,
      memory,
      disk,
      network,
      processes,
      timestamp: Date.now()
    };

    return metrics;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit?: number): ResourceMetrics[] {
    if (limit) {
      return this.metricsHistory.slice(-limit);
    }
    return [...this.metricsHistory];
  }

  /**
   * Get resource usage trends
   */
  getTrends(hours: number = 1): {
    cpu: { trend: 'up' | 'down' | 'stable'; change: number };
    memory: { trend: 'up' | 'down' | 'stable'; change: number };
    disk: { trend: 'up' | 'down' | 'stable'; change: number };
    network: { trend: 'up' | 'down' | 'stable'; change: number };
  } {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const relevantMetrics = this.metricsHistory.filter(m => m.timestamp > cutoff);

    if (relevantMetrics.length < 2) {
      return {
        cpu: { trend: 'stable', change: 0 },
        memory: { trend: 'stable', change: 0 },
        disk: { trend: 'stable', change: 0 },
        network: { trend: 'stable', change: 0 }
      };
    }

    const oldest = relevantMetrics[0];
    const newest = relevantMetrics[relevantMetrics.length - 1];

    const calculateTrend = (oldValue: number, newValue: number) => {
      const change = ((newValue - oldValue) / oldValue) * 100;
      return {
        trend: Math.abs(change) > 5 ? (change > 0 ? 'up' : 'down') : 'stable',
        change
      };
    };

    return {
      cpu: calculateTrend(oldest.cpu.usage, newest.cpu.usage),
      memory: calculateTrend(oldest.memory.usage, newest.memory.usage),
      disk: calculateTrend(oldest.disk.usage, newest.disk.usage),
      network: calculateTrend(
        oldest.network.bandwidth.total,
        newest.network.bandwidth.total
      )
    };
  }

  /**
   * Check for resource alerts
   */
  checkAlerts(): Array<{
    type: string;
    severity: 'warning' | 'critical';
    metric: string;
    value: number;
    threshold: number;
    message: string;
  }> {
    if (!this.previousMetrics) return [];

    const alerts = [];
    const thresholds = this.config.thresholds;

    // CPU alerts
    if (this.previousMetrics.cpu.usage > thresholds.cpu.critical) {
      alerts.push({
        type: 'cpu',
        severity: 'critical' as const,
        metric: 'cpu.usage',
        value: this.previousMetrics.cpu.usage,
        threshold: thresholds.cpu.critical,
        message: `Critical CPU usage: ${this.previousMetrics.cpu.usage.toFixed(1)}%`
      });
    } else if (this.previousMetrics.cpu.usage > thresholds.cpu.warning) {
      alerts.push({
        type: 'cpu',
        severity: 'warning' as const,
        metric: 'cpu.usage',
        value: this.previousMetrics.cpu.usage,
        threshold: thresholds.cpu.warning,
        message: `High CPU usage: ${this.previousMetrics.cpu.usage.toFixed(1)}%`
      });
    }

    // Memory alerts
    if (this.previousMetrics.memory.usage > thresholds.memory.critical) {
      alerts.push({
        type: 'memory',
        severity: 'critical' as const,
        metric: 'memory.usage',
        value: this.previousMetrics.memory.usage,
        threshold: thresholds.memory.critical,
        message: `Critical memory usage: ${this.previousMetrics.memory.usage.toFixed(1)}%`
      });
    } else if (this.previousMetrics.memory.usage > thresholds.memory.warning) {
      alerts.push({
        type: 'memory',
        severity: 'warning' as const,
        metric: 'memory.usage',
        value: this.previousMetrics.memory.usage,
        threshold: thresholds.memory.warning,
        message: `High memory usage: ${this.previousMetrics.memory.usage.toFixed(1)}%`
      });
    }

    // Disk alerts
    if (this.previousMetrics.disk.usage > 90) {
      alerts.push({
        type: 'disk',
        severity: 'critical' as const,
        metric: 'disk.usage',
        value: this.previousMetrics.disk.usage,
        threshold: 90,
        message: `Critical disk usage: ${this.previousMetrics.disk.usage.toFixed(1)}%`
      });
    } else if (this.previousMetrics.disk.usage > 80) {
      alerts.push({
        type: 'disk',
        severity: 'warning' as const,
        metric: 'disk.usage',
        value: this.previousMetrics.disk.usage,
        threshold: 80,
        message: `High disk usage: ${this.previousMetrics.disk.usage.toFixed(1)}%`
      });
    }

    return alerts;
  }

  private async getCPUMetrics(): Promise<CPUMetrics> {
    const cpus = os.cpus();
    const loadAvg = os.loadavg();

    // Calculate CPU usage
    let totalIdle = 0;
    let totalTick = 0;
    let usageByCore: number[] = [];

    for (const cpu of cpus) {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      const usage = ((total - idle) / total) * 100;

      totalIdle += idle;
      totalTick += total;
      usageByCore.push(usage);
    }

    const overallUsage = ((totalTick - totalIdle) / totalTick) * 100;

    // Get process count (platform-specific)
    let processes = 0;
    try {
      if (process.platform === 'linux') {
        const { stdout } = await execAsync('ps -e | wc -l');
        processes = parseInt(stdout.trim(), 10);
      } else if (process.platform === 'darwin') {
        const { stdout } = await execAsync('ps -ax | wc -l');
        processes = parseInt(stdout.trim(), 10);
      }
    } catch (error) {
      // Fallback estimation
      processes = this.previousMetrics?.cpu.processes || 0;
    }

    return {
      usage: overallUsage,
      loadAverage: loadAvg,
      cores: cpus.length,
      speed: cpus[0]?.speed / 1000 || 0, // Convert MHz to GHz
      usageByCore,
      processes,
      contextSwitches: 0, // Would need system-specific implementation
      interrupts: 0 // Would need system-specific implementation
    };
  }

  private async getMemoryMetrics(): Promise<MemoryMetrics> {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usagePercent = (usedMem / totalMem) * 100;

    // Get swap information (Linux only)
    let swap = { total: 0, used: 0, free: 0, usage: 0 };
    try {
      if (process.platform === 'linux') {
        const { stdout } = await execAsync('free -b | grep Swap:');
        const parts = stdout.trim().split(/\s+/);
        if (parts.length >= 4) {
          swap = {
            total: parseInt(parts[1], 10),
            used: parseInt(parts[2], 10),
            free: parseInt(parts[3], 10),
            usage: parts[1] !== '0' ? (parseInt(parts[2], 10) / parseInt(parts[1], 10)) * 100 : 0
          };
        }
      }
    } catch (error) {
      // Swap not available
    }

    // Get process memory
    const processMem = process.memoryUsage();

    // Get system buffers and cached (Linux only)
    let buffers = 0;
    let cached = 0;
    try {
      if (process.platform === 'linux') {
        const { stdout } = await execAsync('free -b | grep Mem:');
        const parts = stdout.trim().split(/\s+/);
        if (parts.length >= 7) {
          buffers = parseInt(parts[5], 10);
          cached = parseInt(parts[6], 10);
        }
      }
    } catch (error) {
      // Not available
    }

    return {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      available: freeMem, // Simplified - should use available memory
      usage: usagePercent,
      swap,
      heap: {
        used: processMem.heapUsed,
        total: processMem.heapTotal,
        external: processMem.external,
        arrayBuffers: processMem.arrayBuffers || 0
      },
      buffers,
      cached
    };
  }

  private async getDiskMetrics(): Promise<DiskMetrics> {
    // Get disk usage for current directory
    let total = 0;
    let used = 0;
    let free = 0;

    try {
      const { stdout } = await execAsync('df -B1 . | tail -1');
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 4) {
        total = parseInt(parts[1], 10);
        used = parseInt(parts[2], 10);
        free = parseInt(parts[3], 10);
      }
    } catch (error) {
      // Fallback to previous values
      if (this.previousMetrics) {
        total = this.previousMetrics.disk.total;
        used = this.previousMetrics.disk.used;
        free = this.previousMetrics.disk.free;
      }
    }

    const usage = total > 0 ? (used / total) * 100 : 0;

    // Get I/O statistics (Linux only)
    let readOps = 0, writeOps = 0, readBytes = 0, writeBytes = 0;
    let readTime = 0, writeTime = 0, ioTime = 0, queueDepth = 0;

    try {
      if (process.platform === 'linux') {
        const { stdout } = await execAsync('cat /proc/diskstats | head -1');
        const parts = stdout.trim().split(/\s+/);
        if (parts.length >= 14) {
          readOps = parseInt(parts[3], 10);
          readBytes = parseInt(parts[5], 10) * 512; // sectors to bytes
          writeOps = parseInt(parts[7], 10);
          writeBytes = parseInt(parts[9], 10) * 512; // sectors to bytes
          readTime = parseInt(parts[6], 10); // milliseconds
          writeTime = parseInt(parts[10], 10); // milliseconds
          ioTime = parseInt(parts[12], 10); // milliseconds
        }
      }
    } catch (error) {
      // Use previous values as fallback
      if (this.previousMetrics) {
        const prev = this.previousMetrics.disk;
        readOps = prev.readOps;
        writeOps = prev.writeOps;
        readBytes = prev.readBytes;
        writeBytes = prev.writeBytes;
        readTime = prev.readTime;
        writeTime = prev.writeTime;
        ioTime = prev.ioTime;
      }
    }

    return {
      total,
      used,
      free,
      usage,
      readOps,
      writeOps,
      readBytes,
      writeBytes,
      readTime,
      writeTime,
      ioTime,
      queueDepth
    };
  }

  private async getNetworkMetrics(): Promise<NetworkMetrics> {
    const networkInterfaces = os.networkInterfaces();
    const interfaces: NetworkInterface[] = [];

    for (const [name, addrs] of Object.entries(networkInterfaces)) {
      if (addrs) {
        // Get first address for interface info
        const firstAddr = addrs[0];
        if (firstAddr) {
          interfaces.push({
            name,
            type: firstAddr.family === 'IPv4' ? 'ipv4' : 'ipv6',
            speed: 1000, // Default - would need system-specific implementation
            mtu: 1500, // Default
            status: 'up', // Simplified
            addresses: addrs.map(addr => ({
              family: addr.family as 'IPv4' | 'IPv6',
              address: addr.address,
              netmask: addr.netmask,
              internal: addr.internal
            })),
            stats: {
              rxBytes: 0, // Would need system-specific implementation
              txBytes: 0,
              rxPackets: 0,
              txPackets: 0,
              rxErrors: 0,
              txErrors: 0,
              rxDropped: 0,
              txDropped: 0
            }
          });
        }
      }
    }

    // Get connection count (platform-specific)
    let connections = { total: 0, active: 0, listening: 0, timeWait: 0 };
    try {
      if (process.platform === 'linux') {
        const { stdout } = await execAsync('ss -s | grep TCP');
        const match = stdout.match(/(\d+) ESTAB, (\d+) LISTEN, (\d+) TIME-WAIT/);
        if (match) {
          connections = {
            total: parseInt(match[1], 10) + parseInt(match[2], 10) + parseInt(match[3], 10),
            active: parseInt(match[1], 10),
            listening: parseInt(match[2], 10),
            timeWait: parseInt(match[3], 10)
          };
        }
      }
    } catch (error) {
      // Use previous values
      connections = this.previousMetrics?.network.connections || connections;
    }

    // Calculate bandwidth (simplified - would need actual interface stats)
    const bandwidth = {
      inbound: 0,
      outbound: 0,
      total: 0
    };

    // Get packet statistics (simplified)
    const packets = {
      inbound: 0,
      outbound: 0,
      errors: { inbound: 0, outbound: 0 },
      dropped: { inbound: 0, outbound: 0 }
    };

    // Calculate latency (simplified - would need actual network testing)
    const latency = {
      average: 0,
      min: 0,
      max: 0
    };

    return {
      interfaces,
      connections,
      bandwidth,
      packets,
      latency
    };
  }

  private async getProcessMetrics(): Promise<ProcessMetrics> {
    // Get process information (platform-specific)
    let processes = {
      total: 0,
      running: 0,
      sleeping: 0,
      blocked: 0,
      zombies: 0,
      stopped: 0,
      threads: 0,
      load: 0
    };

    try {
      if (process.platform === 'linux') {
        const { stdout } = await execAsync('ps aux --no-headers | wc -l');
        processes.total = parseInt(stdout.trim(), 10);

        // Get thread count
        const { stdout: threadOut } = await execAsync('ps -eLf | wc -l');
        processes.threads = parseInt(threadOut.trim(), 10) - 1; // Subtract header

        // Get load average (1 min average as process load indicator)
        processes.load = os.loadavg()[0];
      }
    } catch (error) {
      // Use previous values
      processes = this.previousMetrics?.processes || processes;
    }

    return processes;
  }

  private setupMonitoring(): void {
    if (!this.config.enabled) return;

    this.monitoringInterval = setInterval(async () => {
      try {
        const metrics = await this.getCurrentMetrics();
        this.previousMetrics = metrics;

        // Record metrics in the metrics collector
        this.recordMetrics(metrics);

        // Add to history
        this.metricsHistory.push(metrics);
        if (this.metricsHistory.length > this.maxHistorySize) {
          this.metricsHistory.shift();
        }

        // Check for alerts
        const alerts = this.checkAlerts();
        if (alerts.length > 0) {
          this.emit('alerts', alerts);
        }

        this.emit('metrics', metrics);
      } catch (error) {
        console.error('Error collecting resource metrics:', error);
      }
    }, this.config.interval);
  }

  private recordMetrics(metrics: ResourceMetrics): void {
    // CPU metrics
    metricsCollector.setGauge('resource.cpu.usage', metrics.cpu.usage, 'percent');
    metricsCollector.setGauge('resource.cpu.load_1m', metrics.cpu.loadAverage[0], 'load');
    metricsCollector.setGauge('resource.cpu.processes', metrics.cpu.processes, 'count');

    // Memory metrics
    metricsCollector.setGauge('resource.memory.usage', metrics.memory.usage, 'percent');
    metricsCollector.setGauge('resource.memory.used', metrics.memory.used, 'bytes');
    metricsCollector.setGauge('resource.memory.free', metrics.memory.free, 'bytes');
    metricsCollector.setGauge('resource.memory.swap.usage', metrics.memory.swap.usage, 'percent');

    // Disk metrics
    metricsCollector.setGauge('resource.disk.usage', metrics.disk.usage, 'percent');
    metricsCollector.setGauge('resource.disk.read_bytes', metrics.disk.readBytes, 'bytes');
    metricsCollector.setGauge('resource.disk.write_bytes', metrics.disk.writeBytes, 'bytes');
    metricsCollector.setGauge('resource.disk.io_time', metrics.disk.ioTime, 'ms');

    // Network metrics
    metricsCollector.setGauge('resource.network.bandwidth.total', metrics.network.bandwidth.total, 'bytes/sec');
    metricsCollector.setGauge('resource.network.connections.total', metrics.network.connections.total, 'count');

    // Process metrics
    metricsCollector.setGauge('resource.processes.total', metrics.processes.total, 'count');
    metricsCollector.setGauge('resource.processes.threads', metrics.processes.threads, 'count');
    metricsCollector.setGauge('resource.processes.load', metrics.processes.load, 'load');
  }

  private stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.stopMonitoring();
    this.removeAllListeners();
  }
}

// Singleton instance
export const resourceMonitor = new ResourceMonitor();