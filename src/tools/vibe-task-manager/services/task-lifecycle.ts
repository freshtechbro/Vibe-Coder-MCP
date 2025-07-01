/**
 * Task Lifecycle Service
 *
 * Provides comprehensive task lifecycle automation with state transitions,
 * dependency-based automation, and event-driven lifecycle management.
 */

import { EventEmitter } from 'events';
import { AtomicTask, TaskStatus } from '../types/task.js';
import { OptimizedDependencyGraph } from '../core/dependency-graph.js';
import { getTaskOperations } from '../core/operations/task-operations.js';
import logger from '../../../logger.js';

/**
 * Task transition metadata
 */
export interface TaskTransition {
  taskId: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  timestamp: Date;
  reason?: string;
  triggeredBy?: string;
  metadata?: Record<string, unknown>;
  isAutomated: boolean;
}

/**
 * Task transition result
 */
export interface TaskTransitionResult {
  success: boolean;
  taskId: string;
  transition?: TaskTransition;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Task lifecycle configuration
 */
export interface TaskLifecycleConfig {
  enableAutomation: boolean;
  transitionTimeout: number;
  maxRetries: number;
  enableStateHistory: boolean;
  enableDependencyTracking: boolean;
  automationInterval?: number;
  timeoutThreshold?: number;
}

/**
 * Transition statistics
 */
export interface TransitionStatistics {
  totalTransitions: number;
  byStatus: Record<TaskStatus, number>;
  averageTransitionTime: number;
  successRate: number;
  automatedTransitions: number;
  manualTransitions: number;
}

/**
 * Automation metrics
 */
export interface AutomationMetrics {
  lastProcessingTime: number;
  tasksProcessed: number;
  transitionsTriggered: number;
  errorsEncountered: number;
}

/**
 * Valid task status transitions
 */
const VALID_TRANSITIONS: Map<TaskStatus, TaskStatus[]> = new Map([
  ['pending', ['in_progress', 'cancelled', 'blocked']],
  ['in_progress', ['completed', 'failed', 'blocked', 'cancelled']],
  ['blocked', ['in_progress', 'cancelled', 'failed']],
  ['completed', ['cancelled']], // Only allow cancelled from completed for rollback scenarios
  ['failed', ['pending', 'cancelled']], // Allow restart from failed
  ['cancelled', ['pending']] // Allow restart from cancelled
]);

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TaskLifecycleConfig = {
  enableAutomation: true,
  transitionTimeout: 30000, // 30 seconds
  maxRetries: 3,
  enableStateHistory: true,
  enableDependencyTracking: true,
  automationInterval: 5000, // 5 seconds
  timeoutThreshold: 300000 // 5 minutes
};

/**
 * Task Lifecycle Service
 */
export class TaskLifecycleService extends EventEmitter {
  private config: TaskLifecycleConfig;
  private transitionHistory: Map<string, TaskTransition[]> = new Map();
  private statistics: TransitionStatistics;
  private automationMetrics: AutomationMetrics;
  private transitionLocks: Set<string> = new Set();
  private automationTimer?: NodeJS.Timeout;
  private disposed = false;

  constructor(config: Partial<TaskLifecycleConfig> = {}) {
    super();

    // Validate configuration
    this.validateConfig(config);

    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.statistics = {
      totalTransitions: 0,
      byStatus: {} as Record<TaskStatus, number>,
      averageTransitionTime: 0,
      successRate: 100,
      automatedTransitions: 0,
      manualTransitions: 0
    };

    this.automationMetrics = {
      lastProcessingTime: 0,
      tasksProcessed: 0,
      transitionsTriggered: 0,
      errorsEncountered: 0
    };

    logger.info({
      enableAutomation: this.config.enableAutomation,
      transitionTimeout: this.config.transitionTimeout,
      enableStateHistory: this.config.enableStateHistory
    }, 'TaskLifecycleService initialized');
  }

  /**
   * Validate transition between statuses
   */
  isValidTransition(fromStatus: TaskStatus, toStatus: TaskStatus): boolean {
    const validTransitions = VALID_TRANSITIONS.get(fromStatus);
    return validTransitions ? validTransitions.includes(toStatus) : false;
  }

  /**
   * Transition a task to a new status
   */
  async transitionTask(
    taskId: string,
    toStatus: TaskStatus,
    options: {
      reason?: string;
      triggeredBy?: string;
      metadata?: Record<string, unknown>;
      isAutomated?: boolean;
    } = {}
  ): Promise<TaskTransitionResult> {
    const startTime = Date.now();

    try {
      // Check if task is already being transitioned
      if (this.transitionLocks.has(taskId)) {
        return {
          success: false,
          taskId,
          error: 'Task transition already in progress'
        };
      }

      // Acquire transition lock
      this.transitionLocks.add(taskId);

      // Get current task
      const taskOperations = getTaskOperations();
      const taskResult = await taskOperations.getTask(taskId);

      if (!taskResult.success || !taskResult.data) {
        return {
          success: false,
          taskId,
          error: `Task ${taskId} not found`
        };
      }

      const task = taskResult.data;
      const fromStatus = task.status;

      // Validate transition
      if (!this.isValidTransition(fromStatus, toStatus)) {
        return {
          success: false,
          taskId,
          error: `Invalid transition from ${fromStatus} to ${toStatus}`
        };
      }

      // Check dependencies if transitioning to in_progress
      if (toStatus === 'in_progress' && this.config.enableDependencyTracking) {
        const dependencyCheck = await this.checkDependencies(task);
        if (!dependencyCheck.ready) {
          return {
            success: false,
            taskId,
            error: `Cannot start task: dependencies not completed - ${dependencyCheck.reason}`
          };
        }
      }

      // Perform the status update
      const updateResult = await taskOperations.updateTaskStatus(
        taskId,
        toStatus,
        options.triggeredBy || 'lifecycle-service'
      );

      if (!updateResult.success) {
        return {
          success: false,
          taskId,
          error: `Failed to update task status: ${updateResult.error}`
        };
      }

      // Create transition record
      const transition: TaskTransition = {
        taskId,
        fromStatus,
        toStatus,
        timestamp: new Date(),
        reason: options.reason,
        triggeredBy: options.triggeredBy || 'system',
        metadata: options.metadata,
        isAutomated: options.isAutomated || false
      };

      // Track state history if enabled
      if (this.config.enableStateHistory) {
        this.recordTransition(transition);
      }

      // Update statistics
      this.updateStatistics(transition, Date.now() - startTime);

      // Emit events
      this.emit('task:transition', {
        taskId,
        transition,
        task: updateResult.data
      });

      logger.info({
        taskId,
        fromStatus,
        toStatus,
        triggeredBy: options.triggeredBy,
        reason: options.reason,
        isAutomated: options.isAutomated
      }, 'Task transitioned');

      return {
        success: true,
        taskId,
        transition,
        metadata: {
          transitionTime: Date.now() - startTime
        }
      };

    } catch (error) {
      logger.error({
        err: error,
        taskId,
        toStatus,
        triggeredBy: options.triggeredBy
      }, 'Failed to transition task');

      return {
        success: false,
        taskId,
        error: error instanceof Error ? error.message : String(error)
      };

    } finally {
      // Release transition lock
      this.transitionLocks.delete(taskId);
    }
  }

  /**
   * Process automated transitions for a set of tasks
   */
  async processAutomatedTransitions(
    tasks: AtomicTask[],
    dependencyGraph: OptimizedDependencyGraph
  ): Promise<TaskTransitionResult[]> {
    if (!this.config.enableAutomation) {
      return [];
    }

    const startTime = Date.now();
    const results: TaskTransitionResult[] = [];

    try {
      // Get ready tasks (no dependencies or all dependencies completed)
      const readyTasks = this.getReadyTasks(tasks, dependencyGraph);

      // Transition ready pending tasks to in_progress
      for (const task of readyTasks) {
        if (task.status === 'pending') {
          const result = await this.transitionTask(
            task.id,
            'in_progress',
            {
              reason: 'Dependencies completed - auto-starting',
              triggeredBy: 'automation',
              isAutomated: true
            }
          );
          results.push(result);
        }
      }

      // Check for timeout transitions
      const timeoutResults = await this.checkTimeoutTransitions(tasks);
      results.push(...timeoutResults);

      // Update automation metrics
      this.automationMetrics.lastProcessingTime = Date.now() - startTime;
      this.automationMetrics.tasksProcessed = tasks.length;
      this.automationMetrics.transitionsTriggered = results.filter(r => r.success).length;
      this.automationMetrics.errorsEncountered = results.filter(r => !r.success).length;

      // Emit automation event
      this.emit('automation:processed', {
        tasksProcessed: tasks.length,
        transitionsTriggered: results.filter(r => r.success).length,
        processingTime: Date.now() - startTime
      });

      logger.debug({
        tasksProcessed: tasks.length,
        transitionsTriggered: results.filter(r => r.success).length,
        processingTime: Date.now() - startTime
      }, 'Automated transitions processed');

      return results;

    } catch (error) {
      logger.error({ err: error }, 'Failed to process automated transitions');
      this.automationMetrics.errorsEncountered++;
      return results;
    }
  }

  /**
   * Process dependency cascade when a task completes
   */
  async processDependencyCascade(
    completedTaskId: string,
    tasks: AtomicTask[],
    _dependencyGraph: OptimizedDependencyGraph
  ): Promise<TaskTransitionResult[]> {
    const results: TaskTransitionResult[] = [];

    try {
      // Find tasks that depend on the completed task
      const dependentTasks = tasks.filter(task =>
        task.dependencies.includes(completedTaskId) && task.status === 'pending'
      );

      for (const dependentTask of dependentTasks) {
        // Check if all dependencies are now completed
        const dependencyCheck = await this.checkDependencies(dependentTask);
        if (dependencyCheck.ready) {
          const result = await this.transitionTask(
            dependentTask.id,
            'in_progress',
            {
              reason: `All dependencies completed (triggered by ${completedTaskId})`,
              triggeredBy: 'dependency-cascade',
              isAutomated: true,
              metadata: { triggerTaskId: completedTaskId }
            }
          );
          results.push(result);
        }
      }

      return results;

    } catch (error) {
      logger.error({
        err: error,
        completedTaskId
      }, 'Failed to process dependency cascade');
      return results;
    }
  }

  /**
   * Get tasks ready for execution (no dependencies or all dependencies completed)
   */
  getReadyTasks(tasks: AtomicTask[], _dependencyGraph: OptimizedDependencyGraph): AtomicTask[] {
    return tasks.filter(task => {
      if (task.status !== 'pending') {
        return false;
      }

      // Check if all dependencies are completed
      return task.dependencies.every(depId => {
        const depTask = tasks.find(t => t.id === depId);
        return depTask && depTask.status === 'completed';
      });
    });
  }

  /**
   * Get tasks blocked by dependencies
   */
  getBlockedTasks(tasks: AtomicTask[], _dependencyGraph: OptimizedDependencyGraph): AtomicTask[] {
    return tasks.filter(task => {
      if (task.status !== 'pending') {
        return false;
      }

      // Check if any dependencies are not completed
      return task.dependencies.some(depId => {
        const depTask = tasks.find(t => t.id === depId);
        return !depTask || depTask.status !== 'completed';
      });
    });
  }

  /**
   * Check timeout-based transitions
   */
  async checkTimeoutTransitions(tasks: AtomicTask[]): Promise<TaskTransitionResult[]> {
    const results: TaskTransitionResult[] = [];
    const timeoutThreshold = this.config.timeoutThreshold || 300000; // 5 minutes

    try {
      const now = new Date();

      for (const task of tasks) {
        if (task.status === 'in_progress' && task.startedAt) {
          const duration = now.getTime() - task.startedAt.getTime();
          
          if (duration > timeoutThreshold) {
            const result = await this.transitionTask(
              task.id,
              'blocked',
              {
                reason: `Task timeout after ${Math.round(duration / 1000)} seconds`,
                triggeredBy: 'timeout-check',
                isAutomated: true,
                metadata: { timeoutDuration: duration }
              }
            );
            results.push(result);
          }
        }
      }

      return results;

    } catch (error) {
      logger.error({ err: error }, 'Failed to check timeout transitions');
      return results;
    }
  }

  /**
   * Get task transition history
   */
  getTaskHistory(taskId: string): TaskTransition[] {
    return this.transitionHistory.get(taskId) || [];
  }

  /**
   * Get transition statistics
   */
  getTransitionStatistics(): TransitionStatistics {
    return { ...this.statistics };
  }

  /**
   * Get automation metrics
   */
  getAutomationMetrics(): AutomationMetrics {
    return { ...this.automationMetrics };
  }

  /**
   * Dispose the service
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    // Clear automation timer
    if (this.automationTimer) {
      clearInterval(this.automationTimer);
      this.automationTimer = undefined;
    }

    // Clear state
    this.transitionHistory.clear();
    this.transitionLocks.clear();
    this.removeAllListeners();

    this.disposed = true;
    logger.info('TaskLifecycleService disposed');
  }

  /**
   * Check task dependencies
   */
  private async checkDependencies(task: AtomicTask): Promise<{ ready: boolean; reason?: string }> {
    if (task.dependencies.length === 0) {
      return { ready: true };
    }

    const taskOperations = getTaskOperations();

    for (const depId of task.dependencies) {
      const depResult = await taskOperations.getTask(depId);
      if (!depResult.success || !depResult.data) {
        return { ready: false, reason: `Dependency ${depId} not found` };
      }

      if (depResult.data.status !== 'completed') {
        return { ready: false, reason: `Dependency ${depId} not completed (status: ${depResult.data.status})` };
      }
    }

    return { ready: true };
  }

  /**
   * Record transition in history
   */
  private recordTransition(transition: TaskTransition): void {
    if (!this.transitionHistory.has(transition.taskId)) {
      this.transitionHistory.set(transition.taskId, []);
    }

    const history = this.transitionHistory.get(transition.taskId)!;
    history.push(transition);

    // Limit history size to prevent memory issues
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
  }

  /**
   * Update transition statistics
   */
  private updateStatistics(transition: TaskTransition, transitionTime: number): void {
    this.statistics.totalTransitions++;

    // Count by status
    if (!this.statistics.byStatus[transition.toStatus]) {
      this.statistics.byStatus[transition.toStatus] = 0;
    }
    this.statistics.byStatus[transition.toStatus]++;

    // Update averages
    const totalTime = this.statistics.averageTransitionTime * (this.statistics.totalTransitions - 1);
    this.statistics.averageTransitionTime = (totalTime + transitionTime) / this.statistics.totalTransitions;

    // Count automation vs manual
    if (transition.isAutomated) {
      this.statistics.automatedTransitions++;
    } else {
      this.statistics.manualTransitions++;
    }

    // Recalculate success rate (assuming all recorded transitions are successful)
    this.statistics.successRate = 100; // Since we only record successful transitions
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: Partial<TaskLifecycleConfig>): void {
    if (config.maxRetries !== undefined && config.maxRetries < 0) {
      throw new Error('maxRetries must be non-negative');
    }

    if (config.transitionTimeout !== undefined && config.transitionTimeout <= 0) {
      throw new Error('transitionTimeout must be positive');
    }

    if (config.automationInterval !== undefined && config.automationInterval < 1000) {
      throw new Error('automationInterval must be at least 1000ms');
    }

    if (config.timeoutThreshold !== undefined && config.timeoutThreshold < 1000) {
      throw new Error('timeoutThreshold must be at least 1000ms');
    }
  }
}