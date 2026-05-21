/**
 * Authentication and authorization middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthenticationError, AuthorizationError } from './errorHandler';
import { User, UserRole } from '../../types';

// Extend Request interface to include user
export interface AuthenticatedRequest extends Request {
  user?: User;
  auth?: AuthPrincipal;
}

/** The verified principal attached by authMiddleware (ADR-0007 claims). */
export interface AuthPrincipal {
  readonly userId: string;
  readonly tenantId: string;
  readonly roles: ReadonlyArray<string>;
  readonly scopes: ReadonlyArray<string>;
  readonly jti: string;
}

// JWT token payload interface
interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// Authentication middleware: verifies the Bearer JWT and attaches the user.
export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AuthenticationError('Authorization header required');
    }

    // Extract token from Bearer scheme
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new AuthenticationError('Invalid authorization header format');
    }

    const token = parts[1];

    // Verify the access token and attach the principal (ADR-0007 claims:
    // sub/org/roles/scopes/jti). Issued by the Identity context's signer.
    const decoded = jwt.verify(token, config.JWT_SECRET) as Record<string, unknown>;
    req.auth = {
      userId: String(decoded.sub ?? ''),
      tenantId: String(decoded.org ?? ''),
      roles: Array.isArray(decoded.roles) ? (decoded.roles as string[]) : [],
      scopes: Array.isArray(decoded.scopes) ? (decoded.scopes as string[]) : [],
      jti: String(decoded.jti ?? ''),
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

// Optional authentication middleware (doesn't throw error if no token)
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next();
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next();
    }

    const token = parts[1];

    // Verify JWT token
    const decoded = jwt.verify(token, config.JWT_SECRET) as JWTPayload;

    // Add user info to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      username: '',
      fullName: '',
      preferences: {
        theme: 'light',
        language: 'en',
        defaultVisualizationSettings: {
          colorScheme: 'default',
          animationEnabled: true,
          detailLevel: 'detailed',
        },
        notifications: {
          email: true,
          browser: true,
          processingComplete: true,
          errors: true,
        },
      },
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
  };

  const accessToken = jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  } as jwt.SignOptions);

  const refreshToken = jwt.sign(
    { userId: user.id },
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

// Token refresh utility
export const refreshAccessToken = (refreshToken: string): string => {
  try {
    const decoded = jwt.verify(refreshToken, config.JWT_SECRET) as { userId: string };

    // In a real implementation, you would fetch user from database
    // For now, we'll create a minimal payload
    const payload: JWTPayload = {
      userId: decoded.userId,
      email: '', // Would fetch from database
      role: UserRole.VIEWER, // Would fetch from database
    };

    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN,
    } as jwt.SignOptions);
  } catch (error) {
    throw new AuthenticationError('Invalid refresh token');
  }
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