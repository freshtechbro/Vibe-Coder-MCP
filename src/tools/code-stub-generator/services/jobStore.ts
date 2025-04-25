import crypto from 'crypto';
import { CodeStubInput } from '../index.js';

export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface Job {
  id: string;
  status: JobStatus;
  input: CodeStubInput;
  result: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const jobStore = new Map<string, Job>();

export function createJob(inputData: CodeStubInput): string {
  const jobId = crypto.randomUUID();
  const now = new Date();
  const newJob: Job = {
    id: jobId,
    status: JobStatus.PENDING,
    input: inputData,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  jobStore.set(jobId, newJob);
  return jobId;
}

export function updateJobStatus(
  jobId: string,
  status: JobStatus,
  result?: string | null,
  error?: string | null
): boolean {
  const job = jobStore.get(jobId);
  if (!job) {
    return false;
  }

  job.status = status;
  // Ensure updatedAt is strictly greater than previous timestamp
  const prevUpdatedTime = job.updatedAt.getTime();
  job.updatedAt = new Date(prevUpdatedTime + 1);

  if (status === JobStatus.COMPLETED) {
    job.result = result ?? null;
    job.error = null;
  } else if (status === JobStatus.FAILED) {
    job.error = error ?? null;
    job.result = null;
  } else {
    job.result = null;
    job.error = null;
  }

  jobStore.set(jobId, job);
  return true;
}

export function getJobResult(jobId: string): Job | undefined {
  return jobStore.get(jobId);
}
