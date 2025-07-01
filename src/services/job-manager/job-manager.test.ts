// src/services/job-manager/job-manager.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { jobManager, JobStatus } from './index.js'; // Import the singleton instance
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Mock the sseNotifier if JobManager interacts with it directly (e.g., on setJobResult)
vi.mock('../sse-notifier/index.js', () => ({
  sseNotifier: {
    sendProgress: vi.fn(),
    // Add other methods if needed by JobManager
  }
}));

// Mock the logger if needed
vi.mock('../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));


describe('JobManager Singleton', () => {
  // We are testing the singleton instance directly
  // let jobManager: JobManager; // No need to declare or instantiate

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // TODO: Consider adding a reset method to JobManager for testing if needed
    // e.g., jobManager.resetForTesting();
  });

  it('should create a new job with PENDING status and return a job ID', () => {
    const toolName = 'test-tool';
    const params = { input: 'test' };
    const jobId = jobManager.createJob(toolName, params);

    expect(typeof jobId).toBe('string');
    expect(jobId.length).toBeGreaterThan(0);

    const job = jobManager.getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.id).toBe(jobId);
    expect(job?.toolName).toBe(toolName);
    expect(job?.params).toEqual(params);
    expect(job?.status).toBe(JobStatus.PENDING);
    expect(job?.result).toBeUndefined();
    expect(job?.createdAt).toBeInstanceOf(Date);
    expect(job?.updatedAt).toBeInstanceOf(Date);
    expect(job?.createdAt).toEqual(job?.updatedAt); // Initially they should be the same
  });

  it('should return undefined when getting a non-existent job', () => {
    const job = jobManager.getJob('non-existent-id');
    expect(job).toBeUndefined();
  });

  it('should update the status of an existing job', () => {
    const jobId = jobManager.createJob('test-tool', {});
    const initialJob = jobManager.getJob(jobId);
    const initialTimestamp = initialJob?.updatedAt;

    // Allow a small delay to ensure timestamp changes
    vi.advanceTimersByTime(10); // Requires fake timers enabled in vitest config or setup

    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Job is now running');
    const updatedJob = jobManager.getJob(jobId);

    expect(updatedJob?.status).toBe(JobStatus.RUNNING);
    expect(updatedJob?.progressMessage).toBe('Job is now running'); // Corrected: statusMessage -> progressMessage
    expect(updatedJob?.updatedAt).not.toEqual(initialTimestamp);
  });

   it('should not throw when updating status of a non-existent job (or handle gracefully)', () => {
     expect(() => jobManager.updateJobStatus('fake-id', JobStatus.RUNNING)).not.toThrow();
     // Optionally check logs if warnings are expected: expect(logger.warn).toHaveBeenCalled();
   });

  it('should set the success result for a job and update status to COMPLETED', () => {
    const jobId = jobManager.createJob('test-tool', {});
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING); // Move to running first

    const successResult: CallToolResult = { content: [{ type: 'text', text: 'Success!' }], isError: false };
    jobManager.setJobResult(jobId, successResult);

    const finalJob = jobManager.getJob(jobId);
    expect(finalJob?.status).toBe(JobStatus.COMPLETED);
    expect(finalJob?.result).toEqual(successResult);
    expect(finalJob?.progressMessage).toBe('Job completed successfully'); // Corrected: statusMessage -> progressMessage, check final message

    // Check if notifier was called (assuming JobManager calls it)
    // expect(sseNotifier.sendProgress).toHaveBeenCalledWith(expect.any(String), jobId, JobStatus.COMPLETED, expect.any(String));
  });

  it('should set the error result for a job and update status to FAILED', () => {
    const jobId = jobManager.createJob('test-tool', {});
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING);

    const errorResult: CallToolResult = { content: [{ type: 'text', text: 'It failed!' }], isError: true, errorDetails: { type: 'TestError', message: 'Failed hard' } };
    jobManager.setJobResult(jobId, errorResult);

    const finalJob = jobManager.getJob(jobId);
    expect(finalJob?.status).toBe(JobStatus.FAILED);
    expect(finalJob?.result).toEqual(errorResult);
    expect(finalJob?.progressMessage).toBe('Job failed'); // Corrected: statusMessage -> progressMessage, check final message

    // Check if notifier was called (assuming JobManager calls it)
    // expect(sseNotifier.sendProgress).toHaveBeenCalledWith(expect.any(String), jobId, JobStatus.FAILED, expect.any(String));
  });

   it('should not throw when setting result for a non-existent job (or handle gracefully)', () => {
     const result: CallToolResult = { content: [], isError: false };
     expect(() => jobManager.setJobResult('fake-id', result)).not.toThrow();
     // Optionally check logs if warnings are expected
   });

   // TODO: Add tests for status transition logic if implemented (e.g., cannot go from COMPLETED to RUNNING)
   // TODO: Add tests for job cleanup/expiration if implemented
});
