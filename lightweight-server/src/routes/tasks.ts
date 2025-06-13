/**
 * Task management API routes for Repotools Lightweight Server
 * 
 * Provides REST endpoints for task creation, management, and monitoring.
 * Integrates with TaskManager and WebSocket services.
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { asyncHandler } from '@/middleware/errorHandler.js';
import { taskRateLimiter } from '@/middleware/rateLimiter.js';
import { logger } from '@/utils/logger.js';
import { TaskManager, Task } from '@/services/taskManager.js';
import { WebSocketManager } from '@/services/websocket.js';

// Validation schemas
const createTaskSchema = Joi.object({
  type: Joi.string().valid('code-map-generator', 'context-curator', 'research-manager', 'custom').required(),
  input: Joi.object().required(),
  options: Joi.object({
    priority: Joi.number().integer().min(1).max(10).default(5),
    timeout: Joi.number().integer().min(1000).max(600000).default(300000), // 5 minutes max
    maxRetries: Joi.number().integer().min(0).max(5).default(3),
  }).default({}),
});

const taskControlSchema = Joi.object({
  action: Joi.string().valid('pause', 'resume', 'cancel').required(),
});

const queryTasksSchema = Joi.object({
  status: Joi.string().valid('pending', 'running', 'completed', 'failed', 'paused', 'cancelled').optional(),
  type: Joi.string().valid('code-map-generator', 'context-curator', 'research-manager', 'custom').optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('createdAt', 'startedAt', 'completedAt', 'priority').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

/**
 * Create task management routes
 */
export function createTaskRoutes(taskManager: TaskManager, _wsManager: WebSocketManager): Router {
  const router = Router();

  /**
   * POST /api/v1/tasks
   * Create a new task
   */
  router.post('/', taskRateLimiter, asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = createTaskSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
        details: error.details,
      });
    }

    const { type, input, options } = value;
    const clientId = req.headers['x-client-id'] as string;

    try {
      const taskId = await taskManager.createTask(type, input, {
        ...options,
        clientId,
      });

      const task = taskManager.getTask(taskId);

      logger.info(`Task created: ${taskId}`, {
        type,
        clientId,
        priority: options.priority,
      });

      res.status(201).json({
        success: true,
        data: {
          taskId,
          task,
        },
        message: 'Task created successfully',
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Task creation failed', {
        type,
        clientId,
      });
      throw error;
    }
  }));

  /**
   * GET /api/v1/tasks
   * List tasks with filtering and pagination
   */
  router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = queryTasksSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { status, type, limit, offset, sortBy, sortOrder } = value;

    try {
      let tasks = taskManager.getAllTasks();

      // Apply filters
      if (status) {
        tasks = tasks.filter(task => task.status === status);
      }
      if (type) {
        tasks = tasks.filter(task => task.type === type);
      }

      // Sort tasks
      tasks.sort((a, b) => {
        const aValue = a[sortBy as keyof Task] as number;
        const bValue = b[sortBy as keyof Task] as number;
        
        if (sortOrder === 'asc') {
          return aValue - bValue;
        } else {
          return bValue - aValue;
        }
      });

      // Apply pagination
      const total = tasks.length;
      const paginatedTasks = tasks.slice(offset, offset + limit);

      res.json({
        success: true,
        data: {
          tasks: paginatedTasks,
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total,
          },
        },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Task listing failed');
      throw error;
    }
  }));

  /**
   * GET /api/v1/tasks/:taskId
   * Get specific task details
   */
  router.get('/:taskId', asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params;

    const task = taskManager.getTask(taskId);
    if (!task) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Task not found',
      });
    }

    res.json({
      success: true,
      data: { task },
    });
  }));

  /**
   * POST /api/v1/tasks/:taskId/control
   * Control task execution (pause, resume, cancel)
   */
  router.post('/:taskId/control', asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const { error, value } = taskControlSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { action } = value;

    const task = taskManager.getTask(taskId);
    if (!task) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Task not found',
      });
    }

    try {
      let success = false;
      let message = '';

      switch (action) {
        case 'pause':
          success = await taskManager.pauseTask(taskId);
          message = success ? 'Task paused successfully' : 'Task could not be paused';
          break;
        
        case 'resume':
          success = await taskManager.resumeTask(taskId);
          message = success ? 'Task resumed successfully' : 'Task could not be resumed';
          break;
        
        case 'cancel':
          success = await taskManager.cancelTask(taskId);
          message = success ? 'Task cancelled successfully' : 'Task could not be cancelled';
          break;
      }

      if (!success) {
        return res.status(400).json({
          error: 'Operation Failed',
          message,
        });
      }

      logger.info(`Task ${action}: ${taskId}`);

      res.json({
        success: true,
        message,
        data: {
          taskId,
          action,
          task: taskManager.getTask(taskId),
        },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, `Task ${action} failed`, { taskId });
      throw error;
    }
  }));

  /**
   * DELETE /api/v1/tasks/:taskId
   * Cancel and remove a task
   */
  router.delete('/:taskId', asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params;

    const task = taskManager.getTask(taskId);
    if (!task) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Task not found',
      });
    }

    try {
      const success = await taskManager.cancelTask(taskId);
      
      if (!success) {
        return res.status(400).json({
          error: 'Operation Failed',
          message: 'Task could not be cancelled',
        });
      }

      logger.info(`Task deleted: ${taskId}`);

      res.json({
        success: true,
        message: 'Task cancelled and removed successfully',
        data: { taskId },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Task deletion failed', { taskId });
      throw error;
    }
  }));

  /**
   * GET /api/v1/tasks/queue/status
   * Get queue status and statistics
   */
  router.get('/queue/status', asyncHandler(async (_req: Request, res: Response) => {
    try {
      const queueStatus = taskManager.getQueueStatus();
      
      res.json({
        success: true,
        data: {
          queue: queueStatus,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Queue status retrieval failed');
      throw error;
    }
  }));

  /**
   * POST /api/v1/tasks/bulk/cancel
   * Cancel multiple tasks
   */
  router.post('/bulk/cancel', asyncHandler(async (req: Request, res: Response) => {
    const { taskIds } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'taskIds must be a non-empty array',
      });
    }

    if (taskIds.length > 50) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Cannot cancel more than 50 tasks at once',
      });
    }

    try {
      const results = await Promise.allSettled(
        taskIds.map(taskId => taskManager.cancelTask(taskId))
      );

      const successful = results.filter(result => 
        result.status === 'fulfilled' && result.value
      ).length;

      const failed = results.length - successful;

      logger.info(`Bulk task cancellation: ${successful} successful, ${failed} failed`);

      res.json({
        success: true,
        message: `Cancelled ${successful} tasks, ${failed} failed`,
        data: {
          successful,
          failed,
          total: taskIds.length,
        },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Bulk task cancellation failed');
      throw error;
    }
  }));

  /**
   * GET /api/v1/tasks/types
   * Get available task types and their descriptions
   */
  router.get('/types', asyncHandler(async (_req: Request, res: Response) => {
    const taskTypes = [
      {
        type: 'code-map-generator',
        name: 'Code Map Generator',
        description: 'Generate semantic code maps and dependency analysis',
        estimatedDuration: '30-120 seconds',
        inputSchema: {
          repositoryPath: 'string (required)',
          options: {
            includeTests: 'boolean (optional)',
            maxDepth: 'number (optional)',
            excludePatterns: 'array of strings (optional)',
          },
        },
      },
      {
        type: 'context-curator',
        name: 'Context Curator',
        description: 'Curate and organize project context for AI assistance',
        estimatedDuration: '20-90 seconds',
        inputSchema: {
          repositoryPath: 'string (required)',
          contextType: 'string (optional): full|summary|focused',
          focusAreas: 'array of strings (optional)',
        },
      },
      {
        type: 'research-manager',
        name: 'Research Manager',
        description: 'Manage and organize research tasks and findings',
        estimatedDuration: '10-60 seconds',
        inputSchema: {
          query: 'string (required)',
          sources: 'array of strings (optional)',
          maxResults: 'number (optional)',
        },
      },
      {
        type: 'custom',
        name: 'Custom Task',
        description: 'Execute custom processing tasks',
        estimatedDuration: 'Variable',
        inputSchema: {
          command: 'string (required)',
          parameters: 'object (optional)',
        },
      },
    ];

    res.json({
      success: true,
      data: { taskTypes },
    });
  }));

  return router;
}
