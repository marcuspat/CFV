/**
 * API Test Runner for Cognitive Fabric Visualizer
 * Executes comprehensive API testing and generates detailed reports
 */

const APITestSuite = require('./api-test-suite.ts');

async function runTests() {
  console.log('🧪 Cognitive Fabric Visualizer - API Test Suite');
  console.log('==================================================\n');

  const testSuite = new APITestSuite();

  try {
    await testSuite.runAllTests();
    console.log('\n✅ All tests completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run tests
runTests();