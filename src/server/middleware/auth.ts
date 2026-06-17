/**
 * Authentication and authorization middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { AuthenticationError, AuthorizationError } from './errorHandler';
import { User, UserRole } from '../../types';
import { defaultPreferences } from '../services/userRepository';
import { isAccessTokenRevoked } from '../services/tokenRevocation';

// Extend Request interface to include user
export interface AuthenticatedRequest extends Request {
  user?: User;
}

// JWT token payload interface
interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  type?: 'access' | 'refresh';
  jti?: string;
  iat?: number;
  exp?: number;
}

/** Verify an access token; rejects refresh tokens presented as access tokens. */
export const verifyAccessToken = (token: string): JWTPayload => {
  const decoded = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
  if (decoded.type && decoded.type !== 'access') {
    throw new AuthenticationError('Invalid token type');
  }
  return decoded;
};

/** Verify a refresh token; rejects access tokens presented as refresh tokens. */
export const verifyRefreshToken = (
  token: string
): { userId: string; jti?: string; exp?: number } => {
  const decoded = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
  if (decoded.type !== 'refresh') {
    throw new AuthenticationError('Invalid refresh token');
  }
  return { userId: decoded.userId, jti: decoded.jti, exp: decoded.exp };
};

// Authentication middleware — requires a valid Bearer access token.
export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractTokenFromRequest(req);
    if (!token) {
      throw new AuthenticationError('Authorization header required');
    }

    const decoded = verifyAccessToken(token);

    // Reject access tokens that were revoked at logout.
    if (decoded.jti && (await isAccessTokenRevoked(decoded.jti))) {
      throw new AuthenticationError('Token has been revoked');
    }

    // Build the request user from the (stateless) token claims. Routes that
    // need the full profile can load it from the user repository.
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      username: '',
      fullName: '',
      preferences: defaultPreferences(),
      createdAt: new Date(),
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new AuthenticationError('Token expired'));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new AuthenticationError('Invalid token'));
    } else {
      next(error);
    }
  }
};

// Role-based authorization middleware factory
export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('User not authenticated'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AuthorizationError(
        `Required role: ${roles.join(' or ')}. Current role: ${req.user.role}`
      ));
    }

    next();
  };
};

// Specific role middleware functions
export const requireAdmin = requireRole(UserRole.ADMIN);
export const requireResearcher = requireRole(UserRole.ADMIN, UserRole.RESEARCHER);
export const requireAnalyst = requireRole(UserRole.ADMIN, UserRole.RESEARCHER, UserRole.ANALYST);
export const requireViewer = requireRole(UserRole.ADMIN, UserRole.RESEARCHER, UserRole.ANALYST, UserRole.VIEWER);

// Optional authentication middleware (doesn't throw error if no/invalid token)
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractTokenFromRequest(req);
    if (!token) {
      return next();
    }

    const decoded = verifyAccessToken(token);

    // A revoked token is treated as no auth for optional routes.
    if (decoded.jti && (await isAccessTokenRevoked(decoded.jti))) {
      return next();
    }

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      username: '',
      fullName: '',
      preferences: defaultPreferences(),
      createdAt: new Date(),
    };

    next();
  } catch (error) {
    // Ignore authentication errors for optional auth
    next();
  }
};

// JWT token generation utility
export const generateTokens = (user: { id: string; email: string; role: UserRole }) => {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    type: 'access',
    jti: randomUUID(),
  };

  const accessToken = jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  } as jwt.SignOptions);

  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh', jti: uuidv4() },
    config.JWT_SECRET,
    {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN,
    } as jwt.SignOptions
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: config.JWT_EXPIRES_IN,
  };
};

// Token extraction utility
export const extractTokenFromRequest = (req: Request): string | null => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
};
