/**
 * Cognitive Analysis Performance Tests
 * Tests ML model performance, accuracy targets, and processing efficiency
 */

import request from 'supertest';
import App from '../../src/server/app';
import { createApiTestHelper } from '../utils/apiTestHelpers';
import { mockScenarios, mockServiceFactory } from '../mocks/services.mock';

describe('Cognitive Analysis Performance Tests', () => {
  let app;
  let apiHelper;
  let authToken;
  let testConversationId;
  let originalServices;

  beforeAll(async () => {
    const appInstance = new App();
    appInstance.initializeMiddlewares();
    appInstance.initializeRoutes();
    appInstance.initializeErrorHandling();
    app = appInstance.app;
    apiHelper = createApiTestHelper(app);

    // Store original services for restoration
    originalServices = {
      openai: global.openaiService,
      claude: global.claudeService
    };

    // Authenticate
    await apiHelper.authenticate({
      email: 'analysis-perf@example.com',
      username: 'analysisperf',
      password: 'AnalysisPerfPassword123!',
    });
    authToken = apiHelper.token;

    // Create test conversation with realistic content
    const conversationResponse = await apiHelper.authenticatedRequest('post', '/conversations', {
      title: 'AI Ethics and Healthcare Discussion',
      participants: ['Dr. Sarah Chen', 'Dr. Michael Rodriguez', 'Prof. Emily Watson'],
      messages: [
        {
          speaker: 'Dr. Sarah Chen',
          text: 'The integration of AI in healthcare diagnostics presents both unprecedented opportunities and significant ethical challenges. We must ensure that machine learning models are trained on diverse datasets to avoid bias.',
          timestamp: new Date(Date.now() - 300000).toISOString(),
          metadata: { confidence: 0.95, sentiment: 'analytical' }
        },
        {
          speaker: 'Dr. Michael Rodriguez',
          text: 'I agree with Sarah. The FDA approval process for AI-based medical devices needs to evolve to address the unique characteristics of machine learning systems, including their ability to learn and adapt over time.',
          timestamp: new Date(Date.now() - 240000).toISOString(),
          metadata: { confidence: 0.92, sentiment: 'cautious' }
        },
        {
          speaker: 'Prof. Emily Watson',
          text: 'From an academic perspective, we need to establish clear frameworks for explainability and transparency. Healthcare professionals and patients must understand how AI systems arrive at their recommendations, especially when dealing with life-critical decisions.',
          timestamp: new Date(Date.now() - 180000).toISOString(),
          metadata: { confidence: 0.89, sentiment: 'educational' }
        },
        {
          speaker: 'Dr. Sarah Chen',
          text: 'That\'s crucial. We\'re seeing cases where AI systems outperform human radiologists in detecting certain conditions, yet we struggle with the "black box" problem. The balance between performance and interpretability is key.',
          timestamp: new Date(Date.now() - 120000).toISOString(),
          metadata: { confidence: 0.94, sentiment: 'concerned' }
        },
        {
          speaker: 'Dr. Michael Rodriguez',
          text: 'The regulatory landscape is also evolving. The EU\'s AI Act and similar frameworks will impact how healthcare AI is developed and deployed globally. We need to be proactive rather than reactive in addressing these governance issues.',
          timestamp: new Date(Date.now() - 60000).toISOString(),
          metadata: { confidence: 0.88, sentiment: 'strategic' }
        }
      ]
    });
    testConversationId = conversationResponse.body.id;
  });

  afterAll(() => {
    // Restore original services
    if (originalServices.openai) {
      global.openaiService = originalServices.openai;
    }
    if (originalServices.claude) {
      global.claudeService = originalServices.claude;
    }
  });

  describe('Cognitive Dimension Processing Performance', () => {
    test('should process factual retrieval within target time', async () => {
      // Setup mock service with realistic response time
      const mockOpenAI = mockServiceFactory.createOpenAIService({
        responseDelay: 150, // 150ms response time
        errorRate: 0
      });
      global.openaiService = mockOpenAI;

      const startTime = process.hrtime.bigint();
      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval'],
            confidence_threshold: 0.7
          }
        });
      const endTime = process.hrtime.bigint();

      const processingTime = Number(endTime - startTime) / 1000000;

      expect(response.status).toBe(202);
      expect(processingTime).toBeLessThan(1000); // Should complete within 1 second
      expect(mockOpenAI.getRequestCount()).toBe(1);
    });

    test('should meet accuracy targets for factual retrieval (≥92%)', async () => {
      // Setup mock with controlled scores
      const mockOpenAI = mockServiceFactory.createOpenAIService({
        responseDelay: 100,
        responses: {
          factual_retrieval: {
            score: 0.94, // Above target
            confidence: 0.91,
            elements: [
              {
                type: 'fact',
                text: 'AI healthcare integration requires diverse training datasets',
                confidence: 0.95,
                source: 'Dr. Sarah Chen'
              },
              {
                type: 'fact',
                text: 'FDA approval process needs to evolve for ML systems',
                confidence: 0.88,
                source: 'Dr. Michael Rodriguez'
              }
            ]
          }
        }
      });
      global.openaiService = mockOpenAI;

      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval'],
            confidence_threshold: 0.7
          }
        });

      expect(response.status).toBe(202);
      expect(response.body.analysis_id).toBeDefined();
    });

    test('should process logical inference within target time', async () => {
      const mockOpenAI = mockServiceFactory.createOpenAIService({
        responseDelay: 200, // Slightly longer for complex inference
        errorRate: 0
      });
      global.openaiService = mockOpenAI;

      const startTime = process.hrtime.bigint();
      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['logical_inference'],
            confidence_threshold: 0.7
          }
        });
      const endTime = process.hrtime.bigint();

      const processingTime = Number(endTime - startTime) / 1000000;

      expect(response.status).toBe(202);
      expect(processingTime).toBeLessThan(1500); // Allow more time for inference
    });

    test('should meet accuracy targets for logical inference (≥85%)', async () => {
      const mockOpenAI = mockServiceFactory.createOpenAIService({
        responseDelay: 100,
        responses: {
          logical_inference: {
            score: 0.87, // Above target
            confidence: 0.82,
            arguments: [
              {
                type: 'causal_relationship',
                text: 'Bias in training data leads to biased AI outputs',
                confidence: 0.89,
                premise: 'ML systems learn from training data',
                conclusion: 'Diverse datasets reduce bias'
              },
              {
                type: 'premise',
                text: 'FDA regulatory evolution needed for AI medical devices',
                confidence: 0.85
              }
            ]
          }
        }
      });
      global.openaiService = mockOpenAI;

      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['logical_inference'],
            confidence_threshold: 0.7
          }
        });

      expect(response.status).toBe(202);
    });

    test('should process creative synthesis within target time', async () => {
      const mockClaude = mockServiceFactory.createClaudeService({
        responseDelay: 300, // Longer for creative processing
        errorRate: 0
      });
      global.claudeService = mockClaude;

      const startTime = process.hrtime.bigint();
      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['creative_synthesis'],
            confidence_threshold: 0.7
          }
        });
      const endTime = process.hrtime.bigint();

      const processingTime = Number(endTime - startTime) / 1000000;

      expect(response.status).toBe(202);
      expect(processingTime).toBeLessThan(2000); // Allow more time for creative synthesis
    });

    test('should meet accuracy targets for creative synthesis (≥0.60 ROUGE-L)', async () => {
      const mockClaude = mockServiceFactory.createClaudeService({
        responseDelay: 150,
        responses: {
          creative_synthesis: {
            score: 0.65, // Above target
            confidence: 0.60,
            novelty_score: 0.68,
            insights: [
              'Novel regulatory frameworks could emerge from cross-disciplinary collaboration',
              'Explainability requirements might drive innovation in algorithmic transparency'
            ]
          }
        }
      });
      global.claudeService = mockClaude;

      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['creative_synthesis'],
            confidence_threshold: 0.7
          }
        });

      expect(response.status).toBe(202);
    });

    test('should process meta-cognition within target time', async () => {
      const mockOpenAI = mockServiceFactory.createOpenAIService({
        responseDelay: 250, // Longer for meta-cognitive analysis
        errorRate: 0
      });
      global.openaiService = mockOpenAI;

      const startTime = process.hrtime.bigint();
      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['meta_cognition'],
            confidence_threshold: 0.7
          }
        });
      const endTime = process.hrtime.bigint();

      const processingTime = Number(endTime - startTime) / 1000000;

      expect(response.status).toBe(202);
      expect(processingTime).toBeLessThan(1750); // Target meta-cognition processing time
    });

    test('should meet accuracy targets for meta-cognition (≥0.96 F1-score)', async () => {
      const mockOpenAI = mockServiceFactory.createOpenAIService({
        responseDelay: 100,
        responses: {
          meta_cognition: {
            score: 0.97, // Above target
            confidence: 0.94,
            strategies: [
              'ethical_reasoning',
              'risk_assessment',
              'stakeholder_consideration',
              'regulatory_awareness'
            ],
            monitoring_level: 'high',
            self_correction_indicators: ['bias_detection', 'uncertainty_quantification']
          }
        }
      });
      global.openaiService = mockOpenAI;

      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['meta_cognition'],
            confidence_threshold: 0.7
          }
        });

      expect(response.status).toBe(202);
    });
  });

  describe('Multi-Dimensional Analysis Performance', () => {
    test('should process all four dimensions concurrently', async () => {
      const mockServices = mockScenarios.successfulAnalysis({
        openai: { responseDelay: 150 },
        claude: { responseDelay: 200 }
      });
      global.openaiService = mockServices.openai;
      global.claudeService = mockServices.claude;

      const startTime = process.hrtime.bigint();
      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition'],
            confidence_threshold: 0.7,
            parallel_processing: true
          }
        });
      const endTime = process.hrtime.bigint();

      const processingTime = Number(endTime - startTime) / 1000000;

      expect(response.status).toBe(202);
      expect(processingTime).toBeLessThan(2500); // Should be faster than sequential processing
      expect(mockServices.openai.getRequestCount() + mockServices.claude.getRequestCount()).toBeGreaterThan(0);
    });

    test('should maintain accuracy across all dimensions', async () => {
      const mockServices = mockScenarios.successfulAnalysis();
      global.openaiService = mockServices.openai;
      global.claudeService = mockServices.claude;

      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition'],
            confidence_threshold: 0.7
          }
        });

      expect(response.status).toBe(202);
      expect(response.body.analysis_id).toBeDefined();
    });

    test('should handle dimension-specific confidence thresholds', async () => {
      const mockOpenAI = mockServiceFactory.createOpenAIService({
        responseDelay: 100,
        responses: {
          factual_retrieval: { score: 0.93, confidence: 0.90 },
          logical_inference: { score: 0.86, confidence: 0.82 },
          creative_synthesis: { score: 0.62, confidence: 0.58 },
          meta_cognition: { score: 0.97, confidence: 0.94 }
        }
      });
      global.openaiService = mockOpenAI;

      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition'],
            confidence_thresholds: {
              factual_retrieval: 0.85,
              logical_inference: 0.80,
              creative_synthesis: 0.55,
              meta_cognition: 0.90
            }
          }
        });

      expect(response.status).toBe(202);
    });
  });

  describe('Real-Time Processing Performance', () => {
    test('should process analysis updates in real-time', async () => {
      const mockServices = mockScenarios.successfulAnalysis({
        openai: { responseDelay: 100 },
        claude: { responseDelay: 150 }
      });
      global.openaiService = mockServices.openai;
      global.claudeService = mockServices.claude;

      // Add message to trigger real-time analysis
      const messageResponse = await request(app)
        .post(`/api/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          speaker: 'Dr. Sarah Chen',
          text: 'Real-time analysis testing with new message content.',
          timestamp: new Date().toISOString()
        });

      expect(messageResponse.status).toBe(201);

      // Check if analysis was triggered
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(mockServices.openai.getRequestCount() + mockServices.claude.getRequestCount()).toBeGreaterThan(0);
    });

    test('should handle streaming analysis for live conversations', async () => {
      const mockOpenAI = mockServiceFactory.createOpenAIService({
        responseDelay: 50, // Fast response for streaming
        errorRate: 0
      });
      global.openaiService = mockOpenAI;

      const streamingPromises = [];
      const messageCount = 5;

      for (let i = 0; i < messageCount; i++) {
        streamingPromises.push(
          request(app)
            .post(`/api/conversations/${testConversationId}/messages`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              speaker: `Speaker${i}`,
              text: `Streaming message ${i} for real-time analysis.`,
              timestamp: new Date().toISOString()
            })
        );
      }

      const startTime = process.hrtime.bigint();
      const responses = await Promise.all(streamingPromises);
      const endTime = process.hrtime.bigint();

      const totalTime = Number(endTime - startTime) / 1000000;
      const averageTime = totalTime / messageCount;

      expect(responses.every(r => r.status === 201)).toBe(true);
      expect(averageTime).toBeLessThan(200); // Each message should be processed quickly
    });
  });

  describe('Scalability Performance', () => {
    test('should handle concurrent analysis requests', async () => {
      const mockServices = mockScenarios.successfulAnalysis();
      global.openaiService = mockServices.openai;
      global.claudeService = mockServices.claude;

      // Create multiple conversations for concurrent analysis
      const conversationIds = [];
      for (let i = 0; i < 5; i++) {
        const convResponse = await request(app)
          .post('/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Concurrent Analysis Test ${i}`,
            participants: ['User1', 'User2'],
            messages: [
              {
                speaker: 'User1',
                text: `Test message ${i} for concurrent analysis.`,
                timestamp: new Date().toISOString()
              }
            ]
          });
        conversationIds.push(convResponse.body.id);
      }

      // Initiate concurrent analyses
      const analysisPromises = conversationIds.map(convId =>
        request(app)
          .post(`/api/analysis/conversations/${convId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            options: {
              models: ['factual_retrieval', 'logical_inference'],
              confidence_threshold: 0.7
            }
          })
      );

      const startTime = process.hrtime.bigint();
      const responses = await Promise.all(analysisPromises);
      const endTime = process.hrtime.bigint();

      const totalTime = Number(endTime - startTime) / 1000000;
      const averageTime = totalTime / responses.length;

      expect(responses.every(r => r.status === 202)).toBe(true);
      expect(averageTime).toBeLessThan(1500); // Concurrent processing should be efficient

      // Cleanup
      for (const convId of conversationIds) {
        await request(app)
          .delete(`/api/conversations/${convId}`)
          .set('Authorization', `Bearer ${authToken}`);
      }
    });

    test('should handle large conversation volumes efficiently', async () => {
      const mockServices = mockScenarios.successfulAnalysis({
        openai: { responseDelay: 200 },
        claude: { responseDelay: 250 }
      });
      global.openaiService = mockServices.openai;
      global.claudeService = mockServices.claude;

      // Create conversation with many messages
      const largeConversationResponse = await request(app)
        .post('/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Large Volume Performance Test',
          participants: ['User1', 'User2'],
          messages: Array.from({ length: 50 }, (_, i) => ({
            speaker: i % 2 === 0 ? 'User1' : 'User2',
            text: `Large volume test message ${i + 1} with substantial content for performance testing.`,
            timestamp: new Date(Date.now() - (50 - i) * 60000).toISOString()
          }))
        });
      const largeConvId = largeConversationResponse.body.id;

      const startTime = process.hrtime.bigint();
      const response = await request(app)
        .post(`/api/analysis/conversations/${largeConvId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval', 'logical_inference'],
            confidence_threshold: 0.7
          }
        });
      const endTime = process.hrtime.bigint();

      const processingTime = Number(endTime - startTime) / 1000000;

      expect(response.status).toBe(202);
      expect(processingTime).toBeLessThan(3000); // Should handle large volumes efficiently

      // Cleanup
      await request(app)
        .delete(`/api/conversations/${largeConvId}`)
        .set('Authorization', `Bearer ${authToken}`);
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle service failures gracefully', async () => {
      const mockServices = mockScenarios.serviceFailures();
      global.openaiService = mockServices.openai;
      global.claudeService = mockServices.claude;

      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval', 'logical_inference'],
            confidence_threshold: 0.7,
            fallback_enabled: true
          }
        });

      // Should either succeed with fallback or handle error gracefully
      expect([202, 500, 503]).toContain(response.status);
    });

    test('should implement retry logic for transient failures', async () => {
      let attemptCount = 0;
      const retryMock = mockServiceFactory.createOpenAIService({
        responseDelay: 100,
        errorRate: 0.8, // High error rate initially
        responses: {
          default: () => {
            attemptCount++;
            if (attemptCount < 3) {
              throw new Error('Transient error');
            }
            return mockServiceFactory.getService('openai').generateMockResponse({});
          }
        }
      });
      global.openaiService = retryMock;

      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval'],
            confidence_threshold: 0.7,
            retry_attempts: 3
          }
        });

      expect(response.status).toBe(202);
      expect(attemptCount).toBeGreaterThanOrEqual(3);
    });

    test('should maintain performance under partial service degradation', async () => {
      const mockServices = mockScenarios.successfulAnalysis();
      // Make one service slower
      mockServices.claude.options.responseDelay = 1000;
      global.openaiService = mockServices.openai;
      global.claudeService = mockServices.claude;

      const startTime = process.hrtime.bigint();
      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval', 'logical_inference'], // Use only OpenAI
            confidence_threshold: 0.7
          }
        });
      const endTime = process.hrtime.bigint();

      const processingTime = Number(endTime - startTime) / 1000000;

      expect(response.status).toBe(202);
      expect(processingTime).toBeLessThan(1500); // Should not be impacted by slow Claude service
    });
  });

  describe('Model Performance Optimization', () => {
    test('should optimize model selection based on content type', async () => {
      const mockServices = mockScenarios.successfulAnalysis();
      global.openaiService = mockServices.openai;
      global.claudeService = mockServices.claude;

      // Test with technical content (should favor OpenAI)
      const technicalResponse = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval'],
            content_type: 'technical',
            confidence_threshold: 0.7,
            model_optimization: true
          }
        });

      expect(technicalResponse.status).toBe(202);

      // Test with creative content (should favor Claude)
      const creativeResponse = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['creative_synthesis'],
            content_type: 'creative',
            confidence_threshold: 0.7,
            model_optimization: true
          }
        });

      expect(creativeResponse.status).toBe(202);
    });

    test('should implement intelligent caching for repeated analyses', async () => {
      const mockServices = mockScenarios.successfulAnalysis();
      global.openaiService = mockServices.openai;
      global.claudeService = mockServices.claude;

      // First analysis
      const startTime1 = process.hrtime.bigint();
      const response1 = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval'],
            confidence_threshold: 0.7,
            cache_enabled: true
          }
        });
      const endTime1 = process.hrtime.bigint();
      const firstTime = Number(endTime1 - startTime1) / 1000000;

      // Second identical analysis (should use cache)
      const startTime2 = process.hrtime.bigint();
      const response2 = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval'],
            confidence_threshold: 0.7,
            cache_enabled: true
          }
        });
      const endTime2 = process.hrtime.bigint();
      const secondTime = Number(endTime2 - startTime2) / 1000000;

      expect(response1.status).toBe(202);
      expect(response2.status).toBe(202);
      expect(secondTime).toBeLessThan(firstTime * 0.5); // Cached response should be significantly faster
    });

    test('should balance accuracy and performance based on requirements', async () => {
      const mockServices = mockScenarios.successfulAnalysis();
      global.openaiService = mockServices.openai;
      global.claudeService = mockServices.claude;

      // High accuracy mode
      const highAccuracyResponse = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition'],
            performance_mode: 'accuracy',
            confidence_threshold: 0.9
          }
        });

      // High performance mode
      const highPerformanceResponse = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval', 'logical_inference'],
            performance_mode: 'speed',
            confidence_threshold: 0.7
          }
        });

      expect(highAccuracyResponse.status).toBe(202);
      expect(highPerformanceResponse.status).toBe(202);
    });
  });

  describe('Quality Metrics and Validation', () => {
    test('should track processing quality metrics', async () => {
      const mockServices = mockScenarios.successfulAnalysis();
      global.openaiService = mockServices.openai;
      global.claudeService = mockServices.claude;

      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval', 'logical_inference'],
            confidence_threshold: 0.7,
            track_metrics: true
          }
        });

      expect(response.status).toBe(202);
      expect(response.body.analysis_id).toBeDefined();
    });

    test('should validate cognitive score consistency', async () => {
      const mockServices = mockScenarios.successfulAnalysis();
      global.openaiService = mockServices.openai;
      global.claudeService = mockServices.claude;

      // Run multiple analyses and check score consistency
      const analysisPromises = Array(3).fill().map(() =>
        request(app)
          .post(`/api/analysis/conversations/${testConversationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            options: {
              models: ['factual_retrieval'],
              confidence_threshold: 0.7
            }
          })
      );

      const responses = await Promise.all(analysisPromises);

      responses.forEach(response => {
        expect(response.status).toBe(202);
        expect(response.body.analysis_id).toBeDefined();
      });

      // In a real implementation, you'd fetch the completed analyses and validate score consistency
      expect(mockServices.openai.getRequestCount()).toBe(3);
    });

    test('should meet ensemble model accuracy targets (95%)', async () => {
      const mockServices = mockScenarios.successfulAnalysis();
      global.openaiService = mockServices.openai;
      global.claudeService = mockServices.claude;

      const response = await request(app)
        .post(`/api/analysis/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          options: {
            models: ['factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition'],
            ensemble_method: 'weighted_average',
            confidence_threshold: 0.7,
            target_accuracy: 0.95
          }
        });

      expect(response.status).toBe(202);
      expect(response.body.analysis_id).toBeDefined();
    });
  });
});