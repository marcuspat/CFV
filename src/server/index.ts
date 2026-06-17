/**
 * Main entry point for Cognitive Fabric Visualizer server
 */

// Validate required env vars before anything else parses the strict config.
import './config/validateStartupEnv';
import App from './app';
import { validateConfig, config } from './config';
import { logger } from './utils/logger';

let app: App | null = null;
let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Shutdown signal received — draining in-flight requests');

  // Force exit if graceful drain takes too long (e.g. keep-alive connections)
  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s — forcing exit');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  try {
    if (app) {
      // app.stop() closes the HTTP server (drains in-flight requests),
      // closes the PostgreSQL pool, and any other managed connections.
      await app.stop();
    }
    clearTimeout(forceExitTimer);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

async function startServer(): Promise<void> {
  try {
    // Validate configuration
    validateConfig();

    logger.info('Starting Cognitive Fabric Visualizer server', {
      version: '1.0.0',
      environment: config.NODE_ENV,
      port: config.PORT,
    });

    // Create and start application
    app = new App();
    await app.start();

    logger.info({ port: config.PORT }, 'Server ready and accepting connections');

    // Register signal handlers AFTER server is up so app reference is valid
    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.on('SIGINT',  () => { void shutdown('SIGINT'); });

    process.on('uncaughtException', (err) => {
      logger.error({ err }, 'Uncaught exception — initiating shutdown');
      void shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error({ reason }, 'Unhandled rejection — initiating shutdown');
      void shutdown('unhandledRejection');
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
