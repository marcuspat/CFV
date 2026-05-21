/**
 * Jest setup: provide deterministic environment defaults so modules that
 * validate configuration at import time (src/server/config) can load under
 * test without a real .env file. Values are non-secret test placeholders.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-characters-long-000';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
