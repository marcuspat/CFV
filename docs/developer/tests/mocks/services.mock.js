/**
 * Mock implementations for external services and dependencies
 * Provides comprehensive mocks for OpenAI, Claude, databases, and other services
 */

export class MockOpenAIService {
  constructor(options = {}) {
    this.options = {
      responseDelay: options.responseDelay || 100,
      errorRate: options.errorRate || 0,
      shouldTimeout: options.shouldTimeout || false,
      responses: options.responses || {},
      ...options
    };
    this.requestCount = 0;
  }

  async chatCompletions(request) {
    this.requestCount++;

    // Simulate response delay
    if (this.options.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.options.responseDelay));
    }

    // Simulate timeout
    if (this.options.shouldTimeout) {
      throw new Error('Request timeout');
    }

    // Simulate random errors
    if (Math.random() < this.options.errorRate) {
      throw new Error('Simulated API error');
    }

    // Return mock response
    return this.generateMockResponse(request);
  }

  generateMockResponse(request) {
    const mockResponses = {
      'factual_retrieval': {
        score: 0.85 + Math.random() * 0.15, // 0.85-1.0
        confidence: 0.80 + Math.random() * 0.15, // 0.80-0.95
        elements: [
          {
            type: 'fact',
            text: 'AI healthcare applications require careful validation',
            confidence: 0.90,
            source: 'User1'
          },
          {
            type: 'fact',
            text: 'Patient privacy is protected by HIPAA regulations',
            confidence: 0.95,
            source: 'User2'
          }
        ]
      },
      'logical_inference': {
        score: 0.75 + Math.random() * 0.20, // 0.75-0.95
        confidence: 0.70 + Math.random() * 0.20, // 0.70-0.90
        arguments: [
          {
            type: 'premise',
            text: 'AI systems can process medical data efficiently',
            confidence: 0.85
          },
          {
            type: 'conclusion',
            text: 'Healthcare outcomes can be improved with AI assistance',
            confidence: 0.80
          }
        ]
      },
      'creative_synthesis': {
        score: 0.50 + Math.random() * 0.30, // 0.50-0.80
        confidence: 0.45 + Math.random() * 0.30, // 0.45-0.75
        novelty_score: 0.60 + Math.random() * 0.25,
        insights: [
          'AI could enable personalized treatment plans',
          'Predictive analytics might revolutionize preventive care'
        ]
      },
      'meta_cognition': {
        score: 0.90 + Math.random() * 0.10, // 0.90-1.0
        confidence: 0.85 + Math.random() * 0.15, // 0.85-1.0
        strategies: ['ethical_reasoning', 'risk_assessment', 'stakeholder_consideration'],
        monitoring_level: 'high'
      }
    };

    const analysis = {
      dimensions: mockResponses,
      metadata: {
        processing_time: 1.5 + Math.random() * 2, // 1.5-3.5 seconds
        model_version: 'gpt-4-1106-preview',
        token_usage: {
          prompt_tokens: 150 + Math.floor(Math.random() * 200),
          completion_tokens: 100 + Math.floor(Math.random() * 150),
          total_tokens: 250 + Math.floor(Math.random() * 350)
        },
        confidence_threshold: request.temperature || 0.7
      }
    };

    return {
      id: `chatcmpl-${Math.random().toString(36).substr(2, 9)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.model || 'gpt-4',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify(analysis)
        },
        finish_reason: 'stop'
      }],
      usage: analysis.metadata.token_usage
    };
  }

  async modelsList() {
    return {
      object: 'list',
      data: [
        { id: 'gpt-4', object: 'model', created: 1687882410, owned_by: 'openai' },
        { id: 'gpt-4-0613', object: 'model', created: 1686588898, owned_by: 'openai' },
        { id: 'gpt-3.5-turbo', object: 'model', created: 1677610602, owned_by: 'openai' },
        { id: 'gpt-3.5-turbo-16k', object: 'model', created: 1683758102, owned_by: 'openai' }
      ]
    };
  }

  getRequestCount() {
    return this.requestCount;
  }

  reset() {
    this.requestCount = 0;
  }
}

export class MockClaudeService {
  constructor(options = {}) {
    this.options = {
      responseDelay: options.responseDelay || 150,
      errorRate: options.errorRate || 0,
      shouldTimeout: options.shouldTimeout || false,
      responses: options.responses || {},
      ...options
    };
    this.requestCount = 0;
  }

  async messagesCreate(request) {
    this.requestCount++;

    // Simulate response delay
    if (this.options.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.options.responseDelay));
    }

    // Simulate timeout
    if (this.options.shouldTimeout) {
      throw new Error('Request timeout');
    }

    // Simulate random errors
    if (Math.random() < this.options.errorRate) {
      throw new Error('Simulated API error');
    }

    return this.generateMockResponse(request);
  }

  generateMockResponse(request) {
    const mockResponses = {
      'factual_retrieval': {
        score: 0.82 + Math.random() * 0.18, // 0.82-1.0
        confidence: 0.78 + Math.random() * 0.17, // 0.78-0.95
        elements: [
          {
            type: 'fact',
            text: 'Machine learning algorithms require diverse training data',
            confidence: 0.88,
            source: 'User1'
          }
        ]
      },
      'logical_inference': {
        score: 0.72 + Math.random() * 0.23, // 0.72-0.95
        confidence: 0.68 + Math.random() * 0.22, // 0.68-0.90
        arguments: [
          {
            type: 'causal_link',
            text: 'Bias in training data leads to biased model outputs',
            confidence: 0.87
          }
        ]
      },
      'creative_synthesis': {
        score: 0.48 + Math.random() * 0.32, // 0.48-0.80
        confidence: 0.43 + Math.random() * 0.32, // 0.43-0.75
        novelty_score: 0.58 + Math.random() * 0.27,
        insights: [
          'Novel approaches to bias detection could emerge from interdisciplinary research',
          'Cognitive diversity in development teams enhances ethical AI design'
        ]
      },
      'meta_cognition': {
        score: 0.88 + Math.random() * 0.12, // 0.88-1.0
        confidence: 0.83 + Math.random() * 0.17, // 0.83-1.0
        strategies: ['critical_thinking', 'ethical_frameworks', 'interdisciplinary_approach'],
        reflection_depth: 'deep'
      }
    };

    const analysis = {
      dimensions: mockResponses,
      metadata: {
        processing_time: 2.0 + Math.random() * 2.5, // 2.0-4.5 seconds
        model_version: 'claude-3-sonnet-20240229',
        token_usage: {
          input_tokens: 120 + Math.floor(Math.random() * 180),
          output_tokens: 80 + Math.floor(Math.random() * 120)
        },
        confidence_threshold: request.temperature || 0.7
      }
    };

    return {
      id: `msg_${Math.random().toString(36).substr(2, 9)}`,
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'text',
        text: JSON.stringify(analysis)
      }],
      model: request.model || 'claude-3-sonnet-20240229',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: analysis.metadata.token_usage.input_tokens,
        output_tokens: analysis.metadata.token_usage.output_tokens
      }
    };
  }

  getRequestCount() {
    return this.requestCount;
  }

  reset() {
    this.requestCount = 0;
  }
}

export class MockDatabaseService {
  constructor(options = {}) {
    this.options = {
      responseDelay: options.responseDelay || 10,
      errorRate: options.errorRate || 0,
      data: options.data || {},
      ...options
    };
    this.data = new Map();
    this.queryCount = 0;
  }

  async query(sql, params = []) {
    this.queryCount++;

    // Simulate response delay
    if (this.options.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.options.responseDelay));
    }

    // Simulate random errors
    if (Math.random() < this.options.errorRate) {
      throw new Error('Database query error');
    }

    // Parse SQL and return mock data
    return this.parseQuery(sql, params);
  }

  parseQuery(sql, params) {
    const lowerSql = sql.toLowerCase();

    if (lowerSql.includes('insert into conversations')) {
      const conversationId = this.generateId();
      const conversation = {
        id: conversationId,
        title: params[0] || 'Test Conversation',
        participants: JSON.parse(params[1] || '[]'),
        metadata: JSON.parse(params[2] || '{}'),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.data.set(`conversation:${conversationId}`, conversation);

      return {
        rows: [{ id: conversationId }],
        rowCount: 1
      };
    }

    if (lowerSql.includes('select * from conversations')) {
      const conversations = Array.from(this.data.entries())
        .filter(([key]) => key.startsWith('conversation:'))
        .map(([, value]) => value);

      return {
        rows: conversations,
        rowCount: conversations.length
      };
    }

    if (lowerSql.includes('insert into users')) {
      const userId = this.generateId();
      const user = {
        id: userId,
        email: params[0],
        username: params[1],
        password_hash: params[2],
        full_name: params[3],
        metadata: JSON.parse(params[4] || '{}'),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.data.set(`user:${userId}`, user);

      return {
        rows: [{ id: userId }],
        rowCount: 1
      };
    }

    // Default empty response
    return {
      rows: [],
      rowCount: 0
    };
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  getQueryCount() {
    return this.queryCount;
  }

  reset() {
    this.queryCount = 0;
    this.data.clear();
  }
}

export class MockNeo4jService {
  constructor(options = {}) {
    this.options = {
      responseDelay: options.responseDelay || 20,
      errorRate: options.errorRate || 0,
      data: options.data || {},
      ...options
    };
    this.nodes = new Map();
    this.relationships = new Map();
    this.queryCount = 0;
  }

  async run(query, params = {}) {
    this.queryCount++;

    // Simulate response delay
    if (this.options.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.options.responseDelay));
    }

    // Simulate random errors
    if (Math.random() < this.options.errorRate) {
      throw new Error('Neo4j query error');
    }

    return this.parseCypherQuery(query, params);
  }

  parseCypherQuery(query, params) {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('create') && lowerQuery.includes('conversation')) {
      const nodeId = this.generateId();
      const node = {
        identity: parseInt(nodeId),
        labels: ['Conversation'],
        properties: {
          id: params.id || `conv-${nodeId}`,
          title: params.title || 'Test Conversation',
          created_at: new Date().toISOString()
        }
      };
      this.nodes.set(nodeId, node);

      return {
        records: [new MockRecord(node)]
      };
    }

    if (lowerQuery.includes('match') && lowerQuery.includes('conversation')) {
      const nodes = Array.from(this.nodes.values())
        .filter(node => node.labels.includes('Conversation'));

      return {
        records: nodes.map(node => new MockRecord(node))
      };
    }

    if (lowerQuery.includes('create') && lowerQuery.includes('analysis')) {
      const relId = this.generateId();
      const relationship = {
        identity: parseInt(relId),
        start: parseInt(params.conversationId),
        end: parseInt(relId), // Analysis node
        type: 'HAS_ANALYSIS',
        properties: {
          id: params.analysisId || `analysis-${relId}`,
          created_at: new Date().toISOString()
        }
      };
      this.relationships.set(relId, relationship);

      return {
        records: [new MockRecord(relationship)]
      };
    }

    // Default empty response
    return {
      records: []
    };
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  getQueryCount() {
    return this.queryCount;
  }

  reset() {
    this.queryCount = 0;
    this.nodes.clear();
    this.relationships.clear();
  }
}

export class MockRedisService {
  constructor(options = {}) {
    this.options = {
      responseDelay: options.responseDelay || 5,
      errorRate: options.errorRate || 0,
      ...options
    };
    this.data = new Map();
    this.operationCount = 0;
  }

  async connect() {
    // Mock connection
    return Promise.resolve();
  }

  async get(key) {
    this.operationCount++;

    if (this.options.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.options.responseDelay));
    }

    if (Math.random() < this.options.errorRate) {
      throw new Error('Redis get error');
    }

    return this.data.get(key) || null;
  }

  async set(key, value, options = {}) {
    this.operationCount++;

    if (this.options.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.options.responseDelay));
    }

    if (Math.random() < this.options.errorRate) {
      throw new Error('Redis set error');
    }

    this.data.set(key, value);

    if (options.ex) {
      setTimeout(() => {
        this.data.delete(key);
      }, options.ex * 1000);
    }

    return 'OK';
  }

  async setEx(key, seconds, value) {
    return this.set(key, value, { ex: seconds });
  }

  async del(key) {
    this.operationCount++;

    if (this.options.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.options.responseDelay));
    }

    if (Math.random() < this.options.errorRate) {
      throw new Error('Redis del error');
    }

    const existed = this.data.has(key);
    this.data.delete(key);
    return existed ? 1 : 0;
  }

  async hGet(key, field) {
    this.operationCount++;

    if (this.options.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.options.responseDelay));
    }

    const hash = this.data.get(key) || {};
    return hash[field] || null;
  }

  async hSet(key, field, value) {
    this.operationCount++;

    if (this.options.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.options.responseDelay));
    }

    const hash = this.data.get(key) || {};
    hash[field] = value;
    this.data.set(key, hash);
    return 1;
  }

  async hGetAll(key) {
    this.operationCount++;

    if (this.options.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.options.responseDelay));
    }

    return this.data.get(key) || {};
  }

  async exists(key) {
    this.operationCount++;
    return this.data.has(key) ? 1 : 0;
  }

  async ping() {
    return 'PONG';
  }

  async quit() {
    // Mock disconnect
    return Promise.resolve();
  }

  getOperationCount() {
    return this.operationCount;
  }

  reset() {
    this.operationCount = 0;
    this.data.clear();
  }
}

// Mock record class for Neo4j
class MockRecord {
  constructor(data) {
    this.keys = Object.keys(data);
    this._data = data;
  }

  get(key) {
    if (key === 'n' || key === 'r') {
      return new MockNode(this._data);
    }
    return this._data[key];
  }

  toObject() {
    return this._data;
  }
}

class MockNode {
  constructor(properties) {
    this.properties = properties;
    this.labels = properties.labels || [];
  }

  get(property) {
    return this.properties[property];
  }
}

// Service factory for creating mock services
export class MockServiceFactory {
  constructor() {
    this.services = new Map();
  }

  createOpenAIService(options = {}) {
    const service = new MockOpenAIService(options);
    this.services.set('openai', service);
    return service;
  }

  createClaudeService(options = {}) {
    const service = new MockClaudeService(options);
    this.services.set('claude', service);
    return service;
  }

  createDatabaseService(options = {}) {
    const service = new MockDatabaseService(options);
    this.services.set('database', service);
    return service;
  }

  createNeo4jService(options = {}) {
    const service = new MockNeo4jService(options);
    this.services.set('neo4j', service);
    return service;
  }

  createRedisService(options = {}) {
    const service = new MockRedisService(options);
    this.services.set('redis', service);
    return service;
  }

  getService(name) {
    return this.services.get(name);
  }

  getAllServices() {
    return Array.from(this.services.entries());
  }

  resetAll() {
    this.services.forEach(service => {
      if (service.reset) {
        service.reset();
      }
    });
  }

  getServiceStats() {
    const stats = {};
    this.services.forEach((service, name) => {
      stats[name] = {
        queryCount: service.getQueryCount?.() || service.getRequestCount?.() || service.getOperationCount?.() || 0
      };
    });
    return stats;
  }
}

// Export a singleton instance
export const mockServiceFactory = new MockServiceFactory();

// Helper functions for common mock scenarios
export const mockScenarios = {
  /**
   * Create a successful cognitive analysis scenario
   */
  successfulAnalysis: (options = {}) => {
    return {
      openai: mockServiceFactory.createOpenAIService({
        responseDelay: 100,
        errorRate: 0,
        ...options.openai
      }),
      claude: mockServiceFactory.createClaudeService({
        responseDelay: 150,
        errorRate: 0,
        ...options.claude
      })
    };
  },

  /**
   * Create a scenario with service failures
   */
  serviceFailures: (options = {}) => {
    return {
      openai: mockServiceFactory.createOpenAIService({
        errorRate: 0.3,
        responseDelay: 5000,
        ...options.openai
      }),
      claude: mockServiceFactory.createClaudeService({
        errorRate: 0.2,
        shouldTimeout: true,
        ...options.claude
      })
    };
  },

  /**
   * Create a high-latency scenario
   */
  highLatency: (options = {}) => {
    return {
      openai: mockServiceFactory.createOpenAIService({
        responseDelay: 2000,
        ...options.openai
      }),
      claude: mockServiceFactory.createClaudeService({
        responseDelay: 3000,
        ...options.claude
      }),
      database: mockServiceFactory.createDatabaseService({
        responseDelay: 100,
        ...options.database
      }),
      redis: mockServiceFactory.createRedisService({
        responseDelay: 50,
        ...options.redis
      })
    };
  },

  /**
   * Create a scenario with rate limiting
   */
  rateLimited: (options = {}) => {
    let requestCount = 0;
    return {
      openai: mockServiceFactory.createOpenAIService({
        errorRate: 0.1,
        responses: {
          default: () => {
            requestCount++;
            if (requestCount > 10) {
              throw new Error('Rate limit exceeded');
            }
            return mockServiceFactory.getService('openai').generateMockResponse({});
          }
        },
        ...options.openai
      })
    };
  }
};