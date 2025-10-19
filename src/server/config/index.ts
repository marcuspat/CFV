/**
 * Configuration management for Cognitive Fabric Visualizer
 */

import dotenv from 'dotenv';
import { z } from 'zod';
import { DatabaseConfiguration } from '../../types';

// Load environment variables
dotenv.config();

// Configuration Schema
const ConfigSchema = z.object({
  // Server Configuration
  PORT: z.preprocess((val) => Number(val), z.number().default(3001)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database Configuration
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.preprocess((val) => Number(val), z.number().default(5432)),
  DB_NAME: z.string().default('cognitive_fabric'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('password'),

  // Neo4j Configuration
  NEO4J_URI: z.string().default('bolt://localhost:7687'),
  NEO4J_USER: z.string().default('neo4j'),
  NEO4J_PASSWORD: z.string().default('password'),
  NEO4J_DATABASE: z.string().default('neo4j'),

  // Redis Configuration
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_KEY_PREFIX: z.string().default('cfv:'),
  REDIS_TTL: z.preprocess((val) => Number(val), z.number().default(3600)),

  // JWT Configuration
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // API Keys
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  RASA_WEBHOOK_URL: z.string().optional(),

  // File Upload Configuration
  MAX_FILE_SIZE: z.preprocess((val) => Number(val), z.number().default(52428800)), // 50MB
  UPLOAD_DIR: z.string().default('uploads'),

  // Performance Configuration
  WEBSOCKET_HEARTBEAT: z.preprocess((val) => Number(val), z.number().default(30000)),
  MAX_CONCURRENT_CONNECTIONS: z.preprocess((val) => Number(val), z.number().default(100)),
  MAX_CONCURRENT_ANALYSES: z.preprocess((val) => Number(val), z.number().default(10)),

  // Cognitive Processing Configuration
  COGNITIVE_PROCESSING_TIMEOUT: z.preprocess((val) => Number(val), z.number().default(300000)), // 5 minutes
  ML_SERVICE_URL: z.string().optional(),

  // Verification Threshold
  VERIFICATION_THRESHOLD: z.preprocess((val) => Number(val), z.number().default(0.95)),

  // Security Configuration
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.preprocess((val) => Number(val), z.number().default(900000)), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.preprocess((val) => Number(val), z.number().default(100)),

  // Logging Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('simple'),
});

export type Config = z.infer<typeof ConfigSchema>;

// Validate and export configuration
const config = ConfigSchema.parse(process.env);

export { config };

// Database Configuration Helper
export function getDatabaseConfig(): DatabaseConfiguration {
  return {
    postgres: {
      host: config.DB_HOST,
      port: config.DB_PORT,
      database: config.DB_NAME,
      username: config.DB_USER,
      password: config.DB_PASSWORD,
      ssl: config.NODE_ENV === 'production',
      maxConnections: 20,
    },
    neo4j: {
      uri: config.NEO4J_URI,
      username: config.NEO4J_USER,
      password: config.NEO4J_PASSWORD,
      database: config.NEO4J_DATABASE,
      maxConnectionPoolSize: 50,
    },
    redis: {
      url: config.REDIS_URL,
      keyPrefix: config.REDIS_KEY_PREFIX,
    },
  };
}

// Configuration validation helper
export function validateConfig(): void {
  const requiredEnvVars = [
    'JWT_SECRET',
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // Validate optional but recommended variables
  const recommendedEnvVars = [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'RASA_WEBHOOK_URL',
  ];

  const missingRecommended = recommendedEnvVars.filter(varName => !process.env[varName]);

  if (missingRecommended.length > 0) {
    console.warn(`Missing recommended environment variables: ${missingRecommended.join(', ')}`);
    console.warn('Some features may not work correctly without these variables.');
  }
}

// Development configuration helpers
export function isDevelopment(): boolean {
  return config.NODE_ENV === 'development';
}

export function isProduction(): boolean {
  return config.NODE_ENV === 'production';
}

export function isTest(): boolean {
  return config.NODE_ENV === 'test';
}

// Configuration for different environments
export function getServerConfig() {
  return {
    port: config.PORT,
    env: config.NODE_ENV,
    cors: {
      origin: isDevelopment() ? ['http://localhost:3000', 'http://localhost:5173'] : config.CORS_ORIGIN.split(','),
      credentials: true,
    },
    rateLimit: {
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX_REQUESTS,
      message: {
        error: 'Too many requests from this IP, please try again later.',
      },
    },
    helmet: isProduction() ? {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
    } : false,
  };
}

export function getWebSocketConfig() {
  return {
    heartbeat: config.WEBSOCKET_HEARTBEAT,
    maxConnections: config.MAX_CONCURRENT_CONNECTIONS,
    perMessageDeflate: {
      zlibDeflateOptions: {
        level: 3,
      },
    },
  };
}

export function getCognitiveProcessingConfig() {
  return {
    timeout: config.COGNITIVE_PROCESSING_TIMEOUT,
    maxConcurrentAnalyses: config.MAX_CONCURRENT_ANALYSES,
    verificationThreshold: config.VERIFICATION_THRESHOLD,
    mlServiceUrl: config.ML_SERVICE_URL,
    apiKeys: {
      openai: config.OPENAI_API_KEY,
      anthropic: config.ANTHROPIC_API_KEY,
    },
    rasa: {
      webhookUrl: config.RASA_WEBHOOK_URL,
    },
  };
}

export function getFileUploadConfig() {
  return {
    maxFileSize: config.MAX_FILE_SIZE,
    uploadDir: config.UPLOAD_DIR,
    allowedTypes: [
      'text/plain',
      'application/json',
      'text/csv',
      'audio/mpeg',
      'audio/wav',
      'audio/mp3',
      'video/mp4',
      'video/webm',
    ],
  };
}

export default config;