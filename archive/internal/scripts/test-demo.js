#!/usr/bin/env node

/**
 * Demo System Test Suite
 *
 * Tests all demo components to ensure proper functionality.
 */

import { access, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DemoSystemTester {
  constructor() {
    this.tests = [];
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  addTest(name, testFunction) {
    this.tests.push({ name, testFunction });
  }

  async runTest(test) {
    try {
      this.results.total++;
      await test.testFunction();
      console.log(`  ✅ ${test.name}`);
      this.results.passed++;
      return true;
    } catch (error) {
      console.log(`  ❌ ${test.name}: ${error.message}`);
      this.results.failed++;
      this.results.errors.push({ test: test.name, error: error.message });
      return false;
    }
  }

  async runAllTests() {
    console.log('🧪 Running Demo System Tests\n');

    for (const test of this.tests) {
      await this.runTest(test);
    }

    this.printSummary();
    return this.results.failed === 0;
  }

  printSummary() {
    console.log(`\n📊 Test Results: ${this.results.passed}/${this.results.total} passed`);

    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.errors.forEach(({ test, error }) => {
        console.log(`  - ${test}: ${error}`);
      });
    }

    if (this.results.passed === this.results.total) {
      console.log('\n🎉 All tests passed!');
    } else {
      console.log('\n⚠️  Some tests failed - check the setup');
    }
  }
}

async function createTestSuite() {
  const tester = new DemoSystemTester();

  // Test 1: Configuration file
  tester.addTest('Config file exists and is valid', async () => {
    await access('scripts/config/demo-config.js');
    const configContent = await readFile('scripts/config/demo-config.js', 'utf8');

    if (!configContent.includes('DEMO_CONFIG')) {
      throw new Error('DEMO_CONFIG not found');
    }

    if (!configContent.includes('performanceThresholds')) {
      throw new Error('performanceThresholds not found');
    }

    if (!configContent.includes('cognitiveTargets')) {
      throw new Error('cognitiveTargets not found');
    }
  });

  // Test 2: Health check module
  tester.addTest('Health check module exists and is importable', async () => {
    await access('scripts/demo/health-check.js');

    try {
      const healthCheck = await import('./demo/health-check.js');
      if (!healthCheck.SystemHealthChecker) {
        throw new Error('SystemHealthChecker class not found');
      }
    } catch (error) {
      throw new Error(`Health check module import failed: ${error.message}`);
    }
  });

  // Test 3: Sample generator module
  tester.addTest('Sample generator exists and is importable', async () => {
    await access('scripts/data/sample-generator.js');

    try {
      const generator = await import('./data/sample-generator.js');
      if (!generator.ConversationGenerator) {
        throw new Error('ConversationGenerator class not found');
      }

      if (!generator.generateConversation) {
        throw new Error('generateConversation function not found');
      }
    } catch (error) {
      throw new Error(`Sample generator import failed: ${error.message}`);
    }
  });

  // Test 4: Metrics collector module
  tester.addTest('Metrics collector exists and is importable', async () => {
    await access('scripts/metrics/metrics-collector.js');

    try {
      const metrics = await import('./metrics/metrics-collector.js');
      if (!metrics.MetricsCollector) {
        throw new Error('MetricsCollector class not found');
      }
    } catch (error) {
      throw new Error(`Metrics collector import failed: ${error.message}`);
    }
  });

  // Test 5: Validator module
  tester.addTest('Validator exists and is importable', async () => {
    await access('scripts/validation/demo-validator.js');

    try {
      const validator = await import('./validation/demo-validator.js');
      if (!validator.DemoValidator) {
        throw new Error('DemoValidator class not found');
      }
    } catch (error) {
      throw new Error(`Validator import failed: ${error.message}`);
    }
  });

  // Test 6: Logger module
  tester.addTest('Logger exists and is importable', async () => {
    await access('scripts/utils/demo-logger.js');

    try {
      const logger = await import('./utils/demo-logger.js');
      if (!logger.DemoLogger) {
        throw new Error('DemoLogger class not found');
      }
    } catch (error) {
      throw new Error(`Logger import failed: ${error.message}`);
    }
  });

  // Test 7: Main demo script
  tester.addTest('Main demo script exists and is importable', async () => {
    await access('scripts/demo.js');

    try {
      const demo = await import('./demo.js');
      if (!demo.CognitiveFabricDemo) {
        throw new Error('CognitiveFabricDemo class not found');
      }
    } catch (error) {
      throw new Error(`Main demo script import failed: ${error.message}`);
    }
  });

  // Test 8: Directory structure
  tester.addTest('Required directories exist', async () => {
    const requiredDirs = [
      'scripts/logs',
      'scripts/reports',
      'scripts/exports',
      'scripts/benchmarks'
    ];

    for (const dir of requiredDirs) {
      try {
        await access(dir);
      } catch (error) {
        throw new Error(`Directory ${dir} does not exist`);
      }
    }
  });

  // Test 9: Package.json configuration
  tester.addTest('Package.json has correct configuration', async () => {
    await access('scripts/package.json');

    const packageContent = await readFile('scripts/package.json', 'utf8');
    const packageJson = JSON.parse(packageContent);

    if (!packageJson.scripts || !packageJson.scripts.demo) {
      throw new Error('Demo script not found in package.json');
    }

    if (!packageJson.dependencies) {
      throw new Error('Dependencies not found in package.json');
    }

    const requiredDeps = ['axios', 'uuid', 'commander'];
    for (const dep of requiredDeps) {
      if (!packageJson.dependencies[dep]) {
        throw new Error(`Required dependency ${dep} not found`);
      }
    }
  });

  // Test 10: README exists
  tester.addTest('README documentation exists', async () => {
    await access('scripts/README.md');

    const readmeContent = await readFile('scripts/README.md', 'utf8');

    if (!readmeContent.includes('Cognitive Fabric Visualizer')) {
      throw new Error('README missing project title');
    }

    if (!readmeContent.includes('Quick Start')) {
      throw new Error('README missing quick start section');
    }
  });

  // Test 11: Configuration validation
  tester.addTest('Configuration has required structure', async () => {
    const { CONFIG } = await import('./config/demo-config.js');

    if (!CONFIG.performanceThresholds) {
      throw new Error('performanceThresholds not found in config');
    }

    if (!CONFIG.cognitiveTargets) {
      throw new Error('cognitiveTargets not found in config');
    }

    if (!CONFIG.apiEndpoints) {
      throw new Error('apiEndpoints not found in config');
    }

    // Validate specific threshold values
    const expectedThresholds = ['maxProcessingTime', 'minRenderingFPS', 'maxApiResponseTime'];
    for (const threshold of expectedThresholds) {
      if (CONFIG.performanceThresholds[threshold] === undefined) {
        throw new Error(`Performance threshold ${threshold} not found`);
      }
    }

    // Validate cognitive targets
    const expectedTargets = ['factualAccuracy', 'logicalPrecision', 'creativeRougeL', 'metacognitiveF1'];
    for (const target of expectedTargets) {
      if (CONFIG.cognitiveTargets[target] === undefined) {
        throw new Error(`Cognitive target ${target} not found`);
      }
    }
  });

  // Test 12: Module functionality test
  tester.addTest('Module functionality test', async () => {
    try {
      // Test logger instantiation
      const { DemoLogger } = await import('./utils/demo-logger.js');
      const logger = new DemoLogger({ level: 'info', console: false });

      if (!logger.info || !logger.error || !logger.warn) {
        throw new Error('Logger missing required methods');
      }

      // Test metrics collector instantiation
      const { MetricsCollector } = await import('./metrics/metrics-collector.js');
      const metrics = new MetricsCollector();

      if (!metrics.startDemo || !metrics.endDemo || !metrics.startPhase) {
        throw new Error('MetricsCollector missing required methods');
      }

    } catch (error) {
      throw new Error(`Module functionality test failed: ${error.message}`);
    }
  });

  return tester;
}

// Run tests
async function runTests() {
  const tester = await createTestSuite();
  const success = await tester.runAllTests();

  if (!success) {
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Test suite failed:', error.message);
  process.exit(1);
});