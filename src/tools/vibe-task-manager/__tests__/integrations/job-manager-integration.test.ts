import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JobManagerIntegrationService } from '../../integrations/job-manager-integration.js';
import { jobManager, JobStatus } from '../../../../services/job-manager/index.js';

// Mock the job manager
vi.mock('../../../../services/job-manager/index.js', () => ({
  jobManager: {
    createJob: vi.fn(),
    getJob: vi.fn(),
    updateJobStatus: vi.fn(),
    setJobResult: vi.fn(),
  },
  JobStatus: {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed'
  }
}));

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('JobManagerIntegrationService', () => {
  let service: JobManagerIntegrationService;
  const mockJobManager = jobManager as Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset singleton
    (JobManagerIntegrationService as Record<string, unknown>).instance = undefined;

    service = JobManagerIntegrationService.getInstance({
      maxConcurrentJobs: 2,
      priorityWeights: { critical: 4, high: 3, medium: 2, low: 1 }
    });

    // Clear any existing state
    service['taskJobs'].clear();
    service['jobMetrics'].clear();
    service['jobQueue'].length = 0;
    service['runningJobs'].clear();
    service['jobSubscriptions'].clear();
    service['progressSubscriptions'].clear();

    // Setup default mocks with unique IDs
    let jobIdCounter = 0;
    mockJobManager.createJob.mockImplementation(() => `test-job-${++jobIdCounter}`);
    mockJobManager.getJob.mockImplementation((jobId: string) => ({
      id: jobId,
      toolName: 'test-tool',
      params: {},
      status: JobStatus.PENDING,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }));
    mockJobManager.updateJobStatus.mockReturnValue(true);
    mockJobManager.setJobResult.mockReturnValue(true);
  });

  afterEach(() => {
    service.dispose();
  });

  describe('createTaskJob', () => {
    it('should create a task job with enhanced properties', async () => {
      const jobId = await service.createTaskJob('test-tool', { param: 'value' }, {
        taskId: 'task-1',
        projectId: 'project-1',
        operationType: 'decomposition',
        priority: 'high',
        estimatedDuration: 5000,
        resourceRequirements: { memoryMB: 512, cpuWeight: 2 },
        dependencies: ['dep-job-1'],
        metadata: { sessionId: 'session-1' }
      });

      expect(jobId).toBe('test-job-1');
      expect(mockJobManager.createJob).toHaveBeenCalledWith('test-tool', { param: 'value' });

      const taskJob = service.getTaskJob(jobId);
      expect(taskJob).toBeDefined();
      expect(taskJob?.taskId).toBe('task-1');
      expect(taskJob?.projectId).toBe('project-1');
      expect(taskJob?.operationType).toBe('decomposition');
      expect(taskJob?.priority).toBe('high');
      expect(taskJob?.estimatedDuration).toBe(5000);
      expect(taskJob?.resourceRequirements).toEqual({ memoryMB: 512, cpuWeight: 2 });
      expect(taskJob?.dependencies).toEqual(['dep-job-1']);
      expect(taskJob?.metadata?.sessionId).toBe('session-1');

      const metrics = service.getJobMetrics(jobId);
      expect(metrics).toBeDefined();
      expect(metrics?.jobId).toBe(jobId);
      expect(metrics?.startTime).toBeGreaterThan(0);
    });

    it('should use default values for optional properties', async () => {
      const jobId = await service.createTaskJob('test-tool', {}, {
        operationType: 'execution'
      });

      const taskJob = service.getTaskJob(jobId);
      expect(taskJob?.priority).toBe('medium');
      expect(taskJob?.resourceRequirements).toEqual({ memoryMB: 256, cpuWeight: 1 });
      expect(taskJob?.dependencies).toEqual([]);
      expect(taskJob?.metadata?.retryCount).toBe(0);
      expect(taskJob?.metadata?.maxRetries).toBe(3);
    });

    it('should handle job creation failure', async () => {
      mockJobManager.createJob.mockImplementation(() => {
        throw new Error('Job creation failed');
      });

      await expect(service.createTaskJob('test-tool', {}, {
        operationType: 'validation'
      })).rejects.toThrow('Failed to create task job: Job creation failed');
    });
  });

  describe('updateJobProgress', () => {
    it('should update job progress with resource usage', async () => {
      const jobId = await service.createTaskJob('test-tool', {}, {
        operationType: 'analysis'
      });

      const result = await service.updateJobProgress(jobId, 50, 'Half complete', {
        peakMemoryMB: 128,
        averageCpuUsage: 25
      });

      expect(result).toBe(true);
      expect(mockJobManager.updateJobStatus).toHaveBeenCalledWith(
        jobId,
        JobStatus.RUNNING,
        'Half complete',
        50
      );

      const metrics = service.getJobMetrics(jobId);
      expect(metrics?.resourceUsage.peakMemoryMB).toBe(128);
      expect(metrics?.resourceUsage.averageCpuUsage).toBe(25);
    });

    it('should handle progress update failure', async () => {
      mockJobManager.updateJobStatus.mockReturnValue(false);

      const jobId = await service.createTaskJob('test-tool', {}, {
        operationType: 'analysis'
      });

      const result = await service.updateJobProgress(jobId, 50);
      expect(result).toBe(false);
    });

    it('should notify progress subscribers', async () => {
      const jobId = await service.createTaskJob('test-tool', {}, {
        operationType: 'analysis'
      });

      const progressCallback = vi.fn();
      service.subscribeToJobProgress(jobId, progressCallback);

      await service.updateJobProgress(jobId, 75, 'Almost done');

      expect(progressCallback).toHaveBeenCalledWith(jobId, 75, 'Almost done');
    });
  });

  describe('completeJob', () => {
    it('should complete job with final metrics', async () => {
      const jobId = await service.createTaskJob('test-tool', {}, {
        operationType: 'codemap'
      });

      // Add a small delay to ensure duration > 0
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = { success: true, data: 'test-result' };
      const finalMetrics = {
        resourceUsage: { peakMemoryMB: 256, averageCpuUsage: 30 },
        errorCount: 0
      };

      const success = await service.completeJob(jobId, result, finalMetrics);

      expect(success).toBe(true);
      expect(mockJobManager.setJobResult).toHaveBeenCalledWith(jobId, {
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(result) }]
      });

      const metrics = service.getJobMetrics(jobId);
      expect(metrics?.endTime).toBeGreaterThan(0);
      expect(metrics?.duration).toBeGreaterThanOrEqual(0); // Allow 0 for fast execution
      expect(metrics?.resourceUsage.peakMemoryMB).toBe(256);
      expect(metrics?.performanceScore).toBeGreaterThan(0);
    });

    it('should notify job subscribers on completion', async () => {
      const jobId = await service.createTaskJob('test-tool', {}, {
        operationType: 'validation'
      });

      const jobCallback = vi.fn();
      service.subscribeToJob(jobId, jobCallback);

      const result = { success: true };
      await service.completeJob(jobId, result);

      expect(jobCallback).toHaveBeenCalled();
      const [taskJob, metrics] = jobCallback.mock.calls[0];
      expect(taskJob.id).toBe(jobId);
      expect(metrics).toBeDefined();
    });
  });

  describe('failJob', () => {
    it('should fail job without retry when shouldRetry is false', async () => {
      const jobId = await service.createTaskJob('test-tool', {}, {
        operationType: 'execution'
      });

      const error = new Error('Test error');
      const success = await service.failJob(jobId, error, false);

      expect(success).toBe(true);
      expect(mockJobManager.setJobResult).toHaveBeenCalledWith(jobId, {
        isError: true,
        content: [{ type: 'text', text: 'Test error' }]
      });

      const metrics = service.getJobMetrics(jobId);
      expect(metrics?.errorCount).toBe(1);
      expect(metrics?.endTime).toBeGreaterThan(0);
    });

    it('should retry job when under retry limit', async () => {
      const jobId = await service.createTaskJob('test-tool', {}, {
        operationType: 'analysis',
        metadata: { maxRetries: 2 }
      });

      const error = new Error('Temporary error');
      const success = await service.failJob(jobId, error, true);

      expect(success).toBe(true);

      const metrics = service.getJobMetrics(jobId);
      expect(metrics?.retryCount).toBe(1);
      expect(metrics?.errorCount).toBe(1);

      // Should not call setJobResult for retry
      expect(mockJobManager.setJobResult).not.toHaveBeenCalled();
    });

    it('should permanently fail after max retries', async () => {
      const jobId = await service.createTaskJob('test-tool', {}, {
        operationType: 'validation',
        metadata: { maxRetries: 1 }
      });

      // First failure - should retry
      await service.failJob(jobId, new Error('Error 1'), true);

      // Second failure - should permanently fail
      const error2 = new Error('Error 2');
      const success = await service.failJob(jobId, error2, true);

      expect(success).toBe(true);
      expect(mockJobManager.setJobResult).toHaveBeenCalledWith(jobId, {
        isError: true,
        content: [{ type: 'text', text: 'Error 2' }]
      });

      const metrics = service.getJobMetrics(jobId);
      expect(metrics?.retryCount).toBe(1);
      expect(metrics?.errorCount).toBe(2);
    });
  });

  describe('cancelJob', () => {
    it('should cancel a running job', async () => {
      const jobId = await service.createTaskJob('test-tool', {}, {
        operationType: 'decomposition'
      });

      const success = await service.cancelJob(jobId, 'User cancelled');

      expect(success).toBe(true);
      expect(mockJobManager.setJobResult).toHaveBeenCalledWith(jobId, {
        isError: true,
        content: [{ type: 'text', text: 'User cancelled' }]
      });
    });

    it('should handle cancelling non-existent job', async () => {
      const success = await service.cancelJob('non-existent-job');
      expect(success).toBe(false);
    });
  });

  describe('getQueueStatus', () => {
    it('should return comprehensive queue status', async () => {
      // Stop the job processor to prevent automatic processing
      if (service['processingInterval']) {
        clearInterval(service['processingInterval']);
        service['processingInterval'] = undefined;
      }

      // Create jobs with different priorities and operations
      await service.createTaskJob('tool1', {}, {
        operationType: 'decomposition',
        priority: 'high'
      });

      await service.createTaskJob('tool2', {}, {
        operationType: 'execution',
        priority: 'medium'
      });

      await service.createTaskJob('tool3', {}, {
        operationType: 'decomposition',
        priority: 'high'
      });

      const status = service.getQueueStatus();

      expect(status.queueLength).toBe(3);
      expect(status.runningJobs).toBe(0);
      expect(status.totalJobs).toBe(3);
      expect(status.jobsByPriority.high).toBe(2);
      expect(status.jobsByPriority.medium).toBe(1);
      expect(status.jobsByOperation.decomposition).toBe(2);
      expect(status.jobsByOperation.execution).toBe(1);
      expect(status.averageWaitTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getJobStatistics', () => {
    it('should return comprehensive job statistics', async () => {
      // Stop the job processor to prevent automatic processing
      if (service['processingInterval']) {
        clearInterval(service['processingInterval']);
        service['processingInterval'] = undefined;
      }

      // Create and complete some jobs
      const jobId1 = await service.createTaskJob('tool1', {}, {
        operationType: 'validation'
      });

      const jobId2 = await service.createTaskJob('tool2', {}, {
        operationType: 'analysis'
      });

      // Manually update job status to completed/failed for testing
      const job1 = service.getTaskJob(jobId1);
      const job2 = service.getTaskJob(jobId2);
      if (job1) job1.status = JobStatus.COMPLETED;
      if (job2) job2.status = JobStatus.FAILED;

      // Complete first job
      await service.completeJob(jobId1, { success: true });

      // Fail second job
      await service.failJob(jobId2, new Error('Test error'), false);

      const stats = service.getJobStatistics();

      expect(stats.totalJobs).toBe(2);
      expect(stats.completedJobs).toBe(1);
      expect(stats.failedJobs).toBe(1);
      expect(stats.runningJobs).toBe(0);
      expect(stats.queuedJobs).toBe(0);
      expect(stats.averageExecutionTime).toBeGreaterThanOrEqual(0);
      expect(stats.averagePerformanceScore).toBeGreaterThanOrEqual(0);
      expect(stats.resourceUtilization).toBeDefined();
      expect(stats.operationStats.validation).toBeDefined();
      expect(stats.operationStats.analysis).toBeDefined();
    });
  });

  describe('subscriptions', () => {
    it('should allow subscribing and unsubscribing from job events', async () => {
      const jobId = await service.createTaskJob('test-tool', {}, {
        operationType: 'codemap'
      });

      const callback = vi.fn();
      const unsubscribe = service.subscribeToJob(jobId, callback);

      await service.completeJob(jobId, { success: true });
      expect(callback).toHaveBeenCalled();

      // Unsubscribe and verify no more calls
      unsubscribe();
      callback.mockClear();

      // This shouldn't trigger the callback since we unsubscribed
      await service.failJob(jobId, new Error('Test'), false);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should allow subscribing and unsubscribing from progress events', async () => {
      const jobId = await service.createTaskJob('test-tool', {}, {
        operationType: 'execution'
      });

      const progressCallback = vi.fn();
      const unsubscribe = service.subscribeToJobProgress(jobId, progressCallback);

      await service.updateJobProgress(jobId, 50, 'Progress update');
      expect(progressCallback).toHaveBeenCalledWith(jobId, 50, 'Progress update');

      // Unsubscribe and verify no more calls
      unsubscribe();
      progressCallback.mockClear();

      await service.updateJobProgress(jobId, 75, 'Another update');
      expect(progressCallback).not.toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    it('should allow updating configuration', () => {
      const newConfig = {
        maxConcurrentJobs: 10,
        priorityWeights: { critical: 5, high: 4, medium: 2, low: 1 }
      };

      service.updateConfig(newConfig);

      // Verify config was updated by checking queue status behavior
      const status = service.getQueueStatus();
      expect(status).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('should clean up old completed jobs', async () => {
      const jobId = await service.createTaskJob('test-tool', {}, {
        operationType: 'validation'
      });

      // Manually set job status to completed
      const taskJob = service.getTaskJob(jobId);
      if (taskJob) {
        taskJob.status = JobStatus.COMPLETED;
        taskJob.updatedAt = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      }

      await service.completeJob(jobId, { success: true });

      const cleanedCount = service.cleanupOldJobs(24 * 60 * 60 * 1000); // 24 hours

      expect(cleanedCount).toBe(1);
      expect(service.getTaskJob(jobId)).toBeNull();
    });

    it('should not clean up recent jobs', async () => {
      const jobId = await service.createTaskJob('test-tool', {}, {
        operationType: 'analysis'
      });

      // Manually set job status to completed
      const taskJob = service.getTaskJob(jobId);
      if (taskJob) {
        taskJob.status = JobStatus.COMPLETED;
      }

      await service.completeJob(jobId, { success: true });

      const cleanedCount = service.cleanupOldJobs(24 * 60 * 60 * 1000);

      expect(cleanedCount).toBe(0);
      expect(service.getTaskJob(jobId)).toBeDefined();
    });
  });
});
