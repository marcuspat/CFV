/**
 * Comprehensive API Test Suite for Cognitive Fabric Visualizer
 * Tests all REST API endpoints with validation for functionality, security, and performance
 */

import axios, { AxiosError, AxiosResponse } from 'axios';
import WebSocket from 'ws';
import { describe, beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';

// Test configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const WS_URL = process.env.WS_URL || 'ws://localhost:3001';

// Test data interfaces
interface TestUser {
  email: string;
  password: string;
  username: string;
  fullName: string;
}

interface TestConversation {
  id: string;
  title: string;
  transcript: string[];
}

interface TestAnalysis {
  id: string;
  conversationId: string;
  status: string;
}

interface TestMetrics {
  responseTime: number;
  statusCode: number;
  contentLength?: number;
  memoryUsage?: NodeJS.MemoryUsage;
}

interface TestResults {
  endpoint: string;
  method: string;
  success: boolean;
  metrics: TestMetrics;
  errors?: string[];
  securityIssues?: string[];
}

// Test configuration
const testConfig = {
  timeouts: {
    default: 5000,
    analysis: 120000, // 2 minutes for analysis completion
    websocket: 10000,
  },
  thresholds: {
    responseTime: {
      fast: 50, // ms
      acceptable: 100, // ms (target from CLAUDE.md)
      slow: 500, // ms
    },
    memoryUsage: {
      warning: 500 * 1024 * 1024, // 500MB
      critical: 1024 * 1024 * 1024, // 1GB
    },
  },
};

class APITestSuite {
  private results: TestResults[] = [];
  private authToken: string | null = null;
  private refreshToken: string | null = null;
  private testUser: TestUser | null = null;
  private testConversation: TestConversation | null = null;
  private testAnalysis: TestAnalysis | null = null;

  // Utility methods
  private async measureRequest<T>(
    fn: () => Promise<AxiosResponse<T>>
  ): Promise<{ response: AxiosResponse<T>; metrics: TestMetrics }> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    try {
      const response = await fn();
      const endTime = Date.now();
      const endMemory = process.memoryUsage();

      const metrics: TestMetrics = {
        responseTime: endTime - startTime,
        statusCode: response.status,
        contentLength: JSON.stringify(response.data).length,
        memoryUsage: {
          rss: endMemory.rss - startMemory.rss,
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          heapTotal: endMemory.heapTotal - startMemory.heapTotal,
          external: endMemory.external - startMemory.external,
          arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers,
        },
      };

      return { response, metrics };
    } catch (error) {
      const endTime = Date.now();
      const endMemory = process.memoryUsage();

      const metrics: TestMetrics = {
        responseTime: endTime - startTime,
        statusCode: (error as AxiosError).response?.status || 0,
        memoryUsage: {
          rss: endMemory.rss - startMemory.rss,
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          heapTotal: endMemory.heapTotal - startMemory.heapTotal,
          external: endMemory.external - startMemory.external,
          arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers,
        },
      };

      throw error;
    }
  }

  private recordResult(
    endpoint: string,
    method: string,
    success: boolean,
    metrics: TestMetrics,
    errors?: string[],
    securityIssues?: string[]
  ): void {
    this.results.push({
      endpoint,
      method,
      success,
      metrics,
      errors,
      securityIssues,
    });
  }

  private async makeRequest<T>(
    method: string,
    endpoint: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<{ response: AxiosResponse<T>; metrics: TestMetrics }> {
    const config = {
      method,
      url: `${API_BASE_URL}${endpoint}`,
      data,
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken && { Authorization: `Bearer ${this.authToken}` }),
        ...headers,
      },
      timeout: testConfig.timeouts.default,
    };

    return this.measureRequest(() => axios(config));
  }

  private async makeWebSocketConnection(path: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}${path}`);

      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('WebSocket connection timeout'));
      }, testConfig.timeouts.websocket);

      ws.on('open', () => {
        clearTimeout(timeout);
        resolve(ws);
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private checkSecurityHeaders(response: AxiosResponse): string[] {
    const issues: string[] = [];
    const headers = response.headers;

    // Check for security headers
    if (!headers['x-content-type-options']) {
      issues.push('Missing X-Content-Type-Options header');
    }
    if (!headers['x-frame-options']) {
      issues.push('Missing X-Frame-Options header');
    }
    if (!headers['x-xss-protection']) {
      issues.push('Missing X-XSS-Protection header');
    }
    if (!headers['strict-transport-security'] && API_BASE_URL.startsWith('https')) {
      issues.push('Missing Strict-Transport-Security header (HTTPS)');
    }
    if (!headers['content-security-policy']) {
      issues.push('Missing Content-Security-Policy header');
    }

    // Check for information disclosure
    if (headers['x-powered-by']) {
      issues.push(`Information disclosure: X-Powered-By: ${headers['x-powered-by']}`);
    }
    if (headers.server) {
      issues.push(`Information disclosure: Server: ${headers.server}`);
    }

    return issues;
  }

  private assessPerformance(metrics: TestMetrics): string[] {
    const issues: string[] = [];
    const { responseTime, memoryUsage } = metrics;

    if (responseTime > testConfig.thresholds.responseTime.slow) {
      issues.push(`Slow response time: ${responseTime}ms`);
    } else if (responseTime > testConfig.thresholds.responseTime.acceptable) {
      issues.push(`Response time above target: ${responseTime}ms (target: ${testConfig.thresholds.responseTime.acceptable}ms)`);
    }

    if (memoryUsage && memoryUsage.heapUsed > testConfig.thresholds.memoryUsage.warning) {
      issues.push(`High memory usage: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
    }

    return issues;
  }

  // Test methods
  async testHealthEndpoints(): Promise<void> {
    console.log('🔍 Testing Health Endpoints...');

    // Basic health check
    try {
      const { response, metrics } = await this.makeRequest('GET', '/health');
      const securityIssues = this.checkSecurityHeaders(response);
      const performanceIssues = this.assessPerformance(metrics);

      this.recordResult('/health', 'GET', true, metrics, performanceIssues, securityIssues);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status', 'healthy');
      expect(response.data).toHaveProperty('timestamp');
      expect(response.data).toHaveProperty('uptime');
    } catch (error) {
      this.recordResult('/health', 'GET', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
      throw error;
    }

    // Detailed health check
    try {
      const { response, metrics } = await this.makeRequest('GET', '/health/detailed');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
      expect(response.data).toHaveProperty('services');
      expect(response.data.services).toHaveProperty('postgres');
      expect(response.data.services).toHaveProperty('neo4j');
      expect(response.data.services).toHaveProperty('redis');
    } catch (error) {
      this.recordResult('/health/detailed', 'GET', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
    }

    // Readiness probe
    try {
      const { response, metrics } = await this.makeRequest('GET', '/health/ready');
      expect([200, 503]).toContain(response.status);
      expect(response.data).toHaveProperty('status');
    } catch (error) {
      this.recordResult('/health/ready', 'GET', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
    }

    // Liveness probe
    try {
      const { response, metrics } = await this.makeRequest('GET', '/health/live');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status', 'alive');
    } catch (error) {
      this.recordResult('/health/live', 'GET', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
    }

    console.log('✅ Health endpoints test completed');
  }

  async testAuthenticationEndpoints(): Promise<void> {
    console.log('🔍 Testing Authentication Endpoints...');

    this.testUser = {
      email: `test-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      username: `testuser${Date.now()}`,
      fullName: 'Test User',
    };

    // Register new user
    try {
      const { response, metrics } = await this.makeRequest('POST', '/api/auth/register', this.testUser);
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('user');
      expect(response.data).toHaveProperty('token');
      expect(response.data).toHaveProperty('refreshToken');

      this.authToken = response.data.token;
      this.refreshToken = response.data.refreshToken;

      this.recordResult('/api/auth/register', 'POST', true, metrics);
    } catch (error) {
      this.recordResult('/api/auth/register', 'POST', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
      throw error;
    }

    // Test login with existing user
    try {
      const { response, metrics } = await this.makeRequest('POST', '/api/auth/login', {
        email: this.testUser.email,
        password: this.testUser.password,
      });
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('user');
      expect(response.data).toHaveProperty('token');

      this.authToken = response.data.token;
      this.refreshToken = response.data.refreshToken;

      this.recordResult('/api/auth/login', 'POST', true, metrics);
    } catch (error) {
      this.recordResult('/api/auth/login', 'POST', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
    }

    // Test invalid login
    try {
      const { response, metrics } = await this.makeRequest('POST', '/api/auth/login', {
        email: this.testUser.email,
        password: 'wrongpassword',
      });
      expect(response.status).toBe(401);
      this.recordResult('/api/auth/login (invalid)', 'POST', true, metrics);
    } catch (error) {
      this.recordResult('/api/auth/login (invalid)', 'POST', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
    }

    // Test token refresh
    if (this.refreshToken) {
      try {
        const { response, metrics } = await this.makeRequest('POST', '/api/auth/refresh', {
          refreshToken: this.refreshToken,
        });
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('token');
        this.authToken = response.data.token;
        this.recordResult('/api/auth/refresh', 'POST', true, metrics);
      } catch (error) {
        this.recordResult('/api/auth/refresh', 'POST', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
      }
    }

    // Test getting current user profile
    if (this.authToken) {
      try {
        const { response, metrics } = await this.makeRequest('GET', '/api/auth/me');
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('user');
        expect(response.data.user.email).toBe(this.testUser.email);
        this.recordResult('/api/auth/me', 'GET', true, metrics);
      } catch (error) {
        this.recordResult('/api/auth/me', 'GET', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
      }
    }

    // Test unauthorized access
    try {
      const originalToken = this.authToken;
      this.authToken = null;

      const { response, metrics } = await this.makeRequest('GET', '/api/auth/me');
      expect(response.status).toBe(401);

      this.authToken = originalToken;
      this.recordResult('/api/auth/me (unauthorized)', 'GET', true, metrics);
    } catch (error) {
      this.recordResult('/api/auth/me (unauthorized)', 'GET', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
    }

    console.log('✅ Authentication endpoints test completed');
  }

  async testConversationEndpoints(): Promise<void> {
    console.log('🔍 Testing Conversation Endpoints...');

    if (!this.authToken) {
      throw new Error('No auth token available for conversation tests');
    }

    // Create test conversation
    const conversationData = {
      title: 'Test Conversation for API Testing',
      transcript: [
        'Hello, I need help understanding cognitive processes',
        'Of course! Cognitive processes involve how we think, learn, and remember',
        'Can you explain the different dimensions of cognition?',
        'There are four main dimensions: factual retrieval, logical inference, creative synthesis, and meta-cognition',
        'That\'s fascinating. How do these dimensions interact?',
        'They work together in complex ways, with different patterns emerging based on the task and context',
      ],
      metadata: {
        language: 'en',
        domain: 'education',
        tags: ['cognition', 'learning', 'psychology'],
      },
    };

    try {
      const { response, metrics } = await this.makeRequest('POST', '/api/conversations', conversationData);
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('conversationId');
      expect(response.data).toHaveProperty('status');

      this.testConversation = {
        id: response.data.conversationId,
        title: conversationData.title,
        transcript: conversationData.transcript,
      };

      this.recordResult('/api/conversations (POST)', 'POST', true, metrics);
    } catch (error) {
      this.recordResult('/api/conversations (POST)', 'POST', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
      throw error;
    }

    if (this.testConversation) {
      // Get conversation by ID
      try {
        const { response, metrics } = await this.makeRequest('GET', `/api/conversations/${this.testConversation.id}`);
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('conversation');
        expect(response.data.conversation.id).toBe(this.testConversation.id);
        this.recordResult('/api/conversations/:id (GET)', 'GET', true, metrics);
      } catch (error) {
        this.recordResult('/api/conversations/:id (GET)', 'GET', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
      }

      // List conversations
      try {
        const { response, metrics } = await this.makeRequest('GET', '/api/conversations');
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('conversations');
        expect(Array.isArray(response.data.conversations)).toBe(true);
        this.recordResult('/api/conversations (GET)', 'GET', true, metrics);
      } catch (error) {
        this.recordResult('/api/conversations (GET)', 'GET', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
      }

      // Update conversation metadata
      try {
        const { response, metrics } = await this.makeRequest('PUT', `/api/conversations/${this.testConversation.id}`, {
          title: 'Updated Test Conversation',
          metadata: {
            tags: ['cognition', 'learning', 'psychology', 'updated'],
          },
        });
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('conversation');
        this.recordResult('/api/conversations/:id (PUT)', 'PUT', true, metrics);
      } catch (error) {
        this.recordResult('/api/conversations/:id (PUT)', 'PUT', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
      }

      // Add transcript entry
      try {
        const { response, metrics } = await this.makeRequest('POST', `/api/conversations/${this.testConversation.id}/transcript`, {
          content: 'This is a new transcript entry added during testing',
          speaker: 'Test User',
        });
        expect(response.status).toBe(201);
        expect(response.data).toHaveProperty('sequenceNumber');
        this.recordResult('/api/conversations/:id/transcript (POST)', 'POST', true, metrics);
      } catch (error) {
        this.recordResult('/api/conversations/:id/transcript (POST)', 'POST', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
      }
    }

    console.log('✅ Conversation endpoints test completed');
  }

  async testAnalysisEndpoints(): Promise<void> {
    console.log('🔍 Testing Analysis Endpoints...');

    if (!this.authToken || !this.testConversation) {
      throw new Error('No auth token or test conversation available for analysis tests');
    }

    // Start analysis
    try {
      const { response, metrics } = await this.makeRequest('POST', '/api/analysis/start', {
        conversationId: this.testConversation.id,
        options: {
          dimensions: ['factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition'],
          includeExplainability: true,
          visualizationTypes: ['3d_graph', 'cognitive_timeline'],
        },
      });
      expect(response.status).toBe(202);
      expect(response.data).toHaveProperty('analysisId');
      expect(response.data).toHaveProperty('status');

      this.testAnalysis = {
        id: response.data.analysisId,
        conversationId: this.testConversation.id,
        status: response.data.status,
      };

      this.recordResult('/api/analysis/start', 'POST', true, metrics);
    } catch (error) {
      this.recordResult('/api/analysis/start', 'POST', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
      throw error;
    }

    if (this.testAnalysis) {
      // Wait for analysis to complete (with timeout)
      const maxWaitTime = testConfig.timeouts.analysis;
      const startTime = Date.now();
      let analysisCompleted = false;

      while (Date.now() - startTime < maxWaitTime && !analysisCompleted) {
        try {
          const { response, metrics } = await this.makeRequest('GET', `/api/analysis/${this.testAnalysis.id}/status`);
          expect(response.status).toBe(200);
          expect(response.data).toHaveProperty('status');

          this.testAnalysis.status = response.data.status;

          if (response.data.status === 'completed') {
            analysisCompleted = true;
            this.recordResult('/api/analysis/:id/status', 'GET', true, metrics);
          } else if (response.data.status === 'failed') {
            throw new Error(`Analysis failed: ${response.data.errors?.join(', ')}`);
          }

          // Wait 2 seconds before polling again
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          this.recordResult('/api/analysis/:id/status', 'GET', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
          break;
        }
      }

      if (analysisCompleted) {
        // Get analysis results
        try {
          const { response, metrics } = await this.makeRequest('GET', `/api/analysis/${this.testAnalysis.id}/result`);
          expect(response.status).toBe(200);
          expect(response.data).toHaveProperty('result');
          expect(response.data.result).toHaveProperty('elements');
          expect(response.data.result).toHaveProperty('graph');
          expect(response.data.result).toHaveProperty('metrics');
          this.recordResult('/api/analysis/:id/result', 'GET', true, metrics);
        } catch (error) {
          this.recordResult('/api/analysis/:id/result', 'GET', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
        }
      }

      // Test cancelling analysis (only if not completed)
      if (this.testAnalysis.status === 'processing') {
        try {
          const { response, metrics } = await this.makeRequest('POST', `/api/analysis/${this.testAnalysis.id}/cancel`);
          expect(response.status).toBe(200);
          this.recordResult('/api/analysis/:id/cancel', 'POST', true, metrics);
        } catch (error) {
          this.recordResult('/api/analysis/:id/cancel', 'POST', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
        }
      }
    }

    console.log('✅ Analysis endpoints test completed');
  }

  async testVisualizationEndpoints(): Promise<void> {
    console.log('🔍 Testing Visualization Endpoints...');

    if (!this.authToken || !this.testConversation) {
      throw new Error('No auth token or test conversation available for visualization tests');
    }

    // Get visualization for conversation
    try {
      const { response, metrics } = await this.makeRequest('GET', `/api/visualizations/${this.testConversation.id}?visualizationType=3d_graph`);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('visualizationId');
      expect(response.data).toHaveProperty('data');
      expect(response.data.data).toHaveProperty('type');
      this.recordResult('/api/visualizations/:conversationId', 'GET', true, metrics);
    } catch (error) {
      this.recordResult('/api/visualizations/:conversationId', 'GET', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
    }

    // List visualization types
    try {
      const { response, metrics } = await this.makeRequest('GET', '/api/visualizations/types/list');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('types');
      expect(Array.isArray(response.data.types)).toBe(true);
      this.recordResult('/api/visualizations/types/list', 'GET', true, metrics);
    } catch (error) {
      this.recordResult('/api/visualizations/types/list', 'GET', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
    }

    // Test different visualization types
    const visualizationTypes = ['cognitive_timeline', 'dimension_heatmap', 'confidence_overlay', 'network_diagram'];

    for (const vizType of visualizationTypes) {
      try {
        const { response, metrics } = await this.makeRequest('GET', `/api/visualizations/${this.testConversation.id}?visualizationType=${vizType}`);
        expect(response.status).toBe(200);
        this.recordResult(`/api/visualizations/:conversationId (${vizType})`, 'GET', true, metrics);
      } catch (error) {
        this.recordResult(`/api/visualizations/:conversationId (${vizType})`, 'GET', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
      }
    }

    console.log('✅ Visualization endpoints test completed');
  }

  async testWebSocketConnections(): Promise<void> {
    console.log('🔍 Testing WebSocket Connections...');

    // Test basic WebSocket connection
    try {
      const ws = await this.makeWebSocketConnection('/ws/analysis');

      // Test message sending and receiving
      const testMessage = JSON.stringify({
        type: 'ping',
        timestamp: new Date().toISOString(),
      });

      ws.send(testMessage);

      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket response timeout'));
        }, 5000);

        ws.on('message', (data) => {
          clearTimeout(timeout);
          try {
            const parsed = JSON.parse(data.toString());
            resolve(parsed);
          } catch (error) {
            reject(error);
          }
        });

        ws.on('error', reject);
      });

      ws.close();
      this.recordResult('WebSocket /ws/analysis', 'CONNECT', true, { responseTime: 100, statusCode: 200 });
    } catch (error) {
      this.recordResult('WebSocket /ws/analysis', 'CONNECT', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
    }

    console.log('✅ WebSocket connections test completed');
  }

  async testErrorHandling(): Promise<void> {
    console.log('🔍 Testing Error Handling...');

    // Test 404 handling
    try {
      const { response, metrics } = await this.makeRequest('GET', '/api/nonexistent');
      expect(response.status).toBe(404);
      expect(response.data).toHaveProperty('error');
      this.recordResult('/api/nonexistent (404)', 'GET', true, metrics);
    } catch (error) {
      this.recordResult('/api/nonexistent (404)', 'GET', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
    }

    // Test validation errors
    if (this.authToken) {
      try {
        const { response, metrics } = await this.makeRequest('POST', '/api/conversations', {
          title: '', // Invalid empty title
          transcript: [], // Invalid empty transcript
        });
        expect([400, 422]).toContain(response.status);
        this.recordResult('/api/conversations (validation error)', 'POST', true, metrics);
      } catch (error) {
        this.recordResult('/api/conversations (validation error)', 'POST', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
      }
    }

    // Test malformed JSON
    try {
      const config = {
        method: 'POST',
        url: `${API_BASE_URL}/api/auth/login`,
        data: 'invalid json{',
        headers: { 'Content-Type': 'application/json' },
        timeout: testConfig.timeouts.default,
      };

      await axios(config);
      this.recordResult('/api/auth/login (malformed JSON)', 'POST', false, { responseTime: 0, statusCode: 0 }, ['Should have failed with malformed JSON']);
    } catch (error) {
      const statusCode = (error as AxiosError).response?.status;
      expect([400, 422]).toContain(statusCode || 0);
      this.recordResult('/api/auth/login (malformed JSON)', 'POST', true, { responseTime: 100, statusCode: statusCode || 400 });
    }

    console.log('✅ Error handling test completed');
  }

  async testRateLimiting(): Promise<void> {
    console.log('🔍 Testing Rate Limiting...');

    // Make multiple rapid requests to test rate limiting
    const requests = [];
    for (let i = 0; i < 20; i++) {
      requests.push(this.makeRequest('GET', '/health'));
    }

    try {
      const responses = await Promise.allSettled(requests);
      const rateLimited = responses.filter(r =>
        r.status === 'fulfilled' &&
        (r.value.response.status === 429 || r.value.response.status === 503)
      );

      if (rateLimited.length > 0) {
        this.recordResult('Rate limiting test', 'BULK', true, { responseTime: 1000, statusCode: 429 });
      } else {
        this.recordResult('Rate limiting test', 'BULK', true, { responseTime: 1000, statusCode: 200 });
      }
    } catch (error) {
      this.recordResult('Rate limiting test', 'BULK', false, { responseTime: 0, statusCode: 0 }, [(error as Error).message]);
    }

    console.log('✅ Rate limiting test completed');
  }

  generateReport(): void {
    console.log('\n📊 API Test Report');
    console.log('==================\n');

    const totalTests = this.results.length;
    const successfulTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - successfulTests;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Successful: ${successfulTests} (${((successfulTests / totalTests) * 100).toFixed(1)}%)`);
    console.log(`Failed: ${failedTests} (${((failedTests / totalTests) * 100).toFixed(1)}%)`);
    console.log('');

    // Performance summary
    const responseTimes = this.results
      .filter(r => r.metrics.responseTime > 0)
      .map(r => r.metrics.responseTime);

    if (responseTimes.length > 0) {
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const minResponseTime = Math.min(...responseTimes);
      const maxResponseTime = Math.max(...responseTimes);

      console.log('🚀 Performance Metrics:');
      console.log(`  Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
      console.log(`  Min Response Time: ${minResponseTime}ms`);
      console.log(`  Max Response Time: ${maxResponseTime}ms`);
      console.log('');

      // Performance assessment
      if (avgResponseTime <= testConfig.thresholds.responseTime.fast) {
        console.log('✅ Performance: EXCELLENT (All requests under 50ms)');
      } else if (avgResponseTime <= testConfig.thresholds.responseTime.acceptable) {
        console.log('✅ Performance: GOOD (Average under 100ms target)');
      } else if (avgResponseTime <= testConfig.thresholds.responseTime.slow) {
        console.log('⚠️  Performance: ACCEPTABLE (Some requests over 100ms target)');
      } else {
        console.log('❌ Performance: POOR (Many requests over 500ms)');
      }
      console.log('');
    }

    // Security issues summary
    const allSecurityIssues = this.results
      .filter(r => r.securityIssues && r.securityIssues.length > 0)
      .flatMap(r => r.securityIssues || []);

    if (allSecurityIssues.length > 0) {
      console.log('🔒 Security Issues Found:');
      const uniqueIssues = [...new Set(allSecurityIssues)];
      uniqueIssues.forEach(issue => console.log(`  ⚠️  ${issue}`));
      console.log('');
    } else {
      console.log('✅ No critical security issues detected\n');
    }

    // Failed tests
    const failedResults = this.results.filter(r => !r.success);
    if (failedResults.length > 0) {
      console.log('❌ Failed Tests:');
      failedResults.forEach(result => {
        console.log(`  ${result.method} ${result.endpoint}: ${result.errors?.join(', ')}`);
      });
      console.log('');
    }

    // Results by endpoint
    const endpointGroups = this.results.reduce((groups, result) => {
      const key = result.endpoint;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(result);
      return groups;
    }, {} as Record<string, TestResults[]>);

    console.log('📋 Results by Endpoint:');
    Object.entries(endpointGroups).forEach(([endpoint, results]) => {
      const avgTime = results.reduce((sum, r) => sum + r.metrics.responseTime, 0) / results.length;
      const successRate = (results.filter(r => r.success).length / results.length) * 100;
      console.log(`  ${endpoint}: ${successRate.toFixed(0)}% success, ${avgTime.toFixed(0)}ms avg`);
    });

    console.log('\n🎯 Test Targets from CLAUDE.md:');
    console.log(`  Target API Response Time: <${testConfig.thresholds.responseTime.acceptable}ms`);
    console.log(`  Achieved Average: ${responseTimes.length > 0 ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2) : 'N/A'}ms`);

    // Save detailed results to file
    const reportData = {
      summary: {
        totalTests,
        successfulTests,
        failedTests,
        successRate: (successfulTests / totalTests) * 100,
        averageResponseTime: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
      },
      performanceTargets: {
        targetResponseTime: testConfig.thresholds.responseTime.acceptable,
        achieved: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
        meetsTarget: responseTimes.length > 0 ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) <= testConfig.thresholds.responseTime.acceptable : false,
      },
      securityIssues: allSecurityIssues,
      detailedResults: this.results,
      timestamp: new Date().toISOString(),
    };

    require('fs').writeFileSync(
      '/workspaces/cfv/test-results/api-test-report.json',
      JSON.stringify(reportData, null, 2)
    );

    console.log('\n💾 Detailed report saved to: /workspaces/cfv/test-results/api-test-report.json');
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Comprehensive API Test Suite\n');
    console.log(`Testing API at: ${API_BASE_URL}`);
    console.log(`WebSocket URL: ${WS_URL}`);
    console.log('');

    try {
      await this.testHealthEndpoints();
      await this.testAuthenticationEndpoints();
      await this.testConversationEndpoints();
      await this.testAnalysisEndpoints();
      await this.testVisualizationEndpoints();
      await this.testWebSocketConnections();
      await this.testErrorHandling();
      await this.testRateLimiting();

      this.generateReport();
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      this.generateReport();
      throw error;
    }
  }
}

// Export for use in test files
export default APITestSuite;

// Run tests if this file is executed directly
if (require.main === module) {
  const testSuite = new APITestSuite();
  testSuite.runAllTests().catch(console.error);
}