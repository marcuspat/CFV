#!/usr/bin/env node

/**
 * Cognitive Fabric Visualizer E2E Test Runner
 * Convenient script to run different test suites with appropriate configurations
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, description) {
  log(`\n${step}. ${description}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️ ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️ ${message}`, 'blue');
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    log(`Running: ${command} ${args.join(' ')}`, 'magenta');

    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function checkPrerequisites() {
  logStep('1', 'Checking prerequisites');

  try {
    // Check if Node.js is available
    await runCommand('node', ['--version']);
    logSuccess('Node.js is available');

    // Check if npm is available
    await runCommand('npm', ['--version']);
    logSuccess('npm is available');

    // Check if Playwright is installed
    await runCommand('npx', ['playwright', '--version']);
    logSuccess('Playwright is available');

    // Check if test files exist
    const testDir = path.join(__dirname);
    const configExists = fs.existsSync(path.join(testDir, 'playwright.config.ts'));
    const fixturesExist = fs.existsSync(path.join(testDir, 'fixtures'));

    if (!configExists) {
      throw new Error('playwright.config.ts not found');
    }
    if (!fixturesExist) {
      throw new Error('fixtures directory not found');
    }

    logSuccess('Test configuration is valid');
  } catch (error) {
    logError(`Prerequisite check failed: ${error.message}`);
    logInfo('Please run: npm install && npm run playwright:install');
    process.exit(1);
  }
}

async function installDependencies() {
  logStep('2', 'Installing dependencies');

  try {
    await runCommand('npm', ['install'], { cwd: path.join(__dirname, '../..') });
    logSuccess('Dependencies installed');
  } catch (error) {
    logError(`Failed to install dependencies: ${error.message}`);
    process.exit(1);
  }
}

async function installBrowsers() {
  logStep('3', 'Installing Playwright browsers');

  try {
    await runCommand('npx', ['playwright', 'install'], { cwd: __dirname });
    logSuccess('Browsers installed');
  } catch (error) {
    logError(`Failed to install browsers: ${error.message}`);
    process.exit(1);
  }
}

async function runTestSuite(suite, options = {}) {
  const testSuites = {
    'all': {
      description: 'All E2E tests',
      args: [],
    },
    'setup': {
      description: 'Setup and environment validation',
      args: ['tests/e2e/setup/setup.spec.ts'],
    },
    'workflows': {
      description: 'Complete user workflow tests',
      args: ['tests/e2e/workflows/'],
    },
    'performance': {
      description: 'Performance validation tests (240 FPS)',
      args: ['tests/e2e/performance/'],
    },
    'mobile': {
      description: 'Mobile responsiveness tests',
      args: ['tests/e2e/mobile/'],
    },
    'visual': {
      description: 'Visual regression tests',
      args: ['tests/e2e/visual/'],
    },
    'desktop': {
      description: 'Desktop interaction tests',
      args: ['tests/e2e/desktop/'],
    },
  };

  const selectedSuite = testSuites[suite];
  if (!selectedSuite) {
    logError(`Unknown test suite: ${suite}`);
    logInfo(`Available suites: ${Object.keys(testSuites).join(', ')}`);
    process.exit(1);
  }

  logStep('4', `Running ${selectedSuite.description}`);

  const args = [
    'playwright',
    'test',
    ...selectedSuite.args,
    ...(options.headed ? ['--headed'] : []),
    ...(options.debug ? ['--debug'] : []),
    ...(options.ui ? ['--ui'] : []),
    ...(options.browser ? [`--project=${options.browser}`] : []),
    ...(options.reporter ? [`--reporter=${options.reporter}`] : []),
  ];

  try {
    await runCommand('npx', args, { cwd: __dirname });
    logSuccess(`${selectedSuite.description} completed successfully`);

    // Show performance report if performance tests were run
    if (suite === 'performance') {
      await showPerformanceReport();
    }
  } catch (error) {
    logError(`${selectedSuite.description} failed: ${error.message}`);
    process.exit(1);
  }
}

async function showPerformanceReport() {
  logStep('5', 'Performance Test Results');

  try {
    const reportPath = path.join(__dirname, '../test-results/performance/summary-report.json');

    if (fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

      logInfo('Performance Summary:');
      log(`  Average FPS: ${report.metrics.averageFPS.toFixed(1)}`, 'green');
      log(`  Average Memory: ${report.metrics.averageMemory.toFixed(1)}MB`, 'green');
      log(`  Average Load Time: ${report.metrics.averageLoadTime.toFixed(0)}ms`, 'green');

      logInfo('Performance Goals:');
      log(`  FPS Target (240): Achieved ${report.performanceGoals.fpsAchieved}/${report.summary.totalTests}`,
           report.performanceGoals.fpsAchieved >= report.summary.totalTests * 0.8 ? 'green' : 'yellow');
      log(`  Memory Target (512MB): Achieved ${report.performanceGoals.memoryAchieved}/${report.summary.totalTests}`,
           report.performanceGoals.memoryAchieved >= report.summary.totalTests * 0.8 ? 'green' : 'yellow');

      if (report.metrics.averageFPS < 180) {
        logWarning('Performance below target - consider optimization');
      } else {
        logSuccess('Performance targets met');
      }
    } else {
      logWarning('Performance report not found - tests may not have completed');
    }
  } catch (error) {
    logWarning(`Could not read performance report: ${error.message}`);
  }
}

async function showReports() {
  logStep('5', 'Opening Test Reports');

  try {
    await runCommand('npx', ['playwright', 'show-report'], { cwd: __dirname });
  } catch (error) {
    logError(`Failed to open reports: ${error.message}`);
  }
}

function printUsage() {
  log('\n🧪 Cognitive Fabric Visualizer E2E Test Runner', 'bright');
  log('\nUsage:', 'cyan');
  log('  node run-tests.js [suite] [options]', 'reset');

  log('\nTest Suites:', 'cyan');
  log('  all           - Run all E2E tests (default)', 'reset');
  log('  setup         - Environment setup and validation', 'reset');
  log('  workflows     - Complete user workflow tests', 'reset');
  log('  performance   - Performance validation (240 FPS)', 'reset');
  log('  mobile        - Mobile responsiveness tests', 'reset');
  log('  visual        - Visual regression tests', 'reset');
  log('  desktop       - Desktop interaction tests', 'reset');

  log('\nOptions:', 'cyan');
  log('  --headed      - Run tests in headed mode (show browser)', 'reset');
  log('  --debug       - Run tests in debug mode', 'reset');
  log('  --ui          - Run tests with Playwright UI', 'reset');
  log('  --browser     - Specify browser (chromium, firefox, webkit)', 'reset');
  log('  --reporter    - Specify reporter (html, json, junit)', 'reset');
  log('  --install     - Install dependencies and browsers', 'reset');
  log('  --reports     - Show test reports after completion', 'reset');

  log('\nExamples:', 'cyan');
  log('  node run-tests.js performance', 'reset');
  log('  node run-tests.js mobile --headed', 'reset');
  log('  node run-tests.js all --browser=firefox --reporter=html', 'reset');
  log('  node run-tests.js visual --install', 'reset');

  log('\nQuick Commands:', 'cyan');
  log('  npm run test:e2e              - Run all tests', 'reset');
  log('  npm run test:performance      - Run performance tests only', 'reset');
  log('  npm run test:mobile           - Run mobile tests only', 'reset');
  log('  npm run test:visual           - Run visual regression tests', 'reset');
  log('  npm run report                - Show test reports', 'reset');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  // Parse arguments
  const suite = args.find(arg => !arg.startsWith('--')) || 'all';
  const options = {
    headed: args.includes('--headed'),
    debug: args.includes('--debug'),
    ui: args.includes('--ui'),
    install: args.includes('--install'),
    reports: args.includes('--reports'),
  };

  const browserArg = args.find(arg => arg.startsWith('--browser='));
  if (browserArg) {
    options.browser = browserArg.split('=')[1];
  }

  const reporterArg = args.find(arg => arg.startsWith('--reporter='));
  if (reporterArg) {
    options.reporter = reporterArg.split('=')[1];
  }

  log('🧪 Cognitive Fabric Visualizer E2E Test Runner', 'bright');
  log(`Running test suite: ${suite}`, 'cyan');

  try {
    // Check prerequisites
    await checkPrerequisites();

    // Install dependencies if requested
    if (options.install) {
      await installDependencies();
      await installBrowsers();
    }

    // Run the selected test suite
    await runTestSuite(suite, options);

    // Show reports if requested
    if (options.reports) {
      await showReports();
    }

    logSuccess('\n🎉 All tests completed successfully!');
    logInfo('Check the test-results directory for detailed reports');

  } catch (error) {
    logError(`Test execution failed: ${error.message}`);
    logInfo('Check the logs above for details');
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logError(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError(`Unhandled rejection at: ${promise}, reason: ${reason}`);
  process.exit(1);
});

// Run the main function
main().catch(error => {
  logError(`Fatal error: ${error.message}`);
  process.exit(1);
});