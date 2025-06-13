/**
 * Rate limiting middleware for Repotools Lightweight Server
 * 
 * Implements sliding window rate limiting to prevent abuse and ensure
 * fair resource usage across clients.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger.js';
import { RateLimitError } from '@/middleware/errorHandler.js';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

interface RateLimitInfo {
  count: number;
  resetTime: number;
  requests: number[];
}

class RateLimiter {
  private store: Map<string, RateLimitInfo> = new Map();
  private config: Required<RateLimitConfig>;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      message: config.message || 'Too many requests, please try again later',
      skipSuccessfulRequests: config.skipSuccessfulRequests || false,
      skipFailedRequests: config.skipFailedRequests || false,
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
    };

    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  private defaultKeyGenerator(req: Request): string {
    // Use IP address as default key
    return req.ip || req.connection.remoteAddress || 'unknown';
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, info] of this.store.entries()) {
      if (info.resetTime < now) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Rate limiter cleaned up ${cleaned} expired entries`);
    }
  }

  private updateRequestCount(key: string): RateLimitInfo {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    let info = this.store.get(key);
    
    if (!info) {
      info = {
        count: 0,
        resetTime: now + this.config.windowMs,
        requests: [],
      };
    }

    // Remove requests outside the current window
    info.requests = info.requests.filter(timestamp => timestamp > windowStart);
    
    // Add current request
    info.requests.push(now);
    info.count = info.requests.length;
    
    // Update reset time if needed
    if (info.resetTime < now) {
      info.resetTime = now + this.config.windowMs;
    }

    this.store.set(key, info);
    return info;
  }

  public middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const key = this.config.keyGenerator(req);
      const info = this.updateRequestCount(key);

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': this.config.maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, this.config.maxRequests - info.count).toString(),
        'X-RateLimit-Reset': Math.ceil(info.resetTime / 1000).toString(),
        'X-RateLimit-Window': this.config.windowMs.toString(),
      });

      // Check if limit exceeded
      if (info.count > this.config.maxRequests) {
        logger.warn(`Rate limit exceeded for key: ${key}`, {
          count: info.count,
          limit: this.config.maxRequests,
          resetTime: new Date(info.resetTime).toISOString(),
        });

        // Add retry-after header
        const retryAfter = Math.ceil((info.resetTime - Date.now()) / 1000);
        res.set('Retry-After', retryAfter.toString());

        throw new RateLimitError(this.config.message);
      }

      // Log high usage
      if (info.count > this.config.maxRequests * 0.8) {
        logger.debug(`High rate limit usage for key: ${key}`, {
          count: info.count,
          limit: this.config.maxRequests,
          percentage: Math.round((info.count / this.config.maxRequests) * 100),
        });
      }

      next();
    };
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }

  // Get current stats for monitoring
  public getStats(): { totalKeys: number; totalRequests: number } {
    let totalRequests = 0;
    for (const info of this.store.values()) {
      totalRequests += info.count;
    }

    return {
      totalKeys: this.store.size,
      totalRequests,
    };
  }
}

// Create different rate limiters for different endpoints
const generalLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 1000, // 1000 requests per 15 minutes
});

const apiLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // 100 API requests per 15 minutes
});

const uploadLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10, // 10 uploads per hour
});

const taskLimiter = new RateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 5, // 5 task starts per 5 minutes
});

// Export middleware functions
const rateLimiter = generalLimiter.middleware();
const apiRateLimiter = apiLimiter.middleware();
const uploadRateLimiter = uploadLimiter.middleware();
const taskRateLimiter = taskLimiter.middleware();

// Cleanup on process exit
process.on('exit', () => {
  generalLimiter.destroy();
  apiLimiter.destroy();
  uploadLimiter.destroy();
  taskLimiter.destroy();
});

export {
  rateLimiter,
  apiRateLimiter,
  uploadRateLimiter,
  taskRateLimiter,
  RateLimiter,
};

