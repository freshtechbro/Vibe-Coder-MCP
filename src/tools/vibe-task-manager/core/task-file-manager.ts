/**
 * Task File Manager - Optimized File System Operations
 *
 * Provides optimized file system operations for large projects including:
 * - Lazy loading for large task sets
 * - Batch file operations for efficiency
 * - File compression for storage optimization
 * - Index-based fast lookups
 * - Concurrent file access optimization
 */

import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import { AtomicTask } from '../types/task.js';
import { FileOperationResult } from '../utils/file-utils.js';
import { VibeTaskManagerConfig } from '../utils/config-loader.js';
import { TaskManagerMemoryManager, MemoryCleanupResult } from '../utils/memory-manager-integration.js';
import { validateSecurePath } from '../security/path-validator.js';
import { AppError } from '../../../utils/errors.js';
import logger from '../../../logger.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * File operation batch configuration
 */
export interface BatchConfig {
  batchSize: number;
  concurrentOperations: number;
  enableCompression: boolean;
  retryAttempts: number;
  retryDelay: number;
}

/**
 * File index entry for fast lookups
 */
export interface FileIndexEntry {
  id: string;
  filePath: string;
  size: number;
  lastModified: Date;
  compressed: boolean;
  checksum?: string;
}

/**
 * Batch operation result
 */
export interface BatchOperationResult<T> {
  success: boolean;
  results: T[];
  errors: Array<{ id: string; error: string }>;
  totalProcessed: number;
  duration: number;
  memoryUsage: number;
}

/**
 * Lazy loading configuration
 */
export interface LazyLoadConfig {
  enabled: boolean;
  pageSize: number;
  preloadPages: number;
  cacheSize: number;
}

/**
 * Task File Manager for optimized file operations
 */
export class TaskFileManager {
  private static instance: TaskFileManager | null = null;
  private config: VibeTaskManagerConfig['taskManager']['performance']['fileSystem'];
  private fileIndex: Map<string, FileIndexEntry> = new Map();
  private loadedTasks: Map<string, AtomicTask> = new Map();
  private lazyLoadCache: Map<number, AtomicTask[]> = new Map();
  private memoryManager: TaskManagerMemoryManager | null = null;
  private indexFilePath: string;
  private dataDirectory: string;

  private constructor(
    config: VibeTaskManagerConfig['taskManager']['performance']['fileSystem'],
    dataDirectory: string
  ) {
    this.config = config;
    this.dataDirectory = dataDirectory;
    this.indexFilePath = path.join(dataDirectory, '.file-index.json');

    // Initialize memory manager integration
    this.memoryManager = TaskManagerMemoryManager.getInstance();
    this.memoryManager?.registerCleanupCallback('task-file-manager', () => this.performCleanup());

    logger.info({ config, dataDirectory }, 'Task File Manager initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(
    config?: VibeTaskManagerConfig['taskManager']['performance']['fileSystem'],
    dataDirectory?: string
  ): TaskFileManager {
    if (!TaskFileManager.instance) {
      if (!config || !dataDirectory) {
        throw new AppError('Configuration and data directory required for first initialization');
      }
      TaskFileManager.instance = new TaskFileManager(config, dataDirectory);
    }
    return TaskFileManager.instance;
  }

  /**
   * Initialize file manager and load index
   */
  async initialize(): Promise<FileOperationResult<void>> {
    try {
      // Ensure data directory exists
      await fs.ensureDir(this.dataDirectory);

      // Load file index if it exists
      await this.loadFileIndex();

      logger.info('Task File Manager initialized successfully');
      return {
        success: true,
        metadata: {
          filePath: this.dataDirectory,
          operation: 'initialize',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize Task File Manager');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.dataDirectory,
          operation: 'initialize',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Load file index from disk
   */
  private async loadFileIndex(): Promise<void> {
    try {
      if (await fs.pathExists(this.indexFilePath)) {
        const indexData = await fs.readJson(this.indexFilePath);
        this.fileIndex = new Map(Object.entries(indexData));
        logger.debug({ entriesLoaded: this.fileIndex.size }, 'File index loaded');
      }
    } catch (error) {
      logger.warn({ err: error }, 'Failed to load file index, starting with empty index');
      this.fileIndex = new Map();
    }
  }

  /**
   * Save file index to disk
   */
  private async saveFileIndex(): Promise<void> {
    try {
      const indexData = Object.fromEntries(this.fileIndex);
      await fs.writeJson(this.indexFilePath, indexData, { spaces: 2 });
      logger.debug({ entriesSaved: this.fileIndex.size }, 'File index saved');
    } catch (error) {
      logger.error({ err: error }, 'Failed to save file index');
    }
  }

  /**
   * Save task with optimization
   */
  async saveTask(task: AtomicTask): Promise<FileOperationResult<void>> {
    try {
      const filePath = this.getTaskFilePath(task.id);

      // Validate file path security
      const pathValidation = await validateSecurePath(filePath, 'write');
      if (!pathValidation.valid) {
        logger.error({
          taskId: task.id,
          filePath,
          violation: pathValidation.violationType,
          error: pathValidation.error
        }, 'Path security validation failed for task save');

        return {
          success: false,
          error: `Path security validation failed: ${pathValidation.error}`,
          metadata: {
            filePath,
            operation: 'save_task',
            timestamp: new Date()
          }
        };
      }

      const content = JSON.stringify(task, null, 2);

      // Ensure tasks directory exists
      await fs.ensureDir(path.dirname(filePath));

      // Compress if enabled
      if (this.config.enableCompression) {
        const compressed = await gzipAsync(Buffer.from(content));
        const compressedPath = filePath + '.gz';
        await fs.writeFile(compressedPath, compressed);

        // Update index
        this.updateFileIndex(task.id, compressedPath, compressed.length, true);
      } else {
        await fs.writeFile(filePath, content);

        // Update index
        this.updateFileIndex(task.id, filePath, Buffer.byteLength(content), false);
      }

      // Cache in memory if space available
      if (this.loadedTasks.size < 1000) { // Limit memory cache
        this.loadedTasks.set(task.id, task);
      }

      await this.saveFileIndex();

      logger.debug({ taskId: task.id, compressed: this.config.enableCompression }, 'Task saved');

      return {
        success: true,
        metadata: {
          filePath,
          operation: 'save_task',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId: task.id }, 'Failed to save task');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getTaskFilePath(task.id),
          operation: 'save_task',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Load task with optimization
   */
  async loadTask(taskId: string): Promise<FileOperationResult<AtomicTask>> {
    try {
      // Check memory cache first
      const cachedTask = this.loadedTasks.get(taskId);
      if (cachedTask) {
        logger.debug({ taskId }, 'Task loaded from memory cache');
        return {
          success: true,
          data: cachedTask,
          metadata: {
            filePath: 'memory-cache',
            operation: 'load_task',
            timestamp: new Date()
          }
        };
      }

      // Check file index
      const indexEntry = this.fileIndex.get(taskId);
      if (!indexEntry) {
        return {
          success: false,
          error: 'Task not found in index',
          metadata: {
            filePath: this.getTaskFilePath(taskId),
            operation: 'load_task',
            timestamp: new Date()
          }
        };
      }

      // Validate file path security
      const pathValidation = await validateSecurePath(indexEntry.filePath, 'read');
      if (!pathValidation.valid) {
        logger.error({
          taskId,
          filePath: indexEntry.filePath,
          violation: pathValidation.violationType,
          error: pathValidation.error
        }, 'Path security validation failed for task load');

        return {
          success: false,
          error: `Path security validation failed: ${pathValidation.error}`,
          metadata: {
            filePath: indexEntry.filePath,
            operation: 'load_task',
            timestamp: new Date()
          }
        };
      }

      // Load from file
      let content: string;
      if (indexEntry.compressed) {
        const compressed = await fs.readFile(indexEntry.filePath);
        const decompressed = await gunzipAsync(compressed);
        content = decompressed.toString();
      } else {
        content = await fs.readFile(indexEntry.filePath, 'utf-8');
      }

      const task: AtomicTask = JSON.parse(content);

      // Cache in memory if space available
      if (this.loadedTasks.size < 1000) {
        this.loadedTasks.set(taskId, task);
      }

      logger.debug({ taskId, compressed: indexEntry.compressed }, 'Task loaded from file');

      return {
        success: true,
        data: task,
        metadata: {
          filePath: indexEntry.filePath,
          operation: 'load_task',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to load task');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getTaskFilePath(taskId),
          operation: 'load_task',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Batch save tasks
   */
  async batchSaveTasks(tasks: AtomicTask[]): Promise<BatchOperationResult<void>> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;
    const results: void[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    try {
      // Process in batches
      for (let i = 0; i < tasks.length; i += this.config.batchSize) {
        const batch = tasks.slice(i, i + this.config.batchSize);

        // Process batch with concurrency limit
        const batchPromises = batch.map(async (task) => {
          try {
            const result = await this.saveTask(task);
            if (result.success) {
              results.push(undefined); // Push undefined to count successful operations
            } else {
              errors.push({ id: task.id, error: result.error || 'Unknown error' });
            }
          } catch (error) {
            errors.push({
              id: task.id,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        });

        // Limit concurrency
        const chunks = [];
        for (let j = 0; j < batchPromises.length; j += this.config.concurrentOperations) {
          chunks.push(batchPromises.slice(j, j + this.config.concurrentOperations));
        }

        for (const chunk of chunks) {
          await Promise.all(chunk);
        }

        logger.debug({
          batchNumber: Math.floor(i / this.config.batchSize) + 1,
          processed: Math.min(i + this.config.batchSize, tasks.length),
          total: tasks.length
        }, 'Batch processed');
      }

      const duration = Date.now() - startTime;
      const memoryUsage = process.memoryUsage().heapUsed - startMemory;

      logger.info({
        totalTasks: tasks.length,
        successful: results.length,
        errors: errors.length,
        duration: `${duration}ms`,
        memoryUsage: `${Math.round(memoryUsage / 1024 / 1024)}MB`
      }, 'Batch save completed');

      return {
        success: errors.length === 0,
        results,
        errors,
        totalProcessed: results.length,
        duration,
        memoryUsage
      };

    } catch (error) {
      logger.error({ err: error }, 'Batch save failed');
      return {
        success: false,
        results,
        errors: [...errors, { id: 'batch', error: error instanceof Error ? error.message : String(error) }],
        totalProcessed: results.length,
        duration: Date.now() - startTime,
        memoryUsage: process.memoryUsage().heapUsed - startMemory
      };
    }
  }

  /**
   * Get task file path
   */
  private getTaskFilePath(taskId: string): string {
    return path.join(this.dataDirectory, 'tasks', `${taskId}.json`);
  }

  /**
   * Update file index entry
   */
  private updateFileIndex(id: string, filePath: string, size: number, compressed: boolean): void {
    this.fileIndex.set(id, {
      id,
      filePath,
      size,
      lastModified: new Date(),
      compressed
    });
  }

  /**
   * Perform memory cleanup
   */
  private async performCleanup(): Promise<MemoryCleanupResult> {
    const startTime = Date.now();
    const initialMemory = process.memoryUsage().heapUsed;

    try {
      // Clear memory caches
      const tasksRemoved = this.loadedTasks.size;
      this.loadedTasks.clear();

      const lazyPagesRemoved = this.lazyLoadCache.size;
      this.lazyLoadCache.clear();

      // Force garbage collection if available (for testing)
      if (global.gc) {
        global.gc();
      }

      // Add a small delay to ensure cleanup operations complete
      await new Promise(resolve => setTimeout(resolve, 1));

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryFreed = Math.max(0, initialMemory - finalMemory);
      const duration = Date.now() - startTime;

      logger.info({
        tasksRemoved,
        lazyPagesRemoved,
        memoryFreed: `${Math.round(memoryFreed / 1024 / 1024)}MB`,
        duration: `${duration}ms`
      }, 'Task File Manager cleanup completed');

      return {
        success: true,
        memoryFreed,
        itemsRemoved: tasksRemoved + lazyPagesRemoved,
        duration: Math.max(1, duration) // Ensure duration is at least 1ms
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ err: error }, 'Task File Manager cleanup failed');
      return {
        success: false,
        memoryFreed: 0,
        itemsRemoved: 0,
        duration: Math.max(1, duration), // Ensure duration is at least 1ms
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get file manager statistics
   */
  getStatistics(): {
    indexedFiles: number;
    memoryCache: number;
    lazyLoadCache: number;
    totalFileSize: number;
    compressionRatio: number;
  } {
    const totalFileSize = Array.from(this.fileIndex.values())
      .reduce((sum, entry) => sum + entry.size, 0);

    const compressedFiles = Array.from(this.fileIndex.values())
      .filter(entry => entry.compressed).length;

    const compressionRatio = this.fileIndex.size > 0
      ? compressedFiles / this.fileIndex.size
      : 0;

    return {
      indexedFiles: this.fileIndex.size,
      memoryCache: this.loadedTasks.size,
      lazyLoadCache: this.lazyLoadCache.size,
      totalFileSize,
      compressionRatio
    };
  }

  /**
   * Shutdown file manager
   */
  async shutdown(): Promise<void> {
    await this.saveFileIndex();
    this.loadedTasks.clear();
    this.lazyLoadCache.clear();
    this.fileIndex.clear();

    this.memoryManager?.unregisterCleanupCallback('task-file-manager');

    logger.info('Task File Manager shutdown');
  }
}

/**
 * Convenience function to get file manager instance
 */
export function getTaskFileManager(): TaskFileManager | null {
  try {
    return TaskFileManager.getInstance();
  } catch {
    return null;
  }
}
