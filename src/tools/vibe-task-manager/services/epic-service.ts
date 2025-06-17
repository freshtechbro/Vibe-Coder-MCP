import { Epic, AtomicTask, TaskStatus, TaskPriority } from '../types/task.js';
import { getStorageManager } from '../core/storage/storage-manager.js';
import { getTaskOperations } from '../core/operations/task-operations.js';
import { getIdGenerator } from '../utils/id-generator.js';
import { FileOperationResult } from '../utils/file-utils.js';
import { InitializationMonitor } from '../../../utils/initialization-monitor.js';
import logger from '../../../logger.js';

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
  dependencies?: string[];
}

/**
 * Epic update parameters
 */
export interface UpdateEpicParams {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  estimatedHours?: number;
  tags?: string[];
  dependencies?: string[];
}

/**
 * Epic query parameters
 */
export interface EpicQueryParams {
  projectId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Epic progress information
 */
export interface EpicProgress {
  epicId: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  blockedTasks: number;
  progressPercentage: number;
  estimatedHours: number;
  actualHours: number;
  remainingHours: number;
}

/**
 * Epic service for managing epic-level task organization
 */
export class EpicService {
  private static instance: EpicService;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): EpicService {
    if (!EpicService.instance) {
      const monitor = InitializationMonitor.getInstance();
      monitor.startServiceInitialization('EpicService', [
        'StorageManager',
        'TaskOperations',
        'IdGenerator'
      ]);

      try {
        monitor.startPhase('EpicService', 'constructor');
        EpicService.instance = new EpicService();
        monitor.endPhase('EpicService', 'constructor');

        monitor.endServiceInitialization('EpicService');
      } catch (error) {
        monitor.endPhase('EpicService', 'constructor', error as Error);
        monitor.endServiceInitialization('EpicService', error as Error);
        throw error;
      }
    }
    return EpicService.instance;
  }

  /**
   * Create a new epic
   */
  async createEpic(params: CreateEpicParams, createdBy: string = 'system'): Promise<FileOperationResult<Epic>> {
    try {
      logger.info({ epicTitle: params.title, projectId: params.projectId, createdBy }, 'Creating new epic');

      // Validate input parameters
      const validationResult = this.validateCreateEpicParams(params);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Epic creation validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: 'epic-service',
            operation: 'create_epic',
            timestamp: new Date()
          }
        };
      }

      // Verify project exists
      const storageManager = await getStorageManager();
      const projectExists = await storageManager.projectExists(params.projectId);
      if (!projectExists) {
        return {
          success: false,
          error: `Project ${params.projectId} not found`,
          metadata: {
            filePath: 'epic-service',
            operation: 'create_epic',
            timestamp: new Date()
          }
        };
      }

      // Generate unique epic ID
      const idGenerator = getIdGenerator();
      const idResult = await idGenerator.generateEpicId(params.projectId);

      if (!idResult.success) {
        return {
          success: false,
          error: `Failed to generate epic ID: ${idResult.error}`,
          metadata: {
            filePath: 'epic-service',
            operation: 'create_epic',
            timestamp: new Date()
          }
        };
      }

      const epicId = idResult.id!;

      // Create epic object
      const epic: Epic = {
        id: epicId,
        title: params.title,
        description: params.description,
        status: 'pending',
        priority: params.priority || 'medium',
        projectId: params.projectId,
        estimatedHours: params.estimatedHours || 40,
        taskIds: [],
        dependencies: params.dependencies || [],
        dependents: [],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy,
          tags: params.tags || []
        }
      };

      // Save epic to storage
      const createResult = await storageManager.createEpic(epic);

      if (!createResult.success) {
        return {
          success: false,
          error: `Failed to save epic: ${createResult.error}`,
          metadata: createResult.metadata
        };
      }

      logger.info({ epicId, epicTitle: params.title }, 'Epic created successfully');

      return {
        success: true,
        data: createResult.data!,
        metadata: {
          filePath: 'epic-service',
          operation: 'create_epic',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, epicTitle: params.title }, 'Failed to create epic');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'epic-service',
          operation: 'create_epic',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get epic by ID
   */
  async getEpic(epicId: string): Promise<FileOperationResult<Epic>> {
    try {
      logger.debug({ epicId }, 'Getting epic');

      const storageManager = await getStorageManager();
      return await storageManager.getEpic(epicId);

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to get epic');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'epic-service',
          operation: 'get_epic',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Update epic
   */
  async updateEpic(epicId: string, params: UpdateEpicParams, updatedBy: string = 'system'): Promise<FileOperationResult<Epic>> {
    try {
      logger.info({ epicId, updates: Object.keys(params), updatedBy }, 'Updating epic');

      // Validate update parameters
      const validationResult = this.validateUpdateEpicParams(params);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Epic update validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: 'epic-service',
            operation: 'update_epic',
            timestamp: new Date()
          }
        };
      }

      // Prepare update object
      const updates: any = {
        ...params,
        metadata: {
          updatedAt: new Date(),
          ...(params.tags && { tags: params.tags })
        }
      };

      // Update epic in storage
      const storageManager = await getStorageManager();
      const updateResult = await storageManager.updateEpic(epicId, updates);

      if (!updateResult.success) {
        return {
          success: false,
          error: `Failed to update epic: ${updateResult.error}`,
          metadata: updateResult.metadata
        };
      }

      logger.info({ epicId }, 'Epic updated successfully');

      return {
        success: true,
        data: updateResult.data!,
        metadata: {
          filePath: 'epic-service',
          operation: 'update_epic',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to update epic');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'epic-service',
          operation: 'update_epic',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Delete epic
   */
  async deleteEpic(epicId: string, deletedBy: string = 'system'): Promise<FileOperationResult<void>> {
    try {
      logger.info({ epicId, deletedBy }, 'Deleting epic');

      const storageManager = await getStorageManager();
      const deleteResult = await storageManager.deleteEpic(epicId);

      if (!deleteResult.success) {
        return {
          success: false,
          error: `Failed to delete epic: ${deleteResult.error}`,
          metadata: deleteResult.metadata
        };
      }

      logger.info({ epicId }, 'Epic deleted successfully');

      return {
        success: true,
        metadata: {
          filePath: 'epic-service',
          operation: 'delete_epic',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to delete epic');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'epic-service',
          operation: 'delete_epic',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * List epics with optional filtering
   */
  async listEpics(query?: EpicQueryParams): Promise<FileOperationResult<Epic[]>> {
    try {
      logger.debug({ query }, 'Listing epics');

      const storageManager = await getStorageManager();
      const result = await storageManager.listEpics(query?.projectId);

      if (!result.success) {
        return result;
      }

      let epics = result.data!;

      // Apply additional filters
      if (query) {
        epics = this.applyEpicFilters(epics, query);
      }

      return {
        success: true,
        data: epics,
        metadata: {
          filePath: 'epic-service',
          operation: 'list_epics',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, query }, 'Failed to list epics');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'epic-service',
          operation: 'list_epics',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Add task to epic
   */
  async addTaskToEpic(epicId: string, taskId: string): Promise<FileOperationResult<Epic>> {
    try {
      logger.info({ epicId, taskId }, 'Adding task to epic');

      // Get current epic
      const epicResult = await this.getEpic(epicId);
      if (!epicResult.success) {
        return {
          success: false,
          error: `Epic not found: ${epicResult.error}`,
          metadata: epicResult.metadata
        };
      }

      const epic = epicResult.data!;

      // Check if task is already in epic
      if (epic.taskIds.includes(taskId)) {
        return {
          success: false,
          error: `Task ${taskId} is already in epic ${epicId}`,
          metadata: {
            filePath: 'epic-service',
            operation: 'add_task_to_epic',
            timestamp: new Date()
          }
        };
      }

      // Verify task exists
      const taskOperations = getTaskOperations();
      const taskResult = await taskOperations.getTask(taskId);
      if (!taskResult.success) {
        return {
          success: false,
          error: `Task not found: ${taskResult.error}`,
          metadata: taskResult.metadata
        };
      }

      // Add task to epic
      const updatedTaskIds = [...epic.taskIds, taskId];

      // Update the epic with new task IDs
      const storageManager = await getStorageManager();
      const finalUpdateResult = await storageManager.updateEpic(epicId, { taskIds: updatedTaskIds });

      logger.info({ epicId, taskId }, 'Task added to epic successfully');

      return finalUpdateResult;

    } catch (error) {
      logger.error({ err: error, epicId, taskId }, 'Failed to add task to epic');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'epic-service',
          operation: 'add_task_to_epic',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Remove task from epic
   */
  async removeTaskFromEpic(epicId: string, taskId: string): Promise<FileOperationResult<Epic>> {
    try {
      logger.info({ epicId, taskId }, 'Removing task from epic');

      // Get current epic
      const epicResult = await this.getEpic(epicId);
      if (!epicResult.success) {
        return {
          success: false,
          error: `Epic not found: ${epicResult.error}`,
          metadata: epicResult.metadata
        };
      }

      const epic = epicResult.data!;

      // Check if task is in epic
      if (!epic.taskIds.includes(taskId)) {
        return {
          success: false,
          error: `Task ${taskId} is not in epic ${epicId}`,
          metadata: {
            filePath: 'epic-service',
            operation: 'remove_task_from_epic',
            timestamp: new Date()
          }
        };
      }

      // Remove task from epic
      const updatedTaskIds = epic.taskIds.filter(id => id !== taskId);

      const storageManager = await getStorageManager();
      const updateResult = await storageManager.updateEpic(epicId, {
        taskIds: updatedTaskIds,
        metadata: {
          ...epic.metadata,
          updatedAt: new Date()
        }
      });

      logger.info({ epicId, taskId }, 'Task removed from epic successfully');

      return updateResult;

    } catch (error) {
      logger.error({ err: error, epicId, taskId }, 'Failed to remove task from epic');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'epic-service',
          operation: 'remove_task_from_epic',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get epic progress
   */
  async getEpicProgress(epicId: string): Promise<FileOperationResult<EpicProgress>> {
    try {
      logger.debug({ epicId }, 'Getting epic progress');

      // Get epic
      const epicResult = await this.getEpic(epicId);
      if (!epicResult.success) {
        return {
          success: false,
          error: `Epic not found: ${epicResult.error}`,
          metadata: epicResult.metadata
        };
      }

      const epic = epicResult.data!;

      // Get all tasks in epic
      const taskOperations = getTaskOperations();
      const tasks: AtomicTask[] = [];

      for (const taskId of epic.taskIds) {
        const taskResult = await taskOperations.getTask(taskId);
        if (taskResult.success) {
          tasks.push(taskResult.data!);
        }
      }

      // Calculate progress metrics
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
      const pendingTasks = tasks.filter(t => t.status === 'pending').length;
      const blockedTasks = tasks.filter(t => t.status === 'blocked').length;

      const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      const estimatedHours = tasks.reduce((sum, task) => sum + task.estimatedHours, 0);
      const actualHours = tasks.reduce((sum, task) => sum + (task.actualHours || 0), 0);
      const remainingHours = Math.max(0, estimatedHours - actualHours);

      const progress: EpicProgress = {
        epicId,
        totalTasks,
        completedTasks,
        inProgressTasks,
        pendingTasks,
        blockedTasks,
        progressPercentage,
        estimatedHours,
        actualHours,
        remainingHours
      };

      return {
        success: true,
        data: progress,
        metadata: {
          filePath: 'epic-service',
          operation: 'get_epic_progress',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to get epic progress');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'epic-service',
          operation: 'get_epic_progress',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Validate create epic parameters
   */
  private validateCreateEpicParams(params: CreateEpicParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!params.title || typeof params.title !== 'string' || params.title.trim().length === 0) {
      errors.push('Epic title is required and must be a non-empty string');
    }

    if (params.title && params.title.length > 200) {
      errors.push('Epic title must be 200 characters or less');
    }

    if (!params.description || typeof params.description !== 'string' || params.description.trim().length === 0) {
      errors.push('Epic description is required and must be a non-empty string');
    }

    if (!params.projectId || typeof params.projectId !== 'string') {
      errors.push('Project ID is required and must be a string');
    }

    if (params.priority && !['low', 'medium', 'high', 'critical'].includes(params.priority)) {
      errors.push('Epic priority must be one of: low, medium, high, critical');
    }

    if (params.estimatedHours !== undefined && (typeof params.estimatedHours !== 'number' || params.estimatedHours < 0)) {
      errors.push('Estimated hours must be a non-negative number');
    }

    if (params.tags && !Array.isArray(params.tags)) {
      errors.push('Tags must be an array');
    }

    if (params.dependencies && !Array.isArray(params.dependencies)) {
      errors.push('Dependencies must be an array');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate update epic parameters
   */
  private validateUpdateEpicParams(params: UpdateEpicParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (params.title !== undefined) {
      if (typeof params.title !== 'string' || params.title.trim().length === 0) {
        errors.push('Epic title must be a non-empty string');
      }
      if (params.title.length > 200) {
        errors.push('Epic title must be 200 characters or less');
      }
    }

    if (params.description !== undefined) {
      if (typeof params.description !== 'string' || params.description.trim().length === 0) {
        errors.push('Epic description must be a non-empty string');
      }
    }

    if (params.status && !['pending', 'in_progress', 'completed', 'blocked', 'cancelled'].includes(params.status)) {
      errors.push('Epic status must be one of: pending, in_progress, completed, blocked, cancelled');
    }

    if (params.priority && !['low', 'medium', 'high', 'critical'].includes(params.priority)) {
      errors.push('Epic priority must be one of: low, medium, high, critical');
    }

    if (params.estimatedHours !== undefined && (typeof params.estimatedHours !== 'number' || params.estimatedHours < 0)) {
      errors.push('Estimated hours must be a non-negative number');
    }

    if (params.tags && !Array.isArray(params.tags)) {
      errors.push('Tags must be an array');
    }

    if (params.dependencies && !Array.isArray(params.dependencies)) {
      errors.push('Dependencies must be an array');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Apply filters to epic list
   */
  private applyEpicFilters(epics: Epic[], query: EpicQueryParams): Epic[] {
    let filteredEpics = [...epics];

    // Filter by status
    if (query.status) {
      filteredEpics = filteredEpics.filter(epic => epic.status === query.status);
    }

    // Filter by priority
    if (query.priority) {
      filteredEpics = filteredEpics.filter(epic => epic.priority === query.priority);
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      filteredEpics = filteredEpics.filter(epic =>
        query.tags!.some(tag => epic.metadata.tags.includes(tag))
      );
    }

    // Filter by creation date range
    if (query.createdAfter) {
      filteredEpics = filteredEpics.filter(epic =>
        epic.metadata.createdAt >= query.createdAfter!
      );
    }

    if (query.createdBefore) {
      filteredEpics = filteredEpics.filter(epic =>
        epic.metadata.createdAt <= query.createdBefore!
      );
    }

    // Apply pagination
    if (query.offset !== undefined) {
      filteredEpics = filteredEpics.slice(query.offset);
    }

    if (query.limit !== undefined) {
      filteredEpics = filteredEpics.slice(0, query.limit);
    }

    return filteredEpics;
  }
}

/**
 * Get singleton instance of epic service
 */
export function getEpicService(): EpicService {
  return EpicService.getInstance();
}
