import {
  Email,
  InvalidEmail,
  InvalidIdentifier,
  PasswordHash,
  TenantId,
  UserId,
  defaultScopesFor,
  isRole,
} from '../../../../src/server/contexts/identity/domain/value-objects';

const VALID_ULID = '01HJK3R6X7Y8ZAB2C3D4E5F6G7';
const ANOTHER_ULID = '01HJK3R6X7Y8ZAB2C3D4E5F6G8';

describe('Email', () => {
  it('lowercases and trims', () => {
    expect(Email.of(' Foo@BAR.com ').value).toBe('foo@bar.com');
  });

  it('rejects malformed input', () => {
    expect(() => Email.of('no-at-sign')).toThrow(InvalidEmail);
    expect(() => Email.of('a@b')).toThrow(InvalidEmail);
  });

  it('compares by value', () => {
    expect(Email.of('a@b.co').equals(Email.of('A@b.co'))).toBe(true);
    expect(Email.of('a@b.co').equals(Email.of('c@b.co'))).toBe(false);
  });
});

describe('PasswordHash', () => {
  it('rejects too-short hashes', () => {
    expect(() => PasswordHash.fromHashed('short')).toThrow();
  });

  it('redacts on stringify and JSON', () => {
    const h = PasswordHash.fromHashed('a-real-hash-of-sufficient-length');
    expect(String(h)).toBe('<redacted>');
    expect(JSON.stringify({ h })).toContain('<redacted>');
  });
});

describe('typed identifiers', () => {
  it('accept valid ULID-shaped strings', () => {
    expect(UserId.of(VALID_ULID)).toBe(VALID_ULID);
    expect(TenantId.of(ANOTHER_ULID)).toBe(ANOTHER_ULID);
  });

  it('reject malformed strings', () => {
    expect(() => UserId.of('not-a-ulid')).toThrow(InvalidIdentifier);
  });
});

describe('roles + default scopes', () => {
  it('admin gets the wildcard scope', () => {
    expect(defaultScopesFor(['admin'])).toContain('*');
  });

  it('viewer gets read-only scopes', () => {
    const scopes = defaultScopesFor(['viewer']);
    expect(scopes).toContain('analysis:read');
    expect(scopes).not.toContain('analysis:start');
  });

  it('analyst gets read + start + feedback', () => {
    const scopes = defaultScopesFor(['analyst']);
    expect(scopes).toEqual(expect.arrayContaining(['analysis:start', 'feedback:write']));
  });

  it('combines scopes from multiple roles, deduping', () => {
    const scopes = defaultScopesFor(['viewer', 'analyst']);
    const unique = new Set(scopes);
    expect(unique.size).toBe(scopes.length);
  });

  it('isRole guards the closed vocabulary', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('superuser')).toBe(false);
  });
});
