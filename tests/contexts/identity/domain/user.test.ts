import {
  Email,
  PasswordHash,
  TenantId,
  UserId,
} from '../../../../src/server/contexts/identity/domain/value-objects';
import { User } from '../../../../src/server/contexts/identity/domain/user';
import {
  InvalidRoleAssignment,
  UserAlreadyDisabled,
  UserDisabled,
} from '../../../../src/server/contexts/identity/domain/errors';

const TENANT = TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6T0');
const USER = UserId.of('01HJK3R6X7Y8ZAB2C3D4E5F6Y0');
const NOW = new Date('2026-01-01T00:00:00Z');

function makeUser(overrides: Partial<Parameters<typeof User.register>[0]> = {}): User {
  return User.register({
    id: USER,
    tenantId: TENANT,
    email: Email.of('alice@example.com'),
    passwordHash: PasswordHash.fromHashed('hashed-password-of-good-length'),
    roles: ['analyst'],
    now: NOW,
    ...overrides,
  });
}

describe('User aggregate', () => {
  it('emits UserRegistered on registration', () => {
    const user = makeUser();
    const events = user.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('UserRegistered');
    expect(events[0].payload.userId).toBe(USER);
    expect(events[0].payload.tenantId).toBe(TENANT);
    expect(events[0].payload.email).toBe('alice@example.com');
    expect(events[0].payload.roles).toEqual(['analyst']);
  });

  it('drains events idempotently', () => {
    const user = makeUser();
    expect(user.pullEvents()).toHaveLength(1);
    expect(user.pullEvents()).toHaveLength(0);
  });

  it('rejects empty role lists', () => {
    expect(() => makeUser({ roles: [] })).toThrow(InvalidRoleAssignment);
  });

  it('rejects unknown roles', () => {
    expect(() => makeUser({ roles: ['superuser' as any] })).toThrow(InvalidRoleAssignment);
  });

  it('dedupes and sorts roles deterministically', () => {
    const user = makeUser({ roles: ['analyst', 'viewer', 'analyst'] });
    expect(user.roles).toEqual(['analyst', 'viewer']);
  });

  describe('assignRoles', () => {
    it('emits RolesChanged on actual change', () => {
      const user = makeUser();
      user.pullEvents(); // drain registration
      user.assignRoles(['admin']);
      const events = user.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('RolesChanged');
      expect(events[0].payload.before).toEqual(['analyst']);
      expect(events[0].payload.after).toEqual(['admin']);
      expect(user.version).toBe(2);
    });

    it('is a no-op when the role set is unchanged', () => {
      const user = makeUser();
      user.pullEvents();
      user.assignRoles(['analyst']);
      expect(user.pullEvents()).toHaveLength(0);
      expect(user.version).toBe(1);
    });

    it('refuses on a disabled user', () => {
      const user = makeUser();
      user.disable('compliance', NOW);
      expect(() => user.assignRoles(['admin'])).toThrow(UserDisabled);
    });
  });

  describe('disable', () => {
    it('emits UserDisabled and bumps version', () => {
      const user = makeUser();
      user.pullEvents();
      user.disable('compliance', NOW);
      expect(user.isDisabled).toBe(true);
      expect(user.version).toBe(2);
      const events = user.pullEvents();
      expect(events.map((e) => e.type)).toEqual(['UserDisabled']);
      expect(events[0].payload.reason).toBe('compliance');
    });

    it('rejects a second disable', () => {
      const user = makeUser();
      user.disable('first', NOW);
      expect(() => user.disable('second', NOW)).toThrow(UserAlreadyDisabled);
    });
  });

  it('rehydrate preserves state without emitting events', () => {
    const user = makeUser();
    user.disable('compliance', NOW);
    const snap = user.snapshot();
    const back = User.rehydrate(snap);
    expect(back.isDisabled).toBe(true);
    expect(back.version).toBe(snap.version);
    expect(back.pullEvents()).toHaveLength(0);
  });

  it('defaultScopes derives from roles', () => {
    const user = makeUser({ roles: ['viewer'] });
    expect(user.defaultScopes()).toContain('analysis:read');
    expect(user.defaultScopes()).not.toContain('*');
  });
});
