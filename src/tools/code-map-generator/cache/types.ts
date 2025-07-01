/**
 * Type definitions for the file-based cache system.
 * This file contains interfaces for cache entries, metadata, and options.
 */

/**
 * Interface for a cache entry with metadata.
 */
export interface CacheEntry<T> {
  /**
   * The key for the cache entry.
   */
  key: string;

  /**
   * The value stored in the cache.
   */
  value: T;

  /**
   * The timestamp when the entry was created or last updated.
   */
  timestamp: number;

  /**
   * The expiration timestamp for the entry.
   */
  expiry: number;

  /**
   * Optional metadata for the entry.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for the cache metadata.
 */
export interface CacheMetadata {
  /**
   * The name of the cache.
   */
  name: string;

  /**
   * The number of entries in the cache.
   */
  size: number;

  /**
   * The timestamp when the cache was created.
   */
  createdAt: number;

  /**
   * The timestamp when the cache was last updated.
   */
  lastUpdated: number;

  /**
   * The keys of all entries in the cache.
   */
  keys: string[];

  /**
   * The maximum number of entries allowed in the cache.
   */
  maxEntries: number;

  /**
   * The maximum age of entries in milliseconds.
   */
  maxAge: number;

  /**
   * The total size of the cache in bytes.
   */
  sizeInBytes: number;
}

/**
 * Interface for cache configuration options.
 */
export interface CacheOptions {
  /**
   * The name of the cache.
   */
  name: string;

  /**
   * The directory where cache files are stored.
   */
  cacheDir: string;

  /**
   * The maximum number of entries allowed in the cache.
   */
  maxEntries?: number;

  /**
   * The maximum age of entries in milliseconds.
   */
  maxAge?: number;

  /**
   * Whether to validate cache entries on get.
   */
  validateOnGet?: boolean;

  /**
   * Whether to prune expired entries on startup.
   */
  pruneOnStartup?: boolean;

  /**
   * The interval in milliseconds for automatic pruning.
   */
  pruneInterval?: number;

  /**
   * A function to serialize cache values to strings.
   */
  serialize?: <T>(value: T) => string;

  /**
   * A function to deserialize strings to cache values.
   */
  deserialize?: <T>(serialized: string) => T;
}

/**
 * Interface for memory cache statistics.
 */
export interface MemoryCacheStats {
  /**
   * The number of hits (successful gets).
   */
  hits: number;

  /**
   * The number of entries in the cache.
   */
  size: number;

  /**
   * The total size of all entries in the cache.
   */
  totalSize: number;
}

/**
 * Interface for cache statistics.
 */
export interface CacheStats {
  /**
   * The name of the cache.
   */
  name: string;

  /**
   * The number of entries in the cache.
   */
  size: number;

  /**
   * The number of hits (successful gets).
   */
  hits: number;

  /**
   * The number of misses (unsuccessful gets).
   */
  misses: number;

  /**
   * The hit ratio (hits / (hits + misses)).
   */
  hitRatio: number;

  /**
   * The timestamp when the cache was created.
   */
  createdAt: number;

  /**
   * The timestamp when the cache was last updated.
   */
  lastUpdated: number;

  /**
   * The size of the cache in bytes.
   */
  sizeInBytes: number;

  /**
   * The total size of all entries in the cache.
   */
  totalSize?: number;

  /**
   * Memory cache statistics (if memory caching is enabled).
   */
  memoryStats?: MemoryCacheStats;
}

/**
 * Interface for memory statistics.
 */
export interface MemoryStats {
  /**
   * Formatted memory statistics for human readability.
   */
  formatted: {
    /**
     * Total system memory.
     */
    totalSystemMemory: string;

    /**
     * Free system memory.
     */
    freeSystemMemory: string;

    /**
     * Used system memory.
     */
    usedSystemMemory: string;

    /**
     * Memory usage percentage.
     */
    memoryUsagePercentage: string;

    /**
     * Memory status (normal, high, critical).
     */
    memoryStatus: 'normal' | 'high' | 'critical';

    /**
     * Process memory statistics.
     */
    process: {
      /**
       * Resident set size.
       */
      rss: string;

      /**
       * Total heap size.
       */
      heapTotal: string;

      /**
       * Used heap size.
       */
      heapUsed: string;

      /**
       * External memory.
       */
      external: string;

      /**
       * Array buffers memory.
       */
      arrayBuffers: string;
    };

    /**
     * V8 memory statistics.
     */
    v8: {
      /**
       * Heap size limit.
       */
      heapSizeLimit: string;

      /**
       * Total heap size.
       */
      totalHeapSize: string;

      /**
       * Used heap size.
       */
      usedHeapSize: string;

      /**
       * Heap size executable.
       */
      heapSizeExecutable: string;

      /**
       * Malloced memory.
       */
      mallocedMemory: string;

      /**
       * Peak malloced memory.
       */
      peakMallocedMemory: string;
    };

    /**
     * Cache statistics.
     */
    cache: {
      /**
       * Total cache size.
       */
      totalSize: string;

      /**
       * Number of caches.
       */
      cacheCount: number;
    };

    /**
     * Memory usage thresholds.
     */
    thresholds: {
      /**
       * High memory threshold.
       */
      highMemoryThreshold: string;

      /**
       * Critical memory threshold.
       */
      criticalMemoryThreshold: string;
    };
  };

  /**
   * Raw memory statistics.
   */
  raw: {
    /**
     * Total system memory in bytes.
     */
    totalSystemMemory: number;

    /**
     * Free system memory in bytes.
     */
    freeSystemMemory: number;

    /**
     * Memory usage percentage (0-1).
     */
    memoryUsagePercentage: number;

    /**
     * Process memory statistics.
     */
    processMemory: NodeJS.MemoryUsage;

    /**
     * V8 heap statistics.
     */
    heapStats: unknown;

    /**
     * V8 heap space statistics.
     */
    heapSpaceStats: unknown;
  };

  /**
   * Cache statistics.
   */
  cacheStats: CacheStats[];

  /**
   * Grammar statistics.
   */
  grammarStats: unknown;

  /**
   * Timestamp when the statistics were collected.
   */
  timestamp: number;
}
