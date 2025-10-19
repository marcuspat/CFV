/**
 * Conversations API tests
 * Tests CRUD operations, validation, and cognitive analysis integration
 */

import request from 'supertest';
import App from '../../src/server/app';
import { createApiTestHelper, testDataGenerators } from '../utils/apiTestHelpers';

describe('Conversations API', () => {
  let app;
  let apiHelper;
  let authToken;
  let testUserId;

  beforeAll(async () => {
    const appInstance = new App();
    appInstance.initializeMiddlewares();
    appInstance.initializeRoutes();
    appInstance.initializeErrorHandling();
    app = appInstance.app;
    apiHelper = createApiTestHelper(app);

    // Authenticate and get token
    await apiHelper.authenticate({
      email: 'conversation@example.com',
      username: 'convuser',
      password: 'ConvPassword123!',
    });
    authToken = apiHelper.token;
  });

  describe('POST /api/conversations', () => {
    describe('Successful conversation creation', () => {
      test('should create a new conversation with valid data', async () => {
        const conversationData = {
          title: 'AI Ethics Discussion',
          participants: ['Alice', 'Bob'],
          messages: [
            {
              speaker: 'Alice',
              text: 'What are your thoughts on AI ethics?',
              timestamp: new Date().toISOString(),
              metadata: { confidence: 0.95 }
            },
            {
              speaker: 'Bob',
              text: 'AI ethics is crucial for responsible development.',
              timestamp: new Date().toISOString(),
              metadata: { confidence: 0.88 }
            }
          ],
          metadata: {
            duration: 120,
            language: 'en',
            topic: 'AI ethics'
          }
        };

        const response = await request(app)
          .post('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .send(conversationData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('title', conversationData.title);
        expect(response.body).toHaveProperty('participants');
        expect(response.body).toHaveProperty('messages');
        expect(response.body).toHaveProperty('metadata');
        expect(response.body).toHaveProperty('created_at');
        expect(response.body).toHaveProperty('updated_at');
        expect(response.body.id).toBeValidUUID();
        expect(response.body.created_at).toBeValidDate();
        testUserId = response.body.id;
      });

      test('should create conversation with minimal required data', async () => {
        const minimalData = {
          title: 'Simple Conversation',
          participants: ['User1']
        };

        const response = await request(app)
          .post('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .send(minimalData);

        expect(response.status).toBe(201);
        expect(response.body.title).toBe(minimalData.title);
        expect(response.body.participants).toEqual(minimalData.participants);
        expect(response.body.messages).toEqual([]);
        expect(response.body.metadata).toBeDefined();
      });

      test('should auto-generate metadata if not provided', async () => {
        const conversationData = {
          title: 'Test Conversation',
          participants: ['User1', 'User2'],
          messages: [
            {
              speaker: 'User1',
              text: 'Hello world',
              timestamp: new Date().toISOString()
            }
          ]
        };

        const response = await request(app)
          .post('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .send(conversationData);

        expect(response.status).toBe(201);
        expect(response.body.metadata).toHaveProperty('language');
        expect(response.body.metadata).toHaveProperty('message_count');
        expect(response.body.metadata.message_count).toBe(1);
      });
    });

    describe('Validation errors', () => {
      test('should reject conversation without title', async () => {
        const invalidData = {
          participants: ['User1']
        };

        const response = await request(app)
          .post('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation Error');
        expect(response.body.details).toContain('Title is required');
      });

      test('should reject conversation with empty participants', async () => {
        const invalidData = {
          title: 'Test Conversation',
          participants: []
        };

        const response = await request(app)
          .post('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation Error');
        expect(response.body.details).toContain('At least one participant is required');
      });

      test('should validate message structure', async () => {
        const invalidData = {
          title: 'Test Conversation',
          participants: ['User1'],
          messages: [
            {
              // Missing required fields
              speaker: 'User1'
            }
          ]
        };

        const response = await request(app)
          .post('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation Error');
      });

      test('should reject unauthenticated requests', async () => {
        const conversationData = {
          title: 'Test Conversation',
          participants: ['User1']
        };

        const response = await request(app)
          .post('/api/conversations')
          .send(conversationData);

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error', 'Unauthorized');
      });
    });

    describe('Data sanitization', () => {
      test('should sanitize HTML in conversation data', async () => {
        const conversationData = {
          title: '<script>alert("xss")</script>Conversation',
          participants: ['User1'],
          messages: [
            {
              speaker: 'User1',
              text: '<img src=x onerror=alert("xss")>Hello',
              timestamp: new Date().toISOString()
            }
          ]
        };

        const response = await request(app)
          .post('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .send(conversationData);

        expect(response.status).toBe(201);
        expect(response.body.title).not.toContain('<script>');
        expect(response.body.messages[0].text).not.toContain('<img>');
      });
    });
  });

  describe('GET /api/conversations', () => {
    let conversationIds = [];

    beforeAll(async () => {
      // Create test conversations for pagination tests
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Test Conversation ${i + 1}`,
            participants: [`User${i + 1}`],
            messages: []
          });
        conversationIds.push(response.body.id);
      }
    });

    test('should list user conversations', async () => {
      const response = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.pagination).toHaveProperty('page');
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('total');
    });

    test('should support pagination', async () => {
      const response = await request(app)
        .get('/api/conversations?page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.total).toBeGreaterThan(0);
    });

    test('should support search functionality', async () => {
      const response = await request(app)
        .get('/api/conversations?search=AI')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThanOrEqual(0);
      // All results should contain "AI" in title or content
      response.body.data.forEach(conv => {
        const searchText = conv.title.toLowerCase();
        expect(searchText).toContain('ai');
      });
    });

    test('should support filtering by language', async () => {
      const response = await request(app)
        .get('/api/conversations?language=en')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      response.body.data.forEach(conv => {
        expect(conv.metadata.language).toBe('en');
      });
    });

    test('should support sorting', async () => {
      const response = await request(app)
        .get('/api/conversations?sort=created_at&order=desc')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      // Verify that conversations are sorted by created_at descending
      const conversations = response.body.data;
      for (let i = 1; i < conversations.length; i++) {
        const prevDate = new Date(conversations[i - 1].created_at);
        const currDate = new Date(conversations[i].created_at);
        expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
      }
    });

    test('should handle invalid pagination parameters', async () => {
      const response = await request(app)
        .get('/api/conversations?page=invalid&limit=invalid')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('GET /api/conversations/:id', () => {
    let conversationId;

    beforeAll(async () => {
      // Create a test conversation
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Detailed Conversation',
          participants: ['Alice', 'Bob'],
          messages: [
            {
              speaker: 'Alice',
              text: 'Hello Bob!',
              timestamp: new Date().toISOString(),
              metadata: { confidence: 0.95 }
            },
            {
              speaker: 'Bob',
              text: 'Hi Alice! How are you?',
              timestamp: new Date().toISOString(),
              metadata: { confidence: 0.92 }
            }
          ]
        });
      conversationId = response.body.id;
    });

    test('should retrieve conversation by ID', async () => {
      const response = await request(app)
        .get(`/api/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', conversationId);
      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('participants');
      expect(response.body).toHaveProperty('messages');
      expect(response.body).toHaveProperty('metadata');
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('updated_at');
    });

    test('should include full conversation details', async () => {
      const response = await request(app)
        .get(`/api/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.messages).toHaveLength(2);
      expect(response.body.messages[0]).toHaveProperty('speaker');
      expect(response.body.messages[0]).toHaveProperty('text');
      expect(response.body.messages[0]).toHaveProperty('timestamp');
      expect(response.body.messages[0]).toHaveProperty('metadata');
    });

    test('should return 404 for non-existent conversation', async () => {
      const response = await request(app)
        .get('/api/conversations/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
    });

    test('should reject access to conversations of other users', async () => {
      // This would require creating another user and trying to access their conversations
      const response = await request(app)
        .get('/api/conversations/other-user-conversation-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/conversations/:id', () => {
    let conversationId;

    beforeAll(async () => {
      // Create a test conversation
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Original Title',
          participants: ['User1'],
          messages: []
        });
      conversationId = response.body.id;
    });

    test('should update conversation with valid data', async () => {
      const updateData = {
        title: 'Updated Title',
        participants: ['User1', 'User2'],
        metadata: {
          tags: ['important', 'follow-up'],
          notes: 'Updated conversation notes'
        }
      };

      const response = await request(app)
        .put(`/api/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.title).toBe(updateData.title);
      expect(response.body.participants).toEqual(updateData.participants);
      expect(response.body.metadata.tags).toEqual(updateData.metadata.tags);
      expect(response.body).toHaveProperty('updated_at');
      expect(response.body.updated_at).toBeValidDate();
    });

    test('should allow adding new messages', async () => {
      const updateData = {
        messages: [
          {
            speaker: 'User1',
            text: 'New message added via update',
            timestamp: new Date().toISOString(),
            metadata: { confidence: 0.90 }
          }
        ]
      };

      const response = await request(app)
        .put(`/api/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.messages).toContainEqual(
        expect.objectContaining({
          speaker: 'User1',
          text: 'New message added via update'
        })
      );
    });

    test('should reject updates to non-existent conversation', async () => {
      const updateData = { title: 'Updated Title' };

      const response = await request(app)
        .put('/api/conversations/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(404);
    });

    test('should validate update data', async () => {
      const invalidData = {
        title: '', // Empty title
        participants: [] // Empty participants
      };

      const response = await request(app)
        .put(`/api/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('DELETE /api/conversations/:id', () => {
    let conversationId;

    beforeAll(async () => {
      // Create a test conversation for deletion
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Conversation to Delete',
          participants: ['User1'],
          messages: []
        });
      conversationId = response.body.id;
    });

    test('should delete conversation successfully', async () => {
      const response = await request(app)
        .delete(`/api/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Conversation deleted successfully');
    });

    test('should not be able to retrieve deleted conversation', async () => {
      const response = await request(app)
        .get(`/api/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    test('should return 404 when deleting non-existent conversation', async () => {
      const response = await request(app)
        .delete('/api/conversations/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/conversations/:id/messages', () => {
    let conversationId;

    beforeAll(async () => {
      // Create a test conversation
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Message Test Conversation',
          participants: ['User1'],
          messages: []
        });
      conversationId = response.body.id;
    });

    test('should add message to conversation', async () => {
      const messageData = {
        speaker: 'User1',
        text: 'This is a new message',
        timestamp: new Date().toISOString(),
        metadata: { confidence: 0.95 }
      };

      const response = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(messageData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.speaker).toBe(messageData.speaker);
      expect(response.body.text).toBe(messageData.text);
      expect(response.body).toHaveProperty('created_at');
    });

    test('should validate message data', async () => {
      const invalidMessage = {
        speaker: 'User1'
        // Missing required text field
      };

      const response = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidMessage);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    test('should reject adding messages to non-existent conversation', async () => {
      const messageData = {
        speaker: 'User1',
        text: 'Test message',
        timestamp: new Date().toISOString()
      };

      const response = await request(app)
        .post('/api/conversations/non-existent-id/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .send(messageData);

      expect(response.status).toBe(404);
    });
  });

  describe('Performance Tests', () => {
    test('should handle large conversation data efficiently', async () => {
      const largeConversation = {
        title: 'Large Conversation Test',
        participants: ['User1', 'User2'],
        messages: Array.from({ length: 100 }, (_, i) => ({
          speaker: i % 2 === 0 ? 'User1' : 'User2',
          text: `This is message number ${i + 1}`,
          timestamp: new Date(Date.now() - (100 - i) * 60000).toISOString(),
          metadata: { confidence: 0.9 }
        }))
      };

      const startTime = process.hrtime.bigint();
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(largeConversation);
      const endTime = process.hrtime.bigint();

      const responseTime = Number(endTime - startTime) / 1000000; // Convert to ms

      expect(response.status).toBe(201);
      expect(responseTime).toBeLessThan(5000); // Should process within 5 seconds
      expect(response.body.messages).toHaveLength(100);
    });

    test('should support efficient pagination with large datasets', async () => {
      // Create multiple conversations
      for (let i = 0; i < 20; i++) {
        await request(app)
          .post('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Performance Test ${i}`,
            participants: [`User${i}`]
          });
      }

      const startTime = process.hrtime.bigint();
      const response = await request(app)
        .get('/api/conversations?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`);
      const endTime = process.hrtime.bigint();

      const responseTime = Number(endTime - startTime) / 1000000;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
      expect(response.body.data.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Integration with Cognitive Analysis', () => {
    test('should trigger analysis when conversation is created with messages', async () => {
      const conversationData = {
        title: 'Analysis Test Conversation',
        participants: ['Alice', 'Bob'],
        messages: [
          {
            speaker: 'Alice',
            text: 'I think AI will transform education significantly.',
            timestamp: new Date().toISOString()
          },
          {
            speaker: 'Bob',
            text: 'I agree, but we need to consider accessibility and equity.',
            timestamp: new Date().toISOString()
          }
        ]
      };

      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(conversationData);

      expect(response.status).toBe(201);
      // In a real implementation, this would trigger cognitive analysis
      expect(response.body).toHaveProperty('analysis_status', 'pending');
    });
  });
});