/**
 * Simple API Test Runner for Cognitive Fabric Visualizer
 * Tests all REST API endpoints with validation
 */

const axios = require('axios');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Test configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const WS_URL = process.env.WS_URL || 'ws://localhost:3001';

class SimpleAPITester {
  constructor() {
    this.results = [];
    this.authToken = null;
    this.refreshToken = null;
    this.testUser = null;
    this.testConversation = null;
    this.testAnalysis = null;
  }

  async measureRequest(requestFn) {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    try {
      const response = await requestFn();
      const endTime = Date.now();
      const endMemory = process.memoryUsage();

      return {
        response,
        metrics: {
          responseTime: endTime - startTime,
          statusCode: response.status,
          contentLength: JSON.stringify(response.data).length,
          memoryUsage: {
            rss: endMemory.rss - startMemory.rss,
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
          },
        },
      };
    } catch (error) {
      const endTime = Date.now();
      const endMemory = process.memoryUsage();

      throw {
        error,
        metrics: {
          responseTime: endTime - startTime,
          statusCode: error.response?.status || 0,
          memoryUsage: {
            rss: endMemory.rss - startMemory.rss,
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
          },
        },
      };
    }
  }

  async makeRequest(method, endpoint, data = null, customHeaders = {}) {
    const config = {
      method,
      url: `${API_BASE_URL}${endpoint}`,
      ...(data && { data }), // Only include data if it's not null and not empty
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken && { Authorization: `Bearer ${this.authToken}` }),
        ...customHeaders,
      },
      timeout: 10000,
      validateStatus: () => true, // Don't throw on error status codes
    };

    return this.measureRequest(() => axios(config));
  }

  recordResult(endpoint, method, success, metrics, errors = []) {
    this.results.push({
      endpoint,
      method,
      success,
      metrics,
      errors,
      timestamp: new Date().toISOString(),
    });
  }

  async testHealthEndpoints() {
    console.log('🔍 Testing Health Endpoints...');

    // Basic health check
    try {
      const { response, metrics } = await this.makeRequest('GET', '/health');
      const success = response.status === 200 && response.data?.status === 'healthy';
      const errors = success ? [] : [`Expected status 200 and healthy status, got ${response.status} and ${response.data?.status}`];

      this.recordResult('/health', 'GET', success, metrics, errors);
      console.log(`  GET /health: ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
    } catch (error) {
      this.recordResult('/health', 'GET', false, error.metrics, [error.error?.message || 'Unknown error']);
      console.log(`  GET /health: ❌ FAIL (${error.error?.message || 'Unknown error'})`);
    }

    // Detailed health check
    try {
      const { response, metrics } = await this.makeRequest('GET', '/health/detailed');
      const success = [200, 503].includes(response.status) && response.data?.services;
      const errors = success ? [] : [`Expected status 200/503 with services, got ${response.status}`];

      this.recordResult('/health/detailed', 'GET', success, metrics, errors);
      console.log(`  GET /health/detailed: ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
    } catch (error) {
      this.recordResult('/health/detailed', 'GET', false, error.metrics, [error.error?.message || 'Unknown error']);
      console.log(`  GET /health/detailed: ❌ FAIL (${error.error?.message || 'Unknown error'})`);
    }

    // Readiness probe
    try {
      const { response, metrics } = await this.makeRequest('GET', '/health/ready');
      const success = [200, 503].includes(response.status) && response.data?.status;
      const errors = success ? [] : [`Expected status 200/503 with status, got ${response.status}`];

      this.recordResult('/health/ready', 'GET', success, metrics, errors);
      console.log(`  GET /health/ready: ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
    } catch (error) {
      this.recordResult('/health/ready', 'GET', false, error.metrics, [error.error?.message || 'Unknown error']);
      console.log(`  GET /health/ready: ❌ FAIL (${error.error?.message || 'Unknown error'})`);
    }

    // Liveness probe
    try {
      const { response, metrics } = await this.makeRequest('GET', '/health/live');
      const success = response.status === 200 && response.data?.status === 'alive';
      const errors = success ? [] : [`Expected status 200 and alive status, got ${response.status}`];

      this.recordResult('/health/live', 'GET', success, metrics, errors);
      console.log(`  GET /health/live: ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
    } catch (error) {
      this.recordResult('/health/live', 'GET', false, error.metrics, [error.error?.message || 'Unknown error']);
      console.log(`  GET /health/live: ❌ FAIL (${error.error?.message || 'Unknown error'})`);
    }

    console.log('✅ Health endpoints test completed\n');
  }

  async testAuthenticationEndpoints() {
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
      const success = response.status === 201 && response.data?.token && response.data?.refreshToken;
      const errors = success ? [] : [`Expected status 201 with tokens, got ${response.status}`];

      if (success) {
        this.authToken = response.data.token;
        this.refreshToken = response.data.refreshToken;
      }

      this.recordResult('/api/auth/register', 'POST', success, metrics, errors);
      console.log(`  POST /api/auth/register: ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
    } catch (error) {
      this.recordResult('/api/auth/register', 'POST', false, error.metrics, [error.error?.message || 'Unknown error']);
      console.log(`  POST /api/auth/register: ❌ FAIL (${error.error?.message || 'Unknown error'})`);
    }

    // Test login with existing user
    if (this.testUser) {
      try {
        const { response, metrics } = await this.makeRequest('POST', '/api/auth/login', {
          email: this.testUser.email,
          password: this.testUser.password,
        });
        const success = response.status === 200 && response.data?.token;
        const errors = success ? [] : [`Expected status 200 with token, got ${response.status}`];

        if (success) {
          this.authToken = response.data.token;
          this.refreshToken = response.data.refreshToken;
        }

        this.recordResult('/api/auth/login', 'POST', success, metrics, errors);
        console.log(`  POST /api/auth/login: ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
      } catch (error) {
        this.recordResult('/api/auth/login', 'POST', false, error.metrics, [error.error?.message || 'Unknown error']);
        console.log(`  POST /api/auth/login: ❌ FAIL (${error.error?.message || 'Unknown error'})`);
      }
    }

    // Test invalid login
    try {
      const { response, metrics } = await this.makeRequest('POST', '/api/auth/login', {
        email: this.testUser.email,
        password: 'wrongpassword',
      });
      const success = response.status === 401;
      const errors = success ? [] : [`Expected status 401 for invalid login, got ${response.status}`];

      this.recordResult('/api/auth/login (invalid)', 'POST', success, metrics, errors);
      console.log(`  POST /api/auth/login (invalid): ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
    } catch (error) {
      this.recordResult('/api/auth/login (invalid)', 'POST', false, error.metrics, [error.error?.message || 'Unknown error']);
      console.log(`  POST /api/auth/login (invalid): ❌ FAIL (${error.error?.message || 'Unknown error'})`);
    }

    // Test getting current user profile
    if (this.authToken) {
      try {
        const { response, metrics } = await this.makeRequest('GET', '/api/auth/me');
        const success = response.status === 200 && response.data?.user?.email === this.testUser.email;
        const errors = success ? [] : [`Expected status 200 with user data, got ${response.status}`];

        this.recordResult('/api/auth/me', 'GET', success, metrics, errors);
        console.log(`  GET /api/auth/me: ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
      } catch (error) {
        this.recordResult('/api/auth/me', 'GET', false, error.metrics, [error.error?.message || 'Unknown error']);
        console.log(`  GET /api/auth/me: ❌ FAIL (${error.error?.message || 'Unknown error'})`);
      }
    }

    // Test unauthorized access
    try {
      const originalToken = this.authToken;
      this.authToken = null;

      const { response, metrics } = await this.makeRequest('GET', '/api/auth/me');
      const success = response.status === 401;
      const errors = success ? [] : [`Expected status 401 for unauthorized, got ${response.status}`];

      this.authToken = originalToken;
      this.recordResult('/api/auth/me (unauthorized)', 'GET', success, metrics, errors);
      console.log(`  GET /api/auth/me (unauthorized): ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
    } catch (error) {
      this.recordResult('/api/auth/me (unauthorized)', 'GET', false, error.metrics, [error.error?.message || 'Unknown error']);
      console.log(`  GET /api/auth/me (unauthorized): ❌ FAIL (${error.error?.message || 'Unknown error'})`);
    }

    console.log('✅ Authentication endpoints test completed\n');
  }

  async testConversationEndpoints() {
    console.log('🔍 Testing Conversation Endpoints...');

    if (!this.authToken) {
      console.log('❌ No auth token available for conversation tests');
      return;
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
      const success = response.status === 201 && response.data?.conversationId;
      const errors = success ? [] : [`Expected status 201 with conversationId, got ${response.status}`];

      if (success) {
        this.testConversation = {
          id: response.data.conversationId,
          title: conversationData.title,
          transcript: conversationData.transcript,
        };
      }

      this.recordResult('/api/conversations (POST)', 'POST', success, metrics, errors);
      console.log(`  POST /api/conversations: ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
    } catch (error) {
      this.recordResult('/api/conversations (POST)', 'POST', false, error.metrics, [error.error?.message || 'Unknown error']);
      console.log(`  POST /api/conversations: ❌ FAIL (${error.error?.message || 'Unknown error'})`);
    }

    if (this.testConversation) {
      // Get conversation by ID
      try {
        const { response, metrics } = await this.makeRequest('GET', `/api/conversations/${this.testConversation.id}`);
        const success = response.status === 200 && response.data?.conversation?.id === this.testConversation.id;
        const errors = success ? [] : [`Expected status 200 with conversation data, got ${response.status}`];

        this.recordResult('/api/conversations/:id (GET)', 'GET', success, metrics, errors);
        console.log(`  GET /api/conversations/:id: ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
      } catch (error) {
        this.recordResult('/api/conversations/:id (GET)', 'GET', false, error.metrics, [error.error?.message || 'Unknown error']);
        console.log(`  GET /api/conversations/:id: ❌ FAIL (${error.error?.message || 'Unknown error'})`);
      }

      // List conversations
      try {
        const { response, metrics } = await this.makeRequest('GET', '/api/conversations');
        const success = response.status === 200 && Array.isArray(response.data?.conversations);
        const errors = success ? [] : [`Expected status 200 with conversations array, got ${response.status}`];

        this.recordResult('/api/conversations (GET)', 'GET', success, metrics, errors);
        console.log(`  GET /api/conversations: ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
      } catch (error) {
        this.recordResult('/api/conversations (GET)', 'GET', false, error.metrics, [error.error?.message || 'Unknown error']);
        console.log(`  GET /api/conversations: ❌ FAIL (${error.error?.message || 'Unknown error'})`);
      }

      // Update conversation metadata
      try {
        const { response, metrics } = await this.makeRequest('PUT', `/api/conversations/${this.testConversation.id}`, {
          title: 'Updated Test Conversation',
          metadata: {
            tags: ['cognition', 'learning', 'psychology', 'updated'],
          },
        });
        const success = response.status === 200 && response.data?.conversation;
        const errors = success ? [] : [`Expected status 200 with updated conversation, got ${response.status}`];

        this.recordResult('/api/conversations/:id (PUT)', 'PUT', success, metrics, errors);
        console.log(`  PUT /api/conversations/:id: ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
      } catch (error) {
        this.recordResult('/api/conversations/:id (PUT)', 'PUT', false, error.metrics, [error.error?.message || 'Unknown error']);
        console.log(`  PUT /api/conversations/:id: ❌ FAIL (${error.error?.message || 'Unknown error'})`);
      }

      // Add transcript entry
      try {
        const { response, metrics } = await this.makeRequest('POST', `/api/conversations/${this.testConversation.id}/transcript`, {
          content: 'This is a new transcript entry added during testing',
          speaker: 'Test User',
        });
        const success = response.status === 201 && response.data?.sequenceNumber !== undefined;
        const errors = success ? [] : [`Expected status 201 with sequenceNumber, got ${response.status}`];

        this.recordResult('/api/conversations/:id/transcript (POST)', 'POST', success, metrics, errors);
        console.log(`  POST /api/conversations/:id/transcript: ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
      } catch (error) {
        this.recordResult('/api/conversations/:id/transcript (POST)', 'POST', false, error.metrics, [error.error?.message || 'Unknown error']);
        console.log(`  POST /api/conversations/:id/transcript: ❌ FAIL (${error.error?.message || 'Unknown error'})`);
      }
    }

    console.log('✅ Conversation endpoints test completed\n');
  }

  async testAnalysisEndpoints() {
    console.log('🔍 Testing Analysis Endpoints...');

    if (!this.authToken || !this.testConversation) {
      console.log('❌ No auth token or test conversation available for analysis tests');
      return;
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
      const success = response.status === 202 && response.data?.analysisId;
      const errors = success ? [] : [`Expected status 202 with analysisId, got ${response.status}`];

      if (success) {
        this.testAnalysis = {
          id: response.data.analysisId,
          conversationId: this.testConversation.id,
          status: response.data.status,
        };
      }

      this.recordResult('/api/analysis/start', 'POST', success, metrics, errors);
      console.log(`  POST /api/analysis/start: ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
    } catch (error) {
      this.recordResult('/api/analysis/start', 'POST', false, error.metrics, [error.error?.message || 'Unknown error']);
      console.log(`  POST /api/analysis/start: ❌ FAIL (${error.error?.message || 'Unknown error'})`);
    }

    if (this.testAnalysis) {
      // Check analysis status (poll a few times)
      for (let i = 0; i < 5; i++) {
        try {
          const { response, metrics } = await this.makeRequest('GET', `/api/analysis/${this.testAnalysis.id}/status`);
          const success = response.status === 200 && response.data?.status;
          const errors = success ? [] : [`Expected status 200 with status, got ${response.status}`];

          this.recordResult('/api/analysis/:id/status', 'GET', success, metrics, errors);
          console.log(`  GET /api/analysis/:id/status (attempt ${i + 1}): ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms) - Status: ${response.data?.status}`);

          if (response.data?.status === 'completed') {
            break;
          }

          // Wait before next poll
          if (i < 4) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error) {
          this.recordResult('/api/analysis/:id/status', 'GET', false, error.metrics, [error.error?.message || 'Unknown error']);
          console.log(`  GET /api/analysis/:id/status (attempt ${i + 1}): ❌ FAIL (${error.error?.message || 'Unknown error'})`);
          break;
        }
      }
    }

    console.log('✅ Analysis endpoints test completed\n');
  }

  async testVisualizationEndpoints() {
    console.log('🔍 Testing Visualization Endpoints...');

    if (!this.authToken || !this.testConversation) {
      console.log('❌ No auth token or test conversation available for visualization tests');
      return;
    }

    // Get visualization for conversation
    try {
      const { response, metrics } = await this.makeRequest('GET', `/api/visualizations/${this.testConversation.id}?visualizationType=3d_graph`);
      const success = response.status === 200 && response.data?.visualizationId && response.data?.data;
      const errors = success ? [] : [`Expected status 200 with visualization data, got ${response.status}`];

      this.recordResult('/api/visualizations/:conversationId', 'GET', success, metrics, errors);
      console.log(`  GET /api/visualizations/:conversationId (3d_graph): ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
    } catch (error) {
      this.recordResult('/api/visualizations/:conversationId', 'GET', false, error.metrics, [error.error?.message || 'Unknown error']);
      console.log(`  GET /api/visualizations/:conversationId (3d_graph): ❌ FAIL (${error.error?.message || 'Unknown error'})`);
    }

    // List visualization types
    try {
      const { response, metrics } = await this.makeRequest('GET', '/api/visualizations/types/list');
      const success = response.status === 200 && Array.isArray(response.data?.types);
      const errors = success ? [] : [`Expected status 200 with types array, got ${response.status}`];

      this.recordResult('/api/visualizations/types/list', 'GET', success, metrics, errors);
      console.log(`  GET /api/visualizations/types/list: ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
    } catch (error) {
      this.recordResult('/api/visualizations/types/list', 'GET', false, error.metrics, [error.error?.message || 'Unknown error']);
      console.log(`  GET /api/visualizations/types/list: ❌ FAIL (${error.error?.message || 'Unknown error'})`);
    }

    // Test different visualization types
    const visualizationTypes = ['cognitive_timeline', 'dimension_heatmap', 'confidence_overlay', 'network_diagram'];

    for (const vizType of visualizationTypes) {
      try {
        const { response, metrics } = await this.makeRequest('GET', `/api/visualizations/${this.testConversation.id}?visualizationType=${vizType}`);
        const success = response.status === 200 && response.data?.visualizationId;
        const errors = success ? [] : [`Expected status 200 with visualization data, got ${response.status}`];

        this.recordResult(`/api/visualizations/:conversationId (${vizType})`, 'GET', success, metrics, errors);
        console.log(`  GET /api/visualizations/:conversationId (${vizType}): ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
      } catch (error) {
        this.recordResult(`/api/visualizations/:conversationId (${vizType})`, 'GET', false, error.metrics, [error.error?.message || 'Unknown error']);
        console.log(`  GET /api/visualizations/:conversationId (${vizType}): ❌ FAIL (${error.error?.message || 'Unknown error'})`);
      }
    }

    console.log('✅ Visualization endpoints test completed\n');
  }

  async testErrorHandling() {
    console.log('🔍 Testing Error Handling...');

    // Test 404 handling
    try {
      const { response, metrics } = await this.makeRequest('GET', '/api/nonexistent');
      const success = response.status === 404 && response.data?.error;
      const errors = success ? [] : [`Expected status 404 with error message, got ${response.status}`];

      this.recordResult('/api/nonexistent (404)', 'GET', success, metrics, errors);
      console.log(`  GET /api/nonexistent (404): ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
    } catch (error) {
      this.recordResult('/api/nonexistent (404)', 'GET', false, error.metrics, [error.error?.message || 'Unknown error']);
      console.log(`  GET /api/nonexistent (404): ❌ FAIL (${error.error?.message || 'Unknown error'})`);
    }

    // Test validation errors
    if (this.authToken) {
      try {
        const { response, metrics } = await this.makeRequest('POST', '/api/conversations', {
          title: '', // Invalid empty title
          transcript: [], // Invalid empty transcript
        });
        const success = [400, 422].includes(response.status);
        const errors = success ? [] : [`Expected status 400/422 for validation error, got ${response.status}`];

        this.recordResult('/api/conversations (validation error)', 'POST', success, metrics, errors);
        console.log(`  POST /api/conversations (validation error): ${success ? '✅ PASS' : '❌ FAIL'} (${metrics.responseTime}ms)`);
      } catch (error) {
        this.recordResult('/api/conversations (validation error)', 'POST', false, error.metrics, [error.error?.message || 'Unknown error']);
        console.log(`  POST /api/conversations (validation error): ❌ FAIL (${error.error?.message || 'Unknown error'})`);
      }
    }

    console.log('✅ Error handling test completed\n');
  }

  generateReport() {
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
      const TARGET_RESPONSE_TIME = 100; // From CLAUDE.md
      if (avgResponseTime <= 50) {
        console.log('✅ Performance: EXCELLENT (All requests under 50ms)');
      } else if (avgResponseTime <= TARGET_RESPONSE_TIME) {
        console.log('✅ Performance: GOOD (Average under 100ms target)');
      } else if (avgResponseTime <= 500) {
        console.log('⚠️  Performance: ACCEPTABLE (Some requests over 100ms target)');
      } else {
        console.log('❌ Performance: POOR (Many requests over 500ms)');
      }
      console.log('');
    }

    // Failed tests
    const failedResults = this.results.filter(r => !r.success);
    if (failedResults.length > 0) {
      console.log('❌ Failed Tests:');
      failedResults.forEach(result => {
        console.log(`  ${result.method} ${result.endpoint}: ${result.errors.join(', ')}`);
      });
      console.log('');
    }

    // Results by endpoint category
    const endpointGroups = this.results.reduce((groups, result) => {
      const category = result.endpoint.split('/')[1] || 'root';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(result);
      return groups;
    }, {});

    console.log('📋 Results by Category:');
    Object.entries(endpointGroups).forEach(([category, results]) => {
      const avgTime = results.reduce((sum, r) => sum + r.metrics.responseTime, 0) / results.length;
      const successRate = (results.filter(r => r.success).length / results.length) * 100;
      console.log(`  ${category}: ${successRate.toFixed(0)}% success, ${avgTime.toFixed(0)}ms avg`);
    });

    console.log('\n🎯 Test Targets from CLAUDE.md:');
    console.log(`  Target API Response Time: <100ms`);
    console.log(`  Achieved Average: ${responseTimes.length > 0 ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2) : 'N/A'}ms`);

    // Performance target assessment
    const avgResponseTime = responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
    const meetsTarget = avgResponseTime <= 100;
    console.log(`  Target Met: ${meetsTarget ? '✅ YES' : '❌ NO'}`);

    // Save detailed results to file
    const reportData = {
      summary: {
        totalTests,
        successfulTests,
        failedTests,
        successRate: (successfulTests / totalTests) * 100,
        averageResponseTime: avgResponseTime,
        meetsTarget,
      },
      performanceTargets: {
        targetResponseTime: 100,
        achieved: avgResponseTime,
        meetsTarget,
      },
      detailedResults: this.results,
      timestamp: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        apiUrl: API_BASE_URL,
      },
    };

    // Ensure test-results directory exists
    const testResultsDir = path.join(__dirname, '../test-results');
    if (!fs.existsSync(testResultsDir)) {
      fs.mkdirSync(testResultsDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(testResultsDir, 'api-test-report.json'),
      JSON.stringify(reportData, null, 2)
    );

    console.log('\n💾 Detailed report saved to: /workspaces/cfv/test-results/api-test-report.json');

    return {
      totalTests,
      successfulTests,
      failedTests,
      successRate: (successfulTests / totalTests) * 100,
      averageResponseTime: avgResponseTime,
      meetsTarget,
    };
  }

  async runAllTests() {
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
      await this.testErrorHandling();

      return this.generateReport();
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      this.generateReport();
      throw error;
    }
  }
}

// Export for use in other files
module.exports = SimpleAPITester;

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new SimpleAPITester();
  tester.runAllTests()
    .then((summary) => {
      console.log('\n✅ All tests completed!');
      console.log(`Final Results: ${summary.successfulTests}/${summary.totalTests} passed (${summary.successRate.toFixed(1)}%)`);
      console.log(`Performance Target Met: ${summary.meetsTarget ? '✅ YES' : '❌ NO'}`);
      process.exit(summary.failedTests > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('\n❌ Test suite failed:', error.message);
      process.exit(1);
    });
}