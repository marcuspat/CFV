/**
 * Database setup and utilities for testing
 * Provides mock database connections and test data management
 */

import { Pool } from 'pg';
import neo4j from 'neo4j-driver';
import { createClient } from 'redis';

// Test database configuration
const TEST_DB_CONFIG = {
  postgres: {
    host: process.env.TEST_POSTGRES_HOST || 'localhost',
    port: process.env.TEST_POSTGRES_PORT || 5432,
    database: process.env.TEST_POSTGRES_DB || 'cfv_test',
    user: process.env.TEST_POSTGRES_USER || 'test_user',
    password: process.env.TEST_POSTGRES_PASSWORD || 'test_password',
    max: 5, // Reduced connection pool for testing
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
  neo4j: {
    uri: process.env.TEST_NEO4J_URI || 'bolt://localhost:7687',
    database: process.env.TEST_NEO4J_DB || 'cfv_test',
    user: process.env.TEST_NEO4J_USER || 'neo4j',
    password: process.env.TEST_NEO4J_PASSWORD || 'test_password',
    maxConnectionLifetime: 3600000,
    maxConnectionPoolSize: 5,
  },
  redis: {
    host: process.env.TEST_REDIS_HOST || 'localhost',
    port: process.env.TEST_REDIS_PORT || 6379,
    db: process.env.TEST_REDIS_DB || 1,
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  }
};

// Mock database instances for testing
let mockPgPool = null;
let mockNeo4jDriver = null;
let mockRedisClient = null;
let testTransactions = new Map();

/**
 * Initialize mock database connections
 */
export const setupTestDatabases = async () => {
  try {
    // Initialize PostgreSQL mock
    mockPgPool = {
      query: jest.fn(),
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    };

    // Initialize Neo4j mock
    mockNeo4jDriver = {
      session: jest.fn(() => ({
        run: jest.fn(),
        close: jest.fn(),
      })),
      close: jest.fn(),
    };

    // Initialize Redis mock
    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      flushdb: jest.fn(),
      quit: jest.fn(),
      connect: jest.fn(),
      on: jest.fn(),
    };

    return {
      postgres: mockPgPool,
      neo4j: mockNeo4jDriver,
      redis: mockRedisClient,
    };
  } catch (error) {
    console.error('Failed to setup test databases:', error);
    throw error;
  }
};

/**
 * Clean up database connections
 */
export const cleanupTestDatabases = async () => {
  try {
    if (mockPgPool) {
      mockPgPool.end();
    }
    if (mockNeo4jDriver) {
      mockNeo4jDriver.close();
    }
    if (mockRedisClient) {
      mockRedisClient.quit();
    }
    testTransactions.clear();
  } catch (error) {
    console.error('Failed to cleanup test databases:', error);
  }
};

/**
 * Create a test transaction
 */
export const createTestTransaction = (testId) => {
  const transaction = {
    id: testId,
    queries: [],
    mockQuery: (query, params = []) => {
      transaction.queries.push({ query, params });
      return Promise.resolve({
        rows: [],
        rowCount: 0,
      });
    },
    rollback: jest.fn(),
    commit: jest.fn(),
  };

  testTransactions.set(testId, transaction);
  return transaction;
};

/**
 * Get test transaction by ID
 */
export const getTestTransaction = (testId) => {
  return testTransactions.get(testId);
};

/**
 * Mock PostgreSQL responses
 */
export const mockPostgresResponse = (response) => {
  if (mockPgPool) {
    mockPgPool.query.mockResolvedValue(response);
  }
};

/**
 * Mock Neo4j responses
 */
export const mockNeo4jResponse = (response) => {
  if (mockNeo4jDriver) {
    const mockSession = mockNeo4jDriver.session();
    mockSession.run.mockResolvedValue(response);
  }
};

/**
 * Mock Redis responses
 */
export const mockRedisResponse = (key, value) => {
  if (mockRedisClient) {
    mockRedisClient.get.mockResolvedValue(value);
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.del.mockResolvedValue(1);
  }
};

/**
 * Create test data helpers
 */
export const createTestData = {
  /**
   * Create test conversation data
   */
  conversation: (overrides = {}) => ({
    id: 'test-conv-' + Math.random().toString(36).substr(2, 9),
    title: 'Test Conversation',
    participants: ['User1', 'User2'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      duration: 300,
      message_count: 10,
      language: 'en',
    },
    ...overrides,
  }),

  /**
   * Create test message data
   */
  message: (conversationId, overrides = {}) => ({
    id: 'test-msg-' + Math.random().toString(36).substr(2, 9),
    conversation_id: conversationId,
    speaker: 'Test User',
    text: 'This is a test message for cognitive analysis.',
    timestamp: new Date().toISOString(),
    metadata: {
      confidence: 0.95,
      sentiment: 'neutral',
    },
    ...overrides,
  }),

  /**
   * Create test analysis data
   */
  analysis: (conversationId, overrides = {}) => ({
    id: 'test-analysis-' + Math.random().toString(36).substr(2, 9),
    conversation_id: conversationId,
    dimensions: {
      factual_retrieval: { score: 0.92, confidence: 0.89 },
      logical_inference: { score: 0.85, confidence: 0.81 },
      creative_synthesis: { score: 0.60, confidence: 0.55 },
      meta_cognition: { score: 0.96, confidence: 0.93 },
    },
    graph_data: {
      nodes: [],
      edges: [],
    },
    metadata: {
      processing_time: 2.5,
      model_version: '1.0.0',
      created_at: new Date().toISOString(),
    },
    ...overrides,
  }),

  /**
   * Create test user data
   */
  user: (overrides = {}) => ({
    id: 'test-user-' + Math.random().toString(36).substr(2, 9),
    email: 'test@example.com',
    username: 'testuser',
    password_hash: '$2b$10$test.hash.value.here',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      subscription_tier: 'free',
      api_quota_used: 0,
    },
    ...overrides,
  }),
};

/**
 * Database query validation helpers
 */
export const validateQueries = {
  /**
   * Check if a specific query was called
   */
  queryCalled: (testId, expectedQuery) => {
    const transaction = getTestTransaction(testId);
    if (!transaction) return false;

    return transaction.queries.some(q =>
      q.query.toLowerCase().includes(expectedQuery.toLowerCase())
    );
  },

  /**
   * Get query parameters for a specific query
   */
  getQueryParams: (testId, expectedQuery) => {
    const transaction = getTestTransaction(testId);
    if (!transaction) return null;

    const query = transaction.queries.find(q =>
      q.query.toLowerCase().includes(expectedQuery.toLowerCase())
    );

    return query ? query.params : null;
  },

  /**
   * Count queries of a specific type
   */
  countQueries: (testId, queryType) => {
    const transaction = getTestTransaction(testId);
    if (!transaction) return 0;

    return transaction.queries.filter(q =>
      q.query.toLowerCase().includes(queryType.toLowerCase())
    ).length;
  },
};

/**
 * Performance testing utilities
 */
export const performanceTest = {
  /**
   * Measure query performance
   */
  measureQuery: async (queryFn, iterations = 1) => {
    const results = [];

    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await queryFn();
      const end = process.hrtime.bigint();

      results.push(Number(end - start) / 1000000); // Convert to milliseconds
    }

    return {
      average: results.reduce((a, b) => a + b, 0) / results.length,
      min: Math.min(...results),
      max: Math.max(...results),
      results,
    };
  },

  /**
   * Benchmark database operations
   */
  benchmarkOperation: async (operation, dataPoints = 100) => {
    const sizes = [10, 50, 100, 500, 1000];
    const results = {};

    for (const size of sizes) {
      const testData = Array.from({ length: size }, (_, i) => ({
        id: `test-${i}`,
        data: `test data ${i}`,
      }));

      const performance = await performanceTest.measureQuery(
        () => operation(testData),
        3 // Run 3 times and average
      );

      results[size] = performance;
    }

    return results;
  },
};

// Jest setup and teardown hooks
beforeAll(async () => {
  await setupTestDatabases();
});

afterAll(async () => {
  await cleanupTestDatabases();
});

beforeEach(() => {
  // Reset all mocks before each test
  if (mockPgPool) {
    mockPgPool.query.mockClear();
  }
  if (mockNeo4jDriver) {
    mockNeo4jDriver.session.mockClear();
  }
  if (mockRedisClient) {
    mockRedisClient.get.mockClear();
    mockRedisClient.set.mockClear();
    mockRedisClient.del.mockClear();
  }
});

afterEach(() => {
  // Clean up test transactions
  testTransactions.clear();
});

// Export database utilities for global use
global.testDatabase = {
  ...global.testDatabase,
  setupTestDatabases,
  cleanupTestDatabases,
  createTestTransaction,
  getTestTransaction,
  mockPostgresResponse,
  mockNeo4jResponse,
  mockRedisResponse,
  createTestData,
  validateQueries,
  performanceTest,
};