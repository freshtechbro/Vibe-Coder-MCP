/**
 * Metadata-focused caching system for the Code-Map Generator tool.
 * This file contains classes and interfaces for storing lightweight metadata in memory,
 * with full content only stored when needed.
 */

import { TieredCache, TieredCacheOptions } from './tieredCache.js';
import logger from '../../../logger.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

/**
 * Interface for source code metadata.
 */
export interface SourceCodeMetadata {
  /**
   * The file path.
   */
  filePath: string;

  /**
   * The hash of the file content.
   */
  hash: string;

  /**
   * The size of the file in bytes.
   */
  size: number;

  /**
   * The last modified timestamp.
   */
  lastModified: number;

  /**
   * The language/extension of the file.
   */
  language: string;

  /**
   * Whether the file has been processed.
   */
  processed: boolean;

  /**
   * Optional content, only stored when needed.
   */
  content?: string;
}

/**
 * Interface for AST metadata.
 */
export interface ASTMetadata {
  /**
   * The file path.
   */
  filePath: string;

  /**
   * The hash of the source code.
   */
  sourceHash: string;

  /**
   * The type of the root node.
   */
  rootType: string;

  /**
   * The start byte of the root node.
   */
  rootStartByte: number;

  /**
   * The end byte of the root node.
   */
  rootEndByte: number;

  /**
   * A simplified representation of the AST structure.
   */
  structure?: MinimalASTStructure;
}

/**
 * Interface for AST node structure.
 */
export interface ASTNode {
  type: string;
  startByte: number;
  endByte: number;
  children?: ASTNode[];
  [key: string]: unknown;
}

/**
 * Interface for minimal AST structure representation.
 */
export interface MinimalASTStructure {
  type: string;
  startByte: number;
  endByte: number;
  children?: MinimalASTStructure[];
  childrenCount?: number;
}

/**
 * Options for creating a metadata cache.
 */
export interface MetadataCacheOptions extends Partial<TieredCacheOptions> {
  /**
   * The name of the cache.
   */
  name: string;

  /**
   * The directory to store cache files.
   */
  cacheDir: string;
}

/**
 * A cache that primarily stores metadata with optional content.
 */
export class MetadataCache<T extends SourceCodeMetadata | ASTMetadata> {
  private cache: TieredCache<T>;
  private name: string;

  /**
   * Creates a new metadata cache.
   * @param options The cache options
   */
  constructor(options: MetadataCacheOptions) {
    this.name = options.name;

    // Create the underlying tiered cache
    this.cache = new TieredCache<T>({
      name: options.name,
      cacheDir: options.cacheDir,
      maxEntries: options.maxEntries || 10000, // Can be higher since we're only storing metadata
      maxAge: options.maxAge || 24 * 60 * 60 * 1000, // 24 hours
      useMemoryCache: options.useMemoryCache !== false,
      memoryMaxEntries: options.memoryMaxEntries || 5000, // Can cache more entries since they're lightweight
      memoryMaxAge: options.memoryMaxAge || 60 * 60 * 1000, // 1 hour
      memoryThreshold: options.memoryThreshold || 0.5, // More aggressive threshold
      serialize: (metadata: unknown) => {
        // For source code metadata, don't include content in serialized form
        if (metadata && typeof metadata === 'object' && 'content' in metadata && (metadata as { content?: unknown }).content) {
          // Use type assertion after checking that it's an object with content property
          const { content: _content, ...rest } = metadata as { content?: unknown; [key: string]: unknown };
          void _content; // Explicitly void to acknowledge we're discarding it
          return JSON.stringify(rest);
        }
        return JSON.stringify(metadata);
      },
      deserialize: (serialized: string) => {
        return JSON.parse(serialized);
      }
    });
  }

  /**
   * Initializes the cache.
   * @returns A promise that resolves when the cache is initialized
   */
  async init(): Promise<void> {
    await this.cache.init();
    logger.info(`Initialized ${this.name} metadata cache`);
  }

  /**
   * Gets a value from the cache.
   * @param key The cache key
   * @returns A promise that resolves to the cached value, or undefined if not found
   */
  async get(key: string): Promise<T | undefined> {
    return this.cache.get(key);
  }

  /**
   * Sets a value in the cache.
   * @param key The cache key
   * @param value The value to cache
   * @returns A promise that resolves when the value is cached
   */
  async set(key: string, value: T): Promise<void> {
    await this.cache.set(key, value);
  }

  /**
   * Checks if a key exists in the cache.
   * @param key The cache key
   * @returns A promise that resolves to true if the key exists, false otherwise
   */
  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  /**
   * Deletes a value from the cache.
   * @param key The cache key
   * @returns A promise that resolves when the value is deleted
   */
  async delete(key: string): Promise<void> {
    await this.cache.delete(key);
  }

  /**
   * Clears the cache.
   * @returns A promise that resolves when the cache is cleared
   */
  async clear(): Promise<void> {
    await this.cache.clear();
  }

  /**
   * Gets cache statistics.
   * @returns Cache statistics
   */
  getStats(): unknown {
    return this.cache.getStats();
  }

  /**
   * Creates a source code metadata entry.
   * @param filePath The file path
   * @param content The file content (optional)
   * @param stats File stats (optional)
   * @returns A promise that resolves to the metadata entry
   */
  static async createSourceCodeMetadata(
    filePath: string,
    content?: string,
    stats?: fsSync.Stats
  ): Promise<SourceCodeMetadata> {
    // If content is not provided, read the file
    if (!content) {
      try {
        content = await fs.readFile(filePath, 'utf-8');
      } catch (error) {
        logger.error({ err: error, filePath }, 'Error reading file for metadata creation');
        throw error;
      }
    }

    // If stats are not provided, get them
    if (!stats) {
      try {
        stats = await fs.stat(filePath);
      } catch (error) {
        logger.error({ err: error, filePath }, 'Error getting file stats for metadata creation');
        throw error;
      }
    }

    // Create a hash of the content
    const hash = crypto.createHash('md5').update(content).digest('hex');

    return {
      filePath,
      hash,
      size: stats.size,
      lastModified: stats.mtimeMs,
      language: path.extname(filePath).toLowerCase(),
      processed: false,
      content // Include content initially, but it can be removed later
    };
  }

  /**
   * Creates an AST metadata entry.
   * @param filePath The file path
   * @param sourceHash The hash of the source code
   * @param rootNode The root node of the AST
   * @returns The metadata entry
   */
  static createASTMetadata(
    filePath: string,
    sourceHash: string,
    rootNode: ASTNode
  ): ASTMetadata {
    return {
      filePath,
      sourceHash,
      rootType: rootNode.type,
      rootStartByte: rootNode.startByte,
      rootEndByte: rootNode.endByte,
      structure: MetadataCache.extractMinimalStructure(rootNode) || undefined
    };
  }

  /**
   * Extracts a minimal structure representation from an AST node.
   * @param node The AST node
   * @param options Options for extraction
   * @returns A minimal structure representation
   */
  static extractMinimalStructure(
    node: ASTNode,
    options: { maxDepth?: number; maxChildren?: number } = {}
  ): MinimalASTStructure | null {
    const maxDepth = options.maxDepth || 3;
    const maxChildren = options.maxChildren || 10;

    function extract(node: ASTNode, depth: number): MinimalASTStructure | null {
      if (!node || depth > maxDepth) {
        return null;
      }

      const result: MinimalASTStructure = {
        type: node.type,
        startByte: node.startByte,
        endByte: node.endByte
      };

      if (node.children && node.children.length > 0) {
        result.children = node.children
          .slice(0, maxChildren)
          .map((child: ASTNode) => extract(child, depth + 1))
          .filter((child): child is MinimalASTStructure => child !== null);

        if (node.children.length > maxChildren) {
          result.childrenCount = node.children.length;
        }
      }

      return result;
    }

    return extract(node, 0);
  }
}
