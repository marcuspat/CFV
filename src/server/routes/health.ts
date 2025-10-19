/**
 * Health check routes for Cognitive Fabric Visualizer
 */

import { Router, Request, Response } from 'express';
import database from '../config/database';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { config } from '../config';

const router = Router();

// Basic health check
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: config.NODE_ENV,
    responseTime: Date.now() - startTime,
  };

  res.json(health);
}));

// Detailed health check with service status
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();

  // Check database health
  const dbHealth = await database.healthCheck();

  // Check memory usage
  const memUsage = process.memoryUsage();
  const memoryUsage = {
    rss: Math.round(memUsage.rss / 1024 / 1024), // MB
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
    external: Math.round(memUsage.external / 1024 / 1024), // MB
  };

  // Check CPU usage
  const cpuUsage = process.cpuUsage();

  // Determine overall health status
  const allHealthy = dbHealth.postgres && dbHealth.neo4j && dbHealth.redis;
  const overallStatus = allHealthy ? 'healthy' : 'degraded';

  const health = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: config.NODE_ENV,
    responseTime: Date.now() - startTime,
    services: {
      postgres: {
        status: dbHealth.postgres ? 'healthy' : 'unhealthy',
        responseTime: 0, // Would need to measure actual query time
      },
      neo4j: {
        status: dbHealth.neo4j ? 'healthy' : 'unhealthy',
        responseTime: 0,
      },
      redis: {
        status: dbHealth.redis ? 'healthy' : 'unhealthy',
        responseTime: 0,
      },
    },
    metrics: {
      uptime: Math.round(process.uptime()),
      memoryUsage,
      cpuUsage: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      activeConnections: 0, // Would be tracked by WebSocket server
      processingQueueLength: 0, // Would be tracked by processing queue
    },
  };

  const statusCode = overallStatus === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
}));

// Readiness probe (for Kubernetes/container orchestration)
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  try {
    // Check if database connections are ready
    const dbHealth = await database.healthCheck();
    const isReady = dbHealth.postgres && dbHealth.neo4j && dbHealth.redis;

    if (isReady) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        services: dbHealth,
      });
    }
  } catch (error) {
    logger.error('Readiness check failed', { error });
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}));

// Liveness probe (for Kubernetes/container orchestration)
router.get('/live', asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}));

export default router;