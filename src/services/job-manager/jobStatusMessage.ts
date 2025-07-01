// src/services/job-manager/jobStatusMessage.ts
import { JobStatus } from './index.js';

/**
 * Detailed job information for enhanced status reporting
 */
export interface JobDetails {
  /** Current stage or phase of the job */
  currentStage?: string;
  /** Array of diagnostic messages for troubleshooting */
  diagnostics?: string[];
  /** Sub-progress within the current stage (0-100) */
  subProgress?: number;
  /** Additional metadata specific to the tool */
  metadata?: Record<string, unknown>;
}

/**
 * Standard format for job status messages.
 */
export interface JobStatusMessage {
  /** The unique identifier for the job */
  jobId: string;
  /** The name of the tool that created the job */
  toolName: string;
  /** The current status of the job */
  status: JobStatus;
  /** An optional message describing the current progress */
  message?: string;
  /** An optional progress percentage (0-100) */
  progress?: number;
  /** The timestamp when this message was created */
  timestamp: number;
  /** The timestamp when the job was created */
  createdAt: number;
  /** The timestamp when the job was last updated */
  updatedAt: number;
  /** Recommendations for polling frequency */
  pollingRecommendation?: {
    /** Recommended interval in milliseconds between status checks */
    interval: number;
    /** Timestamp when the next status check should occur */
    nextCheckTime: number;
  };
  /** Optional detailed information for enhanced debugging */
  details?: JobDetails;
}

/**
 * Creates a standardized job status message.
 * @param jobId The ID of the job.
 * @param toolName The name of the tool that created the job.
 * @param status The current status of the job.
 * @param message An optional progress message.
 * @param progress An optional progress percentage (0-100).
 * @param createdAt The timestamp when the job was created.
 * @param updatedAt The timestamp when the job was last updated.
 * @param details Optional detailed information for enhanced debugging.
 * @returns A standardized job status message.
 */
export function createJobStatusMessage(
  jobId: string,
  toolName: string,
  status: JobStatus,
  message?: string,
  progress?: number,
  createdAt?: number,
  updatedAt?: number,
  details?: JobDetails
): JobStatusMessage {
  const now = Date.now();

  // Calculate recommended polling interval based on status
  let pollingInterval: number | undefined;

  if (status === JobStatus.PENDING) {
    pollingInterval = 5000; // 5 seconds for pending jobs
  } else if (status === JobStatus.RUNNING) {
    pollingInterval = 2000; // 2 seconds for running jobs
  }

  return {
    jobId,
    toolName,
    status,
    message,
    progress,
    timestamp: now,
    createdAt: createdAt || now,
    updatedAt: updatedAt || now,
    ...(pollingInterval ? {
      pollingRecommendation: {
        interval: pollingInterval,
        nextCheckTime: now + pollingInterval
      }
    } : {}),
    ...(details ? { details } : {})
  };
}
