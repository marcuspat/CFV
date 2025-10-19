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

class App {
  public app: Application;
  public server: any;
  public wsServer?: WebSocketServer;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);

    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares(): void {
    const serverConfig = getServerConfig();

    // Security middleware
    if (serverConfig.helmet) {
      this.app.use(helmet(serverConfig.helmet));
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

  private initializeRoutes(): void {
    // Health check (no auth required)
    this.app.use('/health', healthRoutes);

    // Authentication routes (no auth required)
    this.app.use('/api/auth', authRoutes);

    // Protected routes (auth required)
    this.app.use('/api/conversations', authMiddleware, conversationRoutes);
    this.app.use('/api/analysis', authMiddleware, analysisRoutes);
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
      // Initialize database connections
      await database.initialize(database.getDatabaseConfig());

      // Run database migrations
      await database.runMigrations();

      // Initialize WebSocket
      await this.initializeWebSocket();

      // Start server
      this.server.listen(config.PORT, () => {
        logger.info('Server started successfully', {
          port: config.PORT,
          environment: config.NODE_ENV,
          processId: process.pid,
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