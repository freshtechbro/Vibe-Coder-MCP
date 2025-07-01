/**
 * Enhanced Dependency Validator
 *
 * Provides comprehensive dependency validation including circular dependency detection,
 * logical task ordering validation, and dependency graph integrity checks.
 */

import { AtomicTask } from '../types/task.js';
import { Dependency } from '../types/dependency.js';
import { getDependencyOperations } from '../core/operations/dependency-operations.js';
import { getTaskOperations } from '../core/operations/task-operations.js';
import logger from '../../../logger.js';

/**
 * Validation result for dependency checks
 */
export interface DependencyValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: ValidationSuggestion[];
  circularDependencies: CircularDependency[];
  executionOrder: string[];
  metadata: {
    validatedAt: Date;
    validationTime: number;
    tasksValidated: number;
    dependenciesValidated: number;
  };
}

/**
 * Validation error details
 */
export interface ValidationError {
  type: 'circular_dependency' | 'missing_task' | 'invalid_dependency' | 'logical_error' | 'ordering_conflict';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  affectedTasks: string[];
  dependencyId?: string;
  suggestedFix: string;
  autoFixable: boolean;
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  type: 'potential_issue' | 'performance' | 'best_practice' | 'optimization';
  message: string;
  affectedTasks: string[];
  recommendation: string;
  impact: 'low' | 'medium' | 'high';
}

/**
 * Validation suggestion for improvements
 */
export interface ValidationSuggestion {
  type: 'optimization' | 'reordering' | 'parallelization' | 'simplification';
  description: string;
  affectedTasks: string[];
  estimatedBenefit: string;
  implementationComplexity: 'low' | 'medium' | 'high';
}

/**
 * Circular dependency details
 */
export interface CircularDependency {
  cycle: string[];
  severity: 'critical' | 'high' | 'medium';
  description: string;
  resolutionOptions: {
    type: 'remove_dependency' | 'reorder_tasks' | 'split_task' | 'merge_tasks';
    description: string;
    affectedDependencies: string[];
    complexity: 'low' | 'medium' | 'high';
  }[];
}

/**
 * Task ordering validation configuration
 */
export interface OrderingValidationConfig {
  /** Check for logical ordering issues */
  checkLogicalOrdering: boolean;
  /** Validate task type ordering (e.g., setup before implementation) */
  checkTypeOrdering: boolean;
  /** Check for priority conflicts */
  checkPriorityConflicts: boolean;
  /** Validate epic-level ordering */
  checkEpicOrdering: boolean;
  /** Maximum allowed dependency depth */
  maxDependencyDepth: number;
  /** Maximum tasks in a single dependency chain */
  maxChainLength: number;
}

/**
 * Default ordering validation configuration
 */
const DEFAULT_ORDERING_CONFIG: OrderingValidationConfig = {
  checkLogicalOrdering: true,
  checkTypeOrdering: true,
  checkPriorityConflicts: true,
  checkEpicOrdering: true,
  maxDependencyDepth: 10,
  maxChainLength: 20
};

/**
 * Enhanced Dependency Validator Service
 */
export class DependencyValidator {
  private config: OrderingValidationConfig;

  constructor(config: Partial<OrderingValidationConfig> = {}) {
    this.config = { ...DEFAULT_ORDERING_CONFIG, ...config };
  }

  /**
   * Validate all dependencies for a project
   */
  async validateProjectDependencies(projectId: string): Promise<DependencyValidationResult> {
    const startTime = Date.now();

    try {
      logger.info({ projectId }, 'Starting comprehensive dependency validation');

      // Get all tasks and dependencies for the project
      const taskOps = getTaskOperations();
      const dependencyOps = getDependencyOperations();

      const tasksResult = await taskOps.listTasks({ projectId });
      if (!tasksResult.success) {
        throw new Error(`Failed to get tasks for project: ${tasksResult.error}`);
      }

      const tasks = tasksResult.data || [];
      const dependencies: Dependency[] = [];

      // Collect all dependencies
      for (const task of tasks) {
        const taskDepsResult = await dependencyOps.getDependenciesForTask(task.id);
        if (taskDepsResult.success && taskDepsResult.data) {
          dependencies.push(...taskDepsResult.data);
        }
      }

      // Perform comprehensive validation
      const errors: ValidationError[] = [];
      const warnings: ValidationWarning[] = [];
      const suggestions: ValidationSuggestion[] = [];

      // 1. Check for circular dependencies
      const circularDependencies = await this.detectCircularDependencies(tasks, dependencies);
      circularDependencies.forEach(cycle => {
        errors.push({
          type: 'circular_dependency',
          severity: cycle.severity as 'critical' | 'high' | 'medium',
          message: cycle.description,
          affectedTasks: cycle.cycle,
          suggestedFix: cycle.resolutionOptions[0]?.description || 'Remove one dependency from the cycle',
          autoFixable: cycle.resolutionOptions.some(opt => opt.complexity === 'low')
        });
      });

      // 2. Validate logical task ordering
      if (this.config.checkLogicalOrdering) {
        const orderingIssues = await this.validateLogicalOrdering(tasks, dependencies);
        errors.push(...orderingIssues.errors);
        warnings.push(...orderingIssues.warnings);
        suggestions.push(...orderingIssues.suggestions);
      }

      // 3. Validate task type ordering
      if (this.config.checkTypeOrdering) {
        const typeOrderingIssues = await this.validateTaskTypeOrdering(tasks, dependencies);
        warnings.push(...typeOrderingIssues.warnings);
        suggestions.push(...typeOrderingIssues.suggestions);
      }

      // 4. Check for priority conflicts
      if (this.config.checkPriorityConflicts) {
        const priorityIssues = await this.validatePriorityOrdering(tasks, dependencies);
        warnings.push(...priorityIssues.warnings);
        suggestions.push(...priorityIssues.suggestions);
      }

      // 5. Validate dependency depth and chain length
      const depthIssues = await this.validateDependencyDepth(tasks, dependencies);
      warnings.push(...depthIssues.warnings);
      suggestions.push(...depthIssues.suggestions);

      // 6. Generate execution order (if no circular dependencies)
      let executionOrder: string[] = [];
      if (circularDependencies.length === 0) {
        executionOrder = await this.calculateExecutionOrder(tasks, dependencies);
      }

      const validationTime = Date.now() - startTime;

      logger.info({
        projectId,
        isValid: errors.length === 0,
        errorsFound: errors.length,
        warningsFound: warnings.length,
        suggestionsFound: suggestions.length,
        circularDependencies: circularDependencies.length,
        validationTime
      }, 'Dependency validation completed');

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        suggestions,
        circularDependencies,
        executionOrder,
        metadata: {
          validatedAt: new Date(),
          validationTime,
          tasksValidated: tasks.length,
          dependenciesValidated: dependencies.length
        }
      };

    } catch (error) {
      const validationTime = Date.now() - startTime;

      logger.error({
        err: error,
        projectId,
        validationTime
      }, 'Dependency validation failed');

      return {
        isValid: false,
        errors: [{
          type: 'logical_error',
          severity: 'critical',
          message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
          affectedTasks: [],
          suggestedFix: 'Check project data integrity and try again',
          autoFixable: false
        }],
        warnings: [],
        suggestions: [],
        circularDependencies: [],
        executionOrder: [],
        metadata: {
          validatedAt: new Date(),
          validationTime,
          tasksValidated: 0,
          dependenciesValidated: 0
        }
      };
    }
  }

  /**
   * Validate a single dependency before creation
   */
  async validateDependencyBeforeCreation(
    fromTaskId: string,
    toTaskId: string,
    projectId: string
  ): Promise<DependencyValidationResult> {
    const startTime = Date.now();

    try {
      logger.debug({
        fromTaskId,
        toTaskId,
        projectId
      }, 'Validating dependency before creation');

      const errors: ValidationError[] = [];
      const warnings: ValidationWarning[] = [];
      const suggestions: ValidationSuggestion[] = [];

      // Get tasks to validate
      const taskOps = getTaskOperations();
      const fromTaskResult = await taskOps.getTask(fromTaskId);
      const toTaskResult = await taskOps.getTask(toTaskId);

      if (!fromTaskResult.success || !toTaskResult.success) {
        errors.push({
          type: 'missing_task',
          severity: 'critical',
          message: 'One or both tasks do not exist',
          affectedTasks: [fromTaskId, toTaskId],
          suggestedFix: 'Ensure both tasks exist before creating dependency',
          autoFixable: false
        });

        return this.createValidationResult(errors, warnings, suggestions, [], [], startTime, 0, 0);
      }

      const fromTask = fromTaskResult.data!;
      const toTask = toTaskResult.data!;

      // Check for self-dependency
      if (fromTaskId === toTaskId) {
        errors.push({
          type: 'invalid_dependency',
          severity: 'high',
          message: 'A task cannot depend on itself',
          affectedTasks: [fromTaskId],
          suggestedFix: 'Remove self-dependency',
          autoFixable: true
        });
      }

      // Check if this would create a circular dependency
      const wouldCreateCycle = await this.wouldCreateCircularDependency(fromTaskId, toTaskId, projectId);
      if (wouldCreateCycle.wouldCreate) {
        errors.push({
          type: 'circular_dependency',
          severity: 'critical',
          message: `Adding this dependency would create a circular dependency: ${wouldCreateCycle.cyclePath.join(' → ')}`,
          affectedTasks: wouldCreateCycle.cyclePath,
          suggestedFix: 'Reorder tasks or remove conflicting dependencies',
          autoFixable: false
        });
      }

      // Validate logical ordering
      const logicalIssues = await this.validateTaskPairLogic(fromTask, toTask);
      warnings.push(...logicalIssues.warnings);
      suggestions.push(...logicalIssues.suggestions);

      const validationTime = Date.now() - startTime;

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        suggestions,
        circularDependencies: wouldCreateCycle.wouldCreate ? [{
          cycle: wouldCreateCycle.cyclePath,
          severity: 'critical',
          description: `Circular dependency would be created: ${wouldCreateCycle.cyclePath.join(' → ')}`,
          resolutionOptions: [{
            type: 'remove_dependency',
            description: 'Do not create this dependency',
            affectedDependencies: [],
            complexity: 'low'
          }]
        }] : [],
        executionOrder: [],
        metadata: {
          validatedAt: new Date(),
          validationTime,
          tasksValidated: 2,
          dependenciesValidated: 1
        }
      };

    } catch (error) {
      logger.error({
        err: error,
        fromTaskId,
        toTaskId,
        projectId
      }, 'Single dependency validation failed');

      return this.createValidationResult([{
        type: 'logical_error',
        severity: 'critical',
        message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
        affectedTasks: [fromTaskId, toTaskId],
        suggestedFix: 'Check task data and try again',
        autoFixable: false
      }], [], [], [], [], startTime, 0, 0);
    }
  }

  /**
   * Detect circular dependencies using DFS
   */
  private async detectCircularDependencies(
    tasks: AtomicTask[],
    dependencies: Dependency[]
  ): Promise<CircularDependency[]> {
    const cycles: CircularDependency[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const adjacencyList = new Map<string, string[]>();

    // Build adjacency list
    tasks.forEach(task => adjacencyList.set(task.id, []));
    dependencies.forEach(dep => {
      const dependents = adjacencyList.get(dep.fromTaskId) || [];
      dependents.push(dep.toTaskId);
      adjacencyList.set(dep.fromTaskId, dependents);
    });

    const dfs = (taskId: string, path: string[]): boolean => {
      if (recursionStack.has(taskId)) {
        // Found a cycle
        const cycleStart = path.indexOf(taskId);
        const cycle = path.slice(cycleStart).concat([taskId]);

        cycles.push({
          cycle,
          severity: this.determineCycleSeverity(cycle, tasks),
          description: `Circular dependency detected: ${cycle.join(' → ')}`,
          resolutionOptions: this.generateCycleResolutionOptions(cycle, dependencies)
        });
        return true;
      }

      if (visited.has(taskId)) {
        return false;
      }

      visited.add(taskId);
      recursionStack.add(taskId);
      path.push(taskId);

      const dependents = adjacencyList.get(taskId) || [];
      for (const dependent of dependents) {
        if (dfs(dependent, [...path])) {
          // Continue to find all cycles, don't return early
        }
      }

      recursionStack.delete(taskId);
      return false;
    };

    // Check each task as a potential cycle start
    for (const task of tasks) {
      if (!visited.has(task.id)) {
        dfs(task.id, []);
      }
    }

    return cycles;
  }

  /**
   * Check if adding a dependency would create a circular dependency
   */
  private async wouldCreateCircularDependency(
    fromTaskId: string,
    toTaskId: string,
    projectId: string
  ): Promise<{ wouldCreate: boolean; cyclePath: string[] }> {
    try {
      const dependencyOps = getDependencyOperations();
      const visited = new Set<string>();
      const path: string[] = [];

      const dfs = async (currentTaskId: string): Promise<boolean> => {
        if (currentTaskId === fromTaskId) {
          path.push(currentTaskId);
          return true; // Found path back to original task
        }

        if (visited.has(currentTaskId)) {
          return false;
        }

        visited.add(currentTaskId);
        path.push(currentTaskId);

        // Get dependencies for current task
        const depsResult = await dependencyOps.getDependenciesForTask(currentTaskId);
        if (depsResult.success && depsResult.data) {
          for (const dep of depsResult.data) {
            if (await dfs(dep.toTaskId)) {
              return true;
            }
          }
        }

        path.pop();
        return false;
      };

      const wouldCreate = await dfs(toTaskId);
      return {
        wouldCreate,
        cyclePath: wouldCreate ? [fromTaskId, ...path] : []
      };

    } catch (error) {
      logger.warn({
        err: error,
        fromTaskId,
        toTaskId,
        projectId
      }, 'Failed to check for circular dependency');

      return { wouldCreate: false, cyclePath: [] };
    }
  }

  /**
   * Validate logical ordering of tasks
   */
  private async validateLogicalOrdering(
    tasks: AtomicTask[],
    dependencies: Dependency[]
  ): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[]; suggestions: ValidationSuggestion[] }> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: ValidationSuggestion[] = [];

    // Check for logical ordering issues
    for (const dep of dependencies) {
      const fromTask = tasks.find(t => t.id === dep.fromTaskId);
      const toTask = tasks.find(t => t.id === dep.toTaskId);

      if (!fromTask || !toTask) continue;

      // Check for priority conflicts
      const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
      const fromPriority = priorityOrder[fromTask.priority] || 0;
      const toPriority = priorityOrder[toTask.priority] || 0;

      if (fromPriority < toPriority) {
        warnings.push({
          type: 'potential_issue',
          message: `Lower priority task "${fromTask.title}" blocks higher priority task "${toTask.title}"`,
          affectedTasks: [fromTask.id, toTask.id],
          recommendation: 'Consider adjusting task priorities or dependency relationships',
          impact: 'medium'
        });
      }

      // Check for estimated hours conflicts
      if (fromTask.estimatedHours > toTask.estimatedHours * 3) {
        suggestions.push({
          type: 'optimization',
          description: `Large task "${fromTask.title}" (${fromTask.estimatedHours}h) blocks smaller task "${toTask.title}" (${toTask.estimatedHours}h)`,
          affectedTasks: [fromTask.id, toTask.id],
          estimatedBenefit: 'Better parallelization and faster completion',
          implementationComplexity: 'medium'
        });
      }
    }

    return { errors, warnings, suggestions };
  }
  /**
   * Validate task type ordering
   */
  private async validateTaskTypeOrdering(
    tasks: AtomicTask[],
    dependencies: Dependency[]
  ): Promise<{ warnings: ValidationWarning[]; suggestions: ValidationSuggestion[] }> {
    const warnings: ValidationWarning[] = [];
    const suggestions: ValidationSuggestion[] = [];

    // Define logical task type ordering using valid TaskType values
    const typeOrder: Record<string, number> = {
      'research': 1,
      'development': 2,
      'testing': 3,
      'review': 4,
      'deployment': 5,
      'documentation': 6
    };

    for (const dep of dependencies) {
      const fromTask = tasks.find(t => t.id === dep.fromTaskId);
      const toTask = tasks.find(t => t.id === dep.toTaskId);

      if (!fromTask || !toTask) continue;

      const fromOrder = typeOrder[fromTask.type] || 4;
      const toOrder = typeOrder[toTask.type] || 4;

      if (fromOrder > toOrder) {
        warnings.push({
          type: 'best_practice',
          message: `${toTask.type} task "${toTask.title}" depends on ${fromTask.type} task "${fromTask.title}" which typically comes later`,
          affectedTasks: [fromTask.id, toTask.id],
          recommendation: 'Review if this dependency order makes logical sense',
          impact: 'low'
        });
      }
    }

    return { warnings, suggestions };
  }

  /**
   * Validate priority ordering
   */
  private async validatePriorityOrdering(
    tasks: AtomicTask[],
    dependencies: Dependency[]
  ): Promise<{ warnings: ValidationWarning[]; suggestions: ValidationSuggestion[] }> {
    const warnings: ValidationWarning[] = [];
    const suggestions: ValidationSuggestion[] = [];

    const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };

    for (const dep of dependencies) {
      const fromTask = tasks.find(t => t.id === dep.fromTaskId);
      const toTask = tasks.find(t => t.id === dep.toTaskId);

      if (!fromTask || !toTask) continue;

      const fromPriority = priorityOrder[fromTask.priority] || 0;
      const toPriority = priorityOrder[toTask.priority] || 0;

      if (fromPriority < toPriority - 1) { // Allow one level difference
        suggestions.push({
          type: 'reordering',
          description: `Consider increasing priority of "${fromTask.title}" or decreasing priority of "${toTask.title}"`,
          affectedTasks: [fromTask.id, toTask.id],
          estimatedBenefit: 'Better task prioritization and resource allocation',
          implementationComplexity: 'low'
        });
      }
    }

    return { warnings, suggestions };
  }

  /**
   * Validate dependency depth and chain length
   */
  private async validateDependencyDepth(
    tasks: AtomicTask[],
    dependencies: Dependency[]
  ): Promise<{ warnings: ValidationWarning[]; suggestions: ValidationSuggestion[] }> {
    const warnings: ValidationWarning[] = [];
    const suggestions: ValidationSuggestion[] = [];

    // Build adjacency list for depth calculation
    const adjacencyList = new Map<string, string[]>();
    tasks.forEach(task => adjacencyList.set(task.id, []));
    dependencies.forEach(dep => {
      const dependents = adjacencyList.get(dep.fromTaskId) || [];
      dependents.push(dep.toTaskId);
      adjacencyList.set(dep.fromTaskId, dependents);
    });

    // Calculate maximum depth for each task
    const calculateDepth = (taskId: string, visited: Set<string> = new Set()): number => {
      if (visited.has(taskId)) return 0; // Avoid infinite recursion

      visited.add(taskId);
      const dependents = adjacencyList.get(taskId) || [];

      if (dependents.length === 0) return 1;

      const maxDepth = Math.max(...dependents.map(dep => calculateDepth(dep, new Set(visited))));
      return maxDepth + 1;
    };

    for (const task of tasks) {
      const depth = calculateDepth(task.id);

      if (depth > this.config.maxDependencyDepth) {
        warnings.push({
          type: 'performance',
          message: `Task "${task.title}" has dependency depth of ${depth}, exceeding recommended maximum of ${this.config.maxDependencyDepth}`,
          affectedTasks: [task.id],
          recommendation: 'Consider breaking down long dependency chains',
          impact: 'medium'
        });
      }
    }

    return { warnings, suggestions };
  }

  /**
   * Calculate execution order using topological sort
   */
  private async calculateExecutionOrder(tasks: AtomicTask[], dependencies: Dependency[]): Promise<string[]> {
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();

    // Initialize
    tasks.forEach(task => {
      inDegree.set(task.id, 0);
      adjacencyList.set(task.id, []);
    });

    // Build adjacency list and calculate in-degrees
    dependencies.forEach(dep => {
      adjacencyList.get(dep.fromTaskId)?.push(dep.toTaskId);
      inDegree.set(dep.toTaskId, (inDegree.get(dep.toTaskId) || 0) + 1);
    });

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
      const taskId = queue.shift()!;
      result.push(taskId);

      // Process all dependents
      const dependents = adjacencyList.get(taskId) || [];
      for (const dependent of dependents) {
        const newDegree = (inDegree.get(dependent) || 0) - 1;
        inDegree.set(dependent, newDegree);

        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    return result;
  }
  /**
   * Validate task pair logic
   */
  private async validateTaskPairLogic(
    fromTask: AtomicTask,
    toTask: AtomicTask
  ): Promise<{ warnings: ValidationWarning[]; suggestions: ValidationSuggestion[] }> {
    const warnings: ValidationWarning[] = [];
    const suggestions: ValidationSuggestion[] = [];

    // Check for epic mismatch
    if (fromTask.epicId && toTask.epicId && fromTask.epicId !== toTask.epicId) {
      warnings.push({
        type: 'potential_issue',
        message: `Cross-epic dependency: "${fromTask.title}" (${fromTask.epicId}) depends on "${toTask.title}" (${toTask.epicId})`,
        affectedTasks: [fromTask.id, toTask.id],
        recommendation: 'Consider if this cross-epic dependency is necessary',
        impact: 'low'
      });
    }

    // Check for file path conflicts
    const fromFiles = new Set(fromTask.filePaths);
    const toFiles = new Set(toTask.filePaths);
    const commonFiles = [...fromFiles].filter(file => toFiles.has(file));

    if (commonFiles.length > 0) {
      suggestions.push({
        type: 'optimization',
        description: `Tasks share common files: ${commonFiles.join(', ')}`,
        affectedTasks: [fromTask.id, toTask.id],
        estimatedBenefit: 'Consider merging tasks or ensuring proper file coordination',
        implementationComplexity: 'medium'
      });
    }

    return { warnings, suggestions };
  }

  /**
   * Determine cycle severity based on tasks involved
   */
  private determineCycleSeverity(cycle: string[], tasks: AtomicTask[]): 'critical' | 'high' | 'medium' {
    const cycleTasks = tasks.filter(task => cycle.includes(task.id));

    // Critical if any task is critical priority
    if (cycleTasks.some(task => task.priority === 'critical')) {
      return 'critical';
    }

    // High if cycle is long or involves high priority tasks
    if (cycle.length > 4 || cycleTasks.some(task => task.priority === 'high')) {
      return 'high';
    }

    return 'medium';
  }

  /**
   * Generate resolution options for circular dependencies
   */
  private generateCycleResolutionOptions(
    cycle: string[],
    dependencies: Dependency[]
  ): CircularDependency['resolutionOptions'] {
    const options: CircularDependency['resolutionOptions'] = [];

    // Option 1: Remove weakest dependency
    const cycleDeps = dependencies.filter(dep =>
      cycle.includes(dep.fromTaskId) && cycle.includes(dep.toTaskId)
    );

    if (cycleDeps.length > 0) {
      const weakestDep = cycleDeps.find(dep => dep.type === 'suggests') || cycleDeps[0];
      options.push({
        type: 'remove_dependency',
        description: `Remove dependency from ${weakestDep.fromTaskId} to ${weakestDep.toTaskId}`,
        affectedDependencies: [weakestDep.id],
        complexity: 'low'
      });
    }

    // Option 2: Reorder tasks
    options.push({
      type: 'reorder_tasks',
      description: 'Reorder tasks to break the circular dependency',
      affectedDependencies: cycleDeps.map(dep => dep.id),
      complexity: 'medium'
    });

    // Option 3: Split tasks if cycle is small
    if (cycle.length <= 3) {
      options.push({
        type: 'split_task',
        description: 'Split one of the tasks to break the dependency cycle',
        affectedDependencies: [],
        complexity: 'high'
      });
    }

    return options;
  }

  /**
   * Create validation result helper
   */
  private createValidationResult(
    errors: ValidationError[],
    warnings: ValidationWarning[],
    suggestions: ValidationSuggestion[],
    circularDependencies: CircularDependency[],
    executionOrder: string[],
    startTime: number,
    tasksValidated: number,
    dependenciesValidated: number
  ): DependencyValidationResult {
    const validationTime = Date.now() - startTime;

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      circularDependencies,
      executionOrder,
      metadata: {
        validatedAt: new Date(),
        validationTime,
        tasksValidated,
        dependenciesValidated
      }
    };
  }
}