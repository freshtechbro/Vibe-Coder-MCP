/**
 * File Content Manager for the Code-Map Generator tool.
 * This file contains the FileContentManager class for efficient file-based source code access.
 */

import crypto from 'crypto';
import path from 'path';
import logger from '../../../logger.js';
import { readFileSecure, statSecure } from '../fsUtils.js';
import { FileCache } from './fileCache.js';
import { LRUCache } from './lruCache.js';

/**
 * Interface for file metadata.
 */
export interface FileMetadata {
  /**
   * The file path.
   */
  path: string;

  /**
   * The MD5 hash of the file content.
   */
  hash: string;

  /**
   * The file size in bytes.
   */
  size: number;

  /**
   * The file modification time in milliseconds.
   */
  mtime: number;

  /**
   * The timestamp when the file was last accessed.
   */
  lastAccessed: number;
}

/**
 * Options for the FileContentManager.
 */
export interface FileContentManagerOptions {
  /**
   * Maximum number of files to cache in memory.
   * Default: 100
   */
  maxCachedFiles?: number;

  /**
   * Maximum age of cached files in milliseconds.
   * Default: 5 minutes
   */
  maxAge?: number;

  /**
   * Directory for file metadata cache.
   */
  cacheDir?: string;

  /**
   * Whether to use file-based metadata cache.
   * Default: true
   */
  useFileCache?: boolean;
}

/**
 * Manages file content access with efficient caching.
 * Stores file paths and metadata instead of full content in memory.
 */
export class FileContentManager {
  private fileMetadataCache: Map<string, FileMetadata> = new Map();
  private contentCache: LRUCache<string, string>;
  private fileCache: FileCache<FileMetadata> | null = null;
  private initialized: boolean = false;

  /**
   * Creates a new FileContentManager instance.
   * @param options The manager options
   */
  constructor(options: FileContentManagerOptions = {}) {
    // Initialize LRU cache for frequently accessed files
    // If maxCachedFiles is 0, disable in-memory caching
    const maxEntries = options.maxCachedFiles !== undefined ? options.maxCachedFiles : 100;
    this.contentCache = new LRUCache<string, string>({
      name: 'file-content-cache',
      maxEntries: maxEntries,
      maxAge: options.maxAge || 5 * 60 * 1000, // 5 minutes
      sizeCalculator: (content) => content.length, // Use string length as size
      maxSize: maxEntries > 0 ? 50 * 1024 * 1024 : 0, // 50 MB if enabled, 0 if disabled
    });

    // Initialize file-based metadata cache if cacheDir is provided
    if (options.cacheDir && options.useFileCache !== false) {
      this.fileCache = new FileCache<FileMetadata>({
        name: 'file-metadata',
        cacheDir: path.join(options.cacheDir, 'file-metadata'),
        maxEntries: 100000,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
    }

    logger.info(`FileContentManager created (in-memory caching ${maxEntries > 0 ? 'enabled' : 'disabled'})`);
  }

  /**
   * Initializes the file content manager.
   * @returns A promise that resolves when initialization is complete
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.fileCache) {
      try {
        await this.fileCache.init();
        logger.info('File metadata cache initialized');
      } catch (error) {
        logger.warn({ err: error }, 'Failed to initialize file metadata cache, continuing without it');
        this.fileCache = null;
      }
    }

    this.initialized = true;
  }

  /**
   * Gets the content of a file.
   * @param filePath The file path
   * @param allowedDir The allowed directory boundary
   * @returns A promise that resolves to the file content
   */
  async getContent(filePath: string, allowedDir: string): Promise<string> {
    // Ensure initialization
    if (!this.initialized) {
      await this.init();
    }

    const cacheKey = this.getCacheKey(filePath);

    // Only check in-memory cache if it's enabled (maxEntries > 0)
    if (this.contentCache.getMaxEntries() > 0) {
      // Check LRU cache first
      if (this.contentCache.has(cacheKey)) {
        const content = this.contentCache.get(cacheKey);
        if (content !== undefined) {
          logger.debug(`Using in-memory cached content for ${filePath}`);
          return content;
        }
      }
    }

    // Read from file
    try {
      const content = await readFileSecure(filePath, allowedDir);

      // Update metadata
      await this.updateMetadata(filePath, content, allowedDir);

      // Cache content for frequently accessed files only if in-memory caching is enabled
      if (this.contentCache.getMaxEntries() > 0) {
        this.contentCache.set(cacheKey, content);
      }

      return content;
    } catch (error) {
      logger.error({ err: error, filePath }, `Error reading file: ${filePath}`);
      throw error;
    }
  }

  /**
   * Gets the metadata for a file.
   * @param filePath The file path
   * @returns A promise that resolves to the file metadata, or undefined if not found
   */
  async getMetadata(filePath: string): Promise<FileMetadata | undefined> {
    // Ensure initialization
    if (!this.initialized) {
      await this.init();
    }

    const cacheKey = this.getCacheKey(filePath);

    // Check in-memory cache first
    const memoryMetadata = this.fileMetadataCache.get(filePath);
    if (memoryMetadata) {
      return memoryMetadata;
    }

    // Check file cache if available
    if (this.fileCache) {
      try {
        const fileMetadata = await this.fileCache.get(cacheKey);
        if (fileMetadata) {
          // Update in-memory cache
          this.fileMetadataCache.set(filePath, fileMetadata);
          return fileMetadata;
        }
      } catch (error) {
        logger.debug(`Error getting metadata from file cache: ${error}`);
      }
    }

    return undefined;
  }

  /**
   * Updates the metadata for a file.
   * @param filePath The file path
   * @param content The file content
   * @param allowedDir The allowed directory boundary
   * @returns A promise that resolves to the updated metadata
   */
  async updateMetadata(filePath: string, content: string, allowedDir: string): Promise<FileMetadata> {
    try {
      // Calculate hash
      const hash = crypto.createHash('md5').update(content).digest('hex');

      // Get file stats
      const stats = await statSecure(filePath, allowedDir);

      // Create metadata
      const metadata: FileMetadata = {
        path: filePath,
        hash,
        size: stats.size,
        mtime: stats.mtime.getTime(),
        lastAccessed: Date.now()
      };

      // Update in-memory cache
      this.fileMetadataCache.set(filePath, metadata);

      // Update file cache if available
      if (this.fileCache) {
        const cacheKey = this.getCacheKey(filePath);
        await this.fileCache.set(cacheKey, metadata);
      }

      return metadata;
    } catch (error) {
      logger.error({ err: error, filePath }, `Error updating metadata for ${filePath}`);
      throw error;
    }
  }

  /**
   * Checks if a file has changed since the last check.
   * @param filePath The file path
   * @param allowedDir The allowed directory boundary
   * @returns A promise that resolves to true if the file has changed, false otherwise
   */
  async hasFileChanged(filePath: string, allowedDir: string): Promise<boolean> {
    try {
      // Get file stats
      const stats = await statSecure(filePath, allowedDir);

      // Get cached metadata
      const metadata = await this.getMetadata(filePath);

      // If no cached metadata, file has changed
      if (!metadata) {
        return true;
      }

      // Quick check: compare size and mtime
      if (metadata.size !== stats.size || metadata.mtime !== stats.mtime.getTime()) {
        return true;
      }

      // If size and mtime match, file hasn't changed
      return false;
    } catch (error) {
      // If error (e.g., file not found), consider it changed
      logger.warn(`Error checking if file ${filePath} has changed: ${error}`);
      return true;
    }
  }

  /**
   * Gets the cache key for a file path.
   * @param filePath The file path
   * @returns The cache key
   */
  private getCacheKey(filePath: string): string {
    return crypto.createHash('md5').update(filePath).digest('hex');
  }

  /**
   * Clears the in-memory caches.
   */
  clearCache(): void {
    this.contentCache.clear();
    this.fileMetadataCache.clear();
    logger.debug('Cleared in-memory file caches');
  }

  /**
   * Closes the file content manager and releases resources.
   */
  close(): void {
    this.clearCache();
    if (this.fileCache) {
      this.fileCache.close();
    }
    logger.debug('FileContentManager closed');
  }
}
