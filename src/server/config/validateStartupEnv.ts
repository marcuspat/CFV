/**
 * Fail-fast startup environment validation.
 *
 * Runs (on import) before the strict config schema is parsed, so a missing
 * JWT_SECRET — and the other required vars — produce a clear message instead of
 * a raw ZodError. In production a missing/invalid required variable aborts the
 * process with exit(1); in non-production it logs a warning and continues so
 * local/CI runs work with the in-memory/degraded fallbacks.
 *
 * Uses the pino logger (synchronous destination), so the fatal message flushes
 * before process.exit(1).
 */
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

export function validateStartupEnv(): void {
  const errors: string[] = [];

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    errors.push('OPENAI_API_KEY or ANTHROPIC_API_KEY (at least one AI provider key) is required');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET is required and must be at least 32 characters');
  }
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  }

  if (errors.length === 0) return;

  if (process.env.NODE_ENV === 'production') {
    logger.error('FATAL: invalid environment configuration', { errors });
    process.exit(1);
  }

  logger.warn('Invalid environment configuration — continuing with degraded/fallback behavior', {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    errors,
  });
}

// Execute on import so it runs before ./config parses the strict schema.
validateStartupEnv();
