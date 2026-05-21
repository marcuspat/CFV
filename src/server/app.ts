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
import { createAuthRouter } from './routes/auth';
import { buildIdentityModule, type IdentityModule } from './composition/identity';
import { createConversationsRouter } from './routes/conversations';
import { buildConversationModule } from './composition/conversation-ingestion';
import { createAnalysisRouter } from './routes/analysis';
import { buildAnalysisModule } from './composition/cognitive-analysis';
import visualizationRoutes from './routes/visualization';
import exportRoutes from './routes/export';

// Import monitoring services
// Temporarily disabled for testing
// import {
//   initializeMonitoring,
//   shutdownMonitoring,
//   createMiddleware,
//   trackQuery,
//   trackAgentTask,
//   completeAgentTask
// } from './services/monitoring/index.js';

class App {
  public app: Application;
  public server: any;
  public wsServer?: WebSocketServer;
  private identity?: IdentityModule;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);

    // Initialize monitoring first
    this.initializeMonitoring();

    this.initializeMiddlewares();
    // Note: initializeRoutes is called in start() method as it's async
    this.initializeErrorHandling();
  }

  private initializeMonitoring(): void {
    // Temporarily disabled for testing
    logger.info('Performance monitoring disabled for testing');
    // try {
    //   initializeMonitoring({
    //     enabled: true,
    //     interval: 5000,
    //     thresholds: {
    //       responseTime: { warning: 500, critical: 2000 },
    //       cpu: { warning: 70, critical: 90 },
    //       memory: { warning: 75, critical: 90 },
    //       diskIO: { readWarning: 50, readCritical: 100, writeWarning: 30, writeCritical: 60 },
    //       network: { latencyWarning: 100, latencyCritical: 500, throughputWarning: 100, throughputCritical: 50 },
    //       database: { queryTimeWarning: 200, queryTimeCritical: 1000, connectionWarning: 80, connectionCritical: 95 },
    //       agentCoordination: { overheadWarning: 50, overheadCritical: 200, throughputWarning: 100, throughputCritical: 50 }
    //     },
    //     retention: {
    //       metrics: 30,
    //       logs: 7,
    //       alerts: 30
    //     }
    //   });
    //   logger.info('Performance monitoring initialized');
    // } catch (error) {
    //   logger.error('Failed to initialize monitoring', { error });
    // }
  }

  private initializeMiddlewares(): void {
    const serverConfig = getServerConfig();

    // Security middleware
    if (serverConfig.helmet) {
      this.app.use(helmet(serverConfig.helmet as any));
    }

    // CORS configuration
    this.app.use(cors(serverConfig.cors));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    this.app.use(rateLimit(serverConfig.rateLimit));

    // Monitoring middleware for API performance tracking (temporarily disabled)
    // this.app.use('/api', createMiddleware());

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration: `${duration}ms`,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
        });
      });

      next();
    });

    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);
  }

  private async initializeRoutes(): Promise<void> {
    // Health check (no auth required)
    this.app.use('/health', healthRoutes);

    // Monitoring routes (no auth required for basic monitoring)
    // Temporarily disabled for testing
    // try {
    //   const monitoringRoutes = (await import('./routes/monitoring')).default;
    //   this.app.use('/api/monitoring', monitoringRoutes);
    // } catch (error) {
    //   logger.error('Failed to load monitoring routes', { error });
    // }

    // Authentication routes (no auth required) — backed by the Identity
    // context against PostgreSQL. Degrades gracefully if the DB is absent
    // so the rest of the app can still boot in local/dev mode.
    try {
      this.identity = buildIdentityModule();
      await this.identity.ensureDefaultTenant();
      this.app.use('/api/auth', createAuthRouter(this.identity));
      logger.info('Identity module initialized (PostgreSQL-backed auth)');
    } catch (error) {
      logger.warn('Identity module unavailable; auth routes disabled', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Protected routes (auth required)
    if (this.identity) {
      try {
        const conversationModule = buildConversationModule();
        this.app.use('/api/conversations', authMiddleware, createConversationsRouter(conversationModule));
        this.app.use('/api/analysis', authMiddleware, createAnalysisRouter(buildAnalysisModule()));
        logger.info('Conversation + analysis modules initialized (PostgreSQL-backed)');
      } catch (error) {
        logger.warn('Conversation module unavailable', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.app.use('/api/visualizations', authMiddleware, visualizationRoutes);
    this.app.use('/api/exports', authMiddleware, exportRoutes);

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'Cognitive Fabric Visualizer API',
        version: '1.0.0',
        status: 'running',
        environment: config.NODE_ENV,
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/health',
          // monitoring: '/api/monitoring', // Temporarily disabled
          auth: '/api/auth',
          conversations: '/api/conversations',
          analysis: '/api/analysis',
          visualizations: '/api/visualizations',
          exports: '/api/exports',
        },
      });
    });

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async initializeWebSocket(): Promise<void> {
    try {
      const wsConfig = getWebSocketConfig();
      this.wsServer = new WebSocketServer({
        server: this.server,
        ...wsConfig,
      });

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
      // Initialize database connections with graceful failure handling
      const { getDatabaseConfig } = await import('./config');
      try {
        await database.initialize(getDatabaseConfig());
        logger.info('Database connections initialized successfully');

        // Run database migrations
        await database.runMigrations();
        logger.info('Database migrations completed');
      } catch (dbError) {
        logger.warn('Database connections failed, continuing without databases', {
          error: dbError instanceof Error ? dbError.message : String(dbError),
          code: (dbError as any)?.code || 'UNKNOWN'
        });
        // Continue without databases for development
      }

      // Initialize routes (async)
      await this.initializeRoutes();

      // Initialize WebSocket
      await this.initializeWebSocket();

      // Start server
      this.server.listen(config.PORT, () => {
        logger.info('Server started successfully', {
          port: config.PORT,
          environment: config.NODE_ENV,
          processId: process.pid,
          databaseStatus: 'Database connections: ' + (database.isConnected ? 'Connected' : 'Disconnected (graceful fallback)')
        });
      });

      // Graceful shutdown handling
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start server', { error });
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      // Stop accepting new connections
      this.server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Close WebSocket connections
          if (this.wsServer) {
            this.wsServer.close();
            logger.info('WebSocket server closed');
          }

          // Shutdown monitoring system (temporarily disabled)
          // await shutdownMonitoring();
          logger.info('Performance monitoring shutdown disabled');

          // Close database connections
          await database.close();
          logger.info('Database connections closed');

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown', { error });
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Graceful shutdown timeout, forcing exit');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason, promise });
      process.exit(1);
    });
  }

  public async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          resolve();
        });
      });
    }
  }
}

export default App;