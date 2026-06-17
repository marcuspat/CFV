/**
 * Fail-fast startup environment validation.
 *
 * Runs (on import) before the strict config schema is parsed, so a missing
 * JWT_SECRET — and the other required vars — produce a clear message instead of
 * a raw ZodError. In production a missing/invalid required variable aborts the
 * process with exit(1); in non-production it logs a warning and continues so
 * local/CI runs work with the in-memory/degraded fallbacks.
 */
import dotenv from 'dotenv';

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

  const message = `Invalid environment configuration:\n  - ${errors.join('\n  - ')}`;

  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.error(`FATAL: ${message}`);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.warn(
    `WARNING (NODE_ENV=${process.env.NODE_ENV ?? 'development'}): ${message}\n` +
      'Continuing with degraded/fallback behavior — do not run production this way.'
  );
}

// Execute on import so it runs before ./config parses the strict schema.
validateStartupEnv();
