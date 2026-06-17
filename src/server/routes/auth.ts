/**
 * Authentication routes for Cognitive Fabric Visualizer.
 *
 * Real implementation: bcrypt password hashing, JWT access/refresh tokens, and
 * a PostgreSQL-backed user store (with in-memory fallback). These endpoints are
 * mounted publicly (no authMiddleware) except /me, which requires a token.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import {
  asyncHandler,
  ValidationError,
  AuthenticationError,
} from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import {
  generateTokens,
  verifyRefreshToken,
  authMiddleware,
  AuthenticatedRequest,
} from '../middleware/auth';
import { UserRole, AuthResponse } from '../../types';
import { logger } from '../utils/logger';
import {
  findByEmail,
  findById,
  existsByEmailOrUsername,
  createUser,
  updateLastLogin,
  updateProfile,
  toPublicUser,
  defaultPreferences,
} from '../services/userRepository';
import { revokeRefreshToken, isRefreshTokenRevoked } from '../services/tokenRevocation';

const router = Router();

const SALT_ROUNDS = 12;

// --- Validation schemas ---
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  username: z.string().min(1, 'username is required').max(100),
  fullName: z.string().min(1, 'fullName is required').max(255),
  // Accepted for forward-compat but ignored — self-registration is always VIEWER.
  role: z.nativeEnum(UserRole).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

/** Convert a JWT duration string ('7d', '24h', '15m', '30s') to milliseconds. */
function durationToMs(d: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(d.trim());
  if (!match) return 0;
  const n = parseInt(match[1], 10);
  const unit = match[2] ?? 's';
  const mult = unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : unit === 'm' ? 60_000 : 1_000;
  return n * mult;
}

// --- Refresh-token httpOnly cookie ---
const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';

/** Minimal single-cookie reader (avoids a cookie-parser dependency). */
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: durationToMs(config.JWT_REFRESH_EXPIRES_IN),
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

// Register a new user
router.post('/register', validateBody(registerSchema), asyncHandler(async (req: Request, res: Response) => {
  const { email, password, username, fullName } = req.body as {
    email: string;
    password: string;
    username: string;
    fullName: string;
  };

  if (await existsByEmailOrUsername(email, username)) {
    throw new ValidationError('User with this email or username already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const record = await createUser({
    email,
    username,
    fullName,
    passwordHash,
    role: UserRole.VIEWER, // never honour a client-supplied privileged role
    preferences: defaultPreferences(),
  });

  logger.info('User registered', { userId: record.id, email: record.email, username: record.username });

  const tokens = generateTokens({ id: record.id, email: record.email, role: record.role });

  setRefreshCookie(res, tokens.refreshToken);

  const response: AuthResponse = {
    user: toPublicUser(record),
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: new Date(Date.now() + durationToMs(tokens.expiresIn)),
  };

  res.status(201).json(response);
}));

// Login user
router.post('/login', validateBody(loginSchema), asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };

  const record = await findByEmail(email);
  if (!record) {
    throw new AuthenticationError('Invalid email or password');
  }

  const isValid = await bcrypt.compare(password, record.passwordHash);
  if (!isValid) {
    throw new AuthenticationError('Invalid email or password');
  }

  await updateLastLogin(record.id);

  logger.info('User logged in', { userId: record.id, email: record.email, role: record.role });

  const tokens = generateTokens({ id: record.id, email: record.email, role: record.role });

  setRefreshCookie(res, tokens.refreshToken);

  const response: AuthResponse = {
    user: toPublicUser({ ...record, lastLoginAt: new Date() }),
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: new Date(Date.now() + durationToMs(tokens.expiresIn)),
  };

  res.json(response);
}));

// Refresh access token (rotates both tokens). The refresh token is read from
// the httpOnly cookie, falling back to the request body for non-browser clients.
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const refreshToken =
    readCookie(req, REFRESH_COOKIE) ?? (req.body?.refreshToken as string | undefined);
  if (!refreshToken) {
    throw new AuthenticationError('Refresh token is required');
  }

  let userId: string;
  let jti: string | undefined;
  try {
    ({ userId, jti } = verifyRefreshToken(refreshToken));
  } catch {
    throw new AuthenticationError('Invalid or expired refresh token');
  }

  if (jti && (await isRefreshTokenRevoked(jti))) {
    throw new AuthenticationError('Refresh token has been revoked');
  }

  const record = await findById(userId);
  if (!record) {
    throw new AuthenticationError('Invalid refresh token');
  }

  const tokens = generateTokens({ id: record.id, email: record.email, role: record.role });

  setRefreshCookie(res, tokens.refreshToken);

  res.json({
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: new Date(Date.now() + durationToMs(tokens.expiresIn)),
  });
}));

// Logout — revokes the refresh token (from cookie or body) and clears the cookie.
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const refreshToken =
    readCookie(req, REFRESH_COOKIE) ?? ((req.body ?? {}) as { refreshToken?: string }).refreshToken;

  if (refreshToken) {
    try {
      const { jti, exp } = verifyRefreshToken(refreshToken);
      if (jti) {
        // Keep the blocklist entry only until the token would have expired.
        const ttlSeconds = exp ? Math.max(1, exp - Math.floor(Date.now() / 1000)) : 60;
        await revokeRefreshToken(jti, ttlSeconds);
      }
    } catch {
      // Invalid/expired token — nothing to revoke; logout is best-effort.
    }
  }

  clearRefreshCookie(res);
  logger.info('User logged out', { userId: (req as AuthenticatedRequest).user?.id });
  res.json({ message: 'Logged out successfully' });
}));

// Get current user profile (requires a valid access token)
router.get('/me', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const record = await findById(userId);
  if (!record) {
    throw new AuthenticationError('User not found');
  }
  res.json({ user: toPublicUser(record) });
}));

// Update current user profile (requires a valid access token)
router.put('/me', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { fullName, preferences } = req.body ?? {};

  const updated = await updateProfile(userId, { fullName, preferences });
  if (!updated) {
    throw new ValidationError('User not found');
  }

  logger.info('User profile updated', { userId });
  res.json({ user: toPublicUser(updated) });
}));

export default router;
