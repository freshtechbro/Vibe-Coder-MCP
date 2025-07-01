/**
 * Adapter for Clangd integration with code-map-generator.
 * Provides enhanced import resolution for C/C++.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../../../logger.js';
import { ImportInfo, ImportedItem } from '../codeMapModel.js';
import { SecurityBoundaryValidator } from '../utils/securityBoundaryValidator.js';

const execAsync = promisify(exec);

interface ClangdOptions {
  clangdPath?: string;
  compileFlags?: string[];
  includePaths?: string[];
  maxDepth?: number;
}

interface ClangdIncludeResult {
  path: string;
  isSystemInclude: boolean;
  resolvedPath?: string;
}

/**
 * Adapter class for Clangd integration.
 */
export class ClangdAdapter {
  private securityValidator: SecurityBoundaryValidator;
  private cache: Map<string, ImportInfo[]> = new Map();
  private tempFiles: string[] = [];

  constructor(private allowedDir: string, private outputDir: string) {
    this.securityValidator = new SecurityBoundaryValidator(allowedDir, outputDir);
  }

  /**
   * Analyzes C/C++ imports using Clangd.
   * @param filePath Path to the file to analyze
   * @param options Options for Clangd
   * @returns Enhanced import information
   */
  public async analyzeImports(
    filePath: string,
    options: ClangdOptions
  ): Promise<ImportInfo[]> {
    try {
      // Generate cache key
      const cacheKey = `${filePath}:${JSON.stringify(options)}`;

      // Check cache first
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!;
      }

      // Validate file path is within security boundary
      if (!this.securityValidator.isPathWithinAllowedDirectory(filePath)) {
        logger.warn({ filePath }, 'File path is outside allowed directory');
        return [];
      }

      // Check if Clangd is installed
      const clangdPath = options.clangdPath || await this.findClangdPath();
      if (!clangdPath) {
        logger.warn('Clangd not found. Please install Clangd and set the path in options.');
        return [];
      }

      // Create a compilation database for the file
      const compileCommandsPath = await this.createCompilationDatabase(
        filePath,
        options.compileFlags || [],
        options.includePaths || []
      );

      // Track the temporary file
      this.tempFiles.push(compileCommandsPath);

      // Run Clangd to analyze the file
      const includes = await this.extractIncludesWithClangd(
        filePath,
        clangdPath,
        compileCommandsPath
      );

      // Convert results to ImportInfo format
      const imports = this.convertToImportInfo(includes, filePath);

      // Clean up temporary files
      await fs.promises.unlink(compileCommandsPath);

      // Remove from tracked files
      const fileIndex = this.tempFiles.indexOf(compileCommandsPath);
      if (fileIndex !== -1) {
        this.tempFiles.splice(fileIndex, 1);
      }

      // Cache results
      this.cache.set(cacheKey, imports);

      return imports;
    } catch (error) {
      logger.error(
        { err: error, filePath },
        'Error analyzing imports with Clangd'
      );
      return [];
    }
  }

  /**
   * Finds the Clangd executable path.
   */
  private async findClangdPath(): Promise<string | null> {
    try {
      // Try to find clangd in PATH
      const { stdout } = await execAsync('which clangd || which clangd-15 || which clangd-14 || which clangd-13');
      return stdout.trim();
    } catch (error) {
      logger.warn({ err: error }, 'Clangd not found in PATH');
      return null;
    }
  }

  /**
   * Creates a compilation database for Clangd.
   */
  private async createCompilationDatabase(
    filePath: string,
    compileFlags: string[],
    includePaths: string[]
  ): Promise<string> {
    // Create include flags
    const includeFlags = includePaths.map(p => `-I${p}`);

    // Create a compilation database
    const compileCommandsPath = path.join(
      this.outputDir,
      `compile_commands_${Date.now()}.json`
    );

    // Create the compilation database content
    const compileCommands = [
      {
        directory: path.dirname(filePath),
        command: `clang++ -std=c++17 ${compileFlags.join(' ')} ${includeFlags.join(' ')} -c ${filePath}`,
        file: filePath
      }
    ];

    // Write the compilation database to a file
    await fs.promises.writeFile(
      compileCommandsPath,
      JSON.stringify(compileCommands, null, 2)
    );

    return compileCommandsPath;
  }

  /**
   * Extracts includes from a C/C++ file using Clangd.
   */
  private async extractIncludesWithClangd(
    filePath: string,
    clangdPath: string,
    compileCommandsPath: string
  ): Promise<ClangdIncludeResult[]> {
    try {
      // Create a temporary file to store the Clangd output
      const outputFile = path.join(
        this.outputDir,
        `clangd_output_${Date.now()}.json`
      );

      // Track the temporary file
      this.tempFiles.push(outputFile);

      // Run Clangd with the compilation database
      const command = `${clangdPath} --compile-commands-dir=${path.dirname(compileCommandsPath)} --path-mappings=. --background-index=false --log=verbose --input-style=protocol --pretty --enable-config --query-driver=** --pch-storage=memory ${filePath} > ${outputFile} 2>&1`;

      await execAsync(command);

      // Read the Clangd output
      const output = await fs.promises.readFile(outputFile, 'utf8');

      // Parse the output to extract includes
      const includes = this.parseClangdOutput(output, filePath);

      // Clean up temporary file
      await fs.promises.unlink(outputFile);

      // Remove from tracked files
      const fileIndex = this.tempFiles.indexOf(outputFile);
      if (fileIndex !== -1) {
        this.tempFiles.splice(fileIndex, 1);
      }

      return includes;
    } catch (error) {
      logger.error(
        { err: error, filePath },
        'Error extracting includes with Clangd'
      );
      return [];
    }
  }

  /**
   * Parses Clangd output to extract includes.
   */
  private parseClangdOutput(output: string, filePath: string): ClangdIncludeResult[] {
    const includes: ClangdIncludeResult[] = [];

    try {
      // Look for include lines in the output
      const includeRegex = /#include\s+[<"]([^>"]+)[>"]/g;
      const fileContent = fs.readFileSync(filePath, 'utf8');

      let match;
      while ((match = includeRegex.exec(fileContent)) !== null) {
        const includePath = match[1];
        const isSystemInclude = match[0].includes('<');

        includes.push({
          path: includePath,
          isSystemInclude,
          // Clangd doesn't provide resolved paths directly in this simple approach
          // We'll try to resolve them in a more sophisticated implementation
        });
      }

      // Look for resolved paths in the Clangd output
      // This is a simplified approach; a real implementation would parse the JSON LSP output
      const resolvedPathRegex = /Resolved include\s+([^:]+):\s+([^\s]+)/g;

      let resolvedMatch;
      while ((resolvedMatch = resolvedPathRegex.exec(output)) !== null) {
        const includePath = resolvedMatch[1];
        const resolvedPath = resolvedMatch[2];

        // Find the matching include and update its resolved path
        const include = includes.find(inc => inc.path === includePath);
        if (include) {
          include.resolvedPath = resolvedPath;
        }
      }
    } catch (error) {
      logger.error(
        { err: error },
        'Error parsing Clangd output'
      );
    }

    return includes;
  }

  /**
   * Converts Clangd results to ImportInfo format.
   */
  private convertToImportInfo(
    includes: ClangdIncludeResult[],
    _filePath: string
  ): ImportInfo[] {
    const imports: ImportInfo[] = [];

    for (const include of includes) {
      const importedItems: ImportedItem[] = [];

      // Create a default imported item
      importedItems.push({
        name: this.extractNameFromPath(include.path),
        path: include.resolvedPath || include.path,
        isDefault: false,
        isNamespace: false,
        nodeText: include.isSystemInclude ? `#include <${include.path}>` : `#include "${include.path}"`
      });

      // Create import info
      const importInfo: ImportInfo = {
        path: include.resolvedPath || include.path,
        importedItems,
        isCore: include.isSystemInclude,
        isExternalPackage: include.isSystemInclude,
        moduleSystem: 'c++',
        metadata: {
          isSystemInclude: include.isSystemInclude,
          originalPath: include.path
        }
      };

      imports.push(importInfo);
    }

    return imports;
  }

  /**
   * Extracts the name from an include path.
   */
  private extractNameFromPath(includePath: string): string {
    // Handle paths with directories
    if (includePath.includes('/')) {
      const parts = includePath.split('/');
      const filename = parts[parts.length - 1];
      return this.removeExtension(filename);
    }

    return this.removeExtension(includePath);
  }

  /**
   * Removes the extension from a filename.
   */
  private removeExtension(filename: string): string {
    const extIndex = filename.lastIndexOf('.');
    return extIndex !== -1 ? filename.substring(0, extIndex) : filename;
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
            logger.debug({ file }, 'Deleted temporary file during ClangdAdapter disposal');
          }
        } catch (error) {
          logger.warn({ file, error }, 'Failed to delete temporary file during ClangdAdapter disposal');
        }
      });
      this.tempFiles = [];
    }

    logger.debug('ClangdAdapter disposed');
  }
}
