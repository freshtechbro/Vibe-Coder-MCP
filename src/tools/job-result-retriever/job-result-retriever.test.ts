// src/tools/job-result-retriever/job-result-retriever.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getJobResult } from './index.js'; // Adjust path to the executor function
import { jobManager, JobStatus, Job } from '../../services/job-manager/index.js'; // Import singleton and types
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../types/workflow.js'; // Import config type if needed

// Mock the jobManager singleton
vi.mock('../../services/job-manager/index.js', () => ({
  jobManager: {
    getJob: vi.fn(),
    // Mock other methods if needed, though getJobResult likely only uses getJob
  },
  // Export enums/types needed by the test file
  JobStatus: {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
  }
}));

// Mock the logger
vi.mock('../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('getJobResult Tool Executor', () => {
  // Provide minimal valid config to satisfy the type, even if unused by the tool
  const mockConfig: OpenRouterConfig = {
      baseUrl: 'mock-url',
      apiKey: 'mock-key',
      geminiModel: 'mock-gemini',
      perplexityModel: 'mock-perplexity',
      // llm_mapping is optional
  };
  const mockContext = undefined; // Context is not used by this tool

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('should return "Job not found" if jobManager.getJob returns undefined', async () => {
    const jobId = 'non-existent-job';
    const mockGetJob = jobManager.getJob as unknown as ReturnType<typeof vi.fn>;
    mockGetJob.mockReturnValue(undefined);

    const result = await getJobResult({ jobId }, mockConfig, mockContext);

    expect(mockGetJob).toHaveBeenCalledWith(jobId);
    expect(result.isError).toBe(true);
    const resultWithContent = result as { content: Array<{ text: string }> };
    expect(resultWithContent.content[0]?.text).toContain(`Job with ID "${jobId}" not found.`);
    const resultWithError = result as { errorDetails?: { type: string } };
    expect(resultWithError.errorDetails?.type).toBe('JobNotFoundError');
  });

  it('should return PENDING status if the job is pending', async () => {
    const jobId = 'pending-job';
    const mockJob: Partial<Job> = { id: jobId, status: JobStatus.PENDING };
    const mockGetJob = jobManager.getJob as unknown as ReturnType<typeof vi.fn>;
    mockGetJob.mockReturnValue(mockJob);

    const result = await getJobResult({ jobId }, mockConfig, mockContext);

    expect(mockGetJob).toHaveBeenCalledWith(jobId);
    expect(result.isError).toBe(false); // Not an error, just status update
    const resultWithContent = result as { content: Array<{ text: string }> };
    expect(resultWithContent.content[0]?.text).toContain(`Job "${jobId}" is currently ${JobStatus.PENDING}.`);
  });

  it('should return RUNNING status and progress message if the job is running', async () => {
    const jobId = 'running-job';
    const progressMessage = 'Processing step 2...';
    const mockJob: Partial<Job> = { id: jobId, status: JobStatus.RUNNING, progressMessage };
    const mockGetJob = jobManager.getJob as unknown as ReturnType<typeof vi.fn>;
    mockGetJob.mockReturnValue(mockJob);

    const result = await getJobResult({ jobId }, mockConfig, mockContext);

    expect(mockGetJob).toHaveBeenCalledWith(jobId);
    expect(result.isError).toBe(false);
    const resultWithContent = result as { content: Array<{ text: string }> };
    expect(resultWithContent.content[0]?.text).toContain(`Job "${jobId}" is currently ${JobStatus.RUNNING}.`);
    expect(resultWithContent.content[0]?.text).toContain(`Progress: ${progressMessage}`);
  });

   it('should return RUNNING status without progress message if none is set', async () => {
     const jobId = 'running-job-no-msg';
     const mockJob: Partial<Job> = { id: jobId, status: JobStatus.RUNNING };
     (jobManager.getJob as ReturnType<typeof vi.fn>).mockReturnValue(mockJob);

     const result = await getJobResult({ jobId }, mockConfig, mockContext);

     expect(jobManager.getJob as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(jobId);
     expect(result.isError).toBe(false);
     const resultWithContent = result as { content: Array<{ text: string }> };
     expect(resultWithContent.content[0]?.text).toContain(`Job "${jobId}" is currently ${JobStatus.RUNNING}.`);
     expect(result.content[0]?.text).not.toContain(`Progress:`);
   });

  it('should return the final result if the job is COMPLETED', async () => {
    const jobId = 'completed-job';
    const finalResultData: CallToolResult = { content: [{ type: 'text', text: 'Final success data!' }], isError: false };
    const mockJob: Partial<Job> = { id: jobId, status: JobStatus.COMPLETED, result: finalResultData };
    (jobManager.getJob as ReturnType<typeof vi.fn>).mockReturnValue(mockJob);

    const result = await getJobResult({ jobId }, mockConfig, mockContext);

    expect(jobManager.getJob as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(jobId);
    // The result of getJobResult *is* the final result from the job
    expect(result).toEqual(finalResultData);
  });

  it('should return the final error result if the job is FAILED', async () => {
    const jobId = 'failed-job';
    const finalErrorData: CallToolResult = { content: [{ type: 'text', text: 'Job failed message' }], isError: true, errorDetails: { type: 'ToolError', message: 'Something went wrong' } };
    const mockJob: Partial<Job> = { id: jobId, status: JobStatus.FAILED, result: finalErrorData };
    (jobManager.getJob as ReturnType<typeof vi.fn>).mockReturnValue(mockJob);

    const result = await getJobResult({ jobId }, mockConfig, mockContext);

    expect(jobManager.getJob as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(jobId);
    // The result of getJobResult *is* the final error result from the job
    expect(result).toEqual(finalErrorData);
  });

  it('should return an error if a COMPLETED job has no result stored', async () => {
    const jobId = 'completed-no-result-job';
    const mockJob: Partial<Job> = { id: jobId, status: JobStatus.COMPLETED, result: undefined }; // Missing result
    (jobManager.getJob as ReturnType<typeof vi.fn>).mockReturnValue(mockJob);

    const result = await getJobResult({ jobId }, mockConfig, mockContext);

    expect(jobManager.getJob as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(jobId);
    expect(result.isError).toBe(true);
    const resultWithContent = result as { content: Array<{ text: string }>; errorDetails?: { type: string } };
    expect(resultWithContent.content[0]?.text).toContain(`Job "${jobId}" is ${JobStatus.COMPLETED} but has no result stored.`);
    expect(resultWithContent.errorDetails?.type).toBe('MissingJobResultError');
  });

  it('should return an error if a FAILED job has no result stored', async () => {
    const jobId = 'failed-no-result-job';
    const mockJob: Partial<Job> = { id: jobId, status: JobStatus.FAILED, result: undefined }; // Missing result
    (jobManager.getJob as ReturnType<typeof vi.fn>).mockReturnValue(mockJob);

    const result = await getJobResult({ jobId }, mockConfig, mockContext);

    expect(jobManager.getJob as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(jobId);
    expect(result.isError).toBe(true);
    const resultWithContent = result as { content: Array<{ text: string }>; errorDetails?: { type: string } };
    expect(resultWithContent.content[0]?.text).toContain(`Job "${jobId}" is ${JobStatus.FAILED} but has no result stored.`);
    expect(resultWithContent.errorDetails?.type).toBe('MissingJobResultError');
  });

});
