/**
 * Authentication routes — backed by the Identity & Access bounded context
 * (real PostgreSQL persistence, bcrypt password hashing, JWT issuance, and
 * one-shot refresh-token rotation per ADR-0007).
 *
 * Replaces the previous in-memory mock that accepted any password.
 */

import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';
import {
  DEFAULT_TENANT_ID,
  type IdentityModule,
} from '../composition/identity';
import type { ApplicationError } from '../contexts/identity/application/ports';

function statusFor(error: ApplicationError): number {
  switch (error.kind) {
    case 'InputInvalid':
      return 400;
    case 'Unauthorised':
      return 401;
    case 'Forbidden':
      return 403;
    case 'NotFound':
      return 404;
    case 'Conflict':
      return 409;
    default:
      return 400;
  }
}

function fail(res: Response, error: ApplicationError): void {
  res.status(statusFor(error)).json({ error });
}

export function createAuthRouter(identity: IdentityModule): Router {
  const router = Router();

  // Register a new user within a tenant (defaults to the bootstrap tenant).
  router.post(
    '/register',
    asyncHandler(async (req: Request, res: Response) => {
      const { email, password, tenantId, roles } = req.body ?? {};
      const result = await identity.register({
        tenantId: typeof tenantId === 'string' ? tenantId : DEFAULT_TENANT_ID,
        email,
        password,
        roles: Array.isArray(roles) && roles.length > 0 ? roles : ['viewer'],
      });
      if (!result.ok) return fail(res, result.error);
      res.status(201).json({ userId: result.value.userId });
    }),
  );

  // Authenticate and issue an access token + refresh token id.
  router.post(
    '/login',
    asyncHandler(async (req: Request, res: Response) => {
      const { email, password, tenantId } = req.body ?? {};
      const result = await identity.login({
        tenantId: typeof tenantId === 'string' ? tenantId : DEFAULT_TENANT_ID,
        email,
        password,
      });
      if (!result.ok) return fail(res, result.error);
      res.json({
        accessToken: result.value.accessToken,
        refreshToken: result.value.refreshTokenId,
        accessTokenExpiresAt: result.value.accessTokenExpiresAt,
        refreshTokenExpiresAt: result.value.refreshTokenExpiresAt,
      });
    }),
  );

  // Rotate a refresh token (one-shot) and mint a fresh access token.
  router.post(
    '/refresh',
    asyncHandler(async (req: Request, res: Response) => {
      const { refreshToken } = req.body ?? {};
      if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
        return fail(res, { kind: 'InputInvalid', field: 'refreshToken', reason: 'required' });
      }
      const result = await identity.rotate({ refreshTokenId: refreshToken });
      if (!result.ok) return fail(res, result.error);
      res.json({
        accessToken: result.value.accessToken,
        refreshToken: result.value.newRefreshTokenId,
        accessTokenExpiresAt: result.value.accessTokenExpiresAt,
        refreshTokenExpiresAt: result.value.refreshTokenExpiresAt,
      });
    }),
  );

  // Stateless logout: the client discards its tokens. The current access
  // token remains valid until expiry (15 min); the refresh token is
  // single-use and will be invalidated on next rotation.
  router.post(
    '/logout',
    asyncHandler(async (_req: Request, res: Response) => {
      res.json({ message: 'Logged out successfully' });
    }),
  );

  // Return the authenticated principal (populated by authMiddleware).
  router.get(
    '/me',
    authMiddleware,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      if (!req.auth) {
        return fail(res, { kind: 'Unauthorised' });
      }
      res.json({
        userId: req.auth.userId,
        tenantId: req.auth.tenantId,
        roles: req.auth.roles,
        scopes: req.auth.scopes,
      });
    }),
  );

  return router;
}

export default createAuthRouter;
