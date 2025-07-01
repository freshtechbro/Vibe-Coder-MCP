/**
 * Java language handler for the Code-Map Generator tool.
 * This file contains the language handler for Java files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ImportedItem } from '../codeMapModel.js';

/**
 * Language handler for Java.
 * Provides enhanced function name detection for Java files.
 */
export class JavaHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'method_declaration',
      'constructor_declaration',
      'lambda_expression'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'class_declaration',
      'interface_declaration',
      'enum_declaration'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'import_declaration',
      'static_import_declaration'
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
      // Handle method declarations
      if (node.type === 'method_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for annotations
          const annotations = this.getMethodAnnotations(node, sourceCode);

          // Spring REST endpoints
          if (annotations.includes('@GetMapping') ||
              annotations.includes('@PostMapping') ||
              annotations.includes('@RequestMapping') ||
              annotations.includes('@PutMapping') ||
              annotations.includes('@DeleteMapping')) {
            return `endpoint_${name}`;
          }

          // JUnit tests
          if (annotations.includes('@Test')) {
            return `test_${name}`;
          }

          // Android lifecycle methods
          if (this.isAndroidLifecycleMethod(name)) {
            return `lifecycle_${name}`;
          }

          return name;
        }
      }

      // Handle constructor declarations
      if (node.type === 'constructor_declaration') {
        const className = this.findClassName(node, sourceCode);
        return `${className}_Constructor`;
      }

      // Handle lambda expressions
      if (node.type === 'lambda_expression') {
        // Check if used in a method call
        if (node.parent?.type === 'argument_list' && node.parent.parent?.type === 'method_invocation') {
          const methodNode = node.parent.parent.childForFieldName('name');
          if (methodNode) {
            const methodName = getNodeText(methodNode, sourceCode);

            // Stream operations
            if (['map', 'filter', 'forEach', 'reduce'].includes(methodName)) {
              return `${methodName}Lambda`;
            }

            // Event handlers
            if (methodName.startsWith('set') && methodName.endsWith('Listener')) {
              const eventType = methodName.substring(3, methodName.length - 8);
              return `${eventType}Handler`;
            }
          }
        }

        return 'lambda';
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Java function name');
      return 'anonymous';
    }
  }

  /**
   * Finds the class name for a node.
   */
  private findClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      // Find the parent class declaration
      let current = node.parent;
      while (current && current.type !== 'class_declaration') {
        current = current.parent;
      }

      if (current) {
        const nameNode = current.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return 'Unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error finding Java class name');
      return 'Unknown';
    }
  }

  /**
   * Gets annotations for a method.
   */
  private getMethodAnnotations(node: SyntaxNode, sourceCode: string): string[] {
    try {
      const annotations: string[] = [];

      // Check for annotations before the method
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type === 'annotation') {
        annotations.push(getNodeText(prev, sourceCode));
        prev = prev.previousNamedSibling;
      }

      return annotations;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error getting Java method annotations');
      return [];
    }
  }

  /**
   * Checks if a method name is an Android lifecycle method.
   */
  private isAndroidLifecycleMethod(name: string): boolean {
    try {
      const lifecycleMethods = [
        'onCreate',
        'onStart',
        'onResume',
        'onPause',
        'onStop',
        'onDestroy',
        'onCreateView',
        'onViewCreated'
      ];

      return lifecycleMethods.includes(name);
    } catch (error) {
      logger.warn({ err: error }, 'Error checking if method is Android lifecycle method');
      return false;
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'class_declaration' ||
          node.type === 'interface_declaration' ||
          node.type === 'enum_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return 'AnonymousClass';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Java class name');
      return 'AnonymousClass';
    }
  }

  /**
   * Extracts the parent class from an AST node.
   */
  protected extractParentClass(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'class_declaration') {
        const superclassNode = node.childForFieldName('superclass');
        if (superclassNode) {
          return getNodeText(superclassNode, sourceCode);
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Java parent class');
      return undefined;
    }
  }

  /**
   * Extracts implemented interfaces from an AST node.
   */
  protected extractImplementedInterfaces(node: SyntaxNode, sourceCode: string): string[] | undefined {
    try {
      if (node.type === 'class_declaration') {
        const interfaces: string[] = [];
        const interfacesNode = node.childForFieldName('interfaces');

        if (interfacesNode) {
          interfacesNode.descendantsOfType('type_identifier').forEach(typeNode => {
            interfaces.push(getNodeText(typeNode, sourceCode));
          });
        }

        return interfaces.length > 0 ? interfaces : undefined;
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Java implemented interfaces');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'import_declaration' || node.type === 'static_import_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Java import path');
      return 'unknown';
    }
  }

  /**
   * Checks if an import is a static import.
   */
  protected isDefaultImport(node: SyntaxNode, _sourceCode: string): boolean | undefined {
    try {
      return node.type === 'static_import_declaration';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Java import is static');
      return undefined;
    }
  }

  /**
   * Extracts imported items from an AST node.
   */
  protected extractImportedItems(node: SyntaxNode, sourceCode: string): ImportedItem[] | undefined {
    try {
      if (node.type === 'import_declaration' || node.type === 'static_import_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const fullPath = getNodeText(nameNode, sourceCode);
          const parts = fullPath.split('.');
          const name = parts[parts.length - 1];
          const isStatic = node.type === 'static_import_declaration';

          // Get the package path (everything except the last part)
          const packagePath = parts.slice(0, parts.length - 1).join('.');

          // Check for wildcard imports (e.g., import java.util.* or import static java.lang.Math.*)
          if (name === '*') {
            return [{
              name: '*',
              path: fullPath,
              isDefault: false,
              isNamespace: true,
              nodeText: node.text
            }];
          }

          // For static imports, we need to handle differently
          if (isStatic) {
            // For static imports, the last part is the method/field name
            // and the second-to-last part is the class name
            const className = parts[parts.length - 2] || '';

            return [{
              name: name,
              path: fullPath,
              isDefault: false,
              isNamespace: false,
              nodeText: node.text,
              // Add additional information for static imports
              alias: undefined,
              // Include metadata about the static import
              staticImport: {
                className: className,
                memberName: name,
                packageName: parts.slice(0, parts.length - 2).join('.')
              }
            }];
          }

          // Regular import (e.g., import java.util.List)
          return [{
            name: name,
            path: fullPath,
            isDefault: false,
            isNamespace: false,
            nodeText: node.text,
            // Add package information
            packageName: packagePath
          }];
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Java imported items');
      return undefined;
    }
  }

  /**
   * Extracts class properties from an AST node.
   */
  protected extractClassProperties(node: SyntaxNode, _sourceCode: string): Array<{
    name: string;
    type?: string;
    comment?: string;
    startLine: number;
    endLine: number;
    accessModifier?: string;
    isStatic?: boolean;
  }> {
    try {
      const properties: Array<{
        name: string;
        type?: string;
        comment?: string;
        startLine: number;
        endLine: number;
        accessModifier?: string;
        isStatic?: boolean;
      }> = [];

      if (node.type === 'class_declaration' || node.type === 'interface_declaration' || node.type === 'enum_declaration') {
        const bodyNode = node.childForFieldName('body');
        if (bodyNode) {
          // Extract field declarations
          bodyNode.descendantsOfType('field_declaration').forEach(fieldNode => {
            const typeNode = fieldNode.childForFieldName('type');
            const declaratorListNode = fieldNode.childForFieldName('declarator_list');

            if (typeNode && declaratorListNode) {
              const type = getNodeText(typeNode, _sourceCode);
              const nodeText = fieldNode.text;

              // Determine access modifier
              let accessModifier: string | undefined;
              if (nodeText.includes('private ')) {
                accessModifier = 'private';
              } else if (nodeText.includes('protected ')) {
                accessModifier = 'protected';
              } else if (nodeText.includes('public ')) {
                accessModifier = 'public';
              } else {
                // Default access (package-private) in Java
                accessModifier = 'package-private';
              }

              // Determine if static
              const isStatic = nodeText.includes('static ');

              // Determine if final
              const isFinal = nodeText.includes('final ');

              // Extract comment
              const comment = this.extractPropertyComment(fieldNode, _sourceCode);

              // Process each declarator in the list (Java can declare multiple fields in one statement)
              declaratorListNode.children.forEach(declarator => {
                if (declarator.type === 'variable_declarator') {
                  const nameNode = declarator.childForFieldName('name');
                  if (nameNode) {
                    const name = getNodeText(nameNode, _sourceCode);

                    // Add additional information to the comment if it's final
                    let finalComment = comment;
                    if (isFinal && !finalComment) {
                      finalComment = 'Constant value';
                    } else if (isFinal && finalComment) {
                      finalComment = `${finalComment} (Constant)`;
                    }

                    properties.push({
                      name,
                      type,
                      accessModifier,
                      isStatic,
                      comment: finalComment,
                      startLine: declarator.startPosition.row + 1,
                      endLine: declarator.endPosition.row + 1
                    });
                  }
                }
              });
            }
          });

          // Also extract enum constants for enum declarations
          if (node.type === 'enum_declaration') {
            const enumBodyNode = bodyNode.childForFieldName('enum_body');
            if (enumBodyNode) {
              enumBodyNode.descendantsOfType('enum_constant').forEach(constantNode => {
                const nameNode = constantNode.childForFieldName('name');
                if (nameNode) {
                  const name = getNodeText(nameNode, _sourceCode);

                  // Extract comment
                  const comment = this.extractPropertyComment(constantNode, _sourceCode);

                  properties.push({
                    name,
                    type: this.extractClassName(node, _sourceCode), // The enum type is the enum class name
                    accessModifier: 'public', // Enum constants are always public
                    isStatic: true, // Enum constants are implicitly static
                    comment,
                    startLine: constantNode.startPosition.row + 1,
                    endLine: constantNode.endPosition.row + 1
                  });
                }
              });
            }
          }

          // For interfaces, all fields are implicitly public, static, and final
          if (node.type === 'interface_declaration') {
            bodyNode.descendantsOfType('field_declaration').forEach(fieldNode => {
              const typeNode = fieldNode.childForFieldName('type');
              const declaratorListNode = fieldNode.childForFieldName('declarator_list');

              if (typeNode && declaratorListNode) {
                const type = getNodeText(typeNode, _sourceCode);

                // Extract comment
                const comment = this.extractPropertyComment(fieldNode, _sourceCode);

                // Process each declarator
                declaratorListNode.children.forEach(declarator => {
                  if (declarator.type === 'variable_declarator') {
                    const nameNode = declarator.childForFieldName('name');
                    if (nameNode) {
                      const name = getNodeText(nameNode, _sourceCode);

                      properties.push({
                        name,
                        type,
                        accessModifier: 'public', // Interface fields are always public
                        isStatic: true, // Interface fields are always static
                        comment: comment ? `${comment} (Constant)` : 'Constant value',
                        startLine: declarator.startPosition.row + 1,
                        endLine: declarator.endPosition.row + 1
                      });
                    }
                  }
                });
              }
            });
          }
        }
      }

      return properties;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Java class properties');
      return [];
    }
  }

  /**
   * Extracts a comment for a property.
   */
  private extractPropertyComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for Javadoc comments
      let prev = node.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment' && prev.text.startsWith('/**')) {
        return this.parseJavadocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Java property comment');
      return undefined;
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for Javadoc comments
      let prev = node.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment' && prev.text.startsWith('/**')) {
        return this.parseJavadocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Java function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for Javadoc comments
      let prev = node.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment' && prev.text.startsWith('/**')) {
        return this.parseJavadocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Java class comment');
      return undefined;
    }
  }

  /**
   * Parses a Javadoc comment into a clean comment.
   */
  private parseJavadocComment(comment: string): string {
    try {
      // Remove comment markers and asterisks
      const text = comment.substring(3, comment.length - 2);

      // Split into lines and remove leading asterisks and whitespace
      const lines = text.split('\n')
        .map(line => line.trim().replace(/^\*\s*/, ''))
        .filter(line => !line.startsWith('@')); // Remove tag lines

      // Join lines and return the description
      return lines.join(' ').trim();
    } catch (error) {
      logger.warn({ err: error }, 'Error parsing Javadoc comment');
      return comment;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Spring detection
      if (sourceCode.includes('org.springframework') ||
          sourceCode.includes('@Controller') ||
          sourceCode.includes('@Service')) {
        return 'spring';
      }

      // Android detection
      if (sourceCode.includes('android.') ||
          sourceCode.includes('androidx.') ||
          sourceCode.includes('extends Activity') ||
          sourceCode.includes('extends Fragment')) {
        return 'android';
      }

      // JUnit detection
      if (sourceCode.includes('org.junit') ||
          sourceCode.includes('@Test') ||
          sourceCode.includes('extends TestCase')) {
        return 'junit';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Java framework');
      return null;
    }
  }
}
