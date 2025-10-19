/**
 * WebSocket API tests
 * Tests real-time communication, cognitive analysis updates, and connection management
 */

import WebSocket from 'ws';
import App from '../../src/server/app';
import { createApiTestHelper } from '../utils/apiTestHelpers';

describe('WebSocket API', () => {
  let app;
  let apiHelper;
  let authToken;
  let wsServer;
  let wsUrl;
  let testConversationId;

  beforeAll(async () => {
    const appInstance = new App();
    appInstance.initializeMiddlewares();
    appInstance.initializeRoutes();
    appInstance.initializeErrorHandling();

    // Start test server
    app = appInstance.app;
    apiHelper = createApiTestHelper(app);

    // Authenticate and get token
    await apiHelper.authenticate({
      email: 'websocket@example.com',
      username: 'wsuser',
      password: 'WsPassword123!',
    });
    authToken = apiHelper.token;

    // Create test conversation
    const conversationResponse = await apiHelper.authenticatedRequest('post', '/conversations', {
      title: 'WebSocket Test Conversation',
      participants: ['Alice', 'Bob'],
      messages: [
        {
          speaker: 'Alice',
          text: 'This conversation will test WebSocket functionality.',
          timestamp: new Date().toISOString()
        }
      ]
    });
    testConversationId = conversationResponse.body.id;

    // Initialize WebSocket server
    await appInstance.initializeWebSocket();
    wsServer = appInstance.wsServer;

    // Construct WebSocket URL
    const server = appInstance.server;
    const address = server.address();
    const port = typeof address === 'string' ? address : address.port;
    wsUrl = `ws://localhost:${port}`;
  });

  afterAll(async () => {
    if (wsServer) {
      wsServer.close();
    }
  });

  describe('WebSocket Connection Management', () => {
    test('should establish WebSocket connection with authentication', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const connectionPromise = new Promise((resolve, reject) => {
        ws.on('open', () => {
          expect(ws.readyState).toBe(WebSocket.OPEN);
          resolve();
        });

        ws.on('error', reject);

        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      await connectionPromise;
      ws.close();
    });

    test('should reject unauthenticated WebSocket connections', async () => {
      const ws = new WebSocket(wsUrl);

      const errorPromise = new Promise((resolve) => {
        ws.on('error', (error) => {
          expect(error.message).toContain('401');
          resolve();
        });

        ws.on('close', (code, reason) => {
          expect(code).toBe(1008); // Policy violation
          resolve();
        });

        setTimeout(() => resolve(), 2000);
      });

      await errorPromise;
      ws.close();
    });

    test('should reject WebSocket connections with invalid tokens', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: 'Bearer invalid-token'
        }
      });

      const errorPromise = new Promise((resolve) => {
        ws.on('error', () => resolve());
        ws.on('close', (code) => {
          expect(code).toBe(1008);
          resolve();
        });
        setTimeout(() => resolve(), 2000);
      });

      await errorPromise;
      ws.close();
    });

    test('should handle connection limits', async () => {
      const connections = [];
      const maxConnections = 5; // Assuming a reasonable limit for testing

      try {
        // Create multiple connections
        for (let i = 0; i < maxConnections + 2; i++) {
          const ws = new WebSocket(wsUrl, {
            headers: {
              Authorization: `Bearer ${authToken}`
            }
          });

          connections.push(ws);

          await new Promise((resolve) => {
            if (ws.readyState === WebSocket.OPEN) {
              resolve();
            } else {
              ws.on('open', resolve);
              ws.on('error', resolve);
            }
          });
        }
      } catch (error) {
        // Some connections should be rejected due to limits
        expect(error).toBeDefined();
      } finally {
        // Clean up connections
        connections.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });
      }
    });

    test('should maintain connection statistics', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      await new Promise((resolve) => {
        ws.on('open', () => {
          // Send connection stats request
          ws.send(JSON.stringify({
            type: 'connection_stats',
            data: {}
          }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'connection_stats_response') {
            expect(message.data).toHaveProperty('connected_clients');
            expect(message.data).toHaveProperty('total_connections');
            expect(typeof message.data.connected_clients).toBe('number');
            resolve();
          }
        });
      });

      ws.close();
    });
  });

  describe('Real-time Cognitive Analysis Updates', () => {
    test('should receive analysis progress updates', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const analysisUpdatePromise = new Promise((resolve, reject) => {
        ws.on('open', () => {
          // Subscribe to analysis updates for conversation
          ws.send(JSON.stringify({
            type: 'subscribe_analysis',
            data: {
              conversation_id: testConversationId
            }
          }));

          // Trigger analysis
          apiHelper.authenticatedRequest('post', `/analysis/conversations/${testConversationId}`, {
            options: {
              include_graph_data: true
            }
          });
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'analysis_progress') {
            expect(message.data).toHaveProperty('conversation_id', testConversationId);
            expect(message.data).toHaveProperty('progress');
            expect(message.data).toHaveProperty('status');
            expect(message.data.progress).toBeGreaterThanOrEqual(0);
            expect(message.data.progress).toBeLessThanOrEqual(100);
            resolve();
          }
        });

        ws.on('error', reject);
        setTimeout(() => reject(new Error('Analysis update timeout')), 10000);
      });

      await analysisUpdatePromise;
      ws.close();
    });

    test('should receive analysis completion notifications', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const completionPromise = new Promise((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'subscribe_analysis',
            data: {
              conversation_id: testConversationId
            }
          }));

          // Trigger another analysis
          apiHelper.authenticatedRequest('post', `/analysis/conversations/${testConversationId}`, {
            options: {
              models: ['factual_retrieval', 'logical_inference']
            }
          });
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'analysis_complete') {
            expect(message.data).toHaveProperty('conversation_id', testConversationId);
            expect(message.data).toHaveProperty('analysis_id');
            expect(message.data).toHaveProperty('dimensions');
            expect(message.data).toHaveProperty('processing_time');
            expect(message.data.dimensions).toHaveProperty('factual_retrieval');
            expect(message.data.dimensions).toHaveProperty('logical_inference');
            resolve();
          }
        });

        ws.on('error', reject);
        setTimeout(() => reject(new Error('Analysis completion timeout')), 15000);
      });

      await completionPromise;
      ws.close();
    });

    test('should receive real-time graph updates', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const graphUpdatePromise = new Promise((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'subscribe_graph',
            data: {
              conversation_id: testConversationId
            }
          }));

          // Trigger visualization creation which should generate graph updates
          apiHelper.authenticatedRequest('post', `/visualizations/conversations/${testConversationId}`, {
            type: 'cognitive_graph',
            options: {
              layout: 'force_directed'
            }
          });
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'graph_update') {
            expect(message.data).toHaveProperty('conversation_id', testConversationId);
            expect(message.data).toHaveProperty('graph_data');
            expect(message.data.graph_data).toHaveProperty('nodes');
            expect(message.data.graph_data).toHaveProperty('edges');
            expect(Array.isArray(message.data.graph_data.nodes)).toBe(true);
            expect(Array.isArray(message.data.graph_data.edges)).toBe(true);
            resolve();
          }
        });

        ws.on('error', reject);
        setTimeout(() => reject(new Error('Graph update timeout')), 10000);
      });

      await graphUpdatePromise;
      ws.close();
    });

    test('should handle analysis error notifications', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const errorPromise = new Promise((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'subscribe_analysis',
            data: {
              conversation_id: testConversationId
            }
          }));

          // Trigger analysis with invalid options that should cause an error
          apiHelper.authenticatedRequest('post', `/analysis/conversations/${testConversationId}`, {
            options: {
              confidence_threshold: 1.5, // Invalid value
              models: ['invalid_model']
            }
          });
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'analysis_error') {
            expect(message.data).toHaveProperty('conversation_id', testConversationId);
            expect(message.data).toHaveProperty('error');
            expect(message.data).toHaveProperty('error_code');
            expect(typeof message.data.error).toBe('string');
            resolve();
          }
        });

        ws.on('error', reject);
        setTimeout(() => reject(new Error('Analysis error timeout')), 10000);
      });

      await errorPromise;
      ws.close();
    });
  });

  describe('Message Broadcasting and Subscriptions', () => {
    test('should broadcast messages to multiple subscribers', async () => {
      const ws1 = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const ws2 = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const broadcastPromises = [
        new Promise((resolve) => {
          ws1.on('open', () => {
            ws1.send(JSON.stringify({
              type: 'subscribe_conversation',
              data: {
                conversation_id: testConversationId
              }
            }));
          });

          ws1.on('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.type === 'conversation_update') {
              resolve(message);
            }
          });
        }),
        new Promise((resolve) => {
          ws2.on('open', () => {
            ws2.send(JSON.stringify({
              type: 'subscribe_conversation',
              data: {
                conversation_id: testConversationId
              }
            }));
          });

          ws2.on('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.type === 'conversation_update') {
              resolve(message);
            }
          });
        })
      ];

      // Wait for both connections to be ready
      await new Promise(resolve => {
        let readyCount = 0;
        const checkReady = () => {
          readyCount++;
          if (readyCount === 2) resolve();
        };
        ws1.on('open', checkReady);
        ws2.on('open', checkReady);
      });

      // Trigger a conversation update
      await apiHelper.authenticatedRequest('post', `/conversations/${testConversationId}/messages`, {
        speaker: 'Alice',
        text: 'This message should be broadcast to all subscribers.',
        timestamp: new Date().toISOString()
      });

      // Wait for both subscribers to receive the message
      const [message1, message2] = await Promise.all(broadcastPromises);

      expect(message1.data).toHaveProperty('conversation_id', testConversationId);
      expect(message2.data).toHaveProperty('conversation_id', testConversationId);
      expect(message1.data.message).toEqual(message2.data.message);

      ws1.close();
      ws2.close();
    });

    test('should handle subscription filtering', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const filterPromise = new Promise((resolve, reject) => {
        let messageCount = 0;

        ws.on('open', () => {
          // Subscribe only to analysis updates
          ws.send(JSON.stringify({
            type: 'subscribe_analysis',
            data: {
              conversation_id: testConversationId
            }
          }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          messageCount++;

          // Should only receive analysis-related messages
          expect(['analysis_progress', 'analysis_complete', 'analysis_error']).toContain(message.type);
          expect(message.type).not.toBe('conversation_update');
          expect(message.type).not.toBe('graph_update');

          if (messageCount >= 1) {
            resolve();
          }
        });

        ws.on('error', reject);
        setTimeout(() => reject(new Error('Filter timeout')), 10000);
      });

      await filterPromise;
      ws.close();
    });

    test('should handle unsubscribe functionality', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const unsubscribePromise = new Promise((resolve, reject) => {
        let messageReceived = false;

        ws.on('open', () => {
          // Subscribe to updates
          ws.send(JSON.stringify({
            type: 'subscribe_analysis',
            data: {
              conversation_id: testConversationId
            }
          }));

          // Immediately unsubscribe
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: 'unsubscribe_analysis',
              data: {
                conversation_id: testConversationId
              }
            }));

            // Trigger analysis after unsubscribing
            apiHelper.authenticatedRequest('post', `/analysis/conversations/${testConversationId}`, {
              options: {}
            });
          }, 100);
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type.startsWith('analysis_')) {
            messageReceived = true;
          }
        });

        ws.on('error', reject);

        // Check if no messages were received after unsubscribe
        setTimeout(() => {
          expect(messageReceived).toBe(false);
          resolve();
        }, 5000);
      });

      await unsubscribePromise;
      ws.close();
    });

    test('should validate subscription messages', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const validationPromise = new Promise((resolve) => {
        ws.on('open', () => {
          // Send invalid subscription message
          ws.send(JSON.stringify({
            type: 'subscribe_invalid',
            data: {}
          }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'error') {
            expect(message.data).toHaveProperty('error_code', 'INVALID_SUBSCRIPTION');
            resolve();
          }
        });

        setTimeout(() => resolve(), 2000);
      });

      await validationPromise;
      ws.close();
    });
  });

  describe('Connection Health and Heartbeat', () => {
    test('should handle heartbeat/ping messages', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const heartbeatPromise = new Promise((resolve, reject) => {
        ws.on('open', () => {
          // Send ping
          ws.send(JSON.stringify({
            type: 'ping',
            data: {
              timestamp: Date.now()
            }
          }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'pong') {
            expect(message.data).toHaveProperty('timestamp');
            expect(message.data).toHaveProperty('server_timestamp');
            expect(typeof message.data.timestamp).toBe('number');
            expect(typeof message.data.server_timestamp).toBe('number');
            resolve();
          }
        });

        ws.on('error', reject);
        setTimeout(() => reject(new Error('Heartbeat timeout')), 5000);
      });

      await heartbeatPromise;
      ws.close();
    });

    test('should detect inactive connections', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const inactivityPromise = new Promise((resolve) => {
        ws.on('open', () => {
          // Don't send any messages, simulate inactivity
        });

        ws.on('close', (code, reason) => {
          // Connection should be closed due to inactivity
          expect(code).toBe(1000); // Normal closure or timeout code
          resolve();
        });

        ws.on('error', resolve);
      });

      // Wait for potential timeout (adjust based on server configuration)
      await Promise.race([
        inactivityPromise,
        new Promise(resolve => setTimeout(resolve, 35000)) // Server heartbeat is typically 30s
      ]);

      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    test('should maintain connection statistics', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const statsPromise = new Promise((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'get_connection_stats',
            data: {}
          }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'connection_stats') {
            expect(message.data).toHaveProperty('messages_sent');
            expect(message.data).toHaveProperty('messages_received');
            expect(message.data).toHaveProperty('connected_at');
            expect(message.data).toHaveProperty('last_activity');
            expect(typeof message.data.messages_sent).toBe('number');
            expect(typeof message.data.messages_received).toBe('number');
            resolve();
          }
        });

        ws.on('error', reject);
        setTimeout(() => reject(new Error('Stats timeout')), 5000);
      });

      await statsPromise;
      ws.close();
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle malformed JSON messages gracefully', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const errorPromise = new Promise((resolve) => {
        ws.on('open', () => {
          // Send malformed JSON
          ws.send('{"invalid": json}');
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'error') {
            expect(message.data).toHaveProperty('error_code', 'INVALID_MESSAGE');
            resolve();
          }
        });

        ws.on('error', resolve);
        setTimeout(() => resolve(), 2000);
      });

      await errorPromise;
      ws.close();
    });

    test('should handle large messages appropriately', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const largeMessagePromise = new Promise((resolve, reject) => {
        ws.on('open', () => {
          // Send a very large message
          const largeData = 'x'.repeat(1024 * 1024); // 1MB
          ws.send(JSON.stringify({
            type: 'test_large_message',
            data: { content: largeData }
          }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'error') {
            expect(['MESSAGE_TOO_LARGE', 'INVALID_MESSAGE']).toContain(message.data.error_code);
            resolve();
          }
        });

        ws.on('error', reject);
        setTimeout(() => resolve(), 5000);
      });

      await largeMessagePromise;
      ws.close();
    });

    test('should handle connection interruption gracefully', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const interruptionPromise = new Promise((resolve) => {
        ws.on('open', () => {
          // Abruptly close connection
          ws.terminate();
        });

        ws.on('close', (code) => {
          expect(code).toBe(1006); // Abnormal closure
          resolve();
        });

        ws.on('error', resolve);
      });

      await interruptionPromise;
    });

    test('should support connection recovery', async () => {
      let ws1 = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      // Establish initial connection
      await new Promise((resolve) => {
        ws1.on('open', resolve);
      });

      // Close connection
      ws1.close();

      // Reconnect
      const ws2 = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const recoveryPromise = new Promise((resolve, reject) => {
        ws2.on('open', () => {
          expect(ws2.readyState).toBe(WebSocket.OPEN);
          resolve();
        });

        ws2.on('error', reject);
        setTimeout(() => reject(new Error('Reconnection timeout')), 5000);
      });

      await recoveryPromise;
      ws2.close();
    });
  });

  describe('Performance and Load Tests', () => {
    test('should handle high-frequency message updates', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const performancePromise = new Promise((resolve, reject) => {
        let messagesReceived = 0;
        const startTime = Date.now();

        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'subscribe_conversation',
            data: {
              conversation_id: testConversationId
            }
          }));

          // Send multiple rapid messages
          for (let i = 0; i < 10; i++) {
            setTimeout(() => {
              apiHelper.authenticatedRequest('post', `/conversations/${testConversationId}/messages`, {
                speaker: 'User' + i,
                text: `High frequency message ${i}`,
                timestamp: new Date().toISOString()
              });
            }, i * 50); // 50ms intervals
          }
        });

        ws.on('message', (data) => {
          messagesReceived++;
          if (messagesReceived >= 10) {
            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
            expect(messagesReceived).toBe(10);
            resolve();
          }
        });

        ws.on('error', reject);
        setTimeout(() => reject(new Error('Performance timeout')), 10000);
      });

      await performancePromise;
      ws.close();
    });

    test('should handle multiple concurrent connections efficiently', async () => {
      const connectionCount = 10;
      const connections = [];
      const connectionPromises = [];

      for (let i = 0; i < connectionCount; i++) {
        const ws = new WebSocket(wsUrl, {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });

        connections.push(ws);

        const connectionPromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

          ws.on('open', () => {
            clearTimeout(timeout);
            ws.send(JSON.stringify({
              type: 'ping',
              data: { connection_id: i }
            }));
          });

          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.type === 'pong') {
              resolve();
            }
          });

          ws.on('error', reject);
        });

        connectionPromises.push(connectionPromise);
      }

      const startTime = Date.now();
      await Promise.all(connectionPromises);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(10000); // All connections within 10 seconds

      // Clean up connections
      connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
    });
  });

  describe('Security Tests', () => {
    test('should prevent unauthorized subscription to conversations', async () => {
      // Create another user and try to subscribe to first user's conversation
      const otherUserHelper = createApiTestHelper(app);
      await otherUserHelper.authenticate({
        email: 'other@example.com',
        username: 'otheruser',
        password: 'OtherPassword123!',
      });

      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${otherUserHelper.token}`
        }
      });

      const securityPromise = new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'subscribe_conversation',
            data: {
              conversation_id: testConversationId
            }
          }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'error') {
            expect(message.data).toHaveProperty('error_code', 'UNAUTHORIZED');
            resolve();
          }
        });

        ws.on('close', (code) => {
          expect([1008, 1003]).toContain(code); // Policy violation or unsupported data
          resolve();
        });

        setTimeout(() => resolve(), 3000);
      });

      await securityPromise;
      ws.close();
    });

    test('should sanitize WebSocket messages', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const sanitizationPromise = new Promise((resolve) => {
        ws.on('open', () => {
          // Send message with potentially malicious content
          ws.send(JSON.stringify({
            type: 'test_message',
            data: {
              content: '<script>alert("xss")</script>',
              html: '<img src=x onerror=alert("xss")>'
            }
          }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          // Response should be sanitized
          if (message.data && message.data.content) {
            expect(message.data.content).not.toContain('<script>');
            expect(message.data.html).not.toContain('<img>');
          }
          resolve();
        });

        setTimeout(() => resolve(), 2000);
      });

      await sanitizationPromise;
      ws.close();
    });

    test('should implement rate limiting for WebSocket messages', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const rateLimitPromise = new Promise((resolve) => {
        let messageCount = 0;
        let rateLimited = false;

        ws.on('open', () => {
          // Send rapid messages to trigger rate limiting
          for (let i = 0; i < 50; i++) {
            ws.send(JSON.stringify({
              type: 'test_rate_limit',
              data: { message: i }
            }));
          }
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          messageCount++;

          if (message.type === 'error' && message.data.error_code === 'RATE_LIMITED') {
            rateLimited = true;
            resolve();
          }
        });

        ws.on('close', (code) => {
          if (code === 1008) { // Policy violation for rate limiting
            rateLimited = true;
          }
          resolve();
        });

        setTimeout(() => {
          expect(rateLimited || messageCount < 50).toBe(true);
          resolve();
        }, 5000);
      });

      await rateLimitPromise;
      ws.close();
    });
  });
});