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

  logger.info(`Shutdown signal received [${signal}] — draining in-flight requests`);

  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s — forcing exit');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  try {
    if (app) {
      await app.stop();
    }
    clearTimeout(forceExitTimer);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error(`Error during shutdown: ${String(err)}`);
    process.exit(1);
  }
}

async function startServer(): Promise<void> {
  try {
    validateConfig();

    logger.info(`Starting Cognitive Fabric Visualizer server — env=${config.NODE_ENV} port=${config.PORT}`);

    app = new App();
    await app.start();

    logger.info(`Server ready and accepting connections on port ${config.PORT}`);

    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.on('SIGINT',  () => { void shutdown('SIGINT'); });

    process.on('uncaughtException', (err) => {
      logger.error(`Uncaught exception — initiating shutdown: ${String(err)}`);
      void shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error(`Unhandled rejection — initiating shutdown: ${String(reason)}`);
      void shutdown('unhandledRejection');
    });
  } catch (err) {
    logger.error(`Failed to start server: ${String(err)}`);
    process.exit(1);
  }
}

startServer();
