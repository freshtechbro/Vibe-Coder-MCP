import { z } from 'zod';

import logger from '../../logger.js';
import { jobManager } from '../../services/job-manager/index.js';
import {
  ToolExecutionContext,
  toolRegistry,
} from '../../services/routing/toolRegistry.js';
import { ToolDefinition, ToolResult } from '../../types/tools.js';
import { AppError } from '../../utils/errors.js';

const jobResultInputSchema = z.object({
  jobId: z.string().min(1),
});

type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

interface Job {
  id: string;
  status: JobStatus;
  result?: unknown;
  error?: Error;
}

async function retrieveJobResult(
  params: Record<string, unknown>,
  _config: Record<string, unknown>,
  _context: ToolExecutionContext
): Promise<ToolResult> {
  const { jobId } = params as { jobId: string };
  logger.debug({ jobId }, 'Retrieving job result');

  const job = jobManager.getJob(jobId) as Job | undefined;

  if (!job) {
    logger.warn({ jobId }, 'Job not found');
    return {
      content: [
        {
          type: 'text',
          text: `Job with ID "${jobId}" not found.`,
        },
      ],
      metadata: {
        isError: true,
        errorDetails: {
          type: 'JobNotFoundError',
          message: `Job with ID "${jobId}" not found.`,
        },
      },
    };
  }

  logger.debug({ jobId, status: job.status }, 'Job found');

  switch (job.status) {
    case 'pending':
      return {
        content: [
          {
            type: 'text',
            text: `Job "${jobId}" is currently pending.`,
          },
        ],
        metadata: { status: 'pending' },
      };

    case 'running':
      return {
        content: [
          {
            type: 'text',
            text: `Job "${jobId}" is currently running.`,
          },
        ],
        metadata: { status: 'running' },
      };

    case 'completed':
      if (job.result === undefined || job.result === null) {
        logger.error({ jobId }, 'Completed job has no result stored.');
        return {
          content: [
            {
              type: 'text',
              text: `Job "${jobId}" is completed but has no result stored.`,
            },
          ],
          metadata: {
            isError: true,
            errorDetails: {
              type: 'MissingJobResultError',
              message: `Job "${jobId}" is completed but has no result stored.`,
            },
          },
        };
      }
      logger.info({ jobId }, 'Job completed, returning result.');
      const completedResult = job.result as ToolResult;
      return {
        ...completedResult,
        metadata: {
          ...(completedResult.metadata || {}),
          status: 'completed',
          jobId: jobId,
        },
      };

    case 'failed':
      const errorMessage =
        job.error instanceof Error ? job.error.message : 'Unknown error';
      logger.warn({ jobId, error: job.error }, 'Job failed');
      return {
        content: [
          {
            type: 'text',
            text: `Job "${jobId}" failed: ${errorMessage}`,
          },
        ],
        metadata: {
          isError: true,
          status: 'failed',
          errorDetails: {
            type: job.error?.name || 'JobFailedError',
            message: errorMessage,
          },
        },
      };

    default:
      logger.error({ jobId, status: job.status }, 'Job has unknown status');
      return {
        content: [
          {
            type: 'text',
            text: `Job "${jobId}" has an unknown status: ${job.status}`,
          },
        ],
        metadata: {
          isError: true,
          errorDetails: {
            type: 'UnknownJobStatusError',
            message: `Job "${jobId}" has an unknown status: ${job.status}`,
          },
        },
      };
  }
}

export const jobResultRetriever: ToolDefinition = {
  name: 'job-result-retriever',
  description: 'Checks the status or gets results from a background job.',
  inputSchema: jobResultInputSchema.shape,
  execute: retrieveJobResult,
};

toolRegistry.registerTool(jobResultRetriever);
