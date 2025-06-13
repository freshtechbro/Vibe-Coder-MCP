/**
 * System management API routes for Repotools Lightweight Server
 * 
 * Provides endpoints for system health, metrics, configuration,
 * and administrative functions.
 */

import { Router, Request, Response } from 'express';
import { cpus, totalmem, freemem, uptime, platform, arch } from 'os';
import { asyncHandler } from '@/middleware/errorHandler.js';
import { requirePermission } from '@/middleware/auth.js';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';

/**
 * Create system management routes
 */
export function createSystemRoutes(): Router {
  const router = Router();

  /**
   * GET /api/v1/system/info
   * Get basic system information
   */
  router.get('/info', asyncHandler(async (_req: Request, res: Response) => {
    try {
      const systemInfo = {
        server: {
          name: 'Repotools Lightweight Server',
          version: '1.0.0',
          environment: config.NODE_ENV,
          uptime: process.uptime(),
          startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        },
        platform: {
          os: platform(),
          arch: arch(),
          nodeVersion: process.version,
          cpuCount: cpus().length,
        },
        configuration: {
          port: config.PORT,
          host: config.HOST,
          workspaceRoot: config.WORKSPACE_ROOT,
          maxFileSize: config.MAX_FILE_SIZE,
          maxConcurrentTasks: config.MAX_CONCURRENT_TASKS,
          allowedExtensions: config.ALLOWED_EXTENSIONS.length,
        },
        timestamp: new Date().toISOString(),
      };

      res.json({
        success: true,
        data: { systemInfo },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'System info retrieval failed');
      throw error;
    }
  }));

  /**
   * GET /api/v1/system/health
   * Get detailed system health status
   */
  router.get('/health', asyncHandler(async (_req: Request, res: Response) => {
    try {
      const memoryUsage = process.memoryUsage();
      const systemMemory = {
        total: totalmem(),
        free: freemem(),
        used: totalmem() - freemem(),
      };

      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          process: {
            rss: memoryUsage.rss,
            heapTotal: memoryUsage.heapTotal,
            heapUsed: memoryUsage.heapUsed,
            external: memoryUsage.external,
            arrayBuffers: memoryUsage.arrayBuffers,
          },
          system: systemMemory,
          usage: {
            processPercent: (memoryUsage.rss / systemMemory.total) * 100,
            systemPercent: (systemMemory.used / systemMemory.total) * 100,
          },
        },
        cpu: {
          usage: process.cpuUsage(),
          loadAverage: require('os').loadavg(),
          cores: cpus().length,
        },
        process: {
          pid: process.pid,
          ppid: process.ppid,
          platform: process.platform,
          arch: process.arch,
          version: process.version,
        },
      };

      // Determine health status based on metrics
      const memoryPercent = health.memory.usage.processPercent;
      if (memoryPercent > 90) {
        health.status = 'critical';
      } else if (memoryPercent > 75) {
        health.status = 'warning';
      }

      res.json({
        success: true,
        data: { health },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Health check failed');
      throw error;
    }
  }));

  /**
   * GET /api/v1/system/metrics
   * Get system performance metrics
   */
  router.get('/metrics', asyncHandler(async (_req: Request, res: Response) => {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        uptime: {
          process: process.uptime(),
          system: uptime(),
        },
        memory: {
          process: process.memoryUsage(),
          system: {
            total: totalmem(),
            free: freemem(),
            used: totalmem() - freemem(),
          },
        },
        cpu: {
          usage: process.cpuUsage(),
          loadAverage: require('os').loadavg(),
          cores: cpus().map(cpu => ({
            model: cpu.model,
            speed: cpu.speed,
          })),
        },
        eventLoop: {
          delay: await new Promise<number>(resolve => {
            const start = process.hrtime.bigint();
            setImmediate(() => {
              const delta = process.hrtime.bigint() - start;
              resolve(Number(delta) / 1000000); // Convert to milliseconds
            });
          }),
        },
        gc: process.memoryUsage(),
      };

      res.json({
        success: true,
        data: { metrics },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Metrics retrieval failed');
      throw error;
    }
  }));

  /**
   * GET /api/v1/system/config
   * Get server configuration (admin only)
   */
  router.get('/config', requirePermission('admin'), asyncHandler(async (_req: Request, res: Response) => {
    try {
      const configuration = {
        server: {
          nodeEnv: config.NODE_ENV,
          port: config.PORT,
          host: config.HOST,
        },
        security: {
          corsOrigin: config.CORS_ORIGIN,
          corsCredentials: config.CORS_CREDENTIALS,
          // Don't expose actual secrets
          hasJwtSecret: !!config.JWT_SECRET,
          hasApiKey: !!config.API_KEY,
        },
        fileSystem: {
          workspaceRoot: config.WORKSPACE_ROOT,
          maxFileSize: config.MAX_FILE_SIZE,
          allowedExtensions: config.ALLOWED_EXTENSIONS,
        },
        tasks: {
          maxConcurrentTasks: config.MAX_CONCURRENT_TASKS,
          taskTimeout: config.TASK_TIMEOUT,
          cleanupInterval: config.CLEANUP_INTERVAL,
        },
        websocket: {
          wsPort: config.WS_PORT,
          heartbeatInterval: config.WS_HEARTBEAT_INTERVAL,
        },
        logging: {
          logLevel: config.LOG_LEVEL,
          logFile: config.LOG_FILE,
        },
        development: {
          debug: config.DEBUG,
          enableSwagger: config.ENABLE_SWAGGER,
          enableMetrics: config.ENABLE_METRICS,
        },
        externalServices: {
          hasOpenAiKey: !!config.OPENAI_API_KEY,
          hasAnthropicKey: !!config.ANTHROPIC_API_KEY,
          hasGithubToken: !!config.GITHUB_TOKEN,
          databaseUrl: config.DATABASE_URL,
          hasRedisUrl: !!config.REDIS_URL,
        },
      };

      res.json({
        success: true,
        data: { configuration },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Configuration retrieval failed');
      throw error;
    }
  }));

  /**
   * GET /api/v1/system/logs
   * Get recent log entries (admin only)
   */
  router.get('/logs', requirePermission('admin'), asyncHandler(async (req: Request, res: Response) => {
    try {
      const { lines = 100, level = 'info' } = req.query;
      
      // This is a simplified implementation
      // In production, you'd want to use a proper log aggregation system
      const logs = {
        message: 'Log retrieval not implemented in this demo',
        suggestion: 'Use external log aggregation tools like ELK stack or Grafana',
        parameters: {
          requestedLines: lines,
          requestedLevel: level,
        },
        timestamp: new Date().toISOString(),
      };

      res.json({
        success: true,
        data: { logs },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Log retrieval failed');
      throw error;
    }
  }));

  /**
   * POST /api/v1/system/gc
   * Force garbage collection (admin only)
   */
  router.post('/gc', requirePermission('admin'), asyncHandler(async (_req: Request, res: Response) => {
    try {
      const beforeMemory = process.memoryUsage();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      } else {
        return res.status(400).json({
          error: 'Garbage Collection Not Available',
          message: 'Node.js was not started with --expose-gc flag',
        });
      }

      const afterMemory = process.memoryUsage();
      
      const gcResult = {
        before: beforeMemory,
        after: afterMemory,
        freed: {
          rss: beforeMemory.rss - afterMemory.rss,
          heapTotal: beforeMemory.heapTotal - afterMemory.heapTotal,
          heapUsed: beforeMemory.heapUsed - afterMemory.heapUsed,
          external: beforeMemory.external - afterMemory.external,
        },
        timestamp: new Date().toISOString(),
      };

      logger.info('Manual garbage collection performed', gcResult);

      res.json({
        success: true,
        message: 'Garbage collection completed',
        data: { gcResult },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Garbage collection failed');
      throw error;
    }
  }));

  /**
   * GET /api/v1/system/env
   * Get environment information (admin only)
   */
  router.get('/env', requirePermission('admin'), asyncHandler(async (_req: Request, res: Response) => {
    try {
      // Filter out sensitive environment variables
      const sensitiveKeys = ['JWT_SECRET', 'API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GITHUB_TOKEN'];
      
      const filteredEnv = Object.entries(process.env)
        .filter(([key]) => !sensitiveKeys.some(sensitive => key.includes(sensitive)))
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {} as Record<string, string | undefined>);

      const envInfo = {
        nodeEnv: process.env.NODE_ENV,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        environment: filteredEnv,
        sensitiveKeysPresent: sensitiveKeys.filter(key => !!process.env[key]),
        timestamp: new Date().toISOString(),
      };

      res.json({
        success: true,
        data: { envInfo },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Environment info retrieval failed');
      throw error;
    }
  }));

  /**
   * POST /api/v1/system/shutdown
   * Graceful server shutdown (admin only)
   */
  router.post('/shutdown', requirePermission('admin'), asyncHandler(async (req: Request, res: Response) => {
    try {
      const { delay = 5000 } = req.body;

      logger.warn('Shutdown requested via API', {
        delay,
        requestedBy: (req as any).user?.id,
      });

      res.json({
        success: true,
        message: `Server will shutdown in ${delay}ms`,
        data: {
          delay,
          shutdownTime: new Date(Date.now() + delay).toISOString(),
        },
      });

      // Shutdown after delay
      setTimeout(() => {
        logger.info('Initiating graceful shutdown...');
        process.kill(process.pid, 'SIGTERM');
      }, delay);
    } catch (error) {
      logger.errorWithContext(error as Error, 'Shutdown request failed');
      throw error;
    }
  }));

  return router;
}
