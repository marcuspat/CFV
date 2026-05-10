/**
 * Micro-benchmark for Identity domain hot paths.
 *
 * Establishes a baseline that future PRs can regress-check against.
 * Runs as a Jest test so it lives in the same suite; assertions are
 * generous to avoid CI flakes — the *number* is the deliverable.
 */

import { AuthorisationPolicy } from '../../../../src/server/contexts/identity/domain/authorisation-policy';
import {
  Email,
  PasswordHash,
  TenantId,
  UserId,
  defaultScopesFor,
} from '../../../../src/server/contexts/identity/domain/value-objects';
import { User } from '../../../../src/server/contexts/identity/domain/user';

const TENANT = TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6T0');
const USER = UserId.of('01HJK3R6X7Y8ZAB2C3D4E5F6Y0');
const NOW = new Date('2026-01-01T00:00:00Z');

function benchmark(label: string, iterations: number, fn: () => void): number {
  // Warm-up
  for (let i = 0; i < Math.min(iterations, 1_000); i++) fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  const end = process.hrtime.bigint();
  const totalNs = Number(end - start);
  const perOp = totalNs / iterations;
  // eslint-disable-next-line no-console
  console.log(
    `[bench] ${label}: ${iterations.toLocaleString()} ops in ` +
      `${(totalNs / 1e6).toFixed(2)} ms — ${perOp.toFixed(0)} ns/op (` +
      `${Math.round(1e9 / perOp).toLocaleString()} ops/sec)`,
  );
  return perOp;
}

describe('identity domain microbenchmarks', () => {
  it('User.register throughput is sane', () => {
    const passwordHash = PasswordHash.fromHashed('hashed-password-of-good-length');
    const email = Email.of('alice@example.com');
    const perOp = benchmark('User.register', 10_000, () => {
      const u = User.register({
        id: USER,
        tenantId: TENANT,
        email,
        passwordHash,
        roles: ['analyst'],
        now: NOW,
      });
      u.pullEvents();
    });
    // Generous ceiling: a clean register must beat 200 µs per op.
    expect(perOp).toBeLessThan(200_000);
  });

  it('AuthorisationPolicy.decide throughput is sane', () => {
    const actor = {
      userId: USER,
      tenantId: TENANT,
      roles: ['analyst' as const],
      scopes: defaultScopesFor(['analyst']),
    };
    const resource = { tenantId: TENANT, kind: 'analysis' };
    const perOp = benchmark('AuthorisationPolicy.decide', 100_000, () => {
      AuthorisationPolicy.decide(actor, 'analysis:read', resource);
    });
    // A pure-function policy decision should comfortably do >1M ops/sec
    // on any modern machine; budget 5 µs/op as the loose ceiling.
    expect(perOp).toBeLessThan(5_000);
  });
});
