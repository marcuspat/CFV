/**
 * Comprehensive stress testing suite
 * Tests system behavior under extreme load conditions
 */

import axios, { AxiosResponse } from 'axios';
import { WebSocket } from 'ws';
import { performance } from 'perf_hooks';
import MetricsCollector from '../utils/MetricsCollector';

export interface StressTestConfig {
  baseUrl: string;
  wsUrl: string;
  maxConcurrentConnections: number;
  testDuration: number; // in seconds
  rampUpTime: number; // in seconds
  coolDownTime: number; // in seconds
  auth: {
    username: string;
    password: string;
  };
}

export interface StressTestResult {
  testName: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerSecond: number;
  errors: string[];
  throughput: number;
  memoryUsage: any;
  cpuUsage: any;
}

export interface ConnectionMetrics {
  id: string;
  startTime: number;
  endTime?: number;
  requests: number;
  errors: number;
  responseTimes: number[];
  active: boolean;
}

export class StressTestSuite {
  private metricsCollector: MetricsCollector;
  private connections: Map<string, ConnectionMetrics> = new Map();
  private websockets: WebSocket[] = [];
  private isRunning = false;
  private abortController?: AbortController;

  constructor(private config: StressTestConfig) {
    this.metricsCollector = new MetricsCollector(1000);
  }

  async runComprehensiveStressTests(): Promise<StressTestResult[]> {
    console.log('Starting comprehensive stress testing suite...');

    const tests = [
      this.testHTTPConnectionStress.bind(this),
      this.testWebSocketStress.bind(this),
      this.testMemoryPressure.bind(this),
      this.testCPUIntensiveOperations.bind(this),
      this.testDatabaseConnectionExhaustion.bind(this),
      this.testLargeDataTransfer.bind(this),
      this.testRapidConnectionCycling.bind(this),
      this.testSustainedLoad.bind(this),
      this.testErrorRecovery.bind(this),
      this.testResourceExhaustion.bind(this)
    ];

    const results: StressTestResult[] = [];

    for (const test of tests) {
      try {
        console.log(`Running stress test: ${test.name}`);
        const result = await test();
        results.push(result);

        // Cool down period between tests
        console.log('Test completed, starting cool down period...');
        await this.sleep(this.config.coolDownTime * 1000);
      } catch (error) {
        console.error(`Stress test ${test.name} failed:`, error);
      }
    }

    console.log('Comprehensive stress testing suite completed');
    return results;
  }

  private async testHTTPConnectionStress(): Promise<StressTestResult> {
    const testName = 'HTTP Connection Stress';
    console.log(`Starting ${testName} test...`);

    const startTime = new Date();
    this.isRunning = true;
    this.abortController = new AbortController();

    // Start metrics collection
    this.metricsCollector.start();

    const connections = Math.min(this.config.maxConcurrentConnections, 500);
    const promises: Promise<void>[] = [];

    // Ramp up connections
    for (let i = 0; i < connections; i++) {
      const delay = (i / connections) * this.config.rampUpTime * 1000;
      promises.push(this.createHTTPConnection(i, delay));
    }

    // Wait for ramp up
    await this.sleep(this.config.rampUpTime * 1000);

    // Sustain load
    console.log('Sustaining maximum load...');
    await this.sleep(this.config.testDuration * 1000);

    // Stop test
    this.isRunning = false;
    this.abortController.abort();

    // Wait for all connections to complete
    await Promise.allSettled(promises);

    const endTime = new Date();
    const metrics = this.metricsCollector.stop();

    return this.generateTestResult(testName, startTime, endTime, metrics);
  }

  private async createHTTPConnection(connectionId: number, rampDelay: number): Promise<void> {
    await this.sleep(rampDelay);

    const connectionMetrics: ConnectionMetrics = {
      id: `http-${connectionId}`,
      startTime: performance.now(),
      requests: 0,
      errors: 0,
      responseTimes: [],
      active: true
    };

    this.connections.set(connectionMetrics.id, connectionMetrics);

    try {
      // Authenticate first
      const authResponse = await this.authenticate();
      if (!authResponse) {
        throw new Error('Authentication failed');
      }

      // Generate continuous load
      while (this.isRunning && !this.abortController?.signal.aborted) {
        await this.makeHTTPRequest(authResponse, connectionMetrics);
        await this.sleep(Math.random() * 100 + 50); // 50-150ms between requests
      }
    } catch (error) {
      connectionMetrics.errors++;
      console.error(`HTTP connection ${connectionId} error:`, error);
    } finally {
      connectionMetrics.endTime = performance.now();
      connectionMetrics.active = false;
    }
  }

  private async authenticate(): Promise<string | null> {
    try {
      const response = await axios.post(`${this.config.baseUrl}/api/auth/login`, {
        email: this.config.auth.username,
        password: this.config.auth.password
      }, {
        timeout: 5000,
        signal: this.abortController?.signal
      });

      if (response.data && response.data.token) {
        return response.data.token;
      }
      return null;
    } catch (error) {
      console.error('Authentication failed:', error);
      return null;
    }
  }

  private async makeHTTPRequest(authToken: string, metrics: ConnectionMetrics): Promise<void> {
    const endpoints = [
      '/health',
      '/api/conversations',
      '/api/visualizations',
      '/api/exports'
    ];

    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const startTime = performance.now();

    try {
      const response = await axios.get(`${this.config.baseUrl}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${authToken}`
        },
        timeout: 10000,
        signal: this.abortController?.signal
      });

      const duration = performance.now() - startTime;
      metrics.responseTimes.push(duration);
      metrics.requests++;

      this.metricsCollector.recordRequest(duration, false);

    } catch (error) {
      const duration = performance.now() - startTime;
      metrics.responseTimes.push(duration);
      metrics.errors++;
      metrics.requests++;

      this.metricsCollector.recordRequest(duration, true);
    }
  }

  private async testWebSocketStress(): Promise<StressTestResult> {
    const testName = 'WebSocket Stress';
    console.log(`Starting ${testName} test...`);

    const startTime = new Date();
    this.isRunning = true;
    this.abortController = new AbortController();

    this.metricsCollector.start();

    const maxConnections = Math.min(this.config.maxConcurrentConnections, 100);
    const promises: Promise<void>[] = [];

    // Create WebSocket connections
    for (let i = 0; i < maxConnections; i++) {
      promises.push(this.createWebSocketConnection(i));
    }

    // Sustain WebSocket load
    await this.sleep(this.config.testDuration * 1000);

    this.isRunning = false;
    this.abortController.abort();

    await Promise.allSettled(promises);

    const endTime = new Date();
    const metrics = this.metricsCollector.stop();

    return this.generateTestResult(testName, startTime, endTime, metrics);
  }

  private async createWebSocketConnection(connectionId: number): Promise<void> {
    const connectionMetrics: ConnectionMetrics = {
      id: `ws-${connectionId}`,
      startTime: performance.now(),
      requests: 0,
      errors: 0,
      responseTimes: [],
      active: true
    };

    this.connections.set(connectionMetrics.id, connectionMetrics);

    try {
      const ws = new WebSocket(this.config.wsUrl);
      this.websockets.push(ws);

      return new Promise((resolve) => {
        ws.on('open', () => {
          let lastSendTime = performance.now();
          // Start sending messages
          const messageInterval = setInterval(() => {
            if (!this.isRunning || ws.readyState !== WebSocket.OPEN) {
              clearInterval(messageInterval);
              return;
            }

            lastSendTime = performance.now();
            ws.send(JSON.stringify({
              type: 'ping',
              connectionId: connectionId,
              timestamp: Date.now()
            }));

            connectionMetrics.requests++;
          }, 1000); // Send message every second

          ws.on('message', () => {
            const duration = performance.now() - lastSendTime;
            connectionMetrics.responseTimes.push(duration);
            this.metricsCollector.recordRequest(duration, false);
          });

          ws.on('error', () => {
            connectionMetrics.errors++;
            this.metricsCollector.recordRequest(0, true);
          });

          ws.on('close', () => {
            clearInterval(messageInterval);
            connectionMetrics.endTime = performance.now();
            connectionMetrics.active = false;
            resolve();
          });
        });

        ws.on('error', () => {
          connectionMetrics.errors++;
          connectionMetrics.endTime = performance.now();
          connectionMetrics.active = false;
          resolve();
        });
      });

    } catch (error) {
      connectionMetrics.errors++;
      connectionMetrics.endTime = performance.now();
      connectionMetrics.active = false;
    }
  }

  private async testMemoryPressure(): Promise<StressTestResult> {
    const testName = 'Memory Pressure Test';
    console.log(`Starting ${testName} test...`);

    const startTime = new Date();
    this.metricsCollector.start();

    // Create large data structures to stress memory
    const dataBuffers: Buffer[] = [];
    const jsonData: any[] = [];

    try {
      // Allocate large buffers
      for (let i = 0; i < 100; i++) {
        if (i % 10 === 0) {
          console.log(`Allocating buffer ${i}/100`);
        }

        // Create 10MB buffer
        const buffer = Buffer.alloc(10 * 1024 * 1024, Math.floor(Math.random() * 256));
        dataBuffers.push(buffer);

        // Create large JSON objects
        const largeObj = this.createLargeJsonObject();
        jsonData.push(largeObj);

        // Make API calls under memory pressure
        if (i % 5 === 0) {
          await this.makeAPIUnderMemoryPressure();
        }

        // Brief pause to allow garbage collection
        if (i % 20 === 0) {
          await this.sleep(100);
          if (global.gc) {
            global.gc();
          }
        }
      }

      // Test memory-intensive operations
      await this.testMemoryIntensiveOperations();

    } catch (error) {
      console.error('Memory pressure test error:', error);
    }

    // Clean up
    dataBuffers.length = 0;
    jsonData.length = 0;

    // Force garbage collection
    if (global.gc) {
      global.gc();
    }

    const endTime = new Date();
    const metrics = this.metricsCollector.stop();

    return this.generateTestResult(testName, startTime, endTime, metrics);
  }

  private createLargeJsonObject(): any {
    return {
      id: Math.random().toString(36),
      data: Array.from({ length: 1000 }, (_, i) => ({
        index: i,
        value: Math.random(),
        text: 'x'.repeat(100),
        nested: {
          level1: {
            level2: {
              level3: Array.from({ length: 100 }, (_, j) => ({
                id: j,
                payload: 'data'.repeat(10)
              }))
            }
          }
        }
      })),
      timestamp: Date.now()
    };
  }

  private async makeAPIUnderMemoryPressure(): Promise<void> {
    try {
      const startTime = performance.now();
      await axios.get(`${this.config.baseUrl}/health`, { timeout: 5000 });
      const duration = performance.now() - startTime;
      this.metricsCollector.recordRequest(duration, false);
    } catch (error) {
      this.metricsCollector.recordRequest(5000, true);
    }
  }

  private async testMemoryIntensiveOperations(): Promise<void> {
    // Test string operations
    const largeStrings = Array.from({ length: 1000 }, () => 'x'.repeat(10000));

    // Test array operations
    const largeArray = Array.from({ length: 100000 }, (_, i) => ({ id: i, data: Math.random() }));
    largeArray.sort((a, b) => a.data - b.data);

    // Test object creation
    const objects = Array.from({ length: 10000 }, (_, i) => ({
      id: i,
      properties: Array.from({ length: 100 }, (_, j) => ({
        key: `prop_${j}`,
        value: Math.random()
      }))
    }));

    // Clean up
    largeStrings.length = 0;
    largeArray.length = 0;
    objects.length = 0;
  }

  private async testCPUIntensiveOperations(): Promise<StressTestResult> {
    const testName = 'CPU Intensive Operations';
    console.log(`Starting ${testName} test...`);

    const startTime = new Date();
    this.metricsCollector.start();

    const promises: Promise<void>[] = [];

    // Create CPU-intensive tasks
    for (let i = 0; i < 10; i++) {
      promises.push(this.runCPUIntensiveTask(i));
    }

    // Make concurrent API calls during CPU stress
    const apiPromises: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      apiPromises.push(this.makeAPIUnderCPUStress(i * 1000));
    }

    await Promise.all([...promises, ...apiPromises]);

    const endTime = new Date();
    const metrics = this.metricsCollector.stop();

    return this.generateTestResult(testName, startTime, endTime, metrics);
  }

  private async runCPUIntensiveTask(taskId: number): Promise<void> {
    const startTime = performance.now();

    // CPU-intensive calculations
    let result = 0;
    for (let i = 0; i < 100000000; i++) {
      result += Math.sqrt(i) * Math.sin(i);
      if (i % 10000000 === 0 && !this.isRunning) {
        break;
      }
    }

    const duration = performance.now() - startTime;
    console.log(`CPU task ${taskId} completed in ${duration.toFixed(2)}ms`);
  }

  private async makeAPIUnderCPUStress(delay: number): Promise<void> {
    await this.sleep(delay);

    try {
      const startTime = performance.now();
      await axios.get(`${this.config.baseUrl}/health`, { timeout: 10000 });
      const duration = performance.now() - startTime;
      this.metricsCollector.recordRequest(duration, false);
    } catch (error) {
      this.metricsCollector.recordRequest(10000, true);
    }
  }

  private async testDatabaseConnectionExhaustion(): Promise<StressTestResult> {
    const testName = 'Database Connection Exhaustion';
    console.log(`Starting ${testName} test...`);

    const startTime = new Date();
    this.metricsCollector.start();

    const promises: Promise<void>[] = [];
    const maxAttempts = 200;

    // Try to exhaust database connections
    for (let i = 0; i < maxAttempts; i++) {
      promises.push(this.createDatabaseLoad(i));
    }

    await Promise.allSettled(promises);

    const endTime = new Date();
    const metrics = this.metricsCollector.stop();

    return this.generateTestResult(testName, startTime, endTime, metrics);
  }

  private async createDatabaseLoad(attemptId: number): Promise<void> {
    try {
      // Simulate database operations
      await axios.get(`${this.config.baseUrl}/api/conversations`, {
        timeout: 15000
      });

      this.metricsCollector.recordRequest(100, false);
    } catch (error) {
      this.metricsCollector.recordRequest(15000, true);
    }
  }

  private async testLargeDataTransfer(): Promise<StressTestResult> {
    const testName = 'Large Data Transfer';
    console.log(`Starting ${testName} test...`);

    const startTime = new Date();
    this.metricsCollector.start();

    // Test large POST requests
    const largeData = this.createLargeJsonObject();
    const promises: Promise<void>[] = [];

    for (let i = 0; i < 50; i++) {
      promises.push(this.uploadLargeData(largeData, i));
    }

    await Promise.allSettled(promises);

    const endTime = new Date();
    const metrics = this.metricsCollector.stop();

    return this.generateTestResult(testName, startTime, endTime, metrics);
  }

  private async uploadLargeData(data: any, attemptId: number): Promise<void> {
    try {
      const startTime = performance.now();
      await axios.post(`${this.config.baseUrl}/api/conversations`, {
        title: `Large Data Test ${attemptId}`,
        metadata: data
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const duration = performance.now() - startTime;
      this.metricsCollector.recordRequest(duration, false);

    } catch (error) {
      this.metricsCollector.recordRequest(30000, true);
    }
  }

  private async testRapidConnectionCycling(): Promise<StressTestResult> {
    const testName = 'Rapid Connection Cycling';
    console.log(`Starting ${testName} test...`);

    const startTime = new Date();
    this.metricsCollector.start();

    const promises: Promise<void>[] = [];
    const cycles = 100;

    // Rapidly create and destroy connections
    for (let i = 0; i < cycles; i++) {
      promises.push(this.cycleConnection(i));
    }

    await Promise.all(promises);

    const endTime = new Date();
    const metrics = this.metricsCollector.stop();

    return this.generateTestResult(testName, startTime, endTime, metrics);
  }

  private async cycleConnection(cycleId: number): Promise<void> {
    try {
      // Create connection
      const startTime = performance.now();
      await axios.get(`${this.config.baseUrl}/health`, { timeout: 5000 });
      const duration = performance.now() - startTime;
      this.metricsCollector.recordRequest(duration, false);

      // Brief pause
      await this.sleep(10);

      // Create another connection
      await axios.get(`${this.config.baseUrl}/health`, { timeout: 5000 });

    } catch (error) {
      this.metricsCollector.recordRequest(5000, true);
    }
  }

  private async testSustainedLoad(): Promise<StressTestResult> {
    const testName = 'Sustained Load Test';
    console.log(`Starting ${testName} test...`);

    const startTime = new Date();
    this.metricsCollector.start();

    const promises: Promise<void>[] = [];
    const concurrentConnections = 50;

    // Create sustained connections
    for (let i = 0; i < concurrentConnections; i++) {
      promises.push(this.createSustainedConnection(i));
    }

    await Promise.all(promises);

    const endTime = new Date();
    const metrics = this.metricsCollector.stop();

    return this.generateTestResult(testName, startTime, endTime, metrics);
  }

  private async createSustainedConnection(connectionId: number): Promise<void> {
    const duration = this.config.testDuration * 1000;
    const startTime = performance.now();
    const requestInterval = 1000; // 1 request per second

    while (performance.now() - startTime < duration) {
      try {
        const reqStart = performance.now();
        await axios.get(`${this.config.baseUrl}/health`, { timeout: 10000 });
        const reqDuration = performance.now() - reqStart;
        this.metricsCollector.recordRequest(reqDuration, false);

        await this.sleep(requestInterval);
      } catch (error) {
        this.metricsCollector.recordRequest(10000, true);
      }
    }
  }

  private async testErrorRecovery(): Promise<StressTestResult> {
    const testName = 'Error Recovery Test';
    console.log(`Starting ${testName} test...`);

    const startTime = new Date();
    this.metricsCollector.start();

    // Mix of valid and invalid requests
    const promises: Promise<void>[] = [];

    for (let i = 0; i < 100; i++) {
      if (i % 3 === 0) {
        // Invalid request
        promises.push(this.makeInvalidRequest(i));
      } else {
        // Valid request
        promises.push(this.makeValidRequest(i));
      }
    }

    await Promise.allSettled(promises);

    const endTime = new Date();
    const metrics = this.metricsCollector.stop();

    return this.generateTestResult(testName, startTime, endTime, metrics);
  }

  private async makeInvalidRequest(requestId: number): Promise<void> {
    try {
      await axios.get(`${this.config.baseUrl}/invalid-endpoint-${requestId}`, { timeout: 5000 });
    } catch (error) {
      // Expected to fail
      this.metricsCollector.recordRequest(5000, true);
    }
  }

  private async makeValidRequest(requestId: number): Promise<void> {
    try {
      const startTime = performance.now();
      await axios.get(`${this.config.baseUrl}/health`, { timeout: 5000 });
      const duration = performance.now() - startTime;
      this.metricsCollector.recordRequest(duration, false);
    } catch (error) {
      this.metricsCollector.recordRequest(5000, true);
    }
  }

  private async testResourceExhaustion(): Promise<StressTestResult> {
    const testName = 'Resource Exhaustion Test';
    console.log(`Starting ${testName} test...`);

    const startTime = new Date();
    this.metricsCollector.start();

    try {
      // Try to exhaust various resources
      await this.exhaustFileDescriptors();
      await this.exhaustMemory();
      await this.exhaustNetworkSockets();
    } catch (error) {
      console.error('Resource exhaustion test error:', error);
    }

    const endTime = new Date();
    const metrics = this.metricsCollector.stop();

    return this.generateTestResult(testName, startTime, endTime, metrics);
  }

  private async exhaustFileDescriptors(): Promise<void> {
    // Try to open many connections
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        axios.get(`${this.config.baseUrl}/health`, { timeout: 30000 })
          .then(() => {})
          .catch(() => {}) // Ignore errors
      );
    }
    await Promise.allSettled(promises);
  }

  private async exhaustMemory(): Promise<void> {
    // Try to allocate large amounts of memory
    const buffers: Buffer[] = [];
    try {
      for (let i = 0; i < 50; i++) {
        buffers.push(Buffer.alloc(5 * 1024 * 1024)); // 5MB buffers
      }
    } catch (error) {
      // Memory allocation failed, which is expected
    }
    // Clean up
    buffers.length = 0;
  }

  private async exhaustNetworkSockets(): Promise<void> {
    // Create many WebSocket connections
    const websockets: WebSocket[] = [];
    try {
      for (let i = 0; i < 50; i++) {
        const ws = new WebSocket(this.config.wsUrl);
        websockets.push(ws);
      }
    } catch (error) {
      // Socket creation failed, which is expected
    }
    // Clean up
    websockets.forEach(ws => ws.close());
  }

  private generateTestResult(testName: string, startTime: Date, endTime: Date, metrics: any): StressTestResult {
    const allConnections = Array.from(this.connections.values());
    const totalRequests = allConnections.reduce((sum, conn) => sum + conn.requests, 0);
    const totalErrors = allConnections.reduce((sum, conn) => sum + conn.errors, 0);
    const allResponseTimes = allConnections.flatMap(conn => conn.responseTimes);

    const averageResponseTime = allResponseTimes.length > 0 ?
      allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length : 0;

    const sortedTimes = [...allResponseTimes].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p99Index = Math.floor(sortedTimes.length * 0.99);
    const p95ResponseTime = sortedTimes[p95Index] || 0;
    const p99ResponseTime = sortedTimes[p99Index] || 0;

    const duration = endTime.getTime() - startTime.getTime();
    const requestsPerSecond = duration > 0 ? (totalRequests / duration) * 1000 : 0;

    return {
      testName,
      startTime,
      endTime,
      duration,
      totalRequests,
      successfulRequests: totalRequests - totalErrors,
      failedRequests: totalErrors,
      averageResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      requestsPerSecond,
      errors: [],
      throughput: requestsPerSecond,
      memoryUsage: metrics.getLatestMetrics()?.memory,
      cpuUsage: metrics.getLatestMetrics()?.cpu
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup(): Promise<void> {
    this.isRunning = false;
    this.abortController?.abort();

    // Close WebSocket connections
    this.websockets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    this.websockets = [];

    // Clear connections
    this.connections.clear();

    // Stop metrics collection
    this.metricsCollector.stop();
  }
}

export default StressTestSuite;