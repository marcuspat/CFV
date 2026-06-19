/**
 * Request validation middleware backed by Zod schemas.
 * On failure responds via the central error handler with a 400 +
 * structured `details.issues` array describing each offending field.
 */
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from './errorHandler';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
        code: issue.code,
      }));
      next(new ValidationError('Invalid request body', { issues }));
      return;
    }
    // Replace the body with the parsed (and coerced/stripped) value.
    req.body = result.data;
    next();
  };
}
