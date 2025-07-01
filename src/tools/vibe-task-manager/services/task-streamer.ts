/**
 * Task Streaming Service
 *
 * Implements task streaming to agents with queuing, load balancing,
 * and real-time task distribution capabilities.
 */

import { AtomicTask } from '../types/task.js';
import { ProjectContext } from '../types/project-context.js';
import { AgentOrchestrator } from './agent-orchestrator.js';
import { TaskScheduler } from './task-scheduler.js';
import { AppError, ValidationError } from '../../../utils/errors.js';
import { MemoryManager } from '../../code-map-generator/cache/memoryManager.js';
import logger from '../../../logger.js';

/**
 * Task stream configuration
 */
export interface StreamConfig {
  batchSize: number;
  streamInterval: number;
  maxQueueSize: number;
  priorityThreshold: number;
  enableRealTimeStreaming: boolean;
  loadBalancingEnabled: boolean;
}

/**
 * Task stream status
 */
export interface StreamStatus {
  isActive: boolean;
  queuedTasks: number;
  streamedTasks: number;
  failedTasks: number;
  averageStreamTime: number;
  lastStreamAt?: Date;
}

/**
 * Task claim information
 */
export interface TaskClaim {
  taskId: string;
  agentId: string;
  claimedAt: Date;
  expiresAt: Date;
  status: 'claimed' | 'released' | 'expired';
}

/**
 * Stream event types
 */
export type StreamEvent =
  | 'task_queued'
  | 'task_streamed'
  | 'task_claimed'
  | 'task_released'
  | 'stream_started'
  | 'stream_stopped'
  | 'queue_full'
  | 'agent_unavailable';

/**
 * Stream event data
 */
export interface StreamEventData {
  event: StreamEvent;
  taskId?: string;
  agentId?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Task Streaming Service
 */
export class TaskStreamer {
  private static instance: TaskStreamer | null = null;

  private taskQueue: Array<{ task: AtomicTask; context: ProjectContext; epicTitle?: string; priority: number }> = [];
  private claims = new Map<string, TaskClaim>();
  private agentOrchestrator: AgentOrchestrator;
  private taskScheduler: TaskScheduler;
  private memoryManager: MemoryManager;
  private config: StreamConfig;
  private streamTimer?: NodeJS.Timeout;
  private status: StreamStatus;
  private eventListeners = new Map<StreamEvent, Array<(data: StreamEventData) => void>>();

  private constructor(config?: Partial<StreamConfig>) {
    this.config = {
      batchSize: 5,
      streamInterval: 5000, // 5 seconds
      maxQueueSize: 1000,
      priorityThreshold: 2, // High priority and above
      enableRealTimeStreaming: true,
      loadBalancingEnabled: true,
      ...config
    };

    this.agentOrchestrator = AgentOrchestrator.getInstance();
    this.taskScheduler = new TaskScheduler();
    this.memoryManager = new MemoryManager();

    this.status = {
      isActive: false,
      queuedTasks: 0,
      streamedTasks: 0,
      failedTasks: 0,
      averageStreamTime: 0
    };

    logger.info({ config: this.config }, 'Task streamer initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<StreamConfig>): TaskStreamer {
    if (!TaskStreamer.instance) {
      TaskStreamer.instance = new TaskStreamer(config);
    }
    return TaskStreamer.instance;
  }

  /**
   * Start task streaming
   */
  async startStreaming(): Promise<void> {
    try {
      if (this.status.isActive) {
        logger.warn('Task streaming already active');
        return;
      }

      this.status.isActive = true;
      this.status.lastStreamAt = new Date();

      if (this.config.enableRealTimeStreaming) {
        this.streamTimer = setInterval(() => {
          this.processTaskQueue().catch(error => {
            logger.error({ err: error }, 'Error in task streaming interval');
          });
        }, this.config.streamInterval);
      }

      this.emitEvent('stream_started', {});
      logger.info('Task streaming started');

    } catch (error) {
      logger.error({ err: error }, 'Failed to start task streaming');
      throw new AppError('Task streaming startup failed', { cause: error });
    }
  }

  /**
   * Stop task streaming
   */
  async stopStreaming(): Promise<void> {
    try {
      this.status.isActive = false;

      if (this.streamTimer) {
        clearInterval(this.streamTimer);
        this.streamTimer = undefined;
      }

      // Release all active claims
      await this.releaseAllClaims();

      this.emitEvent('stream_stopped', {});
      logger.info('Task streaming stopped');

    } catch (error) {
      logger.error({ err: error }, 'Failed to stop task streaming');
      throw new AppError('Task streaming shutdown failed', { cause: error });
    }
  }

  /**
   * Queue task for streaming
   */
  async queueTask(
    task: AtomicTask,
    context: ProjectContext,
    epicTitle?: string
  ): Promise<void> {
    try {
      if (this.taskQueue.length >= this.config.maxQueueSize) {
        this.emitEvent('queue_full', { taskId: task.id });
        throw new ValidationError('Task queue is full');
      }

      const priority = this.calculateTaskPriority(task);

      const queueItem = {
        task,
        context,
        epicTitle,
        priority
      };

      // Insert task in priority order
      this.insertTaskByPriority(queueItem);

      this.status.queuedTasks = this.taskQueue.length;
      this.emitEvent('task_queued', { taskId: task.id });

      logger.debug({
        taskId: task.id,
        priority,
        queueSize: this.taskQueue.length
      }, 'Task queued for streaming');

      // Trigger immediate processing for high-priority tasks
      if (priority <= this.config.priorityThreshold && this.status.isActive) {
        await this.processTaskQueue();
      }

      // Memory management
      this.memoryManager.getMemoryStats();

    } catch (error) {
      logger.error({ err: error, taskId: task.id }, 'Failed to queue task');
      throw new AppError('Task queuing failed', { cause: error });
    }
  }

  /**
   * Claim a task for execution
   */
  async claimTask(taskId: string, agentId: string): Promise<TaskClaim | null> {
    try {
      // Check if task exists in queue
      const queueIndex = this.taskQueue.findIndex(item => item.task.id === taskId);
      if (queueIndex === -1) {
        logger.warn({ taskId, agentId }, 'Attempted to claim non-existent task');
        return null;
      }

      // Check if already claimed
      const existingClaim = this.claims.get(taskId);
      if (existingClaim && existingClaim.status === 'claimed') {
        logger.warn({ taskId, agentId, existingAgent: existingClaim.agentId }, 'Task already claimed');
        return null;
      }

      // Create claim
      const claim: TaskClaim = {
        taskId,
        agentId,
        claimedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        status: 'claimed'
      };

      this.claims.set(taskId, claim);
      this.emitEvent('task_claimed', { taskId, agentId });

      logger.info({ taskId, agentId }, 'Task claimed by agent');
      return claim;

    } catch (error) {
      logger.error({ err: error, taskId, agentId }, 'Failed to claim task');
      throw new AppError('Task claim failed', { cause: error });
    }
  }

  /**
   * Release a task claim
   */
  async releaseTask(taskId: string, agentId: string): Promise<void> {
    try {
      const claim = this.claims.get(taskId);

      if (!claim) {
        logger.warn({ taskId, agentId }, 'Attempted to release non-existent claim');
        return;
      }

      if (claim.agentId !== agentId) {
        logger.warn({
          taskId,
          agentId,
          claimOwner: claim.agentId
        }, 'Attempted to release claim owned by different agent');
        return;
      }

      claim.status = 'released';
      this.claims.delete(taskId);

      this.emitEvent('task_released', { taskId, agentId });
      logger.info({ taskId, agentId }, 'Task claim released');

    } catch (error) {
      logger.error({ err: error, taskId, agentId }, 'Failed to release task');
      throw new AppError('Task release failed', { cause: error });
    }
  }

  /**
   * Get ready tasks for streaming
   */
  async getReadyTasks(limit?: number): Promise<AtomicTask[]> {
    try {
      const batchSize = limit || this.config.batchSize;
      const readyTasks: AtomicTask[] = [];

      // Get tasks that are not claimed and dependencies are met
      for (const queueItem of this.taskQueue.slice(0, batchSize * 2)) {
        if (readyTasks.length >= batchSize) break;

        const task = queueItem.task;

        // Skip if already claimed
        const claim = this.claims.get(task.id);
        if (claim && claim.status === 'claimed') continue;

        // Check if dependencies are satisfied
        const dependenciesMet = await this.checkDependencies(task);
        if (!dependenciesMet) continue;

        readyTasks.push(task);
      }

      return readyTasks;

    } catch (error) {
      logger.error({ err: error }, 'Failed to get ready tasks');
      throw new AppError('Ready tasks retrieval failed', { cause: error });
    }
  }

  /**
   * Get stream status
   */
  getStatus(): StreamStatus {
    return {
      ...this.status,
      queuedTasks: this.taskQueue.length
    };
  }

  /**
   * Get task queue information
   */
  getQueueInfo(): {
    totalTasks: number;
    highPriorityTasks: number;
    claimedTasks: number;
    oldestTaskAge: number;
  } {
    const now = new Date();
    const highPriorityTasks = this.taskQueue.filter(item => item.priority <= this.config.priorityThreshold).length;
    const claimedTasks = Array.from(this.claims.values()).filter(claim => claim.status === 'claimed').length;

    let oldestTaskAge = 0;
    if (this.taskQueue.length > 0) {
      const oldestTask = this.taskQueue[this.taskQueue.length - 1];
      oldestTaskAge = now.getTime() - new Date(oldestTask.task.createdAt).getTime();
    }

    return {
      totalTasks: this.taskQueue.length,
      highPriorityTasks,
      claimedTasks,
      oldestTaskAge
    };
  }

  /**
   * Add event listener
   */
  addEventListener(event: StreamEvent, listener: (data: StreamEventData) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(event: StreamEvent, listener: (data: StreamEventData) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Process task queue and stream to agents
   */
  private async processTaskQueue(): Promise<void> {
    try {
      if (!this.status.isActive || this.taskQueue.length === 0) {
        return;
      }

      const startTime = Date.now();
      const readyTasks = await this.getReadyTasks();

      if (readyTasks.length === 0) {
        return;
      }

      let streamedCount = 0;

      for (const task of readyTasks) {
        const queueItem = this.taskQueue.find(item => item.task.id === task.id);
        if (!queueItem) continue;

        try {
          // Attempt to assign to agent
          const assignment = await this.agentOrchestrator.assignTask(
            task,
            queueItem.context,
            queueItem.epicTitle
          );

          if (assignment) {
            // Remove from queue
            this.removeTaskFromQueue(task.id);
            streamedCount++;

            this.emitEvent('task_streamed', { taskId: task.id, agentId: assignment.agentId });

            logger.debug({
              taskId: task.id,
              agentId: assignment.agentId
            }, 'Task streamed to agent');
          } else {
            this.emitEvent('agent_unavailable', { taskId: task.id });
          }

        } catch (error) {
          logger.error({ err: error, taskId: task.id }, 'Failed to stream task');
          this.status.failedTasks++;
        }
      }

      // Update statistics
      if (streamedCount > 0) {
        this.status.streamedTasks += streamedCount;
        this.status.lastStreamAt = new Date();

        const streamTime = Date.now() - startTime;
        this.status.averageStreamTime =
          (this.status.averageStreamTime + streamTime) / 2;
      }

      this.status.queuedTasks = this.taskQueue.length;

    } catch (error) {
      logger.error({ err: error }, 'Error processing task queue');
    }
  }

  /**
   * Calculate task priority
   */
  private calculateTaskPriority(task: AtomicTask): number {
    const priorityMap: Record<string, number> = {
      'critical': 1,
      'high': 2,
      'medium': 3,
      'low': 4
    };

    return priorityMap[task.priority.toLowerCase()] || 3;
  }

  /**
   * Insert task in priority order
   */
  private insertTaskByPriority(queueItem: { task: AtomicTask; context: ProjectContext; epicTitle?: string; priority: number }): void {
    let insertIndex = this.taskQueue.length;

    for (let i = 0; i < this.taskQueue.length; i++) {
      if (queueItem.priority < this.taskQueue[i].priority) {
        insertIndex = i;
        break;
      }
    }

    this.taskQueue.splice(insertIndex, 0, queueItem);
  }

  /**
   * Remove task from queue
   */
  private removeTaskFromQueue(taskId: string): void {
    const index = this.taskQueue.findIndex(item => item.task.id === taskId);
    if (index > -1) {
      this.taskQueue.splice(index, 1);
    }
  }

  /**
   * Check if task dependencies are satisfied
   */
  private async checkDependencies(task: AtomicTask): Promise<boolean> {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    // For now, assume dependencies are satisfied
    // In a full implementation, this would check actual dependency status
    return true;
  }

  /**
   * Release all active claims
   */
  private async releaseAllClaims(): Promise<void> {
    for (const [taskId, claim] of this.claims.entries()) {
      if (claim.status === 'claimed') {
        claim.status = 'released';
        this.emitEvent('task_released', { taskId, agentId: claim.agentId });
      }
    }
    this.claims.clear();
  }

  /**
   * Emit stream event
   */
  private emitEvent(event: StreamEvent, data: Partial<StreamEventData>): void {
    const eventData: StreamEventData = {
      event,
      timestamp: new Date(),
      ...data
    };

    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(eventData);
        } catch (error) {
          logger.error({ err: error, event }, 'Error in stream event listener');
        }
      });
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopStreaming().catch(error => {
      logger.error({ err: error }, 'Error stopping streaming during destroy');
    });

    this.taskQueue = [];
    this.claims.clear();
    this.eventListeners.clear();

    TaskStreamer.instance = null;
    logger.info('Task streamer destroyed');
  }
}
