// src/services/job-manager/job-manager.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { sseNotifier } from '../sse-notifier/index.js'; // Import for mocking

import { jobManager } from './index.js'; // Import the singleton instance

// Define JobStatus locally for tests if not exported
type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
const JobStatus = {
  PENDING: 'pending' as JobStatus,
  RUNNING: 'running' as JobStatus,
  COMPLETED: 'completed' as JobStatus,
  FAILED: 'failed' as JobStatus,
};

// Mock the sseNotifier
vi.mock('../sse-notifier/index.js', () => ({
  sseNotifier: {
    notify: vi.fn(), // Mock the notify method used by JobManager
  },
}));

// Mock the logger if needed (optional, depends if JobManager logs warnings on edge cases)
vi.mock('../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Helper function to clear jobs map for isolation - NOT ideal for singletons, but needed if no reset method
function clearJobsForTesting() {
  const jobs = (jobManager as any).jobs as Map<string, any>; // Access private map for testing
  if (jobs) {
    jobs.clear();
  } else {
    console.warn('Could not access jobs map for clearing in tests.');
  }
}

describe('JobManager Singleton', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Clear the internal jobs map before each test for isolation
    clearJobsForTesting();
  });

  afterEach(() => {
    // Ensure cleanup after each test
    clearJobsForTesting();
  });

  it('should create a new job with PENDING status and return a job ID', () => {
    const jobId = jobManager.createJob();

    expect(typeof jobId).toBe('string');
    expect(jobId.length).toBeGreaterThan(0);

    const job = jobManager.getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.id).toBe(jobId);
    // Current implementation does not store toolName or params
    // expect(job?.toolName).toBe(toolName);
    // expect(job?.params).toEqual(params);
    expect(job?.status).toBe(JobStatus.PENDING);
    expect(job?.result).toBeUndefined();
    expect(job?.error).toBeUndefined(); // Check error is initially undefined

    // Check SSE notification
    expect(sseNotifier.notify).toHaveBeenCalledWith('job_status', {
      type: 'JOB_CREATED',
      jobId,
      status: JobStatus.PENDING,
    });
  });

  it('should return undefined when getting a non-existent job', () => {
    const job = jobManager.getJob('non-existent-id');
    expect(job).toBeUndefined();
  });

  it('should update the status to RUNNING using startJob', () => {
    const jobId = jobManager.createJob();
    const initialJob = jobManager.getJob(jobId);

    jobManager.startJob(jobId);
    const updatedJob = jobManager.getJob(jobId);

    expect(updatedJob?.status).toBe(JobStatus.RUNNING);
    // startJob doesn't set progressMessage
    // expect(updatedJob?.progressMessage).toBe('Job is now running');

    // Check SSE notification
    expect(sseNotifier.notify).toHaveBeenCalledWith('job_status', {
      type: 'JOB_UPDATED',
      jobId,
      status: JobStatus.RUNNING,
    });
  });

  it('should not throw when starting a non-existent job', () => {
    expect(() => jobManager.startJob('fake-id')).not.toThrow();
    expect(sseNotifier.notify).not.toHaveBeenCalled(); // Should not notify if job doesn't exist
  });

  it('should set the success result and status to COMPLETED using completeJob', () => {
    const jobId = jobManager.createJob();
    jobManager.startJob(jobId); // Move to running first

    const successResult = { data: 'Success!' }; // Use a simple object for result
    jobManager.completeJob(jobId, successResult);

    const finalJob = jobManager.getJob(jobId);
    expect(finalJob?.status).toBe(JobStatus.COMPLETED);
    expect(finalJob?.result).toEqual(successResult);
    expect(finalJob?.error).toBeUndefined(); // Error should be undefined on success

    // Check SSE notification
    expect(sseNotifier.notify).toHaveBeenCalledWith('job_status', {
      type: 'JOB_COMPLETED',
      jobId,
      result: successResult,
    });
  });

  it('should set the error object and status to FAILED using failJob', () => {
    const jobId = jobManager.createJob();
    jobManager.startJob(jobId);

    const error = new Error('It failed!');
    jobManager.failJob(jobId, error);

    const finalJob = jobManager.getJob(jobId);
    expect(finalJob?.status).toBe(JobStatus.FAILED);
    expect(finalJob?.error).toBe(error); // Should store the actual Error object
    expect(finalJob?.result).toBeUndefined(); // Result should be undefined on failure

    // Check SSE notification
    expect(sseNotifier.notify).toHaveBeenCalledWith('job_status', {
      type: 'JOB_FAILED',
      jobId,
      error: error, // SSE sends the error object
    });
  });

  it('should not throw when completing a non-existent job', () => {
    const result = { data: 'Success!' };
    expect(() => jobManager.completeJob('fake-id', result)).not.toThrow();
    expect(sseNotifier.notify).not.toHaveBeenCalled(); // Should not notify
  });

  it('should not throw when failing a non-existent job', () => {
    const error = new Error('Failure');
    expect(() => jobManager.failJob('fake-id', error)).not.toThrow();
    expect(sseNotifier.notify).not.toHaveBeenCalled(); // Should not notify
  });

  // Test status transitions (optional but good)
  it('should allow PENDING -> RUNNING', () => {
    const jobId = jobManager.createJob();
    expect(() => jobManager.startJob(jobId)).not.toThrow();
    expect(jobManager.getJob(jobId)?.status).toBe(JobStatus.RUNNING);
  });

  it('should allow RUNNING -> COMPLETED', () => {
    const jobId = jobManager.createJob();
    jobManager.startJob(jobId);
    expect(() => jobManager.completeJob(jobId, {})).not.toThrow();
    expect(jobManager.getJob(jobId)?.status).toBe(JobStatus.COMPLETED);
  });

  it('should allow RUNNING -> FAILED', () => {
    const jobId = jobManager.createJob();
    jobManager.startJob(jobId);
    expect(() => jobManager.failJob(jobId, new Error())).not.toThrow();
    expect(jobManager.getJob(jobId)?.status).toBe(JobStatus.FAILED);
  });

  // Example of testing disallowed transitions (if JobManager prevented them)
  // it('should NOT allow COMPLETED -> RUNNING', () => {
  //     const jobId = jobManager.createJob();
  //     jobManager.startJob(jobId);
  //     jobManager.completeJob(jobId, {});
  //     // Assuming startJob would throw or log if called on a completed job
  //     expect(() => jobManager.startJob(jobId)).toThrow(); // or check logs/status
  //     expect(jobManager.getJob(jobId)?.status).toBe(JobStatus.COMPLETED);
  // });
});
