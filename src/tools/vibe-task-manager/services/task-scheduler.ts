/**
 * Task Scheduler Service for Vibe Task Manager
 *
 * Provides intelligent task scheduling with priority-based ordering,
 * resource-aware scheduling, deadline consideration, and dynamic re-scheduling.
 * Integrates with OptimizedDependencyGraph for dependency-aware execution planning.
 */

import { AtomicTask, TaskPriority } from '../types/task.js';
import { ProjectContext } from '../types/project-context.js';
import { OptimizedDependencyGraph, ParallelBatch } from '../core/dependency-graph.js';
import {
  EnhancedError,
  ConfigurationError,
  TaskExecutionError,
  ValidationError,
  createErrorContext
} from '../utils/enhanced-errors.js';
import logger from '../../../logger.js';

/**
 * Task scoring information for scheduling algorithms
 */
export interface TaskScores {
  priorityScore: number;
  deadlineScore: number;
  dependencyScore: number;
  resourceScore: number;
  durationScore: number;
  systemLoadScore: number;
  complexityScore: number;
  businessImpactScore: number;
  agentAvailabilityScore: number;
  totalScore: number;
}

/**
 * Scheduling algorithm types
 */
export type SchedulingAlgorithm =
  | 'priority_first'      // Priority-based scheduling
  | 'earliest_deadline'   // Earliest deadline first
  | 'critical_path'       // Critical path method
  | 'resource_balanced'   // Resource-aware balanced scheduling
  | 'shortest_job'        // Shortest job first
  | 'hybrid_optimal';     // Hybrid optimization algorithm

/**
 * Resource constraints for scheduling
 */
export interface ResourceConstraints {
  /** Maximum concurrent tasks */
  maxConcurrentTasks: number;

  /** Maximum memory usage (MB) */
  maxMemoryMB: number;

  /** Maximum CPU utilization (0-1) */
  maxCpuUtilization: number;

  /** Available agent count */
  availableAgents: number;

  /** Resource allocation per task type */
  taskTypeResources: Map<string, {
    memoryMB: number;
    cpuWeight: number;
    agentCount: number;
  }>;
}

/**
 * Scheduling preferences and configuration
 */
export interface SchedulingConfig {
  /** Primary scheduling algorithm */
  algorithm: SchedulingAlgorithm;

  /** Resource constraints */
  resources: ResourceConstraints;

  /** Priority weights for different factors */
  weights: {
    priority: number;
    deadline: number;
    dependencies: number;
    resources: number;
    duration: number;
    systemLoad: number;
    complexity: number;
    businessImpact: number;
    agentAvailability: number;
  };

  /** Deadline buffer time (hours) */
  deadlineBuffer: number;

  /** Re-scheduling trigger sensitivity */
  rescheduleSensitivity: 'low' | 'medium' | 'high';

  /** Enable dynamic optimization */
  enableDynamicOptimization: boolean;

  /** Optimization interval (minutes) */
  optimizationInterval: number;
}

/**
 * Scheduled task with execution metadata
 */
export interface ScheduledTask {
  /** The atomic task */
  task: AtomicTask;

  /** Scheduled start time */
  scheduledStart: Date;

  /** Scheduled end time */
  scheduledEnd: Date;

  /** Assigned resources */
  assignedResources: {
    memoryMB: number;
    cpuWeight: number;
    agentId?: string;
  };

  /** Execution batch ID */
  batchId: number;

  /** Dependencies that must complete first */
  prerequisiteTasks: string[];

  /** Tasks that depend on this one */
  dependentTasks: string[];

  /** Scheduling metadata */
  metadata: {
    algorithm: SchedulingAlgorithm;
    priorityScore: number;
    resourceScore: number;
    deadlineScore: number;
    dependencyScore: number;
    durationScore: number;
    systemLoadScore: number;
    complexityScore: number;
    businessImpactScore: number;
    agentAvailabilityScore: number;
    totalScore: number;
    scheduledAt: Date;
    lastOptimized: Date;
  };
}

/**
 * Execution schedule with batches and timeline
 */
export interface ExecutionSchedule {
  /** Schedule ID */
  id: string;

  /** Project ID */
  projectId: string;

  /** All scheduled tasks */
  scheduledTasks: Map<string, ScheduledTask>;

  /** Execution batches in order */
  executionBatches: ParallelBatch[];

  /** Schedule timeline */
  timeline: {
    startTime: Date;
    endTime: Date;
    totalDuration: number;
    criticalPath: string[];
    parallelismFactor: number;
  };

  /** Resource utilization */
  resourceUtilization: {
    peakMemoryMB: number;
    averageCpuUtilization: number;
    agentUtilization: number;
    resourceEfficiency: number;
  };

  /** Schedule metadata */
  metadata: {
    algorithm: SchedulingAlgorithm;
    config: SchedulingConfig;
    generatedAt: Date;
    optimizedAt: Date;
    version: number;
    isOptimal: boolean;
  };
}

/**
 * Schedule optimization result
 */
export interface ScheduleOptimizationResult {
  /** Original schedule */
  originalSchedule: ExecutionSchedule;

  /** Optimized schedule */
  optimizedSchedule: ExecutionSchedule;

  /** Improvements achieved */
  improvements: {
    timeReduction: number;
    resourceEfficiencyGain: number;
    parallelismIncrease: number;
    deadlineCompliance: number;
  };

  /** Optimization details */
  optimizationDetails: {
    algorithm: SchedulingAlgorithm;
    iterations: number;
    convergenceTime: number;
    changesApplied: string[];
  };
}

/**
 * Default scheduling configuration
 */
export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  algorithm: 'hybrid_optimal',
  resources: {
    maxConcurrentTasks: 10,
    maxMemoryMB: 4096,
    maxCpuUtilization: 0.8,
    availableAgents: 3,
    taskTypeResources: new Map([
      ['development', { memoryMB: 512, cpuWeight: 0.7, agentCount: 1 }],
      ['testing', { memoryMB: 256, cpuWeight: 0.5, agentCount: 1 }],
      ['documentation', { memoryMB: 128, cpuWeight: 0.3, agentCount: 1 }],
      ['research', { memoryMB: 256, cpuWeight: 0.4, agentCount: 1 }],
      ['deployment', { memoryMB: 1024, cpuWeight: 0.9, agentCount: 1 }],
      ['review', { memoryMB: 128, cpuWeight: 0.2, agentCount: 1 }]
    ])
  },
  weights: {
    // Updated weights based on importance: Dependencies > Deadline > System Load > Task Complexity > Business Impact > Agent Availability
    dependencies: 0.35,      // Most critical for execution order
    deadline: 0.25,          // Time-sensitive priority escalation  
    systemLoad: 0.20,        // Resource availability impact
    complexity: 0.10,        // Task effort estimation factor
    businessImpact: 0.05,    // Strategic importance
    agentAvailability: 0.05, // Execution readiness
    priority: 0.0,           // Deprecated - integrated into other factors
    resources: 0.0,          // Replaced by systemLoad
    duration: 0.0            // Replaced by complexity
  },
  deadlineBuffer: 2,
  rescheduleSensitivity: 'medium',
  enableDynamicOptimization: true,
  optimizationInterval: 30
};

/**
 * Task Scheduler Service
 *
 * Provides comprehensive task scheduling capabilities with multiple algorithms,
 * resource awareness, and dynamic optimization.
 */
export class TaskScheduler {
  private config: SchedulingConfig;
  private currentSchedule: ExecutionSchedule | null = null;
  private optimizationTimer: NodeJS.Timeout | null = null;
  private scheduleVersion = 0;

  // Static instance tracking for callback support
  private static currentInstance: TaskScheduler | null = null;

  constructor(config: Partial<SchedulingConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULING_CONFIG, ...config };

    if (this.config.enableDynamicOptimization) {
      this.startOptimizationTimer();
    }

    // Set as current instance for callback support
    TaskScheduler.currentInstance = this;

    logger.info('TaskScheduler initialized', {
      algorithm: this.config.algorithm,
      maxConcurrentTasks: this.config.resources.maxConcurrentTasks,
      enableDynamicOptimization: this.config.enableDynamicOptimization
    });
  }

  /**
   * Get current scheduler instance for callback support
   */
  static getCurrentInstance(): TaskScheduler | null {
    return TaskScheduler.currentInstance;
  }

  /**
   * Reset current instance (for testing and cleanup)
   */
  static resetCurrentInstance(): void {
    TaskScheduler.currentInstance = null;
  }

  /**
   * Check if current instance exists
   */
  static hasCurrentInstance(): boolean {
    return TaskScheduler.currentInstance !== null;
  }

  /**
   * Generate execution schedule for a set of tasks
   */
  async generateSchedule(
    tasks: AtomicTask[],
    dependencyGraph: OptimizedDependencyGraph,
    projectId: string
  ): Promise<ExecutionSchedule> {
    const startTime = Date.now();

    try {
      logger.info('Generating execution schedule', {
        taskCount: tasks.length,
        algorithm: this.config.algorithm,
        projectId
      });

      // Validate inputs
      this.validateSchedulingInputs(tasks, dependencyGraph);

      // Calculate task priorities and scores
      const taskScores = this.calculateTaskScores(tasks, dependencyGraph);

      // Generate parallel batches from dependency graph
      const parallelBatches = dependencyGraph.getParallelBatches();

      // Apply scheduling algorithm
      const scheduledTasks = await this.applySchedulingAlgorithm(
        tasks,
        taskScores,
        parallelBatches,
        dependencyGraph
      );

      // Calculate timeline and resource utilization
      const timeline = this.calculateTimeline(scheduledTasks, parallelBatches);
      const resourceUtilization = this.calculateResourceUtilization(scheduledTasks);

      // Create execution schedule
      const schedule: ExecutionSchedule = {
        id: `schedule_${projectId}_${Date.now()}`,
        projectId,
        scheduledTasks,
        executionBatches: parallelBatches,
        timeline,
        resourceUtilization,
        metadata: {
          algorithm: this.config.algorithm,
          config: { ...this.config },
          generatedAt: new Date(),
          optimizedAt: new Date(),
          version: ++this.scheduleVersion,
          isOptimal: false
        }
      };

      // Optimize the schedule
      const optimizedSchedule = await this.optimizeSchedule(schedule);

      this.currentSchedule = optimizedSchedule;

      const generationTime = Date.now() - startTime;
      logger.info('Schedule generated successfully', {
        scheduleId: schedule.id,
        taskCount: tasks.length,
        batchCount: parallelBatches.length,
        generationTime,
        algorithm: this.config.algorithm
      });

      return optimizedSchedule;

    } catch (error) {
      const context = createErrorContext('TaskScheduler', 'generateSchedule')
        .projectId(projectId)
        .metadata({
          taskCount: tasks.length,
          algorithm: this.config.algorithm,
          generationTime: Date.now() - startTime
        })
        .build();

      if (error instanceof EnhancedError) {
        // Re-throw enhanced errors with additional context
        throw error;
      }

      // Convert generic errors to enhanced errors
      if (error instanceof Error) {
        if (error.message.includes('validation') || error.message.includes('invalid')) {
          throw new ValidationError(
            `Schedule generation validation failed: ${error.message}`,
            context,
            {
              cause: error,
              field: 'tasks',
              expectedFormat: 'Array of valid AtomicTask objects'
            }
          );
        }

        if (error.message.includes('algorithm') || error.message.includes('config')) {
          throw new ConfigurationError(
            `Schedule generation configuration error: ${error.message}`,
            context,
            {
              cause: error,
              configKey: 'algorithm',
              actualValue: this.config.algorithm
            }
          );
        }

        throw new TaskExecutionError(
          `Schedule generation failed: ${error.message}`,
          context,
          {
            cause: error,
            retryable: true
          }
        );
      }

      // Handle unknown errors
      throw new TaskExecutionError(
        `Schedule generation failed with unknown error: ${String(error)}`,
        context,
        {
          retryable: false
        }
      );
    }
  }

  /**
   * Update existing schedule with new tasks or changes
   */
  async updateSchedule(
    updatedTasks: AtomicTask[],
    dependencyGraph: OptimizedDependencyGraph
  ): Promise<ExecutionSchedule> {
    const context = createErrorContext('TaskScheduler', 'updateSchedule')
      .metadata({
        updatedTaskCount: updatedTasks.length,
        hasCurrentSchedule: !!this.currentSchedule
      })
      .build();

    if (!this.currentSchedule) {
      throw new ValidationError(
        'No current schedule exists to update. Generate a schedule first.',
        context,
        {
          field: 'currentSchedule',
          expectedFormat: 'Valid ExecutionSchedule object'
        }
      );
    }

    try {
      logger.info('Updating existing schedule', {
        scheduleId: this.currentSchedule.id,
        updatedTaskCount: updatedTasks.length
      });

      // Validate updated tasks
      if (!Array.isArray(updatedTasks) || updatedTasks.length === 0) {
        throw new ValidationError(
          'Updated tasks must be a non-empty array of AtomicTask objects',
          context,
          {
            field: 'updatedTasks',
            expectedFormat: 'Array<AtomicTask>',
            actualValue: updatedTasks
          }
        );
      }

      // Determine if re-scheduling is needed based on sensitivity
      const needsReschedule = this.shouldReschedule(updatedTasks);

      if (needsReschedule) {
        return this.generateSchedule(
          updatedTasks,
          dependencyGraph,
          this.currentSchedule.projectId
        );
      } else {
        // Incremental update
        return this.incrementalUpdate(updatedTasks, dependencyGraph);
      }

    } catch (error) {
      if (error instanceof EnhancedError) {
        throw error;
      }

      throw new TaskExecutionError(
        `Schedule update failed: ${error instanceof Error ? error.message : String(error)}`,
        context,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true
        }
      );
    }
  }

  /**
   * Get current schedule
   */
  getCurrentSchedule(): ExecutionSchedule | null {
    return this.currentSchedule;
  }

  /**
   * Get ready tasks that can be executed now
   */
  getReadyTasks(): ScheduledTask[] {
    if (!this.currentSchedule) {
      return [];
    }

    const now = new Date();
    const readyTasks: ScheduledTask[] = [];

    for (const scheduledTask of this.currentSchedule.scheduledTasks.values()) {
      // Check if task is ready to start
      if (
        scheduledTask.scheduledStart <= now &&
        scheduledTask.task.status === 'pending' &&
        this.arePrerequisitesComplete(scheduledTask)
      ) {
        readyTasks.push(scheduledTask);
      }
    }

    return readyTasks.sort((a, b) =>
      b.metadata.priorityScore - a.metadata.priorityScore
    );
  }

  /**
   * Get next batch of tasks for parallel execution
   */
  getNextExecutionBatch(): ParallelBatch | null {
    if (!this.currentSchedule) {
      return null;
    }

    const readyTasks = this.getReadyTasks();
    if (readyTasks.length === 0) {
      return null;
    }

    // Find the next batch that can be executed
    for (const batch of this.currentSchedule.executionBatches) {
      const batchTasks = batch.taskIds.map(id =>
        this.currentSchedule!.scheduledTasks.get(id)
      ).filter(task => task !== undefined) as ScheduledTask[];

      // Check if all tasks in batch are ready
      const allReady = batchTasks.every(task =>
        readyTasks.some(ready => ready.task.id === task.task.id)
      );

      if (allReady) {
        return batch;
      }
    }

    return null;
  }

  /**
   * Mark task as completed and update schedule
   */
  async markTaskCompleted(taskId: string): Promise<void> {
    if (!this.currentSchedule) {
      return;
    }

    const scheduledTask = this.currentSchedule.scheduledTasks.get(taskId);
    if (!scheduledTask) {
      logger.warn('Task not found in current schedule', { taskId });
      return;
    }

    // Update task status
    scheduledTask.task.status = 'completed';
    scheduledTask.task.actualHours = this.calculateActualHours(scheduledTask);

    logger.info('Task marked as completed', {
      taskId,
      actualHours: scheduledTask.task.actualHours,
      estimatedHours: scheduledTask.task.estimatedHours
    });

    // Check if dynamic re-scheduling is needed
    if (this.config.enableDynamicOptimization) {
      await this.checkForOptimization();
    }
  }

  /**
   * Execute scheduled tasks using AgentOrchestrator
   */
  async executeScheduledTasks(): Promise<{
    success: boolean;
    executedTasks: string[];
    queuedTasks: string[];
    errors: Array<{ taskId: string; error: string }>;
  }> {
    if (!this.currentSchedule) {
      return {
        success: false,
        executedTasks: [],
        queuedTasks: [],
        errors: [{ taskId: 'N/A', error: 'No current schedule available' }]
      };
    }

    // Wait for dependencies before executing tasks
    await this.waitForExecutionDependencies();

    const executedTasks: string[] = [];
    const queuedTasks: string[] = [];
    const errors: Array<{ taskId: string; error: string }> = [];

    try {
      // Get ready tasks for execution
      const readyTasks = this.getReadyTasks();

      if (readyTasks.length === 0) {
        logger.debug('No ready tasks for execution');
        return {
          success: true,
          executedTasks,
          queuedTasks,
          errors
        };
      }

      // Import AgentOrchestrator dynamically to avoid circular dependencies
      const { AgentOrchestrator } = await import('./agent-orchestrator.js');
      const orchestrator = AgentOrchestrator.getInstance();

      logger.info(`Executing ${readyTasks.length} ready tasks`);

      // Execute each ready task
      for (const scheduledTask of readyTasks) {
        try {
          // Create project context for task execution
          const projectContext: ProjectContext = {
            projectId: scheduledTask.task.projectId,
            projectPath: process.cwd(),
            projectName: scheduledTask.task.projectId,
            description: `Scheduled task execution for ${scheduledTask.task.title}`,
            languages: ['typescript', 'javascript'], // Default languages
            frameworks: [],
            buildTools: ['npm'],
            tools: [],
            configFiles: [],
            entryPoints: [],
            architecturalPatterns: [],
            existingTasks: [],
            codebaseSize: 'medium',
            teamSize: 1,
            complexity: 'medium',
            codebaseContext: {
              relevantFiles: [],
              contextSummary: `Scheduled task execution for ${scheduledTask.task.title}`,
              gatheringMetrics: {
                searchTime: 0,
                readTime: 0,
                scoringTime: 0,
                totalTime: 0,
                cacheHitRate: 0
              },
              totalContextSize: 0,
              averageRelevance: 0
            },
            structure: {
              sourceDirectories: ['src'],
              testDirectories: ['test', 'tests'],
              docDirectories: ['docs'],
              buildDirectories: ['build', 'dist']
            },
            dependencies: {
              production: [],
              development: [],
              external: []
            },
            metadata: {
              createdAt: new Date(),
              updatedAt: new Date(),
              version: '1.0.0',
              source: 'auto-detected'
            }
          };

          // Execute task via orchestrator
          const result = await orchestrator.executeTask(
            scheduledTask.task,
            projectContext,
            {
              priority: this.mapTaskPriorityToExecutionPriority(scheduledTask.task.priority),
              timeout: scheduledTask.assignedResources.memoryMB * 1000, // Use memory as timeout indicator
              enableMonitoring: true
            }
          );

          if (result.success) {
            executedTasks.push(scheduledTask.task.id);
            logger.info(`Task ${scheduledTask.task.id} executed successfully`);
          } else if (result.queued) {
            queuedTasks.push(scheduledTask.task.id);
            logger.info(`Task ${scheduledTask.task.id} queued for later execution`);
          } else {
            errors.push({
              taskId: scheduledTask.task.id,
              error: result.error || result.message
            });
            logger.warn(`Task ${scheduledTask.task.id} execution failed: ${result.error || result.message}`);
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push({
            taskId: scheduledTask.task.id,
            error: errorMessage
          });
          logger.error({ err: error, taskId: scheduledTask.task.id }, 'Task execution failed with exception');
        }
      }

      logger.info({
        executed: executedTasks.length,
        queued: queuedTasks.length,
        errors: errors.length
      }, 'Scheduled task execution completed');

      return {
        success: errors.length === 0,
        executedTasks,
        queuedTasks,
        errors
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to execute scheduled tasks');
      return {
        success: false,
        executedTasks,
        queuedTasks,
        errors: [{ taskId: 'N/A', error: error instanceof Error ? error.message : 'Unknown error' }]
      };
    }
  }

  /**
   * Map task priority to execution priority
   */
  private mapTaskPriorityToExecutionPriority(taskPriority: TaskPriority): 'low' | 'medium' | 'high' | 'critical' {
    return taskPriority; // Direct mapping since they use the same values
  }



  /**
   * Cleanup and dispose of scheduler
   */
  dispose(): void {
    // Prevent multiple disposal calls
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;

    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = null;
    }

    // Clear current schedule
    this.currentSchedule = null;

    // Reset static instance if this is the current instance
    if (TaskScheduler.currentInstance === this) {
      TaskScheduler.currentInstance = null;
    }

    logger.info('TaskScheduler disposed');
  }

  /**
   * Check if scheduler is disposed
   */
  private isDisposed = false;

  /**
   * Wait for execution dependencies to be ready
   */
  private async waitForExecutionDependencies(): Promise<void> {
    const maxWaitTime = 15000; // 15 seconds
    const checkInterval = 500; // 500ms
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Check if ExecutionCoordinator is available and ready
        try {
          const { ExecutionCoordinator } = await import('./execution-coordinator.js');
          const coordinator = await ExecutionCoordinator.getInstance();

          // Check if coordinator is running
          if (!coordinator.getRunningStatus()) {
            throw new Error('ExecutionCoordinator not running');
          }
        } catch {
          // ExecutionCoordinator might not be available in all environments
          logger.debug('ExecutionCoordinator not available, continuing without it');
        }

        // Check if Transport Manager is ready (if available)
        try {
          const { TransportManager } = await import('../../../services/transport-manager/index.js');
          const transportManager = TransportManager.getInstance();
          const status = transportManager.getStatus();

          // Only wait for transport manager if it's configured to start
          if (status.isConfigured && !status.isStarted) {
            throw new Error('Transport Manager not ready');
          }
        } catch {
          // Transport Manager might not be available in all environments
          logger.debug('Transport Manager not available, continuing without it');
        }

        // All dependencies are ready
        logger.debug('All execution dependencies ready for TaskScheduler');
        return;

      } catch {
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
    }

    logger.warn('Timeout waiting for execution dependencies, proceeding anyway');
  }

  // Private helper methods

  /**
   * Validate scheduling inputs
   */
  private validateSchedulingInputs(
    tasks: AtomicTask[],
    dependencyGraph: OptimizedDependencyGraph
  ): void {
    if (tasks.length === 0) {
      throw new Error('Cannot schedule empty task list');
    }

    // Validate all tasks have required fields
    for (const task of tasks) {
      if (!task.id || !task.title || task.estimatedHours === undefined || task.estimatedHours < 0) {
        throw new Error(`Invalid task: ${task.id} - missing required fields`);
      }
    }

    // Validate dependency graph contains all tasks
    const graphNodes = dependencyGraph.getNodes();
    const taskIds = new Set(tasks.map(t => t.id));

    for (const taskId of taskIds) {
      if (!graphNodes.has(taskId)) {
        logger.warn('Task not found in dependency graph', { taskId });
      }
    }
  }

  /**
   * Calculate task scores for scheduling
   */
  private calculateTaskScores(
    tasks: AtomicTask[],
    dependencyGraph: OptimizedDependencyGraph
  ): Map<string, TaskScores> {
    const scores = new Map();
    const criticalPath = dependencyGraph.getCriticalPath();
    const criticalPathSet = new Set(criticalPath);

    for (const task of tasks) {
      // Enhanced multi-factor scoring
      const priorityScore = this.calculatePriorityScore(task.priority);
      const deadlineScore = this.calculateDeadlineScore(task);
      const dependencyScore = this.calculateDependencyScore(task, dependencyGraph, criticalPathSet);
      const resourceScore = this.calculateResourceScore(task);
      const durationScore = this.calculateDurationScore(task);
      
      // New dynamic scoring factors
      const systemLoadScore = this.calculateSystemLoadScore(task);
      const complexityScore = this.calculateComplexityScore(task);
      const businessImpactScore = this.calculateBusinessImpactScore(task);
      const agentAvailabilityScore = this.calculateAgentAvailabilityScore(task);

      const totalScore =
        priorityScore * this.config.weights.priority +
        deadlineScore * this.config.weights.deadline +
        dependencyScore * this.config.weights.dependencies +
        resourceScore * this.config.weights.resources +
        durationScore * this.config.weights.duration +
        systemLoadScore * this.config.weights.systemLoad +
        complexityScore * this.config.weights.complexity +
        businessImpactScore * this.config.weights.businessImpact +
        agentAvailabilityScore * this.config.weights.agentAvailability;

      scores.set(task.id, {
        priorityScore,
        deadlineScore,
        dependencyScore,
        resourceScore,
        durationScore,
        systemLoadScore,
        complexityScore,
        businessImpactScore,
        agentAvailabilityScore,
        totalScore
      });
    }

    return scores;
  }

  /**
   * Apply the selected scheduling algorithm
   */
  private async applySchedulingAlgorithm(
    tasks: AtomicTask[],
    taskScores: Map<string, TaskScores>,
    parallelBatches: ParallelBatch[],
    dependencyGraph: OptimizedDependencyGraph
  ): Promise<Map<string, ScheduledTask>> {

    switch (this.config.algorithm) {
      case 'priority_first':
        return this.priorityFirstScheduling(tasks, taskScores, parallelBatches);

      case 'earliest_deadline':
        return this.earliestDeadlineScheduling(tasks, taskScores, parallelBatches);

      case 'critical_path':
        return this.criticalPathScheduling(tasks, taskScores, parallelBatches, dependencyGraph);

      case 'resource_balanced':
        return this.resourceBalancedScheduling(tasks, taskScores, parallelBatches);

      case 'shortest_job':
        return this.shortestJobScheduling(tasks, taskScores, parallelBatches);

      case 'hybrid_optimal':
        return this.hybridOptimalScheduling(tasks, taskScores, parallelBatches, dependencyGraph);

      default:
        throw new Error(`Unknown scheduling algorithm: ${this.config.algorithm}`);
    }
  }

  /**
   * Priority-first scheduling algorithm
   */
  private priorityFirstScheduling(
    tasks: AtomicTask[],
    taskScores: Map<string, TaskScores>,
    parallelBatches: ParallelBatch[]
  ): Map<string, ScheduledTask> {
    const scheduledTasks = new Map<string, ScheduledTask>();
    const sortedTasks = tasks.sort((a, b) => {
      const scoreA = taskScores.get(a.id)?.priorityScore || 0;
      const scoreB = taskScores.get(b.id)?.priorityScore || 0;
      return scoreB - scoreA;
    });

    let currentTime = new Date();
    let batchId = 0;

    for (const batch of parallelBatches) {
      const batchTasks = batch.taskIds
        .map(id => sortedTasks.find(t => t.id === id))
        .filter(task => task !== undefined) as AtomicTask[];

      for (const task of batchTasks) {
        const scores = taskScores.get(task.id);
        const resources = this.allocateResources(task);

        const scheduledTask: ScheduledTask = {
          task,
          scheduledStart: new Date(currentTime),
          scheduledEnd: new Date(currentTime.getTime() + task.estimatedHours * 60 * 60 * 1000),
          assignedResources: resources,
          batchId,
          prerequisiteTasks: task.dependencies,
          dependentTasks: task.dependents,
          metadata: {
            algorithm: 'priority_first',
            priorityScore: scores?.priorityScore || 0,
            resourceScore: scores?.resourceScore || 0,
            deadlineScore: scores?.deadlineScore || 0,
            dependencyScore: scores?.dependencyScore || 0,
            durationScore: scores?.durationScore || 0,
            systemLoadScore: scores?.systemLoadScore || 0,
            complexityScore: scores?.complexityScore || 0,
            businessImpactScore: scores?.businessImpactScore || 0,
            agentAvailabilityScore: scores?.agentAvailabilityScore || 0,
            totalScore: scores?.totalScore || 0,
            scheduledAt: new Date(),
            lastOptimized: new Date()
          }
        };

        scheduledTasks.set(task.id, scheduledTask);
      }

      // Move to next batch time
      currentTime = new Date(currentTime.getTime() + batch.estimatedDuration * 60 * 60 * 1000);
      batchId++;
    }

    return scheduledTasks;
  }

  /**
   * Hybrid optimal scheduling algorithm
   * Combines multiple scheduling strategies for optimal resource utilization
   */
  private hybridOptimalScheduling(
    tasks: AtomicTask[],
    taskScores: Map<string, TaskScores>,
    parallelBatches: ParallelBatch[],
    dependencyGraph: OptimizedDependencyGraph
  ): Map<string, ScheduledTask> {
    const scheduledTasks = new Map<string, ScheduledTask>();

    // Get critical path for prioritization
    const criticalPath = dependencyGraph.getCriticalPath();
    const criticalPathSet = new Set(criticalPath);

    // Enhanced sorting with multiple criteria
    const sortedTasks = tasks.sort((a, b) => {
      const scoreA = taskScores.get(a.id);
      const scoreB = taskScores.get(b.id);

      // Primary: Critical path tasks first
      const aCritical = criticalPathSet.has(a.id);
      const bCritical = criticalPathSet.has(b.id);
      if (aCritical !== bCritical) {
        return bCritical ? 1 : -1;
      }

      // Secondary: Total score
      const totalA = scoreA?.totalScore || 0;
      const totalB = scoreB?.totalScore || 0;
      if (Math.abs(totalA - totalB) > 0.1) {
        return totalB - totalA;
      }

      // Tertiary: Priority level
      const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
      const priorityA = priorityOrder[a.priority] || 0;
      const priorityB = priorityOrder[b.priority] || 0;
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }

      // Quaternary: Shorter tasks first for better parallelism
      return a.estimatedHours - b.estimatedHours;
    });

    let currentTime = new Date();
    let batchId = 0;

    // Process batches with resource optimization
    for (const batch of parallelBatches) {
      const batchTasks = this.optimizeBatchOrder(batch, sortedTasks, taskScores);
      const batchStartTime = new Date(currentTime);

      for (const task of batchTasks) {
        const scores = taskScores.get(task.id);
        const resources = this.allocateOptimalResources(task, batchTasks);

        const scheduledTask: ScheduledTask = {
          task,
          scheduledStart: batchStartTime,
          scheduledEnd: new Date(batchStartTime.getTime() + task.estimatedHours * 60 * 60 * 1000),
          assignedResources: resources,
          batchId,
          prerequisiteTasks: task.dependencies,
          dependentTasks: task.dependents,
          metadata: {
            algorithm: 'hybrid_optimal',
            priorityScore: scores?.priorityScore || 0,
            resourceScore: scores?.resourceScore || 0,
            deadlineScore: scores?.deadlineScore || 0,
            dependencyScore: scores?.dependencyScore || 0,
            durationScore: scores?.durationScore || 0,
            systemLoadScore: scores?.systemLoadScore || 0,
            complexityScore: scores?.complexityScore || 0,
            businessImpactScore: scores?.businessImpactScore || 0,
            agentAvailabilityScore: scores?.agentAvailabilityScore || 0,
            totalScore: scores?.totalScore || 0,
            scheduledAt: new Date(),
            lastOptimized: new Date()
          }
        };

        scheduledTasks.set(task.id, scheduledTask);
      }

      // Calculate actual batch duration based on parallel execution with buffer
      const maxTaskDuration = Math.max(...batchTasks.map(t => t.estimatedHours));
      const bufferTime = maxTaskDuration * 0.1; // 10% buffer for variance
      currentTime = new Date(currentTime.getTime() + (maxTaskDuration + bufferTime) * 60 * 60 * 1000);
      batchId++;
    }

    return scheduledTasks;
  }

  /**
   * Optimize batch order for better resource utilization
   */
  private optimizeBatchOrder(
    batch: ParallelBatch,
    sortedTasks: AtomicTask[],
    taskScores: Map<string, TaskScores>
  ): AtomicTask[] {
    const batchTasks = batch.taskIds
      .map(id => sortedTasks.find(t => t.id === id))
      .filter(task => task !== undefined) as AtomicTask[];

    // Sort batch tasks by resource efficiency and priority
    return batchTasks.sort((a, b) => {
      const scoreA = taskScores.get(a.id);
      const scoreB = taskScores.get(b.id);

      // Prioritize by resource score (better resource utilization first)
      const resourceA = scoreA?.resourceScore || 0;
      const resourceB = scoreB?.resourceScore || 0;
      if (Math.abs(resourceA - resourceB) > 0.1) {
        return resourceB - resourceA;
      }

      // Then by total score
      const totalA = scoreA?.totalScore || 0;
      const totalB = scoreB?.totalScore || 0;
      return totalB - totalA;
    });
  }

  /**
   * Initialize resource tracker for batch optimization
   */
  private initializeResourceTracker(): {
    memoryUsed: number;
    cpuUsed: number;
    agentsAssigned: Set<string>;
  } {
    return {
      memoryUsed: 0,
      cpuUsed: 0,
      agentsAssigned: new Set()
    };
  }

  /**
   * Update resource tracker with allocated resources
   */
  private updateResourceTracker(
    tracker: { memoryUsed: number; cpuUsed: number; agentsAssigned: Set<string> },
    resources: { memoryMB: number; cpuWeight: number; agentId?: string }
  ): void {
    tracker.memoryUsed += resources.memoryMB;
    tracker.cpuUsed += resources.cpuWeight;
    if (resources.agentId) {
      tracker.agentsAssigned.add(resources.agentId);
    }
  }

  /**
   * Calculate optimal batch start time considering dependencies
   */
  private calculateOptimalBatchStartTime(
    batchTasks: AtomicTask[],
    scheduledTasks: Map<string, ScheduledTask>,
    defaultStartTime: Date
  ): Date {
    let latestPrerequisiteEnd = defaultStartTime;

    for (const task of batchTasks) {
      for (const depId of task.dependencies) {
        const depTask = scheduledTasks.get(depId);
        if (depTask && depTask.scheduledEnd > latestPrerequisiteEnd) {
          latestPrerequisiteEnd = depTask.scheduledEnd;
        }
      }
    }

    return latestPrerequisiteEnd;
  }

  /**
   * Calculate timeline from scheduled tasks
   */
  private calculateTimeline(
    scheduledTasks: Map<string, ScheduledTask>,
    _parallelBatches: ParallelBatch[]
  ): {
    startTime: Date;
    endTime: Date;
    totalDuration: number;
    criticalPath: string[];
    parallelismFactor: number;
  } {
    const tasks = Array.from(scheduledTasks.values());

    if (tasks.length === 0) {
      const now = new Date();
      return {
        startTime: now,
        endTime: now,
        totalDuration: 0,
        criticalPath: [],
        parallelismFactor: 1
      };
    }

    const startTime = new Date(Math.min(...tasks.map(t => t.scheduledStart.getTime())));
    const endTime = new Date(Math.max(...tasks.map(t => t.scheduledEnd.getTime())));
    const totalDuration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60); // hours

    // Calculate critical path (longest dependency chain)
    const criticalPath = this.findCriticalPath(scheduledTasks);

    // Calculate parallelism factor
    const totalTaskHours = tasks.reduce((sum, t) => sum + t.task.estimatedHours, 0);
    const parallelismFactor = totalTaskHours / totalDuration;

    return {
      startTime,
      endTime,
      totalDuration,
      criticalPath,
      parallelismFactor
    };
  }

  /**
   * Calculate resource utilization metrics
   */
  private calculateResourceUtilization(
    scheduledTasks: Map<string, ScheduledTask>
  ): {
    peakMemoryMB: number;
    averageCpuUtilization: number;
    agentUtilization: number;
    resourceEfficiency: number;
  } {
    const tasks = Array.from(scheduledTasks.values());

    if (tasks.length === 0) {
      return {
        peakMemoryMB: 0,
        averageCpuUtilization: 0,
        agentUtilization: 0,
        resourceEfficiency: 0
      };
    }

    // Calculate peak memory usage
    const peakMemoryMB = Math.max(...tasks.map(t => t.assignedResources.memoryMB));

    // Calculate average CPU utilization
    const totalCpuWeight = tasks.reduce((sum, t) => sum + t.assignedResources.cpuWeight, 0);
    const averageCpuUtilization = totalCpuWeight / tasks.length;

    // Calculate agent utilization
    const assignedAgents = new Set(
      tasks.map(t => t.assignedResources.agentId).filter(id => id !== undefined)
    ).size;
    const agentUtilization = assignedAgents / this.config.resources.availableAgents;

    // Calculate overall resource efficiency
    const memoryEfficiency = peakMemoryMB / this.config.resources.maxMemoryMB;
    const cpuEfficiency = averageCpuUtilization / this.config.resources.maxCpuUtilization;
    const resourceEfficiency = (memoryEfficiency + cpuEfficiency + agentUtilization) / 3;

    return {
      peakMemoryMB,
      averageCpuUtilization,
      agentUtilization,
      resourceEfficiency
    };
  }

  /**
   * Optimize schedule using various optimization techniques
   */
  private async optimizeSchedule(schedule: ExecutionSchedule): Promise<ExecutionSchedule> {
    let optimizedSchedule = { ...schedule };

    // Apply optimization techniques
    optimizedSchedule = this.optimizeResourceAllocation(optimizedSchedule);
    optimizedSchedule = this.optimizeParallelExecution(optimizedSchedule);
    optimizedSchedule = this.optimizeDeadlineCompliance(optimizedSchedule);

    // Mark as optimized
    optimizedSchedule.metadata.isOptimal = true;
    optimizedSchedule.metadata.optimizedAt = new Date();

    return optimizedSchedule;
  }

  // Score calculation methods

  private calculatePriorityScore(priority: TaskPriority): number {
    const priorityMap = {
      'critical': 1.0,
      'high': 0.8,
      'medium': 0.6,
      'low': 0.4
    };
    return priorityMap[priority] || 0.5;
  }

  private calculateDeadlineScore(task: AtomicTask): number {
    // Enhanced deadline scoring based on task priority and estimated duration
    const now = new Date();

    // Calculate implied deadline based on priority and estimated hours
    const priorityMultipliers = {
      'critical': 1.0,   // Immediate deadline
      'high': 2.0,       // 2x estimated time
      'medium': 4.0,     // 4x estimated time
      'low': 8.0         // 8x estimated time
    };

    const multiplier = priorityMultipliers[task.priority] || 4.0;
    const impliedDeadlineHours = task.estimatedHours * multiplier;
    const impliedDeadline = new Date(now.getTime() + impliedDeadlineHours * 60 * 60 * 1000);

    // Calculate urgency score (higher score = more urgent)
    const timeToDeadline = impliedDeadline.getTime() - now.getTime();
    const maxTimeWindow = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

    // Normalize to 0-1 scale (1 = most urgent, 0 = least urgent)
    const urgencyScore = Math.max(0, 1 - (timeToDeadline / maxTimeWindow));

    // Apply exponential curve for critical tasks
    if (task.priority === 'critical') {
      return Math.min(1.0, urgencyScore * 1.5);
    }

    return Math.min(1.0, urgencyScore);
  }

  private calculateDependencyScore(
    task: AtomicTask,
    dependencyGraph: OptimizedDependencyGraph,
    criticalPathSet: Set<string>
  ): number {
    let score = 0.5; // Base score

    // Higher score for tasks on critical path
    if (criticalPathSet.has(task.id)) {
      score += 0.3;
    }

    // Higher score for tasks with many dependents
    const dependentCount = task.dependents.length;
    score += Math.min(dependentCount * 0.1, 0.2);

    return Math.min(score, 1.0);
  }

  private calculateResourceScore(task: AtomicTask): number {
    const taskTypeResources = this.config.resources.taskTypeResources.get(task.type);
    if (!taskTypeResources) {
      return 0.5;
    }

    // Lower score for resource-intensive tasks (to balance load)
    const memoryRatio = taskTypeResources.memoryMB / this.config.resources.maxMemoryMB;
    const cpuRatio = taskTypeResources.cpuWeight / this.config.resources.maxCpuUtilization;

    return 1.0 - Math.min((memoryRatio + cpuRatio) / 2, 0.5);
  }

  private calculateDurationScore(task: AtomicTask): number {
    // Prefer shorter tasks for better parallelism
    const maxHours = 8; // Assume 8 hours as maximum reasonable task duration
    return 1.0 - Math.min(task.estimatedHours / maxHours, 0.8);
  }

  /**
   * Calculate system load score based on current resource utilization
   * Higher score for tasks that can run when system load is lower
   */
  private calculateSystemLoadScore(task: AtomicTask): number {
    // Get current system metrics
    const currentMemoryUtilization = this.getCurrentMemoryUtilization();
    const currentCpuUtilization = this.getCurrentCpuUtilization();
    const currentTaskLoad = this.getCurrentTaskLoad();

    // Calculate task resource requirements
    const taskTypeResources = this.config.resources.taskTypeResources.get(task.type);
    const taskMemoryRatio = taskTypeResources ? 
      taskTypeResources.memoryMB / this.config.resources.maxMemoryMB : 0.1;
    const taskCpuRatio = taskTypeResources ? 
      taskTypeResources.cpuWeight / this.config.resources.maxCpuUtilization : 0.1;

    // Higher score when system has capacity for this task
    const memoryAvailability = Math.max(0, 1.0 - currentMemoryUtilization - taskMemoryRatio);
    const cpuAvailability = Math.max(0, 1.0 - currentCpuUtilization - taskCpuRatio);
    const taskSlotAvailability = Math.max(0, 
      (this.config.resources.maxConcurrentTasks - currentTaskLoad) / this.config.resources.maxConcurrentTasks
    );

    // Weighted average of availability factors
    return (memoryAvailability * 0.4 + cpuAvailability * 0.4 + taskSlotAvailability * 0.2);
  }

  /**
   * Calculate complexity score based on multiple task factors
   * Higher score for less complex tasks (easier to execute)
   */
  private calculateComplexityScore(task: AtomicTask): number {
    let complexityFactor = 0;

    // File path complexity (more files = higher complexity)
    complexityFactor += Math.min(task.filePaths.length * 0.1, 0.3);

    // Testing complexity
    const testingComplexity = 
      task.testingRequirements.unitTests.length * 0.05 +
      task.testingRequirements.integrationTests.length * 0.1 +
      task.testingRequirements.performanceTests.length * 0.15;
    complexityFactor += Math.min(testingComplexity, 0.2);

    // Acceptance criteria complexity
    complexityFactor += Math.min(task.acceptanceCriteria.length * 0.05, 0.2);

    // Dependency complexity
    complexityFactor += Math.min(task.dependencies.length * 0.1, 0.2);

    // Type-based complexity
    const typeComplexity = {
      'development': 0.6,
      'research': 0.8,
      'deployment': 0.7,
      'testing': 0.4,
      'documentation': 0.3,
      'review': 0.2
    };
    complexityFactor += typeComplexity[task.type] || 0.5;

    // Return inverse (higher score for lower complexity)
    return Math.max(0, 1.0 - Math.min(complexityFactor, 1.0));
  }

  /**
   * Calculate business impact score based on task priority and context
   * Higher score for tasks with greater business value
   */
  private calculateBusinessImpactScore(task: AtomicTask): number {
    let impactScore = 0.5; // Base score

    // Priority-based impact
    const priorityImpact = {
      'critical': 1.0,
      'high': 0.8,
      'medium': 0.6,
      'low': 0.4
    };
    impactScore = priorityImpact[task.priority] || 0.5;

    // Task type impact (some types have higher business value)
    const typeImpact = {
      'deployment': 0.3,    // High impact - delivers value
      'development': 0.2,   // Medium-high impact
      'testing': 0.1,       // Medium impact - ensures quality
      'research': 0.1,      // Medium impact - enables future work
      'documentation': 0.05, // Lower immediate impact
      'review': 0.05        // Lower immediate impact
    };
    impactScore += typeImpact[task.type] || 0.1;

    // Tags-based impact (if task has business-critical tags)
    const businessCriticalTags = ['critical-path', 'customer-facing', 'revenue-impact', 'security'];
    const hasBusinessCriticalTag = task.tags?.some(tag => 
      businessCriticalTags.some(criticalTag => tag.toLowerCase().includes(criticalTag))
    );
    if (hasBusinessCriticalTag) {
      impactScore += 0.2;
    }

    return Math.min(impactScore, 1.0);
  }

  /**
   * Calculate agent availability score based on current agent status
   * Higher score when appropriate agents are available
   */
  private calculateAgentAvailabilityScore(task: AtomicTask): number {
    // Get current agent availability
    const totalAgents = this.config.resources.availableAgents;
    const busyAgents = this.getCurrentBusyAgents();
    const availableAgents = Math.max(0, totalAgents - busyAgents);

    // Calculate base availability
    const availabilityRatio = totalAgents > 0 ? availableAgents / totalAgents : 0;

    // Check if task type has specific agent requirements
    const taskTypeResources = this.config.resources.taskTypeResources.get(task.type);
    const requiredAgents = taskTypeResources?.agentCount || 1;

    // Score based on whether we have enough agents of the right type
    if (availableAgents >= requiredAgents) {
      return Math.min(availabilityRatio + 0.2, 1.0); // Bonus for having sufficient agents
    } else {
      return availabilityRatio * 0.5; // Penalty for insufficient agents
    }
  }

  /**
   * Get current memory utilization (0-1)
   */
  private getCurrentMemoryUtilization(): number {
    // In a real implementation, this would get actual system metrics
    // For now, return a simulated value based on current schedule
    if (this.currentSchedule) {
      return Math.min(this.currentSchedule.resourceUtilization.peakMemoryMB / this.config.resources.maxMemoryMB, 1.0);
    }
    return 0.3; // Default moderate utilization
  }

  /**
   * Get current CPU utilization (0-1)
   */
  private getCurrentCpuUtilization(): number {
    // In a real implementation, this would get actual system metrics
    if (this.currentSchedule) {
      return Math.min(this.currentSchedule.resourceUtilization.averageCpuUtilization, 1.0);
    }
    return 0.4; // Default moderate utilization
  }

  /**
   * Get current task load (number of running tasks)
   */
  private getCurrentTaskLoad(): number {
    if (this.currentSchedule) {
      // Count tasks that are currently running
      const now = new Date();
      let runningTasks = 0;
      
      for (const [, scheduledTask] of this.currentSchedule.scheduledTasks) {
        if (scheduledTask.scheduledStart <= now && scheduledTask.scheduledEnd > now) {
          runningTasks++;
        }
      }
      return runningTasks;
    }
    return 0;
  }

  /**
   * Get number of currently busy agents
   */
  private getCurrentBusyAgents(): number {
    if (this.currentSchedule) {
      // Count agents that have assigned tasks
      const busyAgents = new Set();
      const now = new Date();
      
      for (const [, scheduledTask] of this.currentSchedule.scheduledTasks) {
        if (scheduledTask.assignedResources.agentId && 
            scheduledTask.scheduledStart <= now && 
            scheduledTask.scheduledEnd > now) {
          busyAgents.add(scheduledTask.assignedResources.agentId);
        }
      }
      return busyAgents.size;
    }
    return 0;
  }

  /**
   * Calculate task deadline based on priority and estimated hours
   * Used for earliest deadline scheduling when no explicit deadline is set
   */
  private calculateTaskDeadline(task: AtomicTask): Date {
    const now = new Date();

    // Base deadline calculation: priority affects urgency
    const priorityMultipliers = {
      'critical': 0.5,  // Half the normal time
      'high': 1.0,      // Normal time
      'medium': 2.0,    // Double time
      'low': 3.0        // Triple time
    };

    const multiplier = priorityMultipliers[task.priority] || 2.0;
    const deadlineHours = task.estimatedHours * multiplier + 24; // Add 24h buffer

    return new Date(now.getTime() + deadlineHours * 60 * 60 * 1000);
  }

  // Resource allocation methods

  private allocateResources(task: AtomicTask): {
    memoryMB: number;
    cpuWeight: number;
    agentId?: string;
  } {
    const taskTypeResources = this.config.resources.taskTypeResources.get(task.type);

    // Default resources based on task type
    let defaultMemory = 256;
    let defaultCpu = 0.5;

    // Special handling for resource-intensive task types
    if (task.type === 'deployment') {
      defaultMemory = 1024;
      defaultCpu = 0.9;
    } else if (task.type === 'development') {
      defaultMemory = 512;
      defaultCpu = 0.7;
    }

    return {
      memoryMB: taskTypeResources?.memoryMB || defaultMemory,
      cpuWeight: taskTypeResources?.cpuWeight || defaultCpu,
      agentId: this.assignAgent(task)
    };
  }

  private allocateOptimalResources(
    task: AtomicTask,
    batchTasks: AtomicTask[]
  ): {
    memoryMB: number;
    cpuWeight: number;
    agentId?: string;
  } {
    const baseResources = this.allocateResources(task);

    // Optimize based on batch context
    const batchMemoryTotal = batchTasks.reduce((sum, t) => {
      const taskRes = this.config.resources.taskTypeResources.get(t.type);
      return sum + (taskRes?.memoryMB || 256);
    }, 0);

    // Scale down if batch would exceed memory limits
    if (batchMemoryTotal > this.config.resources.maxMemoryMB) {
      const scaleFactor = this.config.resources.maxMemoryMB / batchMemoryTotal;
      baseResources.memoryMB = Math.floor(baseResources.memoryMB * scaleFactor);
    }

    // Reassign agent with task context for optimal allocation
    baseResources.agentId = this.assignAgent(task);

    return baseResources;
  }

  private assignAgent(task?: AtomicTask): string | undefined {
    // Enhanced agent assignment with capability matching and load balancing
    const agentCount = this.config.resources.availableAgents;
    if (agentCount === 0) return undefined;

    if (!task) {
      // Fallback to round-robin if no task provided
      const agentId = `agent_${(this.scheduleVersion % agentCount) + 1}`;
      return agentId;
    }

    // Agent capability mapping
    const agentCapabilities = new Map([
      ['agent_1', ['development', 'testing', 'review']],
      ['agent_2', ['deployment', 'documentation', 'research']],
      ['agent_3', ['development', 'testing', 'deployment']]
    ]);

    // Generate available agent IDs
    const availableAgents = Array.from({ length: agentCount }, (_, i) => `agent_${i + 1}`);

    // Find agents capable of handling this task type
    const capableAgents = availableAgents.filter(agentId => {
      const capabilities = agentCapabilities.get(agentId) || ['development', 'testing']; // Default capabilities
      return capabilities.includes(task.type);
    });

    if (capableAgents.length === 0) {
      // No specific capability match, use round-robin
      const agentId = `agent_${(this.scheduleVersion % agentCount) + 1}`;
      return agentId;
    }

    // Simple load balancing - prefer agents with fewer assigned tasks
    // In a real implementation, this would check actual agent workloads
    const agentLoads = new Map(
      availableAgents.map(agentId => [agentId, Math.floor(Math.random() * 5)])
    );

    // Select capable agent with lowest load
    const selectedAgent = capableAgents.reduce((best, current) => {
      const currentLoad = agentLoads.get(current) || 0;
      const bestLoad = agentLoads.get(best) || 0;
      return currentLoad < bestLoad ? current : best;
    });

    return selectedAgent;
  }

  // Helper methods for scheduling algorithms



  private findCriticalPath(scheduledTasks: Map<string, ScheduledTask>): string[] {
    // Simple implementation - find longest chain by duration
    const tasks = Array.from(scheduledTasks.values());
    let longestPath: string[] = [];
    let maxDuration = 0;

    for (const task of tasks) {
      const path = this.findPathFromTask(task, scheduledTasks);
      const pathDuration = path.reduce((sum, taskId) => {
        const t = scheduledTasks.get(taskId);
        return sum + (t?.task.estimatedHours || 0);
      }, 0);

      if (pathDuration > maxDuration) {
        maxDuration = pathDuration;
        longestPath = path;
      }
    }

    return longestPath;
  }

  private findPathFromTask(
    startTask: ScheduledTask,
    scheduledTasks: Map<string, ScheduledTask>
  ): string[] {
    const path = [startTask.task.id];
    const visited = new Set([startTask.task.id]);

    let currentTask = startTask;
    while (currentTask.dependentTasks.length > 0) {
      // Find the dependent with the longest estimated duration
      let nextTask: ScheduledTask | undefined;
      let maxDuration = 0;

      for (const dependentId of currentTask.dependentTasks) {
        if (visited.has(dependentId)) continue;

        const dependent = scheduledTasks.get(dependentId);
        if (dependent && dependent.task.estimatedHours > maxDuration) {
          maxDuration = dependent.task.estimatedHours;
          nextTask = dependent;
        }
      }

      if (!nextTask) break;

      path.push(nextTask.task.id);
      visited.add(nextTask.task.id);
      currentTask = nextTask;
    }

    return path;
  }

  // Optimization methods

  private optimizeResourceAllocation(schedule: ExecutionSchedule): ExecutionSchedule {
    // Implement resource allocation optimization
    return schedule;
  }

  private optimizeParallelExecution(schedule: ExecutionSchedule): ExecutionSchedule {
    // Implement parallel execution optimization
    return schedule;
  }

  private optimizeDeadlineCompliance(schedule: ExecutionSchedule): ExecutionSchedule {
    // Implement deadline compliance optimization
    return schedule;
  }

  // Dynamic scheduling methods

  private shouldReschedule(updatedTasks: AtomicTask[]): boolean {
    if (!this.currentSchedule) return true;

    const sensitivity = this.config.rescheduleSensitivity;
    const thresholds = {
      'low': 0.3,
      'medium': 0.2,
      'high': 0.1
    };

    const changeRatio = updatedTasks.length / this.currentSchedule.scheduledTasks.size;
    return changeRatio > thresholds[sensitivity];
  }

  private async incrementalUpdate(
    _updatedTasks: AtomicTask[],
    _dependencyGraph: OptimizedDependencyGraph
  ): Promise<ExecutionSchedule> {
    // Implement incremental schedule update
    return this.currentSchedule!;
  }

  private arePrerequisitesComplete(scheduledTask: ScheduledTask): boolean {
    if (!this.currentSchedule) return false;

    return scheduledTask.prerequisiteTasks.every(prereqId => {
      const prereq = this.currentSchedule!.scheduledTasks.get(prereqId);
      return prereq?.task.status === 'completed';
    });
  }

  private calculateActualHours(scheduledTask: ScheduledTask): number {
    const now = new Date();
    const startTime = scheduledTask.scheduledStart;
    const elapsedMs = now.getTime() - startTime.getTime();
    const elapsedHours = elapsedMs / (1000 * 60 * 60); // Convert to hours

    // Return at least 0.1 hours (6 minutes) for completed tasks
    return Math.max(elapsedHours, 0.1);
  }

  private async checkForOptimization(): Promise<void> {
    if (!this.currentSchedule || !this.config.enableDynamicOptimization) {
      return;
    }

    // Check if optimization is needed based on schedule performance
    const resourceEfficiency = this.currentSchedule.resourceUtilization.resourceEfficiency;
    if (resourceEfficiency < 0.7) {
      logger.info('Triggering schedule optimization due to low resource utilization');
      // Trigger optimization in background
      setTimeout(() => this.optimizeCurrentSchedule(), 1000);
    }
  }

  private async optimizeCurrentSchedule(): Promise<void> {
    if (!this.currentSchedule) return;

    try {
      const optimized = await this.optimizeSchedule(this.currentSchedule);
      this.currentSchedule = optimized;
      logger.info('Schedule optimized successfully');
    } catch (error) {
      logger.error('Failed to optimize schedule', { error });
    }
  }

  private startOptimizationTimer(): void {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
    }

    this.optimizationTimer = setInterval(
      () => this.checkForOptimization(),
      this.config.optimizationInterval * 60 * 1000 // Convert minutes to milliseconds
    );
  }

  // Placeholder methods for other scheduling algorithms
  private earliestDeadlineScheduling(
    tasks: AtomicTask[],
    taskScores: Map<string, TaskScores>,
    parallelBatches: ParallelBatch[]
  ): Map<string, ScheduledTask> {
    const scheduledTasks = new Map<string, ScheduledTask>();

    // Sort tasks by earliest deadline (using priority and estimated hours as fallback)
    const sortedTasks = tasks.sort((a, b) => {
      const deadlineA = this.calculateTaskDeadline(a);
      const deadlineB = this.calculateTaskDeadline(b);
      return deadlineA.getTime() - deadlineB.getTime();
    });

    let currentTime = new Date();
    let batchId = 0;

    for (const batch of parallelBatches) {
      const batchTasks = batch.taskIds
        .map(id => sortedTasks.find(t => t.id === id))
        .filter(task => task !== undefined) as AtomicTask[];

      for (const task of batchTasks) {
        const scores = taskScores.get(task.id);
        const resources = this.allocateResources(task);

        const scheduledTask: ScheduledTask = {
          task,
          scheduledStart: new Date(currentTime),
          scheduledEnd: new Date(currentTime.getTime() + task.estimatedHours * 60 * 60 * 1000),
          assignedResources: resources,
          batchId,
          prerequisiteTasks: task.dependencies,
          dependentTasks: task.dependents,
          metadata: {
            algorithm: 'earliest_deadline',
            priorityScore: scores?.priorityScore || 0,
            resourceScore: scores?.resourceScore || 0,
            deadlineScore: scores?.deadlineScore || 0,
            dependencyScore: scores?.dependencyScore || 0,
            durationScore: scores?.durationScore || 0,
            systemLoadScore: scores?.systemLoadScore || 0,
            complexityScore: scores?.complexityScore || 0,
            businessImpactScore: scores?.businessImpactScore || 0,
            agentAvailabilityScore: scores?.agentAvailabilityScore || 0,
            totalScore: scores?.totalScore || 0,
            scheduledAt: new Date(),
            lastOptimized: new Date()
          }
        };

        scheduledTasks.set(task.id, scheduledTask);
      }

      // Move to next batch time
      currentTime = new Date(currentTime.getTime() + batch.estimatedDuration * 60 * 60 * 1000);
      batchId++;
    }

    return scheduledTasks;
  }

  private criticalPathScheduling(
    tasks: AtomicTask[],
    taskScores: Map<string, TaskScores>,
    parallelBatches: ParallelBatch[],
    dependencyGraph: OptimizedDependencyGraph
  ): Map<string, ScheduledTask> {
    const scheduledTasks = new Map<string, ScheduledTask>();

    // Get critical path tasks from dependency graph
    const criticalPath = dependencyGraph.getCriticalPath();
    const criticalPathSet = new Set(criticalPath);

    // Sort tasks prioritizing critical path tasks first, then by total score
    const sortedTasks = tasks.sort((a, b) => {
      const aOnCriticalPath = criticalPathSet.has(a.id);
      const bOnCriticalPath = criticalPathSet.has(b.id);

      // Critical path tasks get highest priority
      if (aOnCriticalPath && !bOnCriticalPath) return -1;
      if (!aOnCriticalPath && bOnCriticalPath) return 1;

      // For tasks both on or both off critical path, sort by total score
      const scoreA = taskScores.get(a.id)?.totalScore || 0;
      const scoreB = taskScores.get(b.id)?.totalScore || 0;
      return scoreB - scoreA;
    });

    let currentTime = new Date();
    let batchId = 0;

    // Process batches with critical path optimization
    for (const batch of parallelBatches) {
      const batchTasks = this.optimizeBatchOrder(batch, sortedTasks, taskScores);
      const batchStartTime = new Date(currentTime);

      for (const task of batchTasks) {
        const scores = taskScores.get(task.id);
        const resources = this.allocateOptimalResources(task, batchTasks);

        const scheduledTask: ScheduledTask = {
          task,
          scheduledStart: batchStartTime,
          scheduledEnd: new Date(batchStartTime.getTime() + task.estimatedHours * 60 * 60 * 1000),
          assignedResources: resources,
          batchId,
          prerequisiteTasks: task.dependencies,
          dependentTasks: task.dependents,
          metadata: {
            algorithm: 'critical_path',
            priorityScore: scores?.priorityScore || 0,
            resourceScore: scores?.resourceScore || 0,
            deadlineScore: scores?.deadlineScore || 0,
            dependencyScore: scores?.dependencyScore || 0,
            durationScore: scores?.durationScore || 0,
            systemLoadScore: scores?.systemLoadScore || 0,
            complexityScore: scores?.complexityScore || 0,
            businessImpactScore: scores?.businessImpactScore || 0,
            agentAvailabilityScore: scores?.agentAvailabilityScore || 0,
            totalScore: scores?.totalScore || 0,
            scheduledAt: new Date(),
            lastOptimized: new Date()
          }
        };

        scheduledTasks.set(task.id, scheduledTask);
      }

      // Calculate actual batch duration based on parallel execution
      const maxTaskDuration = Math.max(...batchTasks.map(t => t.estimatedHours));
      currentTime = new Date(currentTime.getTime() + maxTaskDuration * 60 * 60 * 1000);
      batchId++;
    }

    return scheduledTasks;
  }

  private resourceBalancedScheduling(
    tasks: AtomicTask[],
    taskScores: Map<string, TaskScores>,
    parallelBatches: ParallelBatch[]
  ): Map<string, ScheduledTask> {
    const scheduledTasks = new Map<string, ScheduledTask>();

    // Sort tasks by resource optimization scores (prioritize resource-efficient tasks)
    const sortedTasks = tasks.sort((a, b) => {
      const scoreA = taskScores.get(a.id)?.resourceScore || 0;
      const scoreB = taskScores.get(b.id)?.resourceScore || 0;
      return scoreB - scoreA;
    });

    let currentTime = new Date();
    let batchId = 0;

    for (const batch of parallelBatches) {
      const batchTasks = batch.taskIds
        .map(id => sortedTasks.find(t => t.id === id))
        .filter(task => task !== undefined) as AtomicTask[];

      for (const task of batchTasks) {
        const scores = taskScores.get(task.id);
        const resources = this.allocateOptimalResources(task, batchTasks);

        const scheduledTask: ScheduledTask = {
          task,
          scheduledStart: new Date(currentTime),
          scheduledEnd: new Date(currentTime.getTime() + task.estimatedHours * 60 * 60 * 1000),
          assignedResources: resources,
          batchId,
          prerequisiteTasks: task.dependencies,
          dependentTasks: task.dependents,
          metadata: {
            algorithm: 'resource_balanced',
            priorityScore: scores?.priorityScore || 0,
            resourceScore: scores?.resourceScore || 0,
            deadlineScore: scores?.deadlineScore || 0,
            dependencyScore: scores?.dependencyScore || 0,
            durationScore: scores?.durationScore || 0,
            systemLoadScore: scores?.systemLoadScore || 0,
            complexityScore: scores?.complexityScore || 0,
            businessImpactScore: scores?.businessImpactScore || 0,
            agentAvailabilityScore: scores?.agentAvailabilityScore || 0,
            totalScore: scores?.totalScore || 0,
            scheduledAt: new Date(),
            lastOptimized: new Date()
          }
        };

        scheduledTasks.set(task.id, scheduledTask);
      }

      // Move to next batch time
      currentTime = new Date(currentTime.getTime() + batch.estimatedDuration * 60 * 60 * 1000);
      batchId++;
    }

    return scheduledTasks;
  }

  private shortestJobScheduling(
    tasks: AtomicTask[],
    taskScores: Map<string, TaskScores>,
    parallelBatches: ParallelBatch[]
  ): Map<string, ScheduledTask> {
    const scheduledTasks = new Map<string, ScheduledTask>();

    // Sort tasks by estimated duration (shortest first)
    const sortedTasks = tasks.sort((a, b) => {
      return a.estimatedHours - b.estimatedHours;
    });

    let currentTime = new Date();
    let batchId = 0;

    // Process tasks in sorted order, respecting batch constraints
    for (const batch of parallelBatches) {
      // Get tasks for this batch in shortest-job order
      const batchTaskIds = new Set(batch.taskIds);
      const batchTasks = sortedTasks.filter(task => batchTaskIds.has(task.id));

      for (const task of batchTasks) {
        const scores = taskScores.get(task.id);
        const resources = this.allocateResources(task);

        const scheduledTask: ScheduledTask = {
          task,
          scheduledStart: new Date(currentTime),
          scheduledEnd: new Date(currentTime.getTime() + task.estimatedHours * 60 * 60 * 1000),
          assignedResources: resources,
          batchId,
          prerequisiteTasks: task.dependencies,
          dependentTasks: task.dependents,
          metadata: {
            algorithm: 'shortest_job',
            priorityScore: scores?.priorityScore || 0,
            resourceScore: scores?.resourceScore || 0,
            deadlineScore: scores?.deadlineScore || 0,
            dependencyScore: scores?.dependencyScore || 0,
            durationScore: scores?.durationScore || 0,
            systemLoadScore: scores?.systemLoadScore || 0,
            complexityScore: scores?.complexityScore || 0,
            businessImpactScore: scores?.businessImpactScore || 0,
            agentAvailabilityScore: scores?.agentAvailabilityScore || 0,
            totalScore: scores?.totalScore || 0,
            scheduledAt: new Date(),
            lastOptimized: new Date()
          }
        };

        scheduledTasks.set(task.id, scheduledTask);
      }

      // Move to next batch time
      currentTime = new Date(currentTime.getTime() + batch.estimatedDuration * 60 * 60 * 1000);
      batchId++;
    }

    return scheduledTasks;
  }

  /**
   * Get comprehensive schedule metrics
   */
  getScheduleMetrics(): {
    resourceUtilization: number;
    timelineEfficiency: number;
    dependencyCompliance: number;
    parallelismFactor: number;
    criticalPathOptimization: number;
    overallScore: number;
  } | null {
    if (!this.currentSchedule) {
      return null;
    }

    const schedule = this.currentSchedule;

    // Calculate resource utilization
    const maxMemory = this.config.resources.maxMemoryMB;
    const maxCpu = this.config.resources.maxCpuUtilization;
    const peakMemoryUtilization = schedule.resourceUtilization.peakMemoryMB / maxMemory;
    const avgCpuUtilization = schedule.resourceUtilization.averageCpuUtilization / maxCpu;
    const resourceUtilization = (peakMemoryUtilization + avgCpuUtilization) / 2;

    // Calculate timeline efficiency (actual vs theoretical minimum)
    const totalTaskHours = Array.from(schedule.scheduledTasks.values())
      .reduce((sum, task) => sum + task.task.estimatedHours, 0);
    const theoreticalMinimum = totalTaskHours / this.config.resources.availableAgents;
    const actualDuration = schedule.timeline.totalDuration / (60 * 60 * 1000); // Convert to hours
    const timelineEfficiency = Math.min(1, theoreticalMinimum / actualDuration);

    // Calculate dependency compliance (tasks scheduled after dependencies)
    let dependencyViolations = 0;
    let totalDependencies = 0;

    for (const [, scheduledTask] of schedule.scheduledTasks) {
      for (const depId of scheduledTask.prerequisiteTasks) {
        totalDependencies++;
        const depTask = schedule.scheduledTasks.get(depId);
        if (depTask && scheduledTask.scheduledStart < depTask.scheduledEnd) {
          dependencyViolations++;
        }
      }
    }

    const dependencyCompliance = totalDependencies > 0
      ? 1 - (dependencyViolations / totalDependencies)
      : 1;

    // Calculate parallelism factor
    const parallelismFactor = schedule.timeline.parallelismFactor;

    // Calculate critical path optimization
    const criticalPathTasks = schedule.timeline.criticalPath.length;
    const totalTasks = schedule.scheduledTasks.size;
    const criticalPathOptimization = criticalPathTasks > 0
      ? 1 - (criticalPathTasks / totalTasks)
      : 1;

    // Calculate overall score
    const overallScore = (
      resourceUtilization * 0.25 +
      timelineEfficiency * 0.3 +
      dependencyCompliance * 0.2 +
      parallelismFactor * 0.15 +
      criticalPathOptimization * 0.1
    );

    return {
      resourceUtilization,
      timelineEfficiency,
      dependencyCompliance,
      parallelismFactor,
      criticalPathOptimization,
      overallScore
    };
  }

  /**
   * Get detailed schedule analytics
   */
  getScheduleAnalytics(): {
    taskDistribution: Record<string, number>;
    batchAnalysis: Array<{
      batchId: number;
      taskCount: number;
      estimatedDuration: number;
      resourceUsage: number;
      parallelismScore: number;
    }>;
    bottlenecks: Array<{
      taskId: string;
      type: 'resource' | 'dependency' | 'timeline';
      severity: 'low' | 'medium' | 'high';
      description: string;
    }>;
    optimizationOpportunities: Array<{
      type: 'parallelization' | 'resource_reallocation' | 'timeline_compression';
      impact: 'low' | 'medium' | 'high';
      description: string;
      estimatedImprovement: number;
    }>;
  } | null {
    if (!this.currentSchedule) {
      return null;
    }

    const schedule = this.currentSchedule;

    // Task distribution by type, priority, etc.
    const taskDistribution: Record<string, number> = {};
    for (const scheduledTask of schedule.scheduledTasks.values()) {
      const type = scheduledTask.task.type || 'unknown';
      taskDistribution[type] = (taskDistribution[type] || 0) + 1;
    }

    // Batch analysis
    const batchAnalysis = schedule.executionBatches.map(batch => {
      const batchTasks = batch.taskIds.map(id => schedule.scheduledTasks.get(id)).filter(Boolean);
      const totalMemory = batchTasks.reduce((sum, task) => sum + (task?.assignedResources.memoryMB || 0), 0);
      const totalCpu = batchTasks.reduce((sum, task) => sum + (task?.assignedResources.cpuWeight || 0), 0);
      const resourceUsage = (totalMemory / this.config.resources.maxMemoryMB +
                           totalCpu / this.config.resources.maxCpuUtilization) / 2;

      return {
        batchId: batch.batchId,
        taskCount: batch.taskIds.length,
        estimatedDuration: batch.estimatedDuration,
        resourceUsage,
        parallelismScore: Math.min(1, batch.taskIds.length / this.config.resources.availableAgents)
      };
    });

    // Identify bottlenecks
    const bottlenecks: Array<{
      taskId: string;
      type: 'resource' | 'dependency' | 'timeline';
      severity: 'low' | 'medium' | 'high';
      description: string;
    }> = [];

    // Resource bottlenecks
    for (const [taskId, scheduledTask] of schedule.scheduledTasks) {
      const memoryRatio = scheduledTask.assignedResources.memoryMB / this.config.resources.maxMemoryMB;
      const cpuRatio = scheduledTask.assignedResources.cpuWeight / this.config.resources.maxCpuUtilization;

      if (memoryRatio > 0.8 || cpuRatio > 0.8) {
        bottlenecks.push({
          taskId,
          type: 'resource',
          severity: memoryRatio > 0.9 || cpuRatio > 0.9 ? 'high' : 'medium',
          description: `High resource usage: ${Math.round(memoryRatio * 100)}% memory, ${Math.round(cpuRatio * 100)}% CPU`
        });
      }
    }

    // Dependency bottlenecks (tasks with many dependencies)
    for (const [taskId, scheduledTask] of schedule.scheduledTasks) {
      if (scheduledTask.prerequisiteTasks.length > 3) {
        bottlenecks.push({
          taskId,
          type: 'dependency',
          severity: scheduledTask.prerequisiteTasks.length > 5 ? 'high' : 'medium',
          description: `High dependency count: ${scheduledTask.prerequisiteTasks.length} prerequisites`
        });
      }
    }

    // Optimization opportunities
    const optimizationOpportunities: Array<{
      type: 'parallelization' | 'resource_reallocation' | 'timeline_compression';
      impact: 'low' | 'medium' | 'high';
      description: string;
      estimatedImprovement: number;
    }> = [];

    // Look for parallelization opportunities
    const underutilizedBatches = batchAnalysis.filter(batch => batch.parallelismScore < 0.7);
    if (underutilizedBatches.length > 0) {
      optimizationOpportunities.push({
        type: 'parallelization',
        impact: 'medium',
        description: `${underutilizedBatches.length} batches could benefit from better parallelization`,
        estimatedImprovement: 0.15
      });
    }

    // Look for resource reallocation opportunities
    const overallocatedTasks = Array.from(schedule.scheduledTasks.values())
      .filter(task => task.assignedResources.memoryMB > 1024 && task.task.estimatedHours < 2);
    if (overallocatedTasks.length > 0) {
      optimizationOpportunities.push({
        type: 'resource_reallocation',
        impact: 'low',
        description: `${overallocatedTasks.length} short tasks are over-allocated resources`,
        estimatedImprovement: 0.08
      });
    }

    return {
      taskDistribution,
      batchAnalysis,
      bottlenecks,
      optimizationOpportunities
    };
  }

  /**
   * Load schedule from persistence
   */
  async loadSchedule(scheduleId: string): Promise<ExecutionSchedule | null> {
    try {
      const filePath = `./VibeCoderOutput/vibe-task-manager/schedules/${scheduleId}.json`;
      const fs = await import('fs-extra');

      if (!(await fs.pathExists(filePath))) {
        return null;
      }

      const scheduleData = await fs.readJson(filePath);

      // Convert scheduledTasks object back to Map
      const schedule: ExecutionSchedule = {
        ...scheduleData,
        scheduledTasks: new Map(Object.entries(scheduleData.scheduledTasks)),
        timeline: {
          ...scheduleData.timeline,
          startTime: new Date(scheduleData.timeline.startTime),
          endTime: new Date(scheduleData.timeline.endTime)
        },
        metadata: {
          ...scheduleData.metadata,
          generatedAt: new Date(scheduleData.metadata.generatedAt),
          optimizedAt: new Date(scheduleData.metadata.optimizedAt)
        }
      };

      return schedule;

    } catch (error) {
      logger.error({ err: error, scheduleId }, 'Failed to load schedule from persistence');
      return null;
    }
  }

  /**
   * Clean up old schedules
   */
  async cleanupOldSchedules(olderThanDays: number = 7): Promise<number> {
    try {
      const fs = await import('fs-extra');
      const scheduleDir = './VibeCoderOutput/vibe-task-manager/schedules';

      if (!(await fs.pathExists(scheduleDir))) {
        return 0;
      }

      const files = await fs.readdir(scheduleDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      let cleanedCount = 0;

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = `${scheduleDir}/${file}`;
          const stats = await fs.stat(filePath);

          if (stats.mtime < cutoffDate) {
            await fs.remove(filePath);
            cleanedCount++;
          }
        }
      }

      logger.info({ cleanedCount, olderThanDays }, 'Schedule cleanup completed');
      return cleanedCount;

    } catch (error) {
      logger.error({ err: error }, 'Failed to cleanup old schedules');
      return 0;
    }
  }
}
