/**
 * Authentication API tests
 * Tests login, registration, token management, and security features
 */

import request from 'supertest';
import App from '../../src/server/app';
import { createApiTestHelper, testDataGenerators } from '../utils/apiTestHelpers';

describe('Authentication API', () => {
  let app;
  let apiHelper;

  beforeAll(async () => {
    const appInstance = new App();
    appInstance.initializeMiddlewares();
    appInstance.initializeRoutes();
    appInstance.initializeErrorHandling();
    app = appInstance.app;
    apiHelper = createApiTestHelper(app);
  });

  describe('POST /api/auth/register', () => {
    describe('Successful registration', () => {
      test('should register a new user with valid data', async () => {
        const userData = {
          email: 'newuser@example.com',
          username: 'newuser',
          password: 'SecurePassword123!',
          full_name: 'New User',
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(userData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('token');
        expect(response.body.user.email).toBe(userData.email);
        expect(response.body.user.username).toBe(userData.username);
        expect(response.body.user).not.toHaveProperty('password');
        expect(response.body.token).toBeValidUUID();
      });

      test('should create user with default metadata', async () => {
        const userData = {
          email: 'user2@example.com',
          username: 'user2',
          password: 'SecurePassword123!',
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(userData);

        expect(response.status).toBe(201);
        expect(response.body.user).toHaveProperty('metadata');
        expect(response.body.user.metadata).toHaveProperty('subscription_tier', 'free');
        expect(response.body.user.metadata).toHaveProperty('api_quota_used', 0);
      });
    });

    describe('Validation errors', () => {
      test('should reject registration with invalid email', async () => {
        const userData = {
          email: 'invalid-email',
          username: 'testuser',
          password: 'SecurePassword123!',
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(userData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation Error');
        expect(response.body.details).toContain('Invalid email format');
      });

      test('should reject registration with weak password', async () => {
        const userData = {
          email: 'test@example.com',
          username: 'testuser',
          password: '123', // Too short and weak
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(userData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation Error');
        expect(response.body.details).toContain('Password must be at least 8 characters');
      });

      test('should reject registration with duplicate email', async () => {
        const userData = {
          email: 'duplicate@example.com',
          username: 'uniqueuser',
          password: 'SecurePassword123!',
        };

        // First registration should succeed
        await request(app).post('/api/auth/register').send(userData);

        // Second registration with same email should fail
        const response = await request(app)
          .post('/api/auth/register')
          .send(userData);

        expect(response.status).toBe(409);
        expect(response.body).toHaveProperty('error', 'Conflict');
        expect(response.body.message).toContain('Email already exists');
      });

      test('should reject registration with duplicate username', async () => {
        const userData1 = {
          email: 'unique1@example.com',
          username: 'duplicateuser',
          password: 'SecurePassword123!',
        };

        const userData2 = {
          email: 'unique2@example.com',
          username: 'duplicateuser',
          password: 'SecurePassword123!',
        };

        // First registration should succeed
        await request(app).post('/api/auth/register').send(userData1);

        // Second registration with same username should fail
        const response = await request(app)
          .post('/api/auth/register')
          .send(userData2);

        expect(response.status).toBe(409);
        expect(response.body).toHaveProperty('error', 'Conflict');
        expect(response.body.message).toContain('Username already exists');
      });
    });

    describe('Input sanitization', () => {
      test('should sanitize HTML in user input', async () => {
        const userData = {
          email: 'test@example.com',
          username: '<script>alert("xss")</script>',
          password: 'SecurePassword123!',
          full_name: '<img src=x onerror=alert("xss")>',
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(userData);

        expect(response.status).toBe(201);
        expect(response.body.user.username).not.toContain('<script>');
        expect(response.body.user.full_name).not.toContain('<img>');
      });
    });
  });

  describe('POST /api/auth/login', () => {
    let testUser;

    beforeAll(async () => {
      // Create a test user for login tests
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'login@example.com',
          username: 'loginuser',
          password: 'LoginPassword123!',
        });
      testUser = registerResponse.body.user;
    });

    describe('Successful login', () => {
      test('should login with valid credentials', async () => {
        const loginData = {
          email: 'login@example.com',
          password: 'LoginPassword123!',
        };

        const response = await request(app)
          .post('/api/auth/login')
          .send(loginData);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('token');
        expect(response.body.user.email).toBe(loginData.email);
        expect(response.body.token).toBeValidUUID();
      });

      test('should login with username instead of email', async () => {
        const loginData = {
          email: 'loginuser', // Using username
          password: 'LoginPassword123!',
        };

        const response = await request(app)
          .post('/api/auth/login')
          .send(loginData);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
      });

      test('should include last login timestamp', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'login@example.com',
            password: 'LoginPassword123!',
          });

        expect(response.status).toBe(200);
        expect(response.body.user).toHaveProperty('last_login_at');
        expect(response.body.user.last_login_at).toBeValidDate();
      });
    });

    describe('Failed login', () => {
      test('should reject login with invalid email', async () => {
        const loginData = {
          email: 'invalid@example.com',
          password: 'SomePassword123!',
        };

        const response = await request(app)
          .post('/api/auth/login')
          .send(loginData);

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error', 'Unauthorized');
        expect(response.body.message).toContain('Invalid credentials');
      });

      test('should reject login with invalid password', async () => {
        const loginData = {
          email: 'login@example.com',
          password: 'WrongPassword123!',
        };

        const response = await request(app)
          .post('/api/auth/login')
          .send(loginData);

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error', 'Unauthorized');
      });

      test('should reject login with missing fields', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation Error');
      });

      test('should implement rate limiting on login attempts', async () => {
        const loginData = {
          email: 'login@example.com',
          password: 'WrongPassword123!',
        };

        // Make multiple failed login attempts
        const responses = [];
        for (let i = 0; i < 6; i++) {
          const response = await request(app)
            .post('/api/auth/login')
            .send(loginData);
          responses.push(response.status);
        }

        // Should eventually be rate limited
        expect(responses).toContain(429);
      });
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken;

    beforeAll(async () => {
      // Login to get initial token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'LoginPassword123!',
        });
      refreshToken = loginResponse.body.token;
    });

    test('should refresh valid token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.token).not.toBe(refreshToken); // Should be a new token
      expect(response.body.token).toBeValidUUID();
    });

    test('should reject refresh with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', 'Bearer invalid-token')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Unauthorized');
    });

    test('should reject refresh without token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    let authToken;

    beforeAll(async () => {
      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'LoginPassword123!',
        });
      authToken = loginResponse.body.token;
    });

    test('should logout with valid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Logged out successfully');
    });

    test('should reject logout with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid-token')
        .send({});

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    test('should send password reset email for valid email', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'login@example.com' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Password reset email sent');
    });

    test('should not reveal if email exists for invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Password reset email sent');
    });

    test('should validate email format', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'invalid-email' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('POST /api/auth/reset-password', () => {
    test('should reset password with valid token', async () => {
      // In a real implementation, you'd get this from the email service
      const resetToken = 'valid-reset-token';
      const newPassword = 'NewSecurePassword123!';

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          password: newPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Password reset successful');
    });

    test('should reject reset with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: 'invalid-token',
          password: 'NewPassword123!',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid or expired reset token');
    });

    test('should validate new password strength', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: 'valid-reset-token',
          password: '123', // Too weak
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('GET /api/auth/me', () => {
    let authToken;

    beforeAll(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'LoginPassword123!',
        });
      authToken = loginResponse.body.token;
    });

    test('should return user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('email');
      expect(response.body.user).toHaveProperty('username');
      expect(response.body.user).not.toHaveProperty('password');
    });

    test('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
    });

    test('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });

  describe('Security Tests', () => {
    test('should use secure headers', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options', 'DENY');
    });

    test('should prevent brute force attacks', async () => {
      const loginData = {
        email: 'login@example.com',
        password: 'WrongPassword123!',
      };

      // Make multiple failed attempts
      const responses = [];
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send(loginData);
        responses.push(response);
      }

      // Check for rate limiting
      const rateLimitedResponse = responses.find(r => r.status === 429);
      expect(rateLimitedResponse).toBeDefined();
      expect(rateLimitedResponse.body).toHaveProperty('error', 'Too Many Requests');
    });

    test('should handle concurrent requests safely', async () => {
      const loginData = {
        email: 'login@example.com',
        password: 'LoginPassword123!',
      };

      // Make multiple concurrent login requests
      const promises = Array(5).fill().map(() =>
        request(app).post('/api/auth/login').send(loginData)
      );

      const responses = await Promise.all(promises);

      // All should succeed or fail consistently
      const statusCodes = responses.map(r => r.status);
      expect(statusCodes.every(code => code === 200 || code === 401)).toBe(true);
    });
  });

  describe('Token Management', () => {
    test('should reject expired tokens', async () => {
      // This would require mocking time or using an expired token
      const expiredToken = 'expired-jwt-token';

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Token expired');
    });

    test('should include proper token expiration', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'LoginPassword123!',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('expires_in');
      expect(response.body.expires_in).toBeGreaterThan(0);
    });
  });
});