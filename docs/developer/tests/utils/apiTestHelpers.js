/**
 * API testing utilities and helpers
 * Provides common functionality for testing API endpoints
 */

import { validateResponse, generateTestData, httpClient } from '../setup/server.setup';

/**
 * API Test Helper Class
 */
export class ApiTestHelper {
  constructor(app) {
    this.app = app;
    this.token = null;
  }

  /**
   * Set authentication token
   */
  setToken(token) {
    this.token = token;
  }

  /**
   * Create authenticated user and get token
   */
  async authenticate(userData = {}) {
    const user = generateTestData.user(userData);

    // Mock user creation and login
    const loginResponse = await httpClient.post(this.app, '/api/auth/login', {
      email: user.email,
      password: user.password,
    });

    if (loginResponse.status === 200 && loginResponse.body.token) {
      this.setToken(loginResponse.body.token);
    }

    return loginResponse;
  }

  /**
   * Make authenticated request
   */
  async authenticatedRequest(method, url, data = {}, options = {}) {
    return httpClient[method](this.app, url, data, {
      token: this.token,
      ...options,
    });
  }

  /**
   * Test endpoint with different HTTP methods
   */
  async testHttpMethods(url, testData = {}, options = {}) {
    const methods = ['get', 'post', 'put', 'patch', 'delete'];
    const results = {};

    for (const method of methods) {
      try {
        const response = await this.authenticatedRequest(method, url, testData, options);
        results[method] = {
          status: response.status,
          body: response.body,
          headers: response.headers,
        };
      } catch (error) {
        results[method] = {
          error: error.message,
          status: 500,
        };
      }
    }

    return results;
  }

  /**
   * Test endpoint validation
   */
  async testValidation(url, invalidData, method = 'post') {
    const results = [];

    for (const [testName, data] of Object.entries(invalidData)) {
      try {
        const response = await this.authenticatedRequest(method, url, data);
        results.push({
          testName,
          status: response.status,
          body: response.body,
          passed: response.status >= 400,
        });
      } catch (error) {
        results.push({
          testName,
          error: error.message,
          status: 500,
          passed: false,
        });
      }
    }

    return results;
  }

  /**
   * Test pagination
   */
  async testPagination(url, options = {}) {
    const { pageSize = 10, maxPages = 3 } = options;
    const results = [];

    for (let page = 1; page <= maxPages; page++) {
      const response = await this.authenticatedRequest('get', url, { page, limit: pageSize });

      results.push({
        page,
        status: response.status,
        dataLength: response.body.data?.length || 0,
        pagination: response.body.pagination,
      });

      // If we get less data than page size, we've reached the end
      if (response.body.data?.length < pageSize) {
        break;
      }
    }

    return results;
  }

  /**
   * Test search functionality
   */
  async testSearch(url, searchTerms, options = {}) {
    const results = [];

    for (const term of searchTerms) {
      const response = await this.authenticatedRequest('get', url, {
        search: term,
        ...options,
      });

      results.push({
        term,
        status: response.status,
        dataLength: response.body.data?.length || 0,
        firstItem: response.body.data?.[0],
      });
    }

    return results;
  }

  /**
   * Test filtering
   */
  async testFiltering(url, filters, options = {}) {
    const results = [];

    for (const [filterName, filterValue] of Object.entries(filters)) {
      const response = await this.authenticatedRequest('get', url, {
        [filterName]: filterValue,
        ...options,
      });

      results.push({
        filterName,
        filterValue,
        status: response.status,
        dataLength: response.body.data?.length || 0,
      });
    }

    return results;
  }

  /**
   * Test sorting
   */
  async testSorting(url, sortFields, options = {}) {
    const results = [];

    for (const field of sortFields) {
      for (const direction of ['asc', 'desc']) {
        const response = await this.authenticatedRequest('get', url, {
          sort: field,
          order: direction,
          ...options,
        });

        results.push({
          field,
          direction,
          status: response.status,
          dataLength: response.body.data?.length || 0,
        });
      }
    }

    return results;
  }

  /**
   * Test rate limiting
   */
  async testRateLimit(url, options = {}) {
    const { requests = 10, delay = 100 } = options;
    const results = [];

    for (let i = 0; i < requests; i++) {
      const startTime = Date.now();
      const response = await this.authenticatedRequest('get', url);
      const endTime = Date.now();

      results.push({
        request: i + 1,
        status: response.status,
        responseTime: endTime - startTime,
        headers: response.headers,
        body: response.body,
      });

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return results;
  }

  /**
   * Test file upload
   */
  async testFileUpload(url, files, data = {}) {
    const formData = new FormData();

    // Add files
    files.forEach((file, index) => {
      formData.append(`file${index}`, file.buffer, file.name);
    });

    // Add other data
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });

    return httpClient.post(this.app, url, formData, {
      token: this.token,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  /**
   * Test file download
   */
  async testFileDownload(url, options = {}) {
    const response = await this.authenticatedRequest('get', url, {}, options);

    return {
      status: response.status,
      headers: response.headers,
      contentType: response.headers['content-type'],
      contentLength: response.headers['content-length'],
      data: response.body,
    };
  }

  /**
   * Test WebSocket connection
   */
  async testWebSocket(url, messages = []) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const responses = [];

      ws.onopen = () => {
        // Send test messages
        messages.forEach((message, index) => {
          setTimeout(() => {
            ws.send(JSON.stringify(message));
          }, index * 100);
        });
      };

      ws.onmessage = (event) => {
        responses.push({
          type: 'message',
          data: JSON.parse(event.data),
          timestamp: Date.now(),
        });
      };

      ws.onerror = (error) => {
        reject(error);
      };

      ws.onclose = (event) => {
        resolve({
          responses,
          closeEvent: event,
        });
      };

      // Close connection after timeout
      setTimeout(() => {
        ws.close();
      }, 5000);
    });
  }

  /**
   * Test error handling
   */
  async testErrorHandling(url, errorScenarios) {
    const results = [];

    for (const [scenarioName, scenario] of Object.entries(errorScenarios)) {
      try {
        const response = await this.authenticatedRequest(
          scenario.method || 'get',
          url,
          scenario.data || {},
          scenario.options || {}
        );

        results.push({
          scenarioName,
          status: response.status,
          body: response.body,
          expectedStatus: scenario.expectedStatus || 400,
          passed: response.status === scenario.expectedStatus,
        });
      } catch (error) {
        results.push({
          scenarioName,
          error: error.message,
          status: 500,
          passed: false,
        });
      }
    }

    return results;
  }

  /**
   * Test performance
   */
  async testPerformance(url, options = {}) {
    const { iterations = 10, concurrency = 1 } = options;
    const results = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = process.hrtime.bigint();
      const response = await this.authenticatedRequest('get', url);
      const endTime = process.hrtime.bigint();

      const responseTime = Number(endTime - startTime) / 1000000; // Convert to ms

      results.push({
        iteration: i + 1,
        status: response.status,
        responseTime,
        contentLength: response.headers['content-length'],
      });
    }

    return {
      results,
      average: results.reduce((sum, r) => sum + r.responseTime, 0) / results.length,
      min: Math.min(...results.map(r => r.responseTime)),
      max: Math.max(...results.map(r => r.responseTime)),
    };
  }

  /**
   * Test data consistency
   */
  async testDataConsistency(url, createData, updateData) {
    const results = {};

    // Create
    const createResponse = await this.authenticatedRequest('post', url, createData);
    results.create = {
      status: createResponse.status,
      body: createResponse.body,
      id: createResponse.body.id,
    };

    // Read
    if (results.create.id) {
      const readResponse = await this.authenticatedRequest('get', `${url}/${results.create.id}`);
      results.read = {
        status: readResponse.status,
        body: readResponse.body,
        matches: JSON.stringify(createResponse.body) === JSON.stringify(readResponse.body),
      };
    }

    // Update
    if (results.create.id) {
      const updateResponse = await this.authenticatedRequest('put', `${url}/${results.create.id}`, updateData);
      results.update = {
        status: updateResponse.status,
        body: updateResponse.body,
      };
    }

    // Delete
    if (results.create.id) {
      const deleteResponse = await this.authenticatedRequest('delete', `${url}/${results.create.id}`);
      results.delete = {
        status: deleteResponse.status,
        body: deleteResponse.body,
      };
    }

    return results;
  }

  /**
   * Generate comprehensive test report
   */
  generateTestReport(testResults) {
    const report = {
      summary: {
        total: testResults.length,
        passed: testResults.filter(r => r.passed !== false).length,
        failed: testResults.filter(r => r.passed === false).length,
      },
      details: testResults,
      recommendations: [],
    };

    // Generate recommendations based on failures
    const failures = testResults.filter(r => r.passed === false);
    if (failures.length > 0) {
      report.recommendations.push(`${failures.length} tests failed - review implementation`);
    }

    // Check for performance issues
    const performanceTests = testResults.filter(r => r.responseTime);
    if (performanceTests.length > 0) {
      const avgResponseTime = performanceTests.reduce((sum, r) => sum + r.responseTime, 0) / performanceTests.length;
      if (avgResponseTime > 1000) {
        report.recommendations.push('Average response time > 1s - consider optimization');
      }
    }

    return report;
  }
}

/**
 * Create API test helper instance
 */
export const createApiTestHelper = (app) => {
  return new ApiTestHelper(app);
};

/**
 * Common test data generators
 */
export const testDataGenerators = {
  /**
   * Generate invalid conversation data
   */
  invalidConversationData: {
    noTitle: {},
    emptyTitle: { title: '' },
    noParticipants: { title: 'Test' },
    emptyParticipants: { title: 'Test', participants: [] },
    invalidParticipantsType: { title: 'Test', participants: 'invalid' },
    invalidMessagesType: { title: 'Test', participants: ['User'], messages: 'invalid' },
  },

  /**
   * Generate invalid user data
   */
  invalidUserData: {
    noEmail: { password: 'password123' },
    invalidEmail: { email: 'invalid', password: 'password123' },
    noPassword: { email: 'test@example.com' },
    shortPassword: { email: 'test@example.com', password: '123' },
    weakPassword: { email: 'test@example.com', password: 'password' },
  },

  /**
   * Generate error scenarios
   */
  errorScenarios: {
    unauthorized: {
      expectedStatus: 401,
      description: 'Test without authentication',
    },
    notFound: {
      expectedStatus: 404,
      description: 'Test with non-existent resource',
    },
    forbidden: {
      expectedStatus: 403,
      description: 'Test with insufficient permissions',
    },
    conflict: {
      expectedStatus: 409,
      description: 'Test with conflicting data',
    },
    unprocessableEntity: {
      expectedStatus: 422,
      description: 'Test with invalid data',
    },
  },
};

// Export for global use
global.createApiTestHelper = createApiTestHelper;
global.testDataGenerators = testDataGenerators;