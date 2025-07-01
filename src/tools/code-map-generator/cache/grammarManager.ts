/**
 * Grammar Manager for the Code-Map Generator tool.
 * This file contains the GrammarManager class for lazy loading and managing Tree-sitter grammars.
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import ParserFromPackage from 'web-tree-sitter';
import logger from '../../../logger.js';
import { LanguageConfig } from '../parser.js';
import { resolveProjectPath } from '../utils/pathUtils.enhanced.js';

// Get the directory name of the current module

// Path to the directory where .wasm grammar files are expected to be.
// Grammar files are located in the 'grammars' directory relative to the source module.
// Use project root to ensure we find the files in src/ even when running from build/
const GRAMMARS_BASE_DIR = resolveProjectPath('src/tools/code-map-generator/grammars');

/**
 * Options for the GrammarManager.
 */
export interface GrammarManagerOptions {
  /**
   * The maximum number of grammars to keep in memory.
   * Default: 20
   */
  maxGrammars?: number;

  /**
   * Whether to preload common grammars on initialization.
   * Default: false
   */
  preloadCommonGrammars?: boolean;

  /**
   * The list of file extensions to preload.
   * Default: ['.js', '.ts', '.py', '.html', '.css']
   */
  preloadExtensions?: string[];

  /**
   * The base directory for grammar files.
   * Default: GRAMMARS_BASE_DIR
   */
  grammarsBaseDir?: string;

  /**
   * The maximum memory usage in bytes for all grammars combined.
   * Default: 100MB
   */
  maxMemoryUsage?: number;

  /**
   * The time in milliseconds after which an unused grammar can be unloaded.
   * Default: 10 minutes
   */
  grammarIdleTimeout?: number;

  /**
   * Whether to enable incremental parsing for large files.
   * Default: true
   */
  enableIncrementalParsing?: boolean;

  /**
   * The size threshold in bytes above which to use incremental parsing.
   * Default: 1MB
   */
  incrementalParsingThreshold?: number;
}

/**
 * Manages Tree-sitter grammars with lazy loading and LRU eviction.
 */
export class GrammarManager {
  private initialized: boolean = false;
  private parser: ParserFromPackage | null = null;
  private grammars: Map<string, ParserFromPackage.Language> = new Map();
  private grammarConfigs: Record<string, LanguageConfig> = {};
  private lruList: string[] = []; // Tracks grammar usage for LRU eviction
  private options: Required<GrammarManagerOptions>;
  private grammarsBaseDir: string;
  private grammarSizes: Map<string, number> = new Map(); // Tracks memory usage of each grammar
  private lastUsedTimestamps: Map<string, number> = new Map(); // Tracks when each grammar was last used
  private totalMemoryUsage: number = 0; // Total estimated memory usage of all loaded grammars

  /**
   * Default options for the GrammarManager.
   */
  private static readonly DEFAULT_OPTIONS: Required<GrammarManagerOptions> = {
    maxGrammars: 20,
    preloadCommonGrammars: false, // Changed from true to false
    preloadExtensions: ['.js', '.ts', '.py', '.html', '.css'], // Reduced list
    grammarsBaseDir: GRAMMARS_BASE_DIR,
    maxMemoryUsage: 100 * 1024 * 1024, // 100MB
    grammarIdleTimeout: 5 * 60 * 1000, // Reduced from 10 to 5 minutes
    enableIncrementalParsing: true,
    incrementalParsingThreshold: 1 * 1024 * 1024 // 1MB
  };

  /**
   * Creates a new GrammarManager instance.
   * @param grammarConfigs The language configurations
   * @param options The manager options
   */
  constructor(
    grammarConfigs: Record<string, LanguageConfig>,
    options: GrammarManagerOptions = {}
  ) {
    this.grammarConfigs = grammarConfigs;

    // Apply default options
    this.options = {
      ...GrammarManager.DEFAULT_OPTIONS,
      ...options
    };

    this.grammarsBaseDir = this.options.grammarsBaseDir;

    logger.info(`Grammar files directory: ${this.grammarsBaseDir}`);
    logger.debug(`GrammarManager created with max grammars: ${this.options.maxGrammars}`);
  }

  /**
   * Initializes the grammar manager.
   * @returns A promise that resolves when the manager is initialized
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize Tree-sitter
      await ParserFromPackage.init();
      this.parser = new ParserFromPackage();

      // Set initialized flag BEFORE preloading grammars
      this.initialized = true;

      // Preload common grammars if enabled
      if (this.options.preloadCommonGrammars) {
        await this.preloadGrammars();
      }

      logger.info('GrammarManager initialized successfully.');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize GrammarManager.');
      throw error;
    }
  }

  /**
   * Preloads common grammars.
   * @returns A promise that resolves when the grammars are preloaded
   */
  public async preloadGrammars(): Promise<void> {
    logger.debug(`Preloading grammars for extensions: ${this.options.preloadExtensions.join(', ')}`);

    const preloadPromises = this.options.preloadExtensions.map(ext =>
      this.loadGrammar(ext).catch(error => {
        logger.warn({ err: error, extension: ext }, `Failed to preload grammar for ${ext}`);
      })
    );

    await Promise.all(preloadPromises);
  }

  /**
   * Loads a grammar for a file extension.
   * @param extension The file extension
   * @returns A promise that resolves to the loaded language
   */
  public async loadGrammar(extension: string): Promise<ParserFromPackage.Language> {
    this.ensureInitialized();

    // Check if the grammar is already loaded
    if (this.grammars.has(extension)) {
      // Update LRU list and last used timestamp
      this.updateLRU(extension);
      this.lastUsedTimestamps.set(extension, Date.now());
      return this.grammars.get(extension)!;
    }

    // Get the language configuration
    const langConfig = this.grammarConfigs[extension];
    if (!langConfig) {
      throw new Error(`No language configuration found for extension: ${extension}`);
    }

    // Check if we need to unload grammars due to memory constraints
    await this.checkMemoryUsage();

    // Load the grammar
    try {
      const wasmPath = path.join(this.grammarsBaseDir, langConfig.wasmPath);

      // Check if the .wasm file exists
      try {
        await fs.access(wasmPath, fs.constants.F_OK);
        logger.debug(`Grammar file found: ${wasmPath}`);
      } catch (accessError) {
        // File not found
        logger.error({
          err: accessError,
          grammarName: langConfig.name,
          wasmPath: wasmPath,
          cwd: process.cwd()
        }, `File not found: Tree-sitter grammar for ${langConfig.name}. Ensure '${langConfig.wasmPath}' exists in '${this.grammarsBaseDir}'.`);

        throw new Error(`Grammar file not found: ${wasmPath}`);
      }

      // Get file stats to estimate memory usage
      const stats = await fs.stat(wasmPath);
      const fileSize = stats.size;

      // Estimate memory usage (typically 3-5x the file size when loaded)
      const estimatedMemoryUsage = fileSize * 4;

      // Check if loading this grammar would exceed memory limits
      if (this.totalMemoryUsage + estimatedMemoryUsage > this.options.maxMemoryUsage) {
        // Try to free up memory
        const freedMemory = await this.unloadLeastRecentlyUsedGrammars(estimatedMemoryUsage);

        // If we still don't have enough memory, log a warning but continue
        if (this.totalMemoryUsage + estimatedMemoryUsage - freedMemory > this.options.maxMemoryUsage) {
          logger.warn({
            grammarName: langConfig.name,
            extension,
            estimatedMemoryUsage: this.formatBytes(estimatedMemoryUsage),
            totalMemoryUsage: this.formatBytes(this.totalMemoryUsage),
            maxMemoryUsage: this.formatBytes(this.options.maxMemoryUsage)
          }, `Loading grammar for ${langConfig.name} may exceed memory limits`);
        }
      }

      // Load the grammar
      const language = await ParserFromPackage.Language.load(wasmPath);

      // Evict least recently used grammar if we've reached the limit
      if (this.grammars.size >= this.options.maxGrammars) {
        this.evictLRU();
      }

      // Add the grammar to the cache
      this.grammars.set(extension, language);
      this.updateLRU(extension);
      this.lastUsedTimestamps.set(extension, Date.now());

      // Track memory usage
      this.grammarSizes.set(extension, estimatedMemoryUsage);
      this.totalMemoryUsage += estimatedMemoryUsage;

      logger.info({
        grammarName: langConfig.name,
        extension,
        memoryUsage: this.formatBytes(estimatedMemoryUsage),
        totalMemoryUsage: this.formatBytes(this.totalMemoryUsage)
      }, `Successfully loaded Tree-sitter grammar for ${langConfig.name} (${extension})`);

      return language;
    } catch (error) {
      logger.error({
        err: error,
        grammarName: langConfig.name,
        extension
      }, `Failed to load Tree-sitter grammar for ${langConfig.name}`);
      throw error;
    }
  }

  /**
   * Updates the LRU list for a grammar.
   * @param extension The file extension
   */
  private updateLRU(extension: string): void {
    // Remove the extension from the LRU list if it exists
    const index = this.lruList.indexOf(extension);
    if (index !== -1) {
      this.lruList.splice(index, 1);
    }

    // Add the extension to the front of the LRU list
    this.lruList.unshift(extension);
  }

  /**
   * Evicts the least recently used grammar.
   */
  private evictLRU(): void {
    if (this.lruList.length === 0) {
      return;
    }

    // Get the least recently used extension
    const lruExtension = this.lruList.pop();
    if (lruExtension) {
      // Get memory usage before removing
      const memoryUsage = this.grammarSizes.get(lruExtension) || 0;

      // Remove the grammar from the cache
      this.grammars.delete(lruExtension);
      this.grammarSizes.delete(lruExtension);
      this.lastUsedTimestamps.delete(lruExtension);

      // Update total memory usage
      this.totalMemoryUsage = Math.max(0, this.totalMemoryUsage - memoryUsage);

      logger.debug({
        extension: lruExtension,
        freedMemory: this.formatBytes(memoryUsage),
        totalMemoryUsage: this.formatBytes(this.totalMemoryUsage)
      }, `Evicted grammar for extension ${lruExtension} due to LRU policy`);
    }
  }

  /**
   * Checks memory usage and unloads unused grammars if necessary.
   */
  private async checkMemoryUsage(): Promise<void> {
    // Check if we're over the memory limit
    if (this.totalMemoryUsage > this.options.maxMemoryUsage * 0.8) { // Reduced from 0.9 to be more conservative
      logger.info({
        totalMemoryUsage: this.formatBytes(this.totalMemoryUsage),
        maxMemoryUsage: this.formatBytes(this.options.maxMemoryUsage)
      }, 'Grammar memory usage is high, unloading unused grammars');

      await this.unloadUnusedGrammars();
    }

    // Check for idle grammars
    const now = Date.now();
    const idleExtensions: string[] = [];

    for (const [extension, lastUsed] of this.lastUsedTimestamps.entries()) {
      if (now - lastUsed > this.options.grammarIdleTimeout) {
        idleExtensions.push(extension);
      }
    }

    // Unload idle grammars
    if (idleExtensions.length > 0) {
      for (const extension of idleExtensions) {
        this.unloadGrammar(extension);
      }

      logger.debug({
        count: idleExtensions.length,
        extensions: idleExtensions
      }, `Unloaded ${idleExtensions.length} idle grammars`);
    }
  }

  /**
   * Unloads unused grammars to free up memory.
   * @returns A promise that resolves when the operation is complete
   */
  public async unloadUnusedGrammars(): Promise<void> {
    // Sort grammars by last used time (oldest first)
    const sortedExtensions = Array.from(this.lastUsedTimestamps.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([extension]) => extension);

    // Keep at least 5 most recently used grammars
    const extensionsToUnload = sortedExtensions.slice(0, -5);

    // Unload grammars
    for (const extension of extensionsToUnload) {
      this.unloadGrammar(extension);
    }

    logger.info({
      count: extensionsToUnload.length,
      totalMemoryUsage: this.formatBytes(this.totalMemoryUsage)
    }, `Unloaded ${extensionsToUnload.length} unused grammars`);
  }

  /**
   * Unloads the least recently used grammars to free up a specific amount of memory.
   * @param requiredMemory The amount of memory to free up
   * @returns The amount of memory freed
   */
  private async unloadLeastRecentlyUsedGrammars(requiredMemory: number): Promise<number> {
    // Sort grammars by last used time (oldest first)
    const sortedExtensions = Array.from(this.lastUsedTimestamps.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([extension]) => extension);

    // Keep at least 3 most recently used grammars
    const candidateExtensions = sortedExtensions.slice(0, -3);

    let freedMemory = 0;

    // Unload grammars until we've freed enough memory
    for (const extension of candidateExtensions) {
      const memoryUsage = this.grammarSizes.get(extension) || 0;

      this.unloadGrammar(extension);
      freedMemory += memoryUsage;

      if (freedMemory >= requiredMemory) {
        break;
      }
    }

    logger.debug({
      requiredMemory: this.formatBytes(requiredMemory),
      freedMemory: this.formatBytes(freedMemory)
    }, `Freed ${this.formatBytes(freedMemory)} of memory by unloading grammars`);

    return freedMemory;
  }

  /**
   * Unloads a grammar.
   * @param extension The file extension
   */
  private unloadGrammar(extension: string): void {
    // Skip if the grammar is not loaded
    if (!this.grammars.has(extension)) {
      return;
    }

    // Get memory usage before removing
    const memoryUsage = this.grammarSizes.get(extension) || 0;

    // Remove the grammar from the cache
    this.grammars.delete(extension);
    this.grammarSizes.delete(extension);
    this.lastUsedTimestamps.delete(extension);

    // Remove from LRU list
    const index = this.lruList.indexOf(extension);
    if (index !== -1) {
      this.lruList.splice(index, 1);
    }

    // Update total memory usage
    this.totalMemoryUsage = Math.max(0, this.totalMemoryUsage - memoryUsage);

    logger.debug({
      extension,
      freedMemory: this.formatBytes(memoryUsage),
      totalMemoryUsage: this.formatBytes(this.totalMemoryUsage)
    }, `Unloaded grammar for extension ${extension}`);
  }

  /**
   * Formats a byte value into a human-readable string.
   * @param bytes The number of bytes
   * @returns A human-readable string (e.g., "1.23 MB")
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Gets a parser configured for a file extension.
   * @param extension The file extension
   * @returns A promise that resolves to the configured parser
   */
  public async getParserForExtension(extension: string): Promise<ParserFromPackage> {
    this.ensureInitialized();

    // Load the grammar if not already loaded
    const language = await this.loadGrammar(extension);

    // Set the language on the parser
    this.parser!.setLanguage(language);

    return this.parser!;
  }

  /**
   * Gets a parser configured for a file extension with memory awareness.
   * @param extension The file extension
   * @returns A promise that resolves to the configured parser
   */
  public async getParserForExtensionWithMemoryAwareness(extension: string): Promise<ParserFromPackage> {
    this.ensureInitialized();

    // Load the grammar with memory awareness
    const language = await this.loadGrammarWithMemoryAwareness(extension);

    // Set the language on the parser
    this.parser!.setLanguage(language);

    return this.parser!;
  }

  /**
   * Ensures the grammar manager is initialized.
   * @throws Error if the manager is not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('GrammarManager is not initialized. Call initialize() first.');
    }
  }

  /**
   * Gets memory usage statistics.
   * @returns Memory usage statistics
   */
  private async getMemoryStats(): Promise<{
    heapUsed: number;
    heapTotal: number;
    rss: number;
    systemTotal: number;
    memoryUsagePercentage: number;
    formatted: {
      heapUsed: string;
      heapTotal: string;
      rss: string;
      systemTotal: string;
    };
  }> {
    const memoryUsage = process.memoryUsage();
    const systemTotal = os.totalmem();
    const memoryUsagePercentage = memoryUsage.rss / systemTotal;

    return {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      rss: memoryUsage.rss,
      systemTotal,
      memoryUsagePercentage,
      formatted: {
        heapUsed: this.formatBytes(memoryUsage.heapUsed),
        heapTotal: this.formatBytes(memoryUsage.heapTotal),
        rss: this.formatBytes(memoryUsage.rss),
        systemTotal: this.formatBytes(systemTotal)
      }
    };
  }

  /**
   * Estimates the size of a grammar based on its configuration.
   * @param langConfig The language configuration
   * @returns The estimated size in bytes
   */
  private estimateGrammarSize(langConfig: LanguageConfig): number {
    // Use a simple heuristic based on the grammar name
    // In reality, different grammars have different sizes
    const baseSize = 3 * 1024 * 1024; // 3 MB base size

    // Adjust based on known grammar sizes
    const grammarSizeMultipliers: Record<string, number> = {
      'JavaScript': 1.2, // JavaScript grammar is larger than average
      'TypeScript': 1.5, // TypeScript grammar is quite large
      'Python': 1.0, // Python grammar is average
      'HTML': 0.8, // HTML grammar is smaller than average
      'CSS': 0.7, // CSS grammar is smaller than average
      'C++': 1.8, // C++ grammar is very large
      'Java': 1.3, // Java grammar is larger than average
      'Ruby': 1.1, // Ruby grammar is slightly larger than average
      'Go': 0.9, // Go grammar is slightly smaller than average
      'Rust': 1.4, // Rust grammar is larger than average
    };

    const multiplier = grammarSizeMultipliers[langConfig.name] || 1.0;
    return baseSize * multiplier;
  }

  /**
   * Loads a grammar with memory awareness.
   * @param extension The file extension
   * @returns A promise that resolves to the loaded language
   */
  public async loadGrammarWithMemoryAwareness(extension: string): Promise<ParserFromPackage.Language> {
    this.ensureInitialized();

    // Check if the grammar is already loaded
    if (this.grammars.has(extension)) {
      // Update LRU list and last used timestamp
      this.updateLRU(extension);
      this.lastUsedTimestamps.set(extension, Date.now());
      return this.grammars.get(extension)!;
    }

    // Get the language configuration
    const langConfig = this.grammarConfigs[extension];
    if (!langConfig) {
      throw new Error(`No language configuration found for extension: ${extension}`);
    }

    // Check current memory usage before loading
    const memoryStats = await this.getMemoryStats();
    const estimatedGrammarSize = this.estimateGrammarSize(langConfig);

    logger.debug({
      extension,
      grammarName: langConfig.name,
      estimatedSize: this.formatBytes(estimatedGrammarSize),
      currentMemoryUsage: this.formatBytes(this.totalMemoryUsage),
      maxMemoryUsage: this.formatBytes(this.options.maxMemoryUsage)
    }, `Preparing to load grammar for ${langConfig.name}`);

    // If memory usage is high, perform more aggressive cleanup
    if (memoryStats.memoryUsagePercentage > 0.7) {
      logger.info(`Memory usage high (${memoryStats.memoryUsagePercentage.toFixed(2)}%), performing aggressive cleanup before loading new grammar`);

      // Unload more grammars than strictly necessary to create a buffer
      const requiredMemory = estimatedGrammarSize * 1.5; // Add 50% buffer
      await this.unloadLeastRecentlyUsedGrammars(requiredMemory);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    } else if (this.grammars.size >= this.options.maxGrammars) {
      // If we've reached the grammar limit but memory isn't critical,
      // just evict the least recently used grammar
      this.evictLRU();
    }

    // Load the grammar
    try {
      const wasmPath = path.join(this.grammarsBaseDir, langConfig.wasmPath);

      // Check if the .wasm file exists
      try {
        await fs.access(wasmPath, fs.constants.F_OK);
        logger.debug(`Grammar file found: ${wasmPath}`);
      } catch {
        throw new Error(`Grammar file not found: ${wasmPath}`);
      }

      // Load the grammar with timing measurement
      const startTime = performance.now();
      const language = await ParserFromPackage.Language.load(wasmPath);
      const loadTime = performance.now() - startTime;

      // Add the grammar to the cache
      this.grammars.set(extension, language);
      this.updateLRU(extension);
      this.lastUsedTimestamps.set(extension, Date.now());

      // Update grammar size estimate
      const estimatedMemoryUsage = this.estimateGrammarSize(langConfig);
      this.grammarSizes.set(extension, estimatedMemoryUsage);
      this.totalMemoryUsage += estimatedMemoryUsage;

      logger.info({
        extension,
        grammarName: langConfig.name,
        loadTimeMs: loadTime.toFixed(2),
        estimatedSize: this.formatBytes(estimatedMemoryUsage),
        totalMemoryUsage: this.formatBytes(this.totalMemoryUsage),
        totalGrammars: this.grammars.size
      }, `Successfully loaded grammar for ${langConfig.name}`);

      return language;
    } catch (error) {
      logger.error({
        err: error,
        grammarName: langConfig.name,
        extension
      }, `Failed to load Tree-sitter grammar for ${langConfig.name}`);
      throw error;
    }
  }

  /**
   * Checks if the grammar manager is initialized.
   * @returns Whether the grammar manager is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Gets the list of loaded grammar extensions.
   * @returns The list of loaded grammar extensions
   */
  public getLoadedGrammars(): string[] {
    return Array.from(this.grammars.keys());
  }

  /**
   * Gets statistics about the grammar manager.
   * @returns The grammar manager statistics
   */
  public getStats(): Record<string, unknown> {
    const grammarStats: Record<string, unknown>[] = [];

    // Collect stats for each grammar
    for (const [extension] of this.grammars.entries()) {
      const size = this.grammarSizes.get(extension) || 0;
      const lastUsed = this.lastUsedTimestamps.get(extension) || 0;
      const lruIndex = this.lruList.indexOf(extension);

      grammarStats.push({
        extension,
        size,
        sizeFormatted: this.formatBytes(size),
        lastUsed: new Date(lastUsed).toISOString(),
        idleTime: Date.now() - lastUsed,
        lruIndex: lruIndex === -1 ? 'not in LRU' : lruIndex
      });
    }

    // Sort by size (largest first)
    grammarStats.sort((a, b) => (b.size as number) - (a.size as number));

    return {
      loadedGrammars: this.grammars.size,
      maxGrammars: this.options.maxGrammars,
      totalMemoryUsage: this.totalMemoryUsage,
      totalMemoryUsageFormatted: this.formatBytes(this.totalMemoryUsage),
      maxMemoryUsage: this.options.maxMemoryUsage,
      maxMemoryUsageFormatted: this.formatBytes(this.options.maxMemoryUsage),
      memoryUsagePercentage: (this.totalMemoryUsage / this.options.maxMemoryUsage) * 100,
      lruList: [...this.lruList],
      initialized: this.initialized,
      grammars: grammarStats
    };
  }

  /**
   * Gets the options used by the grammar manager.
   * @returns The grammar manager options
   */
  public getOptions(): Required<GrammarManagerOptions> {
    return { ...this.options };
  }

  /**
   * Prepares grammars for a batch of files.
   * @param fileExtensions Array of file extensions in the upcoming batch
   * @returns A promise that resolves when grammars are prepared
   */
  public async prepareGrammarsForBatch(fileExtensions: string[]): Promise<void> {
    // Count extensions in the batch
    const extensionCounts = new Map<string, number>();
    for (const ext of fileExtensions) {
      extensionCounts.set(ext, (extensionCounts.get(ext) || 0) + 1);
    }

    // Sort extensions by frequency in the batch
    const sortedExtensions = Array.from(extensionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([ext]) => ext);

    // Determine how many grammars we can load based on memory
    const availableMemory = this.options.maxMemoryUsage - this.totalMemoryUsage;
    const estimatedSizes = new Map<string, number>();

    let totalEstimatedSize = 0;
    const extensionsToLoad: string[] = [];

    // Calculate which grammars we can load
    for (const ext of sortedExtensions) {
      // Skip already loaded grammars
      if (this.grammars.has(ext)) continue;

      const langConfig = this.grammarConfigs[ext];
      if (!langConfig) continue;

      const estimatedSize = this.estimateGrammarSize(langConfig);
      estimatedSizes.set(ext, estimatedSize);

      // Check if we can load this grammar
      if (totalEstimatedSize + estimatedSize <= availableMemory) {
        extensionsToLoad.push(ext);
        totalEstimatedSize += estimatedSize;
      }
    }

    // If we need to load more grammars than we have space for,
    // unload some existing grammars
    if (extensionsToLoad.length < sortedExtensions.length) {
      // Calculate how much memory we need to free
      const additionalMemoryNeeded = totalEstimatedSize - availableMemory;
      if (additionalMemoryNeeded > 0) {
        await this.unloadLeastRecentlyUsedGrammars(additionalMemoryNeeded);
      }
    }

    // Load grammars in parallel
    const loadPromises = extensionsToLoad.map(ext =>
      this.loadGrammarWithMemoryAwareness(ext).catch(error => {
        logger.warn({ err: error, extension: ext }, `Failed to preload grammar for batch`);
        return null;
      })
    );

    await Promise.all(loadPromises);

    logger.info({
      batchSize: fileExtensions.length,
      uniqueExtensions: sortedExtensions.length,
      loadedExtensions: extensionsToLoad.length
    }, `Prepared grammars for batch processing`);
  }

  // The unloadUnusedGrammars method is already defined above
}
