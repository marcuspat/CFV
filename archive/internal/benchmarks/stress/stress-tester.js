import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class StressTester {
  constructor() {
    this.results = [];
    this.systemLimits = this.detectSystemLimits();
  }

  detectSystemLimits() {
    return {
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      cpuCount: os.cpus().length,
      platform: os.platform(),
      arch: os.arch()
    };
  }

  async runMemoryStressTest() {
    console.log('Running Memory Stress Test...');

    const memoryScenarios = [
      { name: 'Moderate Memory Load', memoryMB: 256, duration: 30000 },
      { name: 'High Memory Load', memoryMB: 512, duration: 30000 },
      { name: 'Extreme Memory Load', memoryMB: 1024, duration: 30000 }
    ];

    for (const scenario of memoryScenarios) {
      console.log(`Testing: ${scenario.name}`);

      const startTime = performance.now();
      const memoryBuffers = [];

      try {
        // Allocate memory
        for (let i = 0; i < scenario.memoryMB; i++) {
          memoryBuffers.push(Buffer.alloc(1024 * 1024)); // 1MB buffer
        }

        // Hold memory for specified duration
        await this.simulateWork(scenario.duration);

        // Measure performance under memory pressure
        const perfUnderLoad = await this.measurePerformanceUnderLoad();

        // Clean up memory
        memoryBuffers.forEach(buffer => buffer.buffer = null);
        if (global.gc) global.gc(); // Force garbage collection if available

        const endTime = performance.now();
        const totalTime = endTime - startTime;

        const result = {
          scenario: scenario.name,
          type: 'memory_stress',
          memoryAllocated: scenario.memoryMB,
          duration: totalTime,
          performanceImpact: perfUnderLoad,
          success: true
        };

        this.results.push(result);
        console.log(`✅ ${scenario.name}: Memory allocated successfully, performance impact measured`);

      } catch (error) {
        console.error(`❌ ${scenario.name} failed:`, error.message);

        const result = {
          scenario: scenario.name,
          type: 'memory_stress',
          memoryAllocated: scenario.memoryMB,
          duration: 0,
          performanceImpact: null,
          success: false,
          error: error.message
        };

        this.results.push(result);
      }
    }
  }

  async runCPUStressTest() {
    console.log('Running CPU Stress Test...');

    const cpuScenarios = [
      { name: 'Light CPU Load', intensity: 25, duration: 10000 },
      { name: 'Moderate CPU Load', intensity: 50, duration: 10000 },
      { name: 'Heavy CPU Load', intensity: 75, duration: 10000 },
      { name: 'Maximum CPU Load', intensity: 100, duration: 5000 }
    ];

    for (const scenario of cpuScenarios) {
      console.log(`Testing: ${scenario.name}`);

      const startTime = performance.now();
      const workers = [];
      const numWorkers = this.systemLimits.cpuCount;

      try {
        // Create CPU-intensive workers
        for (let i = 0; i < numWorkers; i++) {
          workers.push(this.createCPUWorker(scenario.intensity, scenario.duration));
        }

        // Wait for all workers to complete
        await Promise.all(workers);

        const endTime = performance.now();
        const totalTime = endTime - startTime;

        const result = {
          scenario: scenario.name,
          type: 'cpu_stress',
          intensity: scenario.intensity,
          workers: numWorkers,
          duration: totalTime,
          success: true
        };

        this.results.push(result);
        console.log(`✅ ${scenario.name}: CPU stress test completed`);

      } catch (error) {
        console.error(`❌ ${scenario.name} failed:`, error.message);

        const result = {
          scenario: scenario.name,
          type: 'cpu_stress',
          intensity: scenario.intensity,
          workers: numWorkers,
          duration: 0,
          success: false,
          error: error.message
        };

        this.results.push(result);
      }
    }
  }

  createCPUWorker(intensity, duration) {
    return new Promise(resolve => {
      const startTime = performance.now();
      const workAmount = (intensity / 100) * 1000000; // Adjust work based on intensity

      const doWork = () => {
        const currentTime = performance.now();

        if (currentTime - startTime >= duration) {
          resolve();
          return;
        }

        // Perform CPU-intensive work
        for (let i = 0; i < workAmount / 100; i++) {
          Math.random() * Math.random();
          Math.sqrt(Math.random() * 1000000);
        }

        // Use setTimeout to allow event loop to continue
        setTimeout(doWork, 0);
      };

      doWork();
    });
  }

  async runConcurrencyStressTest() {
    console.log('Running Concurrency Stress Test...');

    const concurrencyScenarios = [
      { name: 'Moderate Concurrency', concurrentOps: 50, duration: 5000 },
      { name: 'High Concurrency', concurrentOps: 100, duration: 5000 },
      { name: 'Extreme Concurrency', concurrentOps: 500, duration: 5000 },
      { name: 'Maximum Concurrency', concurrentOps: 1000, duration: 3000 }
    ];

    for (const scenario of concurrencyScenarios) {
      console.log(`Testing: ${scenario.name}`);

      const startTime = performance.now();

      try {
        const operations = [];

        // Create concurrent operations
        for (let i = 0; i < scenario.concurrentOps; i++) {
          operations.push(this.simulateAsyncOperation());
        }

        await Promise.all(operations);

        const endTime = performance.now();
        const totalTime = endTime - startTime;

        const result = {
          scenario: scenario.name,
          type: 'concurrency_stress',
          concurrentOperations: scenario.concurrentOps,
          duration: totalTime,
          throughput: scenario.concurrentOps / (totalTime / 1000), // ops per second
          success: true
        };

        this.results.push(result);
        console.log(`✅ ${scenario.name}: ${result.throughput.toFixed(1)} ops/sec`);

      } catch (error) {
        console.error(`❌ ${scenario.name} failed:`, error.message);

        const result = {
          scenario: scenario.name,
          type: 'concurrency_stress',
          concurrentOperations: scenario.concurrentOps,
          duration: 0,
          throughput: 0,
          success: false,
          error: error.message
        };

        this.results.push(result);
      }
    }
  }

  simulateAsyncOperation() {
    return new Promise(resolve => {
      // Simulate async I/O operations
      setTimeout(() => {
        // Simulate some CPU work
        for (let i = 0; i < 1000; i++) {
          Math.random() * Math.random();
        }
        resolve();
      }, Math.random() * 100); // Random delay up to 100ms
    });
  }

  async simulateWork(duration) {
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  async measurePerformanceUnderLoad() {
    const operations = 1000;
    const startTime = performance.now();

    // Measure basic operation performance under stress
    for (let i = 0; i < operations; i++) {
      Math.random() * Math.random();
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    return {
      operations,
      totalTime,
      averageOperationTime: totalTime / operations
    };
  }

  async runResourceExhaustionTest() {
    console.log('Running Resource Exhaustion Test...');

    // Test system limits and graceful degradation
    const limits = {
      maxMemory: this.systemLimits.totalMemory * 0.9, // 90% of total memory
      maxConcurrent: 10000,
      maxFileDescriptors: 1000
    };

    const exhaustionTests = [
      {
        name: 'File Descriptor Exhaustion',
        test: async () => {
          const fs = require('fs');
          const files = [];

          try {
            for (let i = 0; i < 100; i++) {
              const fd = fs.openSync('/dev/null', 'r');
              files.push(fd);
            }

            // Close all file descriptors
            files.forEach(fd => fs.closeSync(fd));

            return { success: true, descriptorsOpened: files.length };
          } catch (error) {
            return { success: false, error: error.message, descriptorsOpened: files.length };
          }
        }
      },
      {
        name: 'Event Loop Stress',
        test: async () => {
          const startTime = performance.now();
          const promises = [];

          for (let i = 0; i < 10000; i++) {
            promises.push(new Promise(resolve => setImmediate(resolve)));
          }

          try {
            await Promise.all(promises);
            const endTime = performance.now();

            return {
              success: true,
              duration: endTime - startTime,
              promisesResolved: promises.length
            };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }
      }
    ];

    for (const test of exhaustionTests) {
      console.log(`Testing: ${test.name}`);

      try {
        const result = await test.test();

        const stressResult = {
          scenario: test.name,
          type: 'resource_exhaustion',
          ...result,
          timestamp: new Date().toISOString()
        };

        this.results.push(stressResult);
        console.log(`✅ ${test.name}: ${result.success ? 'PASSED' : 'FAILED'}`);

      } catch (error) {
        console.error(`❌ ${test.name} failed:`, error.message);

        const stressResult = {
          scenario: test.name,
          type: 'resource_exhaustion',
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };

        this.results.push(stressResult);
      }
    }
  }

  async runAllStressTests() {
    console.log('Starting Comprehensive Stress Testing...');
    console.log(`System Info: ${this.systemLimits.cpuCount} CPUs, ${(this.systemLimits.totalMemory / 1024 / 1024 / 1024).toFixed(1)}GB RAM`);

    await this.runMemoryStressTest();
    await this.runCPUStressTest();
    await this.runConcurrencyStressTest();
    await this.runResourceExhaustionTest();
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      systemLimits: this.systemLimits,
      summary: this.generateSummary(),
      detailed: this.results
    };

    const reportPath = path.join(__dirname, '../reports/stress-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`Stress Test report saved to: ${reportPath}`);
    return report;
  }

  generateSummary() {
    const memoryResults = this.results.filter(r => r.type === 'memory_stress');
    const cpuResults = this.results.filter(r => r.type === 'cpu_stress');
    const concurrencyResults = this.results.filter(r => r.type === 'concurrency_stress');
    const exhaustionResults = this.results.filter(r => r.type === 'resource_exhaustion');

    return {
      memory: {
        totalTests: memoryResults.length,
        successful: memoryResults.filter(r => r.success).length,
        maxMemoryTested: Math.max(...memoryResults.map(r => r.memoryAllocated || 0))
      },
      cpu: {
        totalTests: cpuResults.length,
        successful: cpuResults.filter(r => r.success).length,
        maxIntensityTested: Math.max(...cpuResults.map(r => r.intensity || 0))
      },
      concurrency: {
        totalTests: concurrencyResults.length,
        successful: concurrencyResults.filter(r => r.success).length,
        maxConcurrencyTested: Math.max(...concurrencyResults.map(r => r.concurrentOperations || 0)),
        peakThroughput: Math.max(...concurrencyResults.map(r => r.throughput || 0))
      },
      exhaustion: {
        totalTests: exhaustionResults.length,
        successful: exhaustionResults.filter(r => r.success).length
      }
    };
  }
}

export default StressTester;