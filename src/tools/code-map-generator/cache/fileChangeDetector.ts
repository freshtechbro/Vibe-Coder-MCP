/**
 * File Change Detector for the Code-Map Generator tool.
 * This file contains the FileChangeDetector class for detecting changes in files.
 */

import crypto from 'crypto';
import logger from '../../../logger.js';
import { FileContentManager, FileMetadata } from './fileContentManager.js';

/**
 * Interface for file change detection options.
 */
export interface FileChangeDetectionOptions {
  /**
   * Whether to use file hashes for change detection.
   * Default is true.
   */
  useFileHashes?: boolean;

  /**
   * Whether to use file metadata (size, modification time) for change detection.
   * Default is true.
   */
  useFileMetadata?: boolean;

  /**
   * Maximum number of file hashes to cache.
   * Default is 10000.
   */
  maxCachedHashes?: number;

  /**
   * Maximum age of cached hashes in milliseconds.
   * Default is 24 hours.
   */
  maxHashAge?: number;
}

/**
 * Interface for file change detection result.
 */
export interface FileChangeDetectionResult {
  /**
   * Whether the file has changed.
   */
  changed: boolean;

  /**
   * The reason for the change detection result.
   */
  reason: string;

  /**
   * The file metadata.
   */
  metadata?: FileMetadata;

  /**
   * The file hash.
   */
  hash?: string;
}

/**
 * Interface for file hash cache entry.
 */
interface FileHashCacheEntry {
  /**
   * The file hash.
   */
  hash: string;

  /**
   * The timestamp when the hash was calculated.
   */
  timestamp: number;

  /**
   * The file metadata when the hash was calculated.
   */
  metadata: FileMetadata;
}

/**
 * Detects changes in files using file metadata and content hashes.
 */
export class FileChangeDetector {
  private fileContentManager: FileContentManager;
  private options: Required<FileChangeDetectionOptions>;
  private fileHashCache: Map<string, FileHashCacheEntry> = new Map();
  private lastProcessedFiles: Set<string> = new Set();

  /**
   * Default options for file change detection.
   */
  private static readonly DEFAULT_OPTIONS: Required<FileChangeDetectionOptions> = {
    useFileHashes: true,
    useFileMetadata: true,
    maxCachedHashes: 10000,
    maxHashAge: 24 * 60 * 60 * 1000 // 24 hours
  };

  /**
   * Creates a new FileChangeDetector instance.
   * @param fileContentManager The file content manager to use
   * @param options The change detection options
   */
  constructor(fileContentManager: FileContentManager, options: FileChangeDetectionOptions = {}) {
    this.fileContentManager = fileContentManager;
    this.options = {
      ...FileChangeDetector.DEFAULT_OPTIONS,
      ...options
    };

    logger.debug(`FileChangeDetector created with options: ${JSON.stringify(this.options)}`);
  }

  /**
   * Detects if a file has changed.
   * @param filePath The file path
   * @param baseDir The base directory for resolving relative paths
   * @returns A promise that resolves to a change detection result
   */
  public async detectChange(filePath: string, baseDir: string): Promise<FileChangeDetectionResult> {
    try {
      // Get file metadata
      const metadata = await this.fileContentManager.getMetadata(filePath);

      if (!metadata) {
        return {
          changed: true,
          reason: 'File metadata not found'
        };
      }

      // Check if the file is in the cache
      const cacheEntry = this.fileHashCache.get(filePath);

      // If metadata-based detection is enabled, check if the file has changed based on metadata
      if (this.options.useFileMetadata && cacheEntry) {
        const metadataChanged = this.hasMetadataChanged(metadata, cacheEntry.metadata);

        if (!metadataChanged) {
          return {
            changed: false,
            reason: 'File metadata unchanged',
            metadata,
            hash: cacheEntry.hash
          };
        }

        // If metadata has changed and we're not using file hashes, return true
        if (!this.options.useFileHashes) {
          return {
            changed: true,
            reason: 'File metadata changed',
            metadata
          };
        }
      }

      // If we're using file hashes, calculate the hash and compare
      if (this.options.useFileHashes) {
        // Get file content
        const content = await this.fileContentManager.getContent(filePath, baseDir);

        // Calculate hash
        const hash = this.calculateHash(content);

        // Check if the hash has changed
        if (cacheEntry && hash === cacheEntry.hash) {
          // Update the cache entry timestamp
          this.fileHashCache.set(filePath, {
            hash,
            timestamp: Date.now(),
            metadata
          });

          return {
            changed: false,
            reason: 'File content unchanged',
            metadata,
            hash
          };
        }

        // Update the cache
        this.fileHashCache.set(filePath, {
          hash,
          timestamp: Date.now(),
          metadata
        });

        // Prune the cache if it's too large
        this.pruneCache();

        return {
          changed: true,
          reason: cacheEntry ? 'File content changed' : 'File not in cache',
          metadata,
          hash
        };
      }

      // If we're not using file hashes, return true for new files
      return {
        changed: true,
        reason: 'New file',
        metadata
      };
    } catch (error) {
      logger.error({ err: error, filePath }, 'Error detecting file change');

      // If there's an error, assume the file has changed
      return {
        changed: true,
        reason: `Error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Checks if file metadata has changed.
   * @param current The current file metadata
   * @param previous The previous file metadata
   * @returns True if the metadata has changed, false otherwise
   */
  private hasMetadataChanged(current: FileMetadata, previous: FileMetadata): boolean {
    // Check if the size has changed
    if (current.size !== previous.size) {
      return true;
    }

    // Check if the modification time has changed
    // Handle both Date objects and timestamps (numbers)
    const currentMtime = typeof current.mtime === 'number'
      ? current.mtime
      : Number(current.mtime);

    const previousMtime = typeof previous.mtime === 'number'
      ? previous.mtime
      : Number(previous.mtime);

    if (currentMtime !== previousMtime) {
      return true;
    }

    return false;
  }

  /**
   * Calculates a hash for file content.
   * @param content The file content
   * @returns The hash
   */
  private calculateHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Prunes the file hash cache if it's too large.
   */
  private pruneCache(): void {
    if (this.fileHashCache.size <= this.options.maxCachedHashes) {
      return;
    }

    // Remove the oldest entries
    const entriesToRemove = this.fileHashCache.size - this.options.maxCachedHashes;
    const entries = Array.from(this.fileHashCache.entries());

    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove the oldest entries
    for (let i = 0; i < entriesToRemove; i++) {
      this.fileHashCache.delete(entries[i][0]);
    }

    logger.debug(`Pruned ${entriesToRemove} entries from file hash cache`);
  }

  /**
   * Cleans up old entries from the file hash cache.
   */
  public cleanupCache(): void {
    const now = Date.now();
    const maxAge = this.options.maxHashAge;
    let removedCount = 0;

    for (const [filePath, entry] of this.fileHashCache.entries()) {
      if (now - entry.timestamp > maxAge) {
        this.fileHashCache.delete(filePath);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug(`Removed ${removedCount} expired entries from file hash cache`);
    }
  }

  /**
   * Gets the number of entries in the file hash cache.
   * @returns The number of entries
   */
  public getCacheSize(): number {
    return this.fileHashCache.size;
  }

  /**
   * Clears the file hash cache.
   */
  public clearCache(): void {
    this.fileHashCache.clear();
    logger.debug('Cleared file hash cache');
  }

  /**
   * Sets the list of processed files for the current run.
   * @param filePaths The file paths
   */
  public setProcessedFiles(filePaths: string[]): void {
    this.lastProcessedFiles = new Set(filePaths);
  }

  /**
   * Gets the list of processed files from the last run.
   * @returns The file paths
   */
  public getLastProcessedFiles(): string[] {
    return Array.from(this.lastProcessedFiles);
  }

  /**
   * Checks if a file was processed in the last run.
   * @param filePath The file path
   * @returns True if the file was processed, false otherwise
   */
  public wasFileProcessed(filePath: string): boolean {
    return this.lastProcessedFiles.has(filePath);
  }
}
