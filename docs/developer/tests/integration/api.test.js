/**
 * Basic API integration tests
 */

import request from 'supertest';
import express from 'express';

// Mock Express app for testing
const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/version', (req, res) => {
  res.json({ version: '1.0.0', name: 'Cognitive Fabric Visualizer' });
});

describe('API Integration Tests', () => {
  test('GET /api/health should return status ok', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
  });

  test('GET /api/version should return version info', async () => {
    const response = await request(app)
      .get('/api/version')
      .expect(200);

    expect(response.body).toHaveProperty('version', '1.0.0');
    expect(response.body).toHaveProperty('name', 'Cognitive Fabric Visualizer');
  });

  test('should handle 404 for unknown routes', async () => {
    await request(app)
      .get('/api/unknown')
      .expect(404);
  });
});