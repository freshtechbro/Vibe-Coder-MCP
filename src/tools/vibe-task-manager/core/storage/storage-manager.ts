import { ProjectStorage, ProjectStorageOperations } from './project-storage.js';
import { TaskStorage, TaskStorageOperations } from './task-storage.js';
import { DependencyStorage, DependencyStorageOperations } from './dependency-storage.js';
import { FileOperationResult } from '../../utils/file-utils.js';
import { getVibeTaskManagerConfig, getVibeTaskManagerOutputDir } from '../../utils/config-loader.js';
import logger from '../../../../logger.js';
import { Project, AtomicTask, Epic, TaskStatus, TaskPriority } from '../../types/task.js';
import { Dependency, DependencyGraph } from '../../types/dependency.js';

/**
 * Unified storage manager that coordinates all storage operations
 */
export class StorageManager implements ProjectStorageOperations, TaskStorageOperations, DependencyStorageOperations {
  private static instance: StorageManager;
  private projectStorage: ProjectStorage;
  private taskStorage: TaskStorage;
  private dependencyStorage: DependencyStorage;
  private dataDirectory: string;
  private initialized: boolean = false;

  private constructor(dataDirectory?: string) {
    this.dataDirectory = dataDirectory || getVibeTaskManagerOutputDir();
    this.projectStorage = new ProjectStorage(this.dataDirectory);
    this.taskStorage = new TaskStorage(this.dataDirectory);
    this.dependencyStorage = new DependencyStorage(this.dataDirectory);
  }

  /**
   * Get singleton instance
   */
  static getInstance(dataDirectory?: string): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager(dataDirectory);
    }
    return StorageManager.instance;
  }

  /**
   * Initialize all storage systems
   */
  async initialize(): Promise<FileOperationResult<void>> {
    if (this.initialized) {
      return {
        success: true,
        metadata: {
          filePath: this.dataDirectory,
          operation: 'initialize',
          timestamp: new Date()
        }
      };
    }

    try {
      logger.info({ dataDirectory: this.dataDirectory }, 'Initializing storage manager');

      // Load configuration to get data directory
      const config = await getVibeTaskManagerConfig();
      if (config?.taskManager?.dataDirectory) {
        this.dataDirectory = config.taskManager.dataDirectory;

        // Recreate storage instances with correct directory
        this.projectStorage = new ProjectStorage(this.dataDirectory);
        this.taskStorage = new TaskStorage(this.dataDirectory);
        this.dependencyStorage = new DependencyStorage(this.dataDirectory);
      }

      // Initialize all storage systems
      const projectInitResult = await this.projectStorage.initialize();
      if (!projectInitResult.success) {
        return {
          success: false,
          error: `Failed to initialize project storage: ${projectInitResult.error}`,
          metadata: projectInitResult.metadata
        };
      }

      const taskInitResult = await this.taskStorage.initialize();
      if (!taskInitResult.success) {
        return {
          success: false,
          error: `Failed to initialize task storage: ${taskInitResult.error}`,
          metadata: taskInitResult.metadata
        };
      }

      const dependencyInitResult = await this.dependencyStorage.initialize();
      if (!dependencyInitResult.success) {
        return {
          success: false,
          error: `Failed to initialize dependency storage: ${dependencyInitResult.error}`,
          metadata: dependencyInitResult.metadata
        };
      }

      this.initialized = true;
      logger.info({ dataDirectory: this.dataDirectory }, 'Storage manager initialized successfully');

      return {
        success: true,
        metadata: {
          filePath: this.dataDirectory,
          operation: 'initialize',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, dataDirectory: this.dataDirectory }, 'Failed to initialize storage manager');

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
   * Get storage statistics
   */
  async getStorageStats(): Promise<FileOperationResult<{
    projects: number;
    tasks: number;
    dependencies: number;
    dataDirectory: string;
    initialized: boolean;
  }>> {
    try {
      await this.ensureInitialized();

      const projectsResult = await this.projectStorage.listProjects();
      const tasksResult = await this.taskStorage.listTasks();
      const dependenciesResult = await this.dependencyStorage.listDependencies();

      const stats = {
        projects: projectsResult.success ? projectsResult.data!.length : 0,
        tasks: tasksResult.success ? tasksResult.data!.length : 0,
        dependencies: dependenciesResult.success ? dependenciesResult.data!.length : 0,
        dataDirectory: this.dataDirectory,
        initialized: this.initialized
      };

      return {
        success: true,
        data: stats,
        metadata: {
          filePath: this.dataDirectory,
          operation: 'get_storage_stats',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to get storage statistics');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.dataDirectory,
          operation: 'get_storage_stats',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Ensure storage is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(`Failed to initialize storage: ${initResult.error}`);
      }
    }
  }

  // Project Storage Operations
  async createProject(project: Project): Promise<FileOperationResult<Project>> {
    await this.ensureInitialized();
    return this.projectStorage.createProject(project);
  }

  async getProject(projectId: string): Promise<FileOperationResult<Project>> {
    await this.ensureInitialized();
    return this.projectStorage.getProject(projectId);
  }

  async updateProject(projectId: string, updates: Partial<Project>): Promise<FileOperationResult<Project>> {
    await this.ensureInitialized();
    return this.projectStorage.updateProject(projectId, updates);
  }

  async deleteProject(projectId: string): Promise<FileOperationResult<void>> {
    await this.ensureInitialized();

    // Delete all related tasks and dependencies first
    const tasksResult = await this.taskStorage.listTasks(projectId);
    if (tasksResult.success) {
      for (const task of tasksResult.data!) {
        await this.taskStorage.deleteTask(task.id);
      }
    }

    const dependenciesResult = await this.dependencyStorage.listDependencies(projectId);
    if (dependenciesResult.success) {
      for (const dependency of dependenciesResult.data!) {
        await this.dependencyStorage.deleteDependency(dependency.id);
      }
    }

    // Delete dependency graph
    await this.dependencyStorage.deleteDependencyGraph(projectId);

    // Finally delete the project
    return this.projectStorage.deleteProject(projectId);
  }

  async listProjects(): Promise<FileOperationResult<Project[]>> {
    await this.ensureInitialized();
    return this.projectStorage.listProjects();
  }

  async projectExists(projectId: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.projectStorage.projectExists(projectId);
  }

  async getProjectsByStatus(status: string): Promise<FileOperationResult<Project[]>> {
    await this.ensureInitialized();
    return this.projectStorage.getProjectsByStatus(status);
  }

  async searchProjects(query: string): Promise<FileOperationResult<Project[]>> {
    await this.ensureInitialized();
    return this.projectStorage.searchProjects(query);
  }

  // Task Storage Operations
  async createTask(task: AtomicTask): Promise<FileOperationResult<AtomicTask>> {
    await this.ensureInitialized();
    return this.taskStorage.createTask(task);
  }

  async getTask(taskId: string): Promise<FileOperationResult<AtomicTask>> {
    await this.ensureInitialized();
    return this.taskStorage.getTask(taskId);
  }

  async updateTask(taskId: string, updates: Partial<AtomicTask>): Promise<FileOperationResult<AtomicTask>> {
    await this.ensureInitialized();
    return this.taskStorage.updateTask(taskId, updates);
  }

  async deleteTask(taskId: string): Promise<FileOperationResult<void>> {
    await this.ensureInitialized();

    // Delete all dependencies related to this task
    const dependenciesResult = await this.dependencyStorage.getDependenciesForTask(taskId);
    if (dependenciesResult.success) {
      for (const dependency of dependenciesResult.data!) {
        await this.dependencyStorage.deleteDependency(dependency.id);
      }
    }

    const dependentsResult = await this.dependencyStorage.getDependentsForTask(taskId);
    if (dependentsResult.success) {
      for (const dependent of dependentsResult.data!) {
        await this.dependencyStorage.deleteDependency(dependent.id);
      }
    }

    return this.taskStorage.deleteTask(taskId);
  }

  async listTasks(projectId?: string, epicId?: string): Promise<FileOperationResult<AtomicTask[]>> {
    await this.ensureInitialized();
    return this.taskStorage.listTasks(projectId, epicId);
  }

  async getTasksByStatus(status: TaskStatus, projectId?: string): Promise<FileOperationResult<AtomicTask[]>> {
    await this.ensureInitialized();
    return this.taskStorage.getTasksByStatus(status, projectId);
  }

  async getTasksByPriority(priority: TaskPriority, projectId?: string): Promise<FileOperationResult<AtomicTask[]>> {
    await this.ensureInitialized();
    return this.taskStorage.getTasksByPriority(priority, projectId);
  }

  async searchTasks(query: string, projectId?: string): Promise<FileOperationResult<AtomicTask[]>> {
    await this.ensureInitialized();
    return this.taskStorage.searchTasks(query, projectId);
  }

  async taskExists(taskId: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.taskStorage.taskExists(taskId);
  }

  // Epic Operations
  async createEpic(epic: Epic): Promise<FileOperationResult<Epic>> {
    await this.ensureInitialized();
    return this.taskStorage.createEpic(epic);
  }

  async getEpic(epicId: string): Promise<FileOperationResult<Epic>> {
    await this.ensureInitialized();
    return this.taskStorage.getEpic(epicId);
  }

  async updateEpic(epicId: string, updates: Partial<Epic>): Promise<FileOperationResult<Epic>> {
    await this.ensureInitialized();
    return this.taskStorage.updateEpic(epicId, updates);
  }

  async deleteEpic(epicId: string): Promise<FileOperationResult<void>> {
    await this.ensureInitialized();
    return this.taskStorage.deleteEpic(epicId);
  }

  async listEpics(projectId?: string): Promise<FileOperationResult<Epic[]>> {
    await this.ensureInitialized();
    return this.taskStorage.listEpics(projectId);
  }

  async epicExists(epicId: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.taskStorage.epicExists(epicId);
  }

  // Dependency Storage Operations
  async createDependency(dependency: Dependency): Promise<FileOperationResult<Dependency>> {
    await this.ensureInitialized();
    return this.dependencyStorage.createDependency(dependency);
  }

  async getDependency(dependencyId: string): Promise<FileOperationResult<Dependency>> {
    await this.ensureInitialized();
    return this.dependencyStorage.getDependency(dependencyId);
  }

  async updateDependency(dependencyId: string, updates: Partial<Dependency>): Promise<FileOperationResult<Dependency>> {
    await this.ensureInitialized();
    return this.dependencyStorage.updateDependency(dependencyId, updates);
  }

  async deleteDependency(dependencyId: string): Promise<FileOperationResult<void>> {
    await this.ensureInitialized();
    return this.dependencyStorage.deleteDependency(dependencyId);
  }

  async listDependencies(projectId?: string): Promise<FileOperationResult<Dependency[]>> {
    await this.ensureInitialized();
    return this.dependencyStorage.listDependencies(projectId);
  }

  async getDependenciesForTask(taskId: string): Promise<FileOperationResult<Dependency[]>> {
    await this.ensureInitialized();
    return this.dependencyStorage.getDependenciesForTask(taskId);
  }

  async getDependentsForTask(taskId: string): Promise<FileOperationResult<Dependency[]>> {
    await this.ensureInitialized();
    return this.dependencyStorage.getDependentsForTask(taskId);
  }

  async dependencyExists(dependencyId: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.dependencyStorage.dependencyExists(dependencyId);
  }

  // Dependency Graph Operations
  async saveDependencyGraph(projectId: string, graph: DependencyGraph): Promise<FileOperationResult<void>> {
    await this.ensureInitialized();
    return this.dependencyStorage.saveDependencyGraph(projectId, graph);
  }

  async loadDependencyGraph(projectId: string): Promise<FileOperationResult<DependencyGraph>> {
    await this.ensureInitialized();
    return this.dependencyStorage.loadDependencyGraph(projectId);
  }

  async deleteDependencyGraph(projectId: string): Promise<FileOperationResult<void>> {
    await this.ensureInitialized();
    return this.dependencyStorage.deleteDependencyGraph(projectId);
  }
}

/**
 * Convenience function to get configured storage manager instance
 */
export async function getStorageManager(): Promise<StorageManager> {
  const config = await getVibeTaskManagerConfig();
  const dataDirectory = config?.taskManager?.dataDirectory;

  const storageManager = StorageManager.getInstance(dataDirectory);

  // Ensure it's initialized
  const initResult = await storageManager.initialize();
  if (!initResult.success) {
    throw new Error(`Failed to initialize storage manager: ${initResult.error}`);
  }

  return storageManager;
}
