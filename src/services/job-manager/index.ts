import { v4 as uuidv4 } from 'uuid';

import logger from '../../logger.js';
import { sseNotifier } from '../sse-notifier/index.js';

interface Job {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: Error;
}

const jobs = new Map<string, Job>();

export const jobManager = {
  createJob(): string {
    const jobId = uuidv4();
    const job: Job = {
      id: jobId,
      status: 'pending',
    };
    jobs.set(jobId, job);

    sseNotifier.notify('job_status', {
      type: 'JOB_CREATED',
      jobId,
      status: job.status,
    });

    return jobId;
  },

  startJob(jobId: string): void {
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'running';
      sseNotifier.notify('job_status', {
        type: 'JOB_UPDATED',
        jobId,
        status: job.status,
      });
    }
  },

  completeJob(jobId: string, result: unknown): void {
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'completed';
      job.result = result;
      sseNotifier.notify('job_status', {
        type: 'JOB_COMPLETED',
        jobId,
        result: job.result,
      });
    }
  },

  failJob(jobId: string, error: Error): void {
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = error;
      sseNotifier.notify('job_status', {
        type: 'JOB_FAILED',
        jobId,
        error: job.error,
      });
    }
  },

  updateJobStatus(
    jobId: string,
    status: 'pending' | 'running' | 'completed' | 'failed'
  ): void {
    const job = jobs.get(jobId);
    if (job) {
      job.status = status;
      sseNotifier.notify('job_status', {
        type: 'JOB_UPDATED',
        jobId,
        status,
      });
    }
  },

  setJobResult(jobId: string, result: unknown): void {
    const job = jobs.get(jobId);
    if (job) {
      job.result = result;
      // Don't update status or notify - this just sets the result
    }
  },

  getJob(jobId: string): Job | undefined {
    return jobs.get(jobId);
  },
};

// Export JobStatus enum for use in other modules and tests
export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
