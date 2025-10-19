import { FullResult, Reporter, TestCase, TestResult } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Custom performance reporter for Cognitive Fabric Visualizer
 * Tracks FPS, memory usage, and interaction performance
 */
class PerformanceReporter implements Reporter {
  private performanceData: Array<{
    test: string;
    timestamp: string;
    fps?: number;
    memory?: number;
    loadTime?: number;
    interactionTime?: number;
    passed: boolean;
  }> = [];

  onBegin(config, suite) {
    console.log('📈 Performance Reporter Started');
  }

  onTestEnd(test: TestCase, result: TestResult) {
    // Extract performance metrics from test results
    const metrics = result.stdout?.toString() || '';
    const performanceMatch = metrics.match(/PERFORMANCE: ({.+})/);

    if (performanceMatch) {
      try {
        const performanceData = JSON.parse(performanceMatch[1]);

        this.performanceData.push({
          test: test.title,
          timestamp: new Date().toISOString(),
          ...performanceData,
          passed: result.status === 'passed',
        });
      } catch (error) {
        console.warn(`⚠️ Could not parse performance data for ${test.title}`);
      }
    }
  }

  onEnd(result: FullResult) {
    // Generate performance report
    const reportDir = path.join(process.cwd(), 'test-results', 'performance');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportDir, `performance-${timestamp}.json`);

    const report = {
      summary: {
        timestamp: new Date().toISOString(),
        totalTests: this.performanceData.length,
        passedTests: this.performanceData.filter(d => d.passed).length,
        failedTests: this.performanceData.filter(d => !d.passed).length,
      },
      metrics: {
        averageFPS: this.performanceData.reduce((sum, d) => sum + (d.fps || 0), 0) / (this.performanceData.length || 1),
        averageMemory: this.performanceData.reduce((sum, d) => sum + (d.memory || 0), 0) / (this.performanceData.length || 1),
        averageLoadTime: this.performanceData.reduce((sum, d) => sum + (d.loadTime || 0), 0) / (this.performanceData.length || 1),
        averageInteractionTime: this.performanceData.reduce((sum, d) => sum + (d.interactionTime || 0), 0) / (this.performanceData.length || 1),
      },
      performanceGoals: {
        fpsTarget: 240,
        fpsAchieved: this.performanceData.filter(d => (d.fps || 0) >= 180).length,
        memoryTarget: 512,
        memoryAchieved: this.performanceData.filter(d => (d.memory || 0) <= 512).length,
        loadTimeTarget: 2000,
        loadTimeAchieved: this.performanceData.filter(d => (d.loadTime || 0) <= 2000).length,
      },
      details: this.performanceData,
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📊 Performance report generated: ${reportPath}`);

    // Log summary
    console.log('\n🎯 Performance Summary:');
    console.log(`   Average FPS: ${report.metrics.averageFPS.toFixed(1)} (Target: 240)`);
    console.log(`   Average Memory: ${report.metrics.averageMemory.toFixed(1)}MB (Target: 512MB)`);
    console.log(`   Average Load Time: ${report.metrics.averageLoadTime.toFixed(0)}ms (Target: 2000ms)`);
    console.log(`   FPS Goals Achieved: ${report.performanceGoals.fpsAchieved}/${this.performanceData.length}`);
  }
}

export default PerformanceReporter;