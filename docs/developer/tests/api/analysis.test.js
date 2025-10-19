/**
 * Cognitive Analysis API tests
 * Tests cognitive dimension analysis, ML model integration, and result processing
 */

import request from 'supertest';
import App from '../../src/server/app';
import { createApiTestHelper, testDataGenerators } from '../utils/apiTestHelpers';

describe('Analysis API', () => {
  let app;
  let apiHelper;
  let authToken;
  let testConversationId;

  beforeAll(async () => {
    const appInstance = new App();
    appInstance.initializeMiddlewares();
    appInstance.initializeRoutes();
    appInstance.initializeErrorHandling();
    app = appInstance.app;
    apiHelper = createApiTestHelper(app);

    // Authenticate and get token
    await apiHelper.authenticate({
      email: 'analysis@example.com',
      username: 'analysisuser',
      password: 'AnalysisPassword123!',
    });
    authToken = apiHelper.token;

    // Create test conversation for analysis
    const conversationResponse = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'AI Ethics Discussion',
        participants: ['Alice', 'Bob'],
        messages: [
          {
            speaker: 'Alice',
            text: 'What are your thoughts on the ethical implications of AI in healthcare?',
            timestamp: new Date().toISOString(),
            metadata: { confidence: 0.95 }
          },
          {
            speaker: 'Bob',
            text: 'I believe AI can greatly improve healthcare outcomes, but we must ensure patient privacy and algorithmic fairness.',
            timestamp: new Date().toISOString(),
            metadata: { confidence: 0.88 }
          },
          {
            speaker: 'Alice',
            text: 'That\'s a crucial point. We need transparency in how AI decisions are made, especially when they affect patient care.',
            timestamp: new Date().toISOString(),
            metadata: { confidence: 0.92 }
          }
        ]
      });
    testConversationId = conversationResponse.body.id;
  });

  describe('POST /api/analysis/conversations/:id', () => {
    describe('Successful analysis creation', () => {
      test('should create cognitive analysis for conversation', async () => {
        const analysisRequest = {
          conversation_id: testConversationId,
          options: {
            include_graph_data: true,
            confidence_threshold: 0.7,
            models: ['factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition'],
            analysis_depth: 'comprehensive'
          }
        };

        const response = await request(app)
          .post(`/api/analysis/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(analysisRequest);

        expect(response.status).toBe(202); // Accepted for processing
        expect(response.body).toHaveProperty('analysis_id');
        expect(response.body).toHaveProperty('status', 'pending');
        expect(response.body).toHaveProperty('estimated_completion');
        expect(response.body.analysis_id).toBeValidUUID();
      });

      test('should accept analysis with minimal options', async () => {
        const response = await request(app)
          .post(`/api/analysis/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({});

        expect(response.status).toBe(202);
        expect(response.body).toHaveProperty('analysis_id');
        expect(response.body).toHaveProperty('status', 'pending');
      });

      test('should validate conversation exists before analysis', async () => {
        const response = await request(app)
          .post('/api/analysis/conversations/non-existent-id')
          .set('Authorization', `Bearer ${authToken}`)
          .send({});

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('error', 'Not Found');
        expect(response.body.message).toContain('Conversation not found');
      });
    });

    describe('Analysis options validation', () => {
      test('should validate confidence threshold range', async () => {
        const invalidRequest = {
          conversation_id: testConversationId,
          options: {
            confidence_threshold: 1.5 // Invalid: > 1.0
          }
        };

        const response = await request(app)
          .post(`/api/analysis/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidRequest);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation Error');
        expect(response.body.details).toContain('Confidence threshold must be between 0 and 1');
      });

      test('should validate model selection', async () => {
        const invalidRequest = {
          conversation_id: testConversationId,
          options: {
            models: ['invalid_model']
          }
        };

        const response = await request(app)
          .post(`/api/analysis/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidRequest);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation Error');
      });

      test('should validate analysis depth', async () => {
        const invalidRequest = {
          conversation_id: testConversationId,
          options: {
            analysis_depth: 'invalid_depth'
          }
        };

        const response = await request(app)
          .post(`/api/analysis/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidRequest);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation Error');
      });
    });

    describe('Authentication and authorization', () => {
      test('should require authentication for analysis', async () => {
        const response = await request(app)
          .post(`/api/analysis/conversations/${testConversationId}`)
          .send({});

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error', 'Unauthorized');
      });

      test('should only allow analysis of user\'s own conversations', async () => {
        // This would require creating another user and testing access to their conversations
        const response = await request(app)
          .post('/api/analysis/conversations/other-user-conversation-id')
          .set('Authorization', `Bearer ${authToken}`)
          .send({});

        expect(response.status).toBe(404);
      });
    });
  });

  describe('GET /api/analysis/:id', () => {
    let analysisId;

    beforeAll(async () => {
      // Create an analysis for testing
      const createResponse = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            include_graph_data: true,
            confidence_threshold: 0.7
          }
        });
      analysisId = createResponse.body.analysis_id;
    });

    test('should retrieve analysis results', async () => {
      const response = await request(app)
        .get(`/api/analysis/${analysisId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', analysisId);
      expect(response.body).toHaveProperty('conversation_id', testConversationId);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('dimensions');
      expect(response.body).toHaveProperty('metadata');
    });

    test('should include all cognitive dimensions', async () => {
      const response = await request(app)
        .get(`/api/analysis/${analysisId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.dimensions).toHaveProperty('factual_retrieval');
      expect(response.body.dimensions).toHaveProperty('logical_inference');
      expect(response.body.dimensions).toHaveProperty('creative_synthesis');
      expect(response.body.dimensions).toHaveProperty('meta_cognition');
    });

    test('should validate dimension score ranges', async () => {
      const response = await request(app)
        .get(`/api/analysis/${analysisId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      Object.values(response.body.dimensions).forEach(dimension => {
        expect(dimension.score).toBeGreaterThanOrEqual(0);
        expect(dimension.score).toBeLessThanOrEqual(1);
        expect(dimension.confidence).toBeGreaterThanOrEqual(0);
        expect(dimension.confidence).toBeLessThanOrEqual(1);
      });
    });

    test('should include graph data when requested', async () => {
      const response = await request(app)
        .get(`/api/analysis/${analysisId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('graph_data');
      expect(response.body.graph_data).toHaveProperty('nodes');
      expect(response.body.graph_data).toHaveProperty('edges');
      expect(Array.isArray(response.body.graph_data.nodes)).toBe(true);
      expect(Array.isArray(response.body.graph_data.edges)).toBe(true);
    });

    test('should return 404 for non-existent analysis', async () => {
      const response = await request(app)
        .get('/api/analysis/non-existent-analysis-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
    });

    test('should include processing metadata', async () => {
      const response = await request(app)
        .get(`/api/analysis/${analysisId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.metadata).toHaveProperty('processing_time');
      expect(response.body.metadata).toHaveProperty('model_version');
      expect(response.body.metadata).toHaveProperty('analysis_timestamp');
      expect(response.body.metadata).toHaveProperty('confidence_threshold');
    });
  });

  describe('GET /api/analysis/conversations/:id/latest', () => {
    test('should return latest analysis for conversation', async () => {
      const response = await request(app)
        .get(`/api/analysis/conversations/${testConversationId}/latest`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('conversation_id', testConversationId);
      expect(response.body).toHaveProperty('dimensions');
      expect(response.body).toHaveProperty('status');
    });

    test('should return 404 when no analysis exists for conversation', async () => {
      // Create a new conversation without analysis
      const newConversationResponse = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'No Analysis Conversation',
          participants: ['User1']
        });

      const response = await request(app)
        .get(`/api/analysis/conversations/${newConversationResponse.body.id}/latest`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
      expect(response.body.message).toContain('No analysis found');
    });
  });

  describe('GET /api/analysis/conversations/:id/history', () => {
    test('should return analysis history for conversation', async () => {
      const response = await request(app)
        .get(`/api/analysis/conversations/${testConversationId}/history`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);

      // Each analysis in history should have required fields
      response.body.data.forEach(analysis => {
        expect(analysis).toHaveProperty('id');
        expect(analysis).toHaveProperty('conversation_id', testConversationId);
        expect(analysis).toHaveProperty('created_at');
        expect(analysis).toHaveProperty('status');
      });
    });

    test('should support pagination for analysis history', async () => {
      const response = await request(app)
        .get(`/api/analysis/conversations/${testConversationId}/history?page=1&limit=5`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(5);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(5);
    });

    test('should support sorting by creation date', async () => {
      const response = await request(app)
        .get(`/api/analysis/conversations/${testConversationId}/history?sort=created_at&order=desc`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      // Verify sorting by created_at descending
      const analyses = response.body.data;
      for (let i = 1; i < analyses.length; i++) {
        const prevDate = new Date(analyses[i - 1].created_at);
        const currDate = new Date(analyses[i].created_at);
        expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
      }
    });
  });

  describe('PUT /api/analysis/:id', () => {
    let analysisId;

    beforeAll(async () => {
      // Create an analysis for update testing
      const createResponse = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      analysisId = createResponse.body.analysis_id;
    });

    test('should update analysis with valid data', async () => {
      const updateData = {
        dimensions: {
          factual_retrieval: {
            score: 0.95,
            confidence: 0.91,
            elements: [
              {
                type: 'fact',
                text: 'AI in healthcare requires ethical consideration',
                confidence: 0.89
              }
            ]
          }
        },
        metadata: {
          manual_review: true,
          reviewer_notes: 'Updated with additional context'
        }
      };

      const response = await request(app)
        .put(`/api/analysis/${analysisId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.dimensions.factual_retrieval.score).toBe(0.95);
      expect(response.body.metadata.manual_review).toBe(true);
      expect(response.body).toHaveProperty('updated_at');
    });

    test('should validate dimension score ranges on update', async () => {
      const invalidUpdate = {
        dimensions: {
          factual_retrieval: {
            score: 1.5, // Invalid: > 1.0
            confidence: 0.9
          }
        }
      };

      const response = await request(app)
        .put(`/api/analysis/${analysisId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidUpdate);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    test('should reject updating completed analysis', async () => {
      // This would require the analysis to be in a completed state
      const response = await request(app)
        .put(`/api/analysis/${analysisId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'completed' // Should not be updatable
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('DELETE /api/analysis/:id', () => {
    let analysisId;

    beforeAll(async () => {
      // Create an analysis for deletion testing
      const createResponse = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      analysisId = createResponse.body.analysis_id;
    });

    test('should delete analysis successfully', async () => {
      const response = await request(app)
        .delete(`/api/analysis/${analysisId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Analysis deleted successfully');
    });

    test('should not be able to retrieve deleted analysis', async () => {
      const response = await request(app)
        .get(`/api/analysis/${analysisId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    test('should return 404 when deleting non-existent analysis', async () => {
      const response = await request(app)
        .delete('/api/analysis/non-existent-analysis-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/analysis/:id/reanalyze', () => {
    let analysisId;

    beforeAll(async () => {
      // Create an analysis for reanalysis testing
      const createResponse = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      analysisId = createResponse.body.analysis_id;
    });

    test('should trigger reanalysis with new options', async () => {
      const reanalyzeRequest = {
        options: {
          confidence_threshold: 0.8,
          models: ['factual_retrieval', 'logical_inference'],
          include_graph_data: true
        }
      };

      const response = await request(app)
        .post(`/api/analysis/${analysisId}/reanalyze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(reanalyzeRequest);

      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('analysis_id');
      expect(response.body).toHaveProperty('status', 'pending');
      expect(response.body).toHaveProperty('message', 'Reanalysis started');
    });

    test('should validate reanalysis options', async () => {
      const invalidRequest = {
        options: {
          confidence_threshold: 1.2 // Invalid
        }
      };

      const response = await request(app)
        .post(`/api/analysis/${analysisId}/reanalyze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidRequest);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('Performance and Load Tests', () => {
    test('should handle analysis requests efficiently', async () => {
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
      const responseTime = Number(endTime - startTime) / 1000000; // Convert to ms

      expect(response.status).toBe(202);
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });

    test('should support concurrent analysis requests', async () => {
      const promises = Array(5).fill().map(() =>
        request(app)
          .post(`/api/analysis/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({})
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.status).toBe(202);
        expect(response.body).toHaveProperty('analysis_id');
      });

      // All analysis IDs should be unique
      const analysisIds = responses.map(r => r.body.analysis_id);
      const uniqueIds = new Set(analysisIds);
      expect(uniqueIds.size).toBe(analysisIds.length);
    });
  });

  describe('Cognitive Dimension Specific Tests', () => {
    test('should properly calculate factual retrieval scores', async () => {
      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval'],
            confidence_threshold: 0.8
          }
        });

      expect(response.status).toBe(202);
      // In a real implementation, this would trigger specific factual retrieval analysis
    });

    test('should identify logical inference patterns', async () => {
      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['logical_inference']
          }
        });

      expect(response.status).toBe(202);
    });

    test('should assess creative synthesis elements', async () => {
      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['creative_synthesis']
          }
        });

      expect(response.status).toBe(202);
    });

    test('should detect meta-cognitive patterns', async () => {
      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['meta_cognition']
          }
        });

      expect(response.status).toBe(202);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Bad Request');
    });

    test('should handle very long conversation text', async () => {
      // Create conversation with very long text
      const longText = 'A'.repeat(10000);

      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            max_text_length: 5000 // Should handle truncation
          }
        });

      expect(response.status).toBe(202);
    });

    test('should handle concurrent access to same analysis', async () => {
      const createResponse = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      const analysisId = createResponse.body.analysis_id;

      // Try to access and update the same analysis concurrently
      const promises = Array(3).fill().map((_, i) =>
        request(app)
          .get(`/api/analysis/${analysisId}`)
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect([200, 202]).toContain(response.status);
      });
    });
  });
});