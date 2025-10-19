/**
 * Main entry point for Cognitive Fabric Visualizer server
 */

import App from './app';
import { validateConfig, config } from './config';
import { logger } from './utils/logger';

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
    const app = new App();
    await app.start();

    logger.info('Server startup complete');
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});

// Start the server
startServer();