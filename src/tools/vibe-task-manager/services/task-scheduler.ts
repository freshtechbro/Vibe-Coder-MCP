/**
 * Task Scheduler Service for Vibe Task Manager
 *
 * Provides intelligent task scheduling with priority-based ordering,
 * resource-aware scheduling, deadline consideration, and dynamic re-scheduling.
 * Integrates with OptimizedDependencyGraph for dependency-aware execution planning.
 */

import { AtomicTask, TaskPriority } from '../types/task.js';
import { OptimizedDependencyGraph, ParallelBatch } from '../core/dependency-graph.js';
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
    priority: 0.3,
    deadline: 0.25,
    dependencies: 0.2,
    resources: 0.15,
    duration: 0.1
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

  constructor(config: Partial<SchedulingConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULING_CONFIG, ...config };

    if (this.config.enableDynamicOptimization) {
      this.startOptimizationTimer();
    }

    logger.info('TaskScheduler initialized', {
      algorithm: this.config.algorithm,
      maxConcurrentTasks: this.config.resources.maxConcurrentTasks,
      enableDynamicOptimization: this.config.enableDynamicOptimization
    });
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
      logger.error('Failed to generate schedule', {
        error: error instanceof Error ? error.message : String(error),
        taskCount: tasks.length,
        algorithm: this.config.algorithm
      });
      throw error;
    }
  }

  /**
   * Update existing schedule with new tasks or changes
   */
  async updateSchedule(
    updatedTasks: AtomicTask[],
    dependencyGraph: OptimizedDependencyGraph
  ): Promise<ExecutionSchedule> {
    if (!this.currentSchedule) {
      throw new Error('No current schedule to update');
    }

    logger.info('Updating existing schedule', {
      scheduleId: this.currentSchedule.id,
      updatedTaskCount: updatedTasks.length
    });

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
   * Get schedule statistics and metrics
   */
  getScheduleMetrics(): {
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    pendingTasks: number;
    blockedTasks: number;
    averageTaskDuration: number;
    estimatedCompletion: Date;
    resourceUtilization: number;
    parallelismFactor: number;
  } | null {
    if (!this.currentSchedule) {
      return null;
    }

    const tasks = Array.from(this.currentSchedule.scheduledTasks.values());
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.task.status === 'completed').length;
    const inProgressTasks = tasks.filter(t => t.task.status === 'in_progress').length;
    const pendingTasks = tasks.filter(t => t.task.status === 'pending').length;
    const blockedTasks = tasks.filter(t => t.task.status === 'blocked').length;

    const averageTaskDuration = tasks.reduce((sum, t) =>
      sum + t.task.estimatedHours, 0) / totalTasks;

    return {
      totalTasks,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      blockedTasks,
      averageTaskDuration,
      estimatedCompletion: this.currentSchedule.timeline.endTime,
      resourceUtilization: this.currentSchedule.resourceUtilization.resourceEfficiency,
      parallelismFactor: this.currentSchedule.timeline.parallelismFactor
    };
  }

  /**
   * Cleanup and dispose of scheduler
   */
  dispose(): void {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = null;
    }

    logger.info('TaskScheduler disposed');
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
      const priorityScore = this.calculatePriorityScore(task.priority);
      const deadlineScore = this.calculateDeadlineScore(task);
      const dependencyScore = this.calculateDependencyScore(task, dependencyGraph, criticalPathSet);
      const resourceScore = this.calculateResourceScore(task);
      const durationScore = this.calculateDurationScore(task);

      const totalScore =
        priorityScore * this.config.weights.priority +
        deadlineScore * this.config.weights.deadline +
        dependencyScore * this.config.weights.dependencies +
        resourceScore * this.config.weights.resources +
        durationScore * this.config.weights.duration;

      scores.set(task.id, {
        priorityScore,
        deadlineScore,
        dependencyScore,
        resourceScore,
        durationScore,
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
   */
  private hybridOptimalScheduling(
    tasks: AtomicTask[],
    taskScores: Map<string, TaskScores>,
    parallelBatches: ParallelBatch[],
    _dependencyGraph: OptimizedDependencyGraph
  ): Map<string, ScheduledTask> {
    // Combine multiple factors for optimal scheduling
    const scheduledTasks = new Map<string, ScheduledTask>();

    // Sort tasks by total score (weighted combination of all factors)
    const sortedTasks = tasks.sort((a, b) => {
      const scoreA = taskScores.get(a.id)?.totalScore || 0;
      const scoreB = taskScores.get(b.id)?.totalScore || 0;
      return scoreB - scoreA;
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

  private calculateDeadlineScore(_task: AtomicTask): number {
    // For now, return a default score since deadline is not in the task interface
    // This would be enhanced when deadline support is added to AtomicTask
    return 0.5;
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
      agentId: this.assignAgent()
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

    return baseResources;
  }

  private assignAgent(): string | undefined {
    // Simple round-robin agent assignment
    const agentCount = this.config.resources.availableAgents;
    if (agentCount === 0) return undefined;

    const agentId = `agent_${(this.scheduleVersion % agentCount) + 1}`;
    return agentId;
  }

  // Helper methods for scheduling algorithms

  private optimizeBatchOrder(
    batch: ParallelBatch,
    sortedTasks: AtomicTask[],
    _taskScores: Map<string, TaskScores>
  ): AtomicTask[] {
    return batch.taskIds
      .map(id => sortedTasks.find(t => t.id === id))
      .filter(task => task !== undefined) as AtomicTask[];
  }

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
    const metrics = this.getScheduleMetrics();
    if (metrics && metrics.resourceUtilization < 0.7) {
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
            algorithm: 'shortest_job',
            priorityScore: scores?.priorityScore || 0,
            resourceScore: scores?.resourceScore || 0,
            deadlineScore: scores?.deadlineScore || 0,
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
}
