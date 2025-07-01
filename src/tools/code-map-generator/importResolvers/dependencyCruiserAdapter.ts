/**
 * Adapter for Dependency-Cruiser integration with code-map-generator.
 * Provides enhanced import resolution for JavaScript and TypeScript.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../../../logger.js';
import { ImportInfo, ImportedItem } from '../codeMapModel.js';
import { SecurityBoundaryValidator } from '../utils/securityBoundaryValidator.js';
import { ImportResolverOptions } from './importResolver.js';

const execAsync = promisify(exec);

interface DependencyCruiserOptions {
  baseDir: string;
  includeOnly?: string[];
  exclude?: string[];
  maxDepth?: number;
  outputFormat?: 'json' | 'dot' | 'csv';
  tsConfig?: string;
}

interface DependencyCruiserResult {
  modules: DependencyCruiserModule[];
  summary: {
    violations: unknown[];
    error: number;
    warn: number;
    info: number;
  };
}

interface DependencyCruiserModule {
  source: string;
  dependencies: DependencyCruiserDependency[];
}

interface DependencyCruiserDependency {
  resolved: string;
  coreModule: boolean;
  followable: boolean;
  dynamic: boolean;
  module: string;
  moduleSystem: string;
  exoticallyRequired: boolean;
  dependencyTypes: string[];
}

/**
 * Adapter class for Dependency-Cruiser integration.
 */
export class DependencyCruiserAdapter {
  private securityValidator: SecurityBoundaryValidator;
  private cache: Map<string, ImportInfo[]> = new Map();
  private tempFiles: string[] = [];

  constructor(private allowedDir: string, private outputDir: string) {
    this.securityValidator = new SecurityBoundaryValidator(allowedDir, outputDir);
  }

  /**
   * Analyzes JavaScript/TypeScript imports using Dependency-Cruiser.
   * @param filePath Path to the file to analyze
   * @param options Options for Dependency-Cruiser
   * @returns Enhanced import information
   */
  public async analyzeImports(
    filePath: string,
    options: ImportResolverOptions
  ): Promise<ImportInfo[]> {
    try {
      // Convert ImportResolverOptions to DependencyCruiserOptions
      const cruiserOptions: DependencyCruiserOptions = {
        baseDir: (options.baseDir as string) || path.dirname(filePath),
        includeOnly: options.includeOnly as string[] | undefined,
        exclude: options.exclude as string[] | undefined,
        maxDepth: options.maxDepth as number | undefined,
        outputFormat: (options.outputFormat as 'json' | 'dot' | 'csv') || 'json',
        tsConfig: options.tsConfig as string | undefined
      };

      // Generate cache key
      const cacheKey = `${filePath}:${JSON.stringify(cruiserOptions)}`;

      // Check cache first
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!;
      }

      // Validate file path is within security boundary
      if (!this.securityValidator.isPathWithinAllowedDirectory(filePath)) {
        logger.warn({ filePath }, 'File path is outside allowed directory');
        return [];
      }

      // Create temporary output file for Dependency-Cruiser results
      const tempOutputFile = path.join(
        this.outputDir,
        `dependency-cruiser-${Date.now()}.json`
      );

      // Track the temporary file
      this.tempFiles.push(tempOutputFile);

      // Build Dependency-Cruiser command
      const command = this.buildDependencyCruiserCommand(
        filePath,
        tempOutputFile,
        cruiserOptions
      );

      // Execute Dependency-Cruiser
      await execAsync(command);

      // Read and parse results
      const resultJson = await fs.promises.readFile(tempOutputFile, 'utf8');
      const result: DependencyCruiserResult = JSON.parse(resultJson);

      // Convert results to ImportInfo format
      const imports = this.convertToImportInfo(result, filePath);

      // Clean up temporary file
      await fs.promises.unlink(tempOutputFile);

      // Remove from tracked files
      const fileIndex = this.tempFiles.indexOf(tempOutputFile);
      if (fileIndex !== -1) {
        this.tempFiles.splice(fileIndex, 1);
      }

      // Cache results
      this.cache.set(cacheKey, imports);

      return imports;
    } catch (error) {
      logger.error(
        { err: error, filePath },
        'Error analyzing imports with Dependency-Cruiser'
      );
      return [];
    }
  }

  /**
   * Builds the Dependency-Cruiser command.
   */
  private buildDependencyCruiserCommand(
    filePath: string,
    outputFile: string,
    options: DependencyCruiserOptions
  ): string {
    const baseCommand = 'npx depcruise';
    const outputFormat = options.outputFormat || 'json';

    let command = `${baseCommand} --output-type ${outputFormat} --output-to ${outputFile}`;

    // Add include patterns
    if (options.includeOnly && options.includeOnly.length > 0) {
      command += ` --include-only "${options.includeOnly.join(',')}"`;
    }

    // Add exclude patterns
    if (options.exclude && options.exclude.length > 0) {
      command += ` --exclude "${options.exclude.join(',')}"`;
    }

    // Add max depth
    if (options.maxDepth) {
      command += ` --max-depth ${options.maxDepth}`;
    }

    // Add tsconfig
    if (options.tsConfig) {
      command += ` --ts-config ${options.tsConfig}`;
    }

    // Add file path
    command += ` "${filePath}"`;

    return command;
  }

  /**
   * Converts Dependency-Cruiser results to ImportInfo format.
   */
  private convertToImportInfo(
    result: DependencyCruiserResult,
    filePath: string
  ): ImportInfo[] {
    const imports: ImportInfo[] = [];

    // Find the module that matches our file path
    const normalizedFilePath = path.normalize(filePath);
    const module = result.modules.find(
      m => path.normalize(m.source) === normalizedFilePath
    );

    if (!module) {
      return imports;
    }

    // Process each dependency
    for (const dependency of module.dependencies) {
      const importedItems: ImportedItem[] = [];

      // Create a default imported item
      importedItems.push({
        name: this.extractNameFromPath(dependency.module),
        path: dependency.resolved,
        isDefault: false,
        isNamespace: false,
        nodeText: dependency.module
      });

      // Create import info
      const importInfo: ImportInfo = {
        path: dependency.resolved,
        importedItems,
        isDynamic: dependency.dynamic,
        isRelative: this.isRelativePath(dependency.module),
        isCore: dependency.coreModule,
        moduleSystem: dependency.moduleSystem,
        metadata: {
          dependencyTypes: dependency.dependencyTypes,
          exoticallyRequired: dependency.exoticallyRequired
        }
      };

      imports.push(importInfo);
    }

    return imports;
  }

  /**
   * Extracts the name from an import path.
   */
  private extractNameFromPath(importPath: string): string {
    // Handle relative paths
    if (this.isRelativePath(importPath)) {
      const basename = path.basename(importPath);
      const extname = path.extname(basename);
      return extname ? basename.slice(0, -extname.length) : basename;
    }

    // Handle package imports
    const parts = importPath.split('/');
    if (parts[0].startsWith('@') && parts.length > 1) {
      // Scoped package
      return `${parts[0]}/${parts[1]}`;
    }

    return parts[0];
  }

  /**
   * Checks if a path is relative.
   */
  private isRelativePath(importPath: string): boolean {
    return importPath.startsWith('./') || importPath.startsWith('../');
  }

  /**
   * Disposes of resources used by the adapter.
   * Should be called when the adapter is no longer needed.
   */
  public dispose(): void {
    // Clear internal caches
    this.cache.clear();

    // Clean up temporary files
    if (this.tempFiles && this.tempFiles.length > 0) {
      this.tempFiles.forEach(file => {
        try {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            logger.debug({ file }, 'Deleted temporary file during DependencyCruiserAdapter disposal');
          }
        } catch (error) {
          logger.warn({ file, error }, 'Failed to delete temporary file during DependencyCruiserAdapter disposal');
        }
      });
      this.tempFiles = [];
    }

    logger.debug('DependencyCruiserAdapter disposed');
  }
}
