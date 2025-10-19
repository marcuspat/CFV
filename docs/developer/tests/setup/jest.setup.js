/**
 * Jest global setup file for Cognitive Fabric Visualizer testing
 * Configures global test environment, mocks, and utilities
 */

import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Global test timeout
jest.setTimeout(30000);

// Mock console methods in tests to reduce noise
const originalConsole = { ...console };

beforeAll(() => {
  // Suppress console.log in tests unless explicitly needed
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();

  // Keep error logging for debugging
  console.error = (...args) => {
    originalConsole.error(...args);
  };
});

afterAll(() => {
  // Restore console methods
  Object.assign(console, originalConsole);
});

// Global test utilities
global.testUtils = {
  /**
   * Wait for a specified amount of time
   */
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Generate random test data
   */
  generateRandomId: () => `test-${Math.random().toString(36).substr(2, 9)}`,

  /**
   * Create test JWT token
   */
  createTestToken: (payload = {}) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      {
        userId: 'test-user-id',
        email: 'test@example.com',
        ...payload
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  },

  /**
   * Setup test database transaction
   */
  setupTransaction: async () => {
    // Will be implemented in database.setup.js
    return null;
  },

  /**
   * Cleanup test data
   */
  cleanup: async () => {
    // Cleanup any test-specific data
    return true;
  }
};

// Global mock configurations
global.mockResponses = {
  openai: {
    choices: [{
      message: {
        content: JSON.stringify({
          dimensions: {
            factual_retrieval: { score: 0.92 },
            logical_inference: { score: 0.85 },
            creative_synthesis: { score: 0.60 },
            meta_cognition: { score: 0.96 }
          }
        })
      }
    }]
  },
  claude: {
    content: [{
      text: JSON.stringify({
        dimensions: {
          factual_retrieval: { score: 0.92 },
          logical_inference: { score: 0.85 },
          creative_synthesis: { score: 0.60 },
          meta_cognition: { score: 0.96 }
        }
      })
    }]
  }
};

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in Tests:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in Tests:', error);
});

// Mock external services by default
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() }
    }
  })),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn()
}));

// Set timezone for consistent date testing
process.env.TZ = 'UTC';

// Add custom matchers for testing
expect.extend({
  toBeValidDate(received) {
    const pass = received instanceof Date && !isNaN(received.getTime());
    return {
      message: () => `expected ${received} to be a valid Date`,
      pass,
    };
  },

  toBeValidUUID(received) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    return {
      message: () => `expected ${received} to be a valid UUID`,
      pass,
    };
  },

  toHaveValidCognitiveScores(received) {
    const requiredDimensions = ['factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition'];

    if (!received || typeof received !== 'object') {
      return {
        message: () => `expected cognitive scores to be an object`,
        pass: false,
      };
    }

    const hasAllDimensions = requiredDimensions.every(dim =>
      received[dim] &&
      typeof received[dim].score === 'number' &&
      received[dim].score >= 0 &&
      received[dim].score <= 1
    );

    return {
      message: () => `expected cognitive scores to have all required dimensions with valid scores`,
      pass: hasAllDimensions,
    };
  }
});

// Global test database setup helpers
global.testDatabase = {
  /**
   * Create test conversation
   */
  createTestConversation: async (overrides = {}) => {
    const baseConversation = {
      id: global.testUtils.generateRandomId(),
      title: 'Test Conversation',
      participants: ['Test User'],
      messages: [],
      metadata: {
        duration: 0,
        language: 'en'
      },
      ...overrides
    };

    return baseConversation;
  },

  /**
   * Create test analysis
   */
  createTestAnalysis: async (conversationId, overrides = {}) => {
    const baseAnalysis = {
      id: global.testUtils.generateRandomId(),
      conversation_id: conversationId,
      dimensions: {
        factual_retrieval: { score: 0.92, confidence: 0.89 },
        logical_inference: { score: 0.85, confidence: 0.81 },
        creative_synthesis: { score: 0.60, confidence: 0.55 },
        meta_cognition: { score: 0.96, confidence: 0.93 }
      },
      graph_data: {
        nodes: [],
        edges: []
      },
      metadata: {
        processing_time: 2.5,
        model_version: '1.0.0'
      },
      ...overrides
    };

    return baseAnalysis;
  }
};

// Performance monitoring utilities
global.performanceMonitor = {
  measurements: new Map(),

  start: (label) => {
    const start = process.hrtime.bigint();
    global.performanceMonitor.measurements.set(label, { start });
  },

  end: (label) => {
    const measurement = global.performanceMonitor.measurements.get(label);
    if (!measurement) {
      throw new Error(`No measurement found for label: ${label}`);
    }

    const end = process.hrtime.bigint();
    const duration = Number(end - measurement.start) / 1000000; // Convert to milliseconds

    global.performanceMonitor.measurements.set(label, {
      ...measurement,
      end,
      duration
    });

    return duration;
  },

  get: (label) => {
    return global.performanceMonitor.measurements.get(label);
  },

  clear: () => {
    global.performanceMonitor.measurements.clear();
  }
};

// Global WebSocket mock helpers
global.webSocketHelpers = {
  createMockWebSocket: () => ({
    send: jest.fn(),
    on: jest.fn(),
    close: jest.fn(),
    readyState: 1, // WebSocket.OPEN
    OPEN: 1,
    CLOSED: 3
  }),

  simulateConnection: (ws) => {
    ws.readyState = 1; // OPEN
    ws.on('open', () => {});
  },

  simulateMessage: (ws, data) => {
    ws.on('message', JSON.stringify(data));
  },

  simulateClose: (ws) => {
    ws.readyState = 3; // CLOSED
    ws.on('close', { code: 1000, reason: 'Normal closure' });
  }
};