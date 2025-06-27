import { AtomicTask, Epic, TaskStatus, TaskPriority, TaskType } from '../../types/task.js';
import { getStorageManager } from '../storage/storage-manager.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import { getIdGenerator } from '../../utils/id-generator.js';
import { FileOperationResult } from '../../utils/file-utils.js';
import { DataSanitizer, SanitizationResult } from '../../security/data-sanitizer.js';
import { ConcurrentAccessManager, LockAcquisitionResult } from '../../security/concurrent-access.js';
import logger from '../../../../logger.js';

/**
 * Task creation parameters
 */
export interface CreateTaskParams {
  title: string;
  description: string;
  projectId: string;
  epicId?: string; // Made optional - will be auto-resolved if not provided
  priority?: TaskPriority;
  type?: TaskType;
  estimatedHours?: number;
  filePaths?: string[];
  acceptanceCriteria?: string[];
  tags?: string[];
  assignedAgent?: string;
}

/**
 * Task update parameters
 */
export interface UpdateTaskParams {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: TaskType;
  estimatedHours?: number;
  actualHours?: number;
  filePaths?: string[];
  acceptanceCriteria?: string[];
  tags?: string[];
  assignedAgent?: string;
}

/**
 * Task query parameters
 */
export interface TaskQueryParams {
  projectId?: string;
  epicId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: TaskType;
  assignedAgent?: string;
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Epic creation parameters
 */
export interface CreateEpicParams {
  title: string;
  description: string;
  projectId: string;
  priority?: TaskPriority;
  estimatedHours?: number;
  tags?: string[];
}

/**
 * Task operations service
 */
export class TaskOperations {
  private static instance: TaskOperations;
  private accessManager: ConcurrentAccessManager;

  private constructor() {
    this.accessManager = ConcurrentAccessManager.getInstance({
      enableLockAuditTrail: true,
      enableDeadlockDetection: true,
      defaultLockTimeout: 30000, // 30 seconds
      maxLockTimeout: 300000, // 5 minutes
      lockCleanupInterval: 60000 // 1 minute
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TaskOperations {
    if (!TaskOperations.instance) {
      TaskOperations.instance = new TaskOperations();
    }
    return TaskOperations.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    TaskOperations.instance = undefined as any;
  }

  /**
   * Create a new atomic task
   */
  async createTask(params: CreateTaskParams, createdBy: string = 'system'): Promise<FileOperationResult<AtomicTask>> {
    // Acquire resource locks for task creation
    const lockIds: string[] = [];

    try {
      logger.info({ taskTitle: params.title, projectId: params.projectId, createdBy }, 'Creating new task');

      // Acquire project lock to prevent concurrent modifications
      const projectLockResult = await this.accessManager.acquireLock(
        `project:${params.projectId}`,
        createdBy,
        'write',
        {
          timeout: 30000,
          metadata: {
            operation: 'create_task',
            taskTitle: params.title
          }
        }
      );

      if (!projectLockResult.success) {
        return {
          success: false,
          error: `Failed to acquire project lock: ${projectLockResult.error}`,
          metadata: {
            filePath: 'task-operations',
            operation: 'create_task',
            timestamp: new Date()
          }
        };
      }
      lockIds.push(projectLockResult.lock!.id);

      // Resolve epic ID if not provided
      let resolvedEpicId = params.epicId;
      if (!resolvedEpicId) {
        logger.debug({ taskTitle: params.title, projectId: params.projectId }, 'Epic ID not provided, resolving automatically');

        const { getEpicContextResolver } = await import('../../services/epic-context-resolver.js');
        const epicResolver = getEpicContextResolver();

        const epicContext = await epicResolver.resolveEpicContext({
          projectId: params.projectId,
          taskContext: {
            title: params.title,
            description: params.description,
            type: params.type || 'development',
            tags: params.tags || []
          }
        });

        resolvedEpicId = epicContext.epicId;
        logger.debug({ resolvedEpicId, source: epicContext.source }, 'Epic ID resolved automatically');
      }

      // Acquire epic lock to prevent concurrent modifications
      const epicLockResult = await this.accessManager.acquireLock(
        `epic:${resolvedEpicId}`,
        createdBy,
        'write',
        {
          timeout: 30000,
          metadata: {
            operation: 'create_task',
            taskTitle: params.title
          }
        }
      );

      if (!epicLockResult.success) {
        // Release project lock
        await this.accessManager.releaseLock(lockIds[0]);
        return {
          success: false,
          error: `Failed to acquire epic lock: ${epicLockResult.error}`,
          metadata: {
            filePath: 'task-operations',
            operation: 'create_task',
            timestamp: new Date()
          }
        };
      }
      lockIds.push(epicLockResult.lock!.id);

      // Sanitize input parameters with resolved epic ID
      const dataSanitizer = DataSanitizer.getInstance();
      const paramsWithEpicId = {
        ...params,
        epicId: resolvedEpicId
      };
      const sanitizationResult = await dataSanitizer.sanitizeInput(paramsWithEpicId);

      if (!sanitizationResult.success) {
        logger.error({
          violations: sanitizationResult.violations,
          taskTitle: params.title
        }, 'Task creation input sanitization failed');

        return {
          success: false,
          error: `Input sanitization failed: ${sanitizationResult.violations.map((v: any) => v.description).join(', ')}`,
          metadata: {
            filePath: 'task-operations',
            operation: 'create_task',
            timestamp: new Date()
          } as any
        };
      }

      // Use sanitized parameters
      const sanitizedParams = sanitizationResult.sanitizedData as CreateTaskParams;

      // Validate input parameters
      const validationResult = this.validateCreateTaskParams(sanitizedParams);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Task creation validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: 'task-operations',
            operation: 'create_task',
            timestamp: new Date()
          }
        };
      }

      // Verify project and epic exist
      const storageManager = await getStorageManager();

      const projectExists = await storageManager.projectExists(sanitizedParams.projectId);
      if (!projectExists) {
        return {
          success: false,
          error: `Project ${sanitizedParams.projectId} not found`,
          metadata: {
            filePath: 'task-operations',
            operation: 'create_task',
            timestamp: new Date()
          }
        };
      }

      // Validate and ensure epic exists using epic validator
      const { validateEpicForTask } = await import('../../utils/epic-validator.js');
      const epicValidationResult = await validateEpicForTask({
        epicId: sanitizedParams.epicId,
        projectId: sanitizedParams.projectId,
        title: sanitizedParams.title,
        description: sanitizedParams.description,
        type: sanitizedParams.type,
        tags: sanitizedParams.tags
      });

      if (!epicValidationResult.valid) {
        return {
          success: false,
          error: `Epic validation failed: ${epicValidationResult.error || 'Unknown error'}`,
          metadata: {
            filePath: 'task-operations',
            operation: 'create_task',
            timestamp: new Date()
          }
        };
      }

      // Update epic ID if it was resolved to a different one
      if (epicValidationResult.epicId !== sanitizedParams.epicId) {
        logger.info({
          originalEpicId: sanitizedParams.epicId,
          resolvedEpicId: epicValidationResult.epicId,
          created: epicValidationResult.created
        }, 'Epic ID resolved during validation');
        sanitizedParams.epicId = epicValidationResult.epicId;
      }

      // Generate unique task ID
      const idGenerator = getIdGenerator();
      const idResult = await idGenerator.generateTaskId(sanitizedParams.projectId, sanitizedParams.epicId);

      if (!idResult.success) {
        return {
          success: false,
          error: `Failed to generate task ID: ${idResult.error}`,
          metadata: {
            filePath: 'task-operations',
            operation: 'create_task',
            timestamp: new Date()
          }
        };
      }

      const taskId = idResult.id!;

      // Load configuration for defaults
      const config = await getVibeTaskManagerConfig();
      if (!config) {
        return {
          success: false,
          error: 'Failed to load task manager configuration',
          metadata: {
            filePath: 'task-operations',
            operation: 'create_task',
            timestamp: new Date()
          }
        };
      }

      // Create task object with defaults using sanitized parameters
      const task: AtomicTask = {
        id: taskId,
        title: sanitizedParams.title,
        description: sanitizedParams.description,
        status: 'pending',
        priority: sanitizedParams.priority || 'medium',
        type: sanitizedParams.type || 'development',
        estimatedHours: sanitizedParams.estimatedHours || 4,
        epicId: sanitizedParams.epicId,
        projectId: sanitizedParams.projectId,
        dependencies: [],
        dependents: [],
        filePaths: sanitizedParams.filePaths || [],
        acceptanceCriteria: sanitizedParams.acceptanceCriteria || [],
        testingRequirements: {
          unitTests: [],
          integrationTests: [],
          performanceTests: [],
          coverageTarget: config.taskManager.performanceTargets.minTestCoverage
        },
        performanceCriteria: {
          responseTime: `<${config.taskManager.performanceTargets.maxResponseTime}ms`,
          memoryUsage: `<${config.taskManager.performanceTargets.maxMemoryUsage}MB`
        },
        qualityCriteria: {
          codeQuality: ['TypeScript strict mode', 'ESLint compliance'],
          documentation: ['JSDoc comments'],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: {
          compatibility: ['Existing MCP patterns'],
          patterns: ['Tool registration pattern']
        },
        validationMethods: {
          automated: ['Unit tests', 'Integration tests'],
          manual: ['Code review']
        },
        assignedAgent: sanitizedParams.assignedAgent,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy,
        tags: sanitizedParams.tags || [],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy,
          tags: sanitizedParams.tags || []
        }
      };

      // Save task to storage
      const createResult = await storageManager.createTask(task);

      if (!createResult.success) {
        return {
          success: false,
          error: `Failed to save task: ${createResult.error}`,
          metadata: createResult.metadata
        };
      }

      // Add task to epic's taskIds array for proper relationship tracking
      try {
        const { getEpicService } = await import('../../services/epic-service.js');
        const epicService = getEpicService();

        const addTaskResult = await epicService.addTaskToEpic(sanitizedParams.epicId, taskId);
        if (!addTaskResult.success) {
          logger.warn({
            taskId,
            epicId: sanitizedParams.epicId,
            error: addTaskResult.error
          }, 'Failed to add task to epic taskIds array');
          // Don't fail task creation if epic update fails - task is still valid
        } else {
          logger.debug({ taskId, epicId: sanitizedParams.epicId }, 'Task added to epic taskIds array');
        }
      } catch (error) {
        logger.warn({
          err: error,
          taskId,
          epicId: sanitizedParams.epicId
        }, 'Error updating epic with new task');
        // Don't fail task creation if epic update fails
      }

      logger.info({ taskId, taskTitle: params.title }, 'Task created successfully');

      return {
        success: true,
        data: createResult.data!,
        metadata: {
          filePath: 'task-operations',
          operation: 'create_task',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, taskTitle: params.title }, 'Failed to create task');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'create_task',
          timestamp: new Date()
        }
      };
    } finally {
      // Release all acquired locks
      for (const lockId of lockIds) {
        try {
          await this.accessManager.releaseLock(lockId);
        } catch (error) {
          logger.error({ err: error, lockId }, 'Failed to release lock during task creation cleanup');
        }
      }
    }
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<FileOperationResult<AtomicTask>> {
    try {
      logger.debug({ taskId }, 'Getting task');

      const storageManager = await getStorageManager();
      return await storageManager.getTask(taskId);

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to get task');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'get_task',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Update task
   */
  async updateTask(taskId: string, params: UpdateTaskParams, updatedBy: string = 'system'): Promise<FileOperationResult<AtomicTask>> {
    try {
      logger.info({ taskId, updates: Object.keys(params), updatedBy }, 'Updating task');

      // Validate update parameters
      const validationResult = this.validateUpdateTaskParams(params);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Task update validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: 'task-operations',
            operation: 'update_task',
            timestamp: new Date()
          }
        };
      }

      // Get existing task to preserve metadata
      const storageManager = await getStorageManager();
      const existingResult = await storageManager.getTask(taskId);
      if (!existingResult.success) {
        return {
          success: false,
          error: `Task not found: ${existingResult.error}`,
          metadata: existingResult.metadata
        };
      }

      const existingTask = existingResult.data!;

      // Prepare update object with proper typing
      const updates: any = {
        ...params,
        metadata: {
          ...existingTask.metadata,
          updatedAt: new Date(),
          ...(params.tags && { tags: params.tags })
        }
      };

      // Update task in storage
      const updateResult = await storageManager.updateTask(taskId, updates);

      if (!updateResult.success) {
        return {
          success: false,
          error: `Failed to update task: ${updateResult.error}`,
          metadata: updateResult.metadata
        };
      }

      logger.info({ taskId }, 'Task updated successfully');

      return {
        success: true,
        data: updateResult.data!,
        metadata: {
          filePath: 'task-operations',
          operation: 'update_task',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to update task');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'update_task',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Delete task
   */
  async deleteTask(taskId: string, deletedBy: string = 'system'): Promise<FileOperationResult<void>> {
    try {
      logger.info({ taskId, deletedBy }, 'Deleting task');

      // Check if task exists
      const storageManager = await getStorageManager();
      const taskExists = await storageManager.taskExists(taskId);

      if (!taskExists) {
        return {
          success: false,
          error: `Task ${taskId} not found`,
          metadata: {
            filePath: 'task-operations',
            operation: 'delete_task',
            timestamp: new Date()
          }
        };
      }

      // Delete task (this will cascade to dependencies)
      const deleteResult = await storageManager.deleteTask(taskId);

      if (!deleteResult.success) {
        return {
          success: false,
          error: `Failed to delete task: ${deleteResult.error}`,
          metadata: deleteResult.metadata
        };
      }

      logger.info({ taskId }, 'Task deleted successfully');

      return {
        success: true,
        metadata: {
          filePath: 'task-operations',
          operation: 'delete_task',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to delete task');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'delete_task',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * List tasks with optional filtering
   */
  async listTasks(query?: TaskQueryParams): Promise<FileOperationResult<AtomicTask[]>> {
    try {
      logger.debug({ query }, 'Listing tasks');

      const storageManager = await getStorageManager();
      let result: FileOperationResult<AtomicTask[]>;

      // Apply basic filtering
      if (query?.status && query?.projectId) {
        result = await storageManager.getTasksByStatus(query.status, query.projectId);
      } else if (query?.priority && query?.projectId) {
        result = await storageManager.getTasksByPriority(query.priority, query.projectId);
      } else {
        result = await storageManager.listTasks(query?.projectId, query?.epicId);
      }

      if (!result.success) {
        return result;
      }

      let tasks = result.data!;

      // Apply additional filters
      if (query) {
        tasks = this.applyTaskFilters(tasks, query);
      }

      return {
        success: true,
        data: tasks,
        metadata: {
          filePath: 'task-operations',
          operation: 'list_tasks',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, query }, 'Failed to list tasks');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'list_tasks',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Search tasks by query string
   */
  async searchTasks(searchQuery: string, query?: TaskQueryParams): Promise<FileOperationResult<AtomicTask[]>> {
    try {
      logger.debug({ searchQuery, query }, 'Searching tasks');

      const storageManager = await getStorageManager();
      const searchResult = await storageManager.searchTasks(searchQuery, query?.projectId);

      if (!searchResult.success) {
        return searchResult;
      }

      let tasks = searchResult.data!;

      // Apply additional filters
      if (query) {
        tasks = this.applyTaskFilters(tasks, query);
      }

      return {
        success: true,
        data: tasks,
        metadata: {
          filePath: 'task-operations',
          operation: 'search_tasks',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, searchQuery }, 'Failed to search tasks');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'search_tasks',
          timestamp: new Date()
        }
      };
    }
  }



  /**
   * Validate task creation parameters
   */
  private validateCreateTaskParams(params: CreateTaskParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!params.title || typeof params.title !== 'string' || params.title.trim().length === 0) {
      errors.push('Task title is required and must be a non-empty string');
    }

    if (params.title && params.title.length > 200) {
      errors.push('Task title must be 200 characters or less');
    }

    if (!params.description || typeof params.description !== 'string' || params.description.trim().length === 0) {
      errors.push('Task description is required and must be a non-empty string');
    }

    if (!params.projectId || typeof params.projectId !== 'string') {
      errors.push('Project ID is required and must be a string');
    }

    if (!params.epicId || typeof params.epicId !== 'string') {
      errors.push('Epic ID is required and must be a string');
    }

    if (params.estimatedHours !== undefined && (typeof params.estimatedHours !== 'number' || params.estimatedHours < 0)) {
      errors.push('Estimated hours must be a non-negative number');
    }

    if (params.filePaths && !Array.isArray(params.filePaths)) {
      errors.push('File paths must be an array of strings');
    }

    if (params.acceptanceCriteria && !Array.isArray(params.acceptanceCriteria)) {
      errors.push('Acceptance criteria must be an array of strings');
    }

    if (params.tags && !Array.isArray(params.tags)) {
      errors.push('Tags must be an array of strings');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate task update parameters
   */
  private validateUpdateTaskParams(params: UpdateTaskParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (params.title !== undefined) {
      if (typeof params.title !== 'string' || params.title.trim().length === 0) {
        errors.push('Task title must be a non-empty string');
      }
      if (params.title.length > 200) {
        errors.push('Task title must be 200 characters or less');
      }
    }

    if (params.description !== undefined) {
      if (typeof params.description !== 'string' || params.description.trim().length === 0) {
        errors.push('Task description must be a non-empty string');
      }
    }

    if (params.status !== undefined) {
      if (!['pending', 'in_progress', 'completed', 'blocked', 'cancelled'].includes(params.status)) {
        errors.push('Status must be one of: pending, in_progress, completed, blocked, cancelled');
      }
    }

    if (params.priority !== undefined) {
      if (!['low', 'medium', 'high', 'critical'].includes(params.priority)) {
        errors.push('Priority must be one of: low, medium, high, critical');
      }
    }

    if (params.estimatedHours !== undefined && (typeof params.estimatedHours !== 'number' || params.estimatedHours < 0)) {
      errors.push('Estimated hours must be a non-negative number');
    }

    if (params.actualHours !== undefined && (typeof params.actualHours !== 'number' || params.actualHours < 0)) {
      errors.push('Actual hours must be a non-negative number');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Apply filters to task list
   */
  private applyTaskFilters(tasks: AtomicTask[], query: TaskQueryParams): AtomicTask[] {
    let filtered = tasks;

    // Filter by type
    if (query.type) {
      filtered = filtered.filter(task => task.type === query.type);
    }

    // Filter by assigned agent
    if (query.assignedAgent) {
      filtered = filtered.filter(task => task.assignedAgent === query.assignedAgent);
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      filtered = filtered.filter(task =>
        query.tags!.some(tag => task.metadata.tags.includes(tag))
      );
    }

    // Filter by creation date range
    if (query.createdAfter) {
      filtered = filtered.filter(task =>
        task.metadata.createdAt >= query.createdAfter!
      );
    }

    if (query.createdBefore) {
      filtered = filtered.filter(task =>
        task.metadata.createdAt <= query.createdBefore!
      );
    }

    // Apply pagination
    if (query.offset) {
      filtered = filtered.slice(query.offset);
    }

    if (query.limit) {
      filtered = filtered.slice(0, query.limit);
    }

    return filtered;
  }

  /**
   * Update task status only
   */
  async updateTaskStatus(taskId: string, status: TaskStatus, updatedBy: string = 'system'): Promise<FileOperationResult<AtomicTask>> {
    try {
      logger.info({ taskId, status, updatedBy }, 'Updating task status');

      // Validate status
      const validStatuses: TaskStatus[] = ['pending', 'in_progress', 'completed', 'failed', 'blocked'];
      if (!validStatuses.includes(status)) {
        return {
          success: false,
          error: `Invalid task status: ${status}. Valid statuses are: ${validStatuses.join(', ')}`,
          metadata: {
            filePath: 'task-operations',
            operation: 'update_task_status',
            timestamp: new Date()
          }
        };
      }

      // Use the existing updateTask method with just status
      const updateParams: UpdateTaskParams = { status };
      return await this.updateTask(taskId, updateParams, updatedBy);

    } catch (error) {
      logger.error({ err: error, taskId, status }, 'Failed to update task status');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'update_task_status',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Update task metadata
   */
  async updateTaskMetadata(taskId: string, metadata: Record<string, any>, updatedBy: string = 'system'): Promise<FileOperationResult<AtomicTask>> {
    try {
      logger.info({ taskId, metadataKeys: Object.keys(metadata), updatedBy }, 'Updating task metadata');

      // Get existing task to merge metadata
      const storageManager = await getStorageManager();
      const existingResult = await storageManager.getTask(taskId);
      if (!existingResult.success) {
        return {
          success: false,
          error: `Task not found: ${existingResult.error}`,
          metadata: existingResult.metadata
        };
      }

      const existingTask = existingResult.data!;

      // Merge new metadata with existing metadata
      const mergedMetadata = {
        ...existingTask.metadata,
        ...metadata,
        updatedAt: new Date(),
        updatedBy
      };

      // Prepare update object with merged metadata
      const updates: any = {
        metadata: mergedMetadata
      };

      // Update task in storage
      const updateResult = await storageManager.updateTask(taskId, updates);

      if (!updateResult.success) {
        return {
          success: false,
          error: `Failed to update task metadata: ${updateResult.error}`,
          metadata: updateResult.metadata
        };
      }

      logger.info({ taskId }, 'Task metadata updated successfully');

      return {
        success: true,
        data: updateResult.data!,
        metadata: {
          filePath: 'task-operations',
          operation: 'update_task_metadata',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to update task metadata');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'update_task_metadata',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<FileOperationResult<TaskStatus>> {
    try {
      logger.debug({ taskId }, 'Getting task status');

      const taskResult = await this.getTask(taskId);
      if (!taskResult.success) {
        return {
          success: false,
          error: taskResult.error,
          metadata: taskResult.metadata
        };
      }

      return {
        success: true,
        data: taskResult.data!.status,
        metadata: {
          filePath: 'task-operations',
          operation: 'get_task_status',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to get task status');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'get_task_status',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get task metadata
   */
  async getTaskMetadata(taskId: string): Promise<FileOperationResult<Record<string, any>>> {
    try {
      logger.debug({ taskId }, 'Getting task metadata');

      const taskResult = await this.getTask(taskId);
      if (!taskResult.success) {
        return {
          success: false,
          error: taskResult.error,
          metadata: taskResult.metadata
        };
      }

      return {
        success: true,
        data: taskResult.data!.metadata || {},
        metadata: {
          filePath: 'task-operations',
          operation: 'get_task_metadata',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to get task metadata');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'get_task_metadata',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Add task tags
   */
  async addTaskTags(taskId: string, tags: string[], updatedBy: string = 'system'): Promise<FileOperationResult<AtomicTask>> {
    try {
      logger.info({ taskId, tags, updatedBy }, 'Adding task tags');

      // Get existing task
      const taskResult = await this.getTask(taskId);
      if (!taskResult.success) {
        return {
          success: false,
          error: taskResult.error,
          metadata: taskResult.metadata
        };
      }

      const existingTask = taskResult.data!;
      const existingTags = existingTask.tags || [];

      // Merge tags (remove duplicates)
      const mergedTags = [...new Set([...existingTags, ...tags])];

      // Update task with new tags
      const updateParams: UpdateTaskParams = { tags: mergedTags };
      return await this.updateTask(taskId, updateParams, updatedBy);

    } catch (error) {
      logger.error({ err: error, taskId, tags }, 'Failed to add task tags');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'add_task_tags',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Remove task tags
   */
  async removeTaskTags(taskId: string, tags: string[], updatedBy: string = 'system'): Promise<FileOperationResult<AtomicTask>> {
    try {
      logger.info({ taskId, tags, updatedBy }, 'Removing task tags');

      // Get existing task
      const taskResult = await this.getTask(taskId);
      if (!taskResult.success) {
        return {
          success: false,
          error: taskResult.error,
          metadata: taskResult.metadata
        };
      }

      const existingTask = taskResult.data!;
      const existingTags = existingTask.tags || [];

      // Remove specified tags
      const filteredTags = existingTags.filter(tag => !tags.includes(tag));

      // Update task with filtered tags
      const updateParams: UpdateTaskParams = { tags: filteredTags };
      return await this.updateTask(taskId, updateParams, updatedBy);

    } catch (error) {
      logger.error({ err: error, taskId, tags }, 'Failed to remove task tags');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'remove_task_tags',
          timestamp: new Date()
        }
      };
    }
  }
}

/**
 * Convenience function to get task operations instance
 */
export function getTaskOperations(): TaskOperations {
  return TaskOperations.getInstance();
}
