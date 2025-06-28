/**
 * Global error handling middleware for Repotools Lightweight Server
 * 
 * Provides centralized error handling with proper logging and response formatting.
 * Handles different types of errors with appropriate HTTP status codes.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';

interface ErrorResponse {
  error: string;
  message: string;
  timestamp: string;
  requestId?: string;
  stack?: string;
  details?: any;
}

class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public details?: any;

  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, details);
    this.name = 'ConflictError';
  }
}

class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * Determine HTTP status code from error
 */
function getStatusCode(error: any): number {
  // Custom app errors
  if (error.statusCode) {
    return error.statusCode;
  }

  // Joi validation errors
  if (error.isJoi) {
    return 400;
  }

  // Multer file upload errors
  if (error.code === 'LIMIT_FILE_SIZE') {
    return 413; // Payload Too Large
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return 400;
  }

  // File system errors
  if (error.code === 'ENOENT') {
    return 404;
  }

  if (error.code === 'EACCES' || error.code === 'EPERM') {
    return 403;
  }

  if (error.code === 'EEXIST') {
    return 409;
  }

  // Default to 500
  return 500;
}

/**
 * Format error message for client
 */
function formatErrorMessage(error: any): string {
  // Custom app errors
  if (error.message) {
    return error.message;
  }

  // Joi validation errors
  if (error.isJoi && error.details) {
    return error.details.map((detail: any) => detail.message).join(', ');
  }

  // File system errors
  if (error.code === 'ENOENT') {
    return 'File or directory not found';
  }

  if (error.code === 'EACCES' || error.code === 'EPERM') {
    return 'Permission denied';
  }

  if (error.code === 'EEXIST') {
    return 'File or directory already exists';
  }

  // Multer errors
  if (error.code === 'LIMIT_FILE_SIZE') {
    return 'File size too large';
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return 'Unexpected file field';
  }

  // Default message
  return 'Internal server error';
}

/**
 * Main error handling middleware
 */
function errorHandler(
  error: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = getStatusCode(error);
  const message = formatErrorMessage(error);
  const timestamp = new Date().toISOString();
  const requestId = req.headers['x-request-id'] as string;

  // Log error with context
  logger.errorWithContext(error, 'Request error', {
    method: req.method,
    url: req.originalUrl,
    statusCode,
    requestId,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });

  // Build error response
  const errorResponse: ErrorResponse = {
    error: error.name || 'Error',
    message,
    timestamp,
    ...(requestId && { requestId }),
  };

  // Include stack trace in development
  if (config.NODE_ENV === 'development') {
    errorResponse.stack = error.stack;
  }

  // Include validation details if available
  if (error.details) {
    errorResponse.details = error.details;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * Async error wrapper for route handlers
 */
function asyncHandler<T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<any>
) {
  return (req: T, res: U, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 handler for unmatched routes
 */
function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  const error = new NotFoundError(`Route ${req.originalUrl}`);
  next(error);
}

export {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
};
