/**
 * Output Cleaner for the Code-Map Generator tool.
 * This file contains the OutputCleaner class for cleaning up old outputs and temporary files.
 */

import fs from 'fs/promises';
import path from 'path';
import logger from '../../../logger.js';
import { CodeMapGeneratorConfig } from '../types.js';
import { getOutputDirectory, getCacheDirectory } from '../directoryUtils.js';

/**
 * Interface for output cleanup options.
 */
export interface OutputCleanupOptions {
  /**
   * Maximum age of output files in milliseconds.
   * Default: 7 days
   */
  maxAge?: number;

  /**
   * Maximum number of output directories to keep.
   * Default: 10
   */
  maxOutputDirs?: number;

  /**
   * Whether to clean up old outputs automatically.
   * Default: true
   */
  cleanupOldOutputs?: boolean;

  /**
   * Whether to clean up temporary files.
   * Default: true
   */
  cleanupTempFiles?: boolean;

  /**
   * Maximum age of temporary files in milliseconds.
   * Default: 1 day
   */
  tempFilesMaxAge?: number;
}

/**
 * Interface for directory or file information.
 */
interface FileSystemItemInfo {
  /**
   * The path of the item.
   */
  path: string;

  /**
   * The name of the item.
   */
  name: string;

  /**
   * Whether the item is a directory.
   */
  isDirectory: boolean;

  /**
   * The creation time of the item.
   */
  creationTime: Date;

  /**
   * The modification time of the item.
   */
  modificationTime: Date;

  /**
   * The size of the item in bytes.
   */
  size: number;
}

/**
 * Interface for cleanup result.
 */
export interface CleanupResult {
  /**
   * The number of directories removed.
   */
  directoriesRemoved: number;

  /**
   * The number of files removed.
   */
  filesRemoved: number;

  /**
   * The total size of removed items in bytes.
   */
  totalSizeRemoved: number;

  /**
   * The paths of removed items.
   */
  removedPaths: string[];

  /**
   * Any errors that occurred during cleanup.
   */
  errors: Error[];
}

/**
 * Cleans up old outputs and temporary files.
 */
export class OutputCleaner {
  private options: Required<OutputCleanupOptions>;
  private config: CodeMapGeneratorConfig;

  /**
   * Default options for output cleanup.
   */
  private static readonly DEFAULT_OPTIONS: Required<OutputCleanupOptions> = {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxOutputDirs: 10,
    cleanupOldOutputs: true,
    cleanupTempFiles: true,
    tempFilesMaxAge: 24 * 60 * 60 * 1000 // 1 day
  };

  /**
   * Creates a new OutputCleaner instance.
   * @param config The code map generator configuration
   */
  constructor(config: CodeMapGeneratorConfig) {
    this.config = config;
    this.options = {
      ...OutputCleaner.DEFAULT_OPTIONS,
      ...config.output
    };

    logger.debug(`OutputCleaner created with options: ${JSON.stringify(this.options)}`);
  }

  /**
   * Cleans up old outputs and temporary files.
   * @returns A promise that resolves to a cleanup result
   */
  public async cleanup(): Promise<CleanupResult> {
    const result: CleanupResult = {
      directoriesRemoved: 0,
      filesRemoved: 0,
      totalSizeRemoved: 0,
      removedPaths: [],
      errors: []
    };

    try {
      // Clean up old outputs if enabled
      if (this.options.cleanupOldOutputs) {
        await this.cleanupOldOutputs(result);
      }

      // Clean up temporary files if enabled
      if (this.options.cleanupTempFiles) {
        await this.cleanupTempFiles(result);
      }

      logger.info(`Cleanup completed: ${result.directoriesRemoved} directories and ${result.filesRemoved} files removed (${this.formatBytes(result.totalSizeRemoved)})`);
    } catch (error) {
      logger.error({ err: error }, 'Error during cleanup');
      result.errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    return result;
  }

  /**
   * Cleans up old output directories.
   * @param result The cleanup result to update
   */
  private async cleanupOldOutputs(result: CleanupResult): Promise<void> {
    try {
      // Get the output directory
      const outputDir = this.config.output?.outputDir || getOutputDirectory(this.config);

      // Check if the output directory exists
      try {
        await fs.access(outputDir);
      } catch {
        // Output directory doesn't exist, nothing to clean up
        return;
      }

      // Get all subdirectories in the output directory
      const items = await this.getDirectoryContents(outputDir);
      const directories = items.filter(item => item.isDirectory);

      // Sort directories by creation time (oldest first)
      directories.sort((a, b) => a.creationTime.getTime() - b.creationTime.getTime());

      // Apply max age policy
      const now = Date.now();
      const maxAge = this.options.maxAge;
      const oldDirectories = directories.filter(dir => now - dir.creationTime.getTime() > maxAge);

      // Apply max count policy
      let directoriesToRemove = [...oldDirectories];
      if (directories.length > this.options.maxOutputDirs) {
        // Calculate how many more directories to remove
        const additionalCount = directories.length - this.options.maxOutputDirs - oldDirectories.length;
        if (additionalCount > 0) {
          // Add the oldest directories that aren't already in the list
          const remainingDirs = directories.filter(dir => !oldDirectories.includes(dir));
          directoriesToRemove = [...directoriesToRemove, ...remainingDirs.slice(0, additionalCount)];
        }
      }

      // Remove the directories
      for (const dir of directoriesToRemove) {
        try {
          // Get directory size before removing
          const dirSize = await this.getDirectorySize(dir.path);

          // Remove the directory
          await fs.rm(dir.path, { recursive: true, force: true });

          // Update the result
          result.directoriesRemoved++;
          result.totalSizeRemoved += dirSize;
          result.removedPaths.push(dir.path);

          logger.debug(`Removed old output directory: ${dir.path} (${this.formatBytes(dirSize)})`);
        } catch (error) {
          logger.warn({ err: error, path: dir.path }, 'Failed to remove output directory');
          result.errors.push(error instanceof Error ? error : new Error(`Failed to remove ${dir.path}: ${String(error)}`));
        }
      }

      logger.info(`Cleaned up ${directoriesToRemove.length} old output directories`);
    } catch (error) {
      logger.error({ err: error }, 'Error cleaning up old outputs');
      result.errors.push(error instanceof Error ? error : new Error(`Error cleaning up old outputs: ${String(error)}`));
    }
  }

  /**
   * Cleans up temporary files.
   * @param result The cleanup result to update
   */
  private async cleanupTempFiles(result: CleanupResult): Promise<void> {
    try {
      // Get the cache directory
      const cacheDir = getCacheDirectory(this.config);

      // Check if the cache directory exists
      try {
        await fs.access(cacheDir);
      } catch {
        // Cache directory doesn't exist, nothing to clean up
        return;
      }

      // Get the temp directory
      const tempDir = path.join(cacheDir, 'temp');

      // Check if the temp directory exists
      try {
        await fs.access(tempDir);
      } catch {
        // Temp directory doesn't exist, nothing to clean up
        return;
      }

      // Get all subdirectories in the temp directory
      const items = await this.getDirectoryContents(tempDir);
      const tempItems = [...items];

      // Apply max age policy
      const now = Date.now();
      const maxAge = this.options.tempFilesMaxAge;
      const oldItems = tempItems.filter(item => now - item.modificationTime.getTime() > maxAge);

      // Remove the old items
      for (const item of oldItems) {
        try {
          // Remove the item
          await fs.rm(item.path, { recursive: true, force: true });

          // Update the result
          if (item.isDirectory) {
            result.directoriesRemoved++;
          } else {
            result.filesRemoved++;
          }
          result.totalSizeRemoved += item.size;
          result.removedPaths.push(item.path);

          logger.debug(`Removed old temporary ${item.isDirectory ? 'directory' : 'file'}: ${item.path} (${this.formatBytes(item.size)})`);
        } catch (error) {
          logger.warn({ err: error, path: item.path }, `Failed to remove temporary ${item.isDirectory ? 'directory' : 'file'}`);
          result.errors.push(error instanceof Error ? error : new Error(`Failed to remove ${item.path}: ${String(error)}`));
        }
      }

      logger.info(`Cleaned up ${oldItems.length} old temporary items`);
    } catch (error) {
      logger.error({ err: error }, 'Error cleaning up temporary files');
      result.errors.push(error instanceof Error ? error : new Error(`Error cleaning up temporary files: ${String(error)}`));
    }
  }

  /**
   * Gets the contents of a directory.
   * @param dirPath The directory path
   * @returns A promise that resolves to an array of file system item information
   */
  private async getDirectoryContents(dirPath: string): Promise<FileSystemItemInfo[]> {
    try {
      // Read the directory
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      // Get information for each entry
      const items: FileSystemItemInfo[] = [];
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        try {
          const stats = await fs.stat(entryPath);
          items.push({
            path: entryPath,
            name: entry.name,
            isDirectory: entry.isDirectory(),
            creationTime: new Date(stats.birthtime),
            modificationTime: new Date(stats.mtime),
            size: stats.size
          });
        } catch (error) {
          logger.warn({ err: error, path: entryPath }, 'Failed to get stats for directory entry');
        }
      }

      return items;
    } catch (error) {
      logger.error({ err: error, path: dirPath }, 'Failed to read directory');
      return [];
    }
  }

  /**
   * Gets the size of a directory.
   * @param dirPath The directory path
   * @returns A promise that resolves to the size in bytes
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    try {
      // Read the directory
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      // Calculate the size
      let size = 0;
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        try {
          if (entry.isDirectory()) {
            // Recursively get the size of subdirectories
            size += await this.getDirectorySize(entryPath);
          } else {
            // Get the size of files
            const stats = await fs.stat(entryPath);
            size += stats.size;
          }
        } catch (error) {
          logger.warn({ err: error, path: entryPath }, 'Failed to get size for directory entry');
        }
      }

      return size;
    } catch (error) {
      logger.error({ err: error, path: dirPath }, 'Failed to get directory size');
      return 0;
    }
  }

  /**
   * Formats a byte value into a human-readable string.
   * @param bytes The byte value
   * @param decimals The number of decimal places to include
   * @returns The formatted string
   */
  private formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    if (!bytes || isNaN(bytes)) return 'Unknown';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    if (i < 0 || i >= sizes.length) return `${bytes} Bytes`;

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}
