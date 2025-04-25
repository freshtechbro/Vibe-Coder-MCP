import { z } from 'zod';

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  algorithm: 'HS256' | 'HS384' | 'HS512';
}

const configSchema = z.object({
  secret: z.string(),
  expiresIn: z.string(),
  algorithm: z.enum(['HS256', 'HS384', 'HS512']),
});

export function generateJwtAuth(
  config: JwtConfig
): Array<{ path: string; content: string }> {
  const validatedConfig = configSchema.parse(config);

  return [
    {
      path: 'auth/jwt.ts',
      content: `
import jwt from 'jsonwebtoken';
import { JwtPayload } from './types';

const JWT_SECRET = '${validatedConfig.secret}';
const JWT_EXPIRES_IN = '${validatedConfig.expiresIn}';
const JWT_ALGORITHM = '${validatedConfig.algorithm}';

export function createToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: JWT_ALGORITHM
  });
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM]
    });
    return payload as JwtPayload;
  } catch (error) {
    throw new Error('Invalid token');
  }
}`,
    },
    {
      path: 'auth/middleware.ts',
      content: `
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './jwt';

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const user = await verifyToken(token);
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}`,
    },
    {
      path: 'auth/types.ts',
      content: `
export interface JwtPayload {
  id: string;
  email: string;
  role?: string;
  [key: string]: unknown;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}`,
    },
  ];
}
