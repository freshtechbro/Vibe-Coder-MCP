/**
 * Resource Tracker for the Code-Map Generator tool.
 * This file contains the ResourceTracker class for tracking and cleaning up job-specific resources.
 */

import fs from 'fs/promises';
import logger from '../../../logger.js';

/**
 * Interface for cache objects with optional clear methods.
 */
export interface CacheObject {
  clear?: () => void;
  clearCache?: () => void;
}

/**
 * Interface for disposable resources.
 */
export interface DisposableResource {
  dispose?: () => Promise<void> | void;
  close?: () => Promise<void> | void;
  cleanup?: () => Promise<void> | void;
}

/**
 * Interface for job resources.
 */
export interface JobResources {
  /**
   * Temporary directories created for the job.
   */
  tempDirs: string[];

  /**
   * Caches used by the job.
   */
  caches: CacheObject[];

  /**
   * Timers created for the job.
   */
  timers: NodeJS.Timeout[];

  /**
   * Other resources mapped by key.
   */
  otherResources: Map<string, DisposableResource>;
}

/**
 * Tracks and manages resources for jobs to prevent memory leaks.
 */
export class ResourceTracker {
  /**
   * Map of job IDs to their resources.
   */
  private jobResources: Map<string, JobResources> = new Map();

  /**
   * Starts tracking resources for a job.
   * @param jobId The job ID
   */
  trackJob(jobId: string): void {
    this.jobResources.set(jobId, {
      tempDirs: [],
      caches: [],
      timers: [],
      otherResources: new Map()
    });
    
    logger.debug(`Started tracking resources for job: ${jobId}`);
  }
  
  /**
   * Tracks a temporary directory for a job.
   * @param jobId The job ID
   * @param dirPath The directory path
   */
  trackTempDir(jobId: string, dirPath: string): void {
    const resources = this.jobResources.get(jobId);
    if (resources) {
      resources.tempDirs.push(dirPath);
      logger.debug(`Tracking temporary directory for job ${jobId}: ${dirPath}`);
    } else {
      logger.warn(`Cannot track temporary directory for unknown job: ${jobId}`);
    }
  }
  
  /**
   * Tracks a cache for a job.
   * @param jobId The job ID
   * @param cache The cache object
   */
  trackCache(jobId: string, cache: CacheObject): void {
    const resources = this.jobResources.get(jobId);
    if (resources) {
      resources.caches.push(cache);
      logger.debug(`Tracking cache for job ${jobId}`);
    } else {
      logger.warn(`Cannot track cache for unknown job: ${jobId}`);
    }
  }
  
  /**
   * Tracks a timer for a job.
   * @param jobId The job ID
   * @param timer The timer
   */
  trackTimer(jobId: string, timer: NodeJS.Timeout): void {
    const resources = this.jobResources.get(jobId);
    if (resources) {
      resources.timers.push(timer);
      logger.debug(`Tracking timer for job ${jobId}`);
    } else {
      logger.warn(`Cannot track timer for unknown job: ${jobId}`);
    }
  }
  
  /**
   * Tracks any other resource for a job.
   * @param jobId The job ID
   * @param key The resource key
   * @param resource The resource
   */
  trackResource(jobId: string, key: string, resource: DisposableResource): void {
    const resources = this.jobResources.get(jobId);
    if (resources) {
      resources.otherResources.set(key, resource);
      logger.debug(`Tracking resource ${key} for job ${jobId}`);
    } else {
      logger.warn(`Cannot track resource for unknown job: ${jobId}`);
    }
  }
  
  /**
   * Cleans up all resources for a job.
   * @param jobId The job ID
   * @returns A promise that resolves when cleanup is complete
   */
  async cleanupJob(jobId: string): Promise<void> {
    const resources = this.jobResources.get(jobId);
    if (!resources) {
      logger.warn(`No resources to clean up for job: ${jobId}`);
      return;
    }
    
    logger.info(`Cleaning up resources for job: ${jobId}`);
    
    // Clear timers
    for (const timer of resources.timers) {
      try {
        clearTimeout(timer);
        clearInterval(timer);
        logger.debug(`Cleared timer for job ${jobId}`);
      } catch (error) {
        logger.warn(`Error clearing timer for job ${jobId}: ${error}`);
      }
    }
    
    // Clear caches
    for (const cache of resources.caches) {
      try {
        if (typeof cache.clear === 'function') {
          cache.clear();
          logger.debug(`Cleared cache for job ${jobId}`);
        } else if (typeof cache.clearCache === 'function') {
          cache.clearCache();
          logger.debug(`Cleared cache for job ${jobId} using clearCache method`);
        } else {
          logger.warn(`Cache for job ${jobId} does not have a clear or clearCache method`);
        }
      } catch (error) {
        logger.warn(`Error clearing cache for job ${jobId}: ${error}`);
      }
    }
    
    // Remove temp directories
    for (const dirPath of resources.tempDirs) {
      try {
        await fs.rm(dirPath, { recursive: true, force: true });
        logger.debug(`Removed temporary directory for job ${jobId}: ${dirPath}`);
      } catch (error) {
        logger.warn(`Failed to remove temporary directory for job ${jobId}: ${dirPath}`, error);
      }
    }
    
    // Clean up other resources
    for (const [key, resource] of resources.otherResources.entries()) {
      try {
        if (typeof resource.dispose === 'function') {
          await resource.dispose();
          logger.debug(`Disposed resource ${key} for job ${jobId}`);
        } else if (typeof resource.close === 'function') {
          await resource.close();
          logger.debug(`Closed resource ${key} for job ${jobId}`);
        } else if (typeof resource.cleanup === 'function') {
          await resource.cleanup();
          logger.debug(`Cleaned up resource ${key} for job ${jobId}`);
        } else {
          logger.debug(`No cleanup method found for resource ${key} for job ${jobId}`);
        }
      } catch (error) {
        logger.warn(`Error cleaning up resource ${key} for job ${jobId}: ${error}`);
      }
    }
    
    // Remove job from tracking
    this.jobResources.delete(jobId);
    
    logger.info(`Completed cleanup for job: ${jobId}`);
  }
  
  /**
   * Gets the number of tracked jobs.
   * @returns The number of tracked jobs
   */
  getTrackedJobCount(): number {
    return this.jobResources.size;
  }
  
  /**
   * Gets the IDs of all tracked jobs.
   * @returns An array of job IDs
   */
  getTrackedJobIds(): string[] {
    return Array.from(this.jobResources.keys());
  }
  
  /**
   * Gets the resources for a job.
   * @param jobId The job ID
   * @returns The job resources, or undefined if not found
   */
  getJobResources(jobId: string): JobResources | undefined {
    return this.jobResources.get(jobId);
  }
  
  /**
   * Checks if a job is being tracked.
   * @param jobId The job ID
   * @returns True if the job is being tracked, false otherwise
   */
  isJobTracked(jobId: string): boolean {
    return this.jobResources.has(jobId);
  }
}
