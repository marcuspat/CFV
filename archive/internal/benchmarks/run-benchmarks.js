#!/usr/bin/env node

import SystemMonitor from './system/monitor.js';
import APIBenchmarker from './api/api-benchmarker.js';
import CognitiveProcessorBenchmark from './cognitive/cognitive-benchmarker.js';
import FrontendRenderingBenchmark from './frontend/rendering-benchmarker.js';
import DatabaseBenchmarker from './database/database-benchmarker.js';
import StressTester from './stress/stress-tester.js';
import ScalabilityTester from './scalability/scalability-tester.js';

class ComprehensiveBenchmarkSuite {
  constructor() {
    this.systemMonitor = new SystemMonitor();
    this.apiBenchmarker = new APIBenchmarker();
    this.cognitiveBenchmarker = new CognitiveProcessorBenchmark();
    this.frontendBenchmarker = new FrontendRenderingBenchmark();
    this.databaseBenchmarker = new DatabaseBenchmarker();
    this.stressTester = new StressTester();
    this.scalabilityTester = new ScalabilityTester();
    this.startTime = null;
    this.endTime = null;
  }

  async runFullBenchmarkSuite() {
    console.log('🚀 Starting Comprehensive Performance Benchmark Suite');
    console.log('=' .repeat(60));

    this.startTime = Date.now();

    try {
      // Start system monitoring
      console.log('\n📊 Starting System Resource Monitoring...');
      await this.systemMonitor.startMonitoring(500); // Monitor every 500ms

      // 1. Cognitive Processing Benchmarks
      console.log('\n🧠 Running Cognitive Processing Benchmarks...');
      await this.cognitiveBenchmarker.runBenchmarks();
      await this.cognitiveBenchmarker.runAccuracyBenchmarks();

      // 2. Frontend Rendering Benchmarks
      console.log('\n🎨 Running Frontend Rendering Benchmarks...');
      await this.frontendBenchmarker.runAllBenchmarks();

      // 3. Database Performance Benchmarks
      console.log('\n🗄️ Running Database Performance Benchmarks...');
      await this.databaseBenchmarker.runAllBenchmarks();

      // 4. API Performance Benchmarks
      console.log('\n🌐 Running API Performance Benchmarks...');
      await this.apiBenchmarker.runAllBenchmarks();
      await this.apiBenchmarker.runLoadTest();

      // 5. Stress Testing
      console.log('\n💪 Running Stress Tests...');
      await this.stressTester.runAllStressTests();

      // 6. Scalability Testing
      console.log('\n📈 Running Scalability Tests...');
      await this.scalabilityTester.runAllScalabilityTests();

      // Stop system monitoring
      console.log('\n📊 Stopping System Monitoring...');
      this.systemMonitor.stopMonitoring();

      // Generate reports
      console.log('\n📋 Generating Performance Reports...');
      await this.generateComprehensiveReport();

      this.endTime = Date.now();
      const totalDuration = (this.endTime - this.startTime) / 1000;

      console.log(`\n✅ Full Benchmark Suite Completed in ${totalDuration.toFixed(2)} seconds`);

    } catch (error) {
      console.error('❌ Benchmark suite failed:', error);
      this.systemMonitor.stopMonitoring();
      throw error;
    }
  }

  async generateComprehensiveReport() {
    const systemReport = await this.systemMonitor.generateReport();
    const apiReport = await this.apiBenchmarker.generateReport();
    const cognitiveReport = await this.cognitiveBenchmarker.generateReport();
    const frontendReport = await this.frontendBenchmarker.generateReport();
    const databaseReport = await this.databaseBenchmarker.generateReport();
    const stressReport = await this.stressTester.generateReport();
    const scalabilityReport = await this.scalabilityTester.generateReport();

    const comprehensiveReport = {
      timestamp: new Date().toISOString(),
      duration: (this.endTime || Date.now()) - this.startTime,
      system: systemReport,
      api: apiReport,
      cognitive: cognitiveReport,
      frontend: frontendReport,
      database: databaseReport,
      stress: stressReport,
      scalability: scalabilityReport,
      summary: this.generateExecutiveSummary(systemReport, apiReport, cognitiveReport, frontendReport, databaseReport, stressReport, scalabilityReport),
      recommendations: this.generateRecommendations(systemReport, apiReport, cognitiveReport, frontendReport, databaseReport, stressReport, scalabilityReport)
    };

    const reportPath = new URL('./reports/comprehensive-benchmark-report.json', import.meta.url).pathname;
    const fs = await import('fs');
    fs.writeFileSync(reportPath, JSON.stringify(comprehensiveReport, null, 2));

    this.printExecutiveSummary(comprehensiveReport);

    return comprehensiveReport;
  }

  generateExecutiveSummary(systemReport, apiReport, cognitiveReport, frontendReport, databaseReport, stressReport, scalabilityReport) {
    const summary = {
      overall: {
        status: 'UNKNOWN',
        score: 0,
        criticalIssues: [],
        warnings: []
      },
      targets: {
        apiResponseTime: { target: 100, actual: 0, status: 'UNKNOWN' },
        cognitiveProcessing: { target: 5000, actual: 0, status: 'UNKNOWN' },
        renderingFPS: { target: 240, actual: 0, status: 'UNKNOWN' },
        memoryUsage: { target: 512000000, actual: 0, status: 'UNKNOWN' } // 512MB in bytes
      },
      performance: {
        api: apiReport.summary || {},
        cognitive: cognitiveReport.summary || {},
        frontend: frontendReport.summary || {},
        database: databaseReport.summary || {},
        system: systemReport.summary || {},
        stress: stressReport.summary || {},
        scalability: scalabilityReport.summary || {}
      }
    };

    // Calculate API performance
    if (apiReport.summary && apiReport.summary.performanceTargets) {
      summary.targets.apiResponseTime.actual = apiReport.summary.performanceTargets.averageLatency;
      summary.targets.apiResponseTime.status = apiReport.summary.performanceTargets.averageLatency <= 100 ? 'PASS' : 'FAIL';
    }

    // Calculate cognitive performance
    if (cognitiveReport.summary && cognitiveReport.summary.performance) {
      summary.targets.cognitiveProcessing.actual = cognitiveReport.summary.performance.averageProcessingTime;
      summary.targets.cognitiveProcessing.status = cognitiveReport.summary.performance.averageProcessingTime <= 5000 ? 'PASS' : 'FAIL';
    }

    // Calculate frontend performance
    if (frontendReport.summary && frontendReport.summary.rendering) {
      summary.targets.renderingFPS.actual = frontendReport.summary.rendering.averageFPS;
      summary.targets.renderingFPS.status = frontendReport.summary.rendering.averageFPS >= 240 ? 'PASS' : 'FAIL';
    }

    // Calculate system performance
    if (systemReport.summary && systemReport.summary.memory) {
      summary.targets.memoryUsage.actual = systemReport.summary.memory.peakRSS;
      summary.targets.memoryUsage.status = systemReport.summary.memory.peakRSS <= 512000000 ? 'PASS' : 'FAIL';
    }

    // Calculate overall score
    const targets = Object.values(summary.targets);
    const passedTargets = targets.filter(t => t.status === 'PASS').length;
    summary.overall.score = (passedTargets / targets.length) * 100;

    if (summary.overall.score >= 90) {
      summary.overall.status = 'EXCELLENT';
    } else if (summary.overall.score >= 75) {
      summary.overall.status = 'GOOD';
    } else if (summary.overall.score >= 60) {
      summary.overall.status = 'ACCEPTABLE';
    } else {
      summary.overall.status = 'NEEDS_IMPROVEMENT';
    }

    return summary;
  }

  generateRecommendations(systemReport, apiReport, cognitiveReport, frontendReport, databaseReport, stressReport, scalabilityReport) {
    const recommendations = [];

    // System recommendations
    if (systemReport.summary && systemReport.summary.memory) {
      if (systemReport.summary.memory.memoryGrowth > 100000000) { // 100MB growth
        recommendations.push({
          category: 'SYSTEM',
          priority: 'HIGH',
          issue: 'Memory leak detected',
          recommendation: 'Investigate memory growth and implement proper garbage collection'
        });
      }
    }

    // API recommendations
    if (apiReport.summary && apiReport.summary.performanceTargets) {
      if (apiReport.summary.performanceTargets.averageLatency > 100) {
        recommendations.push({
          category: 'API',
          priority: 'HIGH',
          issue: 'API response time exceeds 100ms target',
          recommendation: 'Implement caching, optimize database queries, and consider load balancing'
        });
      }
    }

    // Cognitive recommendations
    if (cognitiveReport.summary && cognitiveReport.summary.performance) {
      if (cognitiveReport.summary.performance.targetMissed > 0) {
        recommendations.push({
          category: 'COGNITIVE',
          priority: 'MEDIUM',
          issue: 'Cognitive processing time exceeds 5-second target',
          recommendation: 'Optimize LLM ensemble processing and implement parallel processing'
        });
      }
    }

    // Frontend recommendations
    if (frontendReport.summary && frontendReport.summary.rendering) {
      if (frontendReport.summary.rendering.targetsMissed > 0) {
        recommendations.push({
          category: 'FRONTEND',
          priority: 'MEDIUM',
          issue: 'Rendering FPS below 240 FPS target',
          recommendation: 'Optimize WebGL rendering, implement level-of-detail, and use instance rendering'
        });
      }
    }

    // Database recommendations
    if (databaseReport.summary && databaseReport.summary.queries) {
      if (databaseReport.summary.queries.targetsMissed > 0) {
        recommendations.push({
          category: 'DATABASE',
          priority: 'MEDIUM',
          issue: 'Database query times exceed targets',
          recommendation: 'Add appropriate indexes, optimize queries, and consider connection pooling'
        });
      }
    }

    return recommendations;
  }

  printExecutiveSummary(report) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 EXECUTIVE PERFORMANCE SUMMARY');
    console.log('='.repeat(60));

    console.log(`\n🎯 Overall Performance Status: ${report.summary.overall.status}`);
    console.log(`📈 Overall Score: ${report.summary.overall.score.toFixed(1)}%`);

    console.log('\n🎯 Target Performance Metrics:');
    Object.entries(report.summary.targets).forEach(([key, target]) => {
      const status = target.status === 'PASS' ? '✅' : '❌';
      console.log(`  ${status} ${key}: ${target.actual.toFixed(2)} (Target: ${target.target})`);
    });

    if (report.recommendations.length > 0) {
      console.log('\n⚠️  Recommendations:');
      report.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. [${rec.priority}] ${rec.issue}`);
        console.log(`     ${rec.recommendation}`);
      });
    }

    console.log('\n📋 Detailed reports saved to:');
    console.log('  - ./benchmarks/reports/comprehensive-benchmark-report.json');
    console.log('  - ./benchmarks/reports/system-report.json');
    console.log('  - ./benchmarks/reports/api-report.json');
    console.log('  - ./benchmarks/reports/cognitive-report.json');
    console.log('  - ./benchmarks/reports/frontend-report.json');
    console.log('  - ./benchmarks/reports/database-report.json');
    console.log('  - ./benchmarks/reports/stress-test-report.json');
    console.log('  - ./benchmarks/reports/scalability-report.json');

    console.log('\n' + '='.repeat(60));
  }
}

// Run benchmarks if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmarkSuite = new ComprehensiveBenchmarkSuite();

  benchmarkSuite.runFullBenchmarkSuite()
    .then(() => {
      console.log('✅ Benchmark suite completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Benchmark suite failed:', error);
      process.exit(1);
    });
}

export default ComprehensiveBenchmarkSuite;