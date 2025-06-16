/**
 * Epic Dependency Manager
 *
 * Manages epic-to-epic dependencies, resolves proper project phasing,
 * and ensures epic ordering based on task dependencies.
 */

import { Epic, AtomicTask } from '../types/task.js';
import { Dependency } from '../types/dependency.js';
import { getEpicService } from './epic-service.js';
import { getTaskOperations } from '../core/operations/task-operations.js';
import { getDependencyOperations } from '../core/operations/dependency-operations.js';
import { DependencyValidator } from './dependency-validator.js';
import { FileOperationResult } from '../utils/file-utils.js';
import logger from '../../../logger.js';

/**
 * Epic dependency relationship
 */
export interface EpicDependency {
  id: string;
  fromEpicId: string;
  toEpicId: string;
  type: 'blocks' | 'enables' | 'requires' | 'suggests';
  description: string;
  critical: boolean;
  strength: number; // 0-1, based on task dependency density
  metadata: {
    createdAt: Date;
    createdBy: string;
    reason: string;
    taskDependencies: string[]; // Task dependency IDs that contribute to this epic dependency
  };
}

/**
 * Epic dependency analysis result
 */
export interface EpicDependencyAnalysis {
  epicDependencies: EpicDependency[];
  epicExecutionOrder: string[];
  phases: EpicPhase[];
  conflicts: EpicConflict[];
  recommendations: EpicRecommendation[];
  metadata: {
    analyzedAt: Date;
    projectId: string;
    totalEpics: number;
    totalTaskDependencies: number;
    analysisTime: number;
  };
}

/**
 * Epic phase for project organization
 */
export interface EpicPhase {
  id: string;
  name: string;
  description: string;
  epicIds: string[];
  order: number;
  estimatedDuration: number;
  canRunInParallel: boolean;
  prerequisites: string[]; // Phase IDs that must complete first
}

/**
 * Epic conflict detection
 */
export interface EpicConflict {
  type: 'circular_dependency' | 'priority_mismatch' | 'resource_conflict' | 'timeline_conflict';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedEpics: string[];
  resolutionOptions: {
    type: 'reorder' | 'split' | 'merge' | 'adjust_priority';
    description: string;
    complexity: 'low' | 'medium' | 'high';
  }[];
}

/**
 * Epic recommendation for optimization
 */
export interface EpicRecommendation {
  type: 'parallelization' | 'reordering' | 'splitting' | 'merging' | 'priority_adjustment';
  description: string;
  affectedEpics: string[];
  estimatedBenefit: string;
  implementationComplexity: 'low' | 'medium' | 'high';
  priority: 'low' | 'medium' | 'high';
}

/**
 * Epic dependency resolution configuration
 */
export interface EpicDependencyConfig {
  /** Minimum task dependency strength to create epic dependency */
  minDependencyStrength: number;
  /** Maximum epic dependency depth */
  maxEpicDepth: number;
  /** Enable automatic phase generation */
  autoGeneratePhases: boolean;
  /** Enable parallel epic execution detection */
  enableParallelization: boolean;
  /** Minimum tasks per epic for dependency analysis */
  minTasksPerEpic: number;
}

/**
 * Default epic dependency configuration
 */
const DEFAULT_EPIC_CONFIG: EpicDependencyConfig = {
  minDependencyStrength: 0.3,
  maxEpicDepth: 5,
  autoGeneratePhases: true,
  enableParallelization: true,
  minTasksPerEpic: 2
};

/**
 * Epic Dependency Manager Service
 */
export class EpicDependencyManager {
  private config: EpicDependencyConfig;
  private dependencyValidator: DependencyValidator;

  constructor(config: Partial<EpicDependencyConfig> = {}) {
    this.config = { ...DEFAULT_EPIC_CONFIG, ...config };
    this.dependencyValidator = new DependencyValidator();
  }

  /**
   * Analyze and resolve epic dependencies for a project
   */
  async analyzeEpicDependencies(projectId: string): Promise<FileOperationResult<EpicDependencyAnalysis>> {
    const startTime = Date.now();

    try {
      logger.info({ projectId }, 'Starting epic dependency analysis');

      // Get all epics and tasks for the project
      const epicService = getEpicService();
      const taskOps = getTaskOperations();
      const dependencyOps = getDependencyOperations();

      const epicsResult = await epicService.listEpics({ projectId });
      if (!epicsResult.success) {
        throw new Error(`Failed to get epics: ${epicsResult.error}`);
      }

      const tasksResult = await taskOps.listTasks({ projectId });
      if (!tasksResult.success) {
        throw new Error(`Failed to get tasks: ${tasksResult.error}`);
      }

      const epics = epicsResult.data || [];
      const tasks = tasksResult.data || [];

      // Get all task dependencies
      const allTaskDependencies: Dependency[] = [];
      for (const task of tasks) {
        const taskDepsResult = await dependencyOps.getDependenciesForTask(task.id);
        if (taskDepsResult.success && taskDepsResult.data) {
          allTaskDependencies.push(...taskDepsResult.data);
        }
      }

      // Analyze epic dependencies based on task dependencies
      const epicDependencies = await this.deriveEpicDependencies(epics, tasks, allTaskDependencies);

      // Generate epic execution order
      const epicExecutionOrder = await this.calculateEpicExecutionOrder(epics, epicDependencies);

      // Generate project phases
      const phases = this.config.autoGeneratePhases
        ? await this.generateProjectPhases(epics, epicDependencies, epicExecutionOrder)
        : [];

      // Detect conflicts
      const conflicts = await this.detectEpicConflicts(epics, epicDependencies, tasks);

      // Generate recommendations
      const recommendations = await this.generateEpicRecommendations(epics, epicDependencies, tasks, allTaskDependencies);

      const analysisTime = Date.now() - startTime;

      const analysis: EpicDependencyAnalysis = {
        epicDependencies,
        epicExecutionOrder,
        phases,
        conflicts,
        recommendations,
        metadata: {
          analyzedAt: new Date(),
          projectId,
          totalEpics: epics.length,
          totalTaskDependencies: allTaskDependencies.length,
          analysisTime
        }
      };

      logger.info({
        projectId,
        epicDependencies: epicDependencies.length,
        phases: phases.length,
        conflicts: conflicts.length,
        recommendations: recommendations.length,
        analysisTime
      }, 'Epic dependency analysis completed');

      return {
        success: true,
        data: analysis,
        metadata: {
          filePath: 'epic-dependency-manager',
          operation: 'analyze_epic_dependencies',
          timestamp: new Date()
        }
      };

    } catch (error) {
      const analysisTime = Date.now() - startTime;

      logger.error({
        err: error,
        projectId,
        analysisTime
      }, 'Epic dependency analysis failed');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'epic-dependency-manager',
          operation: 'analyze_epic_dependencies',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Create epic dependency based on task dependencies
   */
  async createEpicDependency(
    fromEpicId: string,
    toEpicId: string,
    taskDependencies: string[],
    createdBy: string = 'system'
  ): Promise<FileOperationResult<EpicDependency>> {
    try {
      logger.info({
        fromEpicId,
        toEpicId,
        taskDependencyCount: taskDependencies.length,
        createdBy
      }, 'Creating epic dependency');

      // Validate epic dependency
      const validationResult = await this.validateEpicDependency(fromEpicId, toEpicId);
      if (!validationResult.isValid) {
        return {
          success: false,
          error: `Epic dependency validation failed: ${validationResult.errors.map((e: any) => e.message).join(', ')}`,
          metadata: {
            filePath: 'epic-dependency-manager',
            operation: 'create_epic_dependency',
            timestamp: new Date()
          }
        };
      }

      // Calculate dependency strength
      const strength = await this.calculateDependencyStrength(fromEpicId, toEpicId, taskDependencies);

      // Create epic dependency
      const epicDependency: EpicDependency = {
        id: `epic-dep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        fromEpicId,
        toEpicId,
        type: strength > 0.7 ? 'blocks' : strength > 0.5 ? 'requires' : 'suggests',
        description: `Epic dependency derived from ${taskDependencies.length} task dependencies`,
        critical: strength > 0.7,
        strength,
        metadata: {
          createdAt: new Date(),
          createdBy,
          reason: `Derived from task dependencies with strength ${strength.toFixed(2)}`,
          taskDependencies
        }
      };

      // Update epic dependency lists
      await this.updateEpicDependencyLists(fromEpicId, toEpicId, epicDependency.id);

      logger.info({
        epicDependencyId: epicDependency.id,
        fromEpicId,
        toEpicId,
        strength
      }, 'Epic dependency created successfully');

      return {
        success: true,
        data: epicDependency,
        metadata: {
          filePath: 'epic-dependency-manager',
          operation: 'create_epic_dependency',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({
        err: error,
        fromEpicId,
        toEpicId
      }, 'Failed to create epic dependency');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'epic-dependency-manager',
          operation: 'create_epic_dependency',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Derive epic dependencies from task dependencies
   */
  private async deriveEpicDependencies(
    epics: Epic[],
    tasks: AtomicTask[],
    taskDependencies: Dependency[]
  ): Promise<EpicDependency[]> {
    const epicDependencies: EpicDependency[] = [];
    const epicTaskMap = new Map<string, string[]>();

    // Build epic to tasks mapping
    epics.forEach(epic => {
      epicTaskMap.set(epic.id, epic.taskIds);
    });

    // Group task dependencies by epic pairs
    const epicDependencyMap = new Map<string, string[]>();

    for (const taskDep of taskDependencies) {
      const fromTask = tasks.find(t => t.id === taskDep.fromTaskId);
      const toTask = tasks.find(t => t.id === taskDep.toTaskId);

      if (!fromTask || !toTask || !fromTask.epicId || !toTask.epicId) continue;
      if (fromTask.epicId === toTask.epicId) continue; // Skip intra-epic dependencies

      const epicPairKey = `${fromTask.epicId}->${toTask.epicId}`;
      if (!epicDependencyMap.has(epicPairKey)) {
        epicDependencyMap.set(epicPairKey, []);
      }
      epicDependencyMap.get(epicPairKey)!.push(taskDep.id);
    }

    // Create epic dependencies for significant task dependency clusters
    for (const [epicPairKey, taskDepIds] of epicDependencyMap) {
      const [fromEpicId, toEpicId] = epicPairKey.split('->');

      const strength = await this.calculateDependencyStrength(fromEpicId, toEpicId, taskDepIds);

      if (strength >= this.config.minDependencyStrength) {
        const epicDependency: EpicDependency = {
          id: `epic-dep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          fromEpicId,
          toEpicId,
          type: strength > 0.7 ? 'blocks' : strength > 0.5 ? 'requires' : 'suggests',
          description: `Derived from ${taskDepIds.length} task dependencies (strength: ${strength.toFixed(2)})`,
          critical: strength > 0.7,
          strength,
          metadata: {
            createdAt: new Date(),
            createdBy: 'system',
            reason: `Auto-derived from task dependency analysis`,
            taskDependencies: taskDepIds
          }
        };

        epicDependencies.push(epicDependency);
      }
    }

    return epicDependencies;
  }

  /**
   * Calculate dependency strength between two epics
   */
  private async calculateDependencyStrength(
    fromEpicId: string,
    toEpicId: string,
    taskDependencies: string[]
  ): Promise<number> {
    try {
      const epicService = getEpicService();

      const fromEpicResult = await epicService.getEpic(fromEpicId);
      const toEpicResult = await epicService.getEpic(toEpicId);

      if (!fromEpicResult.success || !toEpicResult.success) {
        return 0;
      }

      const fromEpic = fromEpicResult.data!;
      const toEpic = toEpicResult.data!;

      const fromTaskCount = fromEpic.taskIds.length;
      const toTaskCount = toEpic.taskIds.length;
      const dependencyCount = taskDependencies.length;

      // Calculate strength based on dependency density
      const maxPossibleDependencies = fromTaskCount * toTaskCount;
      const densityStrength = maxPossibleDependencies > 0 ? dependencyCount / maxPossibleDependencies : 0;

      // Calculate strength based on proportion of tasks involved
      const proportionStrength = Math.min(dependencyCount / Math.max(fromTaskCount, toTaskCount), 1);

      // Combine both measures
      const strength = (densityStrength * 0.4) + (proportionStrength * 0.6);

      return Math.min(strength, 1);

    } catch (error) {
      logger.warn({
        err: error,
        fromEpicId,
        toEpicId
      }, 'Failed to calculate dependency strength');

      return 0;
    }
  }

  /**
   * Calculate epic execution order using topological sort
   */
  private async calculateEpicExecutionOrder(epics: Epic[], epicDependencies: EpicDependency[]): Promise<string[]> {
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();

    // Initialize
    epics.forEach(epic => {
      inDegree.set(epic.id, 0);
      adjacencyList.set(epic.id, []);
    });

    // Build adjacency list and calculate in-degrees
    epicDependencies.forEach(dep => {
      adjacencyList.get(dep.fromEpicId)?.push(dep.toEpicId);
      inDegree.set(dep.toEpicId, (inDegree.get(dep.toEpicId) || 0) + 1);
    });

    // Topological sort
    const queue: string[] = [];
    const result: string[] = [];

    // Add epics with no dependencies
    for (const [epicId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(epicId);
      }
    }

    while (queue.length > 0) {
      const epicId = queue.shift()!;
      result.push(epicId);

      // Process all dependents
      const dependents = adjacencyList.get(epicId) || [];
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
   * Generate project phases based on epic dependencies
   */
  private async generateProjectPhases(
    epics: Epic[],
    epicDependencies: EpicDependency[],
    executionOrder: string[]
  ): Promise<EpicPhase[]> {
    const phases: EpicPhase[] = [];
    const epicToPhase = new Map<string, number>();

    // Group epics into phases based on dependency levels
    let currentPhase = 0;
    const processedEpics = new Set<string>();

    while (processedEpics.size < epics.length) {
      const currentPhaseEpics: string[] = [];

      for (const epicId of executionOrder) {
        if (processedEpics.has(epicId)) continue;

        // Check if all dependencies are satisfied
        const dependencies = epicDependencies.filter(dep => dep.toEpicId === epicId);
        const allDependenciesSatisfied = dependencies.every(dep =>
          processedEpics.has(dep.fromEpicId)
        );

        if (allDependenciesSatisfied) {
          currentPhaseEpics.push(epicId);
          epicToPhase.set(epicId, currentPhase);
        }
      }

      if (currentPhaseEpics.length === 0) {
        // Circular dependency or other issue - add remaining epics to current phase
        for (const epicId of executionOrder) {
          if (!processedEpics.has(epicId)) {
            currentPhaseEpics.push(epicId);
            epicToPhase.set(epicId, currentPhase);
          }
        }
      }

      // Calculate phase duration
      const phaseEpics = epics.filter(epic => currentPhaseEpics.includes(epic.id));
      const estimatedDuration = Math.max(...phaseEpics.map(epic => epic.estimatedHours));

      const phase: EpicPhase = {
        id: `phase-${currentPhase + 1}`,
        name: `Phase ${currentPhase + 1}`,
        description: `Project phase containing ${currentPhaseEpics.length} epic(s)`,
        epicIds: currentPhaseEpics,
        order: currentPhase,
        estimatedDuration,
        canRunInParallel: currentPhaseEpics.length > 1,
        prerequisites: currentPhase > 0 ? [`phase-${currentPhase}`] : []
      };

      phases.push(phase);
      currentPhaseEpics.forEach(epicId => processedEpics.add(epicId));
      currentPhase++;
    }

    return phases;
  }

  /**
   * Detect epic conflicts
   */
  private async detectEpicConflicts(
    epics: Epic[],
    epicDependencies: EpicDependency[],
    tasks: AtomicTask[]
  ): Promise<EpicConflict[]> {
    const conflicts: EpicConflict[] = [];

    // Check for circular dependencies
    const circularDeps = await this.detectCircularEpicDependencies(epics, epicDependencies);
    conflicts.push(...circularDeps);

    // Check for priority mismatches
    const priorityConflicts = await this.detectPriorityConflicts(epics, epicDependencies);
    conflicts.push(...priorityConflicts);

    // Check for resource conflicts
    const resourceConflicts = await this.detectResourceConflicts(epics, tasks);
    conflicts.push(...resourceConflicts);

    return conflicts;
  }

  /**
   * Generate epic recommendations
   */
  private async generateEpicRecommendations(
    epics: Epic[],
    epicDependencies: EpicDependency[],
    tasks: AtomicTask[],
    taskDependencies: Dependency[]
  ): Promise<EpicRecommendation[]> {
    const recommendations: EpicRecommendation[] = [];

    // Parallelization opportunities
    if (this.config.enableParallelization) {
      const parallelizationRecs = await this.identifyParallelizationOpportunities(epics, epicDependencies);
      recommendations.push(...parallelizationRecs);
    }

    // Epic splitting recommendations
    const splittingRecs = await this.identifyEpicSplittingOpportunities(epics, tasks);
    recommendations.push(...splittingRecs);

    // Epic merging recommendations
    const mergingRecs = await this.identifyEpicMergingOpportunities(epics, epicDependencies);
    recommendations.push(...mergingRecs);

    return recommendations;
  }

  /**
   * Validate epic dependency
   */
  private async validateEpicDependency(fromEpicId: string, toEpicId: string): Promise<any> {
    // Use the existing dependency validator for basic validation
    return await this.dependencyValidator.validateDependencyBeforeCreation(fromEpicId, toEpicId, 'project-id');
  }

  /**
   * Update epic dependency lists
   */
  private async updateEpicDependencyLists(fromEpicId: string, toEpicId: string, dependencyId: string): Promise<void> {
    try {
      const epicService = getEpicService();

      // Update toEpic's dependencies list (only dependencies field is supported in UpdateEpicParams)
      const toEpicResult = await epicService.getEpic(toEpicId);
      if (toEpicResult.success) {
        const toEpic = toEpicResult.data!;
        if (!toEpic.dependencies.includes(fromEpicId)) {
          toEpic.dependencies.push(fromEpicId);
          await epicService.updateEpic(toEpicId, { dependencies: toEpic.dependencies });
        }
      }

      // Note: dependents field is not supported in UpdateEpicParams interface
      // The dependents relationship will be maintained through the dependencies field

    } catch (error) {
      logger.warn({
        err: error,
        fromEpicId,
        toEpicId,
        dependencyId
      }, 'Failed to update epic dependency lists');
    }
  }
  /**
   * Detect circular epic dependencies
   */
  private async detectCircularEpicDependencies(epics: Epic[], epicDependencies: EpicDependency[]): Promise<EpicConflict[]> {
    const conflicts: EpicConflict[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const adjacencyList = new Map<string, string[]>();

    // Build adjacency list
    epics.forEach(epic => adjacencyList.set(epic.id, []));
    epicDependencies.forEach(dep => {
      const dependents = adjacencyList.get(dep.fromEpicId) || [];
      dependents.push(dep.toEpicId);
      adjacencyList.set(dep.fromEpicId, dependents);
    });

    const dfs = (epicId: string, path: string[]): boolean => {
      if (recursionStack.has(epicId)) {
        // Found a cycle
        const cycleStart = path.indexOf(epicId);
        const cycle = path.slice(cycleStart).concat([epicId]);

        conflicts.push({
          type: 'circular_dependency',
          severity: 'critical',
          description: `Circular epic dependency detected: ${cycle.join(' → ')}`,
          affectedEpics: cycle,
          resolutionOptions: [{
            type: 'reorder',
            description: 'Reorder epics to break the circular dependency',
            complexity: 'medium'
          }]
        });
        return true;
      }

      if (visited.has(epicId)) {
        return false;
      }

      visited.add(epicId);
      recursionStack.add(epicId);
      path.push(epicId);

      const dependents = adjacencyList.get(epicId) || [];
      for (const dependent of dependents) {
        if (dfs(dependent, [...path])) {
          // Continue to find all cycles
        }
      }

      recursionStack.delete(epicId);
      return false;
    };

    // Check each epic as a potential cycle start
    for (const epic of epics) {
      if (!visited.has(epic.id)) {
        dfs(epic.id, []);
      }
    }

    return conflicts;
  }

  /**
   * Detect priority conflicts between epics
   */
  private async detectPriorityConflicts(epics: Epic[], epicDependencies: EpicDependency[]): Promise<EpicConflict[]> {
    const conflicts: EpicConflict[] = [];
    const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };

    for (const dep of epicDependencies) {
      const fromEpic = epics.find(e => e.id === dep.fromEpicId);
      const toEpic = epics.find(e => e.id === dep.toEpicId);

      if (!fromEpic || !toEpic) continue;

      const fromPriority = priorityOrder[fromEpic.priority] || 0;
      const toPriority = priorityOrder[toEpic.priority] || 0;

      if (fromPriority < toPriority) {
        conflicts.push({
          type: 'priority_mismatch',
          severity: 'medium',
          description: `Lower priority epic "${fromEpic.title}" blocks higher priority epic "${toEpic.title}"`,
          affectedEpics: [fromEpic.id, toEpic.id],
          resolutionOptions: [{
            type: 'adjust_priority',
            description: 'Adjust epic priorities to match dependency order',
            complexity: 'low'
          }]
        });
      }
    }

    return conflicts;
  }

  /**
   * Detect resource conflicts between epics
   */
  private async detectResourceConflicts(epics: Epic[], tasks: AtomicTask[]): Promise<EpicConflict[]> {
    const conflicts: EpicConflict[] = [];

    // Check for file path conflicts between epics
    for (let i = 0; i < epics.length; i++) {
      for (let j = i + 1; j < epics.length; j++) {
        const epic1 = epics[i];
        const epic2 = epics[j];

        const epic1Tasks = tasks.filter(t => t.epicId === epic1.id);
        const epic2Tasks = tasks.filter(t => t.epicId === epic2.id);

        const epic1Files = new Set(epic1Tasks.flatMap(t => t.filePaths));
        const epic2Files = new Set(epic2Tasks.flatMap(t => t.filePaths));

        const commonFiles = [...epic1Files].filter(file => epic2Files.has(file));

        if (commonFiles.length > 0) {
          conflicts.push({
            type: 'resource_conflict',
            severity: 'low',
            description: `Epics "${epic1.title}" and "${epic2.title}" modify common files: ${commonFiles.join(', ')}`,
            affectedEpics: [epic1.id, epic2.id],
            resolutionOptions: [{
              type: 'reorder',
              description: 'Ensure epics that modify common files are properly sequenced',
              complexity: 'medium'
            }]
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Identify parallelization opportunities
   */
  private async identifyParallelizationOpportunities(epics: Epic[], epicDependencies: EpicDependency[]): Promise<EpicRecommendation[]> {
    const recommendations: EpicRecommendation[] = [];
    const dependencyMap = new Map<string, string[]>();

    // Build dependency map
    epicDependencies.forEach(dep => {
      if (!dependencyMap.has(dep.toEpicId)) {
        dependencyMap.set(dep.toEpicId, []);
      }
      dependencyMap.get(dep.toEpicId)!.push(dep.fromEpicId);
    });

    // Find epics that can run in parallel
    const independentEpics = epics.filter(epic => !dependencyMap.has(epic.id));

    if (independentEpics.length > 1) {
      recommendations.push({
        type: 'parallelization',
        description: `${independentEpics.length} epics can be executed in parallel`,
        affectedEpics: independentEpics.map(e => e.id),
        estimatedBenefit: 'Reduced overall project timeline',
        implementationComplexity: 'low',
        priority: 'high'
      });
    }

    return recommendations;
  }

  /**
   * Identify epic splitting opportunities
   */
  private async identifyEpicSplittingOpportunities(epics: Epic[], tasks: AtomicTask[]): Promise<EpicRecommendation[]> {
    const recommendations: EpicRecommendation[] = [];

    for (const epic of epics) {
      const epicTasks = tasks.filter(t => t.epicId === epic.id);

      if (epicTasks.length > 10) { // Large epic threshold
        recommendations.push({
          type: 'splitting',
          description: `Epic "${epic.title}" has ${epicTasks.length} tasks and could be split for better management`,
          affectedEpics: [epic.id],
          estimatedBenefit: 'Better task organization and parallel execution',
          implementationComplexity: 'medium',
          priority: 'medium'
        });
      }
    }

    return recommendations;
  }

  /**
   * Identify epic merging opportunities
   */
  private async identifyEpicMergingOpportunities(epics: Epic[], epicDependencies: EpicDependency[]): Promise<EpicRecommendation[]> {
    const recommendations: EpicRecommendation[] = [];

    // Find epics with strong dependencies that might be merged
    for (const dep of epicDependencies) {
      if (dep.strength > 0.8 && dep.critical) {
        const fromEpic = epics.find(e => e.id === dep.fromEpicId);
        const toEpic = epics.find(e => e.id === dep.toEpicId);

        if (fromEpic && toEpic && fromEpic.taskIds.length < 5 && toEpic.taskIds.length < 5) {
          recommendations.push({
            type: 'merging',
            description: `Epics "${fromEpic.title}" and "${toEpic.title}" have strong dependency and could be merged`,
            affectedEpics: [fromEpic.id, toEpic.id],
            estimatedBenefit: 'Simplified project structure and reduced coordination overhead',
            implementationComplexity: 'high',
            priority: 'low'
          });
        }
      }
    }

    return recommendations;
  }
}