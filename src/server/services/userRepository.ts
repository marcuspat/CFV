/**
 * User repository.
 *
 * Backed by the PostgreSQL `users` table when the database is connected, with
 * an in-memory fallback when it is not — mirroring the app's existing graceful
 * DB-degradation pattern so authentication still works in dev/CI without
 * Postgres. Password hashes never leave this layer except via UserRecord, which
 * is only used server-side; responses are built from toPublicUser().
 */
import { v4 as uuidv4 } from 'uuid';
import database from '../config/database';
import { User, UserRole, UserPreferences } from '../../types';

export interface UserRecord extends User {
  passwordHash: string;
}

export interface NewUser {
  email: string;
  username: string;
  fullName: string;
  passwordHash: string;
  role: UserRole;
  preferences: UserPreferences;
}

// In-memory fallback store (keyed by id). Process-local; lost on restart.
const memUsers = new Map<string, UserRecord>();

function usingDb(): boolean {
  return database.isConnected;
}

export function defaultPreferences(): UserPreferences {
  return {
    theme: 'dark',
    language: 'en',
    defaultVisualizationSettings: {
      colorScheme: 'cognitive',
      animationEnabled: true,
      detailLevel: 'comprehensive',
    },
    notifications: {
      email: true,
      browser: true,
      processingComplete: true,
      errors: true,
    },
  };
}

/** Strip the password hash before a record leaves the auth layer. */
export function toPublicUser(record: UserRecord): User {
  const { passwordHash, ...user } = record;
  return user;
}

function rowToRecord(row: Record<string, unknown>): UserRecord {
  const prefs = row.preferences;
  return {
    id: String(row.id),
    email: String(row.email),
    username: String(row.username),
    fullName: String(row.full_name),
    role: row.role as UserRole,
    preferences:
      typeof prefs === 'string'
        ? (JSON.parse(prefs) as UserPreferences)
        : ((prefs as UserPreferences) ?? defaultPreferences()),
    createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at as string) : undefined,
    passwordHash: String(row.password_hash),
  };
}

export async function findByEmail(email: string): Promise<UserRecord | null> {
  if (usingDb()) {
    const res = await database.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    return res.rows[0] ? rowToRecord(res.rows[0]) : null;
  }
  for (const rec of memUsers.values()) {
    if (rec.email.toLowerCase() === email.toLowerCase()) return rec;
  }
  return null;
}

export async function findById(id: string): Promise<UserRecord | null> {
  if (usingDb()) {
    const res = await database.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
    return res.rows[0] ? rowToRecord(res.rows[0]) : null;
  }
  return memUsers.get(id) ?? null;
}

export async function existsByEmailOrUsername(email: string, username: string): Promise<boolean> {
  if (usingDb()) {
    const res = await database.query(
      'SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2) LIMIT 1',
      [email, username]
    );
    return res.rows.length > 0;
  }
  for (const rec of memUsers.values()) {
    if (
      rec.email.toLowerCase() === email.toLowerCase() ||
      rec.username.toLowerCase() === username.toLowerCase()
    ) {
      return true;
    }
  }
  return false;
}

export async function createUser(input: NewUser): Promise<UserRecord> {
  if (usingDb()) {
    const res = await database.query(
      `INSERT INTO users (email, username, full_name, password_hash, role, preferences)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      [
        input.email,
        input.username,
        input.fullName,
        input.passwordHash,
        input.role,
        JSON.stringify(input.preferences),
      ]
    );
    return rowToRecord(res.rows[0]);
  }
  const record: UserRecord = {
    id: uuidv4(),
    email: input.email,
    username: input.username,
    fullName: input.fullName,
    role: input.role,
    preferences: input.preferences,
    createdAt: new Date(),
    passwordHash: input.passwordHash,
  };
  memUsers.set(record.id, record);
  return record;
}

export async function updateLastLogin(id: string): Promise<void> {
  if (usingDb()) {
    await database.query(
      'UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1',
      [id]
    );
    return;
  }
  const rec = memUsers.get(id);
  if (rec) rec.lastLoginAt = new Date();
}

export async function updateProfile(
  id: string,
  updates: { fullName?: string; preferences?: UserPreferences }
): Promise<UserRecord | null> {
  if (usingDb()) {
    const res = await database.query(
      `UPDATE users
         SET full_name = COALESCE($2, full_name),
             preferences = COALESCE($3::jsonb, preferences),
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, updates.fullName ?? null, updates.preferences ? JSON.stringify(updates.preferences) : null]
    );
    return res.rows[0] ? rowToRecord(res.rows[0]) : null;
  }
  const rec = memUsers.get(id);
  if (!rec) return null;
  if (updates.fullName !== undefined) rec.fullName = updates.fullName;
  if (updates.preferences !== undefined) rec.preferences = updates.preferences;
  return rec;
}
