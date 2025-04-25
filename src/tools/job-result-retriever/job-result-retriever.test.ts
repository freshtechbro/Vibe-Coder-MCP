import { describe, it, expect, beforeEach, vi } from 'vitest';

import { jobManager } from '../../services/job-manager/index.js';
import { ToolResult } from '../../types/tools.js';

import { jobResultRetriever } from './index.js';

type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
const JobStatus = {
  PENDING: 'pending' as JobStatus,
  RUNNING: 'running' as JobStatus,
  COMPLETED: 'completed' as JobStatus,
  FAILED: 'failed' as JobStatus,
};

interface Job {
  id: string;
  status: JobStatus;
  result?: unknown;
  error?: Error;
}

vi.mock('../../services/job-manager/index.js', () => ({
  jobManager: {
    getJob: vi.fn(),
  },
}));

vi.mock('../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../services/routing/toolRegistry.js', () => ({
  toolRegistry: {
    registerTool: vi.fn(),
  },
}));

describe('getJobResult Tool Executor', () => {
  const execute = jobResultRetriever.execute;
  const mockGenericConfig = {};
  const mockExecutionContext = { sessionId: 'test-exec-context' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return "Job not found" error metadata if jobManager.getJob returns undefined', async () => {
    const jobId = 'non-existent-job';
    vi.mocked(jobManager.getJob).mockReturnValue(undefined);

    const result = await execute(
      { jobId },
      mockGenericConfig,
      mockExecutionContext
    );

    expect(jobManager.getJob).toHaveBeenCalledWith(jobId);
    expect(result.content[0]?.text).toContain(
      `Job with ID "${jobId}" not found.`
    );
    expect(result.metadata?.isError).toBe(true);
    expect(result.metadata?.errorDetails).toEqual({
      type: 'JobNotFoundError',
      message: `Job with ID "${jobId}" not found.`,
    });
  });

  it('should return PENDING status message and metadata if the job is pending', async () => {
    const jobId = 'pending-job';
    const mockJob: Job = { id: jobId, status: JobStatus.PENDING };
    vi.mocked(jobManager.getJob).mockReturnValue(mockJob);

    const result = await execute(
      { jobId },
      mockGenericConfig,
      mockExecutionContext
    );

    expect(jobManager.getJob).toHaveBeenCalledWith(jobId);
    expect(result.content[0]?.text).toBe(
      `Job "${jobId}" is currently pending.`
    );
    expect(result.metadata?.isError).toBeUndefined();
    expect(result.metadata?.status).toBe(JobStatus.PENDING);
  });

  it('should return RUNNING status message and metadata if the job is running', async () => {
    const jobId = 'running-job';
    const mockJob: Job = { id: jobId, status: JobStatus.RUNNING };
    vi.mocked(jobManager.getJob).mockReturnValue(mockJob);

    const result = await execute(
      { jobId },
      mockGenericConfig,
      mockExecutionContext
    );

    expect(jobManager.getJob).toHaveBeenCalledWith(jobId);
    expect(result.content[0]?.text).toBe(
      `Job "${jobId}" is currently running.`
    );
    expect(result.metadata?.isError).toBeUndefined();
    expect(result.metadata?.status).toBe(JobStatus.RUNNING);
  });

  it('should return the final ToolResult if the job is COMPLETED', async () => {
    const jobId = 'completed-job';
    const finalResultData: ToolResult = {
      content: [{ type: 'text', text: 'Final success data!' }],
      metadata: { originalMeta: 'value' },
    };
    const mockJob: Job = {
      id: jobId,
      status: JobStatus.COMPLETED,
      result: finalResultData,
    };
    vi.mocked(jobManager.getJob).mockReturnValue(mockJob);

    const result = await execute(
      { jobId },
      mockGenericConfig,
      mockExecutionContext
    );

    expect(jobManager.getJob).toHaveBeenCalledWith(jobId);
    expect(result.content).toEqual(finalResultData.content);
    expect(result.metadata).toEqual({
      originalMeta: 'value',
      status: JobStatus.COMPLETED,
      jobId: jobId,
    });
    expect(result.metadata?.isError).toBeUndefined();
  });

  it('should return a structured error ToolResult if the job is FAILED', async () => {
    const jobId = 'failed-job';
    const error = new Error('Something went wrong');
    error.name = 'ToolError';
    const mockJob: Job = { id: jobId, status: JobStatus.FAILED, error: error };
    vi.mocked(jobManager.getJob).mockReturnValue(mockJob);

    const result = await execute(
      { jobId },
      mockGenericConfig,
      mockExecutionContext
    );

    expect(jobManager.getJob).toHaveBeenCalledWith(jobId);
    expect(result.content[0]?.text).toBe(
      `Job "${jobId}" failed: ${error.message}`
    );
    expect(result.metadata?.isError).toBe(true);
    expect(result.metadata?.status).toBe(JobStatus.FAILED);
    expect(result.metadata?.errorDetails).toEqual({
      type: 'ToolError',
      message: error.message,
    });
  });

  it('should return an error ToolResult if a COMPLETED job has no result stored', async () => {
    const jobId = 'completed-no-result-job';
    const mockJob: Job = {
      id: jobId,
      status: JobStatus.COMPLETED,
      result: undefined,
    };
    vi.mocked(jobManager.getJob).mockReturnValue(mockJob);

    const result = await execute(
      { jobId },
      mockGenericConfig,
      mockExecutionContext
    );

    expect(jobManager.getJob).toHaveBeenCalledWith(jobId);
    expect(result.content[0]?.text).toContain(
      `Job "${jobId}" is completed but has no result stored.`
    );
    expect(result.metadata?.isError).toBe(true);
    expect(result.metadata?.errorDetails).toEqual({
      type: 'MissingJobResultError',
      message: `Job "${jobId}" is completed but has no result stored.`,
    });
  });

  it('should return an error ToolResult if a FAILED job has no error object stored', async () => {
    const jobId = 'failed-no-error-obj-job';
    const mockJob: Job = {
      id: jobId,
      status: JobStatus.FAILED,
      error: undefined,
    };
    vi.mocked(jobManager.getJob).mockReturnValue(mockJob);

    const result = await execute(
      { jobId },
      mockGenericConfig,
      mockExecutionContext
    );

    expect(jobManager.getJob).toHaveBeenCalledWith(jobId);
    expect(result.content[0]?.text).toBe(
      `Job "${jobId}" failed: Unknown error`
    );
    expect(result.metadata?.isError).toBe(true);
    expect(result.metadata?.status).toBe(JobStatus.FAILED);
    expect(result.metadata?.errorDetails).toEqual({
      type: 'JobFailedError',
      message: 'Unknown error',
    });
  });
});
