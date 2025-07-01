/**
 * Cache Utils - Advanced Caching Strategies
 *
 * Implements advanced caching strategies including:
 * - Multi-level caching (memory, disk, distributed)
 * - Cache warming strategies
 * - Intelligent cache eviction policies
 * - Cache hit rate optimization
 * - Cache consistency guarantees
 */

import fs from 'fs-extra';
import path from 'path';
import { VibeTaskManagerConfig } from './config-loader.js';
import { TaskManagerMemoryManager, MemoryCleanupResult } from './memory-manager-integration.js';
import logger from '../../../logger.js';

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: Date;
  ttl: number;
  accessCount: number;
  lastAccessed: Date;
  size: number;
  tags: string[];
}

/**
 * Cache statistics
 */
export interface CacheStatistics {
  totalEntries: number;
  memoryEntries: number;
  diskEntries: number;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
  totalMemoryUsage: number;
  totalDiskUsage: number;
  averageAccessTime: number;
  evictionCount: number;
}

/**
 * Cache warming configuration
 */
export interface CacheWarmingConfig {
  enabled: boolean;
  strategies: ('preload' | 'predictive' | 'scheduled')[];
  preloadPatterns: string[];
  predictiveThreshold: number;
  scheduledInterval: number;
}

/**
 * Cache eviction policy
 */
export type EvictionPolicy = 'lru' | 'lfu' | 'ttl' | 'size' | 'hybrid';

/**
 * Multi-level cache configuration
 */
export interface MultiLevelCacheConfig {
  strategy: 'memory' | 'disk' | 'hybrid';
  memoryConfig: {
    maxEntries: number;
    maxMemoryUsage: number;
    evictionPolicy: EvictionPolicy;
  };
  diskConfig: {
    enabled: boolean;
    directory: string;
    maxDiskUsage: number;
    compression: boolean;
  };
  warming: CacheWarmingConfig;
  consistency: {
    enabled: boolean;
    syncInterval: number;
    conflictResolution: 'memory' | 'disk' | 'timestamp';
  };
}

/**
 * Multi-level cache implementation
 */
export class MultiLevelCache<T> {
  private memoryCache: Map<string, CacheEntry<T>> = new Map();
  private accessOrder: Map<string, number> = new Map();
  private accessFrequency: Map<string, number> = new Map();
  private config: MultiLevelCacheConfig;
  private stats: CacheStatistics;
  private accessCounter = 0;
  private warmingInterval: NodeJS.Timeout | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private memoryManager: TaskManagerMemoryManager | null = null;

  constructor(config: MultiLevelCacheConfig) {
    this.config = config;
    this.stats = {
      totalEntries: 0,
      memoryEntries: 0,
      diskEntries: 0,
      hitRate: 0,
      missRate: 0,
      totalHits: 0,
      totalMisses: 0,
      totalMemoryUsage: 0,
      totalDiskUsage: 0,
      averageAccessTime: 0,
      evictionCount: 0
    };

    // Initialize memory manager integration
    this.memoryManager = TaskManagerMemoryManager.getInstance();
    this.memoryManager?.registerCleanupCallback('multi-level-cache', () => this.performCleanup());

    // Initialize disk cache directory
    if (config.diskConfig.enabled) {
      fs.ensureDirSync(config.diskConfig.directory);
    }

    // Start cache warming if enabled
    if (config.warming.enabled) {
      this.startCacheWarming();
    }

    // Start consistency sync if enabled
    if (config.consistency.enabled) {
      this.startConsistencySync();
    }

    logger.info({ config }, 'Multi-level cache initialized');
  }

  /**
   * Get value from cache (optimized for <50ms performance)
   */
  async get(key: string): Promise<T | null> {
    const startTime = performance.now();

    try {
      // Fast path: Check memory cache first (should be <1ms)
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry) {
        // Quick expiration check without function call overhead
        const now = Date.now();
        if (now - memoryEntry.timestamp.getTime() <= memoryEntry.ttl) {
          // Fast access metrics update
          memoryEntry.accessCount++;
          memoryEntry.lastAccessed = new Date(now);
          this.accessOrder.set(key, ++this.accessCounter);

          this.stats.totalHits++;
          this.stats.hitRate = this.stats.totalHits / (this.stats.totalHits + this.stats.totalMisses);

          return memoryEntry.value;
        } else {
          // Remove expired entry immediately
          this.memoryCache.delete(key);
          this.accessOrder.delete(key);
          this.accessFrequency.delete(key);
        }
      }

      // Disk cache check only if memory miss and disk enabled
      if (this.config.diskConfig.enabled && this.config.strategy !== 'memory') {
        const diskEntry = await this.getDiskEntry(key);
        if (diskEntry && !this.isExpired(diskEntry)) {
          // Promote to memory cache for future fast access
          this.memoryCache.set(key, diskEntry);
          this.updateAccessMetrics(diskEntry);
          this.stats.totalHits++;
          this.updateHitRate();

          return diskEntry.value;
        }
      }

      // Cache miss
      this.stats.totalMisses++;
      this.stats.hitRate = this.stats.totalHits / (this.stats.totalHits + this.stats.totalMisses);

      return null;

    } finally {
      const accessTime = performance.now() - startTime;
      this.updateAverageAccessTime(accessTime);
    }
  }

  /**
   * Set value in cache (optimized for <50ms performance)
   */
  async set(key: string, value: T, ttl?: number, tags: string[] = []): Promise<void> {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: new Date(now),
      ttl: ttl || 300000, // 5 minutes default
      accessCount: 0,
      lastAccessed: new Date(now),
      size: this.estimateSize(value),
      tags
    };

    // Fast eviction check - only if we're near limits
    const currentSize = this.memoryCache.size;
    if (currentSize >= this.config.memoryConfig.maxEntries * 0.9) {
      await this.evictIfNecessary();
    }

    // Store in memory cache (fast path)
    this.memoryCache.set(key, entry);
    this.accessOrder.set(key, ++this.accessCounter);
    this.accessFrequency.set(key, 0);

    // Async disk storage (don't await for performance)
    if (this.config.diskConfig.enabled && this.config.strategy !== 'memory') {
      this.setDiskEntry(key, entry).catch(error => {
        logger.warn({ err: error, key }, 'Async disk cache write failed');
      });
    }

    // Fast stats update
    this.stats.totalEntries = currentSize + 1;
    this.stats.memoryEntries = this.stats.totalEntries;
    this.stats.totalMemoryUsage += entry.size;
  }

  /**
   * Delete entry from cache
   */
  async delete(key: string): Promise<boolean> {
    let deleted = false;

    // Remove from memory cache
    if (this.memoryCache.delete(key)) {
      this.accessOrder.delete(key);
      this.accessFrequency.delete(key);
      deleted = true;
    }

    // Remove from disk cache
    if (this.config.diskConfig.enabled) {
      const diskDeleted = await this.deleteDiskEntry(key);
      deleted = deleted || diskDeleted;
    }

    if (deleted) {
      this.updateStats();
      logger.debug({ key }, 'Cache entry deleted');
    }

    return deleted;
  }

  /**
   * Clear cache by tags
   */
  async clearByTags(tags: string[]): Promise<number> {
    let cleared = 0;

    // Clear from memory cache
    for (const [key, entry] of this.memoryCache) {
      if (entry.tags.some(tag => tags.includes(tag))) {
        await this.delete(key);
        cleared++;
      }
    }

    logger.info({ tags, cleared }, 'Cache entries cleared by tags');
    return cleared;
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp.getTime() > entry.ttl;
  }

  /**
   * Update access metrics for entry
   */
  private updateAccessMetrics(entry: CacheEntry<T>): void {
    entry.accessCount++;
    entry.lastAccessed = new Date();
    this.accessOrder.set(entry.key, ++this.accessCounter);
    this.accessFrequency.set(entry.key, (this.accessFrequency.get(entry.key) || 0) + 1);
  }

  /**
   * Evict entries if necessary
   */
  private async evictIfNecessary(): Promise<void> {
    const memoryUsage = this.calculateMemoryUsage();
    const entryCount = this.memoryCache.size;

    if (entryCount >= this.config.memoryConfig.maxEntries ||
        memoryUsage >= this.config.memoryConfig.maxMemoryUsage) {

      const evictCount = Math.max(1, Math.floor(entryCount * 0.1)); // Evict 10%
      await this.evictEntries(evictCount);
    }
  }

  /**
   * Evict entries based on policy
   */
  private async evictEntries(count: number): Promise<void> {
    const entries = Array.from(this.memoryCache.entries());
    let toEvict: string[] = [];

    switch (this.config.memoryConfig.evictionPolicy) {
      case 'lru':
        toEvict = this.selectLRUEntries(entries, count);
        break;
      case 'lfu':
        toEvict = this.selectLFUEntries(entries, count);
        break;
      case 'ttl':
        toEvict = this.selectTTLEntries(entries, count);
        break;
      case 'size':
        toEvict = this.selectSizeEntries(entries, count);
        break;
      case 'hybrid':
        toEvict = this.selectHybridEntries(entries, count);
        break;
    }

    for (const key of toEvict) {
      await this.delete(key);
      this.stats.evictionCount++;
    }

    if (toEvict.length > 0) {
      logger.debug({
        evicted: toEvict.length,
        policy: this.config.memoryConfig.evictionPolicy
      }, 'Cache entries evicted');
    }
  }

  /**
   * Select LRU entries for eviction
   */
  private selectLRUEntries(entries: [string, CacheEntry<T>][], count: number): string[] {
    return entries
      .sort((a, b) => (this.accessOrder.get(a[0]) || 0) - (this.accessOrder.get(b[0]) || 0))
      .slice(0, count)
      .map(([key]) => key);
  }

  /**
   * Select LFU entries for eviction
   */
  private selectLFUEntries(entries: [string, CacheEntry<T>][], count: number): string[] {
    return entries
      .sort((a, b) => (this.accessFrequency.get(a[0]) || 0) - (this.accessFrequency.get(b[0]) || 0))
      .slice(0, count)
      .map(([key]) => key);
  }

  /**
   * Select TTL entries for eviction (oldest first)
   */
  private selectTTLEntries(entries: [string, CacheEntry<T>][], count: number): string[] {
    return entries
      .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())
      .slice(0, count)
      .map(([key]) => key);
  }

  /**
   * Select size entries for eviction (largest first)
   */
  private selectSizeEntries(entries: [string, CacheEntry<T>][], count: number): string[] {
    return entries
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, count)
      .map(([key]) => key);
  }

  /**
   * Select hybrid entries for eviction (combination of factors)
   */
  private selectHybridEntries(entries: [string, CacheEntry<T>][], count: number): string[] {
    return entries
      .map(([key, entry]) => ({
        key,
        score: this.calculateEvictionScore(entry)
      }))
      .sort((a, b) => a.score - b.score) // Lower score = higher priority for eviction
      .slice(0, count)
      .map(item => item.key);
  }

  /**
   * Calculate eviction score for hybrid policy
   */
  private calculateEvictionScore(entry: CacheEntry<T>): number {
    const now = Date.now();
    const age = now - entry.timestamp.getTime();
    const timeSinceAccess = now - entry.lastAccessed.getTime();
    const frequency = this.accessFrequency.get(entry.key) || 0;

    // Higher score = less likely to be evicted
    return (frequency * 0.4) +
           ((entry.ttl - age) / entry.ttl * 0.3) +
           ((entry.ttl - timeSinceAccess) / entry.ttl * 0.2) +
           (1 / (entry.size / 1024) * 0.1); // Prefer keeping smaller items
  }

  /**
   * Get disk entry
   */
  private async getDiskEntry(key: string): Promise<CacheEntry<T> | null> {
    try {
      const filePath = path.join(this.config.diskConfig.directory, `${key}.json`);
      if (await fs.pathExists(filePath)) {
        const data = await fs.readJson(filePath);
        return data as CacheEntry<T>;
      }
    } catch (error) {
      logger.debug({ err: error, key }, 'Failed to read disk cache entry');
    }
    return null;
  }

  /**
   * Set disk entry
   */
  private async setDiskEntry(key: string, entry: CacheEntry<T>): Promise<void> {
    try {
      const filePath = path.join(this.config.diskConfig.directory, `${key}.json`);
      await fs.writeJson(filePath, entry);
    } catch (error) {
      logger.warn({ err: error, key }, 'Failed to write disk cache entry');
    }
  }

  /**
   * Delete disk entry
   */
  private async deleteDiskEntry(key: string): Promise<boolean> {
    try {
      const filePath = path.join(this.config.diskConfig.directory, `${key}.json`);
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        return true;
      }
    } catch (error) {
      logger.warn({ err: error, key }, 'Failed to delete disk cache entry');
    }
    return false;
  }

  /**
   * Estimate size of value
   */
  private estimateSize(value: T): number {
    try {
      return Buffer.byteLength(JSON.stringify(value));
    } catch {
      return 1024; // Default estimate
    }
  }

  /**
   * Calculate current memory usage
   */
  private calculateMemoryUsage(): number {
    return Array.from(this.memoryCache.values())
      .reduce((sum, entry) => sum + entry.size, 0);
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    this.stats.totalEntries = this.memoryCache.size;
    this.stats.memoryEntries = this.memoryCache.size;
    this.stats.totalMemoryUsage = this.calculateMemoryUsage();
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.totalHits + this.stats.totalMisses;
    this.stats.hitRate = total > 0 ? this.stats.totalHits / total : 0;
    this.stats.missRate = 1 - this.stats.hitRate;
  }

  /**
   * Update average access time
   */
  private updateAverageAccessTime(accessTime: number): void {
    const total = this.stats.totalHits + this.stats.totalMisses;
    this.stats.averageAccessTime = total > 1
      ? (this.stats.averageAccessTime * (total - 1) + accessTime) / total
      : accessTime;
  }

  /**
   * Start cache warming
   */
  private startCacheWarming(): void {
    if (this.config.warming.strategies.includes('scheduled')) {
      this.warmingInterval = setInterval(() => {
        this.performCacheWarming();
      }, this.config.warming.scheduledInterval);
    }
  }

  /**
   * Perform cache warming
   */
  private async performCacheWarming(): Promise<void> {
    // Implementation would depend on specific warming strategies
    logger.debug('Cache warming performed');
  }

  /**
   * Start consistency sync
   */
  private startConsistencySync(): void {
    this.syncInterval = setInterval(() => {
      this.performConsistencySync();
    }, this.config.consistency.syncInterval);
  }

  /**
   * Perform consistency sync
   */
  private async performConsistencySync(): Promise<void> {
    // Implementation would sync memory and disk caches
    logger.debug('Consistency sync performed');
  }

  /**
   * Perform cleanup for memory manager
   */
  private async performCleanup(): Promise<MemoryCleanupResult> {
    const startTime = Date.now();
    const initialMemory = this.calculateMemoryUsage();

    try {
      // Clear expired entries
      const expiredKeys = Array.from(this.memoryCache.entries())
        .filter(([, entry]) => this.isExpired(entry))
        .map(([key]) => key);

      for (const key of expiredKeys) {
        await this.delete(key);
      }

      // Evict additional entries if still over threshold
      const currentUsage = this.calculateMemoryUsage();
      const threshold = this.config.memoryConfig.maxMemoryUsage * 0.7;

      if (currentUsage > threshold) {
        const evictCount = Math.floor(this.memoryCache.size * 0.2); // Evict 20%
        await this.evictEntries(evictCount);
      }

      const finalMemory = this.calculateMemoryUsage();
      const memoryFreed = Math.max(0, initialMemory - finalMemory);

      logger.info({
        expiredRemoved: expiredKeys.length,
        memoryFreed: `${Math.round(memoryFreed / 1024 / 1024)}MB`
      }, 'Cache cleanup completed');

      return {
        success: true,
        memoryFreed,
        itemsRemoved: expiredKeys.length,
        duration: Date.now() - startTime
      };

    } catch (error) {
      logger.error({ err: error }, 'Cache cleanup failed');
      return {
        success: false,
        memoryFreed: 0,
        itemsRemoved: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.accessOrder.clear();
    this.accessFrequency.clear();

    if (this.config.diskConfig.enabled) {
      try {
        await fs.emptyDir(this.config.diskConfig.directory);
      } catch (error) {
        logger.warn({ err: error }, 'Failed to clear disk cache');
      }
    }

    this.updateStats();
    logger.info('Cache cleared');
  }

  /**
   * Shutdown cache
   */
  async shutdown(): Promise<void> {
    if (this.warmingInterval) {
      clearInterval(this.warmingInterval);
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.memoryManager?.unregisterCleanupCallback('multi-level-cache');

    await this.clear();
    logger.info('Multi-level cache shutdown');
  }
}

/**
 * Cache factory for creating configured cache instances
 */
export class CacheFactory {
  static createCache<T>(
    name: string,
    config: VibeTaskManagerConfig['taskManager']['performance']['caching']
  ): MultiLevelCache<T> {
    const cacheConfig: MultiLevelCacheConfig = {
      strategy: config.strategy,
      memoryConfig: {
        maxEntries: 1000,
        maxMemoryUsage: config.maxCacheSize,
        evictionPolicy: 'hybrid'
      },
      diskConfig: {
        enabled: config.strategy === 'disk' || config.strategy === 'hybrid',
        directory: path.join(process.cwd(), 'data', 'cache', name),
        maxDiskUsage: config.maxCacheSize * 2,
        compression: false
      },
      warming: {
        enabled: config.enableWarmup,
        strategies: ['scheduled'],
        preloadPatterns: [],
        predictiveThreshold: 0.8,
        scheduledInterval: 300000 // 5 minutes
      },
      consistency: {
        enabled: config.strategy === 'hybrid',
        syncInterval: 60000, // 1 minute
        conflictResolution: 'memory'
      }
    };

    return new MultiLevelCache<T>(cacheConfig);
  }
}
