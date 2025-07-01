import path from 'path';
import { FileUtils, FileOperationResult } from '../../utils/file-utils.js';
import { Dependency, DependencyGraph } from '../../types/dependency.js';
import { getVibeTaskManagerOutputDir } from '../../utils/config-loader.js';
import logger from '../../../../logger.js';

/**
 * Dependency index structure
 */
interface DependencyIndex {
  dependencies: Array<{
    id: string;
    fromTaskId: string;
    toTaskId: string;
    type: string;
    critical: boolean;
    createdAt: Date;
  }>;
  lastUpdated: string;
  version: string;
}

/**
 * Type guard for dependency index
 */
function isDependencyIndex(data: unknown): data is DependencyIndex {
  if (!data || typeof data !== 'object') return false;
  const index = data as Record<string, unknown>;
  return Array.isArray(index.dependencies) && 
         typeof index.lastUpdated === 'string' && 
         typeof index.version === 'string';
}

/**
 * Dependency storage interface
 */
export interface DependencyStorageOperations {
  createDependency(dependency: Dependency): Promise<FileOperationResult<Dependency>>;
  getDependency(dependencyId: string): Promise<FileOperationResult<Dependency>>;
  updateDependency(dependencyId: string, updates: Partial<Dependency>): Promise<FileOperationResult<Dependency>>;
  deleteDependency(dependencyId: string): Promise<FileOperationResult<void>>;
  listDependencies(projectId?: string): Promise<FileOperationResult<Dependency[]>>;
  getDependenciesForTask(taskId: string): Promise<FileOperationResult<Dependency[]>>;
  getDependentsForTask(taskId: string): Promise<FileOperationResult<Dependency[]>>;
  dependencyExists(dependencyId: string): Promise<boolean>;

  // Dependency graph operations
  saveDependencyGraph(projectId: string, graph: DependencyGraph): Promise<FileOperationResult<void>>;
  loadDependencyGraph(projectId: string): Promise<FileOperationResult<DependencyGraph>>;
  deleteDependencyGraph(projectId: string): Promise<FileOperationResult<void>>;
}

/**
 * File-based dependency storage implementation
 */
export class DependencyStorage implements DependencyStorageOperations {
  private dataDirectory: string;
  private dependenciesDirectory: string;
  private graphsDirectory: string;
  private dependencyIndexFile: string;

  constructor(dataDirectory?: string) {
    this.dataDirectory = dataDirectory || getVibeTaskManagerOutputDir();
    this.dependenciesDirectory = path.join(this.dataDirectory, 'dependencies');
    this.graphsDirectory = path.join(this.dataDirectory, 'dependency-graphs');
    this.dependencyIndexFile = path.join(this.dataDirectory, 'dependencies-index.json');
  }

  /**
   * Initialize storage directories
   */
  async initialize(): Promise<FileOperationResult<void>> {
    try {
      // Ensure directories exist
      const depDirResult = await FileUtils.ensureDirectory(this.dependenciesDirectory);
      if (!depDirResult.success) {
        return depDirResult;
      }

      const graphDirResult = await FileUtils.ensureDirectory(this.graphsDirectory);
      if (!graphDirResult.success) {
        return graphDirResult;
      }

      // Initialize dependency index file if it doesn't exist
      if (!await FileUtils.fileExists(this.dependencyIndexFile)) {
        const indexData = {
          dependencies: [],
          lastUpdated: new Date().toISOString(),
          version: '1.0.0'
        };

        const indexResult = await FileUtils.writeJsonFile(this.dependencyIndexFile, indexData);
        if (!indexResult.success) {
          return indexResult;
        }
      }

      logger.debug({ dataDirectory: this.dataDirectory }, 'Dependency storage initialized');

      return {
        success: true,
        metadata: {
          filePath: this.dataDirectory,
          operation: 'initialize',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, dataDirectory: this.dataDirectory }, 'Failed to initialize dependency storage');

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
   * Create a new dependency
   */
  async createDependency(dependency: Dependency): Promise<FileOperationResult<Dependency>> {
    try {
      logger.info({ dependencyId: dependency.id, from: dependency.fromTaskId, to: dependency.toTaskId }, 'Creating dependency');

      // Validate dependency data
      const validationResult = this.validateDependency(dependency);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Dependency validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: this.getDependencyFilePath(dependency.id),
            operation: 'create_dependency',
            timestamp: new Date()
          }
        };
      }

      // Check if dependency already exists
      if (await this.dependencyExists(dependency.id)) {
        return {
          success: false,
          error: `Dependency with ID ${dependency.id} already exists`,
          metadata: {
            filePath: this.getDependencyFilePath(dependency.id),
            operation: 'create_dependency',
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
      const dependencyToSave = {
        ...dependency,
        metadata: {
          ...dependency.metadata,
          createdAt: new Date()
        }
      };

      // Save dependency file
      const dependencyFilePath = this.getDependencyFilePath(dependency.id);
      const saveResult = await FileUtils.writeYamlFile(dependencyFilePath, dependencyToSave);
      if (!saveResult.success) {
        return {
          success: false,
          error: `Failed to save dependency: ${saveResult.error}`,
          metadata: saveResult.metadata
        };
      }

      // Update index
      const indexUpdateResult = await this.updateIndex('add', dependency.id, {
        id: dependency.id,
        fromTaskId: dependency.fromTaskId,
        toTaskId: dependency.toTaskId,
        type: dependency.type,
        critical: dependency.critical,
        createdAt: dependencyToSave.metadata.createdAt
      });

      if (!indexUpdateResult.success) {
        // Try to clean up the dependency file if index update failed
        await FileUtils.deleteFile(dependencyFilePath);
        return {
          success: false,
          error: `Failed to update index: ${indexUpdateResult.error}`,
          metadata: indexUpdateResult.metadata
        };
      }

      logger.info({ dependencyId: dependency.id }, 'Dependency created successfully');

      return {
        success: true,
        data: dependencyToSave,
        metadata: {
          filePath: dependencyFilePath,
          operation: 'create_dependency',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, dependencyId: dependency.id }, 'Failed to create dependency');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getDependencyFilePath(dependency.id),
          operation: 'create_dependency',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get a dependency by ID
   */
  async getDependency(dependencyId: string): Promise<FileOperationResult<Dependency>> {
    try {
      logger.debug({ dependencyId }, 'Getting dependency');

      const dependencyFilePath = this.getDependencyFilePath(dependencyId);

      if (!await FileUtils.fileExists(dependencyFilePath)) {
        return {
          success: false,
          error: `Dependency ${dependencyId} not found`,
          metadata: {
            filePath: dependencyFilePath,
            operation: 'get_dependency',
            timestamp: new Date()
          }
        };
      }

      const loadResult = await FileUtils.readYamlFile<Dependency>(dependencyFilePath);
      if (!loadResult.success) {
        return {
          success: false,
          error: `Failed to load dependency: ${loadResult.error}`,
          metadata: loadResult.metadata
        };
      }

      return {
        success: true,
        data: loadResult.data!,
        metadata: {
          filePath: dependencyFilePath,
          operation: 'get_dependency',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, dependencyId }, 'Failed to get dependency');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getDependencyFilePath(dependencyId),
          operation: 'get_dependency',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Update a dependency
   */
  async updateDependency(dependencyId: string, updates: Partial<Dependency>): Promise<FileOperationResult<Dependency>> {
    try {
      logger.info({ dependencyId, updates: Object.keys(updates) }, 'Updating dependency');

      // Get existing dependency
      const getResult = await this.getDependency(dependencyId);
      if (!getResult.success) {
        return getResult;
      }

      const existingDependency = getResult.data!;

      // Merge updates
      const updatedDependency: Dependency = {
        ...existingDependency,
        ...updates,
        id: dependencyId, // Ensure ID cannot be changed
        metadata: {
          ...existingDependency.metadata,
          ...updates.metadata,
          createdAt: existingDependency.metadata.createdAt // Preserve creation time
        }
      };

      // Validate updated dependency
      const validationResult = this.validateDependency(updatedDependency);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Dependency validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: this.getDependencyFilePath(dependencyId),
            operation: 'update_dependency',
            timestamp: new Date()
          }
        };
      }

      // Save updated dependency
      const dependencyFilePath = this.getDependencyFilePath(dependencyId);
      const saveResult = await FileUtils.writeYamlFile(dependencyFilePath, updatedDependency);
      if (!saveResult.success) {
        return {
          success: false,
          error: `Failed to save updated dependency: ${saveResult.error}`,
          metadata: saveResult.metadata
        };
      }

      // Update index
      const indexUpdateResult = await this.updateIndex('update', dependencyId, {
        id: updatedDependency.id,
        fromTaskId: updatedDependency.fromTaskId,
        toTaskId: updatedDependency.toTaskId,
        type: updatedDependency.type,
        critical: updatedDependency.critical,
        createdAt: updatedDependency.metadata.createdAt
      });

      if (!indexUpdateResult.success) {
        logger.warn({ dependencyId, error: indexUpdateResult.error }, 'Failed to update index, but dependency was saved');
      }

      logger.info({ dependencyId }, 'Dependency updated successfully');

      return {
        success: true,
        data: updatedDependency,
        metadata: {
          filePath: dependencyFilePath,
          operation: 'update_dependency',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, dependencyId }, 'Failed to update dependency');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getDependencyFilePath(dependencyId),
          operation: 'update_dependency',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Delete a dependency
   */
  async deleteDependency(dependencyId: string): Promise<FileOperationResult<void>> {
    try {
      logger.info({ dependencyId }, 'Deleting dependency');

      // Check if dependency exists
      if (!await this.dependencyExists(dependencyId)) {
        return {
          success: false,
          error: `Dependency ${dependencyId} not found`,
          metadata: {
            filePath: this.getDependencyFilePath(dependencyId),
            operation: 'delete_dependency',
            timestamp: new Date()
          }
        };
      }

      // Delete dependency file
      const dependencyFilePath = this.getDependencyFilePath(dependencyId);
      const deleteResult = await FileUtils.deleteFile(dependencyFilePath);
      if (!deleteResult.success) {
        return {
          success: false,
          error: `Failed to delete dependency file: ${deleteResult.error}`,
          metadata: deleteResult.metadata
        };
      }

      // Update index
      const indexUpdateResult = await this.updateIndex('remove', dependencyId);
      if (!indexUpdateResult.success) {
        logger.warn({ dependencyId, error: indexUpdateResult.error }, 'Failed to update index, but dependency file was deleted');
      }

      logger.info({ dependencyId }, 'Dependency deleted successfully');

      return {
        success: true,
        metadata: {
          filePath: dependencyFilePath,
          operation: 'delete_dependency',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, dependencyId }, 'Failed to delete dependency');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getDependencyFilePath(dependencyId),
          operation: 'delete_dependency',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * List all dependencies with optional project filtering
   */
  async listDependencies(projectId?: string): Promise<FileOperationResult<Dependency[]>> {
    try {
      logger.debug({ projectId }, 'Listing dependencies');

      // Load index
      const indexResult = await this.loadIndex();
      if (!indexResult.success) {
        return {
          success: false,
          error: `Failed to load dependency index: ${indexResult.error}`,
          metadata: indexResult.metadata
        };
      }

      const index = indexResult.data!;
      const dependencies: Dependency[] = [];

      // Load each dependency
      for (const dependencyInfo of index.dependencies) {
        const dependencyResult = await this.getDependency(dependencyInfo.id);
        if (dependencyResult.success) {
          const dependency = dependencyResult.data!;

          // Apply project filter if specified
          if (!projectId || this.isDependencyInProject(dependency, projectId)) {
            dependencies.push(dependency);
          }
        } else {
          logger.warn({ dependencyId: dependencyInfo.id, error: dependencyResult.error }, 'Failed to load dependency from index');
        }
      }

      return {
        success: true,
        data: dependencies,
        metadata: {
          filePath: this.dependencyIndexFile,
          operation: 'list_dependencies',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, projectId }, 'Failed to list dependencies');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.dependencyIndexFile,
          operation: 'list_dependencies',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get dependencies for a specific task (tasks this task depends on)
   */
  async getDependenciesForTask(taskId: string): Promise<FileOperationResult<Dependency[]>> {
    const listResult = await this.listDependencies();
    if (!listResult.success) {
      return listResult;
    }

    const dependencies = listResult.data!.filter(dep => dep.fromTaskId === taskId);

    return {
      success: true,
      data: dependencies,
      metadata: {
        filePath: this.dependencyIndexFile,
        operation: 'get_dependencies_for_task',
        timestamp: new Date()
      }
    };
  }

  /**
   * Get dependents for a specific task (tasks that depend on this task)
   */
  async getDependentsForTask(taskId: string): Promise<FileOperationResult<Dependency[]>> {
    const listResult = await this.listDependencies();
    if (!listResult.success) {
      return listResult;
    }

    const dependents = listResult.data!.filter(dep => dep.toTaskId === taskId);

    return {
      success: true,
      data: dependents,
      metadata: {
        filePath: this.dependencyIndexFile,
        operation: 'get_dependents_for_task',
        timestamp: new Date()
      }
    };
  }

  /**
   * Check if dependency exists
   */
  async dependencyExists(dependencyId: string): Promise<boolean> {
    const dependencyFilePath = this.getDependencyFilePath(dependencyId);
    return await FileUtils.fileExists(dependencyFilePath);
  }

  /**
   * Save dependency graph for a project
   */
  async saveDependencyGraph(projectId: string, graph: DependencyGraph): Promise<FileOperationResult<void>> {
    try {
      logger.info({ projectId }, 'Saving dependency graph');

      const graphFilePath = this.getGraphFilePath(projectId);

      // Ensure graphs directory exists
      const initResult = await this.initialize();
      if (!initResult.success) {
        return initResult;
      }

      // Convert Map to object for serialization
      const graphToSave = {
        ...graph,
        nodes: Object.fromEntries(graph.nodes),
        metadata: {
          ...graph.metadata,
          generatedAt: new Date()
        }
      };

      const saveResult = await FileUtils.writeJsonFile(graphFilePath, graphToSave);
      if (!saveResult.success) {
        return saveResult;
      }

      logger.info({ projectId }, 'Dependency graph saved successfully');

      return {
        success: true,
        metadata: {
          filePath: graphFilePath,
          operation: 'save_dependency_graph',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, projectId }, 'Failed to save dependency graph');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getGraphFilePath(projectId),
          operation: 'save_dependency_graph',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Load dependency graph for a project
   */
  async loadDependencyGraph(projectId: string): Promise<FileOperationResult<DependencyGraph>> {
    try {
      logger.debug({ projectId }, 'Loading dependency graph');

      const graphFilePath = this.getGraphFilePath(projectId);

      if (!await FileUtils.fileExists(graphFilePath)) {
        return {
          success: false,
          error: `Dependency graph for project ${projectId} not found`,
          metadata: {
            filePath: graphFilePath,
            operation: 'load_dependency_graph',
            timestamp: new Date()
          }
        };
      }

      const loadResult = await FileUtils.readJsonFile(graphFilePath);
      if (!loadResult.success) {
        return {
          success: false,
          error: `Failed to load dependency graph: ${loadResult.error}`,
          metadata: loadResult.metadata
        };
      }

      const graphData = loadResult.data!;

      // Convert object back to Map with proper typing
      const graphData_: Record<string, unknown> = graphData as Record<string, unknown>;
      
      // Safe type guards for array and object properties
      const edges = Array.isArray(graphData_.edges) ? graphData_.edges : [];
      const executionOrder = Array.isArray(graphData_.executionOrder) ? graphData_.executionOrder : [];
      const criticalPath = Array.isArray(graphData_.criticalPath) ? graphData_.criticalPath : [];
      
      // Safe extraction of statistics with defaults
      const statisticsData = graphData_.statistics && typeof graphData_.statistics === 'object' ? graphData_.statistics as Record<string, unknown> : {};
      const statistics = {
        totalTasks: typeof statisticsData.totalTasks === 'number' ? statisticsData.totalTasks : 0,
        totalDependencies: typeof statisticsData.totalDependencies === 'number' ? statisticsData.totalDependencies : 0,
        maxDepth: typeof statisticsData.maxDepth === 'number' ? statisticsData.maxDepth : 0,
        cyclicDependencies: Array.isArray(statisticsData.cyclicDependencies) ? statisticsData.cyclicDependencies : [],
        orphanedTasks: Array.isArray(statisticsData.orphanedTasks) ? statisticsData.orphanedTasks : []
      };
      
      // Safe extraction of metadata with defaults
      const metadataData = graphData_.metadata && typeof graphData_.metadata === 'object' ? graphData_.metadata as Record<string, unknown> : {};
      const metadata = {
        generatedAt: typeof metadataData.generatedAt === 'string' || typeof metadataData.generatedAt === 'number' 
          ? new Date(metadataData.generatedAt) 
          : new Date(),
        version: typeof metadataData.version === 'string' ? metadataData.version : '1.0.0',
        isValid: typeof metadataData.isValid === 'boolean' ? metadataData.isValid : true,
        validationErrors: Array.isArray(metadataData.validationErrors) ? metadataData.validationErrors : []
      };
      
      const graph: DependencyGraph = {
        projectId: (graphData_.projectId as string) || '',
        nodes: new Map(Object.entries(graphData_.nodes || {})),
        edges,
        executionOrder,
        criticalPath,
        statistics,
        metadata
      };

      return {
        success: true,
        data: graph,
        metadata: {
          filePath: graphFilePath,
          operation: 'load_dependency_graph',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, projectId }, 'Failed to load dependency graph');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getGraphFilePath(projectId),
          operation: 'load_dependency_graph',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Delete dependency graph for a project
   */
  async deleteDependencyGraph(projectId: string): Promise<FileOperationResult<void>> {
    try {
      logger.info({ projectId }, 'Deleting dependency graph');

      const graphFilePath = this.getGraphFilePath(projectId);

      if (!await FileUtils.fileExists(graphFilePath)) {
        return {
          success: true, // Consider it deleted if it doesn't exist
          metadata: {
            filePath: graphFilePath,
            operation: 'delete_dependency_graph',
            timestamp: new Date()
          }
        };
      }

      const deleteResult = await FileUtils.deleteFile(graphFilePath);
      if (!deleteResult.success) {
        return deleteResult;
      }

      logger.info({ projectId }, 'Dependency graph deleted successfully');

      return {
        success: true,
        metadata: {
          filePath: graphFilePath,
          operation: 'delete_dependency_graph',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, projectId }, 'Failed to delete dependency graph');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getGraphFilePath(projectId),
          operation: 'delete_dependency_graph',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get dependency file path
   */
  private getDependencyFilePath(dependencyId: string): string {
    return path.join(this.dependenciesDirectory, `${dependencyId}.yaml`);
  }

  /**
   * Get dependency graph file path
   */
  private getGraphFilePath(projectId: string): string {
    return path.join(this.graphsDirectory, `${projectId}-graph.json`);
  }

  /**
   * Validate dependency data
   */
  private validateDependency(dependency: Dependency): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!dependency.id || typeof dependency.id !== 'string') {
      errors.push('Dependency ID is required and must be a string');
    }

    if (!dependency.fromTaskId || typeof dependency.fromTaskId !== 'string') {
      errors.push('From task ID is required and must be a string');
    }

    if (!dependency.toTaskId || typeof dependency.toTaskId !== 'string') {
      errors.push('To task ID is required and must be a string');
    }

    if (dependency.fromTaskId === dependency.toTaskId) {
      errors.push('A task cannot depend on itself');
    }

    if (!['blocks', 'enables', 'requires', 'suggests'].includes(dependency.type)) {
      errors.push('Dependency type must be one of: blocks, enables, requires, suggests');
    }

    if (!dependency.description || typeof dependency.description !== 'string') {
      errors.push('Dependency description is required and must be a string');
    }

    if (typeof dependency.critical !== 'boolean') {
      errors.push('Critical flag must be a boolean');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if dependency belongs to a project (helper method)
   */
  private isDependencyInProject(_dependency: Dependency, _projectId: string): boolean {
    // This would need to be implemented based on how we determine project membership
    // For now, we'll assume all dependencies belong to all projects
    return true;
  }

  /**
   * Load dependency index with proper typing
   */
  private async loadIndex(): Promise<FileOperationResult<DependencyIndex>> {
    if (!await FileUtils.fileExists(this.dependencyIndexFile)) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        return initResult as FileOperationResult<DependencyIndex>;
      }
    }

    const result = await FileUtils.readJsonFile(this.dependencyIndexFile);
    if (!result.success) {
      return result as FileOperationResult<DependencyIndex>;
    }

    // Validate the loaded data
    if (!isDependencyIndex(result.data)) {
      return {
        success: false,
        error: 'Invalid dependency index format',
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
   * Update dependency index
   */
  private async updateIndex(operation: 'add' | 'update' | 'remove', dependencyId: string, dependencyInfo?: DependencyIndex['dependencies'][0]): Promise<FileOperationResult<void>> {
    try {
      const indexResult = await this.loadIndex();
      if (!indexResult.success) {
        return indexResult as FileOperationResult<void>;
      }

      const index = indexResult.data!;

      switch (operation) {
        case 'add':
          if (!index.dependencies.find(d => d.id === dependencyId) && dependencyInfo) {
            index.dependencies.push(dependencyInfo);
          }
          break;

        case 'update': {
          const updateIndex = index.dependencies.findIndex(d => d.id === dependencyId);
          if (updateIndex !== -1 && dependencyInfo) {
            index.dependencies[updateIndex] = dependencyInfo;
          }
          break;
        }

        case 'remove':
          index.dependencies = index.dependencies.filter(d => d.id !== dependencyId);
          break;
      }

      (index as DependencyIndex).lastUpdated = new Date().toISOString();

      return await FileUtils.writeJsonFile(this.dependencyIndexFile, index);

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.dependencyIndexFile,
          operation: 'update_index',
          timestamp: new Date()
        }
      };
    }
  }
}
