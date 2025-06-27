/**
 * Standardized Storage Initialization Utilities
 * 
 * Provides consistent patterns for storage initialization across all storage classes.
 * Handles directory creation, index file management, and error recovery.
 */

import * as path from 'path';
import { FileUtils, FileOperationResult } from './file-utils.js';
import logger from '../../../logger.js';

/**
 * Configuration for storage initialization
 */
export interface StorageInitConfig {
  /** Base data directory */
  dataDirectory: string;
  /** Storage type name for logging */
  storageType: string;
  /** Directories to create */
  directories: string[];
  /** Index files to create with their default data */
  indexFiles: Array<{
    path: string;
    defaultData: any;
  }>;
  /** Whether to validate paths for security */
  validatePaths?: boolean;
}

/**
 * Result of storage initialization
 */
export interface StorageInitResult {
  success: boolean;
  error?: string;
  metadata: {
    storageType: string;
    dataDirectory: string;
    directoriesCreated: string[];
    indexFilesCreated: string[];
    operation: 'initialize';
    timestamp: Date;
  };
}

/**
 * Standardized storage initialization utility
 */
export class StorageInitializer {
  /**
   * Initialize storage with consistent patterns
   */
  static async initialize(config: StorageInitConfig): Promise<StorageInitResult> {
    const result: StorageInitResult = {
      success: false,
      metadata: {
        storageType: config.storageType,
        dataDirectory: config.dataDirectory,
        directoriesCreated: [],
        indexFilesCreated: [],
        operation: 'initialize',
        timestamp: new Date()
      }
    };

    try {
      logger.debug({ 
        storageType: config.storageType, 
        dataDirectory: config.dataDirectory 
      }, 'Starting storage initialization');

      // Step 1: Create all required directories
      for (const directory of config.directories) {
        const fullPath = path.isAbsolute(directory) ? directory : path.join(config.dataDirectory, directory);
        
        const dirResult = await FileUtils.ensureDirectory(fullPath);
        if (!dirResult.success) {
          result.error = `Failed to create directory ${fullPath}: ${dirResult.error}`;
          return result;
        }
        
        result.metadata.directoriesCreated.push(fullPath);
        logger.debug({ directory: fullPath }, 'Directory created successfully');
      }

      // Step 2: Create index files if they don't exist
      for (const indexFile of config.indexFiles) {
        const fullPath = path.isAbsolute(indexFile.path) ? indexFile.path : path.join(config.dataDirectory, indexFile.path);
        
        // Check if file already exists
        if (await FileUtils.fileExists(fullPath)) {
          logger.debug({ indexFile: fullPath }, 'Index file already exists, skipping creation');
          continue;
        }

        // Create index file with default data
        const fileResult = await FileUtils.writeJsonFile(fullPath, indexFile.defaultData);
        if (!fileResult.success) {
          result.error = `Failed to create index file ${fullPath}: ${fileResult.error}`;
          return result;
        }
        
        result.metadata.indexFilesCreated.push(fullPath);
        logger.debug({ indexFile: fullPath }, 'Index file created successfully');
      }

      // Step 3: Validate initialization if required
      if (config.validatePaths) {
        const validationResult = await this.validateInitialization(config);
        if (!validationResult.success) {
          result.error = `Initialization validation failed: ${validationResult.error}`;
          return result;
        }
      }

      result.success = true;
      logger.info({ 
        storageType: config.storageType,
        directoriesCreated: result.metadata.directoriesCreated.length,
        indexFilesCreated: result.metadata.indexFilesCreated.length
      }, 'Storage initialization completed successfully');

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.error = errorMessage;
      
      logger.error({ 
        err: error, 
        storageType: config.storageType,
        dataDirectory: config.dataDirectory 
      }, 'Storage initialization failed');

      return result;
    }
  }

  /**
   * Validate that initialization was successful
   */
  private static async validateInitialization(config: StorageInitConfig): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate all directories exist
      for (const directory of config.directories) {
        const fullPath = path.isAbsolute(directory) ? directory : path.join(config.dataDirectory, directory);
        
        if (!await FileUtils.fileExists(fullPath)) {
          return {
            success: false,
            error: `Directory ${fullPath} was not created successfully`
          };
        }
      }

      // Validate all index files exist and are readable
      for (const indexFile of config.indexFiles) {
        const fullPath = path.isAbsolute(indexFile.path) ? indexFile.path : path.join(config.dataDirectory, indexFile.path);
        
        if (!await FileUtils.fileExists(fullPath)) {
          return {
            success: false,
            error: `Index file ${fullPath} was not created successfully`
          };
        }

        // Try to read the file to ensure it's valid JSON
        const readResult = await FileUtils.readJsonFile(fullPath);
        if (!readResult.success) {
          return {
            success: false,
            error: `Index file ${fullPath} is not readable or contains invalid JSON: ${readResult.error}`
          };
        }
      }

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Create standard index data structure
   */
  static createIndexData(entityType: string, version = '1.0.0'): any {
    return {
      [entityType]: [],
      lastUpdated: new Date().toISOString(),
      version
    };
  }

  /**
   * Get standard storage configuration for common patterns
   */
  static getStandardConfig(storageType: string, dataDirectory: string): Partial<StorageInitConfig> {
    const configs: Record<string, Partial<StorageInitConfig>> = {
      project: {
        storageType: 'ProjectStorage',
        directories: ['projects'],
        indexFiles: [
          {
            path: 'projects-index.json',
            defaultData: this.createIndexData('projects')
          }
        ]
      },
      task: {
        storageType: 'TaskStorage',
        directories: ['tasks', 'epics'],
        indexFiles: [
          {
            path: 'tasks-index.json',
            defaultData: this.createIndexData('tasks')
          },
          {
            path: 'epics-index.json',
            defaultData: this.createIndexData('epics')
          }
        ]
      },
      dependency: {
        storageType: 'DependencyStorage',
        directories: ['dependencies', 'graphs'],
        indexFiles: [
          {
            path: 'dependencies-index.json',
            defaultData: this.createIndexData('dependencies')
          }
        ]
      }
    };

    const config = configs[storageType];
    if (!config) {
      throw new Error(`Unknown storage type: ${storageType}`);
    }

    return {
      ...config,
      dataDirectory,
      validatePaths: true
    };
  }

  /**
   * Initialize storage with error recovery
   */
  static async initializeWithRecovery(config: StorageInitConfig, maxRetries = 3): Promise<StorageInitResult> {
    let lastError: string | undefined;
    let lastResult: StorageInitResult | undefined;

    // Normalize paths in config to handle spaces and special characters
    const normalizedConfig = this.normalizeStorageConfig(config);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.debug({
        storageType: normalizedConfig.storageType,
        attempt,
        maxRetries,
        dataDirectory: normalizedConfig.dataDirectory
      }, 'Attempting storage initialization');

      const result = await this.initialize(normalizedConfig);
      lastResult = result;

      if (result.success) {
        if (attempt > 1) {
          logger.info({
            storageType: normalizedConfig.storageType,
            attempt
          }, 'Storage initialization succeeded after retry');
        }
        return result;
      }

      lastError = result.error;

      if (attempt < maxRetries) {
        // Determine if this is a retryable error
        const isRetryable = this.isRetryableError(result.error || '');

        if (!isRetryable) {
          logger.error({
            storageType: normalizedConfig.storageType,
            error: result.error
          }, 'Non-retryable error encountered, stopping retries');
          break;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
        logger.warn({
          storageType: normalizedConfig.storageType,
          attempt,
          error: result.error,
          nextRetryIn: delay,
          isRetryable
        }, 'Storage initialization failed, retrying');

        // Perform cleanup before retry if needed
        await this.cleanupPartialInitialization(normalizedConfig, result);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    logger.error({
      storageType: normalizedConfig.storageType,
      maxRetries,
      finalError: lastError
    }, 'Storage initialization failed after all retries');

    return {
      success: false,
      error: `Failed after ${maxRetries} attempts. Last error: ${lastError}`,
      metadata: {
        storageType: normalizedConfig.storageType,
        dataDirectory: normalizedConfig.dataDirectory,
        directoriesCreated: lastResult?.metadata.directoriesCreated || [],
        indexFilesCreated: lastResult?.metadata.indexFilesCreated || [],
        operation: 'initialize',
        timestamp: new Date()
      }
    };
  }

  /**
   * Normalize storage configuration paths to handle spaces and special characters
   */
  private static normalizeStorageConfig(config: StorageInitConfig): StorageInitConfig {
    return {
      ...config,
      dataDirectory: path.resolve(config.dataDirectory),
      directories: config.directories.map(dir =>
        path.isAbsolute(dir) ? path.resolve(dir) : dir
      ),
      indexFiles: config.indexFiles.map(indexFile => ({
        ...indexFile,
        path: path.isAbsolute(indexFile.path) ? path.resolve(indexFile.path) : indexFile.path
      }))
    };
  }

  /**
   * Determine if an error is retryable
   */
  private static isRetryableError(error: string): boolean {
    const retryablePatterns = [
      /EBUSY/i,           // Resource busy
      /EMFILE/i,          // Too many open files
      /ENFILE/i,          // File table overflow
      /EAGAIN/i,          // Resource temporarily unavailable
      /ENOTREADY/i,       // Device not ready
      /temporarily/i,     // Temporary failures
      /timeout/i,         // Timeout errors
      /network/i          // Network-related errors
    ];

    const nonRetryablePatterns = [
      /EACCES/i,          // Permission denied
      /EPERM/i,           // Operation not permitted
      /ENOENT/i,          // No such file or directory (unless it's a parent directory issue)
      /ENOSPC/i,          // No space left on device
      /EROFS/i,           // Read-only file system
      /Invalid file path/i, // Path validation errors
      /Path contains dangerous characters/i,
      /Path is outside allowed directories/i
    ];

    // Check for non-retryable errors first
    if (nonRetryablePatterns.some(pattern => pattern.test(error))) {
      return false;
    }

    // Check for retryable errors
    if (retryablePatterns.some(pattern => pattern.test(error))) {
      return true;
    }

    // Default to retryable for unknown errors
    return true;
  }

  /**
   * Clean up partial initialization before retry
   */
  private static async cleanupPartialInitialization(
    config: StorageInitConfig,
    failedResult: StorageInitResult
  ): Promise<void> {
    try {
      // Only clean up if we have partial success (some directories/files created)
      if (failedResult.metadata.directoriesCreated.length === 0 &&
          failedResult.metadata.indexFilesCreated.length === 0) {
        return; // Nothing to clean up
      }

      logger.debug({
        storageType: config.storageType,
        directoriesCreated: failedResult.metadata.directoriesCreated.length,
        indexFilesCreated: failedResult.metadata.indexFilesCreated.length
      }, 'Cleaning up partial initialization before retry');

      // Remove any partially created index files
      for (const indexFile of failedResult.metadata.indexFilesCreated) {
        try {
          if (await FileUtils.fileExists(indexFile)) {
            await FileUtils.deleteFile(indexFile);
            logger.debug({ indexFile }, 'Cleaned up partial index file');
          }
        } catch (error) {
          logger.warn({ err: error, indexFile }, 'Failed to clean up index file');
        }
      }

      // Note: We don't remove directories as they might be needed and removing them
      // could affect other processes. Empty directories are generally harmless.

    } catch (error) {
      logger.warn({
        err: error,
        storageType: config.storageType
      }, 'Failed to clean up partial initialization');
    }
  }
}

/**
 * Helper function for quick storage initialization
 */
export async function initializeStorage(
  storageType: 'project' | 'task' | 'dependency',
  dataDirectory: string,
  withRecovery = true
): Promise<StorageInitResult> {
  const config = StorageInitializer.getStandardConfig(storageType, dataDirectory) as StorageInitConfig;
  
  if (withRecovery) {
    return StorageInitializer.initializeWithRecovery(config);
  } else {
    return StorageInitializer.initialize(config);
  }
}
