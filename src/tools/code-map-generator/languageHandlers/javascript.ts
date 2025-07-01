/**
 * JavaScript language handler for the Code-Map Generator tool.
 * This file contains the language handler for JavaScript files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ImportedItem, ImportInfo } from '../codeMapModel.js';
import { ImportResolverFactory } from '../importResolvers/importResolverFactory.js';
import * as path from 'path';

/**
 * Language handler for JavaScript.
 * Provides enhanced function name detection for JavaScript files.
 */
export class JavaScriptHandler extends BaseLanguageHandler {
  /**
   * Whether this handler should handle JSX syntax.
   */
  private readonly isJsx: boolean;

  /**
   * Creates a new JavaScript language handler.
   *
   * @param isJsx Whether this handler should handle JSX syntax.
   */
  constructor(isJsx: boolean = false) {
    super();
    this.isJsx = isJsx;
  }

  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_declaration',
      'arrow_function',
      'method_definition',
      'function'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'class_declaration',
      'class',
      'class_expression'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'import_statement',
      'import_specifier',
      'import_clause'
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
      // Handle function declarations
      if (node.type === 'function_declaration') {
        const nameNode = node.childForFieldName('name');
        return nameNode ? getNodeText(nameNode, sourceCode) : 'anonymous';
      }

      // Handle arrow functions
      if (node.type === 'arrow_function') {
        // Variable assignment: const x = () => {}
        if (node.parent?.type === 'variable_declarator') {
          const nameNode = node.parent.childForFieldName('name');
          if (nameNode) {
            const name = getNodeText(nameNode, sourceCode);

            // React hook detection
            if (name.startsWith('use') && name.length > 3 && name[3] === name[3].toUpperCase()) {
              return `${name}Hook`;
            }

            // Event handler detection
            if (name.startsWith('handle') || name.startsWith('on')) {
              return `${name}Handler`;
            }

            return name;
          }
        }

        // Object property: { onClick: () => {} }
        if (node.parent?.type === 'pair') {
          const keyNode = node.parent.childForFieldName('key');
          if (keyNode) {
            const name = getNodeText(keyNode, sourceCode);

            // Event handler detection
            if (name.startsWith('on') && name.length > 2 && name[2] === name[2].toUpperCase()) {
              return `${name}Handler`;
            }

            return name;
          }
        }

        // React component detection
        if (this.isJsx && this.isReactComponent(node, sourceCode)) {
          // Try to find component name from variable assignment
          if (node.parent?.type === 'variable_declarator') {
            const nameNode = node.parent.childForFieldName('name');
            if (nameNode) {
              const name = getNodeText(nameNode, sourceCode);
              if (name[0] === name[0].toUpperCase()) {
                return `${name}Component`;
              }
            }
          }

          return 'ReactComponent';
        }

        // Function argument: array.map(() => {})
        if (node.parent?.type === 'arguments' && node.parent.parent?.type === 'call_expression') {
          const callExpr = node.parent.parent;
          const funcNode = callExpr.childForFieldName('function');

          if (funcNode?.type === 'member_expression') {
            const propertyNode = funcNode.childForFieldName('property');

            if (propertyNode) {
              const methodName = getNodeText(propertyNode, sourceCode);

              // Array methods
              if (['map', 'filter', 'reduce', 'forEach', 'find'].includes(methodName)) {
                return `${methodName}Callback`;
              }

              // Event handlers
              if (methodName === 'addEventListener') {
                const args = callExpr.childForFieldName('arguments');
                if (args?.firstChild?.type === 'string') {
                  const eventType = getNodeText(args.firstChild, sourceCode).replace(/['"]/g, '');
                  return `${eventType}EventHandler`;
                }
                return 'eventHandler';
              }

              // Promise methods
              if (['then', 'catch', 'finally'].includes(methodName)) {
                return `promise${methodName.charAt(0).toUpperCase() + methodName.slice(1)}Callback`;
              }
            }
          }

          // React hooks
          if (funcNode?.type === 'identifier') {
            const hookName = getNodeText(funcNode, sourceCode);
            if (hookName === 'useEffect' || hookName === 'useLayoutEffect') {
              return `${hookName}Callback`;
            }
          }
        }
      }

      // Handle method definitions
      if (node.type === 'method_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Handle private methods (ES2022+)
          if (name.startsWith('#')) {
            return `private_${name.substring(1)}`;
          }

          // React lifecycle methods
          if (this.isReactLifecycleMethod(name)) {
            return `lifecycle_${name}`;
          }

          return name;
        }
      }

      // Handle function expressions
      if (node.type === 'function') {
        // Variable assignment: const x = function() {}
        if (node.parent?.type === 'variable_declarator') {
          const nameNode = node.parent.childForFieldName('name');
          return nameNode ? getNodeText(nameNode, sourceCode) : 'anonymous';
        }

        // IIFE: (function() {})()
        if (node.parent?.type === 'parenthesized_expression' &&
            node.parent.parent?.type === 'call_expression') {
          return 'iife';
        }
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting JavaScript function name');
      return 'anonymous';
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        return getNodeText(nameNode, sourceCode);
      }

      // Class expressions might not have a name
      if (node.type === 'class_expression' && node.parent?.type === 'variable_declarator') {
        const parentNameNode = node.parent.childForFieldName('name');
        if (parentNameNode) {
          return getNodeText(parentNameNode, sourceCode);
        }
      }

      return 'AnonymousClass';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting JavaScript class name');
      return 'AnonymousClass';
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'import_statement') {
        const sourceNode = node.childForFieldName('source');
        if (sourceNode) {
          const path = getNodeText(sourceNode, sourceCode);
          return path.replace(/^['"]|['"]$/g, '');
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting JavaScript import path');
      return 'unknown';
    }
  }

  /**
   * Extracts imported items from an AST node.
   */
  protected extractImportedItems(node: SyntaxNode, sourceCode: string): ImportedItem[] | undefined {
    try {
      if (node.type === 'import_statement') {
        const items: ImportedItem[] = [];
        const sourceNode = node.childForFieldName('source');
        const sourcePath = sourceNode ? getNodeText(sourceNode, sourceCode).replace(/['"]/g, '') : '';

        // Handle default import
        const clauseNode = node.childForFieldName('import_clause');
        if (clauseNode) {
          // Default import: import React from 'react'
          const defaultImport = clauseNode.childForFieldName('default');
          if (defaultImport) {
            const name = getNodeText(defaultImport, sourceCode);
            items.push({
              name,
              path: sourcePath,
              isDefault: true,
              isNamespace: false,
              nodeText: node.text
            });
          }

          // Named imports: import { useState, useEffect } from 'react'
          const namedImportsNode = clauseNode.childForFieldName('named_imports');
          if (namedImportsNode) {
            namedImportsNode.descendantsOfType('import_specifier').forEach(specifier => {
              const nameNode = specifier.childForFieldName('name');
              if (nameNode) {
                const name = getNodeText(nameNode, sourceCode);
                items.push({
                  name,
                  path: sourcePath,
                  isDefault: false,
                  isNamespace: false,
                  nodeText: specifier.text
                });
              }
            });
          }

          // Namespace import: import * as React from 'react'
          const namespaceImportNode = clauseNode.childForFieldName('namespace_import');
          if (namespaceImportNode) {
            const nameNode = namespaceImportNode.childForFieldName('name');
            if (nameNode) {
              const name = getNodeText(nameNode, sourceCode);
              items.push({
                name: `* as ${name}`,
                path: sourcePath,
                isDefault: false,
                isNamespace: true,
                nodeText: namespaceImportNode.text
              });
            }
          }
        }

        return items.length > 0 ? items : undefined;
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting JavaScript imported items');
      return undefined;
    }
  }

  /**
   * Checks if an import is a default import.
   */
  protected isDefaultImport(node: SyntaxNode, _sourceCode: string): boolean | undefined {
    try {
      if (node.type === 'import_statement') {
        const clauseNode = node.childForFieldName('import_clause');
        if (clauseNode) {
          const defaultImport = clauseNode.childForFieldName('default');
          return !!defaultImport;
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if JavaScript import is default');
      return undefined;
    }
  }

  /**
   * Extracts the import alias from an AST node.
   */
  protected extractImportAlias(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'import_statement') {
        const clauseNode = node.childForFieldName('import_clause');
        if (clauseNode) {
          // Namespace import: import * as React from 'react'
          const namespaceImportNode = clauseNode.childForFieldName('namespace_import');
          if (namespaceImportNode) {
            const nameNode = namespaceImportNode.childForFieldName('name');
            if (nameNode) {
              return getNodeText(nameNode, sourceCode);
            }
          }

          // Named imports with aliases: import { useState as useStateHook } from 'react'
          const namedImportsNode = clauseNode.childForFieldName('named_imports');
          if (namedImportsNode) {
            const specifiers = namedImportsNode.descendantsOfType('import_specifier');
            for (const specifier of specifiers) {
              const aliasNode = specifier.childForFieldName('alias');
              if (aliasNode) {
                return getNodeText(aliasNode, sourceCode);
              }
            }
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting JavaScript import alias');
      return undefined;
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for JSDoc comments
      let current = node;

      // If node is part of a variable declaration, move up to the declaration
      if (node.type === 'arrow_function' || node.type === 'function') {
        if (node.parent?.type === 'variable_declarator') {
          current = node.parent;
          if (current.parent?.type === 'variable_declaration') {
            current = current.parent;
          }
        }
      }

      // Check for comments before the node
      // const startPosition = current.startPosition; // Unused for now
      const lineStart = _sourceCode.lastIndexOf('\n', current.startIndex) + 1;
      const textBeforeNode = _sourceCode.substring(0, lineStart).trim();

      // Look for JSDoc comment
      const jsdocEnd = textBeforeNode.lastIndexOf('*/');
      if (jsdocEnd !== -1) {
        const jsdocStart = textBeforeNode.lastIndexOf('/**', jsdocEnd);
        if (jsdocStart !== -1) {
          const comment = textBeforeNode.substring(jsdocStart + 3, jsdocEnd).trim();

          // Extract first sentence or description
          const lines = comment.split('\n');
          const description = lines
            .map(line => line.trim().replace(/^\* ?/, ''))
            .filter(line => !line.startsWith('@'))
            .join(' ')
            .trim();

          return description;
        }
      }

      // Look for single-line comments
      const lines = textBeforeNode.split('\n');
      const commentLines = [];

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('//')) {
          commentLines.unshift(line.substring(2).trim());
        } else if (line === '') {
          // Skip empty lines
          continue;
        } else {
          // Stop at non-comment, non-empty line
          break;
        }
      }

      if (commentLines.length > 0) {
        return commentLines.join(' ');
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting JavaScript function comment');
      return undefined;
    }
  }

  /**
   * Checks if a function is a React component.
   */
  private isReactComponent(node: SyntaxNode, sourceCode: string): boolean {
    try {
      // Check for JSX in the function body
      const bodyNode = node.childForFieldName('body');
      if (bodyNode) {
        const bodyText = getNodeText(bodyNode, sourceCode);
        return bodyText.includes('<') && bodyText.includes('/>');
      }
      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if function is a React component');
      return false;
    }
  }

  /**
   * Checks if a method name is a React lifecycle method.
   */
  private isReactLifecycleMethod(name: string): boolean {
    const lifecycleMethods = [
      'componentDidMount',
      'componentDidUpdate',
      'componentWillUnmount',
      'shouldComponentUpdate',
      'getSnapshotBeforeUpdate',
      'componentDidCatch',
      'render'
    ];
    return lifecycleMethods.includes(name);
  }

  /**
   * Extracts properties from a class declaration.
   *
   * @param node The class node to extract properties from
   * @param sourceCode The source code containing the class
   * @returns An array of class property information
   */
  protected extractClassProperties(node: SyntaxNode, sourceCode: string): Array<{
    name: string;
    type?: string;
    comment?: string;
    startLine: number;
    endLine: number;
    accessModifier?: string;
    isStatic?: boolean;
  }> {
    const properties: Array<{
      name: string;
      type?: string;
      comment?: string;
      startLine: number;
      endLine: number;
      accessModifier?: string;
      isStatic?: boolean;
    }> = [];

    try {
      // Find the class body
      const classBody = node.childForFieldName('body');
      if (!classBody) return properties;

      // Traverse the class body to find property declarations
      classBody.children.forEach(childNode => {
        // Handle class property definitions
        if (childNode.type === 'property_definition' ||
            childNode.type === 'field_definition' ||
            childNode.type === 'class_field_definition' ||
            childNode.type === 'public_field_definition' ||
            childNode.type === 'private_field_definition') {

          // Extract property name
          const nameNode = childNode.childForFieldName('name');
          if (!nameNode) return;

          const name = getNodeText(nameNode, sourceCode);

          // Extract property type (for TypeScript)
          let type: string | undefined;
          const typeNode = childNode.childForFieldName('type');
          if (typeNode) {
            type = getNodeText(typeNode, sourceCode);
          }

          // Determine access modifier
          let accessModifier: string | undefined;
          const nodeText = childNode.text;

          if (nodeText.includes('private ') || name.startsWith('#') || childNode.type === 'private_field_definition') {
            accessModifier = 'private';
          } else if (nodeText.includes('protected ')) {
            accessModifier = 'protected';
          } else if (nodeText.includes('public ') || childNode.type === 'public_field_definition') {
            accessModifier = 'public';
          }

          // Determine if static
          const isStatic = nodeText.includes('static ');

          // Extract comment
          const comment = this.extractPropertyComment(childNode, sourceCode);

          properties.push({
            name: name.startsWith('#') ? name.substring(1) : name, // Remove # for private fields
            type,
            accessModifier,
            isStatic,
            comment,
            startLine: childNode.startPosition.row + 1,
            endLine: childNode.endPosition.row + 1
          });
        }
      });

      // Also look for properties defined in the constructor
      const constructorMethod = this.findConstructorMethod(classBody);
      if (constructorMethod) {
        const constructorBody = constructorMethod.childForFieldName('body');
        if (constructorBody) {
          // Look for this.property = value assignments
          constructorBody.descendantsOfType('assignment_expression').forEach(assignment => {
            const leftNode = assignment.childForFieldName('left');
            if (leftNode && leftNode.text.startsWith('this.')) {
              const propertyName = leftNode.text.substring(5); // Remove 'this.'

              // Skip if we already found this property
              if (properties.some(p => p.name === propertyName)) {
                return;
              }

              // Extract comment
              const comment = this.extractPropertyComment(assignment, sourceCode);

              properties.push({
                name: propertyName,
                accessModifier: 'public', // Default to public for constructor-assigned properties
                isStatic: false,
                comment,
                startLine: assignment.startPosition.row + 1,
                endLine: assignment.endPosition.row + 1
              });
            }
          });
        }
      }

      return properties;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting JavaScript class properties');
      return properties;
    }
  }

  /**
   * Extracts a comment for a property.
   *
   * @param node The property node
   * @param sourceCode The source code
   * @returns The extracted comment or undefined
   */
  protected extractPropertyComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Check for comments before the node
      // Unused for now
      const lineStart = sourceCode.lastIndexOf('\n', node.startIndex) + 1;
      const textBeforeNode = sourceCode.substring(0, lineStart).trim();

      // Look for JSDoc comment
      const jsdocEnd = textBeforeNode.lastIndexOf('*/');
      if (jsdocEnd !== -1) {
        const jsdocStart = textBeforeNode.lastIndexOf('/**', jsdocEnd);
        if (jsdocStart !== -1) {
          const comment = textBeforeNode.substring(jsdocStart + 3, jsdocEnd).trim();

          // Extract first sentence or description
          const lines = comment.split('\n');
          const description = lines
            .map(line => line.trim().replace(/^\* ?/, ''))
            .filter(line => !line.startsWith('@'))
            .join(' ')
            .trim();

          return description;
        }
      }

      // Look for single-line comments
      const lines = textBeforeNode.split('\n');
      const commentLines = [];

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('//')) {
          commentLines.unshift(line.substring(2).trim());
        } else if (line === '') {
          // Skip empty lines
          continue;
        } else {
          // Stop at non-comment, non-empty line
          break;
        }
      }

      if (commentLines.length > 0) {
        return commentLines.join(' ');
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting JavaScript property comment');
      return undefined;
    }
  }

  /**
   * Finds the constructor method in a class body.
   *
   * @param classBody The class body node
   * @returns The constructor method node or undefined
   */
  private findConstructorMethod(classBody: SyntaxNode): SyntaxNode | undefined {
    for (const child of classBody.children) {
      if (child.type === 'method_definition') {
        const nameNode = child.childForFieldName('name');
        if (nameNode && getNodeText(nameNode, '') === 'constructor') {
          return child;
        }
      }
    }
    return undefined;
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // React detection
      if (sourceCode.includes('React') ||
          sourceCode.includes('react') ||
          sourceCode.includes('jsx') ||
          sourceCode.includes('</>')) {
        return 'react';
      }

      // Angular detection
      if (sourceCode.includes('Angular') ||
          sourceCode.includes('@Component') ||
          sourceCode.includes('@NgModule')) {
        return 'angular';
      }

      // Vue detection
      if (sourceCode.includes('Vue') ||
          sourceCode.includes('createApp') ||
          sourceCode.includes('<template>')) {
        return 'vue';
      }

      // Express detection
      if (sourceCode.includes('express') ||
          sourceCode.includes('app.get(') ||
          sourceCode.includes('app.post(')) {
        return 'express';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting JavaScript framework');
      return null;
    }
  }

  /**
   * Enhances import information using Dependency-Cruiser.
   * @param filePath Path to the file
   * @param imports Original imports extracted by Tree-sitter
   * @param options Options for import resolution
   * @returns Enhanced import information
   */
  public async enhanceImportInfo(
    filePath: string,
    imports: ImportInfo[],
    options: Record<string, unknown>
  ): Promise<ImportInfo[]> {
    try {
      // Create import resolver factory
      const factory = new ImportResolverFactory({
        allowedDir: options.allowedDir as string,
        outputDir: options.outputDir as string,
        maxDepth: (options.maxDepth as number) || 3,
        tsConfig: options.tsConfig as string | undefined
      });

      // Get resolver for JavaScript
      const resolver = factory.getImportResolver(filePath);
      if (!resolver) {
        return imports;
      }

      // Analyze imports with Dependency-Cruiser
      const enhancedImports = await resolver.analyzeImports(filePath, {
        baseDir: path.dirname(filePath),
        maxDepth: options.maxDepth || 3,
        tsConfig: options.tsConfig
      });

      // Merge original and enhanced imports
      return this.mergeImportInfo(imports, enhancedImports);
    } catch (error) {
      logger.error(
        { err: error, filePath },
        'Error enhancing import info for JavaScript'
      );
      return imports;
    }
  }

  /**
   * Merges original and enhanced import information.
   * @param original Original imports extracted by Tree-sitter
   * @param enhanced Enhanced imports from Dependency-Cruiser
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
          isDynamic: enhancedImport.isDynamic,
          moduleSystem: enhancedImport.moduleSystem || originalImport.moduleSystem
        });

        // Remove from map to track processed imports
        originalImportMap.delete(enhancedImport.path);
      } else {
        // Add new import discovered by Dependency-Cruiser
        result.push(enhancedImport);
      }
    }

    // Add any remaining original imports
    for (const remainingImport of originalImportMap.values()) {
      result.push(remainingImport);
    }

    return result;
  }
}
