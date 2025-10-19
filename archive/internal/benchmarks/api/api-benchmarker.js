import autocannon from 'autocannon';
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class APIBenchmarker {
  constructor() {
    this.results = [];
    this.targets = [
      {
        name: 'Cognitive Analysis API',
        url: 'http://localhost:3000/api/cognitive/analyze',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: "Test conversation for cognitive analysis",
          context: "performance testing"
        })
      },
      {
        name: 'Visualization Data API',
        url: 'http://localhost:3000/api/visualization/data',
        method: 'GET'
      },
      {
        name: 'Health Check API',
        url: 'http://localhost:3000/api/health',
        method: 'GET'
      }
    ];
  }

  async runSingleBenchmark(target, options = {}) {
    const defaultOptions = {
      connections: 10,
      duration: 10,
      pipelining: 1,
      timeout: 30,
      ...options
    };

    console.log(`Running benchmark for: ${target.name}`);
    const startTime = performance.now();

    const result = await autocannon({
      ...defaultOptions,
      url: target.url,
      method: target.method,
      headers: target.headers,
      body: target.body
    });

    const endTime = performance.now();
    const duration = endTime - startTime;

    const benchmarkResult = {
      target: target.name,
      timestamp: new Date().toISOString(),
      duration: duration,
      options: defaultOptions,
      results: {
        requests: {
          total: result.requests.total,
          average: result.requests.average,
          mean: result.requests.mean,
          min: result.requests.min,
          max: result.requests.max,
          median: result.requests.median,
          p95: result.requests.p95,
          p99: result.requests.p99
        },
        throughput: {
          average: result.throughput.average,
          mean: result.throughput.mean,
          min: result.throughput.min,
          max: result.throughput.max,
          median: result.throughput.median
        },
        latency: {
          average: result.latency.average,
          mean: result.latency.mean,
          min: result.latency.min,
          max: result.latency.max,
          median: result.latency.median,
          p95: result.latency.p95,
          p99: result.latency.p99
        },
        errors: result.errors,
        timeouts: result.timeouts,
        statusCodeStats: result.statusCodeStats
      },
      performance: {
        target100ms: result.latency.average <= 100 ? 'PASS' : 'FAIL',
        requestsPerSecond: result.throughput.average,
        errorRate: (result.errors / result.requests.total) * 100
      }
    };

    this.results.push(benchmarkResult);
    return benchmarkResult;
  }

  async runAllBenchmarks() {
    console.log('Starting comprehensive API benchmarking...');

    for (const target of this.targets) {
      try {
        await this.runSingleBenchmark(target);
        console.log(`✅ Completed: ${target.name}`);
      } catch (error) {
        console.error(`❌ Failed: ${target.name}`, error.message);
      }
    }
  }

  async runLoadTest() {
    console.log('Running progressive load test...');

    const loadScenarios = [
      { connections: 1, duration: 5, name: 'Single User' },
      { connections: 10, duration: 10, name: 'Light Load' },
      { connections: 50, duration: 15, name: 'Moderate Load' },
      { connections: 100, duration: 20, name: 'Heavy Load' },
      { connections: 200, duration: 25, name: 'Peak Load' }
    ];

    for (const scenario of loadScenarios) {
      console.log(`Testing scenario: ${scenario.name}`);
      const target = this.targets[0]; // Test cognitive analysis API

      try {
        const result = await this.runSingleBenchmark(target, {
          connections: scenario.connections,
          duration: scenario.duration
        });

        console.log(`${scenario.name}: ${result.results.throughput.average} req/s, ${result.results.latency.average}ms avg latency`);
      } catch (error) {
        console.error(`❌ Load test failed for ${scenario.name}:`, error.message);
      }
    }
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(),
      detailed: this.results
    };

    const reportPath = path.join(__dirname, '../reports/api-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`API Benchmark report saved to: ${reportPath}`);
    return report;
  }

  generateSummary() {
    if (this.results.length === 0) return {};

    const summary = {
      totalTests: this.results.length,
      performanceTargets: {
        under100ms: 0,
        over100ms: 0,
        averageLatency: 0,
        peakThroughput: 0,
        overallErrorRate: 0
      }
    };

    let totalLatency = 0;
    let totalRequests = 0;
    let totalErrors = 0;
    let maxThroughput = 0;

    for (const result of this.results) {
      if (result.results.latency.average <= 100) {
        summary.performanceTargets.under100ms++;
      } else {
        summary.performanceTargets.over100ms++;
      }

      totalLatency += result.results.latency.average;
      totalRequests += result.results.requests.total;
      totalErrors += result.errors;
      maxThroughput = Math.max(maxThroughput, result.results.throughput.average);
    }

    summary.performanceTargets.averageLatency = totalLatency / this.results.length;
    summary.performanceTargets.peakThroughput = maxThroughput;
    summary.performanceTargets.overallErrorRate = (totalErrors / totalRequests) * 100;

    return summary;
  }
}

export default APIBenchmarker;