/**
 * Error handling middleware for Cognitive Fabric Visualizer
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ApiError } from '../../types';

export interface CustomError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
  isOperational?: boolean;
}

export const errorHandler = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Default error values
  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_SERVER_ERROR';
  const message = error.message || 'Internal server error';

  // Log the error
  logger.error('API Error', {
    error: error.message,
    stack: error.stack,
    statusCode,
    code,
    url: req.url,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    requestId: req.headers['x-request-id'],
  });

  // Prepare error response
  const errorResponse: ApiError = {
    code,
    message,
    timestamp: new Date(),
    requestId: req.headers['x-request-id'] as string,
  };

  // Include details in development or if explicitly provided
  if (process.env.NODE_ENV === 'development' || error.details) {
    errorResponse.details = error.details;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development' && error.stack) {
    errorResponse.details = {
      ...errorResponse.details,
      stack: error.stack,
    };
  }

  // Don't expose internal error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    errorResponse.message = 'Internal server error';
    errorResponse.details = undefined;
  }

  res.status(statusCode).json(errorResponse);
};

// Async error wrapper for route handlers
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Custom error classes
export class ValidationError extends Error implements CustomError {
  public statusCode = 400;
  public code = 'VALIDATION_ERROR';
  public isOperational = true;

  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error implements CustomError {
  public statusCode = 401;
  public code = 'AUTHENTICATION_ERROR';
  public isOperational = true;

  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error implements CustomError {
  public statusCode = 403;
  public code = 'AUTHORIZATION_ERROR';
  public isOperational = true;

  constructor(message = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error implements CustomError {
  public statusCode = 404;
  public code = 'NOT_FOUND_ERROR';
  public isOperational = true;

  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error implements CustomError {
  public statusCode = 409;
  public code = 'CONFLICT_ERROR';
  public isOperational = true;

  constructor(message = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends Error implements CustomError {
  public statusCode = 429;
  public code = 'RATE_LIMIT_ERROR';
  public isOperational = true;

  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class CognitiveProcessingError extends Error implements CustomError {
  public statusCode = 500;
  public code = 'COGNITIVE_PROCESSING_ERROR';
  public isOperational = true;

  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'CognitiveProcessingError';
  }
}

export class DatabaseError extends Error implements CustomError {
  public statusCode = 500;
  public code = 'DATABASE_ERROR';
  public isOperational = true;

  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ExternalServiceError extends Error implements CustomError {
  public statusCode = 502;
  public code = 'EXTERNAL_SERVICE_ERROR';
  public isOperational = true;

  constructor(service: string, message?: string) {
    super(message || `External service ${service} unavailable`);
    this.name = 'ExternalServiceError';
  }
}

export class CognitiveAccuracyError extends Error implements CustomError {
  public statusCode = 422;
  public code = 'COGNITIVE_ACCURACY_ERROR';
  public isOperational = true;

  constructor(
    dimension: string,
    actualScore: number,
    targetScore: number,
    public details?: any
  ) {
    super(
      `Cognitive accuracy threshold not met for ${dimension}: ${actualScore.toFixed(3)} < ${targetScore.toFixed(3)}`
    );
    this.name = 'CognitiveAccuracyError';
  }
}