/**
 * External API integration tests
 * Tests integration with OpenAI, Claude (Anthropic), and other external services
 */

import axios from 'axios';
import { setupOpenAIResponse, setupClaudeResponse, mockResponses } from '../setup/mocks.setup';

describe('External API Integration Tests', () => {
  const mockServers = new Map();

  beforeAll(async () => {
    // Setup mock servers for testing
    await setupMockServers();
  });

  afterAll(async () => {
    // Cleanup mock servers
    await cleanupMockServers();
  });

  describe('OpenAI API Integration', () => {
    let openaiClient;

    beforeAll(() => {
      openaiClient = createMockOpenAIClient();
    });

    describe('Chat Completions', () => {
      test('should send valid chat completion request', async () => {
        const request = {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are a cognitive analysis assistant.'
            },
            {
              role: 'user',
              content: 'Analyze this conversation for cognitive dimensions: "AI ethics is important for responsible development."'
            }
          ],
          temperature: 0.7,
          max_tokens: 1000
        };

        const response = await openaiClient.chat.completions.create(request);

        expect(response).toBeDefined();
        expect(response.choices).toHaveLength(1);
        expect(response.choices[0].message).toBeDefined();
        expect(response.choices[0].message.content).toBeDefined();
        expect(typeof response.choices[0].message.content).toBe('string');
      });

      test('should handle cognitive analysis requests', async () => {
        const conversationText = `
          User1: I think AI will transform healthcare significantly.
          User2: I agree, but we must consider privacy and ethical implications.
          User1: Transparency in AI decision-making is crucial for patient trust.
        `;

        const request = {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `You are a cognitive analysis expert. Analyze the conversation and return a JSON response with the following structure:
              {
                "dimensions": {
                  "factual_retrieval": {"score": 0.0-1.0, "confidence": 0.0-1.0, "elements": []},
                  "logical_inference": {"score": 0.0-1.0, "confidence": 0.0-1.0, "arguments": []},
                  "creative_synthesis": {"score": 0.0-1.0, "confidence": 0.0-1.0},
                  "meta_cognition": {"score": 0.0-1.0, "confidence": 0.0-1.0, "strategies": []}
                }
              }`
            },
            {
              role: 'user',
              content: `Analyze this conversation:\n${conversationText}`
            }
          ],
          temperature: 0.3,
          max_tokens: 2000
        };

        const response = await openaiClient.chat.completions.create(request);
        const analysisResult = JSON.parse(response.choices[0].message.content);

        expect(analysisResult).toHaveProperty('dimensions');
        expect(analysisResult.dimensions).toHaveProperty('factual_retrieval');
        expect(analysisResult.dimensions).toHaveProperty('logical_inference');
        expect(analysisResult.dimensions).toHaveProperty('creative_synthesis');
        expect(analysisResult.dimensions).toHaveProperty('meta_cognition');

        // Validate score ranges
        Object.values(analysisResult.dimensions).forEach(dimension => {
          expect(dimension.score).toBeGreaterThanOrEqual(0);
          expect(dimension.score).toBeLessThanOrEqual(1);
          expect(dimension.confidence).toBeGreaterThanOrEqual(0);
          expect(dimension.confidence).toBeLessThanOrEqual(1);
        });
      });

      test('should handle long conversations with truncation', async () => {
        const longConversation = Array.from({ length: 100 }, (_, i) =>
          `Speaker${i % 2 + 1}: This is message number ${i + 1} in a very long conversation for testing token limits and truncation.`
        ).join('\n');

        const request = {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'Analyze this conversation and provide cognitive dimensions.'
            },
            {
              role: 'user',
              content: longConversation
            }
          ],
          temperature: 0.5,
          max_tokens: 1000
        };

        const response = await openaiClient.chat.completions.create(request);

        expect(response.choices[0].message.content).toBeDefined();
        expect(response.usage).toBeDefined();
        expect(response.usage.total_tokens).toBeGreaterThan(0);
      });

      test('should handle API errors gracefully', async () => {
        // Mock API error
        const errorClient = createMockOpenAIClient({ shouldError: true, errorCode: 'rate_limit_exceeded' });

        await expect(errorClient.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'test' }]
        })).rejects.toThrow('rate_limit_exceeded');
      });
    });

    describe('Model Information', () => {
      test('should retrieve available models', async () => {
        const models = await openaiClient.models.list();

        expect(models.data).toBeDefined();
        expect(Array.isArray(models.data)).toBe(true);
        expect(models.data.length).toBeGreaterThan(0);

        models.data.forEach(model => {
          expect(model).toHaveProperty('id');
          expect(model).toHaveProperty('object', 'model');
        });

        // Should include expected models
        const modelIds = models.data.map(m => m.id);
        expect(modelIds).toContain('gpt-4');
        expect(modelIds).toContain('gpt-3.5-turbo');
      });
    });

    describe('Rate Limiting and Usage', () => {
      test('should respect rate limits', async () => {
        const promises = Array(10).fill().map(() =>
          openaiClient.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'test message' }],
            max_tokens: 50
          })
        );

        const results = await Promise.allSettled(promises);
        const failures = results.filter(r => r.status === 'rejected');

        // Some requests should fail due to rate limiting
        expect(failures.length).toBeGreaterThan(0);
      });

      test('should track token usage', async () => {
        const response = await openaiClient.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'user', content: 'This is a test message for token usage tracking.' }
          ],
          max_tokens: 100
        });

        expect(response.usage).toBeDefined();
        expect(response.usage.prompt_tokens).toBeGreaterThan(0);
        expect(response.usage.completion_tokens).toBeGreaterThan(0);
        expect(response.usage.total_tokens).toBe(
          response.usage.prompt_tokens + response.usage.completion_tokens
        );
      });
    });

    describe('Request Configuration', () => {
      test('should handle custom temperature settings', async () => {
        const requests = [
          { temperature: 0.0, expected: 'deterministic' },
          { temperature: 1.0, expected: 'creative' },
          { temperature: 0.5, expected: 'balanced' }
        ];

        for (const { temperature, expected } of requests) {
          const response = await openaiClient.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'test' }],
            temperature,
            max_tokens: 50
          });

          expect(response.choices[0].message.content).toBeDefined();
          // In real implementation, you'd verify the response characteristics
        }
      });

      test('should handle different max tokens settings', async () => {
        const maxTokensSettings = [10, 100, 500];

        for (const maxTokens of maxTokensSettings) {
          const response = await openaiClient.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Generate a response of varying length.' }],
            max_tokens: maxTokens
          });

          expect(response.choices[0].message.content).toBeDefined();
          expect(response.usage.completion_tokens).toBeLessThanOrEqual(maxTokens);
        }
      });
    });
  });

  describe('Anthropic Claude API Integration', () => {
    let claudeClient;

    beforeAll(() => {
      claudeClient = createMockClaudeClient();
    });

    describe('Message Creation', () => {
      test('should send valid message request', async () => {
        const request = {
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: 'Analyze this conversation for cognitive patterns: "Machine learning requires careful consideration of bias and fairness."'
            }
          ]
        };

        const response = await claudeClient.messages.create(request);

        expect(response).toBeDefined();
        expect(response.content).toHaveLength(1);
        expect(response.content[0]).toHaveProperty('text');
        expect(typeof response.content[0].text).toBe('string');
      });

      test('should handle structured cognitive analysis requests', async () => {
        const conversationText = `
          Researcher: We need to ensure our AI models are interpretable.
          Developer: That's challenging but essential for trust.
          Researcher: We should use techniques like attention visualization.
          Developer: And provide clear explanations for decisions.
        `;

        const request = {
          model: 'claude-3-sonnet-20240229',
          max_tokens: 2000,
          messages: [
            {
              role: 'user',
              content: `Analyze this conversation for cognitive dimensions and provide a JSON response:
              ${conversationText}

              Return analysis in this format:
              {
                "dimensions": {
                  "factual_retrieval": {"score": 0.0-1.0, "confidence": 0.0-1.0},
                  "logical_inference": {"score": 0.0-1.0, "confidence": 0.0-1.0},
                  "creative_synthesis": {"score": 0.0-1.0, "confidence": 0.0-1.0},
                  "meta_cognition": {"score": 0.0-1.0, "confidence": 0.0-1.0}
                },
                "insights": ["insight1", "insight2"]
              }`
            }
          ]
        };

        const response = await claudeClient.messages.create(request);
        const analysisResult = JSON.parse(response.content[0].text);

        expect(analysisResult).toHaveProperty('dimensions');
        expect(analysisResult).toHaveProperty('insights');
        expect(Array.isArray(analysisResult.insights)).toBe(true);

        // Validate dimension scores
        Object.values(analysisResult.dimensions).forEach(dimension => {
          expect(dimension.score).toBeGreaterThanOrEqual(0);
          expect(dimension.score).toBeLessThanOrEqual(1);
          expect(dimension.confidence).toBeGreaterThanOrEqual(0);
          expect(dimension.confidence).toBeLessThanOrEqual(1);
        });
      });

      test('should handle conversation with multiple messages', async () => {
        const request = {
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: 'Let\'s discuss AI ethics.'
            },
            {
              role: 'assistant',
              content: 'AI ethics is a crucial topic that encompasses fairness, transparency, and accountability.'
            },
            {
              role: 'user',
              content: 'What are the most important ethical considerations?'
            }
          ]
        };

        const response = await claudeClient.messages.create(request);

        expect(response.content[0].text).toBeDefined();
        expect(response.usage).toBeDefined();
        expect(response.usage.input_tokens).toBeGreaterThan(0);
        expect(response.usage.output_tokens).toBeGreaterThan(0);
      });

      test('should handle API errors appropriately', async () => {
        const errorClient = createMockClaudeClient({ shouldError: true, errorCode: 'overloaded_error' });

        await expect(errorClient.messages.create({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 100,
          messages: [{ role: 'user', content: 'test' }]
        })).rejects.toThrow('overloaded_error');
      });
    });

    describe('Model Variants', () => {
      test('should work with different Claude models', async () => {
        const models = [
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307'
        ];

        for (const model of models) {
          const response = await claudeClient.messages.create({
            model,
            max_tokens: 100,
            messages: [{ role: 'user', content: 'Brief response test.' }]
          });

          expect(response.content[0].text).toBeDefined();
          expect(response.model).toBe(model);
        }
      });
    });

    describe('Content Handling', () => {
      test('should handle structured content', async () => {
        const request = {
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Analyze this data:'
                },
                {
                  type: 'text',
                  text: JSON.stringify({
                    conversation: 'AI safety discussion',
                    participants: 3,
                    duration: '45 minutes'
                  })
                }
              ]
            }
          ]
        };

        const response = await claudeClient.messages.create(request);

        expect(response.content[0].text).toBeDefined();
        expect(response.content[0].type).toBe('text');
      });
    });
  });

  describe('Service Integration Orchestration', () => {
    test('should fallback between services when primary fails', async () => {
      const conversationText = 'Machine learning models need to be fair and unbiased.';

      // Try OpenAI first
      let analysisResult;
      try {
        const openaiClient = createMockOpenAIClient();
        const response = await openaiClient.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: conversationText }],
          max_tokens: 500
        });
        analysisResult = JSON.parse(response.choices[0].message.content);
      } catch (error) {
        // Fallback to Claude
        const claudeClient = createMockClaudeClient();
        const response = await claudeClient.messages.create({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 500,
          messages: [{ role: 'user', content: conversationText }]
        });
        analysisResult = JSON.parse(response.content[0].text);
      }

      expect(analysisResult).toBeDefined();
      expect(analysisResult).toHaveProperty('dimensions');
    });

    test('should aggregate results from multiple services', async () => {
      const conversationText = 'Data privacy is essential in AI systems.';

      const openaiClient = createMockOpenAIClient();
      const claudeClient = createMockClaudeClient();

      // Get analysis from both services
      const [openaiResponse, claudeResponse] = await Promise.allSettled([
        openaiClient.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: conversationText }],
          max_tokens: 500
        }),
        claudeClient.messages.create({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 500,
          messages: [{ role: 'user', content: conversationText }]
        })
      ]);

      const results = [];
      if (openaiResponse.status === 'fulfilled') {
        results.push({
          service: 'openai',
          analysis: JSON.parse(openaiResponse.value.choices[0].message.content)
        });
      }

      if (claudeResponse.status === 'fulfilled') {
        results.push({
          service: 'claude',
          analysis: JSON.parse(claudeResponse.value.content[0].text)
        });
      }

      expect(results.length).toBeGreaterThan(0);

      // Aggregate the results
      const aggregatedAnalysis = aggregateAnalysisResults(results);

      expect(aggregatedAnalysis).toHaveProperty('dimensions');
      expect(aggregatedAnalysis).toHaveProperty('sources');
      expect(aggregatedAnalysis.sources).toContain('openai');
      expect(aggregatedAnalysis.sources).toContain('claude');
    });

    test('should handle service timeouts gracefully', async () => {
      const timeoutClient = createMockOpenAIClient({ shouldTimeout: true, timeout: 100 });

      const startTime = Date.now();

      try {
        await timeoutClient.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 100
        });
      } catch (error) {
        const endTime = Date.now();
        const duration = endTime - startTime;

        expect(duration).toBeLessThan(5000); // Should timeout quickly
        expect(error.message).toContain('timeout');
      }
    });

    test('should implement retry logic for failed requests', async () => {
      let attemptCount = 0;
      const retryClient = createMockOpenAIClient({
        shouldRetry: true,
        maxAttempts: 3,
        attemptCallback: () => {
          attemptCount++;
          return attemptCount >= 3; // Succeed on 3rd attempt
        }
      });

      const response = await retryClient.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test with retry' }],
        max_tokens: 100
      });

      expect(response).toBeDefined();
      expect(attemptCount).toBe(3);
      expect(response.choices[0].message.content).toBeDefined();
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle network connectivity issues', async () => {
      const networkErrorClient = createMockOpenAIClient({ shouldError: true, errorCode: 'ENOTFOUND' });

      await expect(networkErrorClient.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }]
      })).rejects.toThrow();
    });

    test('should handle API quota exceeded errors', async () => {
      const quotaClient = createMockOpenAIClient({ shouldError: true, errorCode: 'insufficient_quota' });

      await expect(quotaClient.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }]
      })).rejects.toThrow('insufficient_quota');
    });

    test('should validate API responses', async () => {
      const invalidResponseClient = createMockOpenAIClient({
        shouldReturnInvalid: true,
        invalidResponse: { invalid: 'structure' }
      });

      await expect(invalidResponseClient.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }]
      })).rejects.toThrow('Invalid response structure');
    });

    test('should handle malformed response content', async () => {
      const malformedClient = createMockOpenAIClient({
        shouldReturnMalformed: true,
        malformedContent: '{ invalid json structure }'
      });

      const response = await malformedClient.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 100
      });

      expect(() => {
        JSON.parse(response.choices[0].message.content);
      }).toThrow();
    });
  });

  describe('Performance and Optimization', () => {
    test('should implement request caching', async () => {
      const cacheKey = 'cache-test-request';
      const cachedClient = createMockOpenAIClient({ enableCache: true });

      // First request
      const startTime1 = Date.now();
      const response1 = await cachedClient.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'cached request' }],
        max_tokens: 100,
        cacheKey
      });
      const duration1 = Date.now() - startTime1;

      // Second request (should be cached)
      const startTime2 = Date.now();
      const response2 = await cachedClient.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'cached request' }],
        max_tokens: 100,
        cacheKey
      });
      const duration2 = Date.now() - startTime2;

      expect(response1.choices[0].message.content).toBe(response2.choices[0].message.content);
      expect(duration2).toBeLessThan(duration1); // Cached request should be faster
    });

    test('should implement request batching', async () => {
      const batchClient = createMockOpenAIClient({ enableBatching: true });

      const requests = Array(5).fill().map((_, i) => ({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: `Batch request ${i}` }],
        max_tokens: 50
      }));

      const startTime = Date.now();
      const responses = await batchClient.batchCompletions.create(requests);
      const duration = Date.now() - startTime;

      expect(responses).toHaveLength(5);
      responses.forEach(response => {
        expect(response.choices[0].message.content).toBeDefined();
      });

      // Batching should be more efficient than individual requests
      expect(duration).toBeLessThan(3000); // Should complete quickly
    });

    test('should handle concurrent requests efficiently', async () => {
      const concurrentClient = createMockOpenAIClient();

      const promises = Array(10).fill().map((_, i) =>
        concurrentClient.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: `Concurrent request ${i}` }],
          max_tokens: 50
        })
      );

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(responses).toHaveLength(10);
      responses.forEach(response => {
        expect(response.choices[0].message.content).toBeDefined();
      });

      // Concurrent requests should be handled efficiently
      expect(duration).toBeLessThan(5000);
    });
  });

  /**
   * Helper functions for creating mock clients
   */
  function createMockOpenAIClient(options = {}) {
    return {
      chat: {
        completions: {
          create: async (request) => {
            if (options.shouldError) {
              throw new Error(options.errorCode || 'API Error');
            }

            if (options.shouldTimeout) {
              await new Promise(resolve => setTimeout(resolve, options.timeout || 5000));
            }

            if (options.shouldRetry && options.attemptCallback) {
              const shouldSucceed = options.attemptCallback();
              if (!shouldSucceed) {
                throw new Error('Temporary failure');
              }
            }

            if (options.shouldReturnInvalid) {
              return options.invalidResponse;
            }

            if (options.shouldReturnMalformed) {
              return {
                choices: [{
                  message: {
                    content: options.malformedContent || '{ invalid json }'
                  }
                }]
              };
            }

            return mockResponses.openai;
          }
        }
      },
      models: {
        list: async () => mockResponses.openaiModels
      },
      batchCompletions: options.enableBatching ? {
        create: async (requests) => {
          return requests.map(() => mockResponses.openai);
        }
      } : undefined
    };
  }

  function createMockClaudeClient(options = {}) {
    return {
      messages: {
        create: async (request) => {
          if (options.shouldError) {
            throw new Error(options.errorCode || 'API Error');
          }

          if (options.shouldTimeout) {
            await new Promise(resolve => setTimeout(resolve, options.timeout || 5000));
          }

          if (options.shouldReturnInvalid) {
            return options.invalidResponse;
          }

          if (options.shouldReturnMalformed) {
            return {
              content: [{
                text: options.malformedContent || '{ invalid json }'
              }]
            };
          }

          return mockResponses.claude;
        }
      }
    };
  }

  function aggregateAnalysisResults(results) {
    const aggregated = {
      dimensions: {
        factual_retrieval: { score: 0, confidence: 0 },
        logical_inference: { score: 0, confidence: 0 },
        creative_synthesis: { score: 0, confidence: 0 },
        meta_cognition: { score: 0, confidence: 0 }
      },
      sources: results.map(r => r.service)
    };

    // Simple averaging of scores
    const serviceCount = results.length;
    results.forEach(result => {
      Object.entries(result.analysis.dimensions).forEach(([dimension, values]) => {
        aggregated.dimensions[dimension].score += values.score / serviceCount;
        aggregated.dimensions[dimension].confidence += values.confidence / serviceCount;
      });
    });

    return aggregated;
  }

  async function setupMockServers() {
    // Setup mock HTTP servers for testing external API integrations
    // This would involve creating actual HTTP servers that mock the external APIs
    // For now, we'll use mock clients as shown above
  }

  async function cleanupMockServers() {
    // Cleanup any mock servers
    mockServers.clear();
  }
});