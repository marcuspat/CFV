import 'jest-dom/extend-expect';

// Global test configuration
global.console = {
  ...console,
  // Suppress console.log in tests unless explicitly needed
  log: process.env.VERBOSE_TESTS ? console.log : jest.fn(),
  warn: console.warn,
  error: console.error,
  info: process.env.VERBOSE_TESTS ? console.info : jest.fn(),
  debug: process.env.VERBOSE_TESTS ? console.debug : jest.fn(),
};

// Mock environment variables for testing
(process.env as any).NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'test_cognitive_fabric';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.NEO4J_URI = 'bolt://localhost:7687';
process.env.NEO4J_USER = 'neo4j';
process.env.NEO4J_PASSWORD = 'test_password';
process.env.REDIS_URL = 'redis://localhost:6379';

// Increase timeout for async tests
jest.setTimeout(30000);

// Global test utilities
(global as any).testUtils = {
  // Helper to create test data
  createTestConversation: (id: string, messages: any[] = []) => ({
    id,
    title: `Test Conversation ${id}`,
    messages,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      duration: 1000,
      messageCount: messages.length
    }
  }),

  // Helper to create test cognitive elements
  createTestCognitiveElement: (id: string, type: string, content: string = 'Test content') => ({
    id,
    type,
    content,
    confidence: 0.95,
    timestamp: new Date().toISOString(),
    metadata: {
      source: 'test',
      processed: true
    }
  }),

  // Helper to create WebSocket test messages
  createWebSocketMessage: (type: string, data: any) => ({
    type,
    data,
    timestamp: new Date().toISOString(),
    id: `msg-${Date.now()}-${Math.random()}`
  }),

  // Helper to test async functions with timeout
  waitForCondition: async (condition: () => boolean, timeout = 5000, interval = 100): Promise<void> => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  }
};

// Mock external services that might not be available in test environment
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));

// Mock WebSocket for testing
jest.mock('ws', () => ({
  WebSocket: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    readyState: 1, // OPEN
  })),
  WebSocketServer: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

// Setup and teardown hooks
beforeAll(async () => {
  // Global test setup
  console.log('🧪 Starting test suite...');
});

afterAll(async () => {
  // Global test cleanup
  console.log('🧹 Cleaning up after test suite...');
});

// Test utilities for file system operations
export const testFileUtils = {
  createTempFile: async (content: string, extension = '.json'): Promise<string> => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cognitive-fabric-test-'));
    const filePath = path.join(tempDir, `test-file-${Date.now()}${extension}`);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  },

  cleanupTempFile: async (filePath: string): Promise<void> => {
    const fs = await import('fs/promises');
    const path = await import('path');
    try {
      await fs.unlink(filePath);
      const dir = path.dirname(filePath);
      await fs.rmdir(dir);
    } catch (error) {
      // Ignore cleanup errors
    }
  }
};

// Performance testing utilities
export const performanceTestUtils = {
  measureExecutionTime: async (fn: () => Promise<any>): Promise<{ result: any; time: number }> => {
    const start = performance.now();
    const result = await fn();
    const time = performance.now() - start;
    return { result, time };
  },

  expectPerformanceThreshold: async (
    fn: () => Promise<any>,
    thresholdMs: number,
    description?: string
  ): Promise<void> => {
    const { time } = await performanceTestUtils.measureExecutionTime(fn);
    expect(time).toBeLessThan(thresholdMs);
  }
};

// Database test utilities
export const databaseTestUtils = {
  createTestDatabase: async (name: string): Promise<void> => {
    // Implementation for creating test databases
    console.log(`Creating test database: ${name}`);
  },

  dropTestDatabase: async (name: string): Promise<void> => {
    // Implementation for dropping test databases
    console.log(`Dropping test database: ${name}`);
  }
};

// Export all test utilities
export { global as testGlobals };