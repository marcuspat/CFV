require('@testing-library/jest-dom');

// Global test configuration
global.console = {
  ...console,
  log: process.env.VERBOSE_TESTS ? console.log : jest.fn(),
  warn: console.warn,
  error: console.error,
  info: process.env.VERBOSE_TESTS ? console.info : jest.fn(),
  debug: process.env.VERBOSE_TESTS ? console.debug : jest.fn(),
};

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'test_cognitive_fabric';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';

// Increase timeout for async tests
jest.setTimeout(10000);

// Global test utilities
global.testUtils = {
  createTestConversation: (id, messages = []) => ({
    id,
    title: `Test Conversation ${id}`,
    messages,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }),

  createTestCognitiveElement: (id, type, content = 'Test content') => ({
    id,
    type,
    content,
    confidence: 0.95,
    timestamp: new Date().toISOString()
  })
};

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});