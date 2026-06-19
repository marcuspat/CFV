/**
 * Unit tests for the LLM resilience helpers (Task #38): retry classification
 * and bounded exponential-backoff retry. The real provider calls aren't
 * exercised in CI (no API key), so these lock in the retry behaviour directly.
 *
 * Run with:  npx jest --config jest.config.integration.cjs
 */

// cognitiveAnalysis -> logger -> config requires JWT_SECRET at import.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-characters-long-xyz';

import { isRetryableError, withRetry } from '../../src/server/services/cognitiveAnalysis';

function httpError(status: number): Error & { status: number } {
  const e = new Error(`http ${status}`) as Error & { status: number };
  e.status = status;
  return e;
}

describe('LLM resilience — isRetryableError', () => {
  it('retries on 429 and 5xx (incl. nested response.status)', () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ status: 500 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ response: { status: 502 } })).toBe(true);
  });

  it('does not retry on 4xx (except 429) or unknown errors', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 401 })).toBe(false);
    expect(isRetryableError(new Error('network blip'))).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe('LLM resilience — withRetry', () => {
  it('retries retryable failures then succeeds (<= 3 attempts)', async () => {
    let calls = 0;
    const result = await withRetry('test', async () => {
      calls += 1;
      if (calls < 3) throw httpError(429);
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('does not retry a non-retryable error', async () => {
    let calls = 0;
    await expect(
      withRetry('test', async () => {
        calls += 1;
        throw httpError(400);
      })
    ).rejects.toThrow('http 400');
    expect(calls).toBe(1);
  });

  it('gives up after the max attempts on persistent retryable errors', async () => {
    let calls = 0;
    await expect(
      withRetry('test', async () => {
        calls += 1;
        throw httpError(429);
      })
    ).rejects.toThrow('http 429');
    expect(calls).toBe(3);
  });
});
