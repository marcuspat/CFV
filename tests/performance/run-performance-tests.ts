#!/usr/bin/env tsx

/**
 * Performance testing entry point
 * Run comprehensive performance tests on the Cognitive Fabric Visualizer
 */

import { PerformanceTestRunner, PerformanceTestConfig } from './PerformanceTestRunner';
import { performance } from 'perf_hooks';

// Default configuration
const defaultConfig: PerformanceTestConfig = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
  wsUrl: process.env.TEST_WS_URL || 'ws://localhost:3000',
  databaseConfig: {
    postgres: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'cfv_test',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password',
      maxConnections: 20
    },
    neo4j: {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      user: process.env.NEO4J_USER || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
      maxConnectionPoolSize: 50
    },
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    }
  },
  testCategories: {
    load: true,
    stress: true,
    database: true,
    memory: true,
    artillery: true
  },
  thresholds: {
    responseTime: { p95: 200, p99: 1000 },
    cpuUsage: 70,
    memoryUsage: 75,
    errorRate: 1
  },
  outputDir: process.env.OUTPUT_DIR || './tests/performance/reports'
};

// CLI argument parsing
const args = process.argv.slice(2);
const options: { [key: string]: string } = {};

for (let i = 0; i < args.length; i += 2) {
  if (args[i].startsWith('--')) {
    const key = args[i].substring(2);
    const value = args[i + 1];
    options[key] = value;
  }
}

// Override config with CLI options
const config: PerformanceTestConfig = {
  ...defaultConfig,
  baseUrl: options['base-url'] || defaultConfig.baseUrl,
  wsUrl: options['ws-url'] || defaultConfig.wsUrl,
  outputDir: options['output-dir'] || defaultConfig.outputDir,
  testCategories: {
    load: options['skip-load'] !== 'true',
    stress: options['skip-stress'] !== 'true',
    database: options['skip-database'] !== 'true',
    memory: options['skip-memory'] !== 'true',
    artillery: options['skip-artillery'] !== 'true'
  }
};

async function main() {
  console.log('🚀 Cognitive Fabric Visualizer - Performance Testing Suite');
  console.log('=' .repeat(60));
  console.log(`🌐 Base URL: ${config.baseUrl}`);
  console.log(`🔌 WebSocket URL: ${config.wsUrl}`);
  console.log(`📁 Output Directory: ${config.outputDir}`);
  console.log(`⚙️  Test Categories: ${Object.entries(config.testCategories).filter(([_, enabled]) => enabled).map(([name]) => name).join(', ')}`);
  console.log('=' .repeat(60));

  const startTime = performance.now();

  try {
    // Create test runner
    const testRunner = new PerformanceTestRunner(config);

    // Run comprehensive tests
    const results = await testRunner.runComprehensiveTests();

    const endTime = performance.now();
    const totalDuration = endTime - startTime;

    console.log('\n' + '=' .repeat(60));
    console.log('📊 PERFORMANCE TEST RESULTS SUMMARY');
    console.log('=' .repeat(60));
    console.log(`⏱️  Total Duration: ${Math.round(totalDuration / 1000)}s`);
    console.log(`🏆 Overall Score: ${results.score}/100`);
    console.log(`📊 Status: ${results.status.toUpperCase()}`);
    console.log(`📝 Recommendations: ${results.recommendations.length}`);

    if (results.recommendations.length > 0) {
      console.log('\n🔍 Key Recommendations:');
      results.recommendations.slice(0, 5).forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
      if (results.recommendations.length > 5) {
        console.log(`  ... and ${results.recommendations.length - 5} more`);
      }
    }

    console.log('\n📈 Category Results:');
    Object.entries(results.categoryResults).forEach(([category, result]) => {
      if (result) {
        const status = (result as any).error ? '❌ FAILED' : '✅ PASSED';
        console.log(`  ${category}: ${status}`);
      }
    });

    console.log('\n📁 Detailed reports generated in:', config.outputDir);

    // Exit with appropriate code
    if (results.status === 'failed') {
      console.log('\n❌ Performance tests FAILED - system needs optimization');
      process.exit(1);
    } else if (results.status === 'warning') {
      console.log('\n⚠️  Performance tests completed with WARNINGS');
      process.exit(2);
    } else {
      console.log('\n✅ Performance tests PASSED - system is performing well');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n❌ Performance testing failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(3);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(4);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(5);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Performance testing interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Performance testing terminated');
  process.exit(143);
});

// Run the tests
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(99);
  });
}

export { PerformanceTestRunner, PerformanceTestConfig };