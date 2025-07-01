/**
 * Python language handler for the Code-Map Generator tool.
 * This file contains the language handler for Python files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ImportedItem, ImportInfo } from '../codeMapModel.js';
import { ImportResolverFactory } from '../importResolvers/importResolverFactory.js';

/**
 * Language handler for Python.
 * Provides enhanced function name detection for Python files.
 */
export class PythonHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_definition',
      'lambda'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'class_definition'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'import_statement',
      'import_from_statement'
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
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for test functions
          if (name.startsWith('test_')) {
            return name;
          }

          // Check for dunder methods
          if (name.startsWith('__') && name.endsWith('__')) {
            return name; // Return the original name for dunder methods
          }

          // Check for decorators
          const decorators = this.extractDecorators(node, sourceCode);

          // Flask/FastAPI route handlers
          if (decorators.some(d => d.includes('route') ||
                                d.includes('get') ||
                                d.includes('post') ||
                                d.includes('put') ||
                                d.includes('delete'))) {
            const method = this.extractHttpMethod(decorators);
            return `${method}_handler_${name}`;
          }

          // Django view decorators
          if (decorators.some(d => d.includes('login_required') || d.includes('permission_required'))) {
            return `view_${name}`;
          }

          // Property decorators
          if (decorators.includes('@property')) {
            return `property_${name}`;
          }

          // Static method
          if (decorators.includes('@staticmethod')) {
            return `static_${name}`;
          }

          // Class method
          if (decorators.includes('@classmethod')) {
            return `classmethod_${name}`;
          }

          return name;
        }
      }

      // Handle lambda expressions
      if (node.type === 'lambda') {
        // Check if assigned to a variable
        if (node.parent?.type === 'assignment') {
          const targets = node.parent.childForFieldName('targets');
          if (targets?.firstChild) {
            return getNodeText(targets.firstChild, sourceCode);
          }
        }

        // Check if used in a higher-order function
        if (node.parent?.type === 'argument_list' && node.parent.parent?.type === 'call') {
          const funcNode = node.parent.parent.childForFieldName('function');
          if (funcNode) {
            const funcName = getNodeText(funcNode, sourceCode);
            if (['map', 'filter', 'reduce'].includes(funcName)) {
              return `${funcName}_lambda`;
            }
          }
        }

        return 'lambda';
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python function name');
      return 'anonymous';
    }
  }

  /**
   * Extracts decorators from a function definition.
   */
  private extractDecorators(node: SyntaxNode, sourceCode: string): string[] {
    try {
      const decorators: string[] = [];

      // Check for decorated_definition parent
      if (node.parent?.type === 'decorated_definition') {
        const decoratorListNode = node.parent.childForFieldName('decorator_list');
        if (decoratorListNode) {
          decoratorListNode.children.forEach(child => {
            if (child.type === 'decorator') {
              decorators.push(getNodeText(child, sourceCode));
            }
          });
        }
      }

      return decorators;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python decorators');
      return [];
    }
  }

  /**
   * Extracts the HTTP method from decorators.
   */
  private extractHttpMethod(decorators: string[]): string {
    try {
      for (const decorator of decorators) {
        if (decorator.includes('get(')) return 'get';
        if (decorator.includes('post(')) return 'post';
        if (decorator.includes('put(')) return 'put';
        if (decorator.includes('delete(')) return 'delete';
        if (decorator.includes('patch(')) return 'patch';
      }

      // Default to route if no specific method found
      return 'route';
    } catch (error) {
      logger.warn({ err: error }, 'Error extracting HTTP method from Python decorators');
      return 'route';
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'class_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return 'AnonymousClass';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python class name');
      return 'AnonymousClass';
    }
  }

  /**
   * Extracts the parent class from an AST node.
   */
  protected extractParentClass(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'class_definition') {
        const argListNode = node.childForFieldName('argument_list');
        if (argListNode?.firstChild?.type === 'identifier') {
          return getNodeText(argListNode.firstChild, sourceCode);
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python parent class');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'import_statement') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      } else if (node.type === 'import_from_statement') {
        const moduleNameNode = node.childForFieldName('module_name');
        if (moduleNameNode) {
          return getNodeText(moduleNameNode, sourceCode);
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python import path');
      return 'unknown';
    }
  }

  /**
   * Extracts imported items from an AST node.
   */
  protected extractImportedItems(node: SyntaxNode, sourceCode: string): ImportedItem[] | undefined {
    try {
      if (node.type === 'import_from_statement') {
        const items: ImportedItem[] = [];

        // Get the module path
        const moduleNode = node.childForFieldName('module_name');
        const modulePath = moduleNode ? getNodeText(moduleNode, sourceCode) : '';

        // Extract names from import_from_statement
        node.descendantsOfType(['dotted_name', 'identifier', 'aliased_import']).forEach(itemNode => {
          if (itemNode.parent?.type === 'import_from_statement' &&
              itemNode.previousSibling?.text === 'import') {
            const name = getNodeText(itemNode, sourceCode);
            items.push({
              name,
              path: modulePath,
              isDefault: false,
              isNamespace: false,
              nodeText: itemNode.text
            });
          } else if (itemNode.type === 'aliased_import') {
            const nameNode = itemNode.childForFieldName('name');
            const aliasNode = itemNode.childForFieldName('alias');
            if (nameNode && aliasNode) {
              const name = getNodeText(nameNode, sourceCode);
              const alias = getNodeText(aliasNode, sourceCode);
              items.push({
                name: `${name} as ${alias}`,
                path: modulePath,
                isDefault: false,
                isNamespace: false,
                nodeText: itemNode.text
              });
            }
          }
        });

        // Handle wildcard import
        if (node.descendantsOfType('wildcard_import').length > 0) {
          items.push({
            name: '*',
            path: modulePath,
            isDefault: false,
            isNamespace: true,
            nodeText: '*'
          });
        }

        return items.length > 0 ? items : undefined;
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python imported items');
      return undefined;
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for docstring in function body
      if (node.type === 'function_definition') {
        const bodyNode = node.childForFieldName('body');
        if (bodyNode?.firstChild?.type === 'expression_statement' &&
            bodyNode.firstChild.firstChild?.type === 'string') {
          const docstringNode = bodyNode.firstChild.firstChild;
          const docstring = getNodeText(docstringNode, sourceCode);

          // Parse docstring
          return this.parseDocstring(docstring);
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for docstring in class body
      if (node.type === 'class_definition') {
        const bodyNode = node.childForFieldName('body');
        if (bodyNode?.firstChild?.type === 'expression_statement' &&
            bodyNode.firstChild.firstChild?.type === 'string') {
          const docstringNode = bodyNode.firstChild.firstChild;
          const docstring = getNodeText(docstringNode, sourceCode);

          // Parse docstring
          return this.parseDocstring(docstring);
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python class comment');
      return undefined;
    }
  }

  /**
   * Extracts properties from a Python class.
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

      // In Python, properties are often defined in two ways:
      // 1. As class variables directly in the class body
      // 2. As instance variables in the __init__ method

      // First, find class variables (static properties)
      classBody.children.forEach(childNode => {
        if (childNode.type === 'expression_statement' &&
            childNode.firstChild?.type === 'assignment') {

          const assignment = childNode.firstChild;
          const leftNode = assignment.childForFieldName('left');

          if (leftNode && leftNode.type === 'identifier') {
            const name = getNodeText(leftNode, sourceCode);

            // Skip if it's a dunder name (like __doc__, __module__, etc.)
            if (name.startsWith('__') && name.endsWith('__')) {
              return;
            }

            // Extract comment
            const comment = this.extractPropertyComment(childNode, sourceCode);

            // Extract type annotation if available
            let type: string | undefined;
            const annotationNode = leftNode.nextSibling;
            if (annotationNode && annotationNode.type === 'type') {
              type = getNodeText(annotationNode, sourceCode);
            }

            // Determine access modifier based on naming convention
            let accessModifier: string | undefined;
            if (name.startsWith('__')) {
              accessModifier = 'private';
            } else if (name.startsWith('_')) {
              accessModifier = 'protected';
            } else {
              accessModifier = 'public';
            }

            properties.push({
              name,
              type,
              accessModifier,
              isStatic: true, // Class variables are static
              comment,
              startLine: childNode.startPosition.row + 1,
              endLine: childNode.endPosition.row + 1
            });
          }
        }
      });

      // Second, find instance variables in __init__ method
      const initMethod = this.findInitMethod(classBody);
      if (initMethod) {
        const methodBody = initMethod.childForFieldName('body');
        if (methodBody) {
          // Look for self.property = value assignments
          methodBody.descendantsOfType('assignment').forEach(assignment => {
            const leftNode = assignment.childForFieldName('left');
            if (leftNode && leftNode.type === 'attribute' && leftNode.text.startsWith('self.')) {
              const propertyName = leftNode.text.substring(5); // Remove 'self.'

              // Skip if we already found this property
              if (properties.some(p => p.name === propertyName)) {
                return;
              }

              // Extract comment
              const comment = this.extractPropertyComment(assignment.parent || assignment, sourceCode);

              // Determine access modifier based on naming convention
              let accessModifier: string | undefined;
              if (propertyName.startsWith('__')) {
                accessModifier = 'private';
              } else if (propertyName.startsWith('_')) {
                accessModifier = 'protected';
              } else {
                accessModifier = 'public';
              }

              properties.push({
                name: propertyName,
                accessModifier,
                isStatic: false, // Instance variables are not static
                comment,
                startLine: assignment.startPosition.row + 1,
                endLine: assignment.endPosition.row + 1
              });
            }
          });

          // Also look for type annotations in parameters
          const parameters = initMethod.childForFieldName('parameters');
          if (parameters) {
            parameters.descendantsOfType('typed_parameter').forEach(param => {
              const nameNode = param.childForFieldName('name');
              const typeNode = param.childForFieldName('type');

              if (nameNode && typeNode && nameNode.text !== 'self') {
                const name = getNodeText(nameNode, sourceCode);
                const type = getNodeText(typeNode, sourceCode);

                // Check if this parameter is assigned to self in the method body
                const selfAssignment = methodBody.descendantsOfType('assignment').find(assignment => {
                  const leftNode = assignment.childForFieldName('left');
                  const rightNode = assignment.childForFieldName('right');
                  return leftNode?.text === `self.${name}` && rightNode?.text === name;
                });

                if (selfAssignment) {
                  // Skip if we already found this property
                  if (properties.some(p => p.name === name)) {
                    return;
                  }

                  // Determine access modifier based on naming convention
                  let accessModifier: string | undefined;
                  if (name.startsWith('__')) {
                    accessModifier = 'private';
                  } else if (name.startsWith('_')) {
                    accessModifier = 'protected';
                  } else {
                    accessModifier = 'public';
                  }

                  properties.push({
                    name,
                    type,
                    accessModifier,
                    isStatic: false,
                    startLine: selfAssignment.startPosition.row + 1,
                    endLine: selfAssignment.endPosition.row + 1
                  });
                }
              }
            });
          }
        }
      }

      // Third, look for properties defined using property decorators
      classBody.descendantsOfType('decorated_definition').forEach(decorated => {
        const decoratorList = decorated.childForFieldName('decorator_list');
        const functionDef = decorated.childForFieldName('definition');

        if (decoratorList && functionDef && functionDef.type === 'function_definition') {
          const hasPropertyDecorator = decoratorList.children.some(decorator =>
            decorator.type === 'decorator' && decorator.text.includes('@property'));

          if (hasPropertyDecorator) {
            const nameNode = functionDef.childForFieldName('name');
            if (nameNode) {
              const name = getNodeText(nameNode, sourceCode);

              // Skip if we already found this property
              if (properties.some(p => p.name === name)) {
                return;
              }

              // Extract comment
              const comment = this.extractFunctionComment(functionDef, sourceCode);

              // Determine access modifier based on naming convention
              let accessModifier: string | undefined;
              if (name.startsWith('__')) {
                accessModifier = 'private';
              } else if (name.startsWith('_')) {
                accessModifier = 'protected';
              } else {
                accessModifier = 'public';
              }

              // Extract return type annotation if available
              let type: string | undefined;
              const returnTypeNode = functionDef.childForFieldName('return_type');
              if (returnTypeNode) {
                type = getNodeText(returnTypeNode, sourceCode);
              }

              properties.push({
                name,
                type,
                accessModifier,
                isStatic: false,
                comment,
                startLine: decorated.startPosition.row + 1,
                endLine: decorated.endPosition.row + 1
              });
            }
          }
        }
      });

      return properties;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python class properties');
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
  private extractPropertyComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Check for comments before the node
      const lineStart = sourceCode.lastIndexOf('\n', node.startIndex) + 1;
      const textBeforeNode = sourceCode.substring(0, lineStart).trim();

      // Look for single-line comments
      const lines = textBeforeNode.split('\n');
      const commentLines = [];

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('#')) {
          commentLines.unshift(line.substring(1).trim());
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
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python property comment');
      return undefined;
    }
  }

  /**
   * Finds the __init__ method in a class body.
   *
   * @param classBody The class body node
   * @returns The __init__ method node or undefined
   */
  private findInitMethod(classBody: SyntaxNode): SyntaxNode | undefined {
    for (const child of classBody.children) {
      if (child.type === 'function_definition') {
        const nameNode = child.childForFieldName('name');
        if (nameNode && getNodeText(nameNode, '') === '__init__') {
          return child;
        }
      } else if (child.type === 'decorated_definition') {
        const functionDef = child.childForFieldName('definition');
        if (functionDef && functionDef.type === 'function_definition') {
          const nameNode = functionDef.childForFieldName('name');
          if (nameNode && getNodeText(nameNode, '') === '__init__') {
            return functionDef;
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Parses a docstring into a clean comment.
   */
  private parseDocstring(docstring: string): string {
    try {
      // Remove quotes
      let text = docstring;
      if (text.startsWith('"""') && text.endsWith('"""')) {
        text = text.substring(3, text.length - 3);
      } else if (text.startsWith("'''") && text.endsWith("'''")) {
        text = text.substring(3, text.length - 3);
      } else if (text.startsWith('"') && text.endsWith('"')) {
        text = text.substring(1, text.length - 1);
      } else if (text.startsWith("'") && text.endsWith("'")) {
        text = text.substring(1, text.length - 1);
      }

      // Split into lines and remove common indentation
      const lines = text.split('\n');
      const trimmedLines = lines.map(line => line.trim());

      // Extract the first paragraph (summary)
      const paragraphs = trimmedLines.join('\n').split('\n\n');
      return paragraphs[0].replace(/\n/g, ' ').trim();
    } catch (error) {
      logger.warn({ err: error }, 'Error parsing Python docstring');
      return docstring;
    }
  }

  /**
   * Checks if a function is a generator.
   */
  protected isGeneratorFunction(node: SyntaxNode, _sourceCode: string): boolean {
    try {
      if (node.type === 'function_definition') {
        const bodyNode = node.childForFieldName('body');
        if (bodyNode) {
          // Check for yield statements in the function body
          return bodyNode.descendantsOfType('yield').length > 0;
        }
      }
      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Python function is a generator');
      return false;
    }
  }

  /**
   * Override the isAsyncFunction method to detect async functions.
   */
  protected isAsyncFunction(node: SyntaxNode, _sourceCode: string): boolean {
    try {
      if (node.type === 'function_definition') {
        // Check for async keyword
        return node.text.startsWith('async ');
      }
      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Python function is async');
      return false;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Django detection
      if (sourceCode.includes('django') ||
          sourceCode.includes('from django import') ||
          sourceCode.includes('models.Model')) {
        return 'django';
      }

      // Flask detection
      if (sourceCode.includes('flask') ||
          sourceCode.includes('from flask import') ||
          sourceCode.includes('Flask(__name__)')) {
        return 'flask';
      }

      // FastAPI detection
      if (sourceCode.includes('fastapi') ||
          sourceCode.includes('from fastapi import') ||
          sourceCode.includes('FastAPI()')) {
        return 'fastapi';
      }

      // Pytest detection
      if (sourceCode.includes('pytest') ||
          sourceCode.includes('from pytest import') ||
          sourceCode.includes('@pytest.fixture')) {
        return 'pytest';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Python framework');
      return null;
    }
  }

  /**
   * Enhances import information using Pyright.
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
        pythonPath: options.pythonPath as string | undefined,
        pythonVersion: options.pythonVersion as string | undefined,
        venvPath: options.venvPath as string | undefined
      });

      // Get resolver for Python
      const resolver = factory.getImportResolver(filePath);
      if (!resolver) {
        return imports;
      }

      // Analyze imports with Pyright
      const enhancedImports = await resolver.analyzeImports(filePath, {
        pythonPath: options.pythonPath,
        pythonVersion: options.pythonVersion,
        venvPath: options.venvPath,
        maxDepth: options.maxDepth || 3
      });

      // Merge original and enhanced imports
      return this.mergeImportInfo(imports, enhancedImports);
    } catch (error) {
      logger.error(
        { err: error, filePath },
        'Error enhancing import info for Python'
      );
      return imports;
    }
  }

  /**
   * Merges original and enhanced import information.
   * @param original Original imports extracted by Tree-sitter
   * @param enhanced Enhanced imports from Pyright
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
        // Add new import discovered by Pyright
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
