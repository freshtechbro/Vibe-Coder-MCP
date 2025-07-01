/**
 * Extended Python Import Resolver for code-map-generator.
 * Provides comprehensive import resolution for Python files without requiring Pyright.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import Parser from 'web-tree-sitter';
import logger from '../../../logger.js';
import { ImportInfo, ImportedItem } from '../codeMapModel.js';
import { SecurityBoundaryValidator } from '../utils/securityBoundaryValidator.js';
import { parseSourceCode } from '../parser.js';
import { ImportResolver, ImportResolverOptions } from './importResolver.js';

// Standard library modules in Python
const PYTHON_STDLIB_MODULES = new Set([
  // Python 3.x standard library modules
  'abc', 'aifc', 'argparse', 'array', 'ast', 'asyncio', 'atexit', 'audioop', 'base64',
  'bdb', 'binascii', 'binhex', 'bisect', 'builtins', 'bz2', 'calendar', 'cgi', 'cgitb',
  'chunk', 'cmath', 'cmd', 'code', 'codecs', 'codeop', 'collections', 'colorsys',
  'compileall', 'concurrent', 'configparser', 'contextlib', 'contextvars', 'copy',
  'copyreg', 'cProfile', 'crypt', 'csv', 'ctypes', 'curses', 'dataclasses', 'datetime',
  'dbm', 'decimal', 'difflib', 'dis', 'distutils', 'doctest', 'dummy_threading',
  'email', 'encodings', 'ensurepip', 'enum', 'errno', 'faulthandler', 'fcntl',
  'filecmp', 'fileinput', 'fnmatch', 'formatter', 'fractions', 'ftplib', 'functools',
  'gc', 'getopt', 'getpass', 'gettext', 'glob', 'grp', 'gzip', 'hashlib', 'heapq',
  'hmac', 'html', 'http', 'idlelib', 'imaplib', 'imghdr', 'imp', 'importlib',
  'inspect', 'io', 'ipaddress', 'itertools', 'json', 'keyword', 'lib2to3', 'linecache',
  'locale', 'logging', 'lzma', 'macpath', 'mailbox', 'mailcap', 'marshal', 'math',
  'mimetypes', 'mmap', 'modulefinder', 'msilib', 'msvcrt', 'multiprocessing',
  'netrc', 'nis', 'nntplib', 'numbers', 'operator', 'optparse', 'os', 'ossaudiodev',
  'parser', 'pathlib', 'pdb', 'pickle', 'pickletools', 'pipes', 'pkgutil', 'platform',
  'plistlib', 'poplib', 'posix', 'pprint', 'profile', 'pstats', 'pty', 'pwd', 'py_compile',
  'pyclbr', 'pydoc', 'queue', 'quopri', 'random', 're', 'readline', 'reprlib',
  'resource', 'rlcompleter', 'runpy', 'sched', 'secrets', 'select', 'selectors',
  'shelve', 'shlex', 'shutil', 'signal', 'site', 'smtpd', 'smtplib', 'sndhdr',
  'socket', 'socketserver', 'spwd', 'sqlite3', 'ssl', 'stat', 'statistics', 'string',
  'stringprep', 'struct', 'subprocess', 'sunau', 'symbol', 'symtable', 'sys',
  'sysconfig', 'syslog', 'tabnanny', 'tarfile', 'telnetlib', 'tempfile', 'termios',
  'test', 'textwrap', 'threading', 'time', 'timeit', 'tkinter', 'token', 'tokenize',
  'trace', 'traceback', 'tracemalloc', 'tty', 'turtle', 'turtledemo', 'types',
  'typing', 'unicodedata', 'unittest', 'urllib', 'uu', 'uuid', 'venv', 'warnings',
  'wave', 'weakref', 'webbrowser', 'winreg', 'winsound', 'wsgiref', 'xdrlib', 'xml',
  'xmlrpc', 'zipapp', 'zipfile', 'zipimport', 'zlib'
]);

/**
 * Options for the ExtendedPythonImportResolver.
 */
export interface PythonImportResolverOptions extends ImportResolverOptions {
  pythonPath?: string;
  pythonVersion?: string;
  venvPath?: string;
  maxDepth?: number;
}

/**
 * Extended Python Import Resolver class.
 * Provides comprehensive import resolution for Python files without requiring Pyright.
 */
export class ExtendedPythonImportResolver implements ImportResolver {
  private securityValidator: SecurityBoundaryValidator;
  private cache: Map<string, ImportInfo[]> = new Map();
  private sitePackagesPath: string | null = null;
  private pythonPath: string | null = null;
  private tempFiles: string[] = [];

  constructor(private allowedDir: string, private outputDir: string) {
    this.securityValidator = new SecurityBoundaryValidator(allowedDir, outputDir);
    this.initializePythonEnvironment();
  }

  /**
   * Initializes the Python environment by detecting Python path and site-packages.
   */
  private initializePythonEnvironment(): void {
    try {
      // Try to find Python executable
      this.pythonPath = this.detectPythonPath();

      if (this.pythonPath) {
        // Try to find site-packages directory
        this.sitePackagesPath = this.detectSitePackagesPath(this.pythonPath);
        logger.debug({
          pythonPath: this.pythonPath,
          sitePackagesPath: this.sitePackagesPath
        }, 'Python environment initialized');
      }
    } catch (error) {
      logger.warn({ err: error }, 'Error initializing Python environment');
    }
  }

  /**
   * Detects the Python executable path.
   */
  private detectPythonPath(): string | null {
    try {
      // Try common Python executable names
      const pythonCommands = ['python3', 'python', 'py'];

      for (const cmd of pythonCommands) {
        try {
          const output = execSync(`${cmd} -c "import sys; print(sys.executable)"`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore']
          });

          if (output && output.trim()) {
            return output.trim();
          }
        } catch {
          // Continue to next command if this one fails
        }
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Python path');
      return null;
    }
  }

  /**
   * Detects the site-packages directory for the given Python executable.
   */
  private detectSitePackagesPath(pythonPath: string): string | null {
    try {
      const output = execSync(`${pythonPath} -c "import site; print(site.getsitepackages()[0])"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      if (output && output.trim()) {
        return output.trim();
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting site-packages path');
      return null;
    }
  }

  /**
   * Analyzes Python imports in a file.
   * @param filePath Path to the file to analyze
   * @param options Options for the resolver
   * @returns Enhanced import information
   */
  public async analyzeImports(
    filePath: string,
    options: PythonImportResolverOptions
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

      // Read the file content
      const fileContent = await fs.promises.readFile(filePath, 'utf8');

      // Parse the source code with Tree-sitter
      const { ast } = await parseSourceCode(fileContent, '.py');

      // Extract imports using Tree-sitter
      const imports = this.extractImportsFromAST(ast, fileContent, filePath, options);

      // Cache results
      this.cache.set(cacheKey, imports);

      return imports;
    } catch (error) {
      logger.error(
        { err: error, filePath },
        'Error analyzing imports with ExtendedPythonImportResolver'
      );
      return [];
    }
  }

  /**
   * Extracts imports from a Tree-sitter AST.
   */
  private extractImportsFromAST(
    ast: Parser.SyntaxNode,
    sourceCode: string,
    filePath: string,
    options: PythonImportResolverOptions
  ): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const fileDir = path.dirname(filePath);

    try {
      // Find all import statements
      const importNodes = ast.descendantsOfType(['import_statement', 'import_from_statement']);

      for (const node of importNodes) {
        try {
          if (node.type === 'import_statement') {
            // Handle regular imports (import x, import x.y, import x as y)
            this.processImportStatement(node, sourceCode, fileDir, imports, options);
          } else if (node.type === 'import_from_statement') {
            // Handle from imports (from x import y, from x.y import z)
            this.processFromImportStatement(node, sourceCode, fileDir, imports, options);
          }
        } catch (error) {
          logger.warn({ err: error, nodeType: node.type }, 'Error processing import node');
        }
      }

      return imports;
    } catch (error) {
      logger.error(
        { err: error, filePath },
        'Error extracting imports from AST'
      );
      return imports;
    }
  }

  /**
   * Processes a regular import statement (import x, import x.y, import x as y).
   */
  private processImportStatement(
    node: Parser.SyntaxNode,
    sourceCode: string,
    fileDir: string,
    imports: ImportInfo[],
    options: PythonImportResolverOptions
  ): void {
    // Get the imported module name
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const moduleName = this.getNodeText(nameNode, sourceCode);
    if (!moduleName) return;

    // Check for aliased imports
    let alias: string | undefined;
    const asNode = node.childForFieldName('alias');
    if (asNode) {
      alias = this.getNodeText(asNode, sourceCode);
    }

    // Resolve the import path
    const resolvedInfo = this.resolveImportPath(moduleName, fileDir, options);

    // Create imported items
    const importedItems: ImportedItem[] = [{
      name: alias || this.extractNameFromPath(moduleName),
      path: resolvedInfo.resolvedPath || moduleName,
      isDefault: false,
      isNamespace: true,
      nodeText: moduleName,
      alias: alias
    }];

    // Create import info
    const importInfo: ImportInfo = {
      path: moduleName,
      resolvedPath: resolvedInfo.resolvedPath,
      absolutePath: resolvedInfo.absolutePath,
      importedItems,
      isCore: resolvedInfo.isCore,
      isExternalPackage: resolvedInfo.isExternalPackage,
      moduleSystem: 'python',
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      metadata: {
        moduleName,
        isBuiltin: resolvedInfo.isCore,
        isThirdParty: resolvedInfo.isExternalPackage
      }
    };

    imports.push(importInfo);
  }

  /**
   * Processes a from import statement (from x import y, from x.y import z).
   */
  private processFromImportStatement(
    node: Parser.SyntaxNode,
    sourceCode: string,
    fileDir: string,
    imports: ImportInfo[],
    options: PythonImportResolverOptions
  ): void {
    // Get the module name
    const moduleNameNode = node.childForFieldName('module_name');
    if (!moduleNameNode) return;

    const moduleName = this.getNodeText(moduleNameNode, sourceCode);
    if (!moduleName) return;

    // Resolve the import path
    const resolvedInfo = this.resolveImportPath(moduleName, fileDir, options);

    // Create imported items
    const importedItems: ImportedItem[] = [];

    // Check for wildcard import
    const hasWildcard = node.descendantsOfType('wildcard_import').length > 0;

    if (hasWildcard) {
      // Handle wildcard import (from x import *)
      importedItems.push({
        name: '*',
        path: resolvedInfo.resolvedPath || moduleName,
        isDefault: false,
        isNamespace: true,
        nodeText: '*',
        isWildcardImport: true
      });
    } else {
      // Handle specific imports (from x import y, z)
      node.descendantsOfType(['dotted_name', 'identifier', 'aliased_import']).forEach((itemNode: Parser.SyntaxNode) => {
        if (itemNode.parent?.type === 'import_from_statement' &&
            itemNode.previousSibling?.text === 'import') {
          const name = this.getNodeText(itemNode, sourceCode);

          // Check if it's an aliased import
          if (itemNode.type === 'aliased_import') {
            const nameNode = itemNode.childForFieldName('name');
            const aliasNode = itemNode.childForFieldName('alias');
            if (nameNode && aliasNode) {
              const importName = this.getNodeText(nameNode, sourceCode);
              const alias = this.getNodeText(aliasNode, sourceCode);

              importedItems.push({
                name: importName,
                alias: alias,
                path: resolvedInfo.resolvedPath || moduleName,
                isDefault: false,
                isNamespace: false,
                nodeText: itemNode.text
              });
            }
          } else {
            // Regular import
            importedItems.push({
              name,
              path: resolvedInfo.resolvedPath || moduleName,
              isDefault: false,
              isNamespace: false,
              nodeText: itemNode.text
            });
          }
        }
      });
    }

    // Create import info
    const importInfo: ImportInfo = {
      path: moduleName,
      resolvedPath: resolvedInfo.resolvedPath,
      absolutePath: resolvedInfo.absolutePath,
      importedItems,
      isCore: resolvedInfo.isCore,
      isExternalPackage: resolvedInfo.isExternalPackage,
      moduleSystem: 'python',
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      metadata: {
        moduleName,
        isBuiltin: resolvedInfo.isCore,
        isThirdParty: resolvedInfo.isExternalPackage,
        isFromImport: true
      }
    };

    imports.push(importInfo);
  }

  /**
   * Resolves a Python import path to an absolute file path.
   */
  private resolveImportPath(
    importPath: string,
    fileDir: string,
    _options: PythonImportResolverOptions
  ): {
    resolvedPath: string | undefined;
    absolutePath: string | undefined;
    isCore: boolean;
    isExternalPackage: boolean;
  } {
    // Check if it's a standard library module
    const rootModule = importPath.split('.')[0];
    if (PYTHON_STDLIB_MODULES.has(rootModule)) {
      return {
        resolvedPath: importPath,
        absolutePath: undefined,
        isCore: true,
        isExternalPackage: false
      };
    }

    // Handle relative imports
    if (importPath.startsWith('.')) {
      return this.resolveRelativeImport(importPath, fileDir);
    }

    // Try to resolve as a package in site-packages
    if (this.sitePackagesPath) {
      const packageResult = this.resolvePackageImport(importPath, this.sitePackagesPath);
      if (packageResult.resolvedPath) {
        return packageResult;
      }
    }

    // Try to resolve as a local module
    return this.resolveLocalImport(importPath, fileDir, this.allowedDir);
  }

  /**
   * Resolves a relative import (e.g., from . import x, from .. import y).
   */
  private resolveRelativeImport(
    importPath: string,
    fileDir: string
  ): {
    resolvedPath: string | undefined;
    absolutePath: string | undefined;
    isCore: boolean;
    isExternalPackage: boolean;
  } {
    try {
      // Count the number of dots to determine how many levels to go up
      let dotCount = 0;
      while (importPath[dotCount] === '.') {
        dotCount++;
      }

      // Remove the dots from the import path
      const modulePath = importPath.substring(dotCount);

      // Go up the directory tree based on dot count
      let targetDir = fileDir;
      for (let i = 0; i < dotCount - 1; i++) {
        targetDir = path.dirname(targetDir);
      }

      // If there's a module path, append it to the target directory
      if (modulePath) {
        const modulePathParts = modulePath.split('.');
        const possiblePaths = [
          // As a Python file
          path.join(targetDir, ...modulePathParts) + '.py',
          // As a directory with __init__.py
          path.join(targetDir, ...modulePathParts, '__init__.py')
        ];

        // Check if any of the possible paths exist
        for (const possiblePath of possiblePaths) {
          if (fs.existsSync(possiblePath)) {
            return {
              resolvedPath: importPath,
              absolutePath: possiblePath,
              isCore: false,
              isExternalPackage: false
            };
          }
        }
      }

      // If we couldn't resolve to a file, just return the import path
      return {
        resolvedPath: importPath,
        absolutePath: undefined,
        isCore: false,
        isExternalPackage: false
      };
    } catch (error) {
      logger.warn({ err: error, importPath }, 'Error resolving relative import');
      return {
        resolvedPath: importPath,
        absolutePath: undefined,
        isCore: false,
        isExternalPackage: false
      };
    }
  }

  /**
   * Resolves a package import (e.g., import numpy, from pandas import DataFrame).
   */
  private resolvePackageImport(
    importPath: string,
    sitePackagesPath: string
  ): {
    resolvedPath: string | undefined;
    absolutePath: string | undefined;
    isCore: boolean;
    isExternalPackage: boolean;
  } {
    try {
      const modulePathParts = importPath.split('.');
      const rootModule = modulePathParts[0];

      // Check if the root module exists in site-packages
      const possiblePaths = [
        // As a Python file
        path.join(sitePackagesPath, rootModule + '.py'),
        // As a directory with __init__.py
        path.join(sitePackagesPath, rootModule, '__init__.py')
      ];

      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          // If it's just the root module, return the path
          if (modulePathParts.length === 1) {
            return {
              resolvedPath: importPath,
              absolutePath: possiblePath,
              isCore: false,
              isExternalPackage: true
            };
          }

          // If it's a submodule, try to resolve the full path
          const packageDir = path.dirname(possiblePath);

          const submodulePossiblePaths = [
            // As a Python file
            path.join(packageDir, ...modulePathParts.slice(1)) + '.py',
            // As a directory with __init__.py
            path.join(packageDir, ...modulePathParts.slice(1), '__init__.py')
          ];

          for (const subPath of submodulePossiblePaths) {
            if (fs.existsSync(subPath)) {
              return {
                resolvedPath: importPath,
                absolutePath: subPath,
                isCore: false,
                isExternalPackage: true
              };
            }
          }

          // If we couldn't resolve the submodule, just return the package path
          return {
            resolvedPath: importPath,
            absolutePath: possiblePath,
            isCore: false,
            isExternalPackage: true
          };
        }
      }

      // If we couldn't find the package, assume it's external but not resolvable
      return {
        resolvedPath: importPath,
        absolutePath: undefined,
        isCore: false,
        isExternalPackage: true
      };
    } catch (error) {
      logger.warn({ err: error, importPath }, 'Error resolving package import');
      return {
        resolvedPath: importPath,
        absolutePath: undefined,
        isCore: false,
        isExternalPackage: true
      };
    }
  }

  /**
   * Resolves a local import (e.g., import mymodule, from mypackage import mymodule).
   */
  private resolveLocalImport(
    importPath: string,
    fileDir: string,
    projectRoot: string
  ): {
    resolvedPath: string | undefined;
    absolutePath: string | undefined;
    isCore: boolean;
    isExternalPackage: boolean;
  } {
    try {
      const modulePathParts = importPath.split('.');

      // Try to resolve from the current directory
      const possiblePaths = [
        // As a Python file in the same directory
        path.join(fileDir, ...modulePathParts) + '.py',
        // As a directory with __init__.py in the same directory
        path.join(fileDir, ...modulePathParts, '__init__.py'),
        // As a Python file in the project root
        path.join(projectRoot, ...modulePathParts) + '.py',
        // As a directory with __init__.py in the project root
        path.join(projectRoot, ...modulePathParts, '__init__.py')
      ];

      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          return {
            resolvedPath: importPath,
            absolutePath: possiblePath,
            isCore: false,
            isExternalPackage: false
          };
        }
      }

      // If we couldn't resolve to a file, assume it's an external package
      return {
        resolvedPath: importPath,
        absolutePath: undefined,
        isCore: false,
        isExternalPackage: true
      };
    } catch (error) {
      logger.warn({ err: error, importPath }, 'Error resolving local import');
      return {
        resolvedPath: importPath,
        absolutePath: undefined,
        isCore: false,
        isExternalPackage: true
      };
    }
  }

  /**
   * Gets the text of a node from the source code.
   */
  private getNodeText(node: Parser.SyntaxNode, sourceCode: string): string {
    try {
      return sourceCode.substring(node.startIndex, node.endIndex);
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error getting node text');
      return '';
    }
  }

  /**
   * Extracts the name from an import path.
   */
  private extractNameFromPath(importPath: string): string {
    // Handle relative paths
    if (importPath.startsWith('.')) {
      const parts = importPath.split('.');
      return parts[parts.length - 1] || importPath;
    }

    // Handle absolute imports
    const parts = importPath.split('.');
    return parts[0];
  }

  /**
   * Disposes of resources used by the resolver.
   * Should be called when the resolver is no longer needed.
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
            logger.debug({ file }, 'Deleted temporary file during ExtendedPythonImportResolver disposal');
          }
        } catch (error) {
          logger.warn({ file, error }, 'Failed to delete temporary file during ExtendedPythonImportResolver disposal');
        }
      });
      this.tempFiles = [];
    }

    // Reset environment variables
    this.sitePackagesPath = null;
    this.pythonPath = null;

    logger.debug('ExtendedPythonImportResolver disposed');
  }
}
