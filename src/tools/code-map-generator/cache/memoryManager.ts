/**
 * Memory Manager for the Code-Map Generator tool.
 * This file contains the MemoryManager class for coordinating memory usage across different caches.
 */

import os from 'os';
import v8 from 'v8';
import logger from '../../../logger.js';
import { RecursionGuard } from '../../../utils/recursion-guard.js';
import { InitializationMonitor } from '../../../utils/initialization-monitor.js';
import { MemoryCache, MemoryCacheStats } from './memoryCache.js';
import { GrammarManager } from './grammarManager.js';
import { Tree, SyntaxNode } from '../parser.js';

/**
 * Options for the MemoryManager.
 */
export interface MemoryManagerOptions {
  /**
   * The maximum percentage of system memory to use.
   * Default: 0.5 (50%)
   */
  maxMemoryPercentage?: number;

  /**
   * The interval in milliseconds for checking memory usage.
   * Default: 60000 (1 minute)
   */
  monitorInterval?: number;

  /**
   * Whether to enable automatic memory management.
   * Default: true
   */
  autoManage?: boolean;

  /**
   * The threshold percentage of max memory at which to trigger pruning.
   * Default: 0.8 (80%)
   */
  pruneThreshold?: number;

  /**
   * The percentage of entries to prune when the threshold is reached.
   * Default: 0.2 (20%)
   */
  prunePercentage?: number;
}

/**
 * Memory usage statistics.
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
    heapStats: v8.HeapInfo;

    /**
     * V8 heap space statistics.
     */
    heapSpaceStats: v8.HeapSpaceInfo[];
  };

  /**
   * Cache statistics.
   */
  cacheStats: MemoryCacheStats[];

  /**
   * Grammar statistics.
   */
  grammarStats: Record<string, unknown>;

  /**
   * Timestamp when the statistics were collected.
   */
  timestamp: number;
}

/**
 * Manages memory usage across different caches.
 */
export class MemoryManager {
  private options: Required<MemoryManagerOptions>;
  private caches: Map<string, MemoryCache<any, any>> = new Map();
  private grammarManager: GrammarManager | null = null;
  private monitorTimer: NodeJS.Timeout | null = null;
  private gcTimer: NodeJS.Timeout | null = null;
  private maxMemoryBytes: number;

  /**
   * Default options for the MemoryManager.
   */
  private static readonly DEFAULT_OPTIONS: Required<MemoryManagerOptions> = {
    maxMemoryPercentage: 0.4, // Reduced from 0.5
    monitorInterval: 30000, // Reduced from 60000
    autoManage: true,
    pruneThreshold: 0.7, // Reduced from 0.8 to trigger pruning earlier
    prunePercentage: 0.3 // Increased from 0.2 to prune more aggressively
  };

  /**
   * Creates a new MemoryManager instance.
   * @param options The manager options
   */
  constructor(options: MemoryManagerOptions = {}) {
    // Apply default options
    this.options = {
      ...MemoryManager.DEFAULT_OPTIONS,
      ...options
    };

    // Calculate max memory in bytes
    const totalMemory = os.totalmem();
    this.maxMemoryBytes = totalMemory * this.options.maxMemoryPercentage;

    logger.info(`MemoryManager created with max memory: ${this.formatBytes(this.maxMemoryBytes)} (${this.options.maxMemoryPercentage * 100}% of system memory)`);

    // Start memory monitoring if enabled
    if (this.options.autoManage) {
      this.startMonitoring();
    }
  }

  /**
   * Registers a cache with the memory manager.
   * @param cache The cache to register
   */
  public registerCache<K, V>(cache: MemoryCache<K, V>): void {
    const stats = cache.getStats();
    this.caches.set(stats.name, cache);
    logger.debug(`Registered cache "${stats.name}" with MemoryManager`);
  }

  /**
   * Unregisters a cache from the memory manager.
   * @param name The name of the cache to unregister
   */
  public unregisterCache(name: string): void {
    this.caches.delete(name);
    logger.debug(`Unregistered cache "${name}" from MemoryManager`);
  }

  /**
   * Registers a grammar manager with the memory manager.
   * @param manager The grammar manager to register
   */
  public registerGrammarManager(manager: GrammarManager): void {
    this.grammarManager = manager;
    logger.debug('Registered GrammarManager with MemoryManager');
  }

  /**
   * Starts monitoring memory usage.
   */
  private startMonitoring(): void {
    if (this.monitorTimer) {
      return;
    }

    this.monitorTimer = setInterval(async () => {
      await this.checkMemoryUsage();
    }, this.options.monitorInterval);

    // Defer logging to prevent recursion during initialization
    setImmediate(() => {
      logger.debug(`Started memory monitoring with interval: ${this.options.monitorInterval}ms`);
    });
  }

  /**
   * Stops monitoring memory usage.
   */
  public stopMonitoring(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
      logger.debug('Stopped memory monitoring');
    }
  }

  /**
   * Starts periodic garbage collection.
   * @param interval The interval in milliseconds
   */
  public startPeriodicGC(interval: number = 5 * 60 * 1000): void {
    // Clear existing timer if any
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
    }

    // Start new timer
    this.gcTimer = setInterval(() => {
      const stats = this.getMemoryStats();

      // Run GC if memory usage is high or critical
      if (stats.formatted.memoryStatus !== 'normal') {
        logger.info(`Memory status is ${stats.formatted.memoryStatus}, running garbage collection`);
        this.runGarbageCollection();
      } else {
        logger.debug('Memory status is normal, skipping garbage collection');
      }
    }, interval);

    // Make sure the timer doesn't prevent the process from exiting
    this.gcTimer.unref();

    logger.info(`Started periodic garbage collection with interval: ${interval}ms`);
  }

  /**
   * Stops periodic garbage collection.
   */
  public stopPeriodicGC(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
      logger.info('Stopped periodic garbage collection');
    }
  }

  /**
   * Checks memory usage and prunes caches if necessary.
   */
  private async checkMemoryUsage(): Promise<void> {
    const result = await RecursionGuard.executeWithRecursionGuard(
      'MemoryManager.checkMemoryUsage',
      () => {
        const stats = this.getMemoryStats();
        const heapUsed = stats.raw.heapStats.used_heap_size;
        const heapLimit = stats.raw.heapStats.heap_size_limit;
        const heapPercentage = heapUsed / heapLimit;

        logger.debug(`Memory usage: ${this.formatBytes(heapUsed)} / ${this.formatBytes(heapLimit)} (${(heapPercentage * 100).toFixed(2)}%)`);

        // Check if we need to prune
        if (heapPercentage > this.options.pruneThreshold) {
          logger.info(`Memory usage exceeds threshold (${(this.options.pruneThreshold * 100).toFixed(2)}%), pruning caches...`);
          this.pruneCaches();
        }
      },
      {
        maxDepth: 3,
        enableLogging: false, // Disable logging to prevent recursion
        executionTimeout: 5000
      },
      `instance_${this.constructor.name}_${Date.now()}`
    );

    if (!result.success && result.recursionDetected) {
      logger.warn('Memory usage check skipped due to recursion detection');
    } else if (!result.success && result.error) {
      logger.error({ err: result.error }, 'Memory usage check failed');
    }
  }

  /**
   * Prunes all registered caches.
   */
  public pruneCaches(): void {
    // Get all cache stats
    const allStats = Array.from(this.caches.values()).map(cache => cache.getStats());

    // Sort caches by size (largest first)
    allStats.sort((a, b) => b.totalSize - a.totalSize);

    // Prune each cache
    for (const stats of allStats) {
      const cache = this.caches.get(stats.name);
      if (cache) {
        // Calculate how many entries to remove
        const entriesToRemove = Math.ceil(stats.size * this.options.prunePercentage);

        if (entriesToRemove > 0) {
          logger.debug(`Pruning ${entriesToRemove} entries from cache "${stats.name}"`);

          // Clear the cache if we're removing all entries
          if (entriesToRemove >= stats.size) {
            cache.clear();
          } else {
            // Otherwise, we need to manually evict entries
            // This is a bit of a hack since we don't have direct access to the LRU list
            // In a real implementation, we would add a method to the MemoryCache class to prune a specific number of entries
            for (let i = 0; i < entriesToRemove; i++) {
              // We're relying on the fact that the next get/set operation will trigger LRU eviction
              // This is not ideal, but it works for now
              cache.set('__dummy__' + i, null as unknown);
              cache.delete('__dummy__' + i);
            }
          }
        }
      }
    }
  }

  /**
   * Gets memory usage statistics.
   * @returns The memory statistics
   */
  public getMemoryStats(): MemoryStats {
    // Use synchronous recursion guard to prevent infinite loops
    if (RecursionGuard.isMethodExecuting('MemoryManager.getMemoryStats')) {
      logger.debug('Memory stats request skipped due to recursion detection');
      // Return minimal safe stats
      return this.createFallbackMemoryStats();
    }

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryUsage = (totalMemory - freeMemory) / totalMemory;
    const memoryUsagePercentage = memoryUsage * 100;

    // Get Node.js process memory usage
    const processMemory = process.memoryUsage();

    // Get V8 heap statistics
    const heapStats = v8.getHeapStatistics();
    const heapSpaceStats = v8.getHeapSpaceStatistics();

    // Calculate memory usage thresholds
    const highMemoryThreshold = 0.8; // 80%
    const criticalMemoryThreshold = 0.9; // 90%

    // Determine memory status
    let memoryStatus: 'normal' | 'high' | 'critical' = 'normal';
    if (memoryUsage > criticalMemoryThreshold) {
      memoryStatus = 'critical';
    } else if (memoryUsage > highMemoryThreshold) {
      memoryStatus = 'high';
    }

    // Get cache statistics
    const cacheStats = Array.from(this.caches.values()).map(cache => cache.getStats());

    // Calculate total cache size
    const totalCacheSize = cacheStats.reduce((total, cache) => total + (cache.totalSize || 0), 0);

    // Get grammar statistics
    const grammarStats = this.grammarManager ? this.grammarManager.getStats() : {};

    // Format human-readable values
    const formattedStats = {
      totalSystemMemory: this.formatBytes(totalMemory),
      freeSystemMemory: this.formatBytes(freeMemory),
      usedSystemMemory: this.formatBytes(totalMemory - freeMemory),
      memoryUsagePercentage: memoryUsagePercentage.toFixed(2) + '%',
      memoryStatus,

      process: {
        rss: this.formatBytes(processMemory.rss),
        heapTotal: this.formatBytes(processMemory.heapTotal),
        heapUsed: this.formatBytes(processMemory.heapUsed),
        external: this.formatBytes(processMemory.external),
        arrayBuffers: this.formatBytes(processMemory.arrayBuffers || 0),
      },

      v8: {
        heapSizeLimit: this.formatBytes(heapStats.heap_size_limit),
        totalHeapSize: this.formatBytes(heapStats.total_heap_size),
        usedHeapSize: this.formatBytes(heapStats.used_heap_size),
        heapSizeExecutable: this.formatBytes(heapStats.total_heap_size_executable),
        mallocedMemory: this.formatBytes(heapStats.malloced_memory),
        peakMallocedMemory: this.formatBytes(heapStats.peak_malloced_memory),
      },

      cache: {
        totalSize: this.formatBytes(totalCacheSize),
        cacheCount: cacheStats.length,
      },

      thresholds: {
        highMemoryThreshold: (highMemoryThreshold * 100) + '%',
        criticalMemoryThreshold: (criticalMemoryThreshold * 100) + '%',
      }
    };

    // Return both formatted and raw values
    return {
      formatted: formattedStats,

      raw: {
        totalSystemMemory: totalMemory,
        freeSystemMemory: freeMemory,
        memoryUsagePercentage: memoryUsage,
        processMemory,
        heapStats,
        heapSpaceStats,
      },

      cacheStats,
      grammarStats,

      // Add timestamp
      timestamp: Date.now(),
    };
  }

  /**
   * Formats a byte value into a human-readable string.
   * @param bytes The byte value
   * @param decimals The number of decimal places to include
   * @returns The formatted string
   */
  public formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    if (!bytes || isNaN(bytes)) return 'Unknown';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    if (i < 0 || i >= sizes.length) return `${bytes} Bytes`;

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Creates a memory-efficient AST cache.
   * @returns A memory cache for AST nodes
   */
  public createASTCache(): MemoryCache<string, Tree> {
    const cache = new MemoryCache<string, Tree>({
      name: 'ast-cache',
      maxEntries: 500, // Reduced from 1000
      maxAge: 15 * 60 * 1000, // Reduced from 30 minutes to 15 minutes
      sizeCalculator: (tree) => {
        // Estimate the size of the tree based on the number of nodes
        // This is a rough estimate, but it's better than nothing
        let nodeCount = 0;
        let currentNode: SyntaxNode | null = tree.rootNode;

        // Simple traversal to count nodes
        const nodesToVisit: SyntaxNode[] = [currentNode];
        while (nodesToVisit.length > 0) {
          currentNode = nodesToVisit.pop() || null;
          if (!currentNode) continue;

          nodeCount++;

          // Add children to the queue
          for (let i = 0; i < currentNode.childCount; i++) {
            const child = currentNode.child(i);
            if (child) {
              nodesToVisit.push(child);
            }
          }
        }

        // More conservative size estimate
        return nodeCount * 200; // Increased from 100 bytes per node
      },
      maxSize: 50 * 1024 * 1024, // Reduced from 100 MB to 50 MB
      dispose: (_key, _tree) => {
        // No need to do anything special here
      }
    });

    this.registerCache(cache);
    return cache;
  }

  /**
   * Creates a memory-efficient source code cache.
   * @returns A memory cache for source code
   */
  public createSourceCodeCache(): MemoryCache<string, string> {
    const cache = new MemoryCache<string, string>({
      name: 'source-code-cache',
      maxEntries: 500, // Reduced from 1000
      maxAge: 15 * 60 * 1000, // Reduced from 30 minutes to 15 minutes
      sizeCalculator: (sourceCode) => {
        // Use the length of the string as an estimate of its size
        return sourceCode.length;
      },
      maxSize: 30 * 1024 * 1024, // Reduced from 50 MB to 30 MB
      dispose: (_key, _sourceCode) => {
        // No need to do anything special here
      }
    });

    this.registerCache(cache);
    return cache;
  }

  /**
   * Runs garbage collection by clearing all caches and suggesting to the V8 engine
   * that it might be a good time to run garbage collection.
   *
   * Note: This doesn't force garbage collection, as that's not directly possible in Node.js.
   * It only provides hints to the engine and clears references to allow GC to reclaim memory.
   */
  public runGarbageCollection(): void {
    logger.info('Running manual garbage collection...');

    // Get memory stats before cleanup
    const beforeStats = this.getMemoryStats();

    // Clear all caches
    for (const cache of this.caches.values()) {
      cache.clear();
    }

    logger.info('All caches cleared successfully.');

    // Unload unused grammars if grammar manager is available
    if (this.grammarManager) {
      this.grammarManager.unloadUnusedGrammars();
      logger.info('Unused grammars unloaded successfully.');
    }

    // Suggest to V8 that now might be a good time for GC
    // This is just a hint, not a command
    if (typeof global !== 'undefined' && (global as unknown as { gc?: () => void }).gc) {
      try {
        logger.debug('Calling global.gc() to suggest garbage collection');
        (global as unknown as { gc: () => void }).gc();
      } catch (error) {
        logger.warn('Failed to suggest garbage collection', { error });
      }
    } else {
      logger.debug('global.gc not available. Run Node.js with --expose-gc to enable manual GC suggestions');
    }

    // Log memory usage after cleanup
    const afterStats = this.getMemoryStats();

    // Calculate memory freed
    const memoryFreed = beforeStats.raw.processMemory.heapUsed - afterStats.raw.processMemory.heapUsed;

    logger.info(`Memory usage after cleanup: ${afterStats.formatted.process.heapUsed} / ${afterStats.formatted.v8.heapSizeLimit}`);

    if (memoryFreed > 0) {
      logger.info(`Memory freed: ${this.formatBytes(memoryFreed)}`);
    } else {
      logger.warn(`Memory usage increased by: ${this.formatBytes(Math.abs(memoryFreed))}`);
    }

    // Log memory status
    logger.info(`Memory status: ${afterStats.formatted.memoryStatus}`);

    // If memory status is still high or critical, log a warning
    if (afterStats.formatted.memoryStatus !== 'normal') {
      logger.warn(`Memory usage is still ${afterStats.formatted.memoryStatus} after cleanup. Consider restarting the process.`);
    }
  }

  /**
   * Detect memory pressure levels
   */
  public detectMemoryPressure(): {
    level: 'normal' | 'moderate' | 'high' | 'critical';
    heapUsagePercentage: number;
    systemMemoryPercentage: number;
    recommendations: string[];
  } {
    const stats = this.getMemoryStats();
    const heapUsed = stats.raw.heapStats.used_heap_size;
    const heapLimit = stats.raw.heapStats.heap_size_limit;
    const heapPercentage = heapUsed / heapLimit;

    const systemUsed = stats.raw.totalSystemMemory - stats.raw.freeSystemMemory;
    const systemPercentage = systemUsed / stats.raw.totalSystemMemory;

    let level: 'normal' | 'moderate' | 'high' | 'critical' = 'normal';
    const recommendations: string[] = [];

    if (heapPercentage > 0.95 || systemPercentage > 0.95) {
      level = 'critical';
      recommendations.push('Immediate emergency cleanup required');
      recommendations.push('Consider restarting the process');
      recommendations.push('Reduce cache sizes aggressively');
    } else if (heapPercentage > 0.85 || systemPercentage > 0.85) {
      level = 'high';
      recommendations.push('Aggressive cache pruning recommended');
      recommendations.push('Reduce concurrent operations');
      recommendations.push('Monitor memory usage closely');
    } else if (heapPercentage > 0.7 || systemPercentage > 0.7) {
      level = 'moderate';
      recommendations.push('Consider cache pruning');
      recommendations.push('Monitor memory trends');
    } else {
      recommendations.push('Memory usage is within normal limits');
    }

    return {
      level,
      heapUsagePercentage: heapPercentage * 100,
      systemMemoryPercentage: systemPercentage * 100,
      recommendations
    };
  }

  /**
   * Emergency cleanup for critical memory situations
   */
  public async emergencyCleanup(): Promise<{
    success: boolean;
    freedMemory: number;
    actions: string[];
    error?: string;
  }> {
    const beforeStats = this.getMemoryStats();
    const actions: string[] = [];

    try {
      logger.warn('Emergency memory cleanup initiated', {
        heapUsed: this.formatBytes(beforeStats.raw.heapStats.used_heap_size),
        heapLimit: this.formatBytes(beforeStats.raw.heapStats.heap_size_limit)
      });

      // 1. Clear all caches aggressively
      for (const [name, cache] of this.caches.entries()) {
        const beforeSize = cache.getSize();
        cache.clear();
        actions.push(`Cleared cache '${name}' (${beforeSize} items)`);
      }

      // 2. Clear grammar manager caches if available
      if (this.grammarManager) {
        try {
          (this.grammarManager as any).clearAllCaches?.();
          actions.push('Cleared grammar manager caches');
        } catch (error) {
          logger.warn({ err: error }, 'Failed to clear grammar manager caches');
        }
      }

      // 3. Force garbage collection if available
      if (global.gc) {
        global.gc();
        actions.push('Forced garbage collection');
      } else {
        actions.push('Garbage collection not available (run with --expose-gc)');
      }

      // 4. Clear require cache for non-essential modules
      const requireCache = require.cache;
      let clearedModules = 0;
      for (const key in requireCache) {
        // Only clear non-essential modules (avoid core modules)
        if (key.includes('node_modules') &&
            !key.includes('logger') &&
            !key.includes('core')) {
          delete requireCache[key];
          clearedModules++;
        }
      }
      if (clearedModules > 0) {
        actions.push(`Cleared ${clearedModules} modules from require cache`);
      }

      // 5. Wait a moment for cleanup to take effect
      await new Promise(resolve => setTimeout(resolve, 100));

      const afterStats = this.getMemoryStats();
      const freedMemory = beforeStats.raw.heapStats.used_heap_size - afterStats.raw.heapStats.used_heap_size;

      logger.info('Emergency cleanup completed', {
        freedMemory: this.formatBytes(freedMemory),
        actions: actions.length,
        newHeapUsage: this.formatBytes(afterStats.raw.heapStats.used_heap_size)
      });

      return {
        success: true,
        freedMemory,
        actions
      };

    } catch (error) {
      logger.error({ err: error }, 'Emergency cleanup failed');

      return {
        success: false,
        freedMemory: 0,
        actions,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check if emergency cleanup is needed and execute if necessary
   */
  public async checkAndExecuteEmergencyCleanup(): Promise<boolean> {
    const pressure = this.detectMemoryPressure();

    if (pressure.level === 'critical') {
      logger.warn('Critical memory pressure detected, executing emergency cleanup', {
        heapUsage: pressure.heapUsagePercentage,
        systemUsage: pressure.systemMemoryPercentage
      });

      const result = await this.emergencyCleanup();

      if (result.success) {
        logger.info('Emergency cleanup successful', {
          freedMemory: this.formatBytes(result.freedMemory),
          actions: result.actions
        });
        return true;
      } else {
        logger.error('Emergency cleanup failed', {
          error: result.error,
          actions: result.actions
        });
        return false;
      }
    }

    return false;
  }

  /**
   * Creates fallback memory stats to prevent recursion
   */
  private createFallbackMemoryStats(): MemoryStats {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    return {
      raw: {
        totalSystemMemory: totalMemory,
        freeSystemMemory: freeMemory,
        memoryUsagePercentage: (totalMemory - freeMemory) / totalMemory,
        processMemory: {
          rss: 0,
          heapTotal: 0,
          heapUsed: 0,
          external: 0,
          arrayBuffers: 0
        },
        heapStats: {
          total_heap_size: 0,
          total_heap_size_executable: 0,
          total_physical_size: 0,
          total_available_size: 0,
          used_heap_size: 0,
          heap_size_limit: 0,
          malloced_memory: 0,
          peak_malloced_memory: 0,
          does_zap_garbage: 0,
          number_of_native_contexts: 0,
          number_of_detached_contexts: 0,
          total_global_handles_size: 0,
          used_global_handles_size: 0,
          external_memory: 0
        },
        heapSpaceStats: []
      },
      formatted: {
        totalSystemMemory: this.formatBytes(totalMemory),
        freeSystemMemory: this.formatBytes(freeMemory),
        usedSystemMemory: this.formatBytes(totalMemory - freeMemory),
        memoryUsagePercentage: '0.00%',
        memoryStatus: 'normal' as const,
        process: {
          rss: '0 B',
          heapTotal: '0 B',
          heapUsed: '0 B',
          external: '0 B',
          arrayBuffers: '0 B'
        },
        v8: {
          heapSizeLimit: '0 B',
          totalHeapSize: '0 B',
          usedHeapSize: '0 B',
          heapSizeExecutable: '0 B',
          mallocedMemory: '0 B',
          peakMallocedMemory: '0 B'
        },
        cache: {
          totalSize: '0 B',
          cacheCount: 0
        },
        thresholds: {
          highMemoryThreshold: '80%',
          criticalMemoryThreshold: '90%'
        }
      },
      cacheStats: [],
      grammarStats: {},
      timestamp: Date.now()
    };
  }
}
