/**
 * Package Cache Service for Context Curator
 * 
 * Implements intelligent caching system for context packages to improve performance
 * and reduce redundant processing for similar requests.
 */

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import logger from '../../../logger.js';
import type { ContextPackage } from '../types/context-curator.js';

export interface CacheMetadata {
  /** Cache key for this package */
  cacheKey: string;
  /** Timestamp when cached */
  cachedAt: Date;
  /** Time to live in milliseconds */
  ttlMs: number;
  /** Size of cached data in bytes */
  sizeBytes: number;
  /** Cache hit count */
  hitCount: number;
  /** Last accessed timestamp */
  lastAccessed: Date;
  /** Cache version for compatibility */
  version: string;
}

export interface CachedPackage {
  /** The cached context package */
  package: ContextPackage;
  /** Cache metadata */
  metadata: CacheMetadata;
}

export class PackageCache {
  private static readonly CACHE_DIR = path.join(
    process.env.VIBE_CODER_OUTPUT_DIR
      ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
      : path.join(process.cwd(), 'VibeCoderOutput'),
    'context-curator',
    'cache'
  );
  private static readonly CACHE_VERSION = '1.0.0';
  private static readonly DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly MAX_CACHE_SIZE_MB = 500; // 500MB max cache size

  /**
   * Initialize cache directory
   */
  static async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.CACHE_DIR, { recursive: true });
      logger.info({ cacheDir: this.CACHE_DIR }, 'Package cache initialized');
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to initialize package cache');
      throw error;
    }
  }

  /**
   * Generate cache key from input parameters
   */
  static generateCacheKey(
    projectPath: string,
    userPrompt: string,
    taskType: string
  ): string {
    const content = `${projectPath}:${userPrompt}:${taskType}`;
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get cached package if available and valid
   */
  static async getCachedPackage(cacheKey: string): Promise<CachedPackage | null> {
    try {
      const cacheFilePath = path.join(this.CACHE_DIR, `${cacheKey}.json`);
      const metadataFilePath = path.join(this.CACHE_DIR, `${cacheKey}.meta.json`);

      // Check if cache files exist
      const [cacheExists, metadataExists] = await Promise.all([
        fs.access(cacheFilePath).then(() => true).catch(() => false),
        fs.access(metadataFilePath).then(() => true).catch(() => false)
      ]);

      if (!cacheExists || !metadataExists) {
        return null;
      }

      // Read metadata first to check validity
      const metadataContent = await fs.readFile(metadataFilePath, 'utf-8');
      const metadata: CacheMetadata = JSON.parse(metadataContent);

      // Check if cache is expired
      const now = Date.now();
      const cachedAt = new Date(metadata.cachedAt).getTime();
      if (now - cachedAt > metadata.ttlMs) {
        logger.info({ cacheKey }, 'Cache entry expired, removing');
        await this.removeCacheEntry(cacheKey);
        return null;
      }

      // Check version compatibility
      if (metadata.version !== this.CACHE_VERSION) {
        logger.info({ cacheKey, version: metadata.version }, 'Cache version mismatch, removing');
        await this.removeCacheEntry(cacheKey);
        return null;
      }

      // Read package data
      const packageContent = await fs.readFile(cacheFilePath, 'utf-8');
      const contextPackage: ContextPackage = JSON.parse(packageContent);

      // Update access metadata
      metadata.hitCount++;
      metadata.lastAccessed = new Date();
      await fs.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2), 'utf-8');

      logger.info({ 
        cacheKey, 
        hitCount: metadata.hitCount,
        age: now - cachedAt 
      }, 'Cache hit - returning cached package');

      return {
        package: contextPackage,
        metadata
      };

    } catch (error) {
      logger.warn({ 
        cacheKey, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Failed to retrieve cached package');
      return null;
    }
  }

  /**
   * Cache a context package
   */
  static async cachePackage(
    cacheKey: string,
    contextPackage: ContextPackage,
    ttlMs: number = this.DEFAULT_TTL_MS
  ): Promise<void> {
    try {
      await this.initialize();

      const cacheFilePath = path.join(this.CACHE_DIR, `${cacheKey}.json`);
      const metadataFilePath = path.join(this.CACHE_DIR, `${cacheKey}.meta.json`);

      // Serialize package
      const packageContent = JSON.stringify(contextPackage, null, 2);
      const sizeBytes = Buffer.byteLength(packageContent, 'utf-8');

      // Create metadata
      const metadata: CacheMetadata = {
        cacheKey,
        cachedAt: new Date(),
        ttlMs,
        sizeBytes,
        hitCount: 0,
        lastAccessed: new Date(),
        version: this.CACHE_VERSION
      };

      // Check cache size limits before writing
      await this.enforceMaxCacheSize(sizeBytes);

      // Write package and metadata
      await Promise.all([
        fs.writeFile(cacheFilePath, packageContent, 'utf-8'),
        fs.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2), 'utf-8')
      ]);

      logger.info({ 
        cacheKey, 
        sizeBytes, 
        ttlMs 
      }, 'Package cached successfully');

    } catch (error) {
      logger.error({ 
        cacheKey, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Failed to cache package');
      throw error;
    }
  }

  /**
   * Remove a specific cache entry
   */
  static async removeCacheEntry(cacheKey: string): Promise<void> {
    try {
      const cacheFilePath = path.join(this.CACHE_DIR, `${cacheKey}.json`);
      const metadataFilePath = path.join(this.CACHE_DIR, `${cacheKey}.meta.json`);

      await Promise.all([
        fs.unlink(cacheFilePath).catch(() => {}), // Ignore errors if file doesn't exist
        fs.unlink(metadataFilePath).catch(() => {})
      ]);

      logger.info({ cacheKey }, 'Cache entry removed');
    } catch (error) {
      logger.warn({ 
        cacheKey, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Failed to remove cache entry');
    }
  }

  /**
   * Clear all cache entries
   */
  static async clearCache(): Promise<void> {
    try {
      const files = await fs.readdir(this.CACHE_DIR);
      const deletePromises = files.map(file => 
        fs.unlink(path.join(this.CACHE_DIR, file)).catch(() => {})
      );
      
      await Promise.all(deletePromises);
      logger.info({ filesRemoved: files.length }, 'Cache cleared successfully');
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Failed to clear cache');
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  static async getCacheStats(): Promise<{
    totalEntries: number;
    totalSizeBytes: number;
    totalSizeMB: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    totalHits: number;
  }> {
    try {
      const files = await fs.readdir(this.CACHE_DIR);
      const metadataFiles = files.filter(file => file.endsWith('.meta.json'));

      let totalSizeBytes = 0;
      let totalHits = 0;
      let oldestEntry: Date | null = null;
      let newestEntry: Date | null = null;

      for (const metadataFile of metadataFiles) {
        try {
          const metadataPath = path.join(this.CACHE_DIR, metadataFile);
          const metadataContent = await fs.readFile(metadataPath, 'utf-8');
          const metadata: CacheMetadata = JSON.parse(metadataContent);

          totalSizeBytes += metadata.sizeBytes;
          totalHits += metadata.hitCount;

          const cachedAt = new Date(metadata.cachedAt);
          if (!oldestEntry || cachedAt < oldestEntry) {
            oldestEntry = cachedAt;
          }
          if (!newestEntry || cachedAt > newestEntry) {
            newestEntry = cachedAt;
          }
        } catch {
          logger.warn({ metadataFile }, 'Failed to read metadata file');
        }
      }

      return {
        totalEntries: metadataFiles.length,
        totalSizeBytes,
        totalSizeMB: totalSizeBytes / (1024 * 1024),
        oldestEntry,
        newestEntry,
        totalHits
      };
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Failed to get cache stats');
      throw error;
    }
  }

  /**
   * Enforce maximum cache size by removing oldest entries
   */
  private static async enforceMaxCacheSize(newEntrySizeBytes: number): Promise<void> {
    try {
      const stats = await this.getCacheStats();
      const maxSizeBytes = this.MAX_CACHE_SIZE_MB * 1024 * 1024;

      if (stats.totalSizeBytes + newEntrySizeBytes <= maxSizeBytes) {
        return; // No cleanup needed
      }

      logger.info({ 
        currentSizeMB: stats.totalSizeMB, 
        maxSizeMB: this.MAX_CACHE_SIZE_MB 
      }, 'Cache size limit exceeded, cleaning up old entries');

      // Get all metadata files with their timestamps
      const files = await fs.readdir(this.CACHE_DIR);
      const metadataFiles = files.filter(file => file.endsWith('.meta.json'));

      const entriesWithAge: Array<{ cacheKey: string; cachedAt: Date; sizeBytes: number }> = [];

      for (const metadataFile of metadataFiles) {
        try {
          const metadataPath = path.join(this.CACHE_DIR, metadataFile);
          const metadataContent = await fs.readFile(metadataPath, 'utf-8');
          const metadata: CacheMetadata = JSON.parse(metadataContent);

          entriesWithAge.push({
            cacheKey: metadata.cacheKey,
            cachedAt: new Date(metadata.cachedAt),
            sizeBytes: metadata.sizeBytes
          });
        } catch {
          logger.warn({ metadataFile }, 'Failed to read metadata for cleanup');
        }
      }

      // Sort by age (oldest first)
      entriesWithAge.sort((a, b) => a.cachedAt.getTime() - b.cachedAt.getTime());

      // Remove entries until we're under the limit
      let currentSize = stats.totalSizeBytes;
      let removedCount = 0;

      for (const entry of entriesWithAge) {
        if (currentSize + newEntrySizeBytes <= maxSizeBytes) {
          break;
        }

        await this.removeCacheEntry(entry.cacheKey);
        currentSize -= entry.sizeBytes;
        removedCount++;
      }

      logger.info({ 
        removedCount, 
        newSizeMB: currentSize / (1024 * 1024) 
      }, 'Cache cleanup completed');

    } catch (error) {
      logger.warn({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Failed to enforce cache size limits');
    }
  }
}
