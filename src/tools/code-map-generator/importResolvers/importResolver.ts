/**
 * Interface for import resolvers.
 */

import { ImportInfo } from '../codeMapModel.js';

/**
 * Interface for import resolver options.
 */
export interface ImportResolverOptions {
  [key: string]: unknown;
}

/**
 * Interface for import resolvers.
 */
export interface ImportResolver {
  /**
   * Analyzes imports in a file.
   * @param filePath Path to the file to analyze
   * @param options Options for the resolver
   * @returns Enhanced import information
   */
  analyzeImports(filePath: string, options: ImportResolverOptions): Promise<ImportInfo[]>;

  /**
   * Disposes of resources used by the resolver.
   * Should be called when the resolver is no longer needed.
   */
  dispose(): void;
}
