import { jobManager, Job, JobStatus } from '../../../services/job-manager/index.js';
import { getTimeoutManager } from '../utils/timeout-manager.js';
import logger from '../../../logger.js';
import { EventEmitter } from 'events';

/**
 * Enhanced job types specific to task management operations
 */
export interface TaskJob extends Job {
  taskId?: string;
  projectId?: string;
  operationType: 'decomposition' | 'execution' | 'validation' | 'analysis' | 'codemap' | 'context_enrichment';
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedDuration?: number; // in milliseconds
  resourceRequirements?: {
    memoryMB: number;
    cpuWeight: number;
    diskSpaceMB?: number;
  };
  dependencies?: string[]; // Job IDs this job depends on
  metadata?: {
    sessionId?: string;
    userId?: string;
    batchId?: string;
    retryCount?: number;
    maxRetries?: number;
  };
}

/**
 * Job execution metrics and monitoring data
 */
export interface JobMetrics {
  jobId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  resourceUsage: {
    peakMemoryMB: number;
    averageCpuUsage: number;
    diskUsageMB?: number;
  };
  performanceScore: number; // 0-100 based on efficiency
  errorCount: number;
  retryCount: number;
}

/**
 * Job queue configuration
 */
export interface JobQueueConfig {
  maxConcurrentJobs: number;
  priorityWeights: Record<string, number>;
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelayMs: number;
  };
  timeoutPolicy: {
    defaultTimeoutMs: number;
    operationTimeouts: Record<string, number>;
  };
  resourceLimits: {
    maxMemoryMB: number;
    maxCpuWeight: number;
    maxDiskSpaceMB: number;
  };
}

/**
 * Job subscription callback types
 */
export type JobEventCallback = (job: TaskJob, metrics?: JobMetrics) => void;
export type JobProgressCallback = (jobId: string, progress: number, message?: string) => void;

/**
 * Advanced Job Manager Integration Service
 * Extends the base job manager with task-specific functionality
 */
export class JobManagerIntegrationService extends EventEmitter {
  private static instance: JobManagerIntegrationService;
  private taskJobs = new Map<string, TaskJob>();
  private jobMetrics = new Map<string, JobMetrics>();
  private jobQueue: TaskJob[] = [];
  private runningJobs = new Set<string>();
  private jobSubscriptions = new Map<string, JobEventCallback[]>();
  private progressSubscriptions = new Map<string, JobProgressCallback[]>();
  private config: JobQueueConfig;
  private processingInterval?: NodeJS.Timeout;

  private constructor(config?: Partial<JobQueueConfig>) {
    super();

    // Get timeout manager for configurable timeout values
    const timeoutManager = getTimeoutManager();

    this.config = {
      maxConcurrentJobs: 5,
      priorityWeights: {
        'critical': 4,
        'high': 3,
        'medium': 2,
        'low': 1
      },
      retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialDelayMs: 1000
      },
      timeoutPolicy: {
        defaultTimeoutMs: timeoutManager.getTimeout('taskExecution'), // Configurable default
        operationTimeouts: {
          'decomposition': timeoutManager.getTimeout('taskDecomposition'), // Configurable
          'execution': timeoutManager.getTimeout('taskExecution'), // Configurable
          'validation': timeoutManager.getTimeout('databaseOperations'), // Configurable
          'analysis': timeoutManager.getTimeout('taskRefinement'), // Configurable
          'codemap': timeoutManager.getTimeout('fileOperations'), // Configurable
          'context_enrichment': timeoutManager.getTimeout('taskRefinement') // Configurable
        }
      },
      resourceLimits: {
        maxMemoryMB: 2048,
        maxCpuWeight: 8,
        maxDiskSpaceMB: 1024
      },
      ...config
    };

    this.startJobProcessor();
    logger.info({ config: this.config }, 'Job Manager Integration Service initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<JobQueueConfig>): JobManagerIntegrationService {
    if (!JobManagerIntegrationService.instance) {
      JobManagerIntegrationService.instance = new JobManagerIntegrationService(config);
    }
    return JobManagerIntegrationService.instance;
  }

  /**
   * Create a new task job
   */
  async createTaskJob(
    toolName: string,
    params: Record<string, unknown>,
    options: {
      taskId?: string;
      projectId?: string;
      operationType: TaskJob['operationType'];
      priority?: TaskJob['priority'];
      estimatedDuration?: number;
      resourceRequirements?: TaskJob['resourceRequirements'];
      dependencies?: string[];
      metadata?: TaskJob['metadata'];
    }
  ): Promise<string> {
    try {
      // Create base job using existing job manager
      const jobId = jobManager.createJob(toolName, params);

      // Create enhanced task job
      const taskJob: TaskJob = {
        ...jobManager.getJob(jobId)!,
        taskId: options.taskId,
        projectId: options.projectId,
        operationType: options.operationType,
        priority: options.priority || 'medium',
        estimatedDuration: options.estimatedDuration,
        resourceRequirements: options.resourceRequirements || {
          memoryMB: 256,
          cpuWeight: 1
        },
        dependencies: options.dependencies || [],
        metadata: {
          retryCount: 0,
          maxRetries: this.config.retryPolicy.maxRetries,
          ...options.metadata
        }
      };

      this.taskJobs.set(jobId, taskJob);

      // Initialize metrics
      this.jobMetrics.set(jobId, {
        jobId,
        startTime: Date.now(),
        resourceUsage: {
          peakMemoryMB: 0,
          averageCpuUsage: 0
        },
        performanceScore: 0,
        errorCount: 0,
        retryCount: 0
      });

      // Add to queue if has dependencies or queue is needed
      if (taskJob.dependencies && taskJob.dependencies.length > 0) {
        this.jobQueue.push(taskJob);
        logger.info({ jobId, dependencies: taskJob.dependencies }, 'Job queued due to dependencies');
      } else {
        this.jobQueue.push(taskJob);
        logger.info({ jobId, operationType: taskJob.operationType }, 'Job queued for execution');
      }

      this.emit('job_created', taskJob);
      return jobId;

    } catch (error) {
      logger.error({ err: error, toolName, options }, 'Failed to create task job');
      throw new Error(`Failed to create task job: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get enhanced task job information
   */
  getTaskJob(jobId: string): TaskJob | null {
    return this.taskJobs.get(jobId) || null;
  }

  /**
   * Get job metrics
   */
  getJobMetrics(jobId: string): JobMetrics | null {
    return this.jobMetrics.get(jobId) || null;
  }

  /**
   * Update job progress with enhanced tracking
   */
  async updateJobProgress(
    jobId: string,
    progress: number,
    message?: string,
    resourceUsage?: Partial<JobMetrics['resourceUsage']>
  ): Promise<boolean> {
    try {
      // Update base job
      const updated = jobManager.updateJobStatus(
        jobId,
        JobStatus.RUNNING,
        message,
        progress
      );

      if (!updated) {
        return false;
      }

      // Update metrics
      const metrics = this.jobMetrics.get(jobId);
      if (metrics && resourceUsage) {
        metrics.resourceUsage = {
          ...metrics.resourceUsage,
          ...resourceUsage
        };
      }

      // Notify progress subscribers
      const progressCallbacks = this.progressSubscriptions.get(jobId) || [];
      progressCallbacks.forEach(callback => {
        try {
          callback(jobId, progress, message);
        } catch (error) {
          logger.error({ err: error, jobId }, 'Error in progress callback');
        }
      });

      this.emit('job_progress', jobId, progress, message);
      return true;

    } catch (error) {
      logger.error({ err: error, jobId }, 'Failed to update job progress');
      return false;
    }
  }

  /**
   * Complete a job with final metrics
   */
  async completeJob(
    jobId: string,
    result: unknown,
    finalMetrics?: Partial<JobMetrics>
  ): Promise<boolean> {
    try {
      // Update base job
      const success = jobManager.setJobResult(jobId, {
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(result) }]
      });

      if (!success) {
        return false;
      }

      // Update final metrics
      const metrics = this.jobMetrics.get(jobId);
      if (metrics) {
        metrics.endTime = Date.now();
        metrics.duration = metrics.endTime - metrics.startTime;

        if (finalMetrics) {
          Object.assign(metrics, finalMetrics);
        }

        // Calculate performance score
        metrics.performanceScore = this.calculatePerformanceScore(metrics);
      }

      // Remove from running jobs
      this.runningJobs.delete(jobId);

      // Notify subscribers
      const taskJob = this.taskJobs.get(jobId);
      if (taskJob) {
        const callbacks = this.jobSubscriptions.get(jobId) || [];
        callbacks.forEach(callback => {
          try {
            callback(taskJob, metrics);
          } catch (error) {
            logger.error({ err: error, jobId }, 'Error in job completion callback');
          }
        });
      }

      this.emit('job_completed', jobId, result, metrics);
      logger.info({ jobId, duration: metrics?.duration }, 'Job completed successfully');
      return true;

    } catch (error) {
      logger.error({ err: error, jobId }, 'Failed to complete job');
      return false;
    }
  }

  /**
   * Fail a job with error details
   */
  async failJob(
    jobId: string,
    error: Error,
    shouldRetry: boolean = true
  ): Promise<boolean> {
    try {
      const taskJob = this.taskJobs.get(jobId);
      const metrics = this.jobMetrics.get(jobId);

      if (metrics) {
        metrics.errorCount++;
        metrics.endTime = Date.now();
        metrics.duration = metrics.endTime - metrics.startTime;
      }

      // Check if we should retry
      if (shouldRetry && taskJob && metrics) {
        const maxRetries = taskJob.metadata?.maxRetries || this.config.retryPolicy.maxRetries;
        const currentRetries = metrics.retryCount;

        if (currentRetries < maxRetries) {
          metrics.retryCount++;

          // Calculate backoff delay
          const delay = this.config.retryPolicy.initialDelayMs *
            Math.pow(this.config.retryPolicy.backoffMultiplier, currentRetries);

          logger.info({ jobId, retryCount: metrics.retryCount, delay }, 'Scheduling job retry');

          // Schedule retry
          setTimeout(() => {
            this.jobQueue.unshift(taskJob); // Add to front of queue for retry
          }, delay);

          return true;
        }
      }

      // Final failure
      const success = jobManager.setJobResult(jobId, {
        isError: true,
        content: [{ type: 'text', text: error.message }]
      });

      this.runningJobs.delete(jobId);
      this.emit('job_failed', jobId, error, metrics);
      logger.error({ err: error, jobId, retryCount: metrics?.retryCount }, 'Job failed permanently');

      return success;

    } catch (err) {
      logger.error({ err, jobId }, 'Failed to handle job failure');
      return false;
    }
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string, reason?: string): Promise<boolean> {
    try {
      const taskJob = this.taskJobs.get(jobId);
      if (!taskJob) {
        logger.warn({ jobId }, 'Attempted to cancel non-existent task job');
        return false;
      }

      // Update job status to failed with cancellation reason
      const success = jobManager.setJobResult(jobId, {
        isError: true,
        content: [{ type: 'text', text: reason || 'Job cancelled by user' }]
      });

      if (success) {
        this.runningJobs.delete(jobId);

        // Remove from queue if queued
        const queueIndex = this.jobQueue.findIndex(job => job.id === jobId);
        if (queueIndex !== -1) {
          this.jobQueue.splice(queueIndex, 1);
        }

        // Update metrics
        const metrics = this.jobMetrics.get(jobId);
        if (metrics) {
          metrics.endTime = Date.now();
          metrics.duration = metrics.endTime - metrics.startTime;
        }

        this.emit('job_cancelled', jobId, reason, metrics);
        logger.info({ jobId, reason }, 'Job cancelled successfully');
      }

      return success;

    } catch (error) {
      logger.error({ err: error, jobId }, 'Failed to cancel job');
      return false;
    }
  }

  /**
   * Get job queue status
   */
  getQueueStatus(): {
    queueLength: number;
    runningJobs: number;
    totalJobs: number;
    jobsByPriority: Record<string, number>;
    jobsByOperation: Record<string, number>;
    averageWaitTime: number;
  } {
    const jobsByPriority: Record<string, number> = {};
    const jobsByOperation: Record<string, number> = {};

    this.jobQueue.forEach(job => {
      jobsByPriority[job.priority] = (jobsByPriority[job.priority] || 0) + 1;
      jobsByOperation[job.operationType] = (jobsByOperation[job.operationType] || 0) + 1;
    });

    // Calculate average wait time
    const now = Date.now();
    const waitTimes = this.jobQueue.map(job => now - job.createdAt);
    const averageWaitTime = waitTimes.length > 0
      ? waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length
      : 0;

    return {
      queueLength: this.jobQueue.length,
      runningJobs: this.runningJobs.size,
      totalJobs: this.taskJobs.size,
      jobsByPriority,
      jobsByOperation,
      averageWaitTime
    };
  }

  /**
   * Get comprehensive job statistics
   */
  getJobStatistics(): {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    runningJobs: number;
    queuedJobs: number;
    averageExecutionTime: number;
    averagePerformanceScore: number;
    resourceUtilization: {
      averageMemoryMB: number;
      averageCpuUsage: number;
      peakMemoryMB: number;
    };
    operationStats: Record<string, {
      count: number;
      averageTime: number;
      successRate: number;
    }>;
  } {
    const allJobs = Array.from(this.taskJobs.values());
    const allMetrics = Array.from(this.jobMetrics.values());

    const completedJobs = allJobs.filter(job => job.status === JobStatus.COMPLETED).length;
    const failedJobs = allJobs.filter(job => job.status === JobStatus.FAILED).length;
    const runningJobs = allJobs.filter(job => job.status === JobStatus.RUNNING).length;
    const queuedJobs = allJobs.filter(job => job.status === JobStatus.PENDING).length;

    // Calculate averages
    const completedMetrics = allMetrics.filter(m => m.duration !== undefined);
    const averageExecutionTime = completedMetrics.length > 0
      ? completedMetrics.reduce((sum, m) => sum + (m.duration || 0), 0) / completedMetrics.length
      : 0;

    const averagePerformanceScore = allMetrics.length > 0
      ? allMetrics.reduce((sum, m) => sum + m.performanceScore, 0) / allMetrics.length
      : 0;

    // Resource utilization
    const averageMemoryMB = allMetrics.length > 0
      ? allMetrics.reduce((sum, m) => sum + m.resourceUsage.peakMemoryMB, 0) / allMetrics.length
      : 0;

    const averageCpuUsage = allMetrics.length > 0
      ? allMetrics.reduce((sum, m) => sum + m.resourceUsage.averageCpuUsage, 0) / allMetrics.length
      : 0;

    const peakMemoryMB = Math.max(...allMetrics.map(m => m.resourceUsage.peakMemoryMB), 0);

    // Operation statistics
    const operationStats: Record<string, { count: number; averageTime: number; successRate: number }> = {};

    allJobs.forEach(job => {
      const opType = job.operationType;
      if (!operationStats[opType]) {
        operationStats[opType] = { count: 0, averageTime: 0, successRate: 0 };
      }
      operationStats[opType].count++;
    });

    Object.keys(operationStats).forEach(opType => {
      const jobsOfType = allJobs.filter(job => job.operationType === opType);
      const metricsOfType = jobsOfType
        .map(job => this.jobMetrics.get(job.id))
        .filter(m => m && m.duration !== undefined) as JobMetrics[];

      const completedOfType = jobsOfType.filter(job => job.status === JobStatus.COMPLETED).length;
      const totalOfType = jobsOfType.length;

      operationStats[opType].averageTime = metricsOfType.length > 0
        ? metricsOfType.reduce((sum, m) => sum + (m.duration || 0), 0) / metricsOfType.length
        : 0;

      operationStats[opType].successRate = totalOfType > 0 ? completedOfType / totalOfType : 0;
    });

    return {
      totalJobs: allJobs.length,
      completedJobs,
      failedJobs,
      runningJobs,
      queuedJobs,
      averageExecutionTime,
      averagePerformanceScore,
      resourceUtilization: {
        averageMemoryMB,
        averageCpuUsage,
        peakMemoryMB
      },
      operationStats
    };
  }

  /**
   * Subscribe to job events
   */
  subscribeToJob(jobId: string, callback: JobEventCallback): () => void {
    if (!this.jobSubscriptions.has(jobId)) {
      this.jobSubscriptions.set(jobId, []);
    }
    this.jobSubscriptions.get(jobId)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.jobSubscriptions.get(jobId);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Subscribe to job progress updates
   */
  subscribeToJobProgress(jobId: string, callback: JobProgressCallback): () => void {
    if (!this.progressSubscriptions.has(jobId)) {
      this.progressSubscriptions.set(jobId, []);
    }
    this.progressSubscriptions.get(jobId)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.progressSubscriptions.get(jobId);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<JobQueueConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info({ config: this.config }, 'Job manager configuration updated');
    this.emit('config_updated', this.config);
  }

  /**
   * Clean up completed jobs older than specified age
   */
  cleanupOldJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [jobId, job] of this.taskJobs.entries()) {
      if ((job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) &&
          (now - job.updatedAt) > maxAgeMs) {

        this.taskJobs.delete(jobId);
        this.jobMetrics.delete(jobId);
        this.jobSubscriptions.delete(jobId);
        this.progressSubscriptions.delete(jobId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info({ cleanedCount, maxAgeMs }, 'Cleaned up old jobs');
      this.emit('jobs_cleaned', cleanedCount);
    }

    return cleanedCount;
  }

  /**
   * Dispose of the service
   */
  dispose(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }

    this.taskJobs.clear();
    this.jobMetrics.clear();
    this.jobQueue.length = 0;
    this.runningJobs.clear();
    this.jobSubscriptions.clear();
    this.progressSubscriptions.clear();
    this.removeAllListeners();

    logger.info('Job Manager Integration Service disposed');
  }

  // Private helper methods

  /**
   * Start the job processing loop
   */
  private startJobProcessor(): void {
    this.processingInterval = setInterval(() => {
      this.processJobQueue().catch(error => {
        logger.error({ err: error }, 'Error in job processing loop');
      });
    }, 1000); // Process every second

    logger.debug('Job processor started');
  }

  /**
   * Process the job queue
   */
  private async processJobQueue(): Promise<void> {
    if (this.jobQueue.length === 0 || this.runningJobs.size >= this.config.maxConcurrentJobs) {
      return;
    }

    // Sort queue by priority and creation time
    this.jobQueue.sort((a, b) => {
      const priorityDiff = this.config.priorityWeights[b.priority] - this.config.priorityWeights[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt - b.createdAt; // FIFO for same priority
    });

    // Check for jobs ready to run (dependencies satisfied)
    const readyJobs = this.jobQueue.filter(job => this.areDependenciesSatisfied(job));

    // Start jobs up to concurrent limit
    const jobsToStart = readyJobs.slice(0, this.config.maxConcurrentJobs - this.runningJobs.size);

    for (const job of jobsToStart) {
      await this.startJob(job);
    }
  }

  /**
   * Check if job dependencies are satisfied
   */
  private areDependenciesSatisfied(job: TaskJob): boolean {
    if (!job.dependencies || job.dependencies.length === 0) {
      return true;
    }

    return job.dependencies.every(depJobId => {
      const depJob = this.taskJobs.get(depJobId);
      return depJob && depJob.status === JobStatus.COMPLETED;
    });
  }

  /**
   * Start a job execution
   */
  private async startJob(job: TaskJob): Promise<void> {
    try {
      // Remove from queue
      const queueIndex = this.jobQueue.findIndex(queuedJob => queuedJob.id === job.id);
      if (queueIndex !== -1) {
        this.jobQueue.splice(queueIndex, 1);
      }

      // Add to running jobs
      this.runningJobs.add(job.id);

      // Update job status
      jobManager.updateJobStatus(job.id, JobStatus.RUNNING, 'Job started');

      // Update metrics
      const metrics = this.jobMetrics.get(job.id);
      if (metrics) {
        metrics.startTime = Date.now();
      }

      // Check for timeout
      const timeoutMs = this.config.timeoutPolicy.operationTimeouts[job.operationType] ||
                       this.config.timeoutPolicy.defaultTimeoutMs;

      setTimeout(() => {
        if (this.runningJobs.has(job.id)) {
          this.handleJobTimeout(job.id);
        }
      }, timeoutMs);

      this.emit('job_started', job);
      logger.info({ jobId: job.id, operationType: job.operationType }, 'Job started');

    } catch (error) {
      logger.error({ err: error, jobId: job.id }, 'Failed to start job');
      await this.failJob(job.id, error instanceof Error ? error : new Error(String(error)), false);
    }
  }

  /**
   * Handle job timeout
   */
  private async handleJobTimeout(jobId: string): Promise<void> {
    const job = this.taskJobs.get(jobId);
    if (!job) return;

    logger.warn({ jobId, operationType: job.operationType }, 'Job timed out');

    const metrics = this.jobMetrics.get(jobId);
    if (metrics) {
      metrics.errorCount++;
    }

    await this.failJob(jobId, new Error('Job execution timed out'), true);
  }

  /**
   * Calculate performance score based on metrics
   */
  private calculatePerformanceScore(metrics: JobMetrics): number {
    let score = 100;

    // Penalize for errors
    score -= metrics.errorCount * 10;

    // Penalize for retries
    score -= metrics.retryCount * 5;

    // Bonus for efficient resource usage (placeholder logic)
    if (metrics.resourceUsage.peakMemoryMB < 512) {
      score += 5;
    }

    if (metrics.resourceUsage.averageCpuUsage < 50) {
      score += 5;
    }

    // Ensure score is between 0 and 100
    return Math.max(0, Math.min(100, score));
  }
}

// Export singleton instance
export const jobManagerIntegration = JobManagerIntegrationService.getInstance();

// Export convenience function
export function getJobManagerIntegration(config?: Partial<JobQueueConfig>): JobManagerIntegrationService {
  return JobManagerIntegrationService.getInstance(config);
}
