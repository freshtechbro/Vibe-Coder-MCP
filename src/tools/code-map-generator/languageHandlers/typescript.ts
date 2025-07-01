/**
 * TypeScript language handler for the Code-Map Generator tool.
 * This file contains the language handler for TypeScript files.
 */

import { JavaScriptHandler } from './javascript.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';

/**
 * Language handler for TypeScript.
 * Extends the JavaScript handler with TypeScript-specific features.
 */
export class TypeScriptHandler extends JavaScriptHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    // Include JavaScript patterns plus TypeScript-specific patterns
    return [
      ...super.getFunctionQueryPatterns(),
      'function_signature',
      'method_signature',
      'constructor_signature'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      ...super.getClassQueryPatterns(),
      'interface_declaration',
      'type_alias_declaration',
      'enum_declaration'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      ...super.getImportQueryPatterns(),
      'import_type_clause'
    ];
  }

  /**
   * Extracts the function name from an AST node.
   */
  protected extractFunctionName(
    node: SyntaxNode,
    sourceCode: string,
    options?: FunctionExtractionOptions
  ): string {
    try {
      // Handle TypeScript-specific nodes
      if (node.type === 'function_signature' || node.type === 'method_signature') {
        const nameNode = node.childForFieldName('name');
        return nameNode ? getNodeText(nameNode, sourceCode) : 'anonymous';
      }

      if (node.type === 'constructor_signature') {
        return 'constructor';
      }

      // Delegate to JavaScript handler for common patterns
      return super.extractFunctionName(node, sourceCode, options);
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting TypeScript function name');
      return 'anonymous';
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      // Handle TypeScript-specific nodes
      if (node.type === 'interface_declaration' ||
          node.type === 'type_alias_declaration' ||
          node.type === 'enum_declaration') {
        const nameNode = node.childForFieldName('name');
        return nameNode ? getNodeText(nameNode, sourceCode) : 'Anonymous';
      }

      // Delegate to JavaScript handler for common patterns
      return super.extractClassName(node, sourceCode);
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting TypeScript class name');
      return 'AnonymousClass';
    }
  }

  /**
   * Extracts the parent class from an AST node.
   */
  protected extractParentClass(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'class_declaration') {
        // Look for 'extends' clause
        const extendsClause = node.childForFieldName('extends_clause');
        if (extendsClause) {
          const typeNode = extendsClause.childForFieldName('type');
          if (typeNode) {
            return getNodeText(typeNode, sourceCode);
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting TypeScript parent class');
      return undefined;
    }
  }

  /**
   * Extracts implemented interfaces from an AST node.
   */
  protected extractImplementedInterfaces(node: SyntaxNode, sourceCode: string): string[] | undefined {
    try {
      if (node.type === 'class_declaration') {
        // Look for 'implements' clause
        const implementsClause = node.childForFieldName('implements_clause');
        if (implementsClause) {
          const interfaces: string[] = [];

          // Extract each implemented interface
          implementsClause.descendantsOfType('type_reference').forEach(typeRef => {
            interfaces.push(getNodeText(typeRef, sourceCode));
          });

          return interfaces.length > 0 ? interfaces : undefined;
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting TypeScript implemented interfaces');
      return undefined;
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Handle TypeScript-specific nodes
      if (node.type === 'function_signature' || node.type === 'method_signature' || node.type === 'constructor_signature') {
        // Look for TSDoc comments
        const current = node;

        // Check for comments before the node
        // const startPosition = current.startPosition; // Unused for now
        const lineStart = sourceCode.lastIndexOf('\n', current.startIndex) + 1;
        const textBeforeNode = sourceCode.substring(0, lineStart).trim();

        // Look for TSDoc comment
        const tsdocEnd = textBeforeNode.lastIndexOf('*/');
        if (tsdocEnd !== -1) {
          const tsdocStart = textBeforeNode.lastIndexOf('/**', tsdocEnd);
          if (tsdocStart !== -1) {
            const comment = textBeforeNode.substring(tsdocStart + 3, tsdocEnd).trim();

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

        return undefined;
      }

      // Delegate to JavaScript handler for common patterns
      return super.extractFunctionComment(node, sourceCode);
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting TypeScript function comment');
      return undefined;
    }
  }

  /**
   * Extracts class properties from an AST node.
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
    // First get the properties from the JavaScript handler
    const jsProperties = super.extractClassProperties(node, sourceCode);

    try {
      // Add TypeScript-specific property handling
      if (node.type === 'interface_declaration' || node.type === 'type_alias_declaration') {
        const bodyNode = node.childForFieldName('body');
        if (bodyNode) {
          // Extract property signatures from interfaces
          bodyNode.descendantsOfType(['property_signature']).forEach(propNode => {
            const nameNode = propNode.childForFieldName('name');
            if (nameNode) {
              const name = getNodeText(nameNode, sourceCode);

              // Extract type annotation
              let type: string | undefined;
              const typeNode = propNode.childForFieldName('type');
              if (typeNode) {
                type = getNodeText(typeNode, sourceCode);
              }

              // Extract comment using the JavaScript handler's method
              const comment = super.extractPropertyComment(propNode, sourceCode);

              // Determine if optional
              const isOptional = propNode.text.includes('?:');

              jsProperties.push({
                name,
                type: type ? (isOptional ? `${type} | undefined` : type) : undefined,
                comment: comment ? (isOptional ? `${comment} (Optional)` : comment) : (isOptional ? 'Optional property' : undefined),
                startLine: propNode.startPosition.row + 1,
                endLine: propNode.endPosition.row + 1,
                accessModifier: 'public', // Interface properties are always public
                isStatic: false
              });
            }
          });
        }
      } else if (node.type === 'enum_declaration') {
        const bodyNode = node.childForFieldName('body');
        if (bodyNode) {
          // Extract enum members
          bodyNode.descendantsOfType(['enum_member']).forEach(memberNode => {
            const nameNode = memberNode.childForFieldName('name');
            if (nameNode) {
              const name = getNodeText(nameNode, sourceCode);

              // Extract value if present
              let type: string | undefined = 'enum';
              const valueNode = memberNode.childForFieldName('value');
              if (valueNode) {
                const value = getNodeText(valueNode, sourceCode);
                type = `enum (${value})`;
              }

              // Extract comment using the JavaScript handler's method
              const comment = super.extractPropertyComment(memberNode, sourceCode);

              jsProperties.push({
                name,
                type,
                comment: comment || `Enum member ${name}`,
                startLine: memberNode.startPosition.row + 1,
                endLine: memberNode.endPosition.row + 1,
                accessModifier: 'public', // Enum members are always public
                isStatic: true // Enum members are static
              });
            }
          });
        }
      }

      return jsProperties;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting TypeScript class properties');
      return jsProperties;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // TypeScript-specific framework detection
      if (sourceCode.includes('@angular/core') || sourceCode.includes('@Component')) {
        return 'angular';
      }

      if (sourceCode.includes('@nestjs/common') || sourceCode.includes('@Controller')) {
        return 'nestjs';
      }

      if (sourceCode.includes('next/app') || sourceCode.includes('NextPage')) {
        return 'nextjs';
      }

      // Delegate to JavaScript handler for common frameworks
      return super.detectFramework(sourceCode);
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting TypeScript framework');
      return null;
    }
  }
}
