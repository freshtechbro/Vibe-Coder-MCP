/**
 * C/C++ language handler for the Code-Map Generator tool.
 * This file contains the language handler for C and C++ files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ImportedItem, ImportInfo } from '../codeMapModel.js';
import { ImportResolverFactory } from '../importResolvers/importResolverFactory.js';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Language handler for C/C++.
 * Provides enhanced function name detection for C and C++ files.
 */
export class CppHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_definition',
      'method_definition',
      'lambda_expression',
      'function_declarator'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'class_specifier',
      'struct_specifier',
      'enum_specifier',
      'namespace_definition'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'include_directive',
      'using_declaration',
      'using_directive'
    ];
  }

  /**
   * Extracts the function name from an AST node.
   */
  protected extractFunctionName(
    node: SyntaxNode,
    sourceCode: string,
_options?: FunctionExtractionOptions
  ): string {
    try {
      // Handle function definitions
      if (node.type === 'function_definition') {
        const declaratorNode = node.childForFieldName('declarator');
        if (declaratorNode) {
          // Get the function name from the declarator
          if (declaratorNode.type === 'function_declarator') {
            const declaratorName = this.extractFunctionDeclaratorName(declaratorNode, sourceCode);
            if (declaratorName) {
              return declaratorName;
            }
          }
        }
      }

      // Handle method definitions
      if (node.type === 'method_definition') {
        const declaratorNode = node.childForFieldName('declarator');
        if (declaratorNode) {
          // Get the function name from the declarator
          if (declaratorNode.type === 'function_declarator') {
            const declaratorName = this.extractFunctionDeclaratorName(declaratorNode, sourceCode);
            if (declaratorName) {
              // Check if it's a constructor or destructor
              if (this.isConstructor(declaratorName, node, sourceCode)) {
                return 'constructor';
              } else if (this.isDestructor(declaratorName, node, sourceCode)) {
                return 'destructor';
              }

              return declaratorName;
            }
          }
        }
      }

      // Handle function declarators
      if (node.type === 'function_declarator') {
        const declaratorName = this.extractFunctionDeclaratorName(node, sourceCode);
        if (declaratorName) {
          return declaratorName;
        }
      }

      // Handle lambda expressions
      if (node.type === 'lambda_expression') {
        // Check if assigned to a variable
        if (node.parent?.type === 'init_declarator') {
          const declaratorNode = node.parent.childForFieldName('declarator');
          if (declaratorNode) {
            return getNodeText(declaratorNode, sourceCode);
          }
        }

        // Check if used in a function call
        if (node.parent?.type === 'argument_list' &&
            node.parent.parent?.type === 'call_expression') {
          const funcNode = node.parent.parent.childForFieldName('function');
          if (funcNode) {
            const funcName = getNodeText(funcNode, sourceCode);

            // Common C++ functions that take callbacks
            if (['for_each', 'transform', 'find_if', 'sort'].includes(funcName)) {
              return `${funcName}_lambda`;
            }
          }
        }

        return 'lambda';
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C/C++ function name');
      return 'anonymous';
    }
  }

  /**
   * Extracts the function name from a function declarator.
   */
  private extractFunctionDeclaratorName(node: SyntaxNode, sourceCode: string): string | null {
    try {
      const declaratorNode = node.childForFieldName('declarator');
      if (declaratorNode) {
        // Handle simple identifiers
        if (declaratorNode.type === 'identifier') {
          return getNodeText(declaratorNode, sourceCode);
        }

        // Handle qualified identifiers (e.g., Class::method)
        if (declaratorNode.type === 'qualified_identifier') {
          return getNodeText(declaratorNode, sourceCode);
        }

        // Handle field expressions (e.g., this->method)
        if (declaratorNode.type === 'field_expression') {
          const fieldNode = declaratorNode.childForFieldName('field');
          if (fieldNode) {
            return getNodeText(fieldNode, sourceCode);
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C/C++ function declarator name');
      return null;
    }
  }

  /**
   * Checks if a method is a constructor.
   */
  private isConstructor(methodName: string, node: SyntaxNode, sourceCode: string): boolean {
    try {
      // Find the class name
      let current = node.parent;
      while (current && current.type !== 'class_specifier') {
        current = current.parent;
      }

      if (current) {
        const nameNode = current.childForFieldName('name');
        if (nameNode) {
          const className = getNodeText(nameNode, sourceCode);

          // Check if the method name matches the class name
          return methodName === className || methodName.endsWith(`::${className}`);
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if C++ method is constructor');
      return false;
    }
  }

  /**
   * Checks if a method is a destructor.
   */
  private isDestructor(methodName: string, node: SyntaxNode, sourceCode: string): boolean {
    try {
      // Find the class name
      let current = node.parent;
      while (current && current.type !== 'class_specifier') {
        current = current.parent;
      }

      if (current) {
        const nameNode = current.childForFieldName('name');
        if (nameNode) {
          const className = getNodeText(nameNode, sourceCode);

          // Check if the method name is ~ClassName
          return methodName === `~${className}` || methodName.endsWith(`::~${className}`);
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if C++ method is destructor');
      return false;
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'class_specifier' ||
          node.type === 'struct_specifier' ||
          node.type === 'enum_specifier') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      } else if (node.type === 'namespace_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return `Namespace_${getNodeText(nameNode, sourceCode)}`;
        }
      }

      return 'AnonymousType';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C/C++ class name');
      return 'AnonymousType';
    }
  }

  /**
   * Extracts the parent class from an AST node.
   */
  protected extractParentClass(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'class_specifier') {
        const baseClauseNode = node.childForFieldName('base_clause');
        if (baseClauseNode) {
          // Get the first base class specifier
          const baseSpecifiers = baseClauseNode.namedChildren;
          if (baseSpecifiers.length > 0) {
            const firstBase = baseSpecifiers[0];
            if (firstBase.type === 'base_class_clause') {
              const typeNode = firstBase.childForFieldName('type');
              if (typeNode) {
                return getNodeText(typeNode, sourceCode);
              }
            }
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C/C++ parent class');
      return undefined;
    }
  }

  /**
   * Extracts implemented interfaces from an AST node.
   */
  protected extractImplementedInterfaces(node: SyntaxNode, sourceCode: string): string[] | undefined {
    try {
      if (node.type === 'class_specifier') {
        const baseClauseNode = node.childForFieldName('base_clause');
        if (baseClauseNode) {
          const interfaces: string[] = [];

          // Get all base class specifiers
          const baseSpecifiers = baseClauseNode.namedChildren;
          for (let i = 0; i < baseSpecifiers.length; i++) {
            const baseSpec = baseSpecifiers[i];
            if (baseSpec.type === 'base_class_clause') {
              const typeNode = baseSpec.childForFieldName('type');
              if (typeNode) {
                interfaces.push(getNodeText(typeNode, sourceCode));
              }
            }
          }

          // Remove the first entry if it's a parent class
          if (interfaces.length > 0 && this.extractParentClass(node, sourceCode)) {
            interfaces.shift();
          }

          return interfaces.length > 0 ? interfaces : undefined;
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C/C++ implemented interfaces');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'include_directive') {
        const pathNode = node.childForFieldName('path');
        if (pathNode) {
          return getNodeText(pathNode, sourceCode);
        }
      } else if (node.type === 'using_declaration' || node.type === 'using_directive') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C/C++ import path');
      return 'unknown';
    }
  }

  /**
   * Extracts imported items from an AST node.
   */
  protected extractImportedItems(node: SyntaxNode, sourceCode: string): ImportedItem[] | undefined {
    try {
      // Handle include directives (#include <iostream> or #include "myheader.h")
      if (node.type === 'include_directive') {
        const pathNode = node.childForFieldName('path');

        if (pathNode) {
          const path = getNodeText(pathNode, sourceCode);

          // Determine if it's a system include (<>) or local include ("")
          const isSystemInclude = path.startsWith('<') && path.endsWith('>');
          const isLocalInclude = path.startsWith('"') && path.endsWith('"');

          // Clean the path by removing the brackets or quotes
          const cleanPath = isSystemInclude
            ? path.substring(1, path.length - 1)
            : isLocalInclude
              ? path.substring(1, path.length - 1)
              : path;

          // Extract the header name (last part of the path)
          const parts = cleanPath.split('/');
          const headerName = parts[parts.length - 1];

          return [{
            name: headerName,
            path: cleanPath,
            isDefault: false,
            isNamespace: false,
            nodeText: node.text,
            // Add C/C++-specific metadata
            isSystemInclude,
            isLocalInclude
          }];
        }
      }
      // Handle using declarations (using std::vector)
      else if (node.type === 'using_declaration') {
        const nameNode = node.childForFieldName('name');

        if (nameNode) {
          const fullPath = getNodeText(nameNode, sourceCode);
          const parts = fullPath.split('::');
          const name = parts[parts.length - 1];

          return [{
            name: name,
            path: fullPath,
            isDefault: false,
            isNamespace: false,
            nodeText: node.text,
            // Add C++-specific metadata
            namespaceParts: parts.slice(0, parts.length - 1)
          }];
        }
      }
      // Handle using directives (using namespace std)
      else if (node.type === 'using_directive') {
        const nameNode = node.childForFieldName('name');

        if (nameNode) {
          const namespaceName = getNodeText(nameNode, sourceCode);

          return [{
            name: namespaceName,
            path: namespaceName,
            isDefault: false,
            isNamespace: true,
            nodeText: node.text,
            // Add C++-specific metadata
            isUsingNamespace: true
          }];
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C/C++ imported items');
      return undefined;
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for comments before the function
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment') {
        // Check for Doxygen-style comments
        if (prev.text.startsWith('/**') || prev.text.startsWith('/*!') ||
            prev.text.startsWith('///') || prev.text.startsWith('//!')) {
          return this.parseDoxygenComment(prev.text);
        }

        // Regular comments
        return prev.text.replace(/^\/\/\s*/mg, '').trim();
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C/C++ function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for comments before the class
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment') {
        // Check for Doxygen-style comments
        if (prev.text.startsWith('/**') || prev.text.startsWith('/*!') ||
            prev.text.startsWith('///') || prev.text.startsWith('//!')) {
          return this.parseDoxygenComment(prev.text);
        }

        // Regular comments
        return prev.text.replace(/^\/\/\s*/mg, '').trim();
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C/C++ class comment');
      return undefined;
    }
  }

  /**
   * Parses a Doxygen comment into a clean comment.
   */
  private parseDoxygenComment(comment: string): string {
    try {
      if (comment.startsWith('/**') || comment.startsWith('/*!')) {
        // Block Doxygen comment
        const text = comment.substring(3, comment.length - 2);

        // Split into lines and remove leading asterisks and whitespace
        const lines = text.split('\n')
          .map(line => line.trim().replace(/^\*\s*/, ''))
          .filter(line => !line.startsWith('@') && !line.startsWith('\\')); // Remove tag lines

        // Join lines and return the description
        return lines.join(' ').trim();
      } else if (comment.startsWith('///') || comment.startsWith('//!')) {
        // Line Doxygen comment
        return comment.replace(/^\/\/[/!]\s*/mg, '').trim();
      }

      return comment;
    } catch (error) {
      logger.warn({ err: error }, 'Error parsing Doxygen comment');
      return comment;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Qt detection
      if (sourceCode.includes('#include <QObject>') ||
          sourceCode.includes('#include <QWidget>') ||
          sourceCode.includes('Q_OBJECT')) {
        return 'qt';
      }

      // Boost detection
      if (sourceCode.includes('#include <boost/') ||
          sourceCode.includes('boost::') ||
          sourceCode.includes('BOOST_')) {
        return 'boost';
      }

      // STL detection
      if (sourceCode.includes('#include <vector>') ||
          sourceCode.includes('#include <map>') ||
          sourceCode.includes('std::')) {
        return 'stl';
      }

      // OpenGL detection
      if (sourceCode.includes('#include <GL/gl.h>') ||
          sourceCode.includes('#include <GLFW/glfw3.h>') ||
          sourceCode.includes('glBegin')) {
        return 'opengl';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting C/C++ framework');
      return null;
    }
  }

  /**
   * Enhances import information using Clangd.
   * @param filePath Path to the file
   * @param imports Original imports extracted by Tree-sitter
   * @param options Options for import resolution
   * @returns Enhanced import information
   */
  public async enhanceImportInfo(
    filePath: string,
    imports: ImportInfo[],
    options: unknown
  ): Promise<ImportInfo[]> {
    try {
      // Extract include paths from the source directory
      const sourceDir = path.dirname(filePath);
      const includePaths = [sourceDir];

      // Add standard include paths based on detected framework
      const sourceCode = await this.readFileContent(filePath);
      const framework = this.detectFramework(sourceCode);

      if (framework) {
        switch (framework) {
          case 'qt':
            // Add Qt include paths if available
            if (process.env.QTDIR) {
              includePaths.push(path.join(process.env.QTDIR, 'include'));
            }
            break;
          case 'boost':
            // Add Boost include paths if available
            if (process.env.BOOST_ROOT) {
              includePaths.push(path.join(process.env.BOOST_ROOT, 'include'));
            }
            break;
          case 'opengl':
            // Add OpenGL include paths if available
            if (process.env.OPENGL_INCLUDE) {
              includePaths.push(process.env.OPENGL_INCLUDE);
            }
            break;
        }
      }

      // Add system include paths
      const systemIncludePaths = [
        '/usr/include',
        '/usr/local/include',
        '/opt/homebrew/include'
      ];

      // Create import resolver factory
      const opts = options as Record<string, unknown>;
      const factory = new ImportResolverFactory({
        allowedDir: opts.allowedDir as string,
        outputDir: opts.outputDir as string,
        maxDepth: (opts.maxDepth as number) || 3,
        clangdPath: opts.clangdPath as string,
        compileFlags: ['-std=c++17'],
        includePaths: [...includePaths, ...systemIncludePaths]
      });

      // Get resolver for C/C++
      const resolver = factory.getImportResolver(filePath);
      if (!resolver) {
        return imports;
      }

      // Analyze imports with Clangd
      const enhancedImports = await resolver.analyzeImports(filePath, {
        clangdPath: opts.clangdPath as string,
        compileFlags: ['-std=c++17'],
        includePaths: [...includePaths, ...systemIncludePaths],
        maxDepth: (opts.maxDepth as number) || 3
      });

      // Merge original and enhanced imports
      return this.mergeImportInfo(imports, enhancedImports);
    } catch (error) {
      logger.error(
        { err: error, filePath },
        'Error enhancing import info for C/C++'
      );
      return imports;
    }
  }

  /**
   * Reads the content of a file.
   */
  private async readFileContent(filePath: string): Promise<string> {
    try {
      return await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      logger.error({ err: error, filePath }, 'Error reading file content');
      return '';
    }
  }

  /**
   * Merges original and enhanced import information.
   * @param original Original imports extracted by Tree-sitter
   * @param enhanced Enhanced imports from Clangd
   * @returns Merged import information
   */
  protected mergeImportInfo(
    original: ImportInfo[],
    enhanced: ImportInfo[]
  ): ImportInfo[] {
    // If no enhanced imports, return original
    if (!enhanced || enhanced.length === 0) {
      return original;
    }

    // Create a map of original imports by path
    const originalImportMap = new Map<string, ImportInfo>();
    for (const imp of original) {
      originalImportMap.set(imp.path, imp);
    }

    // Create a result array
    const result: ImportInfo[] = [];

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
          isExternalPackage: enhancedImport.isExternalPackage
        });

        // Remove from map to track processed imports
        originalImportMap.delete(enhancedImport.path);
      } else {
        // Add new import discovered by Clangd
        result.push(enhancedImport);
      }
    }

    // Add any remaining original imports
    for (const [, remainingImport] of originalImportMap) {
      result.push(remainingImport);
    }

    return result;
  }
}
