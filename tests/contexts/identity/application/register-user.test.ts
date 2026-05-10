import { RegisterUser } from '../../../../src/server/contexts/identity/application/use-cases/register-user';
import { Tenant } from '../../../../src/server/contexts/identity/domain/tenant';
import { TenantId } from '../../../../src/server/contexts/identity/domain/value-objects';
import {
  CapturingDomainEventPublisher,
  CountingIdGenerator,
  FakePasswordHasher,
  FixedClock,
  InMemoryTenantRepository,
  InMemoryUserRepository,
} from '../../../../src/server/contexts/identity/infrastructure/in-memory';

const TENANT_ID = '01HJK3R6X7Y8ZAB2C3D4E5F6T0';
const NOW = new Date('2026-01-01T00:00:00Z');

function build() {
  const users = new InMemoryUserRepository();
  const tenants = new InMemoryTenantRepository();
  const hasher = new FakePasswordHasher();
  const ids = new CountingIdGenerator();
  const clock = new FixedClock(NOW);
  const publisher = new CapturingDomainEventPublisher();

  // Seed the tenant up front (the use case requires it to exist).
  const tenant = Tenant.create({
    id: TenantId.of(TENANT_ID),
    name: 'Acme',
    region: 'eu-west-1',
    now: NOW,
  });
  void tenants.save(tenant, 0);

  const useCase = new RegisterUser({ users, tenants, hasher, ids, clock, publisher });
  return { useCase, users, publisher };
}

describe('RegisterUser', () => {
  it('persists a new user and publishes UserRegistered', async () => {
    const { useCase, users, publisher } = build();
    const result = await useCase.execute({
      tenantId: TENANT_ID,
      email: 'alice@example.com',
      password: 'correct horse battery staple',
      roles: ['analyst'],
    });
    expect(result.ok).toBe(true);
    expect(users.size()).toBe(1);
    expect(publisher.events.map((e) => e.type)).toEqual(['UserRegistered']);
  });

  it('rejects malformed email', async () => {
    const { useCase } = build();
    const r = await useCase.execute({
      tenantId: TENANT_ID,
      email: 'not-an-email',
      password: 'correct horse battery staple',
      roles: ['analyst'],
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('InputInvalid');
  });

  it('rejects short passwords', async () => {
    const { useCase } = build();
    const r = await useCase.execute({
      tenantId: TENANT_ID,
      email: 'a@b.co',
      password: 'short',
      roles: ['analyst'],
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('InputInvalid');
  });

  it('rejects unknown roles', async () => {
    const { useCase } = build();
    const r = await useCase.execute({
      tenantId: TENANT_ID,
      email: 'a@b.co',
      password: 'correct horse battery staple',
      roles: ['superuser'],
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('InputInvalid');
  });

  it('rejects duplicate email per tenant', async () => {
    const { useCase } = build();
    await useCase.execute({
      tenantId: TENANT_ID,
      email: 'alice@example.com',
      password: 'correct horse battery staple',
      roles: ['analyst'],
    });
    const r = await useCase.execute({
      tenantId: TENANT_ID,
      email: 'ALICE@example.com', // case-insensitive match
      password: 'correct horse battery staple',
      roles: ['analyst'],
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('Conflict');
  });

  it('rejects unknown tenant', async () => {
    const { useCase } = build();
    const r = await useCase.execute({
      tenantId: '01HJK3R6X7Y8ZAB2C3D4E5F6XX', // valid ULID shape, not seeded
      email: 'a@b.co',
      password: 'correct horse battery staple',
      roles: ['analyst'],
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('NotFound');
  });
});
