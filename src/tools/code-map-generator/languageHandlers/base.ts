/**
 * Base language handler for the Code-Map Generator tool.
 * This file contains the base class for language-specific handlers.
 */

import { LanguageHandler, FunctionExtractionOptions, ClassExtractionOptions, ImportExtractionOptions, FunctionContext } from '../types.js';
import { FunctionInfo, ClassInfo, ImportInfo, ImportedItem } from '../codeMapModel.js';
import { SyntaxNode } from '../parser.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ContextTracker } from '../context/contextTracker.js';

/**
 * Base class for language-specific handlers.
 * Implements common functionality for all language handlers.
 */
export abstract class BaseLanguageHandler implements LanguageHandler {
  /**
   * Context tracker for nested function analysis.
   */
  protected contextTracker: ContextTracker = new ContextTracker();

  /**
   * Extracts functions from an AST node.
   * This is a template method that delegates to language-specific implementations.
   */
  extractFunctions(
    rootNode: SyntaxNode,
    sourceCode: string,
    options: FunctionExtractionOptions = {}
  ): FunctionInfo[] {
    // Reset context tracker
    this.contextTracker.clear();

    // Get query patterns for this language
    const queryPatterns = this.getFunctionQueryPatterns();

    // Extract functions using the query patterns
    const functions: FunctionInfo[] = [];

    // Process each query pattern
    for (const pattern of queryPatterns) {
      try {
        rootNode.descendantsOfType(pattern).forEach(node => {
          // Skip nested functions if not extracting methods
          if (!options.isMethodExtraction && this.isNestedFunction(node)) {
            return;
          }

          // Skip if exceeding maximum nested depth
          if (options.maxNestedFunctionDepth !== undefined &&
              this.getNodeDepth(node) > options.maxNestedFunctionDepth) {
            return;
          }

          // Extract function information using the context tracker
          const functionInfo = this.contextTracker.withContext('function', node, undefined, () => {
            // Extract function name
            const name = this.extractFunctionName(node, sourceCode, options);

            // Update context with the name
            if (name) {
              this.contextTracker.exitContext();
              this.contextTracker.enterContext('function', node, name);
            }

            // Extract function signature
            const signature = this.extractFunctionSignature(node, sourceCode);

            // Extract function comment
            const comment = this.extractFunctionComment(node, sourceCode) ||
                          this.generateHeuristicComment(name, options.isMethodExtraction ? 'method' : 'function', signature, options.className);

            // Create function info
            return {
              name,
              signature,
              comment,
              startLine: node.startPosition.row + 1,
              endLine: node.endPosition.row + 1,
              isAsync: this.isAsyncFunction(node, sourceCode),
              isExported: this.isExportedFunction(node, sourceCode),
              isMethod: options.isMethodExtraction || false,
              isConstructor: name === 'constructor',
              isGetter: name.startsWith('get') && name.length > 3,
              isSetter: name.startsWith('set') && name.length > 3,
              isGenerator: this.isGeneratorFunction ? this.isGeneratorFunction(node, sourceCode) : false,
              isHook: name.startsWith('use') && name.length > 3 && name[3] === name[3].toUpperCase(),
              isEventHandler: name.startsWith('handle') || name.startsWith('on'),
              framework: this.detectFramework(sourceCode) || undefined,
              class: options.className,
            };
          });

          functions.push(functionInfo);
        });
      } catch (error) {
        logger.warn({ err: error, pattern }, `Error processing pattern ${pattern} for function extraction`);
      }
    }

    return functions;
  }

  /**
   * Extracts classes from an AST node.
   * This is a template method that delegates to language-specific implementations.
   */
  extractClasses(
    rootNode: SyntaxNode,
    sourceCode: string,
    options: ClassExtractionOptions = {}
  ): ClassInfo[] {
    const classes: ClassInfo[] = [];
    const queryPatterns = this.getClassQueryPatterns();

    for (const pattern of queryPatterns) {
      try {
        rootNode.descendantsOfType(pattern).forEach(node => {
          // Skip nested classes if not extracting them
          if (!options.extractNestedClasses && this.isNestedClass(node)) {
            return;
          }

          // Skip if exceeding maximum nested depth
          if (options.maxNestedClassDepth !== undefined &&
              this.getNodeDepth(node) > options.maxNestedClassDepth) {
            return;
          }

          // Extract class information using the context tracker
          const classInfo = this.contextTracker.withContext('class', node, undefined, () => {
            // Extract class name
            const name = this.extractClassName(node, sourceCode);

            // Update context with the name
            if (name) {
              this.contextTracker.exitContext();
              this.contextTracker.enterContext('class', node, name);
            }

            // Extract class methods if requested
            const methods = options.extractMethods !== false ?
              this.extractFunctions(node, sourceCode, { isMethodExtraction: true, className: name }) : [];

            // Extract class properties if requested
            const properties = options.extractProperties !== false ?
              this.extractClassProperties(node, sourceCode) : [];

            // Extract parent class
            const parentClass = this.extractParentClass(node, sourceCode);

            // Extract implemented interfaces
            const implementedInterfaces = this.extractImplementedInterfaces(node, sourceCode);

            // Extract class comment
            const comment = this.extractClassComment(node, sourceCode) ||
                          this.generateHeuristicComment(name, 'class');

            // Create class info
            return {
              name,
              methods,
              properties,
              parentClass,
              implementedInterfaces,
              comment,
              startLine: node.startPosition.row + 1,
              endLine: node.endPosition.row + 1,
              isExported: this.isExportedClass(node, sourceCode),
            };
          });

          classes.push(classInfo);
        });
      } catch (error) {
        logger.warn({ err: error, pattern }, `Error processing pattern ${pattern} for class extraction`);
      }
    }

    return classes;
  }

  /**
   * Extracts imports from an AST node.
   * This is a template method that delegates to language-specific implementations.
   */
  extractImports(
    rootNode: SyntaxNode,
    sourceCode: string,
    options: ImportExtractionOptions = {}
  ): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const queryPatterns = this.getImportQueryPatterns();

    for (const pattern of queryPatterns) {
      try {
        rootNode.descendantsOfType(pattern).forEach(node => {
          try {
            // Extract import information using the context tracker
            const importInfo = this.contextTracker.withContext('import', node, undefined, () => {
              // Extract import path
              const path = this.extractImportPath(node, sourceCode);

              // Update context with the path
              if (path) {
                this.contextTracker.exitContext();
                this.contextTracker.enterContext('import', node, path);
              }

              // Extract imported items
              const importedItems = this.extractImportedItems(node, sourceCode);

              // Check if it's a default import
              const isDefault = this.isDefaultImport(node, sourceCode);

              // Extract alias if any
              const alias = this.extractImportAlias(node, sourceCode);

              // Extract import comment
              const comment = options.extractComments ?
                this.extractImportComment(node, sourceCode) : undefined;

              // Create import info
              return {
                path,
                importedItems,
                isDefault,
                alias,
                comment,
                startLine: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
              };
            });

            imports.push(importInfo);
          } catch (error) {
            logger.warn({ err: error, node: node.type }, `Error extracting import information`);
          }
        });
      } catch (error) {
        logger.warn({ err: error, pattern }, `Error processing pattern ${pattern} for import extraction`);
      }
    }

    return imports;
  }

  /**
   * Detects the framework used in the source code.
   * This can be overridden by language-specific handlers.
   */
  detectFramework(_sourceCode: string): string | null {
    // Default implementation returns null
    return null;
  }

  /**
   * Gets the query patterns for function detection.
   * This should be overridden by language-specific handlers.
   */
  protected abstract getFunctionQueryPatterns(): string[];

  /**
   * Gets the query patterns for class detection.
   * This should be overridden by language-specific handlers.
   */
  protected abstract getClassQueryPatterns(): string[];

  /**
   * Gets the query patterns for import detection.
   * This should be overridden by language-specific handlers.
   */
  protected abstract getImportQueryPatterns(): string[];

  /**
   * Extracts the function name from an AST node.
   * This should be overridden by language-specific handlers.
   */
  protected abstract extractFunctionName(
    node: SyntaxNode,
    sourceCode: string,
    options?: FunctionExtractionOptions
  ): string;

  /**
   * Extracts the class name from an AST node.
   * This should be overridden by language-specific handlers.
   */
  protected abstract extractClassName(node: SyntaxNode, sourceCode: string): string;

  /**
   * Extracts the import path from an AST node.
   * This should be overridden by language-specific handlers.
   */
  protected abstract extractImportPath(node: SyntaxNode, sourceCode: string): string;

  /**
   * Extracts the function signature from an AST node.
   * This can be overridden by language-specific handlers.
   */
  protected extractFunctionSignature(node: SyntaxNode, sourceCode: string): string {
    const nameNode = node.childForFieldName('name');
    const paramsNode = node.childForFieldName('parameters');

    const name = nameNode ? getNodeText(nameNode, sourceCode) : 'anonymous';
    const params = paramsNode ? getNodeText(paramsNode, sourceCode) : '()';

    return `${name}${params}`;
  }

  /**
   * Extracts the function comment from an AST node.
   * This can be overridden by language-specific handlers.
   */
  protected extractFunctionComment(_node: SyntaxNode, _sourceCode: string): string | undefined {
    // Default implementation looks for comments before the node
    // This is a basic implementation that should be overridden by language-specific handlers
    return undefined;
  }

  /**
   * Extracts the class comment from an AST node.
   * This can be overridden by language-specific handlers.
   */
  protected extractClassComment(_node: SyntaxNode, _sourceCode: string): string | undefined {
    // Default implementation looks for comments before the node
    // This is a basic implementation that should be overridden by language-specific handlers
    return undefined;
  }

  /**
   * Extracts the import comment from an AST node.
   * This can be overridden by language-specific handlers.
   */
  protected extractImportComment(_node: SyntaxNode, _sourceCode: string): string | undefined {
    // Default implementation looks for comments before the node
    // This is a basic implementation that should be overridden by language-specific handlers
    return undefined;
  }



  /**
   * Extracts the parent class from an AST node.
   * This can be overridden by language-specific handlers.
   */
  protected extractParentClass(_node: SyntaxNode, _sourceCode: string): string | undefined {
    // Default implementation returns undefined
    return undefined;
  }

  /**
   * Extracts implemented interfaces from an AST node.
   * This can be overridden by language-specific handlers.
   */
  protected extractImplementedInterfaces(_node: SyntaxNode, _sourceCode: string): string[] | undefined {
    // Default implementation returns undefined
    return undefined;
  }

  /**
   * Extracts imported items from an AST node.
   * This can be overridden by language-specific handlers.
   */
  protected extractImportedItems(_node: SyntaxNode, _sourceCode: string): ImportedItem[] | undefined {
    // Default implementation returns undefined
    return undefined;
  }

  /**
   * Checks if an import is a default import.
   * This can be overridden by language-specific handlers.
   */
  protected isDefaultImport(_node: SyntaxNode, _sourceCode: string): boolean | undefined {
    // Default implementation returns undefined
    return undefined;
  }

  /**
   * Extracts the import alias from an AST node.
   * This can be overridden by language-specific handlers.
   */
  protected extractImportAlias(_node: SyntaxNode, _sourceCode: string): string | undefined {
    // Default implementation returns undefined
    return undefined;
  }

  /**
   * Generates a heuristic comment for a function.
   * This can be overridden by language-specific handlers.
   */
  protected generateHeuristicComment(
    name: string,
    type: 'function' | 'method' | 'class' | 'property' | 'import' | 'file',
    signature?: string,
    parentClass?: string
  ): string {
    // Default implementation generates a comment based on the name
    if (type === 'function' || type === 'method') {
      if (name.startsWith('get') && name.length > 3) {
        const propertyName = name.charAt(3).toLowerCase() + name.slice(4);
        return `Gets the ${propertyName}.`;
      } else if (name.startsWith('set') && name.length > 3) {
        const propertyName = name.charAt(3).toLowerCase() + name.slice(4);
        return `Sets the ${propertyName}.`;
      } else if (name.startsWith('is') && name.length > 2) {
        const propertyName = name.charAt(2).toLowerCase() + name.slice(3);
        return `Checks if ${propertyName}.`;
      } else if (name.startsWith('has') && name.length > 3) {
        const propertyName = name.charAt(3).toLowerCase() + name.slice(4);
        return `Checks if has ${propertyName}.`;
      } else if (name.startsWith('on') && name.length > 2) {
        const eventName = name.charAt(2).toLowerCase() + name.slice(3);
        return `Handles the ${eventName} event.`;
      } else if (name.includes('callback')) {
        return `Callback function for handling an operation.`;
      } else if (name.includes('handler')) {
        return `Handler function for processing an event or action.`;
      } else if (name === 'constructor') {
        return parentClass ? `Creates a new instance of ${parentClass}.` : `Creates a new instance.`;
      } else {
        return `Performs an action related to ${name}.`;
      }
    } else if (type === 'class') {
      return `Represents a ${name} object.`;
    } else if (type === 'property') {
      return `The ${name} property.`;
    } else if (type === 'import') {
      return `Imports from ${name}.`;
    } else if (type === 'file') {
      return `Contains functionality related to ${name}.`;
    }

    return `Performs an action related to ${name}.`;
  }

  /**
   * Checks if a function is asynchronous.
   * This can be overridden by language-specific handlers.
   */
  protected isAsyncFunction(node: SyntaxNode, _sourceCode: string): boolean {
    // Default implementation checks if the function has the 'async' keyword
    return node.text.startsWith('async ');
  }

  /**
   * Checks if a function is a generator.
   * This can be overridden by language-specific handlers.
   */
  protected isGeneratorFunction(_node: SyntaxNode, _sourceCode: string): boolean {
    // Default implementation returns false
    return false;
  }

  /**
   * Checks if a function is exported.
   * This can be overridden by language-specific handlers.
   */
  protected isExportedFunction(node: SyntaxNode, _sourceCode: string): boolean {
    // Default implementation checks if the function is part of an export statement
    return node.parent?.type === 'export_statement';
  }

  /**
   * Checks if a class is exported.
   * This can be overridden by language-specific handlers.
   */
  protected isExportedClass(node: SyntaxNode, _sourceCode: string): boolean {
    // Default implementation checks if the class is part of an export statement
    return node.parent?.type === 'export_statement';
  }

  /**
   * Checks if a function is nested within another function.
   * This can be overridden by language-specific handlers.
   */
  protected isNestedFunction(node: SyntaxNode): boolean {
    // Default implementation checks if the function is within another function
    let parent = node.parent;
    while (parent) {
      if (this.getFunctionQueryPatterns().includes(parent.type)) {
        return true;
      }
      parent = parent.parent;
    }
    return false;
  }

  /**
   * Checks if a class is nested within another class.
   * This can be overridden by language-specific handlers.
   */
  protected isNestedClass(node: SyntaxNode): boolean {
    // Default implementation checks if the class is within another class
    let parent = node.parent;
    while (parent) {
      if (this.getClassQueryPatterns().includes(parent.type)) {
        return true;
      }
      parent = parent.parent;
    }
    return false;
  }

  /**
   * Gets the depth of a node in the AST.
   * This can be overridden by language-specific handlers.
   */
  protected getNodeDepth(node: SyntaxNode): number {
    let depth = 0;
    let parent = node.parent;
    while (parent) {
      depth++;
      parent = parent.parent;
    }
    return depth;
  }

  /**
   * Gets the current context.
   */
  protected getCurrentContext(): FunctionContext | undefined {
    const context = this.contextTracker.getCurrentContext();
    if (!context) return undefined;

    return {
      type: context.type,
      name: context.name,
      parent: context.parent ? {
        type: context.parent.type,
        name: context.parent.name,
        parent: context.parent.parent
      } : undefined
    };
  }

  /**
   * Extracts class properties from an AST node.
   * This should be overridden by language-specific handlers.
   *
   * @param node The class node to extract properties from
   * @param sourceCode The source code containing the class
   * @returns An array of class property information
   */
  protected extractClassProperties(_node: SyntaxNode, _sourceCode: string): Array<{
    name: string;
    type?: string;
    comment?: string;
    startLine: number;
    endLine: number;
    accessModifier?: string;
    isStatic?: boolean;
  }> {
    return [];
  }

  /**
   * Enhances import information using third-party resolvers.
   * This method can be overridden by language-specific handlers.
   *
   * @param filePath Path to the file containing the imports
   * @param imports Array of imports to enhance
   * @param options Options for import resolution
   * @returns Enhanced import information
   */
  public async enhanceImportInfo(
    filePath: string,
    imports: ImportInfo[],
    options: unknown
  ): Promise<ImportInfo[]> {
    try {
      // Import the factory dynamically to avoid circular dependencies
      const { ImportResolverFactory } = await import('../importResolvers/importResolverFactory.js');

      // Create import resolver factory
      const opts = options as Record<string, unknown>;
      const factory = new ImportResolverFactory({
        allowedDir: opts.allowedDir as string,
        outputDir: opts.outputDir as string,
        maxDepth: (opts.maxDepth as number) || 3,
        tsConfig: opts.tsConfig as string,
        pythonPath: opts.pythonPath as string,
        pythonVersion: opts.pythonVersion as string,
        venvPath: opts.venvPath as string,
        clangdPath: opts.clangdPath as string,
        compileFlags: opts.compileFlags as string[],
        includePaths: opts.includePaths as string[],
        semgrepPatterns: opts.semgrepPatterns as string[],
        semgrepTimeout: opts.semgrepTimeout as number,
        semgrepMaxMemory: opts.semgrepMaxMemory as string,
        disableSemgrepFallback: opts.disableSemgrepFallback as boolean
      });

      // Get resolver for the file
      const resolver = factory.getImportResolver(filePath);
      if (!resolver) {
        return imports;
      }

      // Analyze imports with the resolver
      const enhancedImports = await resolver.analyzeImports(filePath, opts);

      // Merge original and enhanced imports
      return this.mergeImportInfo(imports, enhancedImports);
    } catch (error) {
      logger.error(
        { err: error, filePath },
        'Error enhancing import info in base handler'
      );
      return imports;
    }
  }

  /**
   * Merges original and enhanced import information.
   * This method can be overridden by language-specific handlers.
   *
   * @param original Original import information
   * @param enhanced Enhanced import information
   * @returns Merged import information
   */
  protected mergeImportInfo(
    original: ImportInfo[],
    enhanced: ImportInfo[]
  ): ImportInfo[] {
    const result: ImportInfo[] = [];

    // Create a map of original imports by path
    const originalImportMap = new Map<string, ImportInfo>();
    for (const importInfo of original) {
      originalImportMap.set(importInfo.path, importInfo);
    }

    // Process enhanced imports
    for (const enhancedImport of enhanced) {
      const originalImport = originalImportMap.get(enhancedImport.path);

      if (originalImport) {
        // Merge with original import
        result.push({
          ...originalImport,
          // Keep original imported items but add metadata from enhanced import
          metadata: {
            ...originalImport.metadata,
            ...enhancedImport.metadata
          },
          // Use enhanced values for these properties
          isCore: enhancedImport.isCore,
          isDynamic: enhancedImport.isDynamic,
          isExternalPackage: enhancedImport.isExternalPackage,
          moduleSystem: enhancedImport.moduleSystem || originalImport.moduleSystem
        });

        // Remove from map to track processed imports
        originalImportMap.delete(enhancedImport.path);
      } else {
        // Add new import discovered by the resolver
        result.push(enhancedImport);
      }
    }

    // Add remaining original imports
    for (const importInfo of originalImportMap.values()) {
      result.push(importInfo);
    }

    return result;
  }
}
