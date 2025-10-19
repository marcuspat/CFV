/**
 * Server setup utilities for API testing
 * Provides test server instance and HTTP client configuration
 */

import request from 'supertest';
import express from 'express';
import App from '../../src/server/app';

// Test server instance
let testApp = null;
let testServer = null;

/**
 * Create test Express app instance
 */
export const createTestApp = async () => {
  if (!testApp) {
    // Create new app instance for testing
    testApp = new App();

    // Override database initialization for testing
    testApp.initializeDatabase = async () => {
      // Mock database setup
      console.log('Mock database initialized for testing');
    };

    // Mock WebSocket initialization for testing
    testApp.initializeWebSocket = async () => {
      console.log('Mock WebSocket initialized for testing');
    };

    // Initialize app without starting server
    testApp.initializeMiddlewares();
    testApp.initializeRoutes();
    testApp.initializeErrorHandling();
  }

  return testApp;
};

/**
 * Start test server
 */
export const startTestServer = async (app) => {
  if (testServer) {
    return testServer;
  }

  testServer = app.server.listen(0); // Use random port

  return new Promise((resolve, reject) => {
    testServer.on('listening', () => {
      const address = testServer.address();
      const port = typeof address === 'string' ? address : address.port;
      resolve({ server: testServer, port });
    });

    testServer.on('error', reject);
  });
};

/**
 * Stop test server
 */
export const stopTestServer = async () => {
  if (testServer) {
    return new Promise((resolve) => {
      testServer.close(() => {
        testServer = null;
        resolve();
      });
    });
  }
};

/**
 * Create authenticated request
 */
export const createAuthenticatedRequest = (app, token) => {
  const agent = request.agent(app);
  if (token) {
    agent.set('Authorization', `Bearer ${token}`);
  }
  return agent;
};

/**
 * Test HTTP client utilities
 */
export const httpClient = {
  /**
   * Make GET request
   */
  get: async (app, url, options = {}) => {
    const req = request(app).get(url);

    if (options.token) {
      req.set('Authorization', `Bearer ${options.token}`);
    }

    if (options.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        req.set(key, value);
      });
    }

    return req;
  },

  /**
   * Make POST request
   */
  post: async (app, url, data = {}, options = {}) => {
    const req = request(app).post(url).send(data);

    if (options.token) {
      req.set('Authorization', `Bearer ${options.token}`);
    }

    if (options.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        req.set(key, value);
      });
    }

    if (options.files) {
      // Handle file uploads
      options.files.forEach((file, index) => {
        req.attach(`file${index}`, file.buffer, file.name);
      });
    }

    return req;
  },

  /**
   * Make PUT request
   */
  put: async (app, url, data = {}, options = {}) => {
    const req = request(app).put(url).send(data);

    if (options.token) {
      req.set('Authorization', `Bearer ${options.token}`);
    }

    if (options.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        req.set(key, value);
      });
    }

    return req;
  },

  /**
   * Make DELETE request
   */
  delete: async (app, url, options = {}) => {
    const req = request(app).delete(url);

    if (options.token) {
      req.set('Authorization', `Bearer ${options.token}`);
    }

    if (options.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        req.set(key, value);
      });
    }

    return req;
  },

  /**
   * Make PATCH request
   */
  patch: async (app, url, data = {}, options = {}) => {
    const req = request(app).patch(url).send(data);

    if (options.token) {
      req.set('Authorization', `Bearer ${options.token}`);
    }

    if (options.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        req.set(key, value);
      });
    }

    return req;
  },
};

/**
 * Response validation utilities
 */
export const validateResponse = {
  /**
   * Validate successful response
   */
  success: (response, expectedStatus = 200) => {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toBeDefined();
    expect(response.headers['content-type']).toMatch(/json/);
  },

  /**
   * Validate error response
   */
  error: (response, expectedStatus = 400) => {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('error');
    expect(response.headers['content-type']).toMatch(/json/);
  },

  /**
   * Validate pagination response
   */
  pagination: (response) => {
    validateResponse.success(response);
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('pagination');
    expect(response.body.pagination).toHaveProperty('page');
    expect(response.body.pagination).toHaveProperty('limit');
    expect(response.body.pagination).toHaveProperty('total');
    expect(response.body.pagination).toHaveProperty('totalPages');
  },

  /**
   * Validate cognitive analysis response
   */
  cognitiveAnalysis: (response) => {
    validateResponse.success(response);
    expect(response.body).toHaveProperty('dimensions');
    expect(response.body.dimensions).toHaveProperty('factual_retrieval');
    expect(response.body.dimensions).toHaveProperty('logical_inference');
    expect(response.body.dimensions).toHaveProperty('creative_synthesis');
    expect(response.body.dimensions).toHaveProperty('meta_cognition');

    // Validate score ranges
    Object.values(response.body.dimensions).forEach(dimension => {
      expect(dimension.score).toBeGreaterThanOrEqual(0);
      expect(dimension.score).toBeLessThanOrEqual(1);
      expect(dimension.confidence).toBeGreaterThanOrEqual(0);
      expect(dimension.confidence).toBeLessThanOrEqual(1);
    });
  },

  /**
   * Validate conversation response
   */
  conversation: (response) => {
    validateResponse.success(response);
    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('title');
    expect(response.body).toHaveProperty('participants');
    expect(response.body).toHaveProperty('messages');
    expect(response.body).toHaveProperty('metadata');
    expect(response.body.id).toBeValidUUID();
  },
};

/**
 * Test data generators
 */
export const generateTestData = {
  /**
   * Generate conversation data
   */
  conversation: (overrides = {}) => ({
    title: 'Test Conversation About AI Ethics',
    participants: ['User1', 'User2'],
    messages: [
      {
        speaker: 'User1',
        text: 'What are your thoughts on AI ethics?',
        timestamp: new Date().toISOString(),
        metadata: { confidence: 0.95 }
      },
      {
        speaker: 'User2',
        text: 'AI ethics is crucial for responsible development.',
        timestamp: new Date().toISOString(),
        metadata: { confidence: 0.88 }
      }
    ],
    metadata: {
      duration: 120,
      language: 'en',
      topic: 'AI ethics'
    },
    ...overrides
  }),

  /**
   * Generate user data
   */
  user: (overrides = {}) => ({
    email: 'test@example.com',
    username: 'testuser',
    password: 'TestPassword123!',
    full_name: 'Test User',
    ...overrides
  }),

  /**
   * Generate analysis request data
   */
  analysisRequest: (conversationId, overrides = {}) => ({
    conversation_id: conversationId,
    options: {
      include_graph_data: true,
      confidence_threshold: 0.7,
      models: ['factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition']
    },
    ...overrides
  }),

  /**
   * Generate export request data
   */
  exportRequest: (conversationId, overrides = {}) => ({
    conversation_id: conversationId,
    format: 'json',
    include_analysis: true,
    include_graph_data: true,
    ...overrides
  }),
};

/**
 * Rate limiting test utilities
 */
export const rateLimitTest = {
  /**
   * Test rate limiting by making multiple requests
   */
  testLimit: async (app, url, options = {}) => {
    const {
      requests = 10,
      delay = 100,
      expectedStatus = 429
    } = options;

    const results = [];

    for (let i = 0; i < requests; i++) {
      const response = await httpClient.get(app, url, options.authOptions);
      results.push({
        attempt: i + 1,
        status: response.status,
        headers: response.headers,
        body: response.body
      });

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return results;
  },

  /**
   * Check if rate limited responses have proper headers
   */
  validateRateLimitHeaders: (response) => {
    expect(response.headers).toHaveProperty('x-ratelimit-limit');
    expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    expect(response.headers).toHaveProperty('x-ratelimit-reset');
  },
};

/**
 * Authentication test utilities
 */
export const authTest = {
  /**
   * Test protected endpoint without authentication
   */
  testUnauthorized: async (app, url, method = 'get') => {
    const response = await httpClient[method](app, url);
    validateResponse.error(response, 401);
    expect(response.body.error).toContain('Unauthorized');
  },

  /**
   * Test protected endpoint with invalid token
   */
  testInvalidToken: async (app, url, method = 'get') => {
    const response = await httpClient[method](app, url, {
      token: 'invalid-token'
    });
    validateResponse.error(response, 401);
    expect(response.body.error).toContain('Invalid token');
  },

  /**
   * Test protected endpoint with valid token
   */
  testAuthorized: async (app, url, method = 'get', token, data) => {
    const response = await httpClient[method](app, url, {
      token,
      ...data
    });
    return response;
  },
};

// Jest setup and teardown hooks
beforeAll(async () => {
  // Create test app
  const app = await createTestApp();

  // Start test server
  const { server, port } = await startTestServer(app);

  // Make server and port available globally
  global.testServer = server;
  global.testPort = port;
  global.testApp = app;
});

afterAll(async () => {
  // Stop test server
  await stopTestServer();
});

// Export utilities for global use
global.testServer = {
  createTestApp,
  startTestServer,
  stopTestServer,
  createAuthenticatedRequest,
  httpClient,
  validateResponse,
  generateTestData,
  rateLimitTest,
  authTest,
};