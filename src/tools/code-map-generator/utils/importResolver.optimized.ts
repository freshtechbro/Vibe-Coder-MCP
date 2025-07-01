/**
 * Import resolver utility for the Code-Map Generator tool.
 * This file contains utilities for resolving import paths.
 */

import resolve from 'resolve';
import * as path from 'path';
import logger from '../../../logger.js';

/**
 * LRU Cache implementation for resolved imports.
 * This helps limit memory usage while still providing caching benefits.
 */
class LRUCache {
  private cache: Map<string, string>;
  private maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map<string, string>();
    this.maxSize = maxSize;
  }

  /**
   * Gets a value from the cache.
   *
   * @param key The cache key.
   * @returns The cached value, or undefined if not found.
   */
  get(key: string): string | undefined {
    // If the key exists, delete it and re-add it to make it the most recently used
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  /**
   * Sets a value in the cache.
   *
   * @param key The cache key.
   * @param value The value to cache.
   */
  set(key: string, value: string): void {
    // If the key already exists, delete it first
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // If the cache is full, delete the least recently used entry
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    // Add the new entry
    this.cache.set(key, value);
  }

  /**
   * Checks if the cache has a key.
   *
   * @param key The cache key.
   * @returns Whether the cache has the key.
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Clears the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Gets the size of the cache.
   *
   * @returns The number of entries in the cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Gets the keys in the cache.
   *
   * @returns An iterator over the keys in the cache.
   */
  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  /**
   * Deletes a key from the cache.
   *
   * @param key The key to delete.
   * @returns Whether the key was deleted.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }
}

/**
 * Cache for resolved imports to improve performance.
 * Using a smaller cache size to reduce memory usage.
 */
const importCache = new LRUCache(1000);


/**
 * Options for resolving imports.
 */
export interface ImportResolverOptions {
  /**
   * The project root directory.
   */
  projectRoot: string;

  /**
   * The file path of the file containing the import.
   */
  fromFile: string;

  /**
   * The language of the file containing the import.
   */
  language: string;

  /**
   * Whether to use the cache.
   */
  useCache?: boolean;

  /**
   * Extensions to try when resolving imports.
   */
  extensions?: string[];
}

/**
 * Resolves an import path to an absolute path.
 *
 * @param importPath The import path to resolve.
 * @param options Options for resolving the import.
 * @returns The resolved import path, or the original path if it couldn't be resolved.
 */
export function resolveImport(
  importPath: string,
  options: ImportResolverOptions
): string {
  // Skip resolution for built-in modules
  if (isBuiltinModule(importPath)) {
    return importPath;
  }

  // Generate a cache key
  const cacheKey = `${options.fromFile}:${importPath}:${options.language}`;

  // Check cache first if enabled
  if (options.useCache !== false && importCache.has(cacheKey)) {
    return importCache.get(cacheKey)!;
  }

  try {
    // Handle external packages differently
    if (isExternalPackage(importPath)) {
      // For external packages, we can't resolve them to absolute paths
      // But we can extract the package name for better display
      const packageName = getPackageName(importPath);

      // Try to resolve the package if it's installed
      try {
        // Get the directory containing the file
        const basedir = path.dirname(options.fromFile);

        // Try to resolve just the package name to see if it's installed
        const resolvedPackage = resolve.sync(packageName, {
          basedir,
          preserveSymlinks: false
        });

        // If we get here, the package is installed
        // We can't resolve the exact import, but we can show that the package exists
        logger.debug({ packageName, resolvedPackage }, 'Package exists but specific import cannot be resolved');

        // Return the original import path since we can't resolve it exactly
        return importPath;
      } catch (packageError) {
        // Package not found, return the original import path
        logger.debug({ err: packageError, packageName }, 'Package not found');
        return importPath;
      }
    }

    // Get the directory containing the file
    const basedir = path.dirname(options.fromFile);

    // Default extensions based on language
    const extensions = options.extensions || getDefaultExtensions(options.language);

    // Try to resolve the import
    const resolvedPath = resolve.sync(importPath, {
      basedir,
      extensions,
      preserveSymlinks: false
    });

    // If we have a project root, make the path relative to it
    let finalPath = resolvedPath;
    if (options.projectRoot) {
      // Check if the resolved path is within the project root
      if (resolvedPath.startsWith(options.projectRoot)) {
        // Make the path relative to the project root
        finalPath = path.relative(options.projectRoot, resolvedPath);

        // Ensure consistent path format (use forward slashes)
        finalPath = finalPath.replace(/\\/g, '/');

        // Add a ./ prefix if it doesn't start with one
        if (!finalPath.startsWith('./') && !finalPath.startsWith('../')) {
          finalPath = `./${finalPath}`;
        }

        logger.debug({
          originalPath: importPath,
          resolvedPath,
          finalPath,
          projectRoot: options.projectRoot
        }, 'Resolved import path relative to project root');
      } else {
        // The resolved path is outside the project root
        logger.debug({
          originalPath: importPath,
          resolvedPath,
          projectRoot: options.projectRoot
        }, 'Resolved import path is outside project root');
      }
    }

    // Cache the result if caching is enabled
    if (options.useCache !== false) {
      importCache.set(cacheKey, finalPath);
    }

    return finalPath;
  } catch (error) {
    // Log the error
    logger.debug({ err: error, importPath, fromFile: options.fromFile }, 'Error resolving import');

    // Return the original import path
    return importPath;
  }
}

/**
 * Clears the import cache.
 */
export function clearImportCache(): void {
  importCache.clear();
}

/**
 * Gets the size of the import cache.
 *
 * @returns The number of entries in the import cache.
 */
export function getImportCacheSize(): number {
  return importCache.size;
}

/**
 * Checks if a module is a built-in Node.js module.
 *
 * @param moduleName The name of the module to check.
 * @returns Whether the module is a built-in Node.js module.
 */
function isBuiltinModule(moduleName: string): boolean {
  // List of built-in Node.js modules
  const builtinModules = [
    'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
    'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
    'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
    'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'timers',
    'tls', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib'
  ];

  return builtinModules.includes(moduleName);
}

/**
 * Checks if a module is an external package.
 *
 * @param moduleName The name of the module to check.
 * @returns Whether the module is an external package.
 */
function isExternalPackage(moduleName: string): boolean {
  // Check if the module name starts with a package name
  // This is a simple heuristic that works for most cases
  return !moduleName.startsWith('.') && !moduleName.startsWith('/') && !isBuiltinModule(moduleName);
}

/**
 * Gets the package name from a module name.
 *
 * @param moduleName The name of the module to get the package name from.
 * @returns The package name.
 */
function getPackageName(moduleName: string): string {
  // Handle scoped packages
  if (moduleName.startsWith('@')) {
    const parts = moduleName.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
  }

  // Handle regular packages
  const parts = moduleName.split('/');
  return parts[0];
}

/**
 * Gets the default extensions for a language.
 *
 * @param language The language to get extensions for.
 * @returns An array of file extensions for the language.
 */
function getDefaultExtensions(language: string): string[] {
  switch (language) {
    case 'javascript':
      return ['.js', '.json', '.node', '.mjs', '.cjs'];
    case 'typescript':
      return ['.ts', '.tsx', '.js', '.jsx', '.json', '.node'];
    case 'python':
      return ['.py', '.pyw', '.pyc', '.pyo', '.pyd'];
    case 'java':
      return ['.java', '.class', '.jar'];
    case 'csharp':
      return ['.cs', '.dll'];
    case 'go':
      return ['.go'];
    case 'ruby':
      return ['.rb', '.rake', '.gemspec'];
    case 'rust':
      return ['.rs'];
    case 'php':
      return ['.php'];
    default:
      return ['.js', '.json', '.node']; // Default to JavaScript
  }
}
