// Removed explicit vitest import as types should be global via tsconfig.json
import {
  createJob,
  updateJobStatus,
  getJobResult,
  JobStatus,
} from '../services/jobStore.js';
import { CodeStubInput } from '../index.js';

describe('Job Store', () => {
  it('should create a new job with pending status', () => {
    const inputData: CodeStubInput = {
      // Added type annotation
      name: 'Test Stub',
      description: 'A test code stub',
      language: 'typescript',
      stubType: 'function', // Corrected to a literal type
      // Removed 'prompt' and 'files' to match CodeStubInput type
    };
    const jobId = createJob(inputData);

    expect(jobId).toBeTypeOf('string');
    expect(jobId).not.toBe('');

    const job = getJobResult(jobId);

    expect(job).not.toBeUndefined();
    expect(job?.id).toBe(jobId);
    expect(job?.status).toBe(JobStatus.PENDING);
    expect(job?.input).toEqual(inputData);
    expect(job?.result).toBeNull();
    expect(job?.error).toBeNull();
    expect(job?.createdAt).toBeInstanceOf(Date);
    expect(job?.updatedAt).toBeInstanceOf(Date);
  });

  describe('updateJobStatus', () => {
    let jobId: string;
    const inputData: CodeStubInput = {
      // Added type annotation
      name: 'Test Stub',
      description: 'A test code stub',
      language: 'typescript',
      stubType: 'function',
      // Removed 'prompt' and 'files' to match CodeStubInput type
    };

    beforeEach(() => {
      jobId = createJob(inputData);
    });

    it('should update job status to COMPLETED', () => {
      const result = 'Generated code content';
      const success = updateJobStatus(jobId, JobStatus.COMPLETED, result);

      expect(success).toBe(true);

      const job = getJobResult(jobId);
      expect(job?.status).toBe(JobStatus.COMPLETED);
      expect(job?.result).toBe(result);
      expect(job?.error).toBeNull();
      expect(job?.updatedAt).toBeInstanceOf(Date);
      // Check if updatedAt is after createdAt (from beforeEach)
      expect(job?.updatedAt.getTime()).toBeGreaterThan(
        job?.createdAt.getTime() || 0
      );
    });

    it('should update job status to FAILED', () => {
      const error = 'An error occurred during generation';
      const success = updateJobStatus(jobId, JobStatus.FAILED, null, error);

      expect(success).toBe(true);

      const job = getJobResult(jobId);
      expect(job?.status).toBe(JobStatus.FAILED);
      expect(job?.result).toBeNull();
      expect(job?.error).toBe(error);
      expect(job?.updatedAt).toBeInstanceOf(Date);
      // Check if updatedAt is after createdAt (from beforeEach)
      expect(job?.updatedAt.getTime()).toBeGreaterThan(
        job?.createdAt.getTime() || 0
      );
    });

    it('should return false for non-existent job', () => {
      const success = updateJobStatus(
        'non-existent-id',
        JobStatus.COMPLETED,
        'result'
      );
      expect(success).toBe(false);
    });
  });

  describe('getJobResult', () => {
    it('should return undefined for non-existent job', () => {
      const job = getJobResult('non-existent-id');
      expect(job).toBeUndefined();
    });
  });
});
