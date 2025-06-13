/**
 * Authentication and authorization middleware for Repotools Lightweight Server
 * 
 * Provides API key validation and JWT token verification for secure access
 * to protected endpoints.
 */

import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { config } from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import { UnauthorizedError, ForbiddenError } from '@/middleware/errorHandler.js';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    permissions: string[];
  };
  apiKey?: string;
}

interface JWTPayload {
  sub: string; // user id
  role: string;
  permissions: string[];
  iat: number;
  exp: number;
}

/**
 * Validate API key from request headers
 */
function validateApiKey(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;
  
  // Skip API key validation for health check
  if (req.path === '/health') {
    return next();
  }

  // Check if API key is provided
  if (!apiKey) {
    logger.warn('Missing API key', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
    });
    throw new UnauthorizedError('API key required');
  }

  // Validate API key
  if (apiKey !== config.API_KEY) {
    logger.warn('Invalid API key', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
      providedKey: `${apiKey.substring(0, 8)  }...`,
    });
    throw new UnauthorizedError('Invalid API key');
  }

  // Store API key in request for logging
  req.apiKey = apiKey;
  
  logger.debug('API key validated successfully', {
    ip: req.ip,
    path: req.path,
  });

  next();
}

/**
 * Validate JWT token from Authorization header
 */
function validateJWT(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('JWT token required');
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
    
    req.user = {
      id: payload.sub,
      role: payload.role,
      permissions: payload.permissions || [],
    };

    logger.debug('JWT validated successfully', {
      userId: req.user.id,
      role: req.user.role,
      path: req.path,
    });

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token');
    } else {
      throw new UnauthorizedError('Token validation failed');
    }
  }
}

/**
 * Check if user has required permission
 */
function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!req.user.permissions.includes(permission) && req.user.role !== 'admin') {
      logger.warn('Insufficient permissions', {
        userId: req.user.id,
        role: req.user.role,
        requiredPermission: permission,
        userPermissions: req.user.permissions,
        path: req.path,
      });
      throw new ForbiddenError(`Permission required: ${permission}`);
    }

    logger.debug('Permission check passed', {
      userId: req.user.id,
      permission,
      path: req.path,
    });

    next();
  };
}

/**
 * Check if user has required role
 */
function requireRole(role: string) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (req.user.role !== role && req.user.role !== 'admin') {
      logger.warn('Insufficient role', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRole: role,
        path: req.path,
      });
      throw new ForbiddenError(`Role required: ${role}`);
    }

    logger.debug('Role check passed', {
      userId: req.user.id,
      role,
      path: req.path,
    });

    next();
  };
}

/**
 * Optional JWT validation - doesn't throw if token is missing
 */
function optionalJWT(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // Continue without user info
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
    
    req.user = {
      id: payload.sub,
      role: payload.role,
      permissions: payload.permissions || [],
    };

    logger.debug('Optional JWT validated', {
      userId: req.user.id,
      role: req.user.role,
    });
  } catch (error) {
    // Log but don't throw - this is optional
    logger.debug('Optional JWT validation failed', {
      error: (error as Error).message,
    });
  }

  next();
}

/**
 * Generate JWT token for user
 */
function generateToken(userId: string, role: string, permissions: string[] = []): string {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: userId,
    role,
    permissions,
  };

  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: '24h',
    issuer: 'repotools-server',
    audience: 'repotools-client',
  });
}

/**
 * Verify and decode JWT token without throwing
 */
function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, config.JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
}

export {
  validateApiKey,
  validateJWT,
  requirePermission,
  requireRole,
  optionalJWT,
  generateToken,
  verifyToken,
  type AuthenticatedRequest,
  type JWTPayload,
};
