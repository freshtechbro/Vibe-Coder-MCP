/**
 * Tiered cache implementation for the Code-Map Generator tool.
 * This file contains the TieredCache class that combines memory and file-based caching.
 */

import logger from '../../../logger.js';
import { FileCache } from './fileCache.js';
import { MemoryCache } from './memoryCache.js';
import { CacheOptions, CacheStats } from './types.js';
import { getMemoryStats } from '../parser.js';

/**
 * Options for the TieredCache.
 */
export interface TieredCacheOptions extends CacheOptions {
  /**
   * Whether to use memory caching.
   * Default: true
   */
  useMemoryCache?: boolean;

  /**
   * Maximum number of entries to keep in the memory cache.
   * Default: 1000
   */
  memoryMaxEntries?: number;

  /**
   * Maximum age of memory cache entries in milliseconds.
   * Default: 10 minutes
   */
  memoryMaxAge?: number;

  /**
   * Memory usage threshold (percentage) at which to disable memory caching.
   * Default: 0.8 (80%)
   */
  memoryThreshold?: number;

  /**
   * Function to calculate the size of a value in the memory cache.
   */
  memorySizeCalculator?: (value: unknown) => number;
}

/**
 * A tiered cache implementation that combines memory and file-based caching.
 */
export class TieredCache<T> {
  private name: string;
  private fileCache: FileCache<T>;
  private memoryCache: MemoryCache<string, T> | null = null;
  private options: Required<TieredCacheOptions>;
  private stats: {
    memoryHits: number;
    fileHits: number;
    misses: number;
    totalGets: number;
    totalSets: number;
  } = {
    memoryHits: 0,
    fileHits: 0,
    misses: 0,
    totalGets: 0,
    totalSets: 0
  };

  /**
   * Default options for the TieredCache.
   */
  private static readonly DEFAULT_OPTIONS: Omit<Required<TieredCacheOptions>, 'name' | 'cacheDir'> = {
    maxEntries: 10000,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    validateOnGet: true,
    pruneOnStartup: true,
    pruneInterval: 60 * 60 * 1000, // 1 hour
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    useMemoryCache: true,
    memoryMaxEntries: 1000,
    memoryMaxAge: 10 * 60 * 1000, // 10 minutes
    memoryThreshold: 0.8,
    memorySizeCalculator: (value) => JSON.stringify(value).length
  };

  /**
   * Creates a new TieredCache instance.
   * @param options The cache options
   */
  constructor(options: TieredCacheOptions) {
    this.name = options.name;

    // Apply default options
    this.options = {
      ...TieredCache.DEFAULT_OPTIONS,
      name: options.name,
      cacheDir: options.cacheDir,
      maxEntries: options.maxEntries ?? TieredCache.DEFAULT_OPTIONS.maxEntries,
      maxAge: options.maxAge ?? TieredCache.DEFAULT_OPTIONS.maxAge,
      validateOnGet: options.validateOnGet ?? TieredCache.DEFAULT_OPTIONS.validateOnGet,
      pruneOnStartup: options.pruneOnStartup ?? TieredCache.DEFAULT_OPTIONS.pruneOnStartup,
      pruneInterval: options.pruneInterval ?? TieredCache.DEFAULT_OPTIONS.pruneInterval,
      serialize: options.serialize ?? TieredCache.DEFAULT_OPTIONS.serialize,
      deserialize: options.deserialize ?? TieredCache.DEFAULT_OPTIONS.deserialize,
      useMemoryCache: options.useMemoryCache ?? TieredCache.DEFAULT_OPTIONS.useMemoryCache,
      memoryMaxEntries: options.memoryMaxEntries ?? TieredCache.DEFAULT_OPTIONS.memoryMaxEntries,
      memoryMaxAge: options.memoryMaxAge ?? TieredCache.DEFAULT_OPTIONS.memoryMaxAge,
      memoryThreshold: options.memoryThreshold ?? TieredCache.DEFAULT_OPTIONS.memoryThreshold,
      memorySizeCalculator: options.memorySizeCalculator ?? TieredCache.DEFAULT_OPTIONS.memorySizeCalculator
    };

    // Create file cache
    this.fileCache = new FileCache<T>({
      name: `${this.name}-file`,
      cacheDir: this.options.cacheDir,
      maxEntries: this.options.maxEntries,
      maxAge: this.options.maxAge,
      validateOnGet: this.options.validateOnGet,
      pruneOnStartup: this.options.pruneOnStartup,
      pruneInterval: this.options.pruneInterval,
      serialize: this.options.serialize,
      deserialize: this.options.deserialize
    });

    // Create memory cache if enabled
    if (this.options.useMemoryCache) {
      this.initializeMemoryCache();
    }

    logger.debug(`Created tiered cache "${this.name}" with memory caching ${this.options.useMemoryCache ? 'enabled' : 'disabled'}`);
  }

  /**
   * Initializes the memory cache.
   */
  private initializeMemoryCache(): void {
    // Check if memory usage is below threshold
    if (this.shouldUseMemoryCache()) {
      this.memoryCache = new MemoryCache<string, T>({
        name: `${this.name}-memory`,
        maxEntries: this.options.memoryMaxEntries,
        maxAge: this.options.memoryMaxAge,
        sizeCalculator: this.options.memorySizeCalculator
      });
      logger.debug(`Initialized memory cache for "${this.name}"`);
    } else {
      this.memoryCache = null;
      logger.debug(`Memory cache disabled for "${this.name}" due to high memory usage`);
    }
  }

  /**
   * Checks if memory caching should be used based on current memory usage.
   * @returns True if memory caching should be used, false otherwise
   */
  private shouldUseMemoryCache(): boolean {
    if (!this.options.useMemoryCache) {
      return false;
    }

    const stats = getMemoryStats();
    const memoryUsage = stats.memoryUsagePercentage;

    return memoryUsage < this.options.memoryThreshold;
  }

  /**
   * Initializes the cache.
   * @returns A promise that resolves when the cache is initialized
   */
  public async init(): Promise<void> {
    await this.fileCache.init();
    logger.debug(`Initialized tiered cache "${this.name}"`);
  }

  /**
   * Gets a value from the cache.
   * @param key The cache key
   * @returns A promise that resolves to the cached value, or undefined if not found
   */
  public async get(key: string): Promise<T | undefined> {
    this.stats.totalGets++;

    // Check memory cache first if available
    if (this.memoryCache) {
      const memoryValue = this.memoryCache.get(key);
      if (memoryValue !== undefined) {
        this.stats.memoryHits++;
        return memoryValue;
      }
    }

    // Try file cache
    try {
      const fileValue = await this.fileCache.get(key);
      if (fileValue !== undefined) {
        this.stats.fileHits++;

        // Update memory cache for faster access next time
        if (this.memoryCache) {
          this.memoryCache.set(key, fileValue);
        }

        return fileValue;
      }
    } catch (error) {
      logger.warn({ err: error, key }, `Error getting value from file cache for ${key}`);
    }

    this.stats.misses++;
    return undefined;
  }

  /**
   * Sets a value in the cache.
   * @param key The cache key
   * @param value The value to cache
   * @param ttl Optional TTL in milliseconds (overrides the default maxAge)
   * @returns A promise that resolves when the value is cached
   */
  public async set(key: string, value: T, ttl?: number): Promise<void> {
    this.stats.totalSets++;

    // Set in memory cache first if available
    if (this.memoryCache) {
      this.memoryCache.set(key, value, ttl);
    }

    // Set in file cache
    try {
      await this.fileCache.set(key, value, ttl);
    } catch (error) {
      logger.warn({ err: error, key }, `Error setting value in file cache for ${key}`);
    }
  }

  /**
   * Deletes a value from the cache.
   * @param key The cache key
   * @returns A promise that resolves when the value is deleted
   */
  public async delete(key: string): Promise<void> {
    // Delete from memory cache if available
    if (this.memoryCache) {
      this.memoryCache.delete(key);
    }

    // Delete from file cache
    try {
      await this.fileCache.delete(key);
    } catch (error) {
      logger.warn({ err: error, key }, `Error deleting value from file cache for ${key}`);
    }
  }

  /**
   * Checks if a key exists in the cache.
   * @param key The cache key
   * @returns A promise that resolves to true if the key exists, false otherwise
   */
  public async has(key: string): Promise<boolean> {
    // Check memory cache first if available
    if (this.memoryCache && this.memoryCache.has(key)) {
      return true;
    }

    // Check file cache
    try {
      return await this.fileCache.has(key);
    } catch (error) {
      logger.warn({ err: error, key }, `Error checking if key exists in file cache for ${key}`);
      return false;
    }
  }

  /**
   * Clears the entire cache.
   * @returns A promise that resolves when the cache is cleared
   */
  public async clear(): Promise<void> {
    // Clear memory cache if available
    if (this.memoryCache) {
      this.memoryCache.clear();
    }

    // Clear file cache
    try {
      await this.fileCache.clear();
    } catch (error) {
      logger.warn({ err: error }, `Error clearing file cache for ${this.name}`);
    }

    // Reset stats
    this.stats = {
      memoryHits: 0,
      fileHits: 0,
      misses: 0,
      totalGets: 0,
      totalSets: 0
    };

    logger.debug(`Cleared tiered cache "${this.name}"`);
  }

  /**
   * Prunes expired entries from the cache.
   * @returns A promise that resolves to the number of entries pruned
   */
  public async prune(): Promise<number> {
    let prunedCount = 0;

    // Memory cache is pruned automatically when needed

    // Prune file cache
    try {
      prunedCount += await this.fileCache.prune();
    } catch (error) {
      logger.warn({ err: error }, `Error pruning file cache for ${this.name}`);
    }

    logger.debug(`Pruned ${prunedCount} entries from tiered cache "${this.name}"`);
    return prunedCount;
  }

  /**
   * Gets statistics for the cache.
   * @returns The cache statistics
   */
  public async getStats(): Promise<CacheStats> {
    const fileStats = await this.fileCache.getStats();

    return {
      ...fileStats,
      name: this.name,
      hits: this.stats.memoryHits + this.stats.fileHits,
      misses: this.stats.misses,
      hitRatio: this.stats.totalGets > 0
        ? (this.stats.memoryHits + this.stats.fileHits) / this.stats.totalGets
        : 0,
      totalSize: fileStats.totalSize,
      memoryStats: this.memoryCache
        ? {
            hits: this.stats.memoryHits,
            size: this.memoryCache.getSize(),
            totalSize: this.memoryCache.getTotalSize()
          }
        : undefined
    };
  }

  /**
   * Closes the cache.
   */
  public close(): void {
    // Close file cache
    this.fileCache.close();

    // Clear memory cache if available
    if (this.memoryCache) {
      this.memoryCache.clear();
      this.memoryCache = null;
    }

    logger.debug(`Closed tiered cache "${this.name}"`);
  }
}
