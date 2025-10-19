import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment validation schema
const environmentSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.preprocess((val) => Number(val), z.number().default(3001)),

  // Database Configuration
  DB_HOST: z.string().min(1, 'Database host is required'),
  DB_PORT: z.preprocess((val) => Number(val), z.number().default(5432)),
  DB_NAME: z.string().min(1, 'Database name is required'),
  DB_USER: z.string().min(1, 'Database user is required'),
  DB_PASSWORD: z.string().min(1, 'Database password is required'),
  DB_SSL: z.enum(['true', 'false']).transform(val => val === 'true').default(false),

  // Neo4j Configuration
  NEO4J_URI: z.string().url('Invalid Neo4j URI'),
  NEO4J_USER: z.string().min(1, 'Neo4j user is required'),
  NEO4J_PASSWORD: z.string().min(1, 'Neo4j password is required'),

  // Redis Configuration
  REDIS_URL: z.string().url('Invalid Redis URL'),
  REDIS_PASSWORD: z.string().optional(),

  // JWT Configuration
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // API Keys
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  RASA_WEBHOOK_URL: z.string().url().optional(),

  // File Upload Configuration
  MAX_FILE_SIZE: z.preprocess((val) => {
    if (typeof val === 'number') return val;
    const match = String(val).match(/^(\d+)(MB|GB|KB)?$/i);
    if (!match) return 50 * 1024 * 1024; // Default 50MB
    const [, size, unit = 'MB'] = match;
    const multiplier = unit.toUpperCase() === 'GB' ? 1024 * 1024 * 1024 :
                      unit.toUpperCase() === 'KB' ? 1024 : 1024 * 1024;
    return parseInt(size) * multiplier;
  }, z.number().default(50 * 1024 * 1024)),

  UPLOAD_DIR: z.string().default('uploads'),

  // Performance Configuration
  WEBSOCKET_HEARTBEAT: z.preprocess((val) => Number(val), z.number().default(30000)),
  MAX_CONCURRENT_CONNECTIONS: z.preprocess((val) => Number(val), z.number().default(100)),
  COGNITIVE_PROCESSING_TIMEOUT: z.preprocess((val) => Number(val), z.number().default(30000)),

  // ML Service Configuration
  ML_SERVICE_URL: z.string().url().optional(),
  ML_SERVICE_TIMEOUT: z.preprocess((val) => Number(val), z.number().default(60000)),

  // Verification Configuration
  VERIFICATION_THRESHOLD: z.preprocess((val) => {
    const num = Number(val);
    if (num >= 0 && num <= 1) return num;
    throw new Error('Verification threshold must be between 0 and 1');
  }, z.number().default(0.95)),

  // Security Configuration
  CORS_ORIGIN: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.preprocess((val) => Number(val), z.number().default(900000)), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.preprocess((val) => Number(val), z.number().default(100)),

  // Logging Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE: z.string().optional(),

  // Analytics Configuration
  ENABLE_ANALYTICS: z.enum(['true', 'false']).transform(val => val === 'true').default(false),
  ANALYTICS_API_KEY: z.string().optional(),

  // Development Configuration
  ENABLE_MOCK_SERVICES: z.enum(['true', 'false']).transform(val => val === 'true').default(false),
  ENABLE_DEBUG_ROUTES: z.enum(['true', 'false']).transform(val => val === 'true').default(false)
});

// Type for validated environment
type Environment = z.infer<typeof environmentSchema>;

// Validate and export environment
function validateEnvironment(): Environment {
  try {
    const env = environmentSchema.parse(process.env);
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.issues.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });

      // In production, exit on validation errors
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
    } else {
      console.error('❌ Unexpected error during environment validation:', error);
    }

    // For development, return a partial environment with defaults
    console.warn('⚠️  Using partial environment configuration for development');
    return {
      NODE_ENV: 'development',
      PORT: 3001,
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      DB_NAME: 'cognitive_fabric_dev',
      DB_USER: 'postgres',
      DB_PASSWORD: 'password',
      DB_SSL: false,
      NEO4J_URI: 'bolt://localhost:7687',
      NEO4J_USER: 'neo4j',
      NEO4J_PASSWORD: 'password',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'development-secret-not-for-production-use-at-least-32-chars',
      JWT_EXPIRES_IN: '7d',
      MAX_FILE_SIZE: 50 * 1024 * 1024,
      UPLOAD_DIR: 'uploads',
      WEBSOCKET_HEARTBEAT: 30000,
      MAX_CONCURRENT_CONNECTIONS: 100,
      COGNITIVE_PROCESSING_TIMEOUT: 30000,
      VERIFICATION_THRESHOLD: 0.95,
      CORS_ORIGIN: 'http://localhost:3000',
      RATE_LIMIT_WINDOW_MS: 900000,
      RATE_LIMIT_MAX_REQUESTS: 100,
      LOG_LEVEL: 'info',
      ENABLE_ANALYTICS: false,
      ENABLE_MOCK_SERVICES: true,
      ENABLE_DEBUG_ROUTES: true
    } as Environment;
  }
}

// Export validated environment
export const environment = validateEnvironment();

// Database configuration helper
export const databaseConfig = {
  postgres: {
    host: environment.DB_HOST,
    port: environment.DB_PORT,
    database: environment.DB_NAME,
    username: environment.DB_USER,
    password: environment.DB_PASSWORD,
    ssl: environment.DB_SSL,
    connectionLimit: 20,
    acquireTimeoutMillis: 60000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 600000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200
  },
  neo4j: {
    uri: environment.NEO4J_URI,
    user: environment.NEO4J_USER,
    password: environment.NEO4J_PASSWORD,
    maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 60000
  },
  redis: {
    url: environment.REDIS_URL,
    password: environment.REDIS_PASSWORD,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxLoadingTimeout: 5000,
    lazyConnect: true
  }
};

// JWT configuration helper
export const jwtConfig = {
  secret: environment.JWT_SECRET,
  expiresIn: environment.JWT_EXPIRES_IN,
  algorithm: 'HS256' as const,
  issuer: 'cognitive-fabric',
  audience: 'cognitive-fabric-users'
};

// Performance configuration helper
export const performanceConfig = {
  websocket: {
    heartbeatInterval: environment.WEBSOCKET_HEARTBEAT,
    maxConnections: environment.MAX_CONCURRENT_CONNECTIONS
  },
  cognitive: {
    processingTimeout: environment.COGNITIVE_PROCESSING_TIMEOUT,
    verificationThreshold: environment.VERIFICATION_THRESHOLD
  },
  mlService: {
    url: environment.ML_SERVICE_URL,
    timeout: environment.ML_SERVICE_TIMEOUT
  }
};

// Security configuration helper
export const securityConfig = {
  cors: {
    origin: environment.CORS_ORIGIN || (environment.NODE_ENV === 'production' ? false : ['http://localhost:3000']),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  },
  rateLimit: {
    windowMs: environment.RATE_LIMIT_WINDOW_MS,
    max: environment.RATE_LIMIT_MAX_REQUESTS,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
  },
  fileUpload: {
    maxSize: environment.MAX_FILE_SIZE,
    uploadDir: environment.UPLOAD_DIR,
    allowedMimeTypes: [
      'text/plain',
      'text/markdown',
      'application/json',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'video/mp4',
      'video/webm',
      'image/jpeg',
      'image/png',
      'image/gif'
    ]
  }
};

// Export environment type for use in other modules
export type { Environment };

// Export default configuration object
export default {
  environment,
  database: databaseConfig,
  jwt: jwtConfig,
  performance: performanceConfig,
  security: securityConfig
};