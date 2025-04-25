import { z } from 'zod';
import { jobManager, JobStatus } from '../../services/job-manager/index.js';
import { ToolResult, ToolExecutionContext } from '../../types/tools.js';

// Input schema for polling job status
const jobResultInputSchema = z.object({
  jobId: z.string().min(1, 'jobId is required'),
});

/**
 * Retrieves the status/result of a code-refactor-generator async job by jobId.
 * Returns status, result, and error in a ToolResult-compatible format.
 */
export async function getCodeRefactorJobResult(
  params: Record<string, unknown>,
  _config: Record<string, unknown>,
  _context: ToolExecutionContext
): Promise<ToolResult> {
  const parseResult = jobResultInputSchema.safeParse(params);
  if (!parseResult.success) {
    return {
      isError: true,
      content: [{ type: 'text', text: parseResult.error.message }],
      errorDetails: {
        type: 'InputValidationError',
        message: parseResult.error.message,
      },
    };
  }
  const { jobId } = parseResult.data;
  const job = jobManager.getJob(jobId);
  if (!job) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Job with ID "${jobId}" not found.` }],
      errorDetails: {
        type: 'JobNotFoundError',
        message: `Job with ID "${jobId}" not found.`,
      },
    };
  }
  switch (job.status) {
    case JobStatus.PENDING:
    case JobStatus.RUNNING:
      return {
        isError: false,
        content: [{ type: 'text', text: `Job "${jobId}" is still in progress (status: ${job.status}).` }],
        metadata: {
          status: job.status,
        },
      };
    case JobStatus.COMPLETED:
      return {
        isError: false,
        content: [{ type: 'text', text: typeof job.result === 'string' ? job.result : JSON.stringify(job.result) }],
        metadata: {
          status: job.status,
        },
      };
    case JobStatus.FAILED:
      return {
        isError: true,
        content: [{ type: 'text', text: job.error ? (job.error.message || String(job.error)) : 'Job failed.' }],
        errorDetails: {
          type: job.error?.name || 'JobFailedError',
          message: job.error?.message || String(job.error) || 'Job failed.',
        },
        metadata: {
          status: job.status,
        },
      };
    default:
      return {
        isError: true,
        content: [{ type: 'text', text: `Job "${jobId}" has an unknown status: ${job.status}` }],
        errorDetails: {
          type: 'UnknownJobStatusError',
          message: `Job "${jobId}" has an unknown status: ${job.status}`,
        },
        metadata: {
          status: job.status,
        },
      };
  }
}

export { jobResultInputSchema };
