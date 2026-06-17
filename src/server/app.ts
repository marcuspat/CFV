/**
 * Express application setup for Cognitive Fabric Visualizer
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';

import { config, getServerConfig, getWebSocketConfig } from './config';
import database from './config/database';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { setupWebSocket } from './services/websocket';

// Route imports
import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import conversationRoutes from './routes/conversations';
import analysisRoutes from './routes/analysis';
import visualizationRoutes from './routes/visualization';
import exportRoutes from './routes/export';

// Monitoring services
import {
  initializeMonitoring,
  shutdownMonitoring,
  createMiddleware,
  trackQuery,
  trackAgentTask,
  completeAgentTask,
} from './services/monitoring/index.js';
class App {
  public app: Application;
  public server: any;
  public wsServer?: WebSocketServer;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);

    this.initializeMonitoring();
    this.initializeMiddlewares();
    // NOTE: error handling is registered at the END of initializeRoutes(), not
    // here — Express only invokes an error-handling middleware for errors thrown
    // by middleware/routes registered BEFORE it. Routes are mounted later (in
    // start() -> initializeRoutes()), so registering errorHandler here would
    // leave all route errors to fall through to Express's default handler.
  }

  private initializeMonitoring(): void {
    try {
      initializeMonitoring({
        enabled: process.env.MONITORING_ENABLED !== 'false',
        interval: parseInt(process.env.MONITORING_INTERVAL ?? '5000', 10),
        thresholds: {
          responseTime: { warning: 500, critical: 2000 },
          cpu: { warning: 70, critical: 90 },
          memory: { warning: 75, critical: 90 },
          diskIO: { readWarning: 50, readCritical: 100, writeWarning: 30, writeCritical: 60 },
          network: { latencyWarning: 100, latencyCritical: 500, throughputWarning: 100, throughputCritical: 50 },
          database: { queryTimeWarning: 200, queryTimeCritical: 1000, connectionWarning: 80, connectionCritical: 95 },
          agentCoordination: { overheadWarning: 50, overheadCritical: 200, throughputWarning: 100, throughputCritical: 50 },
        },
        retention: {
          metrics: 30,
          logs: 7,
          alerts: 30,
        },
      });
      logger.info('Performance monitoring initialized');
    } catch (error) {
      logger.warn('Failed to initialize monitoring — continuing without it', { error });
    }
  }

  private initializeMiddlewares(): void {
    const serverConfig = getServerConfig();

    if (serverConfig.helmet) {
      this.app.use(helmet(serverConfig.helmet as any));
    }

    this.app.use(cors(serverConfig.cors));
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(rateLimit(serverConfig.rateLimit));

    // Monitoring middleware for API performance tracking
    this.app.use('/api', createMiddleware());

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      res.on('finish', () => {
        logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration: `${Date.now() - start}ms`,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
        });
      });
      next();
    });

    this.app.set('trust proxy', 1);
  }

  private async initializeRoutes(): Promise<void> {
    this.app.use('/health', healthRoutes);

    // Monitoring routes
    try {
      const monitoringRoutes = (await import('./routes/monitoring')).default;
      this.app.use('/api/monitoring', monitoringRoutes);
    } catch (error) {
      logger.warn('Failed to load monitoring routes', { error });
    }

    // Stricter rate limit for the expensive analysis pipeline: 10 req / 15 min.
    const analysisLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: 'Too many analysis requests from this IP, please try again later.',
      },
    });

    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/conversations', authMiddleware, conversationRoutes);
    this.app.use('/api/analysis', authMiddleware, analysisLimiter, analysisRoutes);
    this.app.use('/api/visualizations', authMiddleware, visualizationRoutes);
    this.app.use('/api/exports', authMiddleware, exportRoutes);

    this.app.get('/', (_req: Request, res: Response) => {
      res.json({
        name: 'Cognitive Fabric Visualizer API',
        version: '1.0.0',
        status: 'running',
        environment: config.NODE_ENV,
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/health',
          monitoring: '/api/monitoring',
          auth: '/api/auth',
          conversations: '/api/conversations',
          analysis: '/api/analysis',
          visualizations: '/api/visualizations',
          exports: '/api/exports',
        },
      });
    });

    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
      });
    });

    // Error handling must come last so it can catch errors from the routes above.
    this.initializeErrorHandling();
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async initializeWebSocket(): Promise<void> {
    try {
      const wsConfig = getWebSocketConfig();
      this.wsServer = new WebSocketServer({ server: this.server, ...wsConfig });
      setupWebSocket(this.wsServer);
      logger.info('WebSocket server initialized', {
        port: config.PORT,
        maxConnections: wsConfig.maxConnections,
        heartbeat: wsConfig.heartbeat,
      });
    } catch (error) {
      logger.error('Failed to initialize WebSocket server', { error });
      throw error;
    }
  }

  public async start(): Promise<void> {
    try {
      const { getDatabaseConfig } = await import('./config');
      try {
        await database.initialize(getDatabaseConfig());
        logger.info('Database connections initialized');
        await database.runMigrations();
        logger.info('Database migrations completed');
      } catch (dbError) {
        logger.warn('Database unavailable, continuing without databases', {
          error: dbError instanceof Error ? dbError.message : String(dbError),
          code: (dbError as any)?.code ?? 'UNKNOWN',
        });
      }

      await this.initializeRoutes();
      await this.initializeWebSocket();

      this.server.listen(config.PORT, () => {
        logger.info('Server started', {
          port: config.PORT,
          environment: config.NODE_ENV,
          pid: process.pid,
          dbStatus: database.isConnected ? 'connected' : 'disconnected (graceful fallback)',
        });
      });

      this.setupGracefulShutdown();
    } catch (error) {
      logger.error('Failed to start server', { error });
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — starting graceful shutdown`);

      this.server.close(async () => {
        logger.info('HTTP server closed');
        try {
          if (this.wsServer) {
            this.wsServer.close();
            logger.info('WebSocket server closed');
          }

          await shutdownMonitoring();
          logger.info('Monitoring shutdown');

          await database.close();
          logger.info('Database connections closed');

          logger.info('Graceful shutdown complete');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error });
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error('Graceful shutdown timeout — forcing exit');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', error => {
      logger.error('Uncaught Exception', { error });
      process.exit(1);
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason, promise });
      process.exit(1);
    });
  }

  public async stop(): Promise<void> {
    if (this.server) {
      return new Promise(resolve => this.server.close(() => resolve()));
    }
  }
}

export default App;
