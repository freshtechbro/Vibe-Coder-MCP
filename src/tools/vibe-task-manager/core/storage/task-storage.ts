import path from 'path';
import { FileUtils, FileOperationResult } from '../../utils/file-utils.js';
import { AtomicTask, Epic, TaskStatus, TaskPriority } from '../../types/task.js';
import { getVibeTaskManagerOutputDir } from '../../utils/config-loader.js';
import logger from '../../../../logger.js';

/**
 * Task index structure
 */
interface TaskIndex {
  tasks: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    projectId: string;
    epicId: string;
    estimatedHours: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  lastUpdated: string;
  version: string;
}

/**
 * Type guard for task index
 */
function isTaskIndex(data: unknown): data is TaskIndex {
  if (!data || typeof data !== 'object') return false;
  const index = data as Record<string, unknown>;
  return Array.isArray(index.tasks) && 
         typeof index.lastUpdated === 'string' && 
         typeof index.version === 'string';
}

/**
 * Epic index structure
 */
interface EpicIndex {
  epics: string[];
  lastUpdated: string;
  version: string;
}

/**
 * Type guard for epic index
 */
function isEpicIndex(data: unknown): data is EpicIndex {
  if (!data || typeof data !== 'object') return false;
  const index = data as Record<string, unknown>;
  return Array.isArray(index.epics) && 
         typeof index.lastUpdated === 'string' && 
         typeof index.version === 'string';
}

/**
 * Task storage interface
 */
export interface TaskStorageOperations {
  createTask(task: AtomicTask): Promise<FileOperationResult<AtomicTask>>;
  getTask(taskId: string): Promise<FileOperationResult<AtomicTask>>;
  updateTask(taskId: string, updates: Partial<AtomicTask>): Promise<FileOperationResult<AtomicTask>>;
  deleteTask(taskId: string): Promise<FileOperationResult<void>>;
  listTasks(projectId?: string, epicId?: string): Promise<FileOperationResult<AtomicTask[]>>;
  getTasksByStatus(status: TaskStatus, projectId?: string): Promise<FileOperationResult<AtomicTask[]>>;
  getTasksByPriority(priority: TaskPriority, projectId?: string): Promise<FileOperationResult<AtomicTask[]>>;
  searchTasks(query: string, projectId?: string): Promise<FileOperationResult<AtomicTask[]>>;
  taskExists(taskId: string): Promise<boolean>;

  // Epic operations
  createEpic(epic: Epic): Promise<FileOperationResult<Epic>>;
  getEpic(epicId: string): Promise<FileOperationResult<Epic>>;
  updateEpic(epicId: string, updates: Partial<Epic>): Promise<FileOperationResult<Epic>>;
  deleteEpic(epicId: string): Promise<FileOperationResult<void>>;
  listEpics(projectId?: string): Promise<FileOperationResult<Epic[]>>;
  epicExists(epicId: string): Promise<boolean>;
}

/**
 * File-based task storage implementation
 */
export class TaskStorage implements TaskStorageOperations {
  private dataDirectory: string;
  private tasksDirectory: string;
  private epicsDirectory: string;
  private taskIndexFile: string;
  private epicIndexFile: string;

  constructor(dataDirectory?: string) {
    this.dataDirectory = dataDirectory || getVibeTaskManagerOutputDir();
    this.tasksDirectory = path.join(this.dataDirectory, 'tasks');
    this.epicsDirectory = path.join(this.dataDirectory, 'epics');
    this.taskIndexFile = path.join(this.dataDirectory, 'tasks-index.json');
    this.epicIndexFile = path.join(this.dataDirectory, 'epics-index.json');
  }

  /**
   * Initialize storage directories
   */
  async initialize(): Promise<FileOperationResult<void>> {
    try {
      // Ensure directories exist
      const tasksDirResult = await FileUtils.ensureDirectory(this.tasksDirectory);
      if (!tasksDirResult.success) {
        return tasksDirResult;
      }

      const epicsDirResult = await FileUtils.ensureDirectory(this.epicsDirectory);
      if (!epicsDirResult.success) {
        return epicsDirResult;
      }

      // Initialize task index file if it doesn't exist
      if (!await FileUtils.fileExists(this.taskIndexFile)) {
        const taskIndexData = {
          tasks: [],
          lastUpdated: new Date().toISOString(),
          version: '1.0.0'
        };

        const taskIndexResult = await FileUtils.writeJsonFile(this.taskIndexFile, taskIndexData);
        if (!taskIndexResult.success) {
          return taskIndexResult;
        }
      }

      // Initialize epic index file if it doesn't exist
      if (!await FileUtils.fileExists(this.epicIndexFile)) {
        const epicIndexData = {
          epics: [],
          lastUpdated: new Date().toISOString(),
          version: '1.0.0'
        };

        const epicIndexResult = await FileUtils.writeJsonFile(this.epicIndexFile, epicIndexData);
        if (!epicIndexResult.success) {
          return epicIndexResult;
        }
      }

      logger.debug({ dataDirectory: this.dataDirectory }, 'Task storage initialized');

      return {
        success: true,
        metadata: {
          filePath: this.dataDirectory,
          operation: 'initialize',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, dataDirectory: this.dataDirectory }, 'Failed to initialize task storage');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.dataDirectory,
          operation: 'initialize',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Create a new task
   */
  async createTask(task: AtomicTask): Promise<FileOperationResult<AtomicTask>> {
    try {
      logger.info({ taskId: task.id, title: task.title }, 'Creating task');

      // Validate task data
      const validationResult = this.validateTask(task);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Task validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: this.getTaskFilePath(task.id),
            operation: 'create_task',
            timestamp: new Date()
          }
        };
      }

      // Check if task already exists
      if (await this.taskExists(task.id)) {
        return {
          success: false,
          error: `Task with ID ${task.id} already exists`,
          metadata: {
            filePath: this.getTaskFilePath(task.id),
            operation: 'create_task',
            timestamp: new Date()
          }
        };
      }

      // Ensure storage is initialized
      const initResult = await this.initialize();
      if (!initResult.success) {
        return {
          success: false,
          error: `Failed to initialize storage: ${initResult.error}`,
          metadata: initResult.metadata
        };
      }

      // Set creation timestamp
      const taskToSave = {
        ...task,
        metadata: {
          ...task.metadata,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      };

      // Save task file
      const taskFilePath = this.getTaskFilePath(task.id);
      const saveResult = await FileUtils.writeYamlFile(taskFilePath, taskToSave);
      if (!saveResult.success) {
        return {
          success: false,
          error: `Failed to save task: ${saveResult.error}`,
          metadata: saveResult.metadata
        };
      }

      // Update index
      const indexUpdateResult = await this.updateTaskIndex('add', task.id, {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        projectId: task.projectId,
        epicId: task.epicId,
        estimatedHours: task.estimatedHours,
        createdAt: taskToSave.metadata.createdAt,
        updatedAt: taskToSave.metadata.updatedAt
      });

      if (!indexUpdateResult.success) {
        // Try to clean up the task file if index update failed
        await FileUtils.deleteFile(taskFilePath);
        return {
          success: false,
          error: `Failed to update index: ${indexUpdateResult.error}`,
          metadata: indexUpdateResult.metadata
        };
      }

      logger.info({ taskId: task.id }, 'Task created successfully');

      return {
        success: true,
        data: taskToSave,
        metadata: {
          filePath: taskFilePath,
          operation: 'create_task',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId: task.id }, 'Failed to create task');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getTaskFilePath(task.id),
          operation: 'create_task',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId: string): Promise<FileOperationResult<AtomicTask>> {
    try {
      logger.debug({ taskId }, 'Getting task');

      const taskFilePath = this.getTaskFilePath(taskId);

      if (!await FileUtils.fileExists(taskFilePath)) {
        return {
          success: false,
          error: `Task ${taskId} not found`,
          metadata: {
            filePath: taskFilePath,
            operation: 'get_task',
            timestamp: new Date()
          }
        };
      }

      const loadResult = await FileUtils.readYamlFile<AtomicTask>(taskFilePath);
      if (!loadResult.success) {
        return {
          success: false,
          error: `Failed to load task: ${loadResult.error}`,
          metadata: loadResult.metadata
        };
      }

      return {
        success: true,
        data: loadResult.data!,
        metadata: {
          filePath: taskFilePath,
          operation: 'get_task',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to get task');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getTaskFilePath(taskId),
          operation: 'get_task',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Update a task
   */
  async updateTask(taskId: string, updates: Partial<AtomicTask>): Promise<FileOperationResult<AtomicTask>> {
    try {
      logger.info({ taskId, updates: Object.keys(updates) }, 'Updating task');

      // Get existing task
      const getResult = await this.getTask(taskId);
      if (!getResult.success) {
        return getResult;
      }

      const existingTask = getResult.data!;

      // Merge updates
      const updatedTask: AtomicTask = {
        ...existingTask,
        ...updates,
        id: taskId, // Ensure ID cannot be changed
        metadata: {
          ...existingTask.metadata,
          ...updates.metadata,
          createdAt: existingTask.metadata.createdAt, // Preserve creation time
          updatedAt: new Date()
        }
      };

      // Validate updated task
      const validationResult = this.validateTask(updatedTask);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Task validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: this.getTaskFilePath(taskId),
            operation: 'update_task',
            timestamp: new Date()
          }
        };
      }

      // Save updated task
      const taskFilePath = this.getTaskFilePath(taskId);
      const saveResult = await FileUtils.writeYamlFile(taskFilePath, updatedTask);
      if (!saveResult.success) {
        return {
          success: false,
          error: `Failed to save updated task: ${saveResult.error}`,
          metadata: saveResult.metadata
        };
      }

      // Update index
      const indexUpdateResult = await this.updateTaskIndex('update', taskId, {
        id: updatedTask.id,
        title: updatedTask.title,
        status: updatedTask.status,
        priority: updatedTask.priority,
        projectId: updatedTask.projectId,
        epicId: updatedTask.epicId,
        estimatedHours: updatedTask.estimatedHours,
        createdAt: updatedTask.metadata.createdAt,
        updatedAt: updatedTask.metadata.updatedAt
      });

      if (!indexUpdateResult.success) {
        logger.warn({ taskId, error: indexUpdateResult.error }, 'Failed to update index, but task was saved');
      }

      logger.info({ taskId }, 'Task updated successfully');

      return {
        success: true,
        data: updatedTask,
        metadata: {
          filePath: taskFilePath,
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
          filePath: this.getTaskFilePath(taskId),
          operation: 'update_task',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string): Promise<FileOperationResult<void>> {
    try {
      logger.info({ taskId }, 'Deleting task');

      // Check if task exists
      if (!await this.taskExists(taskId)) {
        return {
          success: false,
          error: `Task ${taskId} not found`,
          metadata: {
            filePath: this.getTaskFilePath(taskId),
            operation: 'delete_task',
            timestamp: new Date()
          }
        };
      }

      // Delete task file
      const taskFilePath = this.getTaskFilePath(taskId);
      const deleteResult = await FileUtils.deleteFile(taskFilePath);
      if (!deleteResult.success) {
        return {
          success: false,
          error: `Failed to delete task file: ${deleteResult.error}`,
          metadata: deleteResult.metadata
        };
      }

      // Update index
      const indexUpdateResult = await this.updateTaskIndex('remove', taskId);
      if (!indexUpdateResult.success) {
        logger.warn({ taskId, error: indexUpdateResult.error }, 'Failed to update index, but task file was deleted');
      }

      logger.info({ taskId }, 'Task deleted successfully');

      return {
        success: true,
        metadata: {
          filePath: taskFilePath,
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
          filePath: this.getTaskFilePath(taskId),
          operation: 'delete_task',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * List tasks with optional filtering
   */
  async listTasks(projectId?: string, epicId?: string): Promise<FileOperationResult<AtomicTask[]>> {
    try {
      logger.debug({ projectId, epicId }, 'Listing tasks');

      // Load index
      const indexResult = await this.loadTaskIndex();
      if (!indexResult.success) {
        return {
          success: false,
          error: `Failed to load task index: ${indexResult.error}`,
          metadata: indexResult.metadata
        };
      }

      const index = indexResult.data!;
      let taskInfos = index.tasks;

      // Apply filters
      if (projectId) {
        taskInfos = taskInfos.filter(task => task.projectId === projectId);
      }

      if (epicId) {
        taskInfos = taskInfos.filter(task => task.epicId === epicId);
      }

      const tasks: AtomicTask[] = [];

      // Load each task
      for (const taskInfo of taskInfos) {
        const taskResult = await this.getTask(taskInfo.id);
        if (taskResult.success) {
          tasks.push(taskResult.data!);
        } else {
          logger.warn({ taskId: taskInfo.id, error: taskResult.error }, 'Failed to load task from index');
        }
      }

      return {
        success: true,
        data: tasks,
        metadata: {
          filePath: this.taskIndexFile,
          operation: 'list_tasks',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, projectId, epicId }, 'Failed to list tasks');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.taskIndexFile,
          operation: 'list_tasks',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get tasks by status
   */
  async getTasksByStatus(status: TaskStatus, projectId?: string): Promise<FileOperationResult<AtomicTask[]>> {
    const listResult = await this.listTasks(projectId);
    if (!listResult.success) {
      return listResult;
    }

    const filteredTasks = listResult.data!.filter(task => task.status === status);

    return {
      success: true,
      data: filteredTasks,
      metadata: {
        filePath: this.taskIndexFile,
        operation: 'get_tasks_by_status',
        timestamp: new Date()
      }
    };
  }

  /**
   * Get tasks by priority
   */
  async getTasksByPriority(priority: TaskPriority, projectId?: string): Promise<FileOperationResult<AtomicTask[]>> {
    const listResult = await this.listTasks(projectId);
    if (!listResult.success) {
      return listResult;
    }

    const filteredTasks = listResult.data!.filter(task => task.priority === priority);

    return {
      success: true,
      data: filteredTasks,
      metadata: {
        filePath: this.taskIndexFile,
        operation: 'get_tasks_by_priority',
        timestamp: new Date()
      }
    };
  }

  /**
   * Search tasks
   */
  async searchTasks(query: string, projectId?: string): Promise<FileOperationResult<AtomicTask[]>> {
    const listResult = await this.listTasks(projectId);
    if (!listResult.success) {
      return listResult;
    }

    const searchTerm = query.toLowerCase();
    const filteredTasks = listResult.data!.filter(task =>
      task.title.toLowerCase().includes(searchTerm) ||
      task.description.toLowerCase().includes(searchTerm) ||
      task.metadata.tags.some(tag => tag.toLowerCase().includes(searchTerm))
    );

    return {
      success: true,
      data: filteredTasks,
      metadata: {
        filePath: this.taskIndexFile,
        operation: 'search_tasks',
        timestamp: new Date()
      }
    };
  }

  /**
   * Check if task exists
   */
  async taskExists(taskId: string): Promise<boolean> {
    const taskFilePath = this.getTaskFilePath(taskId);
    return await FileUtils.fileExists(taskFilePath);
  }

  /**
   * Create a new epic
   */
  async createEpic(epic: Epic): Promise<FileOperationResult<Epic>> {
    try {
      logger.info({ epicId: epic.id, title: epic.title }, 'Creating epic');

      // Validate epic data
      const validationResult = this.validateEpic(epic);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Epic validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: this.getEpicFilePath(epic.id),
            operation: 'create_epic',
            timestamp: new Date()
          }
        };
      }

      // Check if epic already exists
      const epicExists = await this.epicExists(epic.id);
      if (epicExists) {
        return {
          success: false,
          error: `Epic ${epic.id} already exists`,
          metadata: {
            filePath: this.getEpicFilePath(epic.id),
            operation: 'create_epic',
            timestamp: new Date()
          }
        };
      }

      // Save epic to file
      const epicFilePath = this.getEpicFilePath(epic.id);
      const saveResult = await FileUtils.writeYamlFile(epicFilePath, epic);

      if (!saveResult.success) {
        return {
          success: false,
          error: `Failed to save epic: ${saveResult.error}`,
          metadata: saveResult.metadata
        };
      }

      // Update epic index
      await this.updateEpicIndex(epic.id, 'create');

      logger.info({ epicId: epic.id }, 'Epic created successfully');

      return {
        success: true,
        data: epic,
        metadata: {
          filePath: epicFilePath,
          operation: 'create_epic',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, epicId: epic.id }, 'Failed to create epic');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getEpicFilePath(epic.id),
          operation: 'create_epic',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get an epic by ID
   */
  async getEpic(epicId: string): Promise<FileOperationResult<Epic>> {
    try {
      logger.debug({ epicId }, 'Getting epic');

      const epicFilePath = this.getEpicFilePath(epicId);
      const readResult = await FileUtils.readYamlFile<Epic>(epicFilePath);

      if (!readResult.success) {
        return {
          success: false,
          error: `Epic ${epicId} not found: ${readResult.error}`,
          metadata: {
            filePath: epicFilePath,
            operation: 'get_epic',
            timestamp: new Date()
          }
        };
      }

      const epic = readResult.data!;

      // Validate epic data
      const validationResult = this.validateEpic(epic);
      if (!validationResult.valid) {
        logger.warn({ epicId, errors: validationResult.errors }, 'Epic data validation failed');
        return {
          success: false,
          error: `Epic data is corrupted: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: epicFilePath,
            operation: 'get_epic',
            timestamp: new Date()
          }
        };
      }

      return {
        success: true,
        data: epic,
        metadata: {
          filePath: epicFilePath,
          operation: 'get_epic',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to get epic');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getEpicFilePath(epicId),
          operation: 'get_epic',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Update an epic
   */
  async updateEpic(epicId: string, updates: Partial<Epic>): Promise<FileOperationResult<Epic>> {
    try {
      logger.info({ epicId, updates: Object.keys(updates) }, 'Updating epic');

      // Get existing epic
      const existingResult = await this.getEpic(epicId);
      if (!existingResult.success) {
        return {
          success: false,
          error: `Epic not found: ${existingResult.error}`,
          metadata: existingResult.metadata
        };
      }

      const existingEpic = existingResult.data!;

      // Merge updates with existing epic
      const updatedEpic: Epic = {
        ...existingEpic,
        ...updates,
        id: epicId, // Ensure ID cannot be changed
        metadata: {
          ...existingEpic.metadata,
          ...updates.metadata,
          updatedAt: new Date()
        }
      };

      // Validate updated epic
      const validationResult = this.validateEpic(updatedEpic);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Epic update validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: this.getEpicFilePath(epicId),
            operation: 'update_epic',
            timestamp: new Date()
          }
        };
      }

      // Save updated epic
      const epicFilePath = this.getEpicFilePath(epicId);
      const saveResult = await FileUtils.writeYamlFile(epicFilePath, updatedEpic);

      if (!saveResult.success) {
        return {
          success: false,
          error: `Failed to save updated epic: ${saveResult.error}`,
          metadata: saveResult.metadata
        };
      }

      logger.info({ epicId }, 'Epic updated successfully');

      return {
        success: true,
        data: updatedEpic,
        metadata: {
          filePath: epicFilePath,
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
          filePath: this.getEpicFilePath(epicId),
          operation: 'update_epic',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Delete an epic
   */
  async deleteEpic(epicId: string): Promise<FileOperationResult<void>> {
    try {
      logger.info({ epicId }, 'Deleting epic');

      // Check if epic exists
      const epicExists = await this.epicExists(epicId);
      if (!epicExists) {
        return {
          success: false,
          error: `Epic ${epicId} not found`,
          metadata: {
            filePath: this.getEpicFilePath(epicId),
            operation: 'delete_epic',
            timestamp: new Date()
          }
        };
      }

      // Get epic to check for associated tasks
      const epicResult = await this.getEpic(epicId);
      if (epicResult.success && epicResult.data!.taskIds.length > 0) {
        return {
          success: false,
          error: `Cannot delete epic ${epicId}: it has ${epicResult.data!.taskIds.length} associated tasks`,
          metadata: {
            filePath: this.getEpicFilePath(epicId),
            operation: 'delete_epic',
            timestamp: new Date()
          }
        };
      }

      // Delete epic file
      const epicFilePath = this.getEpicFilePath(epicId);
      const deleteResult = await FileUtils.deleteFile(epicFilePath);

      if (!deleteResult.success) {
        return {
          success: false,
          error: `Failed to delete epic file: ${deleteResult.error}`,
          metadata: deleteResult.metadata
        };
      }

      // Update epic index
      await this.updateEpicIndex(epicId, 'delete');

      logger.info({ epicId }, 'Epic deleted successfully');

      return {
        success: true,
        metadata: {
          filePath: epicFilePath,
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
          filePath: this.getEpicFilePath(epicId),
          operation: 'delete_epic',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * List epics
   */
  async listEpics(projectId?: string): Promise<FileOperationResult<Epic[]>> {
    try {
      logger.debug({ projectId }, 'Listing epics');

      // Read epic index
      const indexResult = await FileUtils.readJsonFile<Record<string, unknown>>(this.epicIndexFile);
      if (!indexResult.success) {
        return {
          success: false,
          error: `Failed to read epic index: ${indexResult.error}`,
          metadata: {
            filePath: this.epicIndexFile,
            operation: 'list_epics',
            timestamp: new Date()
          }
        };
      }

      // Validate epic index
      if (!isEpicIndex(indexResult.data)) {
        return {
          success: false,
          error: 'Invalid epic index format',
          metadata: {
            filePath: this.epicIndexFile,
            operation: 'list_epics',
            timestamp: new Date()
          }
        };
      }

      const epicIndex = indexResult.data;
      const epicIds: string[] = epicIndex.epics;

      // Load all epics
      const epics: Epic[] = [];
      for (const epicId of epicIds) {
        const epicResult = await this.getEpic(epicId);
        if (epicResult.success) {
          const epic = epicResult.data!;

          // Filter by project if specified
          if (!projectId || epic.projectId === projectId) {
            epics.push(epic);
          }
        } else {
          logger.warn({ epicId }, 'Failed to load epic from index');
        }
      }

      return {
        success: true,
        data: epics,
        metadata: {
          filePath: this.epicIndexFile,
          operation: 'list_epics',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, projectId }, 'Failed to list epics');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.epicIndexFile,
          operation: 'list_epics',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Check if epic exists
   */
  async epicExists(epicId: string): Promise<boolean> {
    const epicFilePath = this.getEpicFilePath(epicId);
    return await FileUtils.fileExists(epicFilePath);
  }

  /**
   * Get task file path
   */
  private getTaskFilePath(taskId: string): string {
    return path.join(this.tasksDirectory, `${taskId}.yaml`);
  }

  /**
   * Get epic file path
   */
  private getEpicFilePath(epicId: string): string {
    return path.join(this.epicsDirectory, `${epicId}.yaml`);
  }

  /**
   * Validate task data
   */
  private validateTask(task: AtomicTask): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!task.id || typeof task.id !== 'string') {
      errors.push('Task ID is required and must be a string');
    }

    if (!task.title || typeof task.title !== 'string') {
      errors.push('Task title is required and must be a string');
    }

    if (!task.description || typeof task.description !== 'string') {
      errors.push('Task description is required and must be a string');
    }

    if (!['pending', 'in_progress', 'completed', 'blocked', 'cancelled'].includes(task.status)) {
      errors.push('Task status must be one of: pending, in_progress, completed, blocked, cancelled');
    }

    if (!['low', 'medium', 'high', 'critical'].includes(task.priority)) {
      errors.push('Task priority must be one of: low, medium, high, critical');
    }

    if (!task.projectId || typeof task.projectId !== 'string') {
      errors.push('Project ID is required and must be a string');
    }

    if (!task.epicId || typeof task.epicId !== 'string') {
      errors.push('Epic ID is required and must be a string');
    }

    if (typeof task.estimatedHours !== 'number' || task.estimatedHours < 0) {
      errors.push('Estimated hours must be a non-negative number');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Load task index
   */
  private async loadTaskIndex(): Promise<FileOperationResult<TaskIndex>> {
    if (!await FileUtils.fileExists(this.taskIndexFile)) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        return initResult as FileOperationResult<TaskIndex>;
      }
    }

    const result = await FileUtils.readJsonFile(this.taskIndexFile);
    if (!result.success) {
      return result as FileOperationResult<TaskIndex>;
    }

    // Validate the loaded data
    if (!isTaskIndex(result.data)) {
      return {
        success: false,
        error: 'Invalid task index format',
        metadata: result.metadata
      };
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    };
  }

  /**
   * Update task index
   */
  private async updateTaskIndex(operation: 'add' | 'update' | 'remove', taskId: string, taskInfo?: Record<string, unknown>): Promise<FileOperationResult<void>> {
    try {
      const indexResult = await this.loadTaskIndex();
      if (!indexResult.success) {
        return indexResult as FileOperationResult<void>;
      }

      const index = indexResult.data!;

      switch (operation) {
        case 'add':
          if (!index.tasks.find(t => t.id === taskId) && taskInfo) {
            index.tasks.push(taskInfo as TaskIndex['tasks'][0]);
          }
          break;

        case 'update': {
          const updateIndex = index.tasks.findIndex(t => t.id === taskId);
          if (updateIndex !== -1 && taskInfo) {
            index.tasks[updateIndex] = taskInfo as TaskIndex['tasks'][0];
          }
          break;
        }

        case 'remove':
          index.tasks = index.tasks.filter(t => t.id !== taskId);
          break;
      }

      index.lastUpdated = new Date().toISOString();

      return await FileUtils.writeJsonFile(this.taskIndexFile, index);

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.taskIndexFile,
          operation: 'update_task_index',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Validate epic data
   */
  private validateEpic(epic: Epic): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!epic.id || typeof epic.id !== 'string') {
      errors.push('Epic ID is required and must be a string');
    }

    if (!epic.title || typeof epic.title !== 'string' || epic.title.trim().length === 0) {
      errors.push('Epic title is required and must be a non-empty string');
    }

    if (epic.title && epic.title.length > 200) {
      errors.push('Epic title must be 200 characters or less');
    }

    if (!epic.description || typeof epic.description !== 'string' || epic.description.trim().length === 0) {
      errors.push('Epic description is required and must be a non-empty string');
    }

    if (!['pending', 'in_progress', 'completed', 'blocked', 'cancelled'].includes(epic.status)) {
      errors.push('Epic status must be one of: pending, in_progress, completed, blocked, cancelled');
    }

    if (!['low', 'medium', 'high', 'critical'].includes(epic.priority)) {
      errors.push('Epic priority must be one of: low, medium, high, critical');
    }

    if (!epic.projectId || typeof epic.projectId !== 'string') {
      errors.push('Project ID is required and must be a string');
    }

    if (typeof epic.estimatedHours !== 'number' || epic.estimatedHours < 0) {
      errors.push('Estimated hours must be a non-negative number');
    }

    if (!Array.isArray(epic.taskIds)) {
      errors.push('Task IDs must be an array');
    }

    if (!Array.isArray(epic.dependencies)) {
      errors.push('Dependencies must be an array');
    }

    if (!Array.isArray(epic.dependents)) {
      errors.push('Dependents must be an array');
    }

    if (!epic.metadata || typeof epic.metadata !== 'object') {
      errors.push('Metadata is required and must be an object');
    } else {
      if (!epic.metadata.createdAt || !(epic.metadata.createdAt instanceof Date)) {
        errors.push('Metadata must include a valid createdAt date');
      }

      if (!epic.metadata.updatedAt || !(epic.metadata.updatedAt instanceof Date)) {
        errors.push('Metadata must include a valid updatedAt date');
      }

      if (!epic.metadata.createdBy || typeof epic.metadata.createdBy !== 'string') {
        errors.push('Metadata must include createdBy as a string');
      }

      if (!Array.isArray(epic.metadata.tags)) {
        errors.push('Metadata tags must be an array');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }



  /**
   * Update epic index
   */
  private async updateEpicIndex(epicId: string, operation: 'create' | 'delete'): Promise<void> {
    try {
      // Read current index
      const indexResult = await FileUtils.readJsonFile<Record<string, unknown>>(this.epicIndexFile);
      const epicIndexData = indexResult.success ? indexResult.data! : { epics: [], lastUpdated: new Date().toISOString(), version: '1.0.0' };

      // Validate or create epic index structure
      const epicIndex: EpicIndex = isEpicIndex(epicIndexData) 
        ? epicIndexData 
        : { epics: [], lastUpdated: new Date().toISOString(), version: '1.0.0' };

      // Update index based on operation
      if (operation === 'create') {
        if (!epicIndex.epics.includes(epicId)) {
          epicIndex.epics.push(epicId);
        }
      } else if (operation === 'delete') {
        epicIndex.epics = epicIndex.epics.filter(id => id !== epicId);
      }

      // Update timestamp
      epicIndex.lastUpdated = new Date().toISOString();

      // Save updated index
      await FileUtils.writeJsonFile(this.epicIndexFile, epicIndex);

    } catch (error) {
      logger.error({ err: error, epicId, operation }, 'Failed to update epic index');
      // Don't throw - this is a non-critical operation
    }
  }
}
