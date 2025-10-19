/**
 * Mock setup for external services and dependencies
 * Configures comprehensive mocks for APIs, databases, and services
 */

// External API mocks
jest.mock('openai', () => {
  return {
    OpenAI: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: JSON.stringify({
                  dimensions: {
                    factual_retrieval: { score: 0.92, confidence: 0.89 },
                    logical_inference: { score: 0.85, confidence: 0.81 },
                    creative_synthesis: { score: 0.60, confidence: 0.55 },
                    meta_cognition: { score: 0.96, confidence: 0.93 }
                  }
                })
              }
            }]
          })
        }
      },
      models: {
        list: jest.fn().mockResolvedValue({
          data: [
            { id: 'gpt-4', object: 'model' },
            { id: 'gpt-3.5-turbo', object: 'model' }
          ]
        })
      }
    }))
  };
});

jest.mock('@anthropic-ai/sdk', () => {
  return {
    Anthropic: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{
            text: JSON.stringify({
              dimensions: {
                factual_retrieval: { score: 0.90, confidence: 0.87 },
                logical_inference: { score: 0.83, confidence: 0.79 },
                creative_synthesis: { score: 0.58, confidence: 0.53 },
                meta_cognition: { score: 0.94, confidence: 0.91 }
              }
            })
          }]
        })
      }
    }))
  };
});

// Database mocks
jest.mock('pg', () => {
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  };

  return {
    Pool: jest.fn(() => mockPool)
  };
});

jest.mock('neo4j-driver', () => {
  const mockDriver = {
    session: jest.fn(() => ({
      run: jest.fn().mockResolvedValue({ records: [] }),
      close: jest.fn(),
    })),
    close: jest.fn(),
  };

  return {
    driver: jest.fn(() => mockDriver),
    int: jest.fn((value) => ({ toNumber: () => value })),
  };
});

jest.mock('redis', () => {
  const mockClient = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    flushdb: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn(),
    connect: jest.fn(),
    on: jest.fn(),
  };

  return {
    createClient: jest.fn(() => mockClient)
  };
});

// File system mocks
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn(),
  readdir: jest.fn(),
}));

// WebSocket mock
jest.mock('ws', () => {
  const mockWebSocket = {
    send: jest.fn(),
    on: jest.fn(),
    close: jest.fn(),
    readyState: 1, // WebSocket.OPEN
    OPEN: 1,
    CLOSED: 3,
  };

  const mockWebSocketServer = {
    clients: new Set(),
    on: jest.fn(),
    close: jest.fn(),
  };

  return {
    WebSocket: jest.fn(() => mockWebSocket),
    WebSocketServer: jest.fn(() => mockWebSocketServer),
  };
});

// JWT mock
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn((payload, secret, options) => 'mock-jwt-token'),
  verify: jest.fn((token, secret) => ({
    userId: 'test-user-id',
    email: 'test@example.com',
    iat: Date.now() / 1000,
    exp: (Date.now() / 1000) + 3600,
  })),
}));

// bcrypt mock
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$mock.hashed.password'),
  compare: jest.fn().mockResolvedValue(true),
}));

// UUID mock
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-v4'),
  v1: jest.fn(() => 'mock-uuid-v1'),
}));

// File upload mock
jest.mock('multer', () => {
  const mockMulter = {
    single: jest.fn(() => (req, res, next) => {
      req.file = {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 1024,
        buffer: Buffer.from('test file content'),
      };
      next();
    }),
    array: jest.fn(() => (req, res, next) => {
      req.files = [];
      next();
    }),
  };

  return jest.fn(() => mockMulter);
});

// Logger mock
jest.mock('../src/server/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// Email service mock
jest.mock('../src/server/services/email', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
}));

// File storage mock
jest.mock('../src/server/services/storage', () => ({
  uploadFile: jest.fn().mockResolvedValue({
    url: 'https://mock-storage.com/file.txt',
    key: 'uploads/test/file.txt',
    etag: 'mock-etag',
  }),
  deleteFile: jest.fn().mockResolvedValue(true),
  getFileUrl: jest.fn().mockResolvedValue('https://mock-storage.com/file.txt'),
}));

// Configuration mock
jest.mock('../src/server/config', () => ({
  config: {
    NODE_ENV: 'test',
    PORT: 3001,
    JWT_SECRET: 'test-jwt-secret',
    JWT_EXPIRES_IN: '1h',
    BCRYPT_ROUNDS: 10,
    OPENAI_API_KEY: 'test-openai-key',
    CLAUDE_API_KEY: 'test-claude-key',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: 5432,
    POSTGRES_DB: 'cfv_test',
    POSTGRES_USER: 'test_user',
    POSTGRES_PASSWORD: 'test_password',
    NEO4J_URI: 'bolt://localhost:7687',
    NEO4J_DB: 'cfv_test',
    NEO4J_USER: 'neo4j',
    NEO4J_PASSWORD: 'test_password',
  },
  getServerConfig: jest.fn(() => ({
    cors: { origin: 'http://localhost:3000' },
    helmet: {},
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 100,
    },
  })),
  getWebSocketConfig: jest.fn(() => ({
    maxConnections: 100,
    heartbeat: 30000,
  })),
}));

// Mock responses for different scenarios
export const mockResponses = {
  /**
   * Mock successful cognitive analysis response
   */
  cognitiveAnalysis: {
    dimensions: {
      factual_retrieval: { score: 0.92, confidence: 0.89 },
      logical_inference: { score: 0.85, confidence: 0.81 },
      creative_synthesis: { score: 0.60, confidence: 0.55 },
      meta_cognition: { score: 0.96, confidence: 0.93 },
    },
    graph_data: {
      nodes: [
        { id: 'n1', type: 'fact', label: 'AI transformation' },
        { id: 'n2', type: 'premise', label: 'Industry impact' },
      ],
      edges: [
        { source: 'n1', target: 'n2', type: 'supports', weight: 0.8 },
      ],
    },
    metadata: {
      processing_time: 2.5,
      model_version: '1.0.0',
      timestamp: new Date().toISOString(),
    },
  },

  /**
   * Mock database conversation response
   */
  conversation: {
    id: 'test-conversation-id',
    title: 'Test Conversation',
    participants: ['User1', 'User2'],
    messages: [],
    metadata: {
      duration: 300,
      language: 'en',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  /**
   * Mock user response
   */
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    username: 'testuser',
    full_name: 'Test User',
    metadata: {
      subscription_tier: 'free',
      api_quota_used: 0,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  /**
   * Mock error responses
   */
  errors: {
    unauthorized: {
      error: 'Unauthorized',
      message: 'Invalid or missing authentication token',
      timestamp: new Date().toISOString(),
    },
    notFound: {
      error: 'Not Found',
      message: 'Resource not found',
      timestamp: new Date().toISOString(),
    },
    validation: {
      error: 'Validation Error',
      message: 'Invalid input data',
      details: [],
      timestamp: new Date().toISOString(),
    },
    rateLimit: {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
      retryAfter: 60,
      timestamp: new Date().toISOString(),
    },
  },
};

/**
 * Mock helper functions
 */
export const mockHelpers = {
  /**
   * Setup OpenAI mock response
   */
  setupOpenAIResponse: (response = mockResponses.cognitiveAnalysis) => {
    const OpenAI = require('openai').OpenAI;
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify(response)
        }
      }]
    });

    OpenAI.mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate
        }
      }
    }));

    return mockCreate;
  },

  /**
   * Setup Claude mock response
   */
  setupClaudeResponse: (response = mockResponses.cognitiveAnalysis) => {
    const Anthropic = require('@anthropic-ai/sdk').Anthropic;
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{
        text: JSON.stringify(response)
      }]
    });

    Anthropic.mockImplementation(() => ({
      messages: {
        create: mockCreate
      }
    }));

    return mockCreate;
  },

  /**
   * Setup PostgreSQL mock response
   */
  setupPostgresResponse: (response = { rows: [], rowCount: 0 }) => {
    const { Pool } = require('pg');
    const mockQuery = jest.fn().mockResolvedValue(response);
    Pool.mockImplementation(() => ({
      query: mockQuery,
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    }));

    return mockQuery;
  },

  /**
   * Setup Redis mock response
   */
  setupRedisResponse: (response = null) => {
    const { createClient } = require('redis');
    const mockGet = jest.fn().mockResolvedValue(response);
    const mockSet = jest.fn().mockResolvedValue('OK');

    createClient.mockImplementation(() => ({
      get: mockGet,
      set: mockSet,
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0),
      flushdb: jest.fn().mockResolvedValue('OK'),
      quit: jest.fn(),
      connect: jest.fn(),
      on: jest.fn(),
    }));

    return { get: mockGet, set: mockSet };
  },

  /**
   * Setup WebSocket mock
   */
  setupWebSocketMock: () => {
    const mockWebSocket = {
      send: jest.fn(),
      on: jest.fn(),
      close: jest.fn(),
      readyState: 1,
      OPEN: 1,
      CLOSED: 3,
    };

    const mockWebSocketServer = {
      clients: new Set([mockWebSocket]),
      on: jest.fn(),
      close: jest.fn(),
    };

    return { websocket: mockWebSocket, server: mockWebSocketServer };
  },

  /**
   * Reset all mocks
   */
  resetAllMocks: () => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  },
};

// Make mock helpers available globally
global.mockResponses = mockResponses;
global.mockHelpers = mockHelpers;