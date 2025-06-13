/**
 * Task management service for Repotools Lightweight Server
 * 
 * Handles task lifecycle, execution, progress tracking, and coordination
 * with the Chrome extension via WebSocket updates.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';
import { WebSocketManager, TaskUpdate } from '@/services/websocket.js';

interface Task {
  id: string;
  type: 'code-map-generator' | 'context-curator' | 'research-manager' | 'custom';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
  progress: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  input: any;
  output?: any;
  error?: string;
  metadata: {
    clientId?: string;
    priority: number;
    timeout: number;
    retries: number;
    maxRetries: number;
  };
}

interface TaskResult {
  success: boolean;
  data?: any;
  error?: string;
  metrics?: {
    duration: number;
    memoryUsed: number;
    filesProcessed?: number;
  };
}

interface TaskExecutor {
  execute(task: Task, progressCallback: (progress: number, message?: string) => void): Promise<TaskResult>;
  cancel?(taskId: string): Promise<void>;
  pause?(taskId: string): Promise<void>;
  resume?(taskId: string): Promise<void>;
}

class TaskManager extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private runningTasks: Set<string> = new Set();
  private taskQueue: string[] = [];
  private executors: Map<string, TaskExecutor> = new Map();
  private wsManager?: WebSocketManager;
  private processingInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.setupDefaultExecutors();
  }

  public setWebSocketManager(wsManager: WebSocketManager): void {
    this.wsManager = wsManager;
  }

  public start(): void {
    logger.info('Starting task manager...');

    // Start task processing loop
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 1000);

    // Start cleanup of old tasks
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldTasks();
    }, config.CLEANUP_INTERVAL);

    logger.info('Task manager started');
  }

  public async stop(): Promise<void> {
    logger.info('Stopping task manager...');

    // Clear intervals
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Cancel all running tasks
    const runningTaskIds = Array.from(this.runningTasks);
    await Promise.all(runningTaskIds.map(taskId => this.cancelTask(taskId)));

    logger.info('Task manager stopped');
  }

  private setupDefaultExecutors(): void {
    // Register default task executors
    this.registerExecutor('code-map-generator', new CodeMapExecutor());
    this.registerExecutor('context-curator', new ContextCuratorExecutor());
    this.registerExecutor('research-manager', new ResearchManagerExecutor());
  }

  public registerExecutor(taskType: string, executor: TaskExecutor): void {
    this.executors.set(taskType, executor);
    logger.info(`Registered executor for task type: ${taskType}`);
  }

  public async createTask(
    type: Task['type'],
    input: any,
    options: {
      clientId?: string;
      priority?: number;
      timeout?: number;
      maxRetries?: number;
    } = {}
  ): Promise<string> {
    const taskId = uuidv4();
    const now = Date.now();

    const task: Task = {
      id: taskId,
      type,
      status: 'pending',
      progress: 0,
      createdAt: now,
      input,
      metadata: {
        clientId: options.clientId,
        priority: options.priority || 5,
        timeout: options.timeout || config.TASK_TIMEOUT,
        retries: 0,
        maxRetries: options.maxRetries || 3,
      },
    };

    this.tasks.set(taskId, task);
    this.taskQueue.push(taskId);

    // Sort queue by priority (lower number = higher priority)
    this.taskQueue.sort((a, b) => {
      const taskA = this.tasks.get(a)!;
      const taskB = this.tasks.get(b)!;
      return taskA.metadata.priority - taskB.metadata.priority;
    });

    logger.task(taskId, 'created', {
      type,
      priority: task.metadata.priority,
      queuePosition: this.taskQueue.indexOf(taskId),
    });

    this.emit('taskCreated', task);
    this.sendTaskUpdate(task);

    return taskId;
  }

  public async cancelTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return false;
    }

    // Remove from queue if pending
    if (task.status === 'pending') {
      const queueIndex = this.taskQueue.indexOf(taskId);
      if (queueIndex >= 0) {
        this.taskQueue.splice(queueIndex, 1);
      }
    }

    // Cancel running task
    if (task.status === 'running') {
      const executor = this.executors.get(task.type);
      if (executor?.cancel) {
        try {
          await executor.cancel(taskId);
        } catch (error) {
          logger.errorWithContext(error as Error, 'Task cancellation failed', { taskId });
        }
      }
      this.runningTasks.delete(taskId);
    }

    task.status = 'cancelled';
    task.completedAt = Date.now();

    logger.task(taskId, 'cancelled');
    this.emit('taskCancelled', task);
    this.sendTaskUpdate(task);

    return true;
  }

  public async pauseTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') {
      return false;
    }

    const executor = this.executors.get(task.type);
    if (!executor?.pause) {
      return false;
    }

    try {
      await executor.pause(taskId);
      task.status = 'paused';

      logger.task(taskId, 'paused');
      this.emit('taskPaused', task);
      this.sendTaskUpdate(task);

      return true;
    } catch (error) {
      logger.errorWithContext(error as Error, 'Task pause failed', { taskId });
      return false;
    }
  }

  public async resumeTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'paused') {
      return false;
    }

    const executor = this.executors.get(task.type);
    if (!executor?.resume) {
      return false;
    }

    try {
      await executor.resume(taskId);
      task.status = 'running';

      logger.task(taskId, 'resumed');
      this.emit('taskResumed', task);
      this.sendTaskUpdate(task);

      return true;
    } catch (error) {
      logger.errorWithContext(error as Error, 'Task resume failed', { taskId });
      return false;
    }
  }

  private async processQueue(): Promise<void> {
    // Check if we can start more tasks
    if (this.runningTasks.size >= config.MAX_CONCURRENT_TASKS) {
      return;
    }

    // Get next task from queue
    const taskId = this.taskQueue.shift();
    if (!taskId) {
      return;
    }

    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'pending') {
      return;
    }

    // Start task execution
    await this.executeTask(task);
  }

  private async executeTask(task: Task): Promise<void> {
    const executor = this.executors.get(task.type);
    if (!executor) {
      task.status = 'failed';
      task.error = `No executor found for task type: ${task.type}`;
      task.completedAt = Date.now();

      logger.task(task.id, 'failed', { error: task.error });
      this.emit('taskFailed', task);
      this.sendTaskUpdate(task);
      return;
    }

    task.status = 'running';
    task.startedAt = Date.now();
    this.runningTasks.add(task.id);

    logger.task(task.id, 'started', { type: task.type });
    this.emit('taskStarted', task);
    this.sendTaskUpdate(task);

    try {
      // Set up timeout
      const timeoutPromise = new Promise<TaskResult>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Task timeout'));
        }, task.metadata.timeout);
      });

      // Execute task with progress callback
      const progressCallback = (progress: number, message?: string) => {
        task.progress = Math.max(0, Math.min(100, progress));
        this.sendTaskUpdate(task, message);
      };

      const executionPromise = executor.execute(task, progressCallback);
      const result = await Promise.race([executionPromise, timeoutPromise]);

      // Task completed successfully
      task.status = 'completed';
      task.progress = 100;
      task.output = result.data;
      task.completedAt = Date.now();

      logger.task(task.id, 'completed', {
        duration: task.completedAt - (task.startedAt || task.createdAt),
        ...result.metrics,
      });

      this.emit('taskCompleted', task);
      this.sendTaskUpdate(task);

    } catch (error) {
      // Task failed
      task.status = 'failed';
      task.error = (error as Error).message;
      task.completedAt = Date.now();

      logger.task(task.id, 'failed', {
        error: task.error,
        retries: task.metadata.retries,
        maxRetries: task.metadata.maxRetries,
      });

      // Retry if possible
      if (task.metadata.retries < task.metadata.maxRetries) {
        task.metadata.retries++;
        task.status = 'pending';
        task.progress = 0;
        delete task.error;
        delete task.startedAt;
        delete task.completedAt;

        this.taskQueue.unshift(task.id); // Add to front of queue
        logger.task(task.id, 'retrying', { attempt: task.metadata.retries });
      } else {
        this.emit('taskFailed', task);
      }

      this.sendTaskUpdate(task);
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  private sendTaskUpdate(task: Task, message?: string): void {
    if (!this.wsManager) return;

    const update: TaskUpdate = {
      taskId: task.id,
      status: task.status as TaskUpdate['status'],
      progress: task.progress,
      message,
      ...(task.output && { result: task.output }),
      ...(task.error && { error: task.error }),
    };

    this.wsManager.sendTaskUpdate(update);
  }

  private cleanupOldTasks(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    let cleaned = 0;

    for (const [taskId, task] of this.tasks.entries()) {
      const age = now - task.createdAt;
      const isCompleted = ['completed', 'failed', 'cancelled'].includes(task.status);

      if (isCompleted && age > maxAge) {
        this.tasks.delete(taskId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old tasks`);
    }
  }

  // Public query methods

  public getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  public getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  public getTasksByStatus(status: Task['status']): Task[] {
    return Array.from(this.tasks.values()).filter(task => task.status === status);
  }

  public getQueueStatus(): {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  } {
    const tasks = Array.from(this.tasks.values());
    return {
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
    };
  }
}

// Default task executors (placeholder implementations)

class CodeMapExecutor implements TaskExecutor {
  async execute(task: Task, progressCallback: (progress: number, message?: string) => void): Promise<TaskResult> {
    // Simulate code map generation
    progressCallback(10, 'Analyzing repository structure...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    progressCallback(30, 'Extracting dependencies...');
    await new Promise(resolve => setTimeout(resolve, 1500));

    progressCallback(60, 'Generating semantic map...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    progressCallback(90, 'Finalizing output...');
    await new Promise(resolve => setTimeout(resolve, 500));

    return {
      success: true,
      data: {
        files: 42,
        dependencies: 15,
        complexity: 'medium',
        mapUrl: `/api/results/code-map-${  task.id}`,
      },
      metrics: {
        duration: 5000,
        memoryUsed: 128 * 1024 * 1024,
        filesProcessed: 42,
      },
    };
  }
}

class ContextCuratorExecutor implements TaskExecutor {
  async execute(task: Task, progressCallback: (progress: number, message?: string) => void): Promise<TaskResult> {
    // Simulate context curation
    progressCallback(20, 'Scanning project files...');
    await new Promise(resolve => setTimeout(resolve, 1200));

    progressCallback(50, 'Analyzing context relevance...');
    await new Promise(resolve => setTimeout(resolve, 1800));

    progressCallback(80, 'Generating context summary...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      success: true,
      data: {
        contextSize: '2.5MB',
        relevanceScore: 0.87,
        summaryUrl: `/api/results/context-${  task.id}`,
      },
      metrics: {
        duration: 4000,
        memoryUsed: 64 * 1024 * 1024,
        filesProcessed: 28,
      },
    };
  }
}

class ResearchManagerExecutor implements TaskExecutor {
  async execute(task: Task, progressCallback: (progress: number, message?: string) => void): Promise<TaskResult> {
    // Simulate research management
    progressCallback(15, 'Initializing research session...');
    await new Promise(resolve => setTimeout(resolve, 800));

    progressCallback(40, 'Gathering information...');
    await new Promise(resolve => setTimeout(resolve, 2200));

    progressCallback(75, 'Processing research data...');
    await new Promise(resolve => setTimeout(resolve, 1500));

    return {
      success: true,
      data: {
        researchItems: 12,
        sources: 8,
        reportUrl: `/api/results/research-${  task.id}`,
      },
      metrics: {
        duration: 4500,
        memoryUsed: 96 * 1024 * 1024,
      },
    };
  }
}

export { TaskManager, type Task, type TaskResult, type TaskExecutor };
