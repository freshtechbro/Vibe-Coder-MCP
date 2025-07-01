/**
 * Adapter for Semgrep integration with code-map-generator.
 * Provides pattern-based import resolution across multiple languages.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../../../logger.js';
import { ImportInfo, ImportedItem } from '../codeMapModel.js';
import { SecurityBoundaryValidator } from '../utils/securityBoundaryValidator.js';
import { SemgrepRuleGenerator } from './semgrepRuleGenerator.js';
import { resolveImport } from '../utils/importResolver.js';
import { ImportResolver, ImportResolverOptions } from './importResolver.js';

const execAsync = promisify(exec);

interface SemgrepOptions extends ImportResolverOptions {
  patterns?: string[];
  timeout?: number;
  maxMemory?: string;
  excludePatterns?: string[];
  projectRoot?: string;
}

interface SemgrepResult {
  results: SemgrepMatch[];
  errors: unknown[];
}

interface SemgrepMatch {
  check_id: string;
  path: string;
  start: {
    line: number;
    col: number;
  };
  end: {
    line: number;
    col: number;
  };
  extra: {
    lines: string;
    message: string;
    metadata: {
      importPath?: string;
      importType?: string;
      isRelative?: boolean;
      isCore?: boolean;
      importedItems?: string[];
      isDefault?: boolean;
      isNamespace?: boolean;
      moduleSystem?: string;
      isDynamic?: boolean;
    };
  };
}

/**
 * Adapter class for Semgrep integration.
 */
export class SemgrepAdapter implements ImportResolver {
  private securityValidator: SecurityBoundaryValidator;
  private ruleGenerator: SemgrepRuleGenerator;
  private cache: Map<string, ImportInfo[]> = new Map();
  private tempFiles: string[] = [];

  constructor(private allowedDir: string, private outputDir: string) {
    this.securityValidator = new SecurityBoundaryValidator(allowedDir, outputDir);
    this.ruleGenerator = new SemgrepRuleGenerator();
  }

  /**
   * Analyzes imports using Semgrep pattern matching.
   * @param filePath Path to the file to analyze
   * @param options Options for Semgrep
   * @returns Enhanced import information
   */
  public async analyzeImports(
    filePath: string,
    options: SemgrepOptions
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

      // Create temporary rules file for Semgrep
      const rules = this.ruleGenerator.generateImportRules();
      const rulesFile = path.join(
        this.outputDir,
        `semgrep-rules-${Date.now()}.yaml`
      );

      // Track the temporary file
      this.tempFiles.push(rulesFile);

      await this.ruleGenerator.writeRulesToFile(rules, rulesFile);

      // Build Semgrep command
      const command = this.buildSemgrepCommand(
        filePath,
        rulesFile,
        options
      );

      // Execute Semgrep
      const { stdout } = await execAsync(command);

      // Parse results
      const result: SemgrepResult = JSON.parse(stdout);

      // Convert results to ImportInfo format
      const imports = this.convertToImportInfo(result, filePath, options);

      // Clean up temporary rules file
      await fs.promises.unlink(rulesFile);

      // Remove from tracked files
      const fileIndex = this.tempFiles.indexOf(rulesFile);
      if (fileIndex !== -1) {
        this.tempFiles.splice(fileIndex, 1);
      }

      // Cache results
      this.cache.set(cacheKey, imports);

      return imports;
    } catch (error) {
      logger.error(
        { err: error, filePath },
        'Error analyzing imports with Semgrep'
      );
      return [];
    }
  }

  /**
   * Builds the Semgrep command.
   */
  private buildSemgrepCommand(
    filePath: string,
    rulesFile: string,
    options: SemgrepOptions
  ): string {
    const baseCommand = 'npx @semgrep/semgrep';

    let command = `${baseCommand} --json --config ${rulesFile}`;

    // Add timeout
    if (options.timeout) {
      command += ` --timeout ${options.timeout}`;
    }

    // Add max memory
    if (options.maxMemory) {
      command += ` --max-memory ${options.maxMemory}`;
    }

    // Add exclude patterns
    if (options.excludePatterns && options.excludePatterns.length > 0) {
      options.excludePatterns.forEach(pattern => {
        command += ` --exclude ${pattern}`;
      });
    }

    // Add file path
    command += ` "${filePath}"`;

    return command;
  }

  /**
   * Converts Semgrep results to ImportInfo format.
   */
  private convertToImportInfo(
    result: SemgrepResult,
    filePath: string,
    options: SemgrepOptions
  ): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const importMap = new Map<string, ImportInfo>();

    try {
      if (!result.results || !Array.isArray(result.results)) {
        return imports;
      }

      // Process each match from Semgrep
      for (const match of result.results) {
        try {
          // Extract import path from the match
          const importPath = this.extractImportPath(match);
          if (!importPath) {
            continue;
          }

          // Resolve the import path if possible
          const resolvedPath = this.resolveImportPath(
            importPath,
            filePath,
            options.projectRoot || this.allowedDir
          );

          // Create or update import info
          const importInfo = this.createImportInfo(match, importPath, resolvedPath);

          // Add to map to deduplicate imports
          const key = importInfo.path;
          if (importMap.has(key)) {
            // Merge with existing import
            const existing = importMap.get(key)!;

            // Merge imported items
            if (importInfo.importedItems && importInfo.importedItems.length > 0) {
              if (!existing.importedItems) {
                existing.importedItems = [];
              }

              // Add new items that don't already exist
              for (const item of importInfo.importedItems) {
                if (!existing.importedItems.some(i => i.name === item.name)) {
                  existing.importedItems.push(item);
                }
              }
            }

            // Update metadata
            existing.metadata = {
              ...existing.metadata,
              ...importInfo.metadata
            };
          } else {
            // Add new import
            importMap.set(key, importInfo);
          }
        } catch (error) {
          logger.warn(
            { err: error, match },
            'Error processing Semgrep match'
          );
        }
      }

      // Convert map to array
      return Array.from(importMap.values());
    } catch (error) {
      logger.error(
        { err: error, filePath },
        'Error converting Semgrep results to ImportInfo'
      );
      return imports;
    }
  }
  /**
   * Extracts the import path from a Semgrep match.
   */
  private extractImportPath(match: SemgrepMatch): string | null {
    try {
      // Extract the import path from the match text
      const text = match.extra.lines;

      // Different extraction strategies based on the match ID
      if (match.check_id.startsWith('js-')) {
        // JavaScript/TypeScript
        const regex = /(from|require)\s*['"](.*?)['"]/;
        const match = text.match(regex);
        return match ? match[2] : null;
      } else if (match.check_id.startsWith('python-')) {
        // Python
        if (match.check_id === 'python-from-import') {
          const regex = /from\s+(.*?)\s+import/;
          const match = text.match(regex);
          return match ? match[1] : null;
        } else {
          const regex = /import\s+(.*?)($|\s+as)/;
          const match = text.match(regex);
          return match ? match[1] : null;
        }
      } else if (match.check_id.startsWith('java-')) {
        // Java
        const regex = /import\s+(?:static\s+)?(.*?)(?:\.\w+)?;/;
        const match = text.match(regex);
        return match ? match[1] : null;
      } else if (match.check_id.startsWith('cpp-')) {
        // C/C++
        const regex = /#include\s*[<"](.*?)[>"]/;
        const match = text.match(regex);
        return match ? match[1] : null;
      } else if (match.check_id.startsWith('ruby-')) {
        // Ruby
        const regex = /(?:require|require_relative|load)\s*['"](.*?)['"]/;
        const match = text.match(regex);
        return match ? match[1] : null;
      } else if (match.check_id.startsWith('go-')) {
        // Go
        const regex = /import\s+(?:\w+\s+)?["]([^"]+)["]/;
        const match = text.match(regex);
        return match ? match[1] : null;
      } else if (match.check_id.startsWith('php-')) {
        // PHP
        if (match.check_id.includes('use')) {
          const regex = /use\s+(.*?)(?:\s+as\s+|;)/;
          const match = text.match(regex);
          return match ? match[1] : null;
        } else {
          const regex = /(?:require|include)(?:_once)?\s*['"](.*?)['"]/;
          const match = text.match(regex);
          return match ? match[1] : null;
        }
      }

      return null;
    } catch (error) {
      logger.warn(
        { err: error, match },
        'Error extracting import path from Semgrep match'
      );
      return null;
    }
  }

  /**
   * Resolves an import path to an absolute path.
   */
  private resolveImportPath(
    importPath: string,
    filePath: string,
    projectRoot: string
  ): string {
    try {
      // Try to resolve the import path
      const resolved = resolveImport(importPath, {
        projectRoot,
        fromFile: filePath,
        language: path.extname(filePath).slice(1),
        expandSecurityBoundary: true
      });

      return resolved;
    } catch (error) {
      logger.debug(
        { err: error, importPath, filePath },
        'Error resolving import path'
      );
      return importPath;
    }
  }

  /**
   * Creates an ImportInfo object from a Semgrep match.
   */
  private createImportInfo(
    match: SemgrepMatch,
    importPath: string,
    resolvedPath: string
  ): ImportInfo {
    // Extract metadata from the match
    const metadata = match.extra.metadata || {};

    // Determine if this is a core/standard library import
    const isCore = metadata.isCore || this.isCorePath(importPath, match.check_id);

    // Determine if this is an external package
    const isExternalPackage = !isCore && !metadata.isRelative && !resolvedPath.includes(this.allowedDir);

    // Extract imported items
    const importedItems = this.extractImportedItems(match);

    // Create import info
    const importInfo: ImportInfo = {
      path: resolvedPath || importPath,
      importedItems,
      isCore,
      isExternalPackage,
      isDynamic: metadata.isDynamic || false,
      moduleSystem: metadata.moduleSystem || this.getModuleSystem(match.check_id),
      metadata: {
        originalPath: importPath,
        importType: metadata.importType || match.check_id,
        isRelative: metadata.isRelative || importPath.startsWith('.'),
        matchedPattern: match.extra.lines
      }
    };

    return importInfo;
  }

  /**
   * Extracts imported items from a Semgrep match.
   */
  private extractImportedItems(match: SemgrepMatch): ImportedItem[] {
    const items: ImportedItem[] = [];

    try {
      const text = match.extra.lines;

      if (match.check_id.startsWith('js-')) {
        // JavaScript/TypeScript
        if (match.check_id === 'js-import-default') {
          const regex = /import\s+(\w+)\s+from/;
          const m = text.match(regex);
          if (m) {
            items.push({
              name: m[1],
              isDefault: true,
              isNamespace: false,
              nodeText: text
            });
          }
        } else if (match.check_id === 'js-import-named') {
          const regex = /import\s+{(.*?)}\s+from/;
          const m = text.match(regex);
          if (m) {
            const namedImports = m[1].split(',').map(s => s.trim());
            for (const namedImport of namedImports) {
              const [name, alias] = namedImport.split(' as ').map(s => s.trim());
              items.push({
                name: alias || name,
                alias: alias ? name : undefined,
                isDefault: false,
                isNamespace: false,
                nodeText: text
              });
            }
          }
        } else if (match.check_id === 'js-import-namespace') {
          const regex = /import\s+\*\s+as\s+(\w+)\s+from/;
          const m = text.match(regex);
          if (m) {
            items.push({
              name: m[1],
              isDefault: false,
              isNamespace: true,
              nodeText: text
            });
          }
        }
      } else if (match.check_id.startsWith('python-')) {
        // Python
        if (match.check_id === 'python-import') {
          const regex = /import\s+(\w+)/;
          const m = text.match(regex);
          if (m) {
            items.push({
              name: m[1],
              isDefault: false,
              isNamespace: false,
              nodeText: text
            });
          }
        } else if (match.check_id === 'python-from-import') {
          const regex = /from\s+.*?\s+import\s+(.*?)$/;
          const m = text.match(regex);
          if (m) {
            const namedImports = m[1].split(',').map(s => s.trim());
            for (const namedImport of namedImports) {
              const [name, alias] = namedImport.split(' as ').map(s => s.trim());
              items.push({
                name: alias || name,
                alias: alias ? name : undefined,
                isDefault: false,
                isNamespace: false,
                nodeText: text
              });
            }
          }
        } else if (match.check_id === 'python-import-as') {
          const regex = /import\s+(\w+)\s+as\s+(\w+)/;
          const m = text.match(regex);
          if (m) {
            items.push({
              name: m[2],
              alias: m[1],
              isDefault: false,
              isNamespace: false,
              nodeText: text
            });
          }
        }
      } else if (match.check_id.startsWith('java-')) {
        // Java
        if (match.check_id === 'java-import') {
          const regex = /import\s+.*?\.(\w+);/;
          const m = text.match(regex);
          if (m) {
            items.push({
              name: m[1],
              isDefault: false,
              isNamespace: false,
              nodeText: text
            });
          }
        } else if (match.check_id === 'java-import-static') {
          const regex = /import\s+static\s+.*?\.(\w+)\.(\w+);/;
          const m = text.match(regex);
          if (m) {
            items.push({
              name: m[2],
              isDefault: false,
              isNamespace: false,
              isStatic: true,
              nodeText: text
            });
          }
        }
      } else if (match.check_id.startsWith('cpp-')) {
        // C/C++
        const regex = /#include\s*[<"]([^>"]+)[>"]/;
        const m = text.match(regex);
        if (m) {
          const headerName = m[1];
          const baseName = path.basename(headerName, path.extname(headerName));
          items.push({
            name: baseName,
            isDefault: false,
            isNamespace: false,
            nodeText: text
          });
        }
      } else if (match.check_id.startsWith('ruby-')) {
        // Ruby
        const regex = /(?:require|require_relative|load)\s*['"]([^'"]+)['"]/;
        const m = text.match(regex);
        if (m) {
          const moduleName = m[1];
          const baseName = path.basename(moduleName, path.extname(moduleName));
          items.push({
            name: baseName,
            isDefault: false,
            isNamespace: false,
            nodeText: text
          });
        }
      } else if (match.check_id.startsWith('go-')) {
        // Go
        if (match.check_id === 'go-import-single') {
          const regex = /import\s+["']([^"']+)["']/;
          const m = text.match(regex);
          if (m) {
            const packagePath = m[1];
            const packageName = path.basename(packagePath);
            items.push({
              name: packageName,
              isDefault: false,
              isNamespace: false,
              nodeText: text
            });
          }
        } else if (match.check_id === 'go-import-alias') {
          const regex = /import\s+(\w+)\s+["']([^"']+)["']/;
          const m = text.match(regex);
          if (m) {
            items.push({
              name: m[1],
              isDefault: false,
              isNamespace: false,
              nodeText: text
            });
          }
        }
      } else if (match.check_id.startsWith('php-')) {
        // PHP
        if (match.check_id.includes('use')) {
          const regex = /use\s+(.*?)(?:\s+as\s+(\w+))?;/;
          const m = text.match(regex);
          if (m) {
            const namespace = m[1];
            const alias = m[2];
            const name = namespace.split('\\').pop() || '';
            items.push({
              name: alias || name,
              alias: alias ? name : undefined,
              isDefault: false,
              isNamespace: false,
              nodeText: text
            });
          }
        } else {
          const regex = /(?:require|include)(?:_once)?\s*['"]([^'"]+)['"]/;
          const m = text.match(regex);
          if (m) {
            const filePath = m[1];
            const baseName = path.basename(filePath, path.extname(filePath));
            items.push({
              name: baseName,
              isDefault: false,
              isNamespace: false,
              nodeText: text
            });
          }
        }
      }
    } catch (error) {
      logger.warn(
        { err: error, match },
        'Error extracting imported items from Semgrep match'
      );
    }

    return items;
  }

  /**
   * Determines if an import path is from a core/standard library.
   */
  private isCorePath(importPath: string, checkId: string): boolean {
    // Language-specific core module detection
    if (checkId.startsWith('js-')) {
      // Node.js core modules
      const nodeBuiltins = [
        'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
        'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
        'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
        'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'timers',
        'tls', 'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads',
        'zlib'
      ];
      return nodeBuiltins.includes(importPath);
    } else if (checkId.startsWith('python-')) {
      // Python standard library
      const pythonBuiltins = [
        'abc', 'argparse', 'asyncio', 'collections', 'copy', 'datetime',
        'functools', 'glob', 'io', 'itertools', 'json', 'logging', 'math',
        'os', 'pathlib', 're', 'shutil', 'sys', 'time', 'typing', 'uuid'
      ];
      return pythonBuiltins.includes(importPath.split('.')[0]);
    } else if (checkId.startsWith('java-')) {
      // Java standard library
      return importPath.startsWith('java.') ||
             importPath.startsWith('javax.') ||
             importPath.startsWith('sun.') ||
             importPath.startsWith('com.sun.');
    } else if (checkId.startsWith('cpp-')) {
      // C/C++ standard library
      return checkId === 'cpp-include-system';
    } else if (checkId.startsWith('ruby-')) {
      // Ruby standard library
      const rubyBuiltins = [
        'abbrev', 'base64', 'benchmark', 'bigdecimal', 'cgi', 'csv',
        'date', 'digest', 'fileutils', 'find', 'forwardable', 'io', 'json',
        'logger', 'net', 'open-uri', 'optparse', 'pathname', 'pp', 'set',
        'shellwords', 'stringio', 'strscan', 'tempfile', 'time', 'timeout',
        'uri', 'yaml', 'zlib'
      ];
      return rubyBuiltins.includes(importPath);
    } else if (checkId.startsWith('go-')) {
      // Go standard library
      const goBuiltins = [
        'bufio', 'bytes', 'context', 'crypto', 'database', 'encoding',
        'errors', 'flag', 'fmt', 'io', 'log', 'math', 'net', 'os',
        'path', 'reflect', 'regexp', 'runtime', 'sort', 'strconv',
        'strings', 'sync', 'syscall', 'time', 'unicode'
      ];
      return goBuiltins.some(pkg => importPath === pkg || importPath.startsWith(pkg + '/'));
    } else if (checkId.startsWith('php-')) {
      // No specific core modules in PHP
      return false;
    }

    return false;
  }

  /**
   * Gets the module system for a given check ID.
   */
  private getModuleSystem(checkId: string): string {
    if (checkId.startsWith('js-')) {
      if (checkId === 'js-require') {
        return 'commonjs';
      } else {
        return 'esm';
      }
    } else if (checkId.startsWith('python-')) {
      return 'python';
    } else if (checkId.startsWith('java-')) {
      return 'java';
    } else if (checkId.startsWith('cpp-')) {
      return 'cpp';
    } else if (checkId.startsWith('ruby-')) {
      return 'ruby';
    } else if (checkId.startsWith('go-')) {
      return 'go';
    } else if (checkId.startsWith('php-')) {
      return 'php';
    }

    return 'unknown';
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
            logger.debug({ file }, 'Deleted temporary file during SemgrepAdapter disposal');
          }
        } catch (error) {
          logger.warn({ file, error }, 'Failed to delete temporary file during SemgrepAdapter disposal');
        }
      });
      this.tempFiles = [];
    }

    logger.debug('SemgrepAdapter disposed');
  }
}