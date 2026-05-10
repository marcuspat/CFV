import {
  AuthorisationPolicy,
  type Actor,
  type Resource,
} from '../../../../src/server/contexts/identity/domain/authorisation-policy';
import {
  TenantId,
  UserId,
} from '../../../../src/server/contexts/identity/domain/value-objects';

const TENANT_A = TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6A0');
const TENANT_B = TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6B0');
const USER = UserId.of('01HJK3R6X7Y8ZAB2C3D4E5F6Y0');

function actor(scopes: string[], tenantId = TENANT_A): Actor {
  return {
    userId: USER,
    tenantId,
    roles: ['analyst'],
    scopes,
  };
}

const RESOURCE_A: Resource = { tenantId: TENANT_A, kind: 'analysis' };
const RESOURCE_B: Resource = { tenantId: TENANT_B, kind: 'analysis' };

describe('AuthorisationPolicy', () => {
  it('allows when the exact scope is granted', () => {
    expect(
      AuthorisationPolicy.decide(actor(['analysis:read']), 'analysis:read', RESOURCE_A),
    ).toEqual({ allowed: true });
  });

  it('allows on wildcard parent scope', () => {
    expect(
      AuthorisationPolicy.decide(actor(['analysis:*']), 'analysis:read', RESOURCE_A),
    ).toEqual({ allowed: true });
  });

  it('allows on admin global wildcard', () => {
    expect(
      AuthorisationPolicy.decide(actor(['*']), 'anything:goes', RESOURCE_A),
    ).toEqual({ allowed: true });
  });

  it('denies when the scope is missing', () => {
    const decision = AuthorisationPolicy.decide(
      actor(['analysis:read']),
      'analysis:start',
      RESOURCE_A,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toMatch(/missing scope/);
  });

  it('rejects cross-tenant access regardless of scopes', () => {
    const decision = AuthorisationPolicy.decide(
      actor(['*']),
      'analysis:read',
      RESOURCE_B,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toMatch(/cross-tenant/);
  });
});
