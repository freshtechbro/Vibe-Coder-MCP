/**
 * Import resolver manager for the Code-Map Generator tool.
 * This file contains a singleton class to manage import resolution.
 */

import logger from '../../../logger.js';
import {
  resolveImport,
  clearImportCache,
  getImportCacheSize,
  ImportResolverOptions
} from './importResolver.no-cache.js';

/**
 * Configuration for the import resolver.
 */
export interface ImportResolverConfig {
  /**
   * Whether to enable import resolution.
   */
  enabled: boolean;

  /**
   * Maximum size of the import cache.
   */
  cacheSize?: number;

  /**
   * Whether to use the cache.
   */
  useCache?: boolean;

  /**
   * Extensions to try when resolving imports.
   */
  extensions?: Record<string, string[]>;

  /**
   * Whether to temporarily expand the security boundary for import resolution.
   * When true, the import resolver will attempt to resolve imports outside the
   * allowed mapping directory, but will not access their content.
   * Default is true.
   */
  expandSecurityBoundary?: boolean;
}

/**
 * Manager class for import resolution.
 */
export class ImportResolverManager {
  /**
   * Singleton instance of the manager.
   */
  private static instance: ImportResolverManager;

  /**
   * Configuration for the import resolver.
   */
  private config: ImportResolverConfig = {
    enabled: false,
    useCache: false, // Disable caching to reduce memory usage
    expandSecurityBoundary: true // Enable expanded security boundary by default
  };

  /**
   * Private constructor to enforce singleton pattern.
   */
  private constructor() {
    // Set default configuration with expanded security boundary enabled
    this.config = {
      enabled: false,
      useCache: false,
      expandSecurityBoundary: true // Always enable expanded security boundary by default
    };
  }

  /**
   * Gets the singleton instance of the manager.
   *
   * @returns The singleton instance.
   */
  public static getInstance(): ImportResolverManager {
    if (!ImportResolverManager.instance) {
      ImportResolverManager.instance = new ImportResolverManager();
    }
    return ImportResolverManager.instance;
  }

  /**
   * Initializes the import resolver with the given configuration.
   *
   * @param config Configuration for the import resolver.
   */
  public initialize(config: ImportResolverConfig): void {
    this.config = {
      ...this.config,
      ...config,
      // Always force expandSecurityBoundary to true for better import resolution
      expandSecurityBoundary: true
    };

    logger.debug({ config: this.config }, 'Initialized import resolver');

    // Log a warning if expandSecurityBoundary was explicitly set to false
    if (config.expandSecurityBoundary === false) {
      logger.warn('expandSecurityBoundary was set to false but is being forced to true for better import resolution');
    }
  }

  /**
   * Resolves an import path to absolute and relative paths.
   *
   * @param importPath The import path to resolve.
   * @param fromFile The file path of the file containing the import.
   * @param language The language of the file containing the import.
   * @param projectRoot The project root directory.
   * @returns The resolved import paths, or the original path if it couldn't be resolved.
   */
  public resolveImport(
    importPath: string,
    fromFile: string,
    language: string,
    projectRoot: string
  ): string;

  /**
   * Resolves an import path to absolute and relative paths.
   *
   * @param importPath The import path to resolve.
   * @param fromFile The file path of the file containing the import.
   * @param language The language of the file containing the import.
   * @param projectRoot The project root directory.
   * @param includeAbsolutePath Whether to include the absolute path in the result.
   * @returns The resolved import paths, or the original path if it couldn't be resolved.
   */
  public resolveImport(
    importPath: string,
    fromFile: string,
    language: string,
    projectRoot: string,
    includeAbsolutePath: boolean
  ): { resolvedPath?: string, absolutePath?: string };

  /**
   * Implementation of resolveImport that handles both overloads.
   */
  public resolveImport(
    importPath: string,
    fromFile: string,
    language: string,
    projectRoot: string,
    includeAbsolutePath?: boolean
  ): string | { resolvedPath?: string, absolutePath?: string } {
    // Skip resolution if disabled
    if (!this.config.enabled) {
      return includeAbsolutePath ? { resolvedPath: importPath } : importPath;
    }

    // Skip resolution for 'unknown' imports
    if (importPath === 'unknown') {
      return includeAbsolutePath ? { resolvedPath: importPath } : importPath;
    }

    try {
      // Get language-specific extensions if available
      const extensions = this.config.extensions?.[language];

      // Create options for resolution
      const options: ImportResolverOptions = {
        projectRoot,
        fromFile,
        language,
        useCache: this.config.useCache,
        extensions,
        // Always force expandSecurityBoundary to true for better import resolution
        expandSecurityBoundary: true,
        includeAbsolutePath: includeAbsolutePath === true
      };

      // Resolve the import
      const result = resolveImport(importPath, options);

      // Handle the result based on the requested return type
      if (includeAbsolutePath) {
        if (typeof result === 'string') {
          // This shouldn't happen with includeAbsolutePath=true, but handle it just in case
          return { resolvedPath: result };
        } else {
          return {
            resolvedPath: result.relativePath,
            absolutePath: result.absolutePath
          };
        }
      } else {
        if (typeof result === 'string') {
          return result;
        } else {
          return result.relativePath || importPath;
        }
      }
    } catch (error) {
      logger.warn({ err: error, importPath, fromFile }, 'Error resolving import with import resolver');
      return includeAbsolutePath ? { resolvedPath: importPath } : importPath;
    }
  }

  /**
   * Clears the import cache.
   */
  public clearCache(): void {
    clearImportCache();
    logger.debug('Cleared import resolver cache');
  }

  /**
   * Gets the size of the import cache.
   *
   * @returns The number of entries in the import cache.
   */
  public getCacheSize(): number {
    return getImportCacheSize();
  }

  /**
   * Gets the current configuration.
   *
   * @returns The current configuration.
   */
  public getConfig(): ImportResolverConfig {
    return { ...this.config };
  }

  /**
   * Checks if import resolution is enabled.
   *
   * @returns Whether import resolution is enabled.
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }
}
