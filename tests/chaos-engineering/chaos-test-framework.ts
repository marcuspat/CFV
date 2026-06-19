/**
 * Chaos Engineering Framework
 * Introduces controlled failures to test system resilience and recovery capabilities
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import App from '../../src/server/app.js';

interface ChaosTest {
  name: string;
  description: string;
  scenario: () => Promise<void>;
  expectedImpact: string[];
  recoveryTime: number;
  resilienceChecks: (() => Promise<boolean>)[];
}

interface ChaosMetrics {
  testName: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  errorsDuringTest: any[];
  systemRecovered: boolean;
  recoveryTime: number;
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
}

export class ChaosEngineeringFramework {
  private app: App;
  private metrics: ChaosMetrics[] = [];
  private isRunning = false;
  private testHistory: Map<string, ChaosMetrics[]> = new Map();

  constructor() {
    this.app = new App();
  }

  async initialize(): Promise<void> {
    await this.app.start();
    console.log('🔥 Chaos Engineering Framework initialized');
  }

  async cleanup(): Promise<void> {
    if (this.app) {
      await this.app.stop();
    }
    console.log('🔥 Chaos Engineering Framework cleaned up');
  }

  getApp(): App {
    return this.app;
  }

  /**
   * Execute a single chaos test with monitoring
   */
  async executeChaosTest(test: ChaosTest): Promise<ChaosMetrics> {
    console.log(`🎯 Starting chaos test: ${test.name}`);
    console.log(`📝 Description: ${test.description}`);

    const metrics: ChaosMetrics = {
      testName: test.name,
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      success: false,
      errorsDuringTest: [],
      systemRecovered: false,
      recoveryTime: 0,
      impactLevel: 'low'
    };

    try {
      // Pre-test health check
      const preTestHealth = await this.checkSystemHealth();
      console.log(`💚 Pre-test health: ${preTestHealth.status}`);

      // Execute chaos scenario
      this.isRunning = true;
      await test.scenario();

      // Monitor system during chaos
      const chaosErrors = await this.monitorDuringChaos(test.recoveryTime);
      metrics.errorsDuringTest = chaosErrors;

      // Determine impact level
      metrics.impactLevel = this.calculateImpactLevel(chaosErrors, preTestHealth);

      // Wait for recovery
      const recoveryStartTime = Date.now();
      const recovered = await this.waitForRecovery(test.recoveryTime);
      metrics.systemRecovered = recovered;
      metrics.recoveryTime = Date.now() - recoveryStartTime;

      // Post-test health check
      const postTestHealth = await this.checkSystemHealth();
      console.log(`💚 Post-test health: ${postTestHealth.status}`);

      // Verify resilience checks
      const resilienceResults = await Promise.all(
        test.resilienceChecks.map(check => check())
      );

      metrics.success = recovered && resilienceResults.every(result => result);

    } catch (error) {
      console.error(`❌ Chaos test failed: ${(error as Error).message}`);
      metrics.errorsDuringTest.push(error as Error);
    } finally {
      this.isRunning = false;
      metrics.endTime = Date.now();
      metrics.duration = metrics.endTime - metrics.startTime;

      // Store metrics
      this.metrics.push(metrics);
      if (!this.testHistory.has(test.name)) {
        this.testHistory.set(test.name, []);
      }
      this.testHistory.get(test.name)!.push(metrics);

      console.log(`📊 Test completed in ${metrics.duration}ms`);
      console.log(`🔄 System recovered: ${metrics.systemRecovered}`);
      console.log(`⏱️  Recovery time: ${metrics.recoveryTime}ms`);
      console.log(`💥 Impact level: ${metrics.impactLevel}`);
    }

    return metrics;
  }

  /**
   * Execute multiple chaos tests in sequence
   */
  async executeChaosSuite(tests: ChaosTest[]): Promise<ChaosMetrics[]> {
    console.log(`🔥 Starting chaos suite with ${tests.length} tests`);

    const results: ChaosMetrics[] = [];

    for (const test of tests) {
      const metrics = await this.executeChaosTest(test);
      results.push(metrics);

      // Wait between tests to allow system stabilization
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`🏁 Chaos suite completed`);
    return results;
  }

  /**
   * Check overall system health
   */
  private async checkSystemHealth(): Promise<any> {
    try {
      const response = await request(this.app.app)
        .get('/api/health')
        .timeout(5000);

      return {
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        response: response.body,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: (error as Error).message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Monitor system during chaos injection
   */
  private async monitorDuringChaos(duration: number): Promise<any[]> {
    const errors: any[] = [];
    const endTime = Date.now() + duration;

    while (Date.now() < endTime && this.isRunning) {
      try {
        const response = await request(this.app.app)
          .get('/api/health')
          .timeout(1000);

        if (response.status >= 500) {
          errors.push({
            type: 'health_check_failure',
            status: response.status,
            body: response.body,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        errors.push({
          type: 'health_check_error',
          error: (error as Error).message,
          timestamp: Date.now()
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return errors;
  }

  /**
   * Wait for system recovery after chaos
   */
  private async waitForRecovery(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const health = await this.checkSystemHealth();

        if (health.status === 'healthy') {
          // Additional checks to ensure full recovery
          const additionalChecks = await Promise.all([
            this.testDatabaseConnection(),
            this.testAPIResponsiveness(),
            this.testServiceAvailability()
          ]);

          if (additionalChecks.every(check => check)) {
            return true;
          }
        }
      } catch (error) {
        // System not yet recovered
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return false;
  }

  /**
   * Calculate impact level based on errors and system state
   */
  private calculateImpactLevel(errors: any[], preTestHealth: any): 'low' | 'medium' | 'high' | 'critical' {
    if (errors.length === 0) {
      return 'low';
    }

    const criticalErrors = errors.filter(e =>
      e.status >= 500 ||
      e.type === 'health_check_error'
    ).length;

    if (criticalErrors > 10) {
      return 'critical';
    } else if (criticalErrors > 5) {
      return 'high';
    } else if (criticalErrors > 0) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Test database connection
   */
  private async testDatabaseConnection(): Promise<boolean> {
    try {
      const response = await request(this.app.app)
        .get('/api/health/database')
        .timeout(3000);

      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Test API responsiveness
   */
  private async testAPIResponsiveness(): Promise<boolean> {
    try {
      const startTime = Date.now();
      const response = await request(this.app.app)
        .get('/api/health')
        .timeout(3000);

      const responseTime = Date.now() - startTime;
      return response.status === 200 && responseTime < 5000;
    } catch (error) {
      return false;
    }
  }

  /**
   * Test service availability
   */
  private async testServiceAvailability(): Promise<boolean> {
    try {
      const response = await request(this.app.app)
        .get('/api/health/services')
        .timeout(5000);

      return response.status === 200 &&
             response.body.services?.every((s: any) => s.status === 'connected');
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate chaos test report
   */
  generateReport(): string {
    const report = [
      '# Chaos Engineering Test Report',
      '=' .repeat(50),
      '',
      `Generated: ${new Date().toISOString()}`,
      `Total Tests: ${this.metrics.length}`,
      `Successful Tests: ${this.metrics.filter(m => m.success).length}`,
      `Failed Tests: ${this.metrics.filter(m => !m.success).length}`,
      '',
      '## Test Results Summary',
      '-' .repeat(30),
      ''
    ];

    // Aggregate metrics by impact level
    const impactSummary = {
      low: this.metrics.filter(m => m.impactLevel === 'low').length,
      medium: this.metrics.filter(m => m.impactLevel === 'medium').length,
      high: this.metrics.filter(m => m.impactLevel === 'high').length,
      critical: this.metrics.filter(m => m.impactLevel === 'critical').length
    };

    report.push('### Impact Level Distribution');
    report.push(`- Low: ${impactSummary.low} tests`);
    report.push(`- Medium: ${impactSummary.medium} tests`);
    report.push(`- High: ${impactSummary.high} tests`);
    report.push(`- Critical: ${impactSummary.critical} tests`);
    report.push('');

    // Recovery time statistics
    const recoveryTimes = this.metrics
      .filter(m => m.systemRecovered)
      .map(m => m.recoveryTime);

    if (recoveryTimes.length > 0) {
      const avgRecoveryTime = recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length;
      const maxRecoveryTime = Math.max(...recoveryTimes);
      const minRecoveryTime = Math.min(...recoveryTimes);

      report.push('### Recovery Time Statistics');
      report.push(`- Average: ${avgRecoveryTime.toFixed(0)}ms`);
      report.push(`- Maximum: ${maxRecoveryTime}ms`);
      report.push(`- Minimum: ${minRecoveryTime}ms`);
      report.push('');
    }

    // Individual test details
    report.push('## Individual Test Results');
    report.push('-' .repeat(30));

    for (const metric of this.metrics) {
      report.push('');
      report.push(`### ${metric.testName}`);
      report.push(`- **Duration**: ${metric.duration}ms`);
      report.push(`- **Success**: ${metric.success ? '✅' : '❌'}`);
      report.push(`- **Impact Level**: ${metric.impactLevel.toUpperCase()}`);
      report.push(`- **System Recovered**: ${metric.systemRecovered ? '✅' : '❌'}`);
      report.push(`- **Recovery Time**: ${metric.recoveryTime}ms`);
      report.push(`- **Errors During Test**: ${metric.errorsDuringTest.length}`);

      if (metric.errorsDuringTest.length > 0) {
        report.push('  **Error Details:**');
        metric.errorsDuringTest.slice(0, 5).forEach(error => {
          report.push(`  - ${error.type || error.name}: ${error.message || error.error}`);
        });
        if (metric.errorsDuringTest.length > 5) {
          report.push(`  - ... and ${metric.errorsDuringTest.length - 5} more errors`);
        }
      }
    }

    // Recommendations
    report.push('');
    report.push('## Recommendations');
    report.push('-' .repeat(30));

    const failedTests = this.metrics.filter(m => !m.success);
    if (failedTests.length > 0) {
      report.push('### Issues to Address:');
      failedTests.forEach(test => {
        report.push(`- **${test.testName}**: System failed to recover properly`);
      });
    }

    const criticalTests = this.metrics.filter(m => m.impactLevel === 'critical');
    if (criticalTests.length > 0) {
      report.push('');
      report.push('### Critical Impact Tests:');
      criticalTests.forEach(test => {
        report.push(`- **${test.testName}**: Consider implementing additional safeguards`);
      });
    }

    const slowRecovery = this.metrics.filter(m => m.recoveryTime > 30000);
    if (slowRecovery.length > 0) {
      report.push('');
      report.push('### Slow Recovery Tests:');
      slowRecovery.forEach(test => {
        report.push(`- **${test.testName}**: Recovery took ${test.recoveryTime}ms (consider optimization)`);
      });
    }

    return report.join('\n');
  }

  /**
   * Export metrics to JSON
   */
  exportMetrics(): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      totalTests: this.metrics.length,
      successfulTests: this.metrics.filter(m => m.success).length,
      failedTests: this.metrics.filter(m => m.success).length,
      averageRecoveryTime: this.metrics
        .filter(m => m.systemRecovered)
        .reduce((sum, m) => sum + m.recoveryTime, 0) /
        this.metrics.filter(m => m.systemRecovered).length || 0,
      metrics: this.metrics,
      testHistory: Object.fromEntries(this.testHistory)
    }, null, 2);
  }
}

// Predefined chaos scenarios
export const ChaosScenarios = {
  /**
   * Database connection failure scenario
   */
  databaseConnectionFailure: (appInstance: App): ChaosTest => ({
    name: 'Database Connection Failure',
    description: 'Simulates database connection loss and tests recovery mechanisms',
    scenario: async () => {
      // This would need to be implemented based on your database setup
      // For example, killing database connections or simulating network issues
      console.log('💥 Injecting database connection failure...');

      // Simulate the failure
      await request(appInstance.app)
        .post('/api/admin/simulate-db-failure')
        .send({ duration: 10000 });
    },
    expectedImpact: ['Database errors', 'Service degradation'],
    recoveryTime: 30000,
    resilienceChecks: [
      async () => {
        const health = await request(appInstance.app).get('/api/health');
        return health.status === 200;
      },
      async () => {
        const dbHealth = await request(appInstance.app).get('/api/health/database');
        return dbHealth.status === 200;
      }
    ]
  }),

  /**
   * High load scenario
   */
  highLoadStress: (appInstance: App): ChaosTest => ({
    name: 'High Load Stress Test',
    description: 'Applies high concurrent load to test system limits and degradation',
    scenario: async () => {
      console.log('💥 Injecting high load stress...');

      const promises = Array(100).fill(null).map(() =>
        request(appInstance.app)
          .get('/api/conversations')
          .timeout(30000)
      );

      await Promise.all(promises);
    },
    expectedImpact: ['Increased response times', 'Potential rate limiting', 'Resource exhaustion'],
    recoveryTime: 15000,
    resilienceChecks: [
      async () => {
        const response = await request(appInstance.app).get('/api/health');
        return response.status === 200;
      },
      async () => {
        const start = Date.now();
        await request(appInstance.app).get('/api/health');
        return Date.now() - start < 5000;
      }
    ]
  }),

  /**
   * Memory pressure scenario
   */
  memoryPressure: (appInstance: App): ChaosTest => ({
    name: 'Memory Pressure Test',
    description: 'Consumes significant memory to test system behavior under memory pressure',
    scenario: async () => {
      console.log('💥 Injecting memory pressure...');

      await request(appInstance.app)
        .post('/api/admin/memory-stress')
        .send({ sizeMB: 500, duration: 10000 });
    },
    expectedImpact: ['Memory exhaustion', 'Slow performance', 'Potential OOM kills'],
    recoveryTime: 20000,
    resilienceChecks: [
      async () => {
        const health = await request(appInstance.app).get('/api/health');
        return health.status === 200;
      }
    ]
  }),

  /**
   * Network partition scenario
   */
  networkPartition: (appInstance: App): ChaosTest => ({
    name: 'Network Partition Simulation',
    description: 'Simulates network connectivity issues between services',
    scenario: async () => {
      console.log('💥 Injecting network partition...');

      await request(appInstance.app)
        .post('/api/admin/network-partition')
        .send({ services: ['database', 'cache'], duration: 15000 });
    },
    expectedImpact: ['Service unavailability', 'Circuit breaker activation', 'Fallback responses'],
    recoveryTime: 25000,
    resilienceChecks: [
      async () => {
        const health = await request(appInstance.app).get('/api/health');
        return health.status === 200;
      }
    ]
  }),

  /**
   * CPU saturation scenario
   */
  cpuSaturation: (appInstance: App): ChaosTest => ({
    name: 'CPU Saturation Test',
    description: 'Consumes CPU resources to test system under CPU pressure',
    scenario: async () => {
      console.log('💥 Injecting CPU saturation...');

      await request(appInstance.app)
        .post('/api/admin/cpu-stress')
        .send({ cores: 4, duration: 10000 });
    },
    expectedImpact: ['Slow response times', 'Request timeouts', 'High latency'],
    recoveryTime: 15000,
    resilienceChecks: [
      async () => {
        const start = Date.now();
        const response = await request(appInstance.app).get('/api/health');
        return response.status === 200 && (Date.now() - start) < 10000;
      }
    ]
  })
};