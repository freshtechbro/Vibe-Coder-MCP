export enum JobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface Job {
  id: string;
  toolName: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  progressMessage?: string;
  result?: unknown;
  error?: Error;
}
