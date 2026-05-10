import { Login } from '../../../../src/server/contexts/identity/application/use-cases/login';
import { RegisterUser } from '../../../../src/server/contexts/identity/application/use-cases/register-user';
import { RotateRefreshToken } from '../../../../src/server/contexts/identity/application/use-cases/rotate-refresh-token';
import { Tenant } from '../../../../src/server/contexts/identity/domain/tenant';
import { TenantId } from '../../../../src/server/contexts/identity/domain/value-objects';
import {
  CapturingDomainEventPublisher,
  CountingIdGenerator,
  FakeAccessTokenSigner,
  FakePasswordHasher,
  FixedClock,
  InMemoryRefreshTokenRepository,
  InMemoryTenantRepository,
  InMemoryUserRepository,
} from '../../../../src/server/contexts/identity/infrastructure/in-memory';

const TENANT_ID = '01HJK3R6X7Y8ZAB2C3D4E5F6T0';
const NOW = new Date('2026-01-01T00:00:00Z');
const ACCESS_TTL = 15 * 60;          // 15 minutes per ADR-0007
const REFRESH_TTL = 30 * 24 * 60 * 60; // 30 days

async function bootstrap() {
  const users = new InMemoryUserRepository();
  const tenants = new InMemoryTenantRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const hasher = new FakePasswordHasher();
  const signer = new FakeAccessTokenSigner();
  const ids = new CountingIdGenerator();
  const clock = new FixedClock(NOW);
  const publisher = new CapturingDomainEventPublisher();

  await tenants.save(
    Tenant.create({
      id: TenantId.of(TENANT_ID),
      name: 'Acme',
      region: 'eu-west-1',
      now: NOW,
    }),
    0,
  );
  const register = new RegisterUser({ users, tenants, hasher, ids, clock, publisher });
  await register.execute({
    tenantId: TENANT_ID,
    email: 'alice@example.com',
    password: 'correct horse battery staple',
    roles: ['analyst'],
  });

  const config = { accessTokenTtlSeconds: ACCESS_TTL, refreshTokenTtlSeconds: REFRESH_TTL };
  const login = new Login({ users, refreshTokens, hasher, signer, ids, clock, config });
  const rotate = new RotateRefreshToken({
    users,
    refreshTokens,
    signer,
    ids,
    clock,
    config,
  });

  return { login, rotate, signer, clock, refreshTokens };
}

describe('Login + RotateRefreshToken', () => {
  it('issues access + refresh tokens on correct credentials', async () => {
    const { login, signer } = await bootstrap();
    const r = await login.execute({
      tenantId: TENANT_ID,
      email: 'alice@example.com',
      password: 'correct horse battery staple',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.value.accessToken).toBe('string');
    expect(typeof r.value.refreshTokenId).toBe('string');
    const claims = await signer.verify(r.value.accessToken);
    expect(claims.scopes).toContain('analysis:read');
    expect(claims.scopes).toContain('analysis:start');
  });

  it('rejects wrong password with Unauthorised', async () => {
    const { login } = await bootstrap();
    const r = await login.execute({
      tenantId: TENANT_ID,
      email: 'alice@example.com',
      password: 'wrong password',
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('Unauthorised');
  });

  it('rejects unknown user with Unauthorised (no enumeration)', async () => {
    const { login } = await bootstrap();
    const r = await login.execute({
      tenantId: TENANT_ID,
      email: 'nobody@example.com',
      password: 'correct horse battery staple',
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('Unauthorised');
  });

  it('rotation succeeds once and is rejected on reuse (one-shot)', async () => {
    const { login, rotate } = await bootstrap();
    const loginResult = await login.execute({
      tenantId: TENANT_ID,
      email: 'alice@example.com',
      password: 'correct horse battery staple',
    });
    if (!loginResult.ok) throw new Error('login failed');
    const firstId = loginResult.value.refreshTokenId;

    const first = await rotate.execute({ refreshTokenId: firstId });
    expect(first.ok).toBe(true);

    const second = await rotate.execute({ refreshTokenId: firstId });
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.error.kind).toBe('Unauthorised');
  });

  it('rotation rejects expired tokens', async () => {
    const { login, rotate, clock } = await bootstrap();
    const loginResult = await login.execute({
      tenantId: TENANT_ID,
      email: 'alice@example.com',
      password: 'correct horse battery staple',
    });
    if (!loginResult.ok) throw new Error('login failed');
    clock.advance((REFRESH_TTL + 1) * 1000);
    const r = await rotate.execute({ refreshTokenId: loginResult.value.refreshTokenId });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('Unauthorised');
  });
});
