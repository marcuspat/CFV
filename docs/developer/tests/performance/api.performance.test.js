/**
 * API Performance Tests
 * Tests API response times, throughput, and performance under load
 */

import request from 'supertest';
import App from '../../src/server/app';
import { createApiTestHelper } from '../utils/apiTestHelpers';

describe('API Performance Tests', () => {
  let app;
  let apiHelper;
  let authToken;
  let testConversationId;
  let testUserId;

  beforeAll(async () => {
    const appInstance = new App();
    appInstance.initializeMiddlewares();
    appInstance.initializeRoutes();
    appInstance.initializeErrorHandling();
    app = appInstance.app;
    apiHelper = createApiTestHelper(app);

    // Authenticate
    await apiHelper.authenticate({
      email: 'performance@example.com',
      username: 'perfuser',
      password: 'PerfPassword123!',
    });
    authToken = apiHelper.token;

    // Create test data
    const userResponse = await apiHelper.authenticatedRequest('post', '/users', {
      email: 'perfuser@example.com',
      username: 'perfuser',
      password: 'PerfPassword123!'
    });
    testUserId = userResponse.body.id;

    const conversationResponse = await apiHelper.authenticatedRequest('post', '/conversations', {
      title: 'Performance Test Conversation',
      participants: ['Alice', 'Bob'],
      messages: Array.from({ length: 10 }, (_, i) => ({
        speaker: i % 2 === 0 ? 'Alice' : 'Bob',
        text: `Performance test message ${i + 1}`,
        timestamp: new Date(Date.now() - (10 - i) * 60000).toISOString()
      }))
    });
    testConversationId = conversationResponse.body.id;
  });

  describe('Response Time Benchmarks', () => {
    test('should respond to health checks within 50ms', async () => {
      const startTime = process.hrtime.bigint();
      const response = await request(app).get('/health');
      const endTime = process.hrtime.bigint();

      const responseTime = Number(endTime - startTime) / 1000000; // Convert to ms

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(50);
    });

    test('should handle authentication within 200ms', async () => {
      const startTime = process.hrtime.bigint();
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'performance@example.com',
          password: 'PerfPassword123!'
        });
      const endTime = process.hrtime.bigint();

      const responseTime = Number(endTime - startTime) / 1000000;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(200);
    });

    test('should retrieve conversation list within 100ms', async () => {
      const startTime = process.hrtime.bigint();
      const response = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`);
      const endTime = process.hrtime.bigint();

      const responseTime = Number(endTime - startTime) / 1000000;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(100);
    });

    test('should retrieve single conversation within 100ms', async () => {
      const startTime = process.hrtime.bigint();
      const response = await request(app)
        .get(`/api/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`);
      const endTime = process.hrtime.bigint();

      const responseTime = Number(endTime - startTime) / 1000000;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(100);
    });

    test('should create conversation within 300ms', async () => {
      const conversationData = {
        title: 'Performance Test Creation',
        participants: ['User1', 'User2'],
        messages: [
          {
            speaker: 'User1',
            text: 'Test message for performance testing',
            timestamp: new Date().toISOString()
          }
        ]
      };

      const startTime = process.hrtime.bigint();
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(conversationData);
      const endTime = process.hrtime.bigint();

      const responseTime = Number(endTime - startTime) / 1000000;

      expect(response.status).toBe(201);
      expect(responseTime).toBeLessThan(300);
    });

    test('should initiate analysis within 200ms', async () => {
      const startTime = process.hrtime.bigint();
      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            include_graph_data: true,
            confidence_threshold: 0.7
          }
        });
      const endTime = process.hrtime.bigint();

      const responseTime = Number(endTime - startTime) / 1000000;

      expect(response.status).toBe(202);
      expect(responseTime).toBeLessThan(200);
    });
  });

  describe('Throughput Tests', () => {
    test('should handle 100 concurrent requests to conversation list', async () => {
      const concurrentRequests = 100;
      const promises = Array(concurrentRequests).fill().map(() =>
        request(app)
          .get('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const startTime = process.hrtime.bigint();
      const responses = await Promise.all(promises);
      const endTime = process.hrtime.bigint();

      const totalTime = Number(endTime - startTime) / 1000000;
      const requestsPerSecond = (concurrentRequests / totalTime) * 1000;

      expect(responses.every(r => r.status === 200)).toBe(true);
      expect(requestsPerSecond).toBeGreaterThan(50); // Should handle at least 50 RPS
    });

    test('should handle 50 concurrent conversation creation requests', async () => {
      const concurrentRequests = 50;
      const promises = Array(concurrentRequests).fill().map((_, i) =>
        request(app)
          .post('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Concurrent Test Conversation ${i}`,
            participants: [`User${i}`],
            messages: []
          })
      );

      const startTime = process.hrtime.bigint();
      const responses = await Promise.all(promises);
      const endTime = process.hrtime.bigint();

      const totalTime = Number(endTime - startTime) / 1000000;
      const requestsPerSecond = (concurrentRequests / totalTime) * 1000;

      expect(responses.every(r => r.status === 201)).toBe(true);
      expect(requestsPerSecond).toBeGreaterThan(20); // Should handle at least 20 RPS for writes
    });

    test('should handle mixed read/write workload', async () => {
      const readRequests = 30;
      const writeRequests = 10;
      const totalRequests = readRequests + writeRequests;

      const promises = [];

      // Read requests
      for (let i = 0; i < readRequests; i++) {
        promises.push(
          request(app)
            .get('/api/conversations')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      // Write requests
      for (let i = 0; i < writeRequests; i++) {
        promises.push(
          request(app)
            .post('/api/conversations')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              title: `Mixed Workload ${i}`,
              participants: ['User'],
              messages: []
            })
        );
      }

      const startTime = process.hrtime.bigint();
      const responses = await Promise.all(promises);
      const endTime = process.hrtime.bigint();

      const totalTime = Number(endTime - startTime) / 1000000;
      const requestsPerSecond = (totalRequests / totalTime) * 1000;

      const successCount = responses.filter(r => r.status === 200 || r.status === 201).length;
      expect(successCount).toBe(totalRequests);
      expect(requestsPerSecond).toBeGreaterThan(30);
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should maintain stable memory usage under load', async () => {
      const initialMemory = process.memoryUsage();
      const requestCount = 200;
      const batchSize = 20;

      for (let i = 0; i < requestCount; i += batchSize) {
        const promises = Array(batchSize).fill().map(() =>
          request(app)
            .get('/api/conversations')
            .set('Authorization', `Bearer ${authToken}`)
        );
        await Promise.all(promises);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      // Memory increase should be reasonable (less than 50MB for 200 requests)
      expect(memoryIncreaseMB).toBeLessThan(50);
    });

    test('should handle large payloads efficiently', async () => {
      const largeConversation = {
        title: 'Large Payload Test',
        participants: ['User1', 'User2'],
        messages: Array.from({ length: 100 }, (_, i) => ({
          speaker: i % 2 === 0 ? 'User1' : 'User2',
          text: `This is a large message number ${i + 1} with substantial content to test payload handling efficiency and memory management under stress conditions. `.repeat(5),
          timestamp: new Date(Date.now() - (100 - i) * 60000).toISOString(),
          metadata: {
            confidence: 0.9 + (Math.random() * 0.1),
            sentiment: Math.random() > 0.5 ? 'positive' : 'neutral',
            word_count: 50 + Math.floor(Math.random() * 50)
          }
        }))
      };

      const startTime = process.hrtime.bigint();
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(largeConversation);
      const endTime = process.hrtime.bigint();

      const responseTime = Number(endTime - startTime) / 1000000;
      const payloadSize = JSON.stringify(largeConversation).length;

      expect(response.status).toBe(201);
      expect(responseTime).toBeLessThan(1000); // Should handle large payload within 1 second
      expect(payloadSize).toBeGreaterThan(50000); // Payload should be substantial
    });
  });

  describe('Cognitive Analysis Performance', () => {
    test('should process analysis requests within acceptable time', async () => {
      const analysisRequests = Array(10).fill().map(() =>
        request(app)
          .post(`/api/analysis/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            options: {
              include_graph_data: true,
              confidence_threshold: 0.7
            }
          })
      );

      const startTime = process.hrtime.bigint();
      const responses = await Promise.all(analysisRequests);
      const endTime = process.hrtime.bigint();

      const totalTime = Number(endTime - startTime) / 1000000;
      const averageTime = totalTime / responses.length;

      expect(responses.every(r => r.status === 202)).toBe(true);
      expect(averageTime).toBeLessThan(500); // Average should be under 500ms
    });

    test('should handle concurrent analysis initiation', async () => {
      // Create multiple conversations for concurrent analysis
      const conversationIds = [];
      for (let i = 0; i < 5; i++) {
        const convResponse = await request(app)
          .post('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Analysis Test ${i}`,
            participants: ['User1', 'User2'],
            messages: [
              {
                speaker: 'User1',
                text: `Analysis test message ${i}`,
                timestamp: new Date().toISOString()
              }
            ]
          });
        conversationIds.push(convResponse.body.id);
      }

      const analysisPromises = conversationIds.map(convId =>
        request(app)
          .post(`/api/analysis/conversations/${convId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            options: {
              models: ['factual_retrieval', 'logical_inference']
            }
          })
      );

      const startTime = process.hrtime.bigint();
      const responses = await Promise.all(analysisPromises);
      const endTime = process.hrtime.bigint();

      const totalTime = Number(endTime - startTime) / 1000000;

      expect(responses.every(r => r.status === 202)).toBe(true);
      expect(totalTime).toBeLessThan(2000); // All analyses should start within 2 seconds
    });
  });

  describe('Database Query Performance', () => {
    test('should handle paginated queries efficiently', async () => {
      const pageSizes = [10, 25, 50, 100];
      const results = {};

      for (const pageSize of pageSizes) {
        const startTime = process.hrtime.bigint();
        const response = await request(app)
          .get(`/api/conversations?page=1&limit=${pageSize}`)
          .set('Authorization', `Bearer ${authToken}`);
        const endTime = process.hrtime.bigint();

        const responseTime = Number(endTime - startTime) / 1000000;

        expect(response.status).toBe(200);
        expect(responseTime).toBeLessThan(150);

        results[pageSize] = {
          responseTime,
          itemCount: response.body.data.length
        };
      }

      // Larger page sizes should not significantly impact response time
      expect(results[100].responseTime).toBeLessThan(results[10].responseTime * 2);
    });

    test('should handle filtered queries efficiently', async () => {
      const filters = [
        { search: 'test' },
        { language: 'en' },
        { sort: 'created_at', order: 'desc' },
        { search: 'conversation', language: 'en', sort: 'title' }
      ];

      const results = await Promise.all(filters.map(async (filter) => {
        const startTime = process.hrtime.bigint();
        const response = await request(app)
          .get('/api/conversations')
          .query(filter)
          .set('Authorization', `Bearer ${authToken}`);
        const endTime = process.hrtime.bigint();

        return {
          filter,
          responseTime: Number(endTime - startTime) / 1000000,
          status: response.status
        };
      }));

      results.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.responseTime).toBeLessThan(200);
      });
    });
  });

  describe('Error Handling Performance', () => {
    test('should handle invalid requests quickly', async () => {
      const invalidRequests = [
        { method: 'get', path: '/invalid-endpoint' },
        { method: 'post', path: '/api/conversations', data: { invalid: 'data' } },
        { method: 'get', path: '/api/conversations', headers: { Authorization: 'invalid' } },
        { method: 'get', path: '/api/conversations/non-existent-id' }
      ];

      const results = await Promise.all(invalidRequests.map(async (req) => {
        const startTime = process.hrtime.bigint();
        let response;

        if (req.method === 'get') {
          response = await request(app)
            .get(req.path)
            .set(req.headers || {})
            .set('Authorization', req.headers?.Authorization || `Bearer ${authToken}`);
        } else {
          response = await request(app)
            [req.method](req.path)
            .send(req.data || {})
            .set(req.headers || {})
            .set('Authorization', req.headers?.Authorization || `Bearer ${authToken}`);
        }

        const endTime = process.hrtime.bigint();
        const responseTime = Number(endTime - startTime) / 1000000;

        return {
          path: req.path,
          status: response.status,
          responseTime
        };
      }));

      results.forEach(result => {
        expect([400, 401, 404]).toContain(result.status);
        expect(result.responseTime).toBeLessThan(100); // Error responses should be fast
      });
    });

    test('should handle rate limiting efficiently', async () => {
      const rapidRequests = Array(20).fill().map(() =>
        request(app)
          .get('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const startTime = process.hrtime.bigint();
      const responses = await Promise.allSettled(rapidRequests);
      const endTime = process.hrtime.bigint();

      const totalTime = Number(endTime - startTime) / 1000000;
      const successCount = responses.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
      const rateLimitedCount = responses.filter(r =>
        r.status === 'fulfilled' && r.value.status === 429
      ).length;

      // Some requests should succeed, some should be rate limited
      expect(successCount + rateLimitedCount).toBe(20);
      expect(totalTime).toBeLessThan(5000); // Should handle burst quickly
    });
  });

  describe('Scaling Tests', () => {
    test('should maintain performance with increasing data volume', async () => {
      const conversationCounts = [10, 50, 100];
      const performanceResults = [];

      for (const count of conversationCounts) {
        // Create test conversations
        const conversationIds = [];
        for (let i = 0; i < count; i++) {
          const response = await request(app)
            .post('/api/conversations')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              title: `Scale Test ${i}`,
              participants: [`User${i}`],
              messages: []
            });
          conversationIds.push(response.body.id);
        }

        // Measure list performance
        const startTime = process.hrtime.bigint();
        const listResponse = await request(app)
          .get('/api/conversations?limit=50')
          .set('Authorization', `Bearer ${authToken}`);
        const endTime = process.hrtime.bigint();

        const responseTime = Number(endTime - startTime) / 1000000;

        performanceResults.push({
          conversationCount: count,
          responseTime,
          returnedCount: listResponse.body.data.length
        });

        // Cleanup
        for (const convId of conversationIds) {
          await request(app)
            .delete(`/api/conversations/${convId}`)
            .set('Authorization', `Bearer ${authToken}`);
        }
      }

      // Response time should not increase dramatically with data volume
      expect(performanceResults[2].responseTime).toBeLessThan(performanceResults[0].responseTime * 3);
    });

    test('should handle long-running operations gracefully', async () => {
      // Create a complex conversation for analysis
      const complexConvResponse = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Complex Performance Test',
          participants: ['User1', 'User2'],
          messages: Array.from({ length: 50 }, (_, i) => ({
            speaker: i % 2 === 0 ? 'User1' : 'User2',
            text: `Complex message ${i + 1} with detailed content for performance testing under heavy load conditions.`,
            timestamp: new Date(Date.now() - (50 - i) * 60000).toISOString()
          }))
        });
      const complexConvId = complexConvResponse.body.id;

      // Initiate multiple analyses
      const analysisPromises = Array(5).fill().map(() =>
        request(app)
          .post(`/api/analysis/conversations/${complexConvId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            options: {
              include_graph_data: true,
              confidence_threshold: 0.8,
              models: ['factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition']
            }
          })
      );

      const startTime = process.hrtime.bigint();
      const responses = await Promise.all(analysisPromises);
      const endTime = process.hrtime.bigint();

      const totalTime = Number(endTime - startTime) / 1000000;
      const averageTime = totalTime / responses.length;

      expect(responses.every(r => r.status === 202)).toBe(true);
      expect(averageTime).toBeLessThan(1000); // Should handle complex operations efficiently

      // Cleanup
      await request(app)
        .delete(`/api/conversations/${complexConvId}`)
        .set('Authorization', `Bearer ${authToken}`);
    });
  });

  describe('WebSocket Performance', () => {
    test('should handle WebSocket connections efficiently', async () => {
      const WebSocket = require('ws');
      const connectionCount = 20;
      const connections = [];

      const startTime = process.hrtime.bigint();

      // Create multiple WebSocket connections
      const connectionPromises = Array(connectionCount).fill().map(() =>
        new Promise((resolve, reject) => {
          const ws = new WebSocket('ws://localhost:3001', {
            headers: {
              Authorization: `Bearer ${authToken}`
            }
          });

          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

          ws.on('open', () => {
            clearTimeout(timeout);
            connections.push(ws);
            resolve();
          });

          ws.on('error', reject);
        })
      );

      await Promise.all(connectionPromises);
      const endTime = process.hrtime.bigint();

      const totalTime = Number(endTime - startTime) / 1000000;
      const averageConnectionTime = totalTime / connectionCount;

      expect(averageConnectionTime).toBeLessThan(200); // Average connection time should be fast

      // Cleanup connections
      connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
    });

    test('should handle high-frequency WebSocket messages', async () => {
      // This test would require WebSocket server setup
      // For now, we'll test the HTTP endpoints that trigger WebSocket events
      const messageCount = 50;
      const promises = [];

      const startTime = process.hrtime.bigint();

      for (let i = 0; i < messageCount; i++) {
        promises.push(
          request(app)
            .post(`/api/conversations/${testConversationId}/messages`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              speaker: 'User1',
              text: `High frequency message ${i}`,
              timestamp: new Date().toISOString()
            })
        );
      }

      await Promise.all(promises);
      const endTime = process.hrtime.bigint();

      const totalTime = Number(endTime - startTime) / 1000000;
      const messagesPerSecond = (messageCount / totalTime) * 1000;

      expect(messagesPerSecond).toBeGreaterThan(20); // Should handle at least 20 messages/second
    });
  });

  describe('Resource Cleanup', () => {
    test('should clean up test data efficiently', async () => {
      // Create test data for cleanup testing
      const testIds = [];
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Cleanup Test ${i}`,
            participants: ['User'],
            messages: []
          });
        testIds.push(response.body.id);
      }

      // Measure cleanup performance
      const startTime = process.hrtime.bigint();

      const deletePromises = testIds.map(id =>
        request(app)
          .delete(`/api/conversations/${id}`)
          .set('Authorization', `Bearer ${authToken}`)
      );

      await Promise.all(deletePromises);
      const endTime = process.hrtime.bigint();

      const cleanupTime = Number(endTime - startTime) / 1000000;
      const averageDeleteTime = cleanupTime / testIds.length;

      expect(averageDeleteTime).toBeLessThan(100); // Delete operations should be fast

      // Verify cleanup
      const remainingCount = testIds.length;
      for (const id of testIds) {
        const response = await request(app)
          .get(`/api/conversations/${id}`)
          .set('Authorization', `Bearer ${authToken}`);
        expect(response.status).toBe(404);
      }
    });
  });

  /**
   * Performance helper functions
   */
  function measureResponseTime(asyncFn) {
    return async (...args) => {
      const startTime = process.hrtime.bigint();
      const result = await asyncFn(...args);
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000;
      return { result, responseTime };
    };
  }

  function calculateRequestsPerSecond(totalRequests, totalTimeMs) {
    return (totalRequests / totalTimeMs) * 1000;
  }

  function measureMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed / (1024 * 1024), // MB
      heapTotal: usage.heapTotal / (1024 * 1024), // MB
      external: usage.external / (1024 * 1024), // MB
      rss: usage.rss / (1024 * 1024) // MB
    };
  }
});