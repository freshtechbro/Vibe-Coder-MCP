/**
 * File-based cache implementation for the Code-Map Generator tool.
 * This file contains the FileCache class for storing and retrieving cached data.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import logger from '../../../logger.js';
import { CacheEntry, CacheMetadata, CacheOptions, CacheStats } from './types.js';

/**
 * A file-based cache implementation that stores entries as files.
 */
export class FileCache<T> {
  private name: string;
  private cacheDir: string;
  private metadataPath: string;
  private metadata: CacheMetadata;
  private options: Required<CacheOptions>;
  private stats: CacheStats;
  private initialized: boolean = false;
  private pruneTimer: NodeJS.Timeout | null = null;

  /**
   * Default options for the cache.
   */
  private static readonly DEFAULT_OPTIONS: Omit<Required<CacheOptions>, 'name' | 'cacheDir'> = {
    maxEntries: 10000,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    validateOnGet: true,
    pruneOnStartup: true,
    pruneInterval: 60 * 60 * 1000, // 1 hour
    serialize: JSON.stringify,
    deserialize: JSON.parse,
  };

  /**
   * Creates a new FileCache instance.
   * @param options The cache options
   */
  constructor(options: CacheOptions) {
    this.name = options.name;
    this.cacheDir = path.resolve(options.cacheDir);
    this.metadataPath = path.join(this.cacheDir, `${this.name}-metadata.json`);

    // Apply default options
    this.options = {
      ...FileCache.DEFAULT_OPTIONS,
      name: options.name,
      cacheDir: this.cacheDir,
      maxEntries: options.maxEntries ?? FileCache.DEFAULT_OPTIONS.maxEntries,
      maxAge: options.maxAge ?? FileCache.DEFAULT_OPTIONS.maxAge,
      validateOnGet: options.validateOnGet ?? FileCache.DEFAULT_OPTIONS.validateOnGet,
      pruneOnStartup: options.pruneOnStartup ?? FileCache.DEFAULT_OPTIONS.pruneOnStartup,
      pruneInterval: options.pruneInterval ?? FileCache.DEFAULT_OPTIONS.pruneInterval,
      serialize: options.serialize ?? FileCache.DEFAULT_OPTIONS.serialize,
      deserialize: options.deserialize ?? FileCache.DEFAULT_OPTIONS.deserialize,
    };

    // Initialize metadata
    this.metadata = {
      name: this.name,
      size: 0,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      keys: [],
      maxEntries: this.options.maxEntries,
      maxAge: this.options.maxAge,
      sizeInBytes: 0
    };

    // Initialize stats
    this.stats = {
      name: this.name,
      size: 0,
      hits: 0,
      misses: 0,
      hitRatio: 0,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      sizeInBytes: 0,
    };
  }

  /**
   * Initializes the cache.
   * Creates the cache directory if it doesn't exist and loads metadata.
   * @returns A promise that resolves when the cache is initialized
   */
  public async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Create the cache directory if it doesn't exist
      await this.createCacheDirectory();

      // Initialize metadata with default values
      this.metadata = {
        name: this.name,
        size: 0,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        keys: [],
        maxEntries: this.options.maxEntries || 10000,
        maxAge: this.options.maxAge || 24 * 60 * 60 * 1000, // 24 hours
        sizeInBytes: 0,
      };

      // Load metadata if it exists
      try {
        const metadataContent = await fs.readFile(this.metadataPath, 'utf-8');
        // Check if content looks like JSON before parsing
        if (metadataContent.trim().startsWith('{') && metadataContent.trim().endsWith('}')) {
          this.metadata = JSON.parse(metadataContent) as CacheMetadata;
          logger.debug(`Loaded cache metadata for ${this.name} with ${this.metadata.size} entries`);
        } else {
          // Content is not JSON, recreate metadata
          logger.warn(`Cache metadata file contains invalid JSON content, recreating: ${this.metadataPath}`);
          await this.saveMetadata();
        }
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          // Metadata file doesn't exist, create it
          await this.saveMetadata();
          logger.debug(`Created new cache metadata for ${this.name}`);
        } else {
          // Other error, log but continue with default metadata
          logger.warn({ err: error, metadataPath: this.metadataPath }, `Error loading cache metadata for ${this.name}, using default metadata`);
          await this.saveMetadata();
        }
      }

      // Mark as initialized before pruning to avoid circular dependency
      this.initialized = true;

      // Prune expired entries if enabled
      if (this.options.pruneOnStartup) {
        try {
          await this.prune();
        } catch (pruneError) {
          // Log but don't fail initialization
          logger.warn({ err: pruneError }, `Error pruning cache ${this.name} during initialization`);
        }
      }

      // Start automatic pruning if enabled
      if (this.options.pruneInterval > 0) {
        this.pruneTimer = setInterval(() => {
          this.prune().catch(error => {
            logger.error({ err: error }, `Error pruning cache ${this.name}`);
          });
        }, this.options.pruneInterval);
      }

      logger.info(`Cache ${this.name} initialized successfully at ${this.cacheDir}`);
    } catch (error) {
      logger.error({ err: error, cacheDir: this.cacheDir }, `Error initializing cache ${this.name}`);
      throw error;
    }
  }

  /**
   * Creates the cache directory with retry logic.
   * @returns A promise that resolves when the directory is created
   * @throws Error if the directory cannot be created after retries
   */
  private async createCacheDirectory(): Promise<void> {
    const maxRetries = 3;
    let retryCount = 0;
    let lastError: Error | null = null;

    while (retryCount < maxRetries) {
      try {
        // Create the cache directory if it doesn't exist
        await fs.mkdir(this.cacheDir, { recursive: true });

        // Verify the directory is writable by creating a test file
        const testFilePath = path.join(this.cacheDir, `.write-test-${Date.now()}.tmp`);
        await fs.writeFile(testFilePath, 'test');
        await fs.unlink(testFilePath);

        logger.debug(`Cache directory ${this.cacheDir} created and verified as writable`);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn({
          err: error,
          cacheDir: this.cacheDir,
          retry: retryCount + 1,
          maxRetries
        }, `Error creating cache directory, retrying (${retryCount + 1}/${maxRetries})...`);

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        retryCount++;
      }
    }

    // If we get here, all retries failed
    throw new Error(`Failed to create cache directory after ${maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Ensures the cache is initialized.
   * @throws Error if the cache is not initialized
   * @returns True if the cache is initialized
   */
  private ensureInitialized(): boolean {
    if (!this.initialized) {
      logger.warn(`Cache ${this.name} is not initialized. Call init() first.`);
      return false;
    }
    return true;
  }

  /**
   * Saves the cache metadata to disk.
   * @returns A promise that resolves when the metadata is saved
   */
  private async saveMetadata(): Promise<void> {
    try {
      await fs.writeFile(this.metadataPath, JSON.stringify(this.metadata, null, 2), 'utf-8');
    } catch (error) {
      logger.error({ err: error, metadataPath: this.metadataPath }, `Error saving cache metadata for ${this.name}`);
      throw error;
    }
  }

  /**
   * Generates a cache key for a given key.
   * @param key The key to hash
   * @returns The hashed key
   */
  private hashKey(key: string): string {
    return crypto.createHash('md5').update(key).digest('hex');
  }

  /**
   * Gets the file path for a cache entry.
   * @param key The cache key
   * @returns The file path
   */
  private getEntryPath(key: string): string {
    const hashedKey = this.hashKey(key);
    return path.join(this.cacheDir, `${hashedKey}.json`);
  }

  /**
   * Gets a value from the cache.
   * @param key The cache key
   * @returns A promise that resolves to the cached value, or undefined if not found
   */
  public async get(key: string): Promise<T | undefined> {
    if (!this.ensureInitialized()) {
      return undefined;
    }

    const entryPath = this.getEntryPath(key);

    try {
      // Check if the entry exists
      try {
        await fs.access(entryPath, fsSync.constants.R_OK);
      } catch {
        // Entry doesn't exist
        this.stats.misses++;
        return undefined;
      }

      // Read the entry
      const entryContent = await fs.readFile(entryPath, 'utf-8');
      const entry = this.options.deserialize<CacheEntry<T>>(entryContent);

      // Validate the entry if enabled
      if (this.options.validateOnGet && entry.expiry < Date.now()) {
        // Entry is expired, delete it
        try {
          await this.delete(key);
        } catch (error) {
          logger.warn({ err: error, key }, `Error deleting expired cache entry for ${key}`);
        }
        this.stats.misses++;
        return undefined;
      }

      // Entry is valid
      this.stats.hits++;
      this.stats.hitRatio = this.stats.hits / (this.stats.hits + this.stats.misses);
      return entry.value;
    } catch (error) {
      logger.error({ err: error, key, entryPath }, `Error getting cache entry for ${key}`);
      this.stats.misses++;
      return undefined;
    }
  }

  /**
   * Sets a value in the cache.
   * @param key The cache key
   * @param value The value to cache
   * @param ttl Optional TTL in milliseconds (overrides the default maxAge)
   * @returns A promise that resolves when the value is cached
   */
  public async set(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.ensureInitialized()) {
      // Try to initialize the cache
      try {
        await this.init();
      } catch (error) {
        logger.error({ err: error }, `Failed to initialize cache ${this.name} during set operation`);
        throw new Error(`Cannot set cache entry - initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const entryPath = this.getEntryPath(key);
    const now = Date.now();
    const expiry = now + (ttl ?? this.options.maxAge);

    // Create the cache entry
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: now,
      expiry,
    };

    try {
      // Create the directory if it doesn't exist (in case it was deleted)
      try {
        await fs.mkdir(path.dirname(entryPath), { recursive: true });
      } catch {
        // Ignore if directory already exists
      }

      // Write the entry to disk
      await fs.writeFile(entryPath, this.options.serialize(entry), 'utf-8');

      // Update metadata
      if (!this.metadata.keys.includes(key)) {
        this.metadata.keys.push(key);
        this.metadata.size++;
      }
      this.metadata.lastUpdated = now;

      // Save metadata
      try {
        await this.saveMetadata();
      } catch (error) {
        logger.warn({ err: error }, `Error saving metadata after setting cache entry for ${key}`);
      }

      // Update stats
      this.stats.size = this.metadata.size;
      this.stats.lastUpdated = now;

      // Prune if we've exceeded maxEntries
      if (this.metadata.size > this.options.maxEntries) {
        try {
          await this.prune();
        } catch (error) {
          logger.warn({ err: error }, `Error pruning cache after setting entry for ${key}`);
        }
      }
    } catch (error) {
      logger.error({ err: error, key, entryPath }, `Error setting cache entry for ${key}`);
      throw error;
    }
  }

  /**
   * Checks if a key exists in the cache.
   * @param key The cache key
   * @returns A promise that resolves to true if the key exists, false otherwise
   */
  public async has(key: string): Promise<boolean> {
    if (!this.ensureInitialized()) {
      return false;
    }

    const entryPath = this.getEntryPath(key);

    try {
      await fs.access(entryPath, fsSync.constants.R_OK);

      // If validateOnGet is enabled, check if the entry is expired
      if (this.options.validateOnGet) {
        try {
          const entryContent = await fs.readFile(entryPath, 'utf-8');
          const entry = this.options.deserialize<CacheEntry<T>>(entryContent);

          if (entry.expiry < Date.now()) {
            // Entry is expired, delete it
            try {
              await this.delete(key);
            } catch (error) {
              logger.warn({ err: error, key }, `Error deleting expired cache entry for ${key}`);
            }
            return false;
          }
        } catch (error) {
          logger.warn({ err: error, key }, `Error validating cache entry for ${key}`);
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deletes a key from the cache.
   * @param key The cache key
   * @returns A promise that resolves to true if the key was deleted, false otherwise
   */
  public async delete(key: string): Promise<boolean> {
    if (!this.ensureInitialized()) {
      return false;
    }

    const entryPath = this.getEntryPath(key);

    try {
      // Delete the entry file
      await fs.unlink(entryPath);

      // Update metadata
      const keyIndex = this.metadata.keys.indexOf(key);
      if (keyIndex !== -1) {
        this.metadata.keys.splice(keyIndex, 1);
        this.metadata.size--;
        this.metadata.lastUpdated = Date.now();

        // Save metadata
        try {
          await this.saveMetadata();
        } catch (error) {
          logger.warn({ err: error }, `Error saving metadata after deleting cache entry for ${key}`);
        }

        // Update stats
        this.stats.size = this.metadata.size;
        this.stats.lastUpdated = Date.now();
      }

      return true;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // Entry doesn't exist, that's fine
        return false;
      }

      logger.error({ err: error, key, entryPath }, `Error deleting cache entry for ${key}`);
      throw error;
    }
  }

  /**
   * Clears the entire cache.
   * @returns A promise that resolves when the cache is cleared
   */
  public async clear(): Promise<void> {
    if (!this.ensureInitialized()) {
      // Try to initialize the cache
      try {
        await this.init();
      } catch (error) {
        logger.error({ err: error }, `Failed to initialize cache ${this.name} during clear operation`);
        throw new Error(`Cannot clear cache - initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    try {
      // Delete all entry files
      for (const key of this.metadata.keys) {
        const entryPath = this.getEntryPath(key);
        try {
          await fs.unlink(entryPath);
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
            logger.warn({ err: error, key, entryPath }, `Error deleting cache entry for ${key}`);
          }
        }
      }

      // Reset metadata
      this.metadata.keys = [];
      this.metadata.size = 0;
      this.metadata.lastUpdated = Date.now();

      // Save metadata
      try {
        await this.saveMetadata();
      } catch (error) {
        logger.warn({ err: error }, `Error saving metadata after clearing cache ${this.name}`);
      }

      // Reset stats
      this.stats.size = 0;
      this.stats.lastUpdated = Date.now();

      logger.info(`Cleared cache ${this.name}`);
    } catch (error) {
      logger.error({ err: error }, `Error clearing cache ${this.name}`);
      throw error;
    }
  }

  /**
   * Removes old entries from the cache.
   * @returns A promise that resolves to the number of entries pruned
   */
  public async prune(): Promise<number> {
    // If not initialized, just return
    if (!this.initialized) {
      logger.warn(`Cannot prune cache ${this.name} - not initialized`);
      return 0;
    }

    const now = Date.now();
    const prunedKeys: string[] = [];

    try {
      // Check each entry for expiration
      for (const key of this.metadata.keys) {
        const entryPath = this.getEntryPath(key);

        try {
          const entryContent = await fs.readFile(entryPath, 'utf-8');
          const entry = this.options.deserialize<CacheEntry<T>>(entryContent);

          if (entry.expiry < now) {
            // Entry is expired, delete it
            await fs.unlink(entryPath);
            prunedKeys.push(key);
          }
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            // Entry doesn't exist, add it to pruned keys
            prunedKeys.push(key);
          } else {
            logger.warn({ err: error, key, entryPath }, `Error checking cache entry for ${key}`);
          }
        }
      }

      // Update metadata
      for (const key of prunedKeys) {
        const keyIndex = this.metadata.keys.indexOf(key);
        if (keyIndex !== -1) {
          this.metadata.keys.splice(keyIndex, 1);
        }
      }

      this.metadata.size = this.metadata.keys.length;
      this.metadata.lastUpdated = now;

      // Save metadata
      try {
        await this.saveMetadata();
      } catch (error) {
        logger.warn({ err: error }, `Error saving metadata after pruning cache ${this.name}`);
      }

      // Update stats
      this.stats.size = this.metadata.size;
      this.stats.lastUpdated = now;

      logger.debug(`Pruned ${prunedKeys.length} entries from cache ${this.name}`);
      return prunedKeys.length;
    } catch (error) {
      logger.error({ err: error }, `Error pruning cache ${this.name}`);
      throw error;
    }
  }

  /**
   * Gets statistics about the cache.
   * @returns The cache statistics
   */
  public getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Closes the cache, stopping any automatic pruning.
   */
  public close(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }
}
