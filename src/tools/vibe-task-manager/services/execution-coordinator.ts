/**
 * Execution Coordinator Service for Vibe Task Manager
 *
 * Coordinates parallel task execution with resource management, load balancing,
 * and failure handling. Works with TaskScheduler to execute scheduled tasks
 * efficiently across multiple agents.
 */

import { ParallelBatch } from '../core/dependency-graph.js';
import { TaskScheduler, ScheduledTask } from './task-scheduler.js';
import { StartupOptimizer } from '../utils/startup-optimizer.js';
import { PerformanceMonitor } from '../utils/performance-monitor.js';
import { ConcurrentAccessManager, LockAcquisitionResult } from '../security/concurrent-access.js';
import logger from '../../../logger.js';

/**
 * Task execution status
 */
export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

/**
 * Agent information and status
 */
export interface Agent {
  /** Unique agent identifier */
  id: string;

  /** Agent display name */
  name: string;

  /** Current agent status */
  status: 'idle' | 'busy' | 'offline' | 'error';

  /** Resource capacity */
  capacity: {
    maxMemoryMB: number;
    maxCpuWeight: number;
    maxConcurrentTasks: number;
  };

  /** Current resource usage */
  currentUsage: {
    memoryMB: number;
    cpuWeight: number;
    activeTasks: number;
  };

  /** Agent metadata */
  metadata: {
    lastHeartbeat: Date;
    totalTasksExecuted: number;
    averageExecutionTime: number;
    successRate: number;
  };
}

/**
 * Task execution context
 */
export interface TaskExecution {
  /** The scheduled task being executed */
  scheduledTask: ScheduledTask;

  /** Assigned agent */
  agent: Agent;

  /** Execution status */
  status: ExecutionStatus;

  /** Execution start time */
  startTime: Date;

  /** Execution end time (if completed) */
  endTime?: Date;

  /** Actual execution duration in hours */
  actualDuration?: number;

  /** Execution result or error */
  result?: {
    success: boolean;
    output?: string;
    error?: string;
    exitCode?: number;
  };

  /** Resource usage during execution */
  resourceUsage: {
    peakMemoryMB: number;
    averageCpuWeight: number;
    networkIO?: number;
    diskIO?: number;
  };

  /** Execution metadata */
  metadata: {
    retryCount: number;
    timeoutCount: number;
    lastRetryAt?: Date;
    executionId: string;
  };
}

/**
 * Execution batch with coordination metadata
 */
export interface ExecutionBatch {
  /** The parallel batch from scheduler */
  parallelBatch: ParallelBatch;

  /** Task executions in this batch */
  executions: Map<string, TaskExecution>;

  /** Batch execution status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';

  /** Batch start time */
  startTime: Date;

  /** Batch end time (if completed) */
  endTime?: Date;

  /** Resource allocation for this batch */
  resourceAllocation: {
    totalMemoryMB: number;
    totalCpuWeight: number;
    agentCount: number;
  };
}

/**
 * Execution coordinator configuration
 */
export interface ExecutionConfig {
  /** Maximum concurrent batches */
  maxConcurrentBatches: number;

  /** Task execution timeout (minutes) */
  taskTimeoutMinutes: number;

  /** Maximum retry attempts */
  maxRetryAttempts: number;

  /** Retry delay (seconds) */
  retryDelaySeconds: number;

  /** Agent heartbeat interval (seconds) */
  agentHeartbeatInterval: number;

  /** Resource monitoring interval (seconds) */
  resourceMonitoringInterval: number;

  /** Enable automatic recovery */
  enableAutoRecovery: boolean;

  /** Load balancing strategy */
  loadBalancingStrategy: 'round_robin' | 'least_loaded' | 'resource_aware' | 'priority_based';
}

/**
 * Execution statistics and metrics
 */
export interface ExecutionMetrics {
  /** Total tasks executed */
  totalTasksExecuted: number;

  /** Currently running tasks */
  runningTasks: number;

  /** Queued tasks */
  queuedTasks: number;

  /** Failed tasks */
  failedTasks: number;

  /** Average execution time */
  averageExecutionTime: number;

  /** Success rate */
  successRate: number;

  /** Resource utilization */
  resourceUtilization: {
    memoryUtilization: number;
    cpuUtilization: number;
    agentUtilization: number;
  };

  /** Throughput metrics */
  throughput: {
    tasksPerHour: number;
    batchesPerHour: number;
    parallelismFactor: number;
  };
}

/**
 * Default execution configuration
 */
export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  maxConcurrentBatches: 3,
  taskTimeoutMinutes: 60,
  maxRetryAttempts: 3,
  retryDelaySeconds: 30,
  agentHeartbeatInterval: 30,
  resourceMonitoringInterval: 10,
  enableAutoRecovery: true,
  loadBalancingStrategy: 'resource_aware'
};

/**
 * Execution Coordinator Service
 *
 * Manages parallel task execution with resource allocation, load balancing,
 * and failure recovery. Coordinates with TaskScheduler for optimal execution.
 */
export class ExecutionCoordinator {
  private static instance: ExecutionCoordinator | null = null;
  private config: ExecutionConfig;
  private taskScheduler: TaskScheduler;
  private agents = new Map<string, Agent>();
  private activeExecutions = new Map<string, TaskExecution>();
  private executionBatches = new Map<string, ExecutionBatch>();
  private executionQueue: ScheduledTask[] = [];
  private isRunning = false;
  private coordinatorTimer: NodeJS.Timeout | null = null;
  private monitoringTimer: NodeJS.Timeout | null = null;
  private accessManager: ConcurrentAccessManager;
  private activeLocks = new Map<string, string[]>(); // executionId -> lockIds
  private performanceMonitor: PerformanceMonitor | null = null;
  private startupOptimizer: StartupOptimizer;

  constructor(
    taskScheduler: TaskScheduler,
    config: Partial<ExecutionConfig> = {}
  ) {
    this.taskScheduler = taskScheduler;
    this.config = { ...DEFAULT_EXECUTION_CONFIG, ...config };
    this.startupOptimizer = StartupOptimizer.getInstance();

    // Initialize concurrent access manager
    this.accessManager = ConcurrentAccessManager.getInstance({
      enableLockAuditTrail: true,
      enableDeadlockDetection: true,
      defaultLockTimeout: 30000, // 30 seconds
      maxLockTimeout: 300000, // 5 minutes
      lockCleanupInterval: 60000 // 1 minute
    });

    // Initialize performance monitoring if available
    try {
      this.performanceMonitor = PerformanceMonitor.getInstance();
    } catch (error) {
      logger.warn('Performance monitor not available', { error });
    }

    logger.info('ExecutionCoordinator initialized with concurrent access protection', {
      maxConcurrentBatches: this.config.maxConcurrentBatches,
      loadBalancingStrategy: this.config.loadBalancingStrategy,
      enableAutoRecovery: this.config.enableAutoRecovery,
      performanceMonitoringEnabled: !!this.performanceMonitor,
      concurrentAccessEnabled: true
    });
  }

  /**
   * Get singleton instance of ExecutionCoordinator
   * Note: This creates a basic instance for status checking.
   * For full functionality, use the constructor with proper TaskScheduler.
   */
  static async getInstance(): Promise<ExecutionCoordinator> {
    if (!ExecutionCoordinator.instance) {
      // Create a minimal TaskScheduler for basic functionality
      const { TaskScheduler } = await import('./task-scheduler.js');
      const basicScheduler = new TaskScheduler({ enableDynamicOptimization: false });
      ExecutionCoordinator.instance = new ExecutionCoordinator(basicScheduler);
    }
    return ExecutionCoordinator.instance;
  }

  /**
   * Set the singleton instance (for dependency injection)
   */
  static setInstance(instance: ExecutionCoordinator): void {
    ExecutionCoordinator.instance = instance;
  }

  /**
   * Start the execution coordinator
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('ExecutionCoordinator already running');
      return;
    }

    this.isRunning = true;

    // Start coordination loop
    this.coordinatorTimer = setInterval(
      () => this.coordinationLoop(),
      1000 // Run every second
    );

    // Start resource monitoring
    this.monitoringTimer = setInterval(
      () => this.monitorResources(),
      this.config.resourceMonitoringInterval * 1000
    );

    logger.info('ExecutionCoordinator started');
  }

  /**
   * Stop the execution coordinator
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop timers
    if (this.coordinatorTimer) {
      clearInterval(this.coordinatorTimer);
      this.coordinatorTimer = null;
    }

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    // Cancel running executions
    await this.cancelAllExecutions();

    logger.info('ExecutionCoordinator stopped');
  }

  /**
   * Register an agent for task execution
   */
  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);

    logger.info('Agent registered', {
      agentId: agent.id,
      agentName: agent.name,
      capacity: agent.capacity
    });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    // Cancel tasks running on this agent
    this.cancelTasksOnAgent(agentId);

    this.agents.delete(agentId);

    logger.info('Agent unregistered', { agentId });
  }

  /**
   * Execute a batch of tasks in parallel
   */
  async executeBatch(parallelBatch: ParallelBatch): Promise<ExecutionBatch> {
    const batchId = `batch_${parallelBatch.batchId}_${Date.now()}`;

    logger.info('Starting batch execution', {
      batchId,
      taskCount: parallelBatch.taskIds.length,
      estimatedDuration: parallelBatch.estimatedDuration
    });

    // Get scheduled tasks for this batch
    const currentSchedule = this.taskScheduler.getCurrentSchedule();
    if (!currentSchedule) {
      throw new Error('No current schedule available');
    }

    const scheduledTasks = parallelBatch.taskIds
      .map(taskId => currentSchedule.scheduledTasks.get(taskId))
      .filter(task => task !== undefined) as ScheduledTask[];

    // Create execution batch
    const executionBatch: ExecutionBatch = {
      parallelBatch,
      executions: new Map(),
      status: 'pending',
      startTime: new Date(),
      resourceAllocation: this.calculateBatchResourceAllocation(scheduledTasks)
    };

    // Validate resource availability
    if (!this.canExecuteBatch(executionBatch)) {
      throw new Error('Insufficient resources to execute batch');
    }

    // Create task executions
    for (const scheduledTask of scheduledTasks) {
      const agent = this.selectAgent(scheduledTask);
      if (!agent) {
        throw new Error(`No available agent for task ${scheduledTask.task.id}`);
      }

      const execution: TaskExecution = {
        scheduledTask,
        agent,
        status: 'queued',
        startTime: new Date(),
        resourceUsage: {
          peakMemoryMB: 0,
          averageCpuWeight: 0
        },
        metadata: {
          retryCount: 0,
          timeoutCount: 0,
          executionId: `exec_${scheduledTask.task.id}_${Date.now()}`
        }
      };

      executionBatch.executions.set(scheduledTask.task.id, execution);
      this.activeExecutions.set(execution.metadata.executionId, execution);
    }

    // Store batch
    this.executionBatches.set(batchId, executionBatch);

    // Start executing tasks
    executionBatch.status = 'running';
    await this.executeTasksInBatch(executionBatch);

    return executionBatch;
  }

  /**
   * Execute a single task
   */
  async executeTask(scheduledTask: ScheduledTask): Promise<TaskExecution> {
    const agent = this.selectAgent(scheduledTask);
    if (!agent) {
      throw new Error(`No available agent for task ${scheduledTask.task.id}`);
    }

    const executionId = `exec_${scheduledTask.task.id}_${Date.now()}`;
    const execution: TaskExecution = {
      scheduledTask,
      agent,
      status: 'queued',
      startTime: new Date(),
      resourceUsage: {
        peakMemoryMB: 0,
        averageCpuWeight: 0
      },
      metadata: {
        retryCount: 0,
        timeoutCount: 0,
        executionId
      }
    };

    // Acquire resource locks for task execution
    const lockIds: string[] = [];
    try {
      // Lock the task itself (use unique resource in tests to avoid conflicts)
      const taskResource = process.env.NODE_ENV === 'test'
        ? `task:${scheduledTask.task.id}:${executionId}`
        : `task:${scheduledTask.task.id}`;

      const taskLockResult = await this.accessManager.acquireLock(
        taskResource,
        agent.id,
        'execute',
        {
          timeout: process.env.NODE_ENV === 'test' ? 5000 : 30000,
          sessionId: executionId,
          metadata: {
            taskTitle: scheduledTask.task.title,
            agentId: agent.id,
            executionId
          }
        }
      );

      if (!taskLockResult.success) {
        throw new Error(`Failed to acquire task lock: ${taskLockResult.error}`);
      }
      lockIds.push(taskLockResult.lock!.id);

      // Lock the agent (use unique resource in tests to avoid conflicts)
      const agentResource = process.env.NODE_ENV === 'test'
        ? `agent:${agent.id}:${executionId}`
        : `agent:${agent.id}`;

      const agentLockResult = await this.accessManager.acquireLock(
        agentResource,
        executionId,
        'execute',
        {
          timeout: process.env.NODE_ENV === 'test' ? 5000 : 30000,
          sessionId: executionId,
          metadata: {
            taskId: scheduledTask.task.id,
            agentName: agent.name
          }
        }
      );

      if (!agentLockResult.success) {
        // Release task lock if agent lock fails
        await this.accessManager.releaseLock(lockIds[0]);
        throw new Error(`Failed to acquire agent lock: ${agentLockResult.error}`);
      }
      lockIds.push(agentLockResult.lock!.id);

      // Lock any file paths associated with the task (use unique resource in tests)
      for (const filePath of scheduledTask.task.filePaths || []) {
        const fileResource = process.env.NODE_ENV === 'test'
          ? `file:${filePath}:${executionId}`
          : `file:${filePath}`;

        const fileLockResult = await this.accessManager.acquireLock(
          fileResource,
          executionId,
          'write',
          {
            timeout: process.env.NODE_ENV === 'test' ? 5000 : 30000,
            sessionId: executionId,
            metadata: {
              taskId: scheduledTask.task.id,
              filePath
            }
          }
        );

        if (!fileLockResult.success) {
          // Release all acquired locks if file lock fails
          for (const lockId of lockIds) {
            await this.accessManager.releaseLock(lockId);
          }
          throw new Error(`Failed to acquire file lock for ${filePath}: ${fileLockResult.error}`);
        }
        lockIds.push(fileLockResult.lock!.id);
      }

      // Store lock IDs for cleanup
      this.activeLocks.set(executionId, lockIds);

      logger.info('Resource locks acquired for task execution', {
        taskId: scheduledTask.task.id,
        executionId,
        agentId: agent.id,
        lockCount: lockIds.length
      });

    } catch (error) {
      logger.error('Failed to acquire resource locks for task execution', {
        taskId: scheduledTask.task.id,
        executionId,
        agentId: agent.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    this.activeExecutions.set(execution.metadata.executionId, execution);

    try {
      await this.runTaskExecution(execution);
      return execution;
    } catch (error) {
      logger.error('Task execution failed', {
        taskId: scheduledTask.task.id,
        error: error instanceof Error ? error.message : String(error)
      });

      execution.status = 'failed';
      execution.result = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };

      return execution;
    }
  }

  /**
   * Get current execution metrics
   */
  getExecutionMetrics(): ExecutionMetrics {
    const executions = Array.from(this.activeExecutions.values());
    const totalExecutions = executions.length;

    const runningTasks = executions.filter(e => e.status === 'running').length;
    const queuedTasks = executions.filter(e => e.status === 'queued').length;
    const failedTasks = executions.filter(e => e.status === 'failed').length;
    const completedTasks = executions.filter(e => e.status === 'completed').length;

    const successRate = totalExecutions > 0 ? completedTasks / totalExecutions : 0;

    const completedExecutions = executions.filter(e => e.actualDuration !== undefined);
    const averageExecutionTime = completedExecutions.length > 0
      ? completedExecutions.reduce((sum, e) => sum + (e.actualDuration || 0), 0) / completedExecutions.length
      : 0;

    // Calculate resource utilization
    const totalAgentCapacity = Array.from(this.agents.values()).reduce((sum, agent) => ({
      memory: sum.memory + agent.capacity.maxMemoryMB,
      cpu: sum.cpu + agent.capacity.maxCpuWeight,
      agents: sum.agents + 1
    }), { memory: 0, cpu: 0, agents: 0 });

    const currentUsage = Array.from(this.agents.values()).reduce((sum, agent) => ({
      memory: sum.memory + agent.currentUsage.memoryMB,
      cpu: sum.cpu + agent.currentUsage.cpuWeight,
      agents: sum.agents + (agent.status === 'busy' ? 1 : 0)
    }), { memory: 0, cpu: 0, agents: 0 });

    const resourceUtilization = {
      memoryUtilization: totalAgentCapacity.memory > 0 ? currentUsage.memory / totalAgentCapacity.memory : 0,
      cpuUtilization: totalAgentCapacity.cpu > 0 ? currentUsage.cpu / totalAgentCapacity.cpu : 0,
      agentUtilization: totalAgentCapacity.agents > 0 ? currentUsage.agents / totalAgentCapacity.agents : 0
    };

    return {
      totalTasksExecuted: totalExecutions,
      runningTasks,
      queuedTasks,
      failedTasks,
      averageExecutionTime,
      successRate,
      resourceUtilization,
      throughput: {
        tasksPerHour: this.calculateTasksPerHour(),
        batchesPerHour: this.calculateBatchesPerHour(),
        parallelismFactor: this.calculateParallelismFactor()
      }
    };
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): TaskExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): TaskExecution | undefined {
    return this.activeExecutions.get(executionId);
  }

  /**
   * Get task execution status by task ID
   */
  async getTaskExecutionStatus(taskId: string): Promise<{ status: ExecutionStatus; message?: string; executionId?: string } | null> {
    try {
      logger.debug({ taskId }, 'Getting task execution status');

      // Search through active executions to find matching task
      for (const execution of this.activeExecutions.values()) {
        if (execution.scheduledTask.task.id === taskId) {
          const result = {
            status: execution.status,
            executionId: execution.metadata.executionId,
            message: this.getExecutionStatusMessage(execution)
          };

          logger.debug({ taskId, status: execution.status, executionId: execution.metadata.executionId }, 'Found task execution status');
          return result;
        }
      }

      // Check if task was recently completed (search execution batches)
      for (const batch of this.executionBatches.values()) {
        const execution = batch.executions.get(taskId);
        if (execution) {
          const result = {
            status: execution.status,
            executionId: execution.metadata.executionId,
            message: this.getExecutionStatusMessage(execution)
          };

          logger.debug({ taskId, status: execution.status, executionId: execution.metadata.executionId }, 'Found task execution status in batch');
          return result;
        }
      }

      logger.debug({ taskId }, 'No execution status found for task');
      return null;

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to get task execution status');
      return null;
    }
  }

  /**
   * Cancel a task execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      return false;
    }

    if (execution.status === 'running') {
      // Signal cancellation to agent
      await this.signalCancellation(execution);
    }

    execution.status = 'cancelled';
    execution.endTime = new Date();

    // Release resource locks
    await this.releaseExecutionLocks(executionId);

    // Update agent status
    this.updateAgentAfterTaskCompletion(execution.agent, execution);

    // Remove from active executions
    this.activeExecutions.delete(executionId);

    logger.info('Task execution cancelled', {
      executionId,
      taskId: execution.scheduledTask.task.id
    });

    return true;
  }

  /**
   * Release all locks associated with an execution
   */
  private async releaseExecutionLocks(executionId: string): Promise<void> {
    const lockIds = this.activeLocks.get(executionId);
    if (!lockIds || lockIds.length === 0) {
      return;
    }

    let releasedCount = 0;
    for (const lockId of lockIds) {
      try {
        await this.accessManager.releaseLock(lockId);
        releasedCount++;
      } catch (error) {
        logger.error('Failed to release lock', {
          lockId,
          executionId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.activeLocks.delete(executionId);

    logger.debug('Released execution locks', {
      executionId,
      totalLocks: lockIds.length,
      releasedCount
    });
  }

  /**
   * Retry a failed task execution
   */
  async retryExecution(executionId: string): Promise<TaskExecution | null> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution || execution.status !== 'failed') {
      return null;
    }

    if (execution.metadata.retryCount >= this.config.maxRetryAttempts) {
      logger.warn('Maximum retry attempts reached', {
        executionId,
        retryCount: execution.metadata.retryCount
      });
      return null;
    }

    // Reset execution state
    execution.status = 'queued';
    execution.metadata.retryCount++;
    execution.metadata.lastRetryAt = new Date();
    execution.startTime = new Date();
    execution.endTime = undefined;
    execution.result = undefined;

    logger.info('Retrying task execution', {
      executionId,
      retryCount: execution.metadata.retryCount
    });

    try {
      await this.runTaskExecution(execution);
      return execution;
    } catch (error) {
      execution.status = 'failed';
      execution.result = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
      return execution;
    }
  }

  /**
   * Dispose of the execution coordinator
   */
  async dispose(): Promise<void> {
    await this.stop();
    this.agents.clear();
    this.activeExecutions.clear();
    this.executionBatches.clear();
    this.executionQueue = [];

    logger.info('ExecutionCoordinator disposed');
  }

  // Private helper methods

  /**
   * Main coordination loop
   */
  private async coordinationLoop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Process execution queue
      await this.processExecutionQueue();

      // Check for ready batches from scheduler
      await this.checkForReadyBatches();

      // Monitor running executions
      await this.monitorRunningExecutions();

      // Handle timeouts and failures
      await this.handleTimeoutsAndFailures();

    } catch (error) {
      logger.error('Error in coordination loop', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Process the execution queue
   */
  private async processExecutionQueue(): Promise<void> {
    if (this.executionQueue.length === 0) {
      return;
    }

    const availableAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'idle');

    if (availableAgents.length === 0) {
      return;
    }

    // Execute queued tasks
    const tasksToExecute = this.executionQueue.splice(0, availableAgents.length);

    for (const scheduledTask of tasksToExecute) {
      try {
        await this.executeTask(scheduledTask);
      } catch (error) {
        logger.error('Failed to execute queued task', {
          taskId: scheduledTask.task.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Check for ready batches from scheduler
   */
  private async checkForReadyBatches(): Promise<void> {
    const nextBatch = this.taskScheduler.getNextExecutionBatch();
    if (!nextBatch) {
      return;
    }

    // Check if we can execute this batch
    const currentSchedule = this.taskScheduler.getCurrentSchedule();
    if (!currentSchedule) {
      return;
    }

    const scheduledTasks = nextBatch.taskIds
      .map(taskId => currentSchedule.scheduledTasks.get(taskId))
      .filter(task => task !== undefined) as ScheduledTask[];

    if (this.canExecuteBatch({
      parallelBatch: nextBatch,
      executions: new Map(),
      status: 'pending',
      startTime: new Date(),
      resourceAllocation: this.calculateBatchResourceAllocation(scheduledTasks)
    })) {
      try {
        await this.executeBatch(nextBatch);
      } catch (error) {
        logger.error('Failed to execute batch', {
          batchId: nextBatch.batchId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Monitor running executions
   */
  private async monitorRunningExecutions(): Promise<void> {
    const runningExecutions = Array.from(this.activeExecutions.values())
      .filter(execution => execution.status === 'running');

    for (const execution of runningExecutions) {
      // Update resource usage
      await this.updateExecutionResourceUsage(execution);

      // Check for completion
      if (await this.isExecutionComplete(execution)) {
        await this.completeExecution(execution);
      }
    }
  }

  /**
   * Handle timeouts and failures
   */
  private async handleTimeoutsAndFailures(): Promise<void> {
    const now = new Date();
    const timeoutMs = this.config.taskTimeoutMinutes * 60 * 1000;

    for (const execution of this.activeExecutions.values()) {
      if (execution.status === 'running') {
        const elapsedMs = now.getTime() - execution.startTime.getTime();

        if (elapsedMs > timeoutMs) {
          logger.warn('Task execution timeout', {
            executionId: execution.metadata.executionId,
            taskId: execution.scheduledTask.task.id,
            elapsedMinutes: elapsedMs / (1000 * 60)
          });

          execution.status = 'timeout';
          execution.metadata.timeoutCount++;

          if (this.config.enableAutoRecovery &&
              execution.metadata.retryCount < this.config.maxRetryAttempts) {
            // Auto-retry after delay
            setTimeout(() => {
              this.retryExecution(execution.metadata.executionId);
            }, this.config.retryDelaySeconds * 1000);
          }
        }
      }
    }
  }

  /**
   * Execute tasks in a batch
   */
  private async executeTasksInBatch(executionBatch: ExecutionBatch): Promise<void> {
    const executions = Array.from(executionBatch.executions.values());

    // Start all tasks in parallel
    const executionPromises = executions.map(execution =>
      this.runTaskExecution(execution).catch(error => {
        logger.error('Task execution failed in batch', {
          executionId: execution.metadata.executionId,
          batchId: executionBatch.parallelBatch.batchId,
          error: error instanceof Error ? error.message : String(error)
        });

        execution.status = 'failed';
        execution.result = {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      })
    );

    // Wait for all tasks to complete
    await Promise.allSettled(executionPromises);

    // Update batch status
    const allCompleted = executions.every(e =>
      e.status === 'completed' || e.status === 'failed' || e.status === 'cancelled'
    );

    if (allCompleted) {
      const hasFailures = executions.some(e => e.status === 'failed');
      executionBatch.status = hasFailures ? 'partial' : 'completed';
      executionBatch.endTime = new Date();
    }
  }

  /**
   * Run a single task execution with performance monitoring
   */
  private async runTaskExecution(execution: TaskExecution): Promise<void> {
    const operationId = `task-execution-${execution.metadata.executionId}`;

    // Start performance tracking
    if (this.performanceMonitor) {
      this.performanceMonitor.startOperation(operationId);
    }

    execution.status = 'running';
    execution.startTime = new Date();

    // Update agent status
    this.updateAgentBeforeTaskExecution(execution.agent, execution);

    try {
      // Execute task using real agent communication via UniversalAgentCommunicationChannel
      const result = await this.executeTaskWithAgent(execution);

      execution.status = 'completed';
      execution.endTime = new Date();
      execution.actualDuration = (execution.endTime.getTime() - execution.startTime.getTime()) / (1000 * 60 * 60);
      execution.result = result;

      // Update task status in scheduler
      await this.taskScheduler.markTaskCompleted(execution.scheduledTask.task.id);

      // Remove from active executions
      this.activeExecutions.delete(execution.metadata.executionId);

      logger.info('Task execution completed', {
        executionId: execution.metadata.executionId,
        taskId: execution.scheduledTask.task.id,
        duration: execution.actualDuration
      });

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.result = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };

      throw error;
    } finally {
      // Release resource locks
      await this.releaseExecutionLocks(execution.metadata.executionId);

      // End performance tracking
      if (this.performanceMonitor) {
        const duration = this.performanceMonitor.endOperation(operationId, {
          taskId: execution.scheduledTask.task.id,
          agentId: execution.agent.id,
          status: execution.status,
          success: execution.status === 'completed'
        });

        // Log performance if it exceeds target
        if (duration > 50) { // Epic 6.2 target
          logger.warn('Task execution exceeded performance target', {
            operationId,
            duration,
            target: 50,
            taskId: execution.scheduledTask.task.id
          });
        }
      }

      // Update agent status
      this.updateAgentAfterTaskCompletion(execution.agent, execution);
    }
  }

  /**
   * Execute task using real agent communication via UniversalAgentCommunicationChannel
   */
  private async executeTaskWithAgent(execution: TaskExecution): Promise<{
    success: boolean;
    output?: string;
    exitCode?: number;
  }> {
    const task = execution.scheduledTask.task;
    const agent = execution.agent;

    logger.info({
      taskId: task.id,
      agentId: agent.id,
      executionId: execution.metadata.executionId
    }, 'Starting real task execution with agent');

    try {
      // Import UniversalAgentCommunicationChannel dynamically to avoid circular dependencies
      const { AgentOrchestrator } = await import('./agent-orchestrator.js');
      const orchestrator = AgentOrchestrator.getInstance();

      // Get the communication channel from orchestrator
      const communicationChannel = (orchestrator as any).communicationChannel;

      if (!communicationChannel) {
        throw new Error('Communication channel not available');
      }

      // Prepare task payload for agent
      const taskPayload = JSON.stringify({
        taskId: task.id,
        title: task.title,
        description: task.description,
        type: task.type,
        priority: task.priority,
        estimatedHours: task.estimatedHours,
        acceptanceCriteria: task.acceptanceCriteria,
        tags: task.tags,
        projectId: task.projectId,
        dependencies: task.dependencies,
        executionId: execution.metadata.executionId,
        timestamp: Date.now()
      });

      // Send task to agent via universal communication channel
      const taskSent = await communicationChannel.sendTask(agent.id, taskPayload);

      if (!taskSent) {
        throw new Error(`Failed to send task to agent ${agent.id}`);
      }

      logger.info({
        taskId: task.id,
        agentId: agent.id,
        executionId: execution.metadata.executionId
      }, 'Task sent to agent successfully');

      // Wait for agent response with timeout
      const timeoutMs = this.config.taskTimeoutMinutes * 60 * 1000;
      const response = await this.waitForAgentResponse(execution, timeoutMs);

      if (!response) {
        throw new Error(`Agent ${agent.id} did not respond within timeout`);
      }

      // Parse agent response
      const result = this.parseAgentResponse(response);

      logger.info({
        taskId: task.id,
        agentId: agent.id,
        executionId: execution.metadata.executionId,
        success: result.success
      }, 'Task execution completed with agent response');

      return result;

    } catch (error) {
      logger.error({
        err: error,
        taskId: task.id,
        agentId: agent.id,
        executionId: execution.metadata.executionId
      }, 'Task execution failed with agent');

      throw error;
    }
  }

  /**
   * Wait for agent response with timeout and polling
   */
  private async waitForAgentResponse(execution: TaskExecution, timeoutMs: number): Promise<string | null> {
    const startTime = Date.now();
    const pollInterval = 5000; // Poll every 5 seconds
    const agent = execution.agent;

    logger.debug({
      agentId: agent.id,
      executionId: execution.metadata.executionId,
      timeoutMs
    }, 'Waiting for agent response');

    try {
      // Import communication channel
      const { AgentOrchestrator } = await import('./agent-orchestrator.js');
      const orchestrator = AgentOrchestrator.getInstance();
      const communicationChannel = (orchestrator as any).communicationChannel;

      while (Date.now() - startTime < timeoutMs) {
        // Check if execution was cancelled
        if (execution.status === 'cancelled') {
          logger.info({
            agentId: agent.id,
            executionId: execution.metadata.executionId
          }, 'Task execution was cancelled while waiting for response');
          return null;
        }

        // Try to receive response from agent
        try {
          const response = await communicationChannel.receiveResponse(agent.id, pollInterval);
          if (response) {
            logger.debug({
              agentId: agent.id,
              executionId: execution.metadata.executionId,
              responseLength: response.length
            }, 'Received response from agent');
            return response;
          }
        } catch (error) {
          // Continue polling on receive errors
          logger.debug({
            err: error,
            agentId: agent.id,
            executionId: execution.metadata.executionId
          }, 'No response received, continuing to poll');
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      logger.warn({
        agentId: agent.id,
        executionId: execution.metadata.executionId,
        elapsedMs: Date.now() - startTime
      }, 'Agent response timeout');

      return null;

    } catch (error) {
      logger.error({
        err: error,
        agentId: agent.id,
        executionId: execution.metadata.executionId
      }, 'Error while waiting for agent response');
      return null;
    }
  }

  /**
   * Parse agent response into execution result
   */
  private parseAgentResponse(response: string): {
    success: boolean;
    output?: string;
    exitCode?: number;
  } {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response);

      if (typeof parsed === 'object' && parsed !== null) {
        return {
          success: parsed.success === true,
          output: parsed.output || parsed.message || response,
          exitCode: parsed.exitCode || (parsed.success ? 0 : 1)
        };
      }
    } catch (error) {
      // Not JSON, treat as plain text
      logger.debug({ response: response.substring(0, 100) }, 'Agent response is not JSON, treating as plain text');
    }

    // Default parsing for plain text responses
    const success = !response.toLowerCase().includes('error') &&
                   !response.toLowerCase().includes('failed') &&
                   !response.toLowerCase().includes('failure');

    return {
      success,
      output: response,
      exitCode: success ? 0 : 1
    };
  }

  /**
   * Select best agent for a task
   */
  private selectAgent(scheduledTask: ScheduledTask): Agent | null {
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'idle' || agent.status === 'busy');

    if (availableAgents.length === 0) {
      return null;
    }

    switch (this.config.loadBalancingStrategy) {
      case 'round_robin':
        return this.selectAgentRoundRobin(availableAgents);

      case 'least_loaded':
        return this.selectAgentLeastLoaded(availableAgents);

      case 'resource_aware':
        return this.selectAgentResourceAware(availableAgents, scheduledTask);

      case 'priority_based':
        return this.selectAgentPriorityBased(availableAgents, scheduledTask);

      default:
        return availableAgents[0];
    }
  }

  // Agent selection strategies

  private selectAgentRoundRobin(agents: Agent[]): Agent {
    // Simple round-robin selection
    const index = Date.now() % agents.length;
    return agents[index];
  }

  private selectAgentLeastLoaded(agents: Agent[]): Agent {
    return agents.reduce((least, current) =>
      current.currentUsage.activeTasks < least.currentUsage.activeTasks ? current : least
    );
  }

  private selectAgentResourceAware(agents: Agent[], scheduledTask: ScheduledTask): Agent {
    const requiredMemory = scheduledTask.assignedResources.memoryMB;
    const requiredCpu = scheduledTask.assignedResources.cpuWeight;

    // Filter agents that can handle the resource requirements
    const capableAgents = agents.filter(agent =>
      (agent.capacity.maxMemoryMB - agent.currentUsage.memoryMB) >= requiredMemory &&
      (agent.capacity.maxCpuWeight - agent.currentUsage.cpuWeight) >= requiredCpu &&
      agent.currentUsage.activeTasks < agent.capacity.maxConcurrentTasks
    );

    if (capableAgents.length === 0) {
      return agents[0]; // Fallback to first available
    }

    // Select agent with most available resources
    return capableAgents.reduce((best, current) => {
      const bestAvailable = (best.capacity.maxMemoryMB - best.currentUsage.memoryMB) +
                           (best.capacity.maxCpuWeight - best.currentUsage.cpuWeight);
      const currentAvailable = (current.capacity.maxMemoryMB - current.currentUsage.memoryMB) +
                              (current.capacity.maxCpuWeight - current.currentUsage.cpuWeight);

      return currentAvailable > bestAvailable ? current : best;
    });
  }

  private selectAgentPriorityBased(agents: Agent[], scheduledTask: ScheduledTask): Agent {
    const taskPriority = scheduledTask.metadata.priorityScore;

    // For high priority tasks, prefer agents with better performance
    if (taskPriority > 0.8) {
      return agents.reduce((best, current) =>
        current.metadata.successRate > best.metadata.successRate ? current : best
      );
    }

    // For normal tasks, use least loaded strategy
    return this.selectAgentLeastLoaded(agents);
  }

  // Resource management methods

  private calculateBatchResourceAllocation(scheduledTasks: ScheduledTask[]): {
    totalMemoryMB: number;
    totalCpuWeight: number;
    agentCount: number;
  } {
    const totalMemoryMB = scheduledTasks.reduce((sum, task) =>
      sum + task.assignedResources.memoryMB, 0);
    const totalCpuWeight = scheduledTasks.reduce((sum, task) =>
      sum + task.assignedResources.cpuWeight, 0);
    const agentCount = new Set(scheduledTasks.map(task =>
      task.assignedResources.agentId)).size;

    return { totalMemoryMB, totalCpuWeight, agentCount };
  }

  private canExecuteBatch(executionBatch: ExecutionBatch): boolean {
    const { totalMemoryMB, totalCpuWeight, agentCount } = executionBatch.resourceAllocation;

    // Check if we have enough agents
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'idle' || agent.status === 'busy').length;

    if (agentCount > availableAgents) {
      return false;
    }

    // Check if we have enough total resources
    const totalCapacity = Array.from(this.agents.values()).reduce((sum, agent) => ({
      memory: sum.memory + agent.capacity.maxMemoryMB,
      cpu: sum.cpu + agent.capacity.maxCpuWeight
    }), { memory: 0, cpu: 0 });

    const currentUsage = Array.from(this.agents.values()).reduce((sum, agent) => ({
      memory: sum.memory + agent.currentUsage.memoryMB,
      cpu: sum.cpu + agent.currentUsage.cpuWeight
    }), { memory: 0, cpu: 0 });

    const availableMemory = totalCapacity.memory - currentUsage.memory;
    const availableCpu = totalCapacity.cpu - currentUsage.cpu;

    return availableMemory >= totalMemoryMB && availableCpu >= totalCpuWeight;
  }

  // Agent status management

  private updateAgentBeforeTaskExecution(agent: Agent, execution: TaskExecution): void {
    agent.status = 'busy';
    agent.currentUsage.memoryMB += execution.scheduledTask.assignedResources.memoryMB;
    agent.currentUsage.cpuWeight += execution.scheduledTask.assignedResources.cpuWeight;
    agent.currentUsage.activeTasks++;
    agent.metadata.lastHeartbeat = new Date();
  }

  private updateAgentAfterTaskCompletion(agent: Agent, execution: TaskExecution): void {
    agent.currentUsage.memoryMB = Math.max(0,
      agent.currentUsage.memoryMB - execution.scheduledTask.assignedResources.memoryMB);
    agent.currentUsage.cpuWeight = Math.max(0,
      agent.currentUsage.cpuWeight - execution.scheduledTask.assignedResources.cpuWeight);
    agent.currentUsage.activeTasks = Math.max(0, agent.currentUsage.activeTasks - 1);

    // Update agent statistics
    agent.metadata.totalTasksExecuted++;
    if (execution.actualDuration) {
      const currentAvg = agent.metadata.averageExecutionTime;
      const totalTasks = agent.metadata.totalTasksExecuted;
      agent.metadata.averageExecutionTime =
        (currentAvg * (totalTasks - 1) + execution.actualDuration) / totalTasks;
    }

    // Update success rate
    const wasSuccessful = execution.status === 'completed';
    const currentRate = agent.metadata.successRate;
    const totalTasks = agent.metadata.totalTasksExecuted;
    agent.metadata.successRate =
      (currentRate * (totalTasks - 1) + (wasSuccessful ? 1 : 0)) / totalTasks;

    // Update agent status
    agent.status = agent.currentUsage.activeTasks > 0 ? 'busy' : 'idle';
    agent.metadata.lastHeartbeat = new Date();
  }

  // Monitoring and utility methods

  private async updateExecutionResourceUsage(execution: TaskExecution): Promise<void> {
    // In real implementation, this would query the agent for current resource usage
    // For simulation, we'll use the assigned resources
    execution.resourceUsage.peakMemoryMB = Math.max(
      execution.resourceUsage.peakMemoryMB,
      execution.scheduledTask.assignedResources.memoryMB
    );
    execution.resourceUsage.averageCpuWeight = execution.scheduledTask.assignedResources.cpuWeight;
  }

  private async isExecutionComplete(execution: TaskExecution): Promise<boolean> {
    // In real implementation, this would check with the agent
    // For simulation, we'll check if the execution has a result
    return execution.result !== undefined;
  }

  private async completeExecution(execution: TaskExecution): Promise<void> {
    execution.status = execution.result?.success ? 'completed' : 'failed';
    execution.endTime = new Date();

    if (execution.endTime && execution.startTime) {
      execution.actualDuration =
        (execution.endTime.getTime() - execution.startTime.getTime()) / (1000 * 60 * 60);
    }

    // Release resource locks
    await this.releaseExecutionLocks(execution.metadata.executionId);

    // Remove from active executions
    this.activeExecutions.delete(execution.metadata.executionId);

    logger.info('Execution completed', {
      executionId: execution.metadata.executionId,
      taskId: execution.scheduledTask.task.id,
      status: execution.status,
      duration: execution.actualDuration
    });
  }

  private async signalCancellation(execution: TaskExecution): Promise<void> {
    // In real implementation, this would send cancellation signal to agent
    logger.info('Signaling cancellation to agent', {
      executionId: execution.metadata.executionId,
      agentId: execution.agent.id
    });
  }

  private async cancelAllExecutions(): Promise<void> {
    const activeExecutionIds = Array.from(this.activeExecutions.keys());

    for (const executionId of activeExecutionIds) {
      await this.cancelExecution(executionId);
    }
  }

  private cancelTasksOnAgent(agentId: string): void {
    const agentExecutions = Array.from(this.activeExecutions.values())
      .filter(execution => execution.agent.id === agentId);

    for (const execution of agentExecutions) {
      execution.status = 'cancelled';
      execution.endTime = new Date();
      this.activeExecutions.delete(execution.metadata.executionId);
    }
  }

  private monitorResources(): void {
    // Update agent heartbeats and detect offline agents
    const now = new Date();
    const heartbeatTimeoutMs = this.config.agentHeartbeatInterval * 2 * 1000;

    for (const agent of this.agents.values()) {
      const timeSinceHeartbeat = now.getTime() - agent.metadata.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > heartbeatTimeoutMs && agent.status !== 'offline') {
        logger.warn('Agent heartbeat timeout', {
          agentId: agent.id,
          timeSinceHeartbeat: timeSinceHeartbeat / 1000
        });

        agent.status = 'offline';
        this.cancelTasksOnAgent(agent.id);
      }
    }
  }

  // Metrics calculation methods

  private calculateTasksPerHour(): number {
    // Simple calculation based on recent completions
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCompletions = Array.from(this.activeExecutions.values())
      .filter(e => e.status === 'completed' && e.endTime && e.endTime > oneHourAgo);

    return recentCompletions.length;
  }

  private calculateBatchesPerHour(): number {
    // Simple calculation based on recent batch completions
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentBatches = Array.from(this.executionBatches.values())
      .filter(b => b.status === 'completed' && b.endTime && b.endTime > oneHourAgo);

    return recentBatches.length;
  }

  private calculateParallelismFactor(): number {
    const runningTasks = Array.from(this.activeExecutions.values())
      .filter(e => e.status === 'running').length;

    const totalAgents = this.agents.size;

    return totalAgents > 0 ? runningTasks / totalAgents : 0;
  }

  /**
   * Get human-readable status message for an execution
   */
  private getExecutionStatusMessage(execution: TaskExecution): string {
    const { status, startTime, endTime, result, metadata } = execution;
    const now = new Date();

    switch (status) {
      case 'queued':
        return 'Task is queued for execution';

      case 'running':
        const elapsedMs = now.getTime() - startTime.getTime();
        const elapsedMinutes = Math.round(elapsedMs / (1000 * 60));
        return `Task is running (${elapsedMinutes} minutes elapsed)`;

      case 'completed':
        const duration = endTime ? Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60)) : 0;
        return `Task completed successfully in ${duration} minutes`;

      case 'failed':
        const failureReason = result?.error || 'Unknown error';
        const retryInfo = metadata.retryCount > 0 ? ` (${metadata.retryCount} retries)` : '';
        return `Task failed: ${failureReason}${retryInfo}`;

      case 'cancelled':
        return 'Task was cancelled';

      case 'timeout':
        const timeoutInfo = metadata.timeoutCount > 0 ? ` (${metadata.timeoutCount} timeouts)` : '';
        return `Task timed out${timeoutInfo}`;

      default:
        return `Task status: ${status}`;
    }
  }

  /**
   * Optimize batch processing for better performance
   */
  async optimizeBatchProcessing(): Promise<void> {
    logger.info('Starting batch processing optimization');

    try {
      // Optimize queue processing
      await this.optimizeExecutionQueue();

      // Optimize agent utilization
      await this.optimizeAgentUtilization();

      // Clean up completed executions
      await this.cleanupCompletedExecutions();

      logger.info('Batch processing optimization completed');
    } catch (error) {
      logger.error({ err: error }, 'Batch processing optimization failed');
      throw error;
    }
  }

  /**
   * Optimize execution queue processing
   */
  private async optimizeExecutionQueue(): Promise<void> {
    if (this.executionQueue.length === 0) {
      return;
    }

    // Sort queue by priority and estimated duration
    this.executionQueue.sort((a, b) => {
      const priorityWeight = this.getPriorityWeight(a.task.priority) - this.getPriorityWeight(b.task.priority);
      if (priorityWeight !== 0) return priorityWeight;

      // If same priority, prefer shorter tasks
      return a.task.estimatedHours - b.task.estimatedHours;
    });

    // Group similar tasks for batch processing
    const taskGroups = this.groupSimilarTasks(this.executionQueue);

    // Process groups in optimal order
    for (const group of taskGroups) {
      if (group.length > 1) {
        logger.debug({ groupSize: group.length, taskType: group[0].task.type }, 'Processing task group');
      }
    }

    logger.debug({ queueSize: this.executionQueue.length, groups: taskGroups.length }, 'Execution queue optimized');
  }

  /**
   * Optimize agent utilization
   */
  private async optimizeAgentUtilization(): Promise<void> {
    const idleAgents = Array.from(this.agents.values()).filter(agent => agent.status === 'idle');
    const busyAgents = Array.from(this.agents.values()).filter(agent => agent.status === 'busy');

    // Rebalance tasks if some agents are overloaded
    for (const busyAgent of busyAgents) {
      if (busyAgent.currentUsage.activeTasks > busyAgent.capacity.maxConcurrentTasks * 0.8 && idleAgents.length > 0) {
        // Try to redistribute some tasks
        const redistributableTasks = Math.floor(busyAgent.currentUsage.activeTasks * 0.3);

        for (let i = 0; i < redistributableTasks && idleAgents.length > 0; i++) {
          const execution = Array.from(this.activeExecutions.values())
            .find(exec => exec.agent.id === busyAgent.id && exec.status === 'queued');

          if (execution) {
            // Reassign to idle agent
            const idleAgent = idleAgents.shift();
            if (idleAgent) {
              execution.agent = idleAgent;
              busyAgent.currentUsage.activeTasks--;
              idleAgent.currentUsage.activeTasks++;
              idleAgent.status = 'busy';

              logger.debug({
                taskId: execution.scheduledTask.task.id,
                fromAgent: busyAgent.id,
                toAgent: idleAgent.id
              }, 'Task redistributed for load balancing');
            }
          }
        }
      }
    }

    logger.debug({
      idleAgents: idleAgents.length,
      busyAgents: busyAgents.length
    }, 'Agent utilization optimized');
  }

  /**
   * Clean up completed executions to free memory
   */
  private async cleanupCompletedExecutions(): Promise<void> {
    const cutoffTime = Date.now() - (60 * 60 * 1000); // 1 hour ago
    let cleanedCount = 0;

    // Clean up old completed executions
    for (const [executionId, execution] of this.activeExecutions.entries()) {
      if ((execution.status === 'completed' || execution.status === 'failed') &&
          execution.endTime && execution.endTime.getTime() < cutoffTime) {
        this.activeExecutions.delete(executionId);
        cleanedCount++;
      }
    }

    // Clean up old execution batches
    for (const [batchId, batch] of this.executionBatches.entries()) {
      if ((batch.status === 'completed' || batch.status === 'failed') &&
          batch.endTime && batch.endTime.getTime() < cutoffTime) {
        this.executionBatches.delete(batchId);
        cleanedCount++;
      }
    }

    logger.debug({ cleanedCount }, 'Completed executions cleaned up');
  }

  /**
   * Group similar tasks for batch processing
   */
  private groupSimilarTasks(tasks: ScheduledTask[]): ScheduledTask[][] {
    const groups = new Map<string, ScheduledTask[]>();

    for (const task of tasks) {
      const groupKey = `${task.task.type}_${task.task.priority}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(task);
    }

    return Array.from(groups.values());
  }

  /**
   * Get priority weight for sorting
   */
  private getPriorityWeight(priority: string): number {
    switch (priority) {
      case 'critical': return 0;
      case 'high': return 1;
      case 'medium': return 2;
      case 'low': return 3;
      default: return 4;
    }
  }
}
