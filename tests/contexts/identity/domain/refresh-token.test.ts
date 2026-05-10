import {
  RefreshTokenId,
  TenantId,
  UserId,
} from '../../../../src/server/contexts/identity/domain/value-objects';
import { RefreshToken } from '../../../../src/server/contexts/identity/domain/refresh-token';
import {
  RefreshTokenAlreadyRotated,
  RefreshTokenExpired,
  RefreshTokenRevoked,
} from '../../../../src/server/contexts/identity/domain/errors';

const NOW = new Date('2026-01-01T00:00:00Z');
const TENANT = TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6T0');
const USER = UserId.of('01HJK3R6X7Y8ZAB2C3D4E5F6Y0');

function issue(ttlSeconds = 60) {
  return RefreshToken.issue({
    id: RefreshTokenId.of('01HJK3R6X7Y8ZAB2C3D4E5F6R0'),
    userId: USER,
    tenantId: TENANT,
    now: NOW,
    ttlSeconds,
  });
}

describe('RefreshToken', () => {
  it('is usable when fresh', () => {
    const t = issue();
    expect(() => t.assertUsable(NOW)).not.toThrow();
  });

  it('fails after expiry', () => {
    const t = issue(60);
    const later = new Date(NOW.getTime() + 61_000);
    expect(() => t.assertUsable(later)).toThrow(RefreshTokenExpired);
  });

  it('cannot be rotated twice', () => {
    const t = issue();
    t.rotate(NOW);
    expect(t.isRotated).toBe(true);
    expect(() => t.rotate(NOW)).toThrow(RefreshTokenAlreadyRotated);
  });

  it('reports revoked after revoke', () => {
    const t = issue();
    t.revoke(NOW);
    expect(t.isRevoked).toBe(true);
    expect(() => t.assertUsable(NOW)).toThrow(RefreshTokenRevoked);
  });

  it('rotate bumps version', () => {
    const t = issue();
    expect(t.version).toBe(1);
    t.rotate(NOW);
    expect(t.version).toBe(2);
  });

  it('rejects non-positive TTL', () => {
    expect(() =>
      RefreshToken.issue({
        id: RefreshTokenId.of('01HJK3R6X7Y8ZAB2C3D4E5F6R0'),
        userId: USER,
        tenantId: TENANT,
        now: NOW,
        ttlSeconds: 0,
      }),
    ).toThrow();
  });
});
