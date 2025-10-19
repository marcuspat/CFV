/**
 * Visualizations API tests
 * Tests graph generation, visualization data, and export functionality
 */

import request from 'supertest';
import App from '../../src/server/app';
import { createApiTestHelper, testDataGenerators } from '../utils/apiTestHelpers';

describe('Visualizations API', () => {
  let app;
  let apiHelper;
  let authToken;
  let testConversationId;
  let testAnalysisId;

  beforeAll(async () => {
    const appInstance = new App();
    appInstance.initializeMiddlewares();
    appInstance.initializeRoutes();
    appInstance.initializeErrorHandling();
    app = appInstance.app;
    apiHelper = createApiTestHelper(app);

    // Authenticate and get token
    await apiHelper.authenticate({
      email: 'viz@example.com',
      username: 'vizuser',
      password: 'VizPassword123!',
    });
    authToken = apiHelper.token;

    // Create test conversation and analysis
    const conversationResponse = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Complex AI Discussion',
        participants: ['Alice', 'Bob', 'Charlie'],
        messages: [
          {
            speaker: 'Alice',
            text: 'Artificial intelligence has the potential to revolutionize healthcare diagnostics.',
            timestamp: new Date().toISOString(),
            metadata: { confidence: 0.95 }
          },
          {
            speaker: 'Bob',
            text: 'I agree, but we must consider the ethical implications of AI decision-making in medical contexts.',
            timestamp: new Date().toISOString(),
            metadata: { confidence: 0.88 }
          },
          {
            speaker: 'Charlie',
            text: 'The key is balancing innovation with patient safety and privacy protections.',
            timestamp: new Date().toISOString(),
            metadata: { confidence: 0.92 }
          },
          {
            speaker: 'Alice',
            text: 'Transparency in AI algorithms is crucial for building trust in healthcare applications.',
            timestamp: new Date().toISOString(),
            metadata: { confidence: 0.90 }
          }
        ]
      });
    testConversationId = conversationResponse.body.id;

    // Create analysis for visualization
    const analysisResponse = await request(app)
      .post(`/api/analysis/conversations/${testConversationId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        options: {
          include_graph_data: true,
          confidence_threshold: 0.7,
          models: ['factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition']
        }
      });
    testAnalysisId = analysisResponse.body.analysis_id;
  });

  describe('POST /api/visualizations/conversations/:id', () => {
    describe('Successful visualization creation', () => {
      test('should create visualization for conversation', async () => {
        const visualizationRequest = {
          conversation_id: testConversationId,
          type: 'cognitive_graph',
          options: {
            layout: 'force_directed',
            node_size: 'importance',
            edge_weight: 'confidence',
            color_scheme: 'dimensional',
            show_labels: true,
            animate_transitions: true
          }
        };

        const response = await request(app)
          .post(`/api/visualizations/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(visualizationRequest);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('conversation_id', testConversationId);
        expect(response.body).toHaveProperty('type', 'cognitive_graph');
        expect(response.body).toHaveProperty('graph_data');
        expect(response.body).toHaveProperty('layout_config');
        expect(response.body).toHaveProperty('metadata');
        expect(response.body.id).toBeValidUUID();
      });

      test('should create visualization from existing analysis', async () => {
        const visualizationRequest = {
          analysis_id: testAnalysisId,
          type: 'dimensional_breakdown',
          options: {
            chart_type: 'radar',
            include_confidence: true,
            interactive: true
          }
        };

        const response = await request(app)
          .post(`/api/visualizations/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(visualizationRequest);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('analysis_id', testAnalysisId);
        expect(response.body).toHaveProperty('type', 'dimensional_breakdown');
      });

      test('should support different visualization types', async () => {
        const visualizationTypes = ['cognitive_graph', 'dimensional_breakdown', 'timeline', 'network_map'];
        const responses = [];

        for (const type of visualizationTypes) {
          const response = await request(app)
            .post(`/api/visualizations/conversations/${testConversationId}`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              type,
              options: {}
            });
          responses.push(response);
        }

        responses.forEach(response => {
          expect(response.status).toBe(201);
          expect(visualizationTypes).toContain(response.body.type);
        });
      });
    });

    describe('Visualization options validation', () => {
      test('should validate visualization type', async () => {
        const invalidRequest = {
          conversation_id: testConversationId,
          type: 'invalid_type'
        };

        const response = await request(app)
          .post(`/api/visualizations/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidRequest);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation Error');
        expect(response.body.details).toContain('Invalid visualization type');
      });

      test('should validate layout options', async () => {
        const invalidRequest = {
          conversation_id: testConversationId,
          type: 'cognitive_graph',
          options: {
            layout: 'invalid_layout'
          }
        };

        const response = await request(app)
          .post(`/api/visualizations/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidRequest);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation Error');
      });

      test('should validate color scheme', async () => {
        const invalidRequest = {
          conversation_id: testConversationId,
          type: 'cognitive_graph',
          options: {
            color_scheme: 'invalid_scheme'
          }
        };

        const response = await request(app)
          .post(`/api/visualizations/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidRequest);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation Error');
      });
    });

    describe('Graph data generation', () => {
      test('should generate proper graph structure', async () => {
        const response = await request(app)
          .post(`/api/visualizations/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            type: 'cognitive_graph',
            options: {
              layout: 'force_directed',
              include_graph_data: true
            }
          });

        expect(response.status).toBe(201);
        expect(response.body.graph_data).toHaveProperty('nodes');
        expect(response.body.graph_data).toHaveProperty('edges');
        expect(response.body.graph_data).toHaveProperty('metadata');

        // Validate nodes
        expect(Array.isArray(response.body.graph_data.nodes)).toBe(true);
        response.body.graph_data.nodes.forEach(node => {
          expect(node).toHaveProperty('id');
          expect(node).toHaveProperty('type');
          expect(node).toHaveProperty('label');
          expect(node).toHaveProperty('position');
          expect(node).toHaveProperty('style');
        });

        // Validate edges
        expect(Array.isArray(response.body.graph_data.edges)).toBe(true);
        response.body.graph_data.edges.forEach(edge => {
          expect(edge).toHaveProperty('source');
          expect(edge).toHaveProperty('target');
          expect(edge).toHaveProperty('type');
          expect(edge).toHaveProperty('weight');
          expect(edge).toHaveProperty('style');
        });
      });

      test('should include node positioning data', async () => {
        const response = await request(app)
          .post(`/api/visualizations/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            type: 'cognitive_graph',
            options: {
              layout: 'force_directed'
            }
          });

        expect(response.status).toBe(201);

        response.body.graph_data.nodes.forEach(node => {
          expect(node.position).toHaveProperty('x');
          expect(node.position).toHaveProperty('y');
          expect(typeof node.position.x).toBe('number');
          expect(typeof node.position.y).toBe('number');
        });
      });

      test('should apply dimension-based coloring', async () => {
        const response = await request(app)
          .post(`/api/visualizations/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            type: 'cognitive_graph',
            options: {
              color_scheme: 'dimensional'
            }
          });

        expect(response.status).toBe(201);

        response.body.graph_data.nodes.forEach(node => {
          expect(node.style).toHaveProperty('color');
          expect(node.style).toHaveProperty('dimension');
          expect(['factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition']).toContain(node.style.dimension);
        });
      });
    });
  });

  describe('GET /api/visualizations/:id', () => {
    let visualizationId;

    beforeAll(async () => {
      // Create a visualization for testing
      const createResponse = await request(app)
        .post(`/api/visualizations/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'cognitive_graph',
          options: {
            layout: 'force_directed',
            color_scheme: 'dimensional'
          }
        });
      visualizationId = createResponse.body.id;
    });

    test('should retrieve visualization by ID', async () => {
      const response = await request(app)
        .get(`/api/visualizations/${visualizationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', visualizationId);
      expect(response.body).toHaveProperty('conversation_id', testConversationId);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('graph_data');
      expect(response.body).toHaveProperty('layout_config');
      expect(response.body).toHaveProperty('metadata');
    });

    test('should include complete visualization data', async () => {
      const response = await request(app)
        .get(`/api/visualizations/${visualizationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.graph_data).toHaveProperty('nodes');
      expect(response.body.graph_data).toHaveProperty('edges');
      expect(response.body.layout_config).toHaveProperty('layout');
      expect(response.body.layout_config).toHaveProperty('parameters');
      expect(response.body.metadata).toHaveProperty('created_at');
      expect(response.body.metadata).toHaveProperty('node_count');
      expect(response.body.metadata).toHaveProperty('edge_count');
    });

    test('should return 404 for non-existent visualization', async () => {
      const response = await request(app)
        .get('/api/visualizations/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
    });
  });

  describe('PUT /api/visualizations/:id', () => {
    let visualizationId;

    beforeAll(async () => {
      // Create a visualization for update testing
      const createResponse = await request(app)
        .post(`/api/visualizations/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'cognitive_graph',
          options: {
            layout: 'force_directed'
          }
        });
      visualizationId = createResponse.body.id;
    });

    test('should update visualization options', async () => {
      const updateData = {
        options: {
          layout: 'circular',
          color_scheme: 'confidence',
          show_labels: false,
          node_size: 'degree'
        }
      };

      const response = await request(app)
        .put(`/api/visualizations/${visualizationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.layout_config.layout).toBe('circular');
      expect(response.body.layout_config.color_scheme).toBe('confidence');
      expect(response.body).toHaveProperty('updated_at');
    });

    test('should regenerate graph data on layout change', async () => {
      const response = await request(app)
        .put(`/api/visualizations/${visualizationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            layout: 'hierarchical'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.graph_data).toBeDefined();
      expect(response.body.graph_data.nodes).toBeDefined();
      expect(response.body.graph_data.edges).toBeDefined();
    });

    test('should validate update data', async () => {
      const invalidUpdate = {
        options: {
          layout: 'invalid_layout'
        }
      };

      const response = await request(app)
        .put(`/api/visualizations/${visualizationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidUpdate);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('POST /api/visualizations/:id/export', () => {
    let visualizationId;

    beforeAll(async () => {
      // Create a visualization for export testing
      const createResponse = await request(app)
        .post(`/api/visualizations/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'cognitive_graph',
          options: {
            layout: 'force_directed'
          }
        });
      visualizationId = createResponse.body.id;
    });

    test('should export visualization as JSON', async () => {
      const exportRequest = {
        format: 'json',
        options: {
          include_metadata: true,
          include_layout_config: true
        }
      };

      const response = await request(app)
        .post(`/api/visualizations/${visualizationId}/export`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(exportRequest);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('visualization');
      expect(response.body).toHaveProperty('export_metadata');
      expect(response.body.export_metadata).toHaveProperty('format', 'json');
      expect(response.body.export_metadata).toHaveProperty('exported_at');
    });

    test('should export visualization as SVG', async () => {
      const exportRequest = {
        format: 'svg',
        options: {
          width: 1200,
          height: 800,
          include_labels: true
        }
      };

      const response = await request(app)
        .post(`/api/visualizations/${visualizationId}/export`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(exportRequest);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/svg/);
      expect(response.body).toContain('<svg');
      expect(response.body).toContain('</svg>');
    });

    test('should export visualization as PNG', async () => {
      const exportRequest = {
        format: 'png',
        options: {
          width: 1200,
          height: 800,
          quality: 90
        }
      };

      const response = await request(app)
        .post(`/api/visualizations/${visualizationId}/export`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(exportRequest);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/png/);
      expect(response.headers['content-length']).toBeGreaterThan(0);
    });

    test('should validate export format', async () => {
      const invalidRequest = {
        format: 'invalid_format'
      };

      const response = await request(app)
        .post(`/api/visualizations/${visualizationId}/export`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidRequest);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
      expect(response.body.details).toContain('Invalid export format');
    });

    test('should validate export options', async () => {
      const invalidRequest = {
        format: 'png',
        options: {
          width: -100, // Invalid negative width
          quality: 150 // Invalid quality > 100
        }
      };

      const response = await request(app)
        .post(`/api/visualizations/${visualizationId}/export`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidRequest);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('GET /api/visualizations/conversations/:id', () => {
    test('should list all visualizations for conversation', async () => {
      // Create multiple visualizations
      await request(app)
        .post(`/api/visualizations/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ type: 'cognitive_graph' });

      await request(app)
        .post(`/api/visualizations/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ type: 'dimensional_breakdown' });

      const response = await request(app)
        .get(`/api/visualizations/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);

      // Each visualization should have required fields
      response.body.data.forEach(viz => {
        expect(viz).toHaveProperty('id');
        expect(viz).toHaveProperty('conversation_id', testConversationId);
        expect(viz).toHaveProperty('type');
        expect(viz).toHaveProperty('created_at');
        expect(viz).toHaveProperty('metadata');
      });
    });

    test('should support filtering by visualization type', async () => {
      const response = await request(app)
        .get(`/api/visualizations/conversations/${testConversationId}?type=cognitive_graph`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      response.body.data.forEach(viz => {
        expect(viz.type).toBe('cognitive_graph');
      });
    });

    test('should support sorting by creation date', async () => {
      const response = await request(app)
        .get(`/api/visualizations/conversations/${testConversationId}?sort=created_at&order=desc`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      // Verify sorting
      const visualizations = response.body.data;
      for (let i = 1; i < visualizations.length; i++) {
        const prevDate = new Date(visualizations[i - 1].created_at);
        const currDate = new Date(visualizations[i].created_at);
        expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
      }
    });
  });

  describe('DELETE /api/visualizations/:id', () => {
    let visualizationId;

    beforeAll(async () => {
      // Create a visualization for deletion testing
      const createResponse = await request(app)
        .post(`/api/visualizations/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'cognitive_graph',
          options: {}
        });
      visualizationId = createResponse.body.id;
    });

    test('should delete visualization successfully', async () => {
      const response = await request(app)
        .delete(`/api/visualizations/${visualizationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Visualization deleted successfully');
    });

    test('should not be able to retrieve deleted visualization', async () => {
      const response = await request(app)
        .get(`/api/visualizations/${visualizationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    test('should return 404 when deleting non-existent visualization', async () => {
      const response = await request(app)
        .delete('/api/visualizations/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/visualizations/:id/clone', () => {
    let visualizationId;

    beforeAll(async () => {
      // Create a visualization for cloning testing
      const createResponse = await request(app)
        .post(`/api/visualizations/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'cognitive_graph',
          options: {
            layout: 'force_directed',
            color_scheme: 'dimensional'
          }
        });
      visualizationId = createResponse.body.id;
    });

    test('should clone visualization with new options', async () => {
      const cloneRequest = {
        options: {
          layout: 'circular',
          color_scheme: 'confidence'
        }
      };

      const response = await request(app)
        .post(`/api/visualizations/${visualizationId}/clone`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(cloneRequest);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('conversation_id', testConversationId);
      expect(response.body).toHaveProperty('type', 'cognitive_graph');
      expect(response.body.id).not.toBe(visualizationId); // Should be a new ID
      expect(response.body.layout_config.layout).toBe('circular');
      expect(response.body.layout_config.color_scheme).toBe('confidence');
    });

    test('should clone visualization without options', async () => {
      const response = await request(app)
        .post(`/api/visualizations/${visualizationId}/clone`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.id).not.toBe(visualizationId);
      expect(response.body.layout_config).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    test('should handle large graph generation efficiently', async () => {
      // Create conversation with many messages for complex graph
      const complexConversationResponse = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Complex Test Conversation',
          participants: ['User1', 'User2'],
          messages: Array.from({ length: 50 }, (_, i) => ({
            speaker: i % 2 === 0 ? 'User1' : 'User2',
            text: `This is complex message ${i + 1} with multiple cognitive elements for graph generation.`,
            timestamp: new Date(Date.now() - (50 - i) * 60000).toISOString()
          }))
        });

      const complexConversationId = complexConversationResponse.body.id;

      const startTime = process.hrtime.bigint();

      const response = await request(app)
        .post(`/api/visualizations/conversations/${complexConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'cognitive_graph',
          options: {
            layout: 'force_directed',
            include_graph_data: true
          }
        });

      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000;

      expect(response.status).toBe(201);
      expect(responseTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(response.body.graph_data.nodes.length).toBeGreaterThan(0);
    });

    test('should support concurrent visualization requests', async () => {
      const promises = Array(3).fill().map(() =>
        request(app)
          .post(`/api/visualizations/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            type: 'cognitive_graph',
            options: {
              layout: 'force_directed'
            }
          })
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
      });

      // All visualization IDs should be unique
      const visualizationIds = responses.map(r => r.body.id);
      const uniqueIds = new Set(visualizationIds);
      expect(uniqueIds.size).toBe(visualizationIds.length);
    });
  });

  describe('Visualization Type Specific Tests', () => {
    test('should create cognitive graph visualization', async () => {
      const response = await request(app)
        .post(`/api/visualizations/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'cognitive_graph',
          options: {
            layout: 'force_directed'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.type).toBe('cognitive_graph');
      expect(response.body.graph_data).toBeDefined();
    });

    test('should create dimensional breakdown visualization', async () => {
      const response = await request(app)
        .post(`/api/visualizations/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'dimensional_breakdown',
          options: {
            chart_type: 'radar'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.type).toBe('dimensional_breakdown');
      expect(response.body.chart_data).toBeDefined();
    });

    test('should create timeline visualization', async () => {
      const response = await request(app)
        .post(`/api/visualizations/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'timeline',
          options: {
            temporal_resolution: 'message'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.type).toBe('timeline');
      expect(response.body.timeline_data).toBeDefined();
    });

    test('should create network map visualization', async () => {
      const response = await request(app)
        .post(`/api/visualizations/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'network_map',
          options: {
            focus: 'participants'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.type).toBe('network_map');
      expect(response.body.network_data).toBeDefined();
    });
  });
});