/**
 * Performance test reporter with multiple output formats
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { PerformanceMetrics } from './MetricsCollector';

export interface TestResult {
  testName: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  metrics: PerformanceMetrics[];
  summary: any;
  thresholds: ThresholdResults;
  recommendations: string[];
}

export interface ThresholdResults {
  cpu: ThresholdResult;
  memory: ThresholdResult;
  responseTime: ThresholdResult;
  errorRate: ThresholdResult;
}

export interface ThresholdResult {
  passed: boolean;
  warnings: number;
  critical: number;
  max: number;
  avg: number;
}

export interface PerformanceReport {
  testSuite: string;
  timestamp: Date;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpus: number;
    totalMemory: number;
  };
  results: TestResult[];
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    overallScore: number;
    keyMetrics: any;
  };
  recommendations: string[];
}

export class PerformanceReporter {
  private reports: PerformanceReport[] = [];

  constructor(private outputDir = './tests/performance/reports') {
    this.ensureOutputDir();
  }

  async generateReport(
    testSuiteName: string,
    results: TestResult[]
  ): Promise<PerformanceReport> {
    const report: PerformanceReport = {
      testSuite: testSuiteName,
      timestamp: new Date(),
      environment: this.getEnvironmentInfo(),
      results: results,
      summary: this.generateSummary(results),
      recommendations: this.generateRecommendations(results)
    };

    this.reports.push(report);

    // Generate all report formats
    await this.generateJSONReport(report);
    await this.generateHTMLReport(report);
    await this.generateCSVReport(report);
    await this.generateMarkdownReport(report);

    return report;
  }

  private async ensureOutputDir(): Promise<void> {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create output directory:', error);
    }
  }

  private getEnvironmentInfo() {
    const os = require('os');
    const cpus = os.cpus();

    return {
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      cpus: cpus.length,
      totalMemory: os.totalmem(),
      cpuModel: cpus[0]?.model || 'Unknown'
    };
  }

  private generateSummary(results: TestResult[]) {
    const totalTests = results.length;
    const passedTests = results.filter(r => this.testPassed(r)).length;
    const failedTests = totalTests - passedTests;

    // Calculate overall performance score
    const scores = results.map(r => this.calculateTestScore(r));
    const overallScore = scores.length > 0 ?
      Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    // Aggregate key metrics
    const allMetrics = results.flatMap(r => r.metrics);
    const keyMetrics = this.aggregateKeyMetrics(allMetrics);

    return {
      totalTests,
      passedTests,
      failedTests,
      overallScore,
      keyMetrics
    };
  }

  private aggregateKeyMetrics(metrics: PerformanceMetrics[]) {
    if (metrics.length === 0) {
      return {};
    }

    const cpuUsages = metrics.map(m => m.cpu.usage);
    const memoryUsages = metrics.map(m => m.memory.percentage);
    const responseTimes = metrics.map(m => m.application.responseTime.avg);

    return {
      avgCpuUsage: Math.round((cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length) * 100) / 100,
      maxCpuUsage: Math.max(...cpuUsages),
      avgMemoryUsage: Math.round((memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length) * 100) / 100,
      maxMemoryUsage: Math.max(...memoryUsages),
      avgResponseTime: Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 100) / 100,
      maxResponseTime: Math.max(...responseTimes),
      totalSamples: metrics.length
    };
  }

  private testPassed(result: TestResult): boolean {
    return Object.values(result.thresholds).every(threshold => threshold.passed);
  }

  private calculateTestScore(result: TestResult): number {
    let score = 100;

    // Deduct points for threshold violations
    if (!result.thresholds.cpu.passed) score -= 20;
    if (!result.thresholds.memory.passed) score -= 20;
    if (!result.thresholds.responseTime.passed) score -= 30;
    if (!result.thresholds.errorRate.passed) score -= 30;

    // Additional deductions for warnings
    score -= (result.thresholds.cpu.warnings + result.thresholds.memory.warnings) * 5;
    score -= (result.thresholds.responseTime.warnings + result.thresholds.errorRate.warnings) * 3;

    return Math.max(0, score);
  }

  private generateRecommendations(results: TestResult[]): string[] {
    const recommendations = new Set<string>();

    results.forEach(result => {
      // CPU recommendations
      if (!result.thresholds.cpu.passed) {
        recommendations.add('Consider scaling CPU resources horizontally');
        recommendations.add('Profile CPU-intensive operations and optimize algorithms');
        if (result.thresholds.cpu.critical > 0) {
          recommendations.add('URGENT: CPU usage critically high - immediate optimization required');
        }
      }

      // Memory recommendations
      if (!result.thresholds.memory.passed) {
        recommendations.add('Optimize memory usage and implement memory leak detection');
        recommendations.add('Consider increasing available memory or implementing memory pooling');
        if (result.thresholds.memory.critical > 0) {
          recommendations.add('CRITICAL: Memory usage dangerously high - risk of OOM');
        }
      }

      // Response time recommendations
      if (!result.thresholds.responseTime.passed) {
        recommendations.add('Implement response caching strategies');
        recommendations.add('Optimize database queries and add appropriate indexes');
        recommendations.add('Consider CDN implementation for static assets');
        if (result.thresholds.responseTime.critical > 0) {
          recommendations.add('CRITICAL: Response times unacceptable - user experience severely impacted');
        }
      }

      // Error rate recommendations
      if (!result.thresholds.errorRate.passed) {
        recommendations.add('Implement comprehensive error handling and retry mechanisms');
        recommendations.add('Review error logs to identify root causes');
        recommendations.add('Implement circuit breaker patterns for external dependencies');
        if (result.thresholds.errorRate.critical > 0) {
          recommendations.add('URGENT: High error rates indicate system instability');
        }
      }

      // Add test-specific recommendations
      result.recommendations.forEach(rec => recommendations.add(rec));
    });

    return Array.from(recommendations);
  }

  private async generateJSONReport(report: PerformanceReport): Promise<void> {
    const filename = `${report.testSuite}-${report.timestamp.toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(this.outputDir, filename);

    try {
      await fs.writeFile(filepath, JSON.stringify(report, null, 2));
      console.log(`JSON report generated: ${filepath}`);
    } catch (error) {
      console.error('Failed to generate JSON report:', error);
    }
  }

  private async generateHTMLReport(report: PerformanceReport): Promise<void> {
    const filename = `${report.testSuite}-${report.timestamp.toISOString().replace(/[:.]/g, '-')}.html`;
    const filepath = path.join(this.outputDir, filename);

    const html = this.generateHTMLContent(report);

    try {
      await fs.writeFile(filepath, html);
      console.log(`HTML report generated: ${filepath}`);
    } catch (error) {
      console.error('Failed to generate HTML report:', error);
    }
  }

  private generateHTMLContent(report: PerformanceReport): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Performance Report - ${report.testSuite}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #007bff; padding-bottom: 20px; margin-bottom: 30px; }
        .score { font-size: 48px; font-weight: bold; text-align: center; margin: 20px 0; }
        .score.excellent { color: #28a745; }
        .score.good { color: #17a2b8; }
        .score.warning { color: #ffc107; }
        .score.critical { color: #dc3545; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric-card { background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #007bff; }
        .test-result { margin: 20px 0; padding: 15px; border: 1px solid #dee2e6; border-radius: 5px; }
        .test-result.passed { border-left: 4px solid #28a745; }
        .test-result.failed { border-left: 4px solid #dc3545; }
        .recommendations { background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107; }
        .chart { margin: 20px 0; height: 300px; background: #f8f9fa; display: flex; align-items: center; justify-content: center; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #dee2e6; }
        th { background-color: #f8f9fa; font-weight: bold; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Performance Test Report</h1>
            <h2>${report.testSuite}</h2>
            <p>Generated: ${report.timestamp.toLocaleString()}</p>
            <div class="score ${this.getScoreClass(report.summary.overallScore)}">
                ${report.summary.overallScore}/100
            </div>
        </div>

        <div class="metrics">
            <div class="metric-card">
                <h3>Test Summary</h3>
                <p><strong>Total Tests:</strong> ${report.summary.totalTests}</p>
                <p><strong>Passed:</strong> ${report.summary.passedTests}</p>
                <p><strong>Failed:</strong> ${report.summary.failedTests}</p>
                <p><strong>Success Rate:</strong> ${Math.round((report.summary.passedTests / report.summary.totalTests) * 100)}%</p>
            </div>
            <div class="metric-card">
                <h3>Performance Metrics</h3>
                <p><strong>Avg CPU:</strong> ${report.summary.keyMetrics.avgCpuUsage}%</p>
                <p><strong>Avg Memory:</strong> ${report.summary.keyMetrics.avgMemoryUsage}%</p>
                <p><strong>Avg Response Time:</strong> ${report.summary.keyMetrics.avgResponseTime}ms</p>
                <p><strong>Max Response Time:</strong> ${report.summary.keyMetrics.maxResponseTime}ms</p>
            </div>
            <div class="metric-card">
                <h3>Environment</h3>
                <p><strong>Node Version:</strong> ${report.environment.nodeVersion}</p>
                <p><strong>Platform:</strong> ${report.environment.platform}</p>
                <p><strong>CPUs:</strong> ${report.environment.cpus}</p>
                <p><strong>Total Memory:</strong> ${Math.round(report.environment.totalMemory / 1024 / 1024 / 1024)}GB</p>
            </div>
        </div>

        <h3>Test Results</h3>
        ${report.results.map(result => `
            <div class="test-result ${this.testPassed(result) ? 'passed' : 'failed'}">
                <h4>${result.testName}</h4>
                <p><strong>Duration:</strong> ${Math.round(result.duration / 1000)}s</p>
                <p><strong>Status:</strong> ${this.testPassed(result) ? 'PASSED' : 'FAILED'}</p>
                <p><strong>Score:</strong> ${this.calculateTestScore(result)}/100</p>

                <table>
                    <tr>
                        <th>Metric</th>
                        <th>Average</th>
                        <th>Maximum</th>
                        <th>Warnings</th>
                        <th>Critical</th>
                    </tr>
                    <tr>
                        <td>CPU Usage</td>
                        <td>${result.thresholds.cpu.avg}%</td>
                        <td>${result.thresholds.cpu.max}%</td>
                        <td>${result.thresholds.cpu.warnings}</td>
                        <td>${result.thresholds.cpu.critical}</td>
                    </tr>
                    <tr>
                        <td>Memory Usage</td>
                        <td>${result.thresholds.memory.avg}%</td>
                        <td>${result.thresholds.memory.max}%</td>
                        <td>${result.thresholds.memory.warnings}</td>
                        <td>${result.thresholds.memory.critical}</td>
                    </tr>
                    <tr>
                        <td>Response Time</td>
                        <td>${result.thresholds.responseTime.avg}ms</td>
                        <td>${result.thresholds.responseTime.max}ms</td>
                        <td>${result.thresholds.responseTime.warnings}</td>
                        <td>${result.thresholds.responseTime.critical}</td>
                    </tr>
                    <tr>
                        <td>Error Rate</td>
                        <td>${result.thresholds.errorRate.avg}%</td>
                        <td>${result.thresholds.errorRate.max}%</td>
                        <td>${result.thresholds.errorRate.warnings}</td>
                        <td>${result.thresholds.errorRate.critical}</td>
                    </tr>
                </table>
            </div>
        `).join('')}

        <div class="chart">
            <canvas id="performanceChart"></canvas>
        </div>

        <div class="recommendations">
            <h3>Recommendations</h3>
            <ul>
                ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
    </div>

    <script>
        const ctx = document.getElementById('performanceChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(report.results.map(r => r.testName))},
                datasets: [{
                    label: 'Average CPU Usage (%)',
                    data: ${JSON.stringify(report.results.map(r => r.thresholds.cpu.avg))},
                    borderColor: 'rgb(255, 99, 132)',
                    tension: 0.1
                }, {
                    label: 'Average Memory Usage (%)',
                    data: ${JSON.stringify(report.results.map(r => r.thresholds.memory.avg))},
                    borderColor: 'rgb(54, 162, 235)',
                    tension: 0.1
                }, {
                    label: 'Average Response Time (ms)',
                    data: ${JSON.stringify(report.results.map(r => r.thresholds.responseTime.avg))},
                    borderColor: 'rgb(255, 205, 86)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Performance Metrics Overview'
                    }
                }
            }
        });
    </script>
</body>
</html>`;
  }

  private getScoreClass(score: number): string {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'warning';
    return 'critical';
  }

  private async generateCSVReport(report: PerformanceReport): Promise<void> {
    const filename = `${report.testSuite}-${report.timestamp.toISOString().replace(/[:.]/g, '-')}.csv`;
    const filepath = path.join(this.outputDir, filename);

    const csv = this.generateCSVContent(report);

    try {
      await fs.writeFile(filepath, csv);
      console.log(`CSV report generated: ${filepath}`);
    } catch (error) {
      console.error('Failed to generate CSV report:', error);
    }
  }

  private generateCSVContent(report: PerformanceReport): string {
    const headers = [
      'Test Name',
      'Duration (s)',
      'Status',
      'Score',
      'Avg CPU (%)',
      'Max CPU (%)',
      'CPU Warnings',
      'CPU Critical',
      'Avg Memory (%)',
      'Max Memory (%)',
      'Memory Warnings',
      'Memory Critical',
      'Avg Response Time (ms)',
      'Max Response Time (ms)',
      'Response Warnings',
      'Response Critical',
      'Avg Error Rate (%)',
      'Max Error Rate (%)',
      'Error Warnings',
      'Error Critical'
    ];

    const rows = report.results.map(result => [
      result.testName,
      Math.round(result.duration / 1000),
      this.testPassed(result) ? 'PASSED' : 'FAILED',
      this.calculateTestScore(result),
      result.thresholds.cpu.avg,
      result.thresholds.cpu.max,
      result.thresholds.cpu.warnings,
      result.thresholds.cpu.critical,
      result.thresholds.memory.avg,
      result.thresholds.memory.max,
      result.thresholds.memory.warnings,
      result.thresholds.memory.critical,
      result.thresholds.responseTime.avg,
      result.thresholds.responseTime.max,
      result.thresholds.responseTime.warnings,
      result.thresholds.responseTime.critical,
      result.thresholds.errorRate.avg,
      result.thresholds.errorRate.max,
      result.thresholds.errorRate.warnings,
      result.thresholds.errorRate.critical
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  private async generateMarkdownReport(report: PerformanceReport): Promise<void> {
    const filename = `${report.testSuite}-${report.timestamp.toISOString().replace(/[:.]/g, '-')}.md`;
    const filepath = path.join(this.outputDir, filename);

    const markdown = this.generateMarkdownContent(report);

    try {
      await fs.writeFile(filepath, markdown);
      console.log(`Markdown report generated: ${filepath}`);
    } catch (error) {
      console.error('Failed to generate Markdown report:', error);
    }
  }

  private generateMarkdownContent(report: PerformanceReport): string {
    return `# Performance Test Report: ${report.testSuite}

**Generated:** ${report.timestamp.toLocaleString()}
**Environment:** ${report.environment.platform} (${report.environment.arch})
**Node Version:** ${report.environment.nodeVersion}

## Executive Summary

- **Overall Score:** ${report.summary.overallScore}/100 ${this.getScoreEmoji(report.summary.overallScore)}
- **Tests Passed:** ${report.summary.passedTests}/${report.summary.totalTests}
- **Success Rate:** ${Math.round((report.summary.passedTests / report.summary.totalTests) * 100)}%

### Key Metrics
- **Average CPU Usage:** ${report.summary.keyMetrics.avgCpuUsage}%
- **Average Memory Usage:** ${report.summary.keyMetrics.avgMemoryUsage}%
- **Average Response Time:** ${report.summary.keyMetrics.avgResponseTime}ms

## Test Results

${report.results.map(result => `
### ${result.testName}

**Status:** ${this.testPassed(result) ? '✅ PASSED' : '❌ FAILED'}
**Duration:** ${Math.round(result.duration / 1000)}s
**Score:** ${this.calculateTestScore(result)}/100

| Metric | Average | Maximum | Warnings | Critical |
|--------|---------|---------|----------|----------|
| CPU Usage | ${result.thresholds.cpu.avg}% | ${result.thresholds.cpu.max}% | ${result.thresholds.cpu.warnings} | ${result.thresholds.cpu.critical} |
| Memory Usage | ${result.thresholds.memory.avg}% | ${result.thresholds.memory.max}% | ${result.thresholds.memory.warnings} | ${result.thresholds.memory.critical} |
| Response Time | ${result.thresholds.responseTime.avg}ms | ${result.thresholds.responseTime.max}ms | ${result.thresholds.responseTime.warnings} | ${result.thresholds.responseTime.critical} |
| Error Rate | ${result.thresholds.errorRate.avg}% | ${result.thresholds.errorRate.max}% | ${result.thresholds.errorRate.warnings} | ${result.thresholds.errorRate.critical} |
`).join('')}

## Recommendations

${report.recommendations.map(rec => `- ${rec}`).join('\n')}

---
*Report generated by Cognitive Fabric Visualizer Performance Testing Framework*`;
  }

  private getScoreEmoji(score: number): string {
    if (score >= 90) return '🟢';
    if (score >= 75) return '🟡';
    if (score >= 60) return '🟠';
    return '🔴';
  }

  async generateSummaryReport(): Promise<void> {
    if (this.reports.length === 0) {
      console.log('No reports to summarize');
      return;
    }

    const summaryReport = {
      generatedAt: new Date(),
      totalReports: this.reports.length,
      summary: this.reports.map(report => ({
        testSuite: report.testSuite,
        timestamp: report.timestamp,
        overallScore: report.summary.overallScore,
        passRate: Math.round((report.summary.passedTests / report.summary.totalTests) * 100),
        keyMetrics: report.summary.keyMetrics
      }))
    };

    const filename = `performance-summary-${summaryReport.generatedAt.toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(this.outputDir, filename);

    try {
      await fs.writeFile(filepath, JSON.stringify(summaryReport, null, 2));
      console.log(`Summary report generated: ${filepath}`);
    } catch (error) {
      console.error('Failed to generate summary report:', error);
    }
  }
}

export default PerformanceReporter;