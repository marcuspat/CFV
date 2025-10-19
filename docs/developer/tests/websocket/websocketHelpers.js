/**
 * WebSocket testing utilities and helpers
 * Provides helper functions for WebSocket testing scenarios
 */

import WebSocket from 'ws';

/**
 * WebSocket Test Helper Class
 */
export class WebSocketTestHelper {
  constructor(wsUrl, authToken) {
    this.wsUrl = wsUrl;
    this.authToken = authToken;
    this.connections = new Map();
    this.messageHandlers = new Map();
    this.connectionCount = 0;
  }

  /**
   * Create a new WebSocket connection with authentication
   */
  async createConnection(options = {}) {
    const connectionId = options.id || `conn_${this.connectionCount++}`;

    const ws = new WebSocket(this.wsUrl, {
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        ...options.headers
      },
      ...options.wsOptions
    });

    const connection = {
      id: connectionId,
      ws,
      messages: [],
      eventLog: [],
      isOpen: false,
      closePromise: null
    };

    // Store connection
    this.connections.set(connectionId, connection);

    // Set up event handlers
    ws.on('open', () => {
      connection.isOpen = true;
      connection.eventLog.push({ type: 'open', timestamp: Date.now() });
      this.emit(connectionId, 'open');
    });

    ws.on('message', (data) => {
      const message = this.parseMessage(data);
      connection.messages.push({
        ...message,
        timestamp: Date.now()
      });
      connection.eventLog.push({ type: 'message', data: message, timestamp: Date.now() });
      this.emit(connectionId, 'message', message);
    });

    ws.on('close', (code, reason) => {
      connection.isOpen = false;
      connection.eventLog.push({ type: 'close', code, reason: reason.toString(), timestamp: Date.now() });
      this.emit(connectionId, 'close', { code, reason });
    });

    ws.on('error', (error) => {
      connection.eventLog.push({ type: 'error', error: error.message, timestamp: Date.now() });
      this.emit(connectionId, 'error', error);
    });

    // Create close promise for cleanup
    connection.closePromise = new Promise((resolve) => {
      ws.on('close', resolve);
    });

    return connectionId;
  }

  /**
   * Parse WebSocket message safely
   */
  parseMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      return {
        type: 'json',
        data: message,
        raw: data.toString()
      };
    } catch (error) {
      return {
        type: 'raw',
        data: data.toString(),
        raw: data.toString(),
        error: error.message
      };
    }
  }

  /**
   * Send message through WebSocket connection
   */
  async sendMessage(connectionId, message) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    if (!connection.isOpen) {
      throw new Error(`Connection ${connectionId} is not open`);
    }

    const messageString = typeof message === 'string' ? message : JSON.stringify(message);
    connection.ws.send(messageString);
    connection.eventLog.push({ type: 'sent', data: message, timestamp: Date.now() });
  }

  /**
   * Wait for specific message type
   */
  async waitForMessage(connectionId, messageType, timeout = 5000) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.off(connectionId, 'message', messageHandler);
        reject(new Error(`Timeout waiting for message type: ${messageType}`));
      }, timeout);

      const messageHandler = (message) => {
        if (message.data && message.data.type === messageType) {
          clearTimeout(timeoutId);
          this.off(connectionId, 'message', messageHandler);
          resolve(message);
        }
      };

      // Check if message already exists
      const existingMessage = connection.messages.find(m =>
        m.data && m.data.type === messageType
      );
      if (existingMessage) {
        clearTimeout(timeoutId);
        resolve(existingMessage);
      } else {
        this.on(connectionId, 'message', messageHandler);
      }
    });
  }

  /**
   * Wait for connection to open
   */
  async waitForOpen(connectionId, timeout = 5000) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    if (connection.isOpen) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.off(connectionId, 'open', openHandler);
        reject(new Error(`Connection ${connectionId} failed to open within ${timeout}ms`));
      }, timeout);

      const openHandler = () => {
        clearTimeout(timeoutId);
        this.off(connectionId, 'open', openHandler);
        resolve();
      };

      this.on(connectionId, 'open', openHandler);
    });
  }

  /**
   * Wait for connection to close
   */
  async waitForClose(connectionId, timeout = 5000) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    if (!connection.isOpen && connection.eventLog.some(e => e.type === 'close')) {
      return;
    }

    return connection.closePromise || new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Connection ${connectionId} failed to close within ${timeout}ms`));
      }, timeout);

      this.on(connectionId, 'close', () => {
        clearTimeout(timeoutId);
        resolve();
      });
    });
  }

  /**
   * Subscribe to conversation updates
   */
  async subscribeToConversation(connectionId, conversationId) {
    await this.waitForOpen(connectionId);
    await this.sendMessage(connectionId, {
      type: 'subscribe_conversation',
      data: { conversation_id: conversationId }
    });
  }

  /**
   * Subscribe to analysis updates
   */
  async subscribeToAnalysis(connectionId, conversationId) {
    await this.waitForOpen(connectionId);
    await this.sendMessage(connectionId, {
      type: 'subscribe_analysis',
      data: { conversation_id: conversationId }
    });
  }

  /**
   * Subscribe to graph updates
   */
  async subscribeToGraph(connectionId, conversationId) {
    await this.waitForOpen(connectionId);
    await this.sendMessage(connectionId, {
      type: 'subscribe_graph',
      data: { conversation_id: conversationId }
    });
  }

  /**
   * Send ping message
   */
  async ping(connectionId, data = {}) {
    await this.waitForOpen(connectionId);
    await this.sendMessage(connectionId, {
      type: 'ping',
      data: { timestamp: Date.now(), ...data }
    });
  }

  /**
   * Wait for pong response
   */
  async waitForPong(connectionId, timeout = 5000) {
    return this.waitForMessage(connectionId, 'pong', timeout);
  }

  /**
   * Close connection
   */
  async closeConnection(connectionId, code = 1000, reason = 'Normal closure') {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    if (connection.isOpen) {
      connection.ws.close(code, reason);
    }

    return this.waitForClose(connectionId);
  }

  /**
   * Close all connections
   */
  async closeAllConnections() {
    const closePromises = Array.from(this.connections.keys()).map(id =>
      this.closeConnection(id).catch(() => {}) // Ignore errors during cleanup
    );
    await Promise.all(closePromises);
    this.connections.clear();
    this.messageHandlers.clear();
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    return {
      id: connectionId,
      isOpen: connection.isOpen,
      messageCount: connection.messages.length,
      eventCount: connection.eventLog.length,
      lastActivity: connection.eventLog.length > 0
        ? connection.eventLog[connection.eventLog.length - 1].timestamp
        : null,
      messagesByType: this.groupMessagesByType(connection.messages),
      eventsByType: this.groupEventsByType(connection.eventLog)
    };
  }

  /**
   * Group messages by type
   */
  groupMessagesByType(messages) {
    const grouped = {};
    messages.forEach(message => {
      const type = message.data?.type || 'unknown';
      grouped[type] = (grouped[type] || 0) + 1;
    });
    return grouped;
  }

  /**
   * Group events by type
   */
  groupEventsByType(events) {
    const grouped = {};
    events.forEach(event => {
      grouped[event.type] = (grouped[event.type] || 0) + 1;
    });
    return grouped;
  }

  /**
   * Event emitter functionality
   */
  on(connectionId, event, handler) {
    if (!this.messageHandlers.has(connectionId)) {
      this.messageHandlers.set(connectionId, new Map());
    }
    const handlers = this.messageHandlers.get(connectionId);
    if (!handlers.has(event)) {
      handlers.set(event, []);
    }
    handlers.get(event).push(handler);
  }

  off(connectionId, event, handler) {
    const handlers = this.messageHandlers.get(connectionId);
    if (handlers) {
      const eventHandlers = handlers.get(event);
      if (eventHandlers) {
        const index = eventHandlers.indexOf(handler);
        if (index > -1) {
          eventHandlers.splice(index, 1);
        }
      }
    }
  }

  emit(connectionId, event, ...args) {
    const handlers = this.messageHandlers.get(connectionId);
    if (handlers) {
      const eventHandlers = handlers.get(event);
      if (eventHandlers) {
        eventHandlers.forEach(handler => {
          try {
            handler(...args);
          } catch (error) {
            console.error(`Error in WebSocket event handler:`, error);
          }
        });
      }
    }
  }

  /**
   * Validate message structure
   */
  validateMessage(message, schema) {
    if (message.type !== 'json') {
      return { valid: false, error: 'Message is not valid JSON' };
    }

    const data = message.data;
    const errors = [];

    // Check required fields
    if (schema.required) {
      schema.required.forEach(field => {
        if (!(field in data)) {
          errors.push(`Missing required field: ${field}`);
        }
      });
    }

    // Check field types
    if (schema.fields) {
      Object.entries(schema.fields).forEach(([field, type]) => {
        if (field in data && typeof data[field] !== type) {
          errors.push(`Field ${field} should be of type ${type}, got ${typeof data[field]}`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Performance monitoring
   */
  createPerformanceMonitor() {
    const startTime = process.hrtime.bigint();
    let messageCount = 0;
    let errorCount = 0;

    return {
      recordMessage: () => messageCount++,
      recordError: () => errorCount++,
      getStats: () => {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // Convert to ms

        return {
          duration,
          messageCount,
          errorCount,
          messagesPerSecond: (messageCount / duration) * 1000,
          errorRate: errorCount / messageCount
        };
      }
    };
  }

  /**
   * Create connection pool for load testing
   */
  async createConnectionPool(count, options = {}) {
    const connectionIds = [];
    const connectionPromises = [];

    for (let i = 0; i < count; i++) {
      const connectionPromise = this.createConnection({
        ...options,
        id: options.idPrefix ? `${options.idPrefix}_${i}` : undefined
      });
      connectionPromises.push(connectionPromise);
    }

    const createdIds = await Promise.all(connectionPromises);
    connectionIds.push(...createdIds);

    return connectionIds;
  }

  /**
   * Simulate real-time conversation activity
   */
  async simulateConversationActivity(connectionId, conversationId, messageCount = 10, interval = 1000) {
    await this.subscribeToConversation(connectionId, conversationId);

    const participants = ['Alice', 'Bob', 'Charlie'];
    const messages = [
      'What do you think about the current state of AI development?',
      'I believe we\'re making significant progress in natural language understanding.',
      'The ethical considerations are becoming increasingly important.',
      'We need to ensure fairness and transparency in AI systems.',
      'The potential for positive impact is enormous.',
      'But we must proceed with caution.',
      'Collaboration between humans and AI is the future.',
      'Continuous learning and adaptation will be key.',
      'The responsibility lies with all of us.',
      'Together, we can shape a better future with AI.'
    ];

    for (let i = 0; i < messageCount; i++) {
      await new Promise(resolve => setTimeout(resolve, interval));

      const message = {
        type: 'conversation_message',
        data: {
          conversation_id: conversationId,
          speaker: participants[i % participants.length],
          text: messages[i % messages.length],
          timestamp: new Date().toISOString()
        }
      };

      await this.sendMessage(connectionId, message);
    }
  }

  /**
   * Batch message operations
   */
  async sendBatchMessages(connectionId, messages, interval = 100) {
    for (const message of messages) {
      await this.sendMessage(connectionId, message);
      if (interval > 0) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
  }

  /**
   * Cleanup helper
   */
  async cleanup() {
    await this.closeAllConnections();
    this.connectionCount = 0;
  }
}

/**
 * Create WebSocket test helper instance
 */
export const createWebSocketTestHelper = (wsUrl, authToken) => {
  return new WebSocketTestHelper(wsUrl, authToken);
};

/**
 * Message schemas for validation
 */
export const messageSchemas = {
  ping: {
    required: ['type', 'data'],
    fields: {
      type: 'string',
      data: 'object'
    }
  },
  pong: {
    required: ['type', 'data'],
    fields: {
      type: 'string',
      data: 'object'
    }
  },
  subscribe_conversation: {
    required: ['type', 'data'],
    fields: {
      type: 'string',
      data: 'object'
    }
  },
  analysis_progress: {
    required: ['type', 'data'],
    fields: {
      type: 'string',
      data: 'object'
    }
  },
  conversation_update: {
    required: ['type', 'data'],
    fields: {
      type: 'string',
      data: 'object'
    }
  }
};

/**
 * Test data generators
 */
export const generateWebSocketTestData = {
  /**
   * Generate ping message
   */
  ping: (data = {}) => ({
    type: 'ping',
    data: {
      timestamp: Date.now(),
      ...data
    }
  }),

  /**
   * Generate subscription message
   */
  subscription: (type, conversationId, data = {}) => ({
    type: `subscribe_${type}`,
    data: {
      conversation_id: conversationId,
      ...data
    }
  }),

  /**
   * Generate unsubscription message
   */
  unsubscription: (type, conversationId, data = {}) => ({
    type: `unsubscribe_${type}`,
    data: {
      conversation_id: conversationId,
      ...data
    }
  }),

  /**
   * Generate conversation message
   */
  conversationMessage: (conversationId, speaker, text, data = {}) => ({
    type: 'conversation_message',
    data: {
      conversation_id: conversationId,
      speaker,
      text,
      timestamp: new Date().toISOString(),
      ...data
    }
  }),

  /**
   * Generate analysis request
   */
  analysisRequest: (conversationId, options = {}) => ({
    type: 'analysis_request',
    data: {
      conversation_id: conversationId,
      options,
      timestamp: new Date().toISOString()
    }
  }),

  /**
   * Generate malformed message
   */
  malformed: () => 'invalid json string{',

  /**
   * Generate large message
   */
  large: (size = 1024 * 1024) => ({
    type: 'large_message',
    data: {
      content: 'x'.repeat(size),
      timestamp: Date.now()
    }
  })
};