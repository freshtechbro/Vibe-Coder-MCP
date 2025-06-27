import { Dependency, DependencyType, DependencyGraph, DependencyNode } from '../../types/dependency.js';
import { AtomicTask } from '../../types/task.js';
import { getStorageManager } from '../storage/storage-manager.js';
import { getIdGenerator } from '../../utils/id-generator.js';
import { FileOperationResult } from '../../utils/file-utils.js';
import { DependencyValidator } from '../../services/dependency-validator.js';
import logger from '../../../../logger.js';

/**
 * Dependency creation parameters
 */
export interface CreateDependencyParams {
  fromTaskId: string;
  toTaskId: string;
  type: DependencyType;
  description: string;
  critical?: boolean;
}

/**
 * Dependency update parameters
 */
export interface UpdateDependencyParams {
  type?: DependencyType;
  description?: string;
  critical?: boolean;
}

/**
 * Dependency validation result
 */
export interface DependencyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Dependency operations service
 */
export class DependencyOperations {
  private static instance: DependencyOperations;
  private validator: DependencyValidator;

  private constructor() {
    this.validator = new DependencyValidator();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DependencyOperations {
    if (!DependencyOperations.instance) {
      DependencyOperations.instance = new DependencyOperations();
    }
    return DependencyOperations.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    DependencyOperations.instance = undefined as any;
  }

  /**
   * Create a new dependency with validation
   */
  async createDependency(params: CreateDependencyParams, createdBy: string = 'system'): Promise<FileOperationResult<Dependency>> {
    try {
      logger.info({
        fromTaskId: params.fromTaskId,
        toTaskId: params.toTaskId,
        type: params.type,
        createdBy
      }, 'Creating new dependency');

      // Validate input parameters
      const validationResult = this.validateCreateParams(params);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Dependency creation validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: 'dependency-operations',
            operation: 'create_dependency',
            timestamp: new Date()
          }
        };
      }

      // Verify both tasks exist
      const storageManager = await getStorageManager();

      const fromTaskExists = await storageManager.taskExists(params.fromTaskId);
      if (!fromTaskExists) {
        return {
          success: false,
          error: `From task ${params.fromTaskId} not found`,
          metadata: {
            filePath: 'dependency-operations',
            operation: 'create_dependency',
            timestamp: new Date()
          }
        };
      }

      const toTaskExists = await storageManager.taskExists(params.toTaskId);
      if (!toTaskExists) {
        return {
          success: false,
          error: `To task ${params.toTaskId} not found`,
          metadata: {
            filePath: 'dependency-operations',
            operation: 'create_dependency',
            timestamp: new Date()
          }
        };
      }

      // Enhanced dependency validation using DependencyValidator
      const enhancedValidation = await this.validator.validateDependencyBeforeCreation(
        params.fromTaskId,
        params.toTaskId,
        'project-id' // TODO: Get actual project ID from task
      );

      if (!enhancedValidation.isValid) {
        const criticalErrors = enhancedValidation.errors.filter(e => e.severity === 'critical' || e.severity === 'high');
        if (criticalErrors.length > 0) {
          return {
            success: false,
            error: `Dependency validation failed: ${criticalErrors.map(e => e.message).join(', ')}`,
            metadata: {
              filePath: 'dependency-operations',
              operation: 'create_dependency',
              timestamp: new Date()
            }
          };
        }

        // Log warnings for non-critical issues
        if (enhancedValidation.warnings.length > 0) {
          logger.warn({
            fromTaskId: params.fromTaskId,
            toTaskId: params.toTaskId,
            warnings: enhancedValidation.warnings.map(w => w.message)
          }, 'Dependency creation warnings detected');
        }
      }

      // Check for circular dependencies (legacy check as fallback)
      const circularCheckResult = await this.checkCircularDependency(params.fromTaskId, params.toTaskId);
      if (!circularCheckResult.valid) {
        return {
          success: false,
          error: `Circular dependency detected: ${circularCheckResult.errors.join(', ')}`,
          metadata: {
            filePath: 'dependency-operations',
            operation: 'create_dependency',
            timestamp: new Date()
          }
        };
      }

      // Generate unique dependency ID
      const idGenerator = getIdGenerator();
      const idResult = await idGenerator.generateDependencyId(params.fromTaskId, params.toTaskId);

      if (!idResult.success) {
        return {
          success: false,
          error: `Failed to generate dependency ID: ${idResult.error}`,
          metadata: {
            filePath: 'dependency-operations',
            operation: 'create_dependency',
            timestamp: new Date()
          }
        };
      }

      const dependencyId = idResult.id!;

      // Create dependency object
      const dependency: Dependency = {
        id: dependencyId,
        fromTaskId: params.fromTaskId,
        toTaskId: params.toTaskId,
        type: params.type,
        description: params.description,
        critical: params.critical || false,
        metadata: {
          createdAt: new Date(),
          createdBy,
          reason: params.description
        }
      };

      // Save dependency to storage
      const createResult = await storageManager.createDependency(dependency);

      if (!createResult.success) {
        return {
          success: false,
          error: `Failed to save dependency: ${createResult.error}`,
          metadata: createResult.metadata
        };
      }

      // Update task dependency lists
      await this.updateTaskDependencyLists(params.fromTaskId, params.toTaskId, dependencyId);

      logger.info({ dependencyId, fromTaskId: params.fromTaskId, toTaskId: params.toTaskId }, 'Dependency created successfully');

      return {
        success: true,
        data: createResult.data!,
        metadata: {
          filePath: 'dependency-operations',
          operation: 'create_dependency',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, fromTaskId: params.fromTaskId, toTaskId: params.toTaskId }, 'Failed to create dependency');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'dependency-operations',
          operation: 'create_dependency',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get dependency by ID
   */
  async getDependency(dependencyId: string): Promise<FileOperationResult<Dependency>> {
    try {
      logger.debug({ dependencyId }, 'Getting dependency');

      const storageManager = await getStorageManager();
      return await storageManager.getDependency(dependencyId);

    } catch (error) {
      logger.error({ err: error, dependencyId }, 'Failed to get dependency');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'dependency-operations',
          operation: 'get_dependency',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Update dependency
   */
  async updateDependency(dependencyId: string, params: UpdateDependencyParams, updatedBy: string = 'system'): Promise<FileOperationResult<Dependency>> {
    try {
      logger.info({ dependencyId, updates: Object.keys(params), updatedBy }, 'Updating dependency');

      // Validate update parameters
      const validationResult = this.validateUpdateParams(params);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Dependency update validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: 'dependency-operations',
            operation: 'update_dependency',
            timestamp: new Date()
          }
        };
      }

      // Prepare update object
      const updates: Partial<Dependency> = {
        ...params
      };

      // Update dependency in storage
      const storageManager = await getStorageManager();
      const updateResult = await storageManager.updateDependency(dependencyId, updates);

      if (!updateResult.success) {
        return {
          success: false,
          error: `Failed to update dependency: ${updateResult.error}`,
          metadata: updateResult.metadata
        };
      }

      logger.info({ dependencyId }, 'Dependency updated successfully');

      return {
        success: true,
        data: updateResult.data!,
        metadata: {
          filePath: 'dependency-operations',
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
          filePath: 'dependency-operations',
          operation: 'update_dependency',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Delete dependency
   */
  async deleteDependency(dependencyId: string, deletedBy: string = 'system'): Promise<FileOperationResult<void>> {
    try {
      logger.info({ dependencyId, deletedBy }, 'Deleting dependency');

      const storageManager = await getStorageManager();

      // Get dependency details before deletion
      const dependencyResult = await storageManager.getDependency(dependencyId);
      if (!dependencyResult.success) {
        return {
          success: false,
          error: `Dependency ${dependencyId} not found`,
          metadata: {
            filePath: 'dependency-operations',
            operation: 'delete_dependency',
            timestamp: new Date()
          }
        };
      }

      const dependency = dependencyResult.data!;

      // Delete dependency from storage
      const deleteResult = await storageManager.deleteDependency(dependencyId);

      if (!deleteResult.success) {
        return {
          success: false,
          error: `Failed to delete dependency: ${deleteResult.error}`,
          metadata: deleteResult.metadata
        };
      }

      // Update task dependency lists
      await this.removeFromTaskDependencyLists(dependency.fromTaskId, dependency.toTaskId, dependencyId);

      logger.info({ dependencyId }, 'Dependency deleted successfully');

      return {
        success: true,
        metadata: {
          filePath: 'dependency-operations',
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
          filePath: 'dependency-operations',
          operation: 'delete_dependency',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get dependencies for a task (tasks this task depends on)
   */
  async getDependenciesForTask(taskId: string): Promise<FileOperationResult<Dependency[]>> {
    try {
      logger.debug({ taskId }, 'Getting dependencies for task');

      const storageManager = await getStorageManager();
      return await storageManager.getDependenciesForTask(taskId);

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to get dependencies for task');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'dependency-operations',
          operation: 'get_dependencies_for_task',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get dependents for a task (tasks that depend on this task)
   */
  async getDependentsForTask(taskId: string): Promise<FileOperationResult<Dependency[]>> {
    try {
      logger.debug({ taskId }, 'Getting dependents for task');

      const storageManager = await getStorageManager();
      return await storageManager.getDependentsForTask(taskId);

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to get dependents for task');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'dependency-operations',
          operation: 'get_dependents_for_task',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Generate dependency graph for a project
   */
  async generateDependencyGraph(projectId: string): Promise<FileOperationResult<DependencyGraph>> {
    try {
      logger.info({ projectId }, 'Generating dependency graph');

      const storageManager = await getStorageManager();

      // Get all tasks for the project
      const tasksResult = await storageManager.listTasks(projectId);
      if (!tasksResult.success) {
        return {
          success: false,
          error: `Failed to get tasks for project: ${tasksResult.error}`,
          metadata: tasksResult.metadata
        };
      }

      // Get all dependencies for the project
      const dependenciesResult = await storageManager.listDependencies(projectId);
      if (!dependenciesResult.success) {
        return {
          success: false,
          error: `Failed to get dependencies for project: ${dependenciesResult.error}`,
          metadata: dependenciesResult.metadata
        };
      }

      const tasks = tasksResult.data!;
      const dependencies = dependenciesResult.data!;

      // Build dependency graph
      const nodes = new Map<string, DependencyNode>();
      const edges: Dependency[] = [];

      // Create nodes for all tasks
      for (const task of tasks) {
        nodes.set(task.id, {
          taskId: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          estimatedHours: task.estimatedHours,
          dependencies: [],
          dependents: [],
          depth: 0,
          criticalPath: false
        });
      }

      // Add edges and update node relationships
      for (const dependency of dependencies) {
        edges.push(dependency);

        // Update node dependencies
        const fromNode = nodes.get(dependency.fromTaskId);
        const toNode = nodes.get(dependency.toTaskId);

        if (fromNode) {
          fromNode.dependencies.push(dependency.toTaskId);
        }

        if (toNode) {
          toNode.dependents.push(dependency.fromTaskId);
        }
      }

      // Calculate execution order and critical path
      const executionOrder = this.calculateExecutionOrder(nodes, edges);
      const criticalPath = this.calculateCriticalPath(nodes, edges);

      const graph: DependencyGraph = {
        projectId,
        nodes,
        edges,
        executionOrder,
        criticalPath,
        statistics: {
          totalTasks: tasks.length,
          totalDependencies: dependencies.length,
          maxDepth: Math.max(...Array.from(nodes.values()).map(node => node.depth)),
          cyclicDependencies: [],
          orphanedTasks: []
        },
        metadata: {
          generatedAt: new Date(),
          version: '1.0.0',
          isValid: true,
          validationErrors: []
        }
      };

      // Save graph to storage
      const saveResult = await storageManager.saveDependencyGraph(projectId, graph);
      if (!saveResult.success) {
        logger.warn({ projectId, error: saveResult.error }, 'Failed to save dependency graph, but generation succeeded');
      }

      logger.info({ projectId, taskCount: tasks.length, dependencyCount: dependencies.length }, 'Dependency graph generated successfully');

      return {
        success: true,
        data: graph,
        metadata: {
          filePath: 'dependency-operations',
          operation: 'generate_dependency_graph',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, projectId }, 'Failed to generate dependency graph');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'dependency-operations',
          operation: 'generate_dependency_graph',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Validate all dependencies for a project using enhanced validation
   */
  async validateProjectDependencies(projectId: string): Promise<FileOperationResult<any>> {
    try {
      logger.info({ projectId }, 'Starting enhanced dependency validation for project');

      const validationResult = await this.validator.validateProjectDependencies(projectId);

      logger.info({
        projectId,
        isValid: validationResult.isValid,
        errorsFound: validationResult.errors.length,
        warningsFound: validationResult.warnings.length,
        suggestionsFound: validationResult.suggestions.length,
        circularDependencies: validationResult.circularDependencies.length,
        validationTime: validationResult.metadata.validationTime
      }, 'Enhanced dependency validation completed');

      return {
        success: true,
        data: validationResult,
        metadata: {
          filePath: 'dependency-operations',
          operation: 'validate_project_dependencies',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, projectId }, 'Failed to validate project dependencies');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'dependency-operations',
          operation: 'validate_project_dependencies',
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

      const storageManager = await getStorageManager();
      return await storageManager.loadDependencyGraph(projectId);

    } catch (error) {
      logger.error({ err: error, projectId }, 'Failed to load dependency graph');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'dependency-operations',
          operation: 'load_dependency_graph',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Check for circular dependencies
   */
  private async checkCircularDependency(fromTaskId: string, toTaskId: string): Promise<DependencyValidationResult> {
    try {
      const storageManager = await getStorageManager();

      // Get existing dependencies for the "to" task
      const dependenciesResult = await storageManager.getDependenciesForTask(toTaskId);
      if (!dependenciesResult.success) {
        return { valid: true, errors: [], warnings: [] }; // If we can't check, allow it
      }

      // Check if adding this dependency would create a cycle
      const visited = new Set<string>();
      const recursionStack = new Set<string>();

      const hasCycle = async (taskId: string): Promise<boolean> => {
        if (recursionStack.has(taskId)) {
          return true; // Cycle detected
        }

        if (visited.has(taskId)) {
          return false; // Already processed
        }

        visited.add(taskId);
        recursionStack.add(taskId);

        // If we reach the original fromTaskId, we have a cycle
        if (taskId === fromTaskId) {
          return true;
        }

        // Check all dependencies of this task
        const taskDepsResult = await storageManager.getDependenciesForTask(taskId);
        if (taskDepsResult.success) {
          for (const dep of taskDepsResult.data!) {
            if (await hasCycle(dep.toTaskId)) {
              return true;
            }
          }
        }

        recursionStack.delete(taskId);
        return false;
      };

      const cycleExists = await hasCycle(toTaskId);

      if (cycleExists) {
        return {
          valid: false,
          errors: [`Adding dependency from ${fromTaskId} to ${toTaskId} would create a circular dependency`],
          warnings: []
        };
      }

      return { valid: true, errors: [], warnings: [] };

    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to check for circular dependencies: ${error instanceof Error ? error.message : String(error)}`],
        warnings: []
      };
    }
  }



  /**
   * Update task dependency lists
   */
  private async updateTaskDependencyLists(fromTaskId: string, toTaskId: string, dependencyId: string): Promise<void> {
    try {
      const storageManager = await getStorageManager();

      // Update fromTask's dependencies list
      const fromTaskResult = await storageManager.getTask(fromTaskId);
      if (fromTaskResult.success) {
        const fromTask = fromTaskResult.data!;
        if (!fromTask.dependencies.includes(toTaskId)) {
          fromTask.dependencies.push(toTaskId);
          await storageManager.updateTask(fromTaskId, { dependencies: fromTask.dependencies });
        }
      }

      // Update toTask's dependents list
      const toTaskResult = await storageManager.getTask(toTaskId);
      if (toTaskResult.success) {
        const toTask = toTaskResult.data!;
        if (!toTask.dependents.includes(fromTaskId)) {
          toTask.dependents.push(fromTaskId);
          await storageManager.updateTask(toTaskId, { dependents: toTask.dependents });
        }
      }

    } catch (error) {
      logger.warn({ err: error, fromTaskId, toTaskId, dependencyId }, 'Failed to update task dependency lists');
    }
  }

  /**
   * Remove from task dependency lists
   */
  private async removeFromTaskDependencyLists(fromTaskId: string, toTaskId: string, dependencyId: string): Promise<void> {
    try {
      const storageManager = await getStorageManager();

      // Update fromTask's dependencies list
      const fromTaskResult = await storageManager.getTask(fromTaskId);
      if (fromTaskResult.success) {
        const fromTask = fromTaskResult.data!;
        const index = fromTask.dependencies.indexOf(toTaskId);
        if (index > -1) {
          fromTask.dependencies.splice(index, 1);
          await storageManager.updateTask(fromTaskId, { dependencies: fromTask.dependencies });
        }
      }

      // Update toTask's dependents list
      const toTaskResult = await storageManager.getTask(toTaskId);
      if (toTaskResult.success) {
        const toTask = toTaskResult.data!;
        const index = toTask.dependents.indexOf(fromTaskId);
        if (index > -1) {
          toTask.dependents.splice(index, 1);
          await storageManager.updateTask(toTaskId, { dependents: toTask.dependents });
        }
      }

    } catch (error) {
      logger.warn({ err: error, fromTaskId, toTaskId, dependencyId }, 'Failed to remove from task dependency lists');
    }
  }

  /**
   * Calculate execution order using topological sort
   */
  private calculateExecutionOrder(nodes: Map<string, DependencyNode>, edges: Dependency[]): string[] {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // Initialize
    for (const [taskId] of nodes) {
      inDegree.set(taskId, 0);
      adjList.set(taskId, []);
    }

    // Build adjacency list and calculate in-degrees
    for (const edge of edges) {
      adjList.get(edge.fromTaskId)?.push(edge.toTaskId);
      inDegree.set(edge.toTaskId, (inDegree.get(edge.toTaskId) || 0) + 1);
    }

    // Topological sort
    const queue: string[] = [];
    const result: string[] = [];

    // Add nodes with no dependencies
    for (const [taskId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(taskId);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      // Process neighbors
      for (const neighbor of adjList.get(current) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    return result;
  }

  /**
   * Calculate critical path
   */
  private calculateCriticalPath(nodes: Map<string, DependencyNode>, edges: Dependency[]): string[] {
    // Simplified critical path calculation
    // In a real implementation, this would use the Critical Path Method (CPM)

    const pathLengths = new Map<string, number>();
    const predecessors = new Map<string, string>();

    // Initialize
    for (const [taskId, node] of nodes) {
      pathLengths.set(taskId, node.estimatedHours);
    }

    // Calculate longest path (simplified)
    const executionOrder = this.calculateExecutionOrder(nodes, edges);

    for (const taskId of executionOrder) {
      const node = nodes.get(taskId)!;

      for (const depTaskId of node.dependencies) {
        const currentLength = pathLengths.get(taskId) || 0;
        const depLength = pathLengths.get(depTaskId) || 0;
        const newLength = depLength + node.estimatedHours;

        if (newLength > currentLength) {
          pathLengths.set(taskId, newLength);
          predecessors.set(taskId, depTaskId);
        }
      }
    }

    // Find the task with the longest path
    let maxLength = 0;
    let endTask = '';

    for (const [taskId, length] of pathLengths) {
      if (length > maxLength) {
        maxLength = length;
        endTask = taskId;
      }
    }

    // Reconstruct critical path
    const criticalPath: string[] = [];
    let current = endTask;

    while (current) {
      criticalPath.unshift(current);
      current = predecessors.get(current) || '';
    }

    return criticalPath;
  }

  /**
   * Validate dependency creation parameters
   */
  private validateCreateParams(params: CreateDependencyParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!params.fromTaskId || typeof params.fromTaskId !== 'string') {
      errors.push('From task ID is required and must be a string');
    }

    if (!params.toTaskId || typeof params.toTaskId !== 'string') {
      errors.push('To task ID is required and must be a string');
    }

    if (params.fromTaskId === params.toTaskId) {
      errors.push('A task cannot depend on itself');
    }

    if (!['blocks', 'enables', 'requires', 'suggests'].includes(params.type)) {
      errors.push('Dependency type must be one of: blocks, enables, requires, suggests');
    }

    if (!params.description || typeof params.description !== 'string' || params.description.trim().length === 0) {
      errors.push('Dependency description is required and must be a non-empty string');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate dependency update parameters
   */
  private validateUpdateParams(params: UpdateDependencyParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (params.type !== undefined && !['blocks', 'enables', 'requires', 'suggests'].includes(params.type)) {
      errors.push('Dependency type must be one of: blocks, enables, requires, suggests');
    }

    if (params.description !== undefined) {
      if (typeof params.description !== 'string' || params.description.trim().length === 0) {
        errors.push('Dependency description must be a non-empty string');
      }
    }

    if (params.critical !== undefined && typeof params.critical !== 'boolean') {
      errors.push('Critical flag must be a boolean');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * Convenience function to get dependency operations instance
 */
export function getDependencyOperations(): DependencyOperations {
  return DependencyOperations.getInstance();
}
