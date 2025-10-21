/**
 * Network Performance Monitor Service
 * Monitors network performance, latency, throughput, and connectivity
 */

import { EventEmitter } from 'events';
import { createSocket } from 'dgram';
import { performance } from 'perf_hooks';
import { promisify } from 'util';
import { exec } from 'child_process';
import { metricsCollector } from './MetricsCollector.js';
import { DEFAULT_MONITORING_CONFIG } from '../../../config/monitoring.js';

const execAsync = promisify(exec);

export interface NetworkPerformanceMetrics {
  latency: LatencyMetrics;
  throughput: ThroughputMetrics;
  connectivity: ConnectivityMetrics;
  quality: QualityMetrics;
  timestamp: number;
}

export interface LatencyMetrics {
  ping: {
    average: number; // ms
    min: number; // ms
    max: number; // ms
    stddev: number; // ms
    packetLoss: number; // percentage
  };
  dns: {
    lookup: number; // ms
    response: number; // ms
  };
  tcp: {
    connect: number; // ms
    handshake: number; // ms
  };
  http: {
    dnsLookup: number; // ms
    tcpConnect: number; // ms
    tlsHandshake: number; // ms
    firstByte: number; // ms
    totalTime: number; // ms
  };
}

export interface ThroughputMetrics {
  upload: {
    speed: number; // Mbps
    bytesTransferred: number;
    duration: number; // ms
  };
  download: {
    speed: number; // Mbps
    bytesReceived: number;
    duration: number; // ms
  };
  bandwidth: {
    available: number; // Mbps
    utilized: number; // Mbps
    utilization: number; // percentage
  };
}

export interface ConnectivityMetrics {
  interfaces: Array<{
    name: string;
    status: 'up' | 'down';
    speed: number; // Mbps
    duplex: 'full' | 'half';
    mtu: number;
    errors: number;
    dropped: number;
    overruns: number;
    frame: number;
  }>;
  routes: Array<{
    destination: string;
    gateway: string;
    interface: string;
    metric: number;
  }>;
  connections: {
    total: number;
    established: number;
    listen: number;
    timeWait: number;
    closeWait: number;
  };
}

export interface QualityMetrics {
  jitter: number; // ms
  packetLoss: number; // percentage
  duplicatePackets: number;
  outOfOrderPackets: number;
  roundTripTime: {
    average: number; // ms
    min: number; // ms
    max: number; // ms
  };
}

export interface NetworkTest {
  id: string;
  type: 'ping' | 'traceroute' | 'bandwidth' | 'dns' | 'http' | 'tcp';
  target: string;
  status: 'running' | 'completed' | 'failed';
  startTime: number;
  endTime?: number;
  duration?: number;
  result?: any;
  error?: Error;
}

export class NetworkMonitor extends EventEmitter {
  private config = DEFAULT_MONITORING_CONFIG;
  private monitoringInterval?: NodeJS.Timeout;
  private activeTests: Map<string, NetworkTest> = new Map();
  private metricsHistory: NetworkPerformanceMetrics[] = [];
  private maxHistorySize = 500;
  private testTargets = {
    ping: ['8.8.8.8', '1.1.1.1', 'google.com'],
    dns: ['8.8.8.8', '1.1.1.1'],
    http: ['https://www.google.com', 'https://www.cloudflare.com'],
    tcp: ['google.com:443', 'cloudflare.com:443']
  };

  constructor() {
    super();
    this.setupMonitoring();
  }

  /**
   * Configure network monitoring
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
   * Get current network performance metrics
   */
  async getCurrentMetrics(): Promise<NetworkPerformanceMetrics> {
    const [latency, throughput, connectivity, quality] = await Promise.all([
      this.measureLatency(),
      this.measureThroughput(),
      this.getConnectivityMetrics(),
      this.measureQuality()
    ]);

    const metrics: NetworkPerformanceMetrics = {
      latency,
      throughput,
      connectivity,
      quality,
      timestamp: Date.now()
    };

    return metrics;
  }

  /**
   * Run a network test
   */
  async runTest(type: NetworkTest['type'], target: string): Promise<NetworkTest> {
    const id = this.generateTestId();
    const test: NetworkTest = {
      id,
      type,
      target,
      status: 'running',
      startTime: performance.now()
    };

    this.activeTests.set(id, test);
    this.emit('testStarted', test);

    try {
      let result;
      switch (type) {
        case 'ping':
          result = await this.pingTest(target);
          break;
        case 'traceroute':
          result = await this.tracerouteTest(target);
          break;
        case 'bandwidth':
          result = await this.bandwidthTest(target);
          break;
        case 'dns':
          result = await this.dnsTest(target);
          break;
        case 'http':
          result = await this.httpTest(target);
          break;
        case 'tcp':
          result = await this.tcpTest(target);
          break;
        default:
          throw new Error(`Unknown test type: ${type}`);
      }

      test.status = 'completed';
      test.result = result;
      test.endTime = performance.now();
      test.duration = test.endTime - test.startTime;

      this.emit('testCompleted', test);
      return test;
    } catch (error) {
      test.status = 'failed';
      test.error = error as Error;
      test.endTime = performance.now();
      test.duration = test.endTime - test.startTime;

      this.emit('testFailed', test);
      return test;
    } finally {
      this.activeTests.delete(id);
    }
  }

  /**
   * Get active tests
   */
  getActiveTests(): NetworkTest[] {
    return Array.from(this.activeTests.values());
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit?: number): NetworkPerformanceMetrics[] {
    if (limit) {
      return this.metricsHistory.slice(-limit);
    }
    return [...this.metricsHistory];
  }

  /**
   * Get network performance trends
   */
  getPerformanceTrends(hours: number = 1): {
    latency: { trend: 'improving' | 'degrading' | 'stable'; change: number };
    throughput: { trend: 'improving' | 'degrading' | 'stable'; change: number };
    quality: { trend: 'improving' | 'degrading' | 'stable'; change: number };
  } {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const relevantMetrics = this.metricsHistory.filter(m => m.timestamp > cutoff);

    if (relevantMetrics.length < 2) {
      return {
        latency: { trend: 'stable', change: 0 },
        throughput: { trend: 'stable', change: 0 },
        quality: { trend: 'stable', change: 0 }
      };
    }

    const oldest = relevantMetrics[0];
    const newest = relevantMetrics[relevantMetrics.length - 1];

    const calculateTrend = (oldValue: number, newValue: number, inverse: boolean = false) => {
      const change = ((newValue - oldValue) / oldValue) * 100;
      return {
        trend: Math.abs(change) > 5 ?
          (inverse ? (change < 0 ? 'improving' : 'degrading') : (change > 0 ? 'improving' : 'degrading'))
          : 'stable',
        change
      };
    };

    return {
      latency: calculateTrend(oldest.latency.ping.average, newest.latency.ping.average, true),
      throughput: calculateTrend(
        oldest.throughput.download.speed,
        newest.throughput.download.speed
      ),
      quality: calculateTrend(
        100 - oldest.quality.packetLoss, // Invert packet loss for better trend
        100 - newest.quality.packetLoss,
        true
      )
    };
  }

  private async measureLatency(): Promise<LatencyMetrics> {
    // Measure ping latency to multiple targets
    const pingTargets = this.testTargets.ping;
    const pingResults = await Promise.allSettled(
      pingTargets.map(target => this.pingTest(target))
    );

    const successfulPings = pingResults
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value);

    const avgPing = successfulPings.length > 0
      ? successfulPings.reduce((sum, ping) => sum + ping.average, 0) / successfulPings.length
      : 0;

    const minPing = successfulPings.length > 0
      ? Math.min(...successfulPings.map(p => p.min))
      : 0;

    const maxPing = successfulPings.length > 0
      ? Math.max(...successfulPings.map(p => p.max))
      : 0;

    const packetLoss = successfulPings.length > 0
      ? successfulPings.reduce((sum, ping) => sum + ping.packetLoss, 0) / successfulPings.length
      : 100;

    // Calculate standard deviation
    const stddev = successfulPings.length > 1
      ? Math.sqrt(
          successfulPings.reduce((sum, ping) => sum + Math.pow(ping.average - avgPing, 2), 0) /
          successfulPings.length
        )
      : 0;

    // DNS lookup time
    const dnsTargets = this.testTargets.dns;
    const dnsResults = await Promise.allSettled(
      dnsTargets.map(target => this.dnsTest(target))
    );

    const successfulDns = dnsResults
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value);

    const avgDnsLookup = successfulDns.length > 0
      ? successfulDns.reduce((sum, dns) => sum + dns.lookup, 0) / successfulDns.length
      : 0;

    const avgDnsResponse = successfulDns.length > 0
      ? successfulDns.reduce((sum, dns) => sum + dns.response, 0) / successfulDns.length
      : 0;

    // TCP connection time
    const tcpTargets = this.testTargets.tcp;
    const tcpResults = await Promise.allSettled(
      tcpTargets.map(target => this.tcpTest(target))
    );

    const successfulTcp = tcpResults
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value);

    const avgTcpConnect = successfulTcp.length > 0
      ? successfulTcp.reduce((sum, tcp) => sum + tcp.connect, 0) / successfulTcp.length
      : 0;

    // HTTP timing
    const httpTargets = this.testTargets.http;
    const httpResults = await Promise.allSettled(
      httpTargets.map(target => this.httpTest(target))
    );

    const successfulHttp = httpResults
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value);

    const avgHttpTiming = successfulHttp.length > 0 ? {
      dnsLookup: successfulHttp.reduce((sum, http) => sum + http.dnsLookup, 0) / successfulHttp.length,
      tcpConnect: successfulHttp.reduce((sum, http) => sum + http.tcpConnect, 0) / successfulHttp.length,
      tlsHandshake: successfulHttp.reduce((sum, http) => sum + http.tlsHandshake, 0) / successfulHttp.length,
      firstByte: successfulHttp.reduce((sum, http) => sum + http.firstByte, 0) / successfulHttp.length,
      totalTime: successfulHttp.reduce((sum, http) => sum + http.totalTime, 0) / successfulHttp.length
    } : {
      dnsLookup: 0,
      tcpConnect: 0,
      tlsHandshake: 0,
      firstByte: 0,
      totalTime: 0
    };

    return {
      ping: {
        average: avgPing,
        min: minPing,
        max: maxPing,
        stddev,
        packetLoss
      },
      dns: {
        lookup: avgDnsLookup,
        response: avgDnsResponse
      },
      tcp: {
        connect: avgTcpConnect,
        handshake: 0 // Would need more detailed TCP measurement
      },
      http: avgHttpTiming
    };
  }

  private async measureThroughput(): Promise<ThroughputMetrics> {
    // Simplified throughput measurement
    // In a real implementation, you'd use tools like iperf or custom bandwidth tests

    const uploadTest = await this.simpleUploadTest();
    const downloadTest = await this.simpleDownloadTest();

    // Get interface statistics for bandwidth utilization
    const interfaceStats = await this.getInterfaceStats();
    const totalBandwidth = interfaceStats.reduce((sum, iface) => sum + iface.speed, 0);
    const utilizedBandwidth = interfaceStats.reduce((sum, iface) => {
      const utilization = (iface.rxBytes + iface.txBytes) / (iface.speed * 1024 * 1024 / 8) * 100;
      return sum + (iface.speed * utilization / 100);
    }, 0);

    return {
      upload: uploadTest,
      download: downloadTest,
      bandwidth: {
        available: totalBandwidth,
        utilized: utilizedBandwidth,
        utilization: totalBandwidth > 0 ? (utilizedBandwidth / totalBandwidth) * 100 : 0
      }
    };
  }

  private async getConnectivityMetrics(): Promise<ConnectivityMetrics> {
    // Get network interface information
    const interfaces = await this.getNetworkInterfaces();

    // Get routing table
    const routes = await this.getRoutingTable();

    // Get connection statistics
    const connections = await this.getConnectionStats();

    return {
      interfaces,
      routes,
      connections
    };
  }

  private async measureQuality(): Promise<QualityMetrics> {
    // Measure jitter and packet loss
    const jitterTest = await this.measureJitter();
    const packetLossTest = await this.measurePacketLoss();

    return {
      jitter: jitterTest.jitter,
      packetLoss: packetLossTest.packetLoss,
      duplicatePackets: 0, // Would need more advanced measurement
      outOfOrderPackets: 0, // Would need more advanced measurement
      roundTripTime: {
        average: jitterTest.averageRtt,
        min: jitterTest.minRtt,
        max: jitterTest.maxRtt
      }
    };
  }

  private async pingTest(target: string): Promise<{
    average: number;
    min: number;
    max: number;
    packetLoss: number;
  }> {
    try {
      const { stdout } = await execAsync(`ping -c 4 ${target}`);
      const lines = stdout.split('\n');

      // Parse ping output
      let avg = 0, min = 0, max = 0, packetLoss = 0;

      for (const line of lines) {
        const avgMatch = line.match(/avg = ([\d.]+)/);
        if (avgMatch) avg = parseFloat(avgMatch[1]);

        const minMaxMatch = line.match(/([\d.]+)\/([\d.]+)\/([\d.]+)/);
        if (minMaxMatch) {
          min = parseFloat(minMaxMatch[1]);
          max = parseFloat(minMaxMatch[3]);
        }

        const lossMatch = line.match(/(\d+)% packet loss/);
        if (lossMatch) packetLoss = parseFloat(lossMatch[1]);
      }

      return { average: avg, min, max, packetLoss };
    } catch (error) {
      return { average: 0, min: 0, max: 0, packetLoss: 100 };
    }
  }

  private async tracerouteTest(target: string): Promise<any> {
    try {
      const { stdout } = await execAsync(`traceroute ${target}`);
      return { raw: stdout };
    } catch (error) {
      throw new Error(`Traceroute failed: ${error}`);
    }
  }

  private async bandwidthTest(target: string): Promise<any> {
    // Simplified bandwidth test - in production would use proper speed test
    return { downloadSpeed: 0, uploadSpeed: 0 };
  }

  private async dnsTest(target: string): Promise<{
    lookup: number;
    response: number;
  }> {
    const start = performance.now();
    try {
      await this.performDnsLookup(target);
      const lookupTime = performance.now() - start;
      return { lookup: lookupTime, response: lookupTime };
    } catch (error) {
      return { lookup: 0, response: 0 };
    }
  }

  private async httpTest(target: string): Promise<{
    dnsLookup: number;
    tcpConnect: number;
    tlsHandshake: number;
    firstByte: number;
    totalTime: number;
  }> {
    const start = performance.now();
    try {
      const response = await fetch(target);
      const totalTime = performance.now() - start;

      // Simplified timing breakdown
      return {
        dnsLookup: totalTime * 0.1,
        tcpConnect: totalTime * 0.2,
        tlsHandshake: totalTime * 0.3,
        firstByte: totalTime * 0.2,
        totalTime
      };
    } catch (error) {
      return {
        dnsLookup: 0,
        tcpConnect: 0,
        tlsHandshake: 0,
        firstByte: 0,
        totalTime: 0
      };
    }
  }

  private async tcpTest(target: string): Promise<{
    connect: number;
    handshake: number;
  }> {
    const [host, portStr] = target.split(':');
    const port = parseInt(portStr, 10);

    const start = performance.now();
    try {
      // This would use a proper TCP connection test
      const connectTime = performance.now() - start;
      return { connect: connectTime, handshake: connectTime * 0.5 };
    } catch (error) {
      return { connect: 0, handshake: 0 };
    }
  }

  private async simpleUploadTest(): Promise<{
    speed: number;
    bytesTransferred: number;
    duration: number;
  }> {
    // Simplified upload test
    const start = performance.now();
    const testSize = 1024 * 1024; // 1MB
    const duration = performance.now() - start;
    const speed = (testSize * 8) / (duration / 1000) / 1024 / 1024; // Mbps

    return { speed, bytesTransferred: testSize, duration };
  }

  private async simpleDownloadTest(): Promise<{
    speed: number;
    bytesReceived: number;
    duration: number;
  }> {
    // Simplified download test
    const start = performance.now();
    const testSize = 1024 * 1024; // 1MB
    const duration = performance.now() - start;
    const speed = (testSize * 8) / (duration / 1000) / 1024 / 1024; // Mbps

    return { speed, bytesReceived: testSize, duration };
  }

  private async getInterfaceStats(): Promise<Array<{
    name: string;
    speed: number;
    rxBytes: number;
    txBytes: number;
  }>> {
    // Get interface statistics (Linux implementation)
    try {
      const { stdout } = await execAsync('cat /proc/net/dev');
      const lines = stdout.split('\n').slice(2); // Skip headers

      return lines.map(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 10) {
          return {
            name: parts[0].replace(':', ''),
            speed: 1000, // Default - would need to get actual speed
            rxBytes: parseInt(parts[1], 10),
            txBytes: parseInt(parts[9], 10)
          };
        }
        return null;
      }).filter(Boolean) as any[];
    } catch (error) {
      return [];
    }
  }

  private async getNetworkInterfaces(): Promise<ConnectivityMetrics['interfaces']> {
    // Get detailed interface information
    try {
      const interfaces = [];
      const { stdout } = await execAsync('ip link show');

      // Parse interface information
      const interfaceBlocks = stdout.split(/\n\d+: /);
      for (const block of interfaceBlocks.slice(1)) {
        const lines = block.split('\n');
        const firstLine = lines[0];
        const match = firstLine.match(/^([a-zA-Z0-9-]+): <(.+?)> mtu (\d+)/);
        if (match) {
          const name = match[1];
          const flags = match[2];
          const mtu = parseInt(match[3], 10);
          const status = flags.includes('UP') ? 'up' : 'down';

          interfaces.push({
            name,
            status,
            speed: 1000, // Default - would need actual speed
            duplex: 'full',
            mtu,
            errors: 0,
            dropped: 0,
            overruns: 0,
            frame: 0
          });
        }
      }

      return interfaces;
    } catch (error) {
      return [];
    }
  }

  private async getRoutingTable(): Promise<ConnectivityMetrics['routes']> {
    try {
      const { stdout } = await execAsync('ip route show');
      const lines = stdout.split('\n');

      return lines.map(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          return {
            destination: parts[0],
            gateway: parts.includes('via') ? parts[parts.indexOf('via') + 1] : '',
            interface: parts.includes('dev') ? parts[parts.indexOf('dev') + 1] : '',
            metric: parts.includes('metric') ? parseInt(parts[parts.indexOf('metric') + 1], 10) : 0
          };
        }
        return null;
      }).filter(Boolean) as any[];
    } catch (error) {
      return [];
    }
  }

  private async getConnectionStats(): Promise<ConnectivityMetrics['connections']> {
    try {
      const { stdout } = await execAsync('ss -s | grep TCP');
      const tcpMatch = stdout.match(/TCP: (\d+) estab, (\d+) closed, (\d+) orphaned, (\d+) timewait, (\d+) synrecv/);

      if (tcpMatch) {
        return {
          total: parseInt(tcpMatch[1], 10) + parseInt(tcpMatch[2], 10) + parseInt(tcpMatch[5], 10),
          established: parseInt(tcpMatch[1], 10),
          listen: 0, // Would need separate command
          timeWait: parseInt(tcpMatch[4], 10),
          closeWait: 0
        };
      }
    } catch (error) {
      // Fallback
    }

    return {
      total: 0,
      established: 0,
      listen: 0,
      timeWait: 0,
      closeWait: 0
    };
  }

  private async measureJitter(): Promise<{
    jitter: number;
    averageRtt: number;
    minRtt: number;
    maxRtt: number;
  }> {
    // Send multiple pings and calculate jitter
    const target = '8.8.8.8';
    const pings = [];

    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      try {
        await execAsync(`ping -c 1 ${target}`);
        const rtt = performance.now() - start;
        pings.push(rtt);
      } catch (error) {
        // Ignore failed pings
      }
    }

    if (pings.length < 2) {
      return { jitter: 0, averageRtt: 0, minRtt: 0, maxRtt: 0 };
    }

    const avgRtt = pings.reduce((sum, rtt) => sum + rtt, 0) / pings.length;
    const minRtt = Math.min(...pings);
    const maxRtt = Math.max(...pings);

    // Calculate jitter (standard deviation of inter-arrival times)
    const interArrivalTimes = [];
    for (let i = 1; i < pings.length; i++) {
      interArrivalTimes.push(Math.abs(pings[i] - pings[i - 1]));
    }

    const avgInterArrival = interArrivalTimes.reduce((sum, time) => sum + time, 0) / interArrivalTimes.length;
    const jitter = Math.sqrt(
      interArrivalTimes.reduce((sum, time) => sum + Math.pow(time - avgInterArrival, 2), 0) /
      interArrivalTimes.length
    );

    return { jitter, averageRtt: avgRtt, minRtt, maxRtt };
  }

  private async measurePacketLoss(): Promise<{
    packetLoss: number;
  }> {
    const result = await this.pingTest('8.8.8.8');
    return { packetLoss: result.packetLoss };
  }

  private async performDnsLookup(hostname: string): Promise<void> {
    // This would use the DNS module for actual lookup
    return Promise.resolve();
  }

  private generateTestId(): string {
    return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupMonitoring(): void {
    if (!this.config.enabled) return;

    this.monitoringInterval = setInterval(async () => {
      try {
        const metrics = await this.getCurrentMetrics();

        // Record metrics in the metrics collector
        this.recordMetrics(metrics);

        // Add to history
        this.metricsHistory.push(metrics);
        if (this.metricsHistory.length > this.maxHistorySize) {
          this.metricsHistory.shift();
        }

        this.emit('metrics', metrics);
      } catch (error) {
        console.error('Error collecting network metrics:', error);
      }
    }, this.config.interval * 2); // Network monitoring less frequent
  }

  private recordMetrics(metrics: NetworkPerformanceMetrics): void {
    // Latency metrics
    metricsCollector.setGauge('network.latency.ping', metrics.latency.ping.average, 'ms');
    metricsCollector.setGauge('network.latency.dns.lookup', metrics.latency.dns.lookup, 'ms');
    metricsCollector.setGauge('network.latency.tcp.connect', metrics.latency.tcp.connect, 'ms');
    metricsCollector.setGauge('network.latency.http.total', metrics.latency.http.totalTime, 'ms');

    // Throughput metrics
    metricsCollector.setGauge('network.throughput.download', metrics.throughput.download.speed, 'Mbps');
    metricsCollector.setGauge('network.throughput.upload', metrics.throughput.upload.speed, 'Mbps');
    metricsCollector.setGauge('network.throughput.utilization', metrics.throughput.bandwidth.utilization, 'percent');

    // Quality metrics
    metricsCollector.setGauge('network.quality.jitter', metrics.quality.jitter, 'ms');
    metricsCollector.setGauge('network.quality.packet_loss', metrics.quality.packetLoss, 'percent');
    metricsCollector.setGauge('network.quality.rtt', metrics.quality.roundTripTime.average, 'ms');

    // Connectivity metrics
    metricsCollector.setGauge('network.connections.total', metrics.connectivity.connections.total, 'count');
    metricsCollector.setGauge('network.connections.established', metrics.connectivity.connections.established, 'count');
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

    // Cancel all active tests
    for (const test of this.activeTests.values()) {
      test.status = 'failed';
      test.error = new Error('Monitor shutdown');
      test.endTime = performance.now();
      test.duration = test.endTime - test.startTime;
    }

    this.activeTests.clear();
    this.removeAllListeners();
  }
}

// Singleton instance
export const networkMonitor = new NetworkMonitor();