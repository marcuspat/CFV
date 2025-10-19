import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SystemMonitor {
  constructor() {
    this.metrics = {
      cpu: [],
      memory: [],
      disk: [],
      network: [],
      processes: []
    };
    this.isMonitoring = false;
    this.intervalId = null;
  }

  async startMonitoring(intervalMs = 1000) {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    console.log(`Starting system monitoring with ${intervalMs}ms interval`);

    this.intervalId = setInterval(async () => {
      await this.collectMetrics();
    }, intervalMs);
  }

  async collectMetrics() {
    const timestamp = Date.now();

    // CPU Metrics
    const cpuUsage = process.cpuUsage();
    this.metrics.cpu.push({
      timestamp,
      user: cpuUsage.user,
      system: cpuUsage.system,
      percentage: process.cpuUsage().user / 1000000 // Convert to percentage
    });

    // Memory Metrics
    const memUsage = process.memoryUsage();
    this.metrics.memory.push({
      timestamp,
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers
    });

    // Process Metrics
    this.metrics.processes.push({
      timestamp,
      pid: process.pid,
      uptime: process.uptime(),
      activeHandles: process._getActiveHandles().length,
      activeRequests: process._getActiveRequests().length
    });
  }

  stopMonitoring() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('System monitoring stopped');
  }

  getMetrics() {
    return this.metrics;
  }

  clearMetrics() {
    this.metrics = {
      cpu: [],
      memory: [],
      disk: [],
      network: [],
      processes: []
    };
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: this.calculateSummary(),
      detailed: this.metrics
    };

    const reportPath = path.join(__dirname, '../reports/system-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    return report;
  }

  calculateSummary() {
    if (this.metrics.memory.length === 0) return {};

    const memoryData = this.metrics.memory;
    const cpuData = this.metrics.cpu;

    return {
      memory: {
        peakRSS: Math.max(...memoryData.map(m => m.rss)),
        avgHeapUsed: memoryData.reduce((sum, m) => sum + m.heapUsed, 0) / memoryData.length,
        peakHeapUsed: Math.max(...memoryData.map(m => m.heapUsed)),
        memoryGrowth: memoryData.length > 1 ?
          memoryData[memoryData.length - 1].heapUsed - memoryData[0].heapUsed : 0
      },
      cpu: {
        avgUsage: cpuData.reduce((sum, c) => sum + c.percentage, 0) / cpuData.length,
        peakUsage: Math.max(...cpuData.map(c => c.percentage))
      },
      process: {
        uptime: process.uptime(),
        pid: process.pid
      }
    };
  }
}

export default SystemMonitor;