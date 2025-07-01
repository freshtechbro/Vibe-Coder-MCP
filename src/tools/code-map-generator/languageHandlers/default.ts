/**
 * Default language handler for the Code-Map Generator tool.
 * This file contains the default language handler that provides basic function detection
 * for languages without specific handlers.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';

/**
 * Default language handler that provides basic function detection for languages without specific handlers.
 */
export class DefaultLanguageHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_declaration',
      'function_definition',
      'method_declaration',
      'method_definition',
      'function',
      'arrow_function',
      'lambda',
      'lambda_expression',
      'function_item',
      'method',
      'subroutine',
      'procedure_declaration',
      'procedure',
      'sub',
      'def'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'class_declaration',
      'class_definition',
      'class',
      'class_item',
      'struct_declaration',
      'struct_definition',
      'struct',
      'interface_declaration',
      'interface_definition',
      'interface'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'import_declaration',
      'import_statement',
      'import',
      'include_statement',
      'include',
      'require',
      'using_declaration',
      'using_directive',
      'using'
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
      // Try to get name from 'name' field
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        return getNodeText(nameNode, sourceCode);
      }

      // Try to get name from parent if it's a variable declaration
      if (node.parent?.type === 'variable_declarator' ||
          node.parent?.type === 'variable_declaration' ||
          node.parent?.type === 'assignment_expression') {
        const parentNameNode = node.parent.childForFieldName('name') ||
                              node.parent.childForFieldName('left');
        if (parentNameNode) {
          return getNodeText(parentNameNode, sourceCode);
        }
      }

      // Try to get name from parent if it's a property
      if (node.parent?.type === 'pair' ||
          node.parent?.type === 'property_definition' ||
          node.parent?.type === 'property') {
        const keyNode = node.parent.childForFieldName('key') ||
                       node.parent.childForFieldName('name');
        if (keyNode) {
          return getNodeText(keyNode, sourceCode);
        }
      }

      // Try to get name from parent if it's a function call argument
      if (node.parent?.type === 'arguments' &&
          node.parent.parent?.type === 'call_expression') {
        const callExprNode = node.parent.parent;
        const funcNameNode = callExprNode.childForFieldName('function');
        if (funcNameNode) {
          const funcName = getNodeText(funcNameNode, sourceCode);

          // Common callback patterns
          if (['map', 'filter', 'reduce', 'forEach', 'find', 'findIndex', 'some', 'every'].includes(funcName)) {
            return `${funcName}_callback`;
          }

          // Common test framework patterns
          if (['describe', 'it', 'test', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll'].includes(funcName)) {
            // Try to get the test description from the first argument
            const args = callExprNode.childForFieldName('arguments');
            if (args && args.firstChild &&
                (args.firstChild.type === 'string' || args.firstChild.type === 'string_literal')) {
              const testDesc = getNodeText(args.firstChild, sourceCode);
              // Remove quotes and truncate if too long
              const cleanDesc = testDesc.replace(/^["']|["']$/g, '').substring(0, 30);
              return `${funcName}_${cleanDesc}`;
            }
            return `${funcName}_handler`;
          }
        }
      }

      // Use context information if available
      const context = this.contextTracker.getCurrentContext();
      if (context && context.parent) {
        if (context.parent.type === 'class' && context.parent.name) {
          return `${context.parent.name}_method`;
        } else if (context.parent.type === 'function' && context.parent.name) {
          return `${context.parent.name}_inner`;
        }
      }

      // If all else fails, return 'anonymous'
      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting function name');
      return 'anonymous';
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      // Try to get name from 'name' field
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        return getNodeText(nameNode, sourceCode);
      }

      // If all else fails, return 'AnonymousClass'
      return 'AnonymousClass';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting class name');
      return 'AnonymousClass';
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      // Try to get path from 'source' field
      const sourceNode = node.childForFieldName('source');
      if (sourceNode) {
        return getNodeText(sourceNode, sourceCode).replace(/^["']|["']$/g, '');
      }

      // Try to get path from 'path' field
      const pathNode = node.childForFieldName('path');
      if (pathNode) {
        return getNodeText(pathNode, sourceCode).replace(/^["']|["']$/g, '');
      }

      // Try to get path from string literal child
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && (child.type === 'string' || child.type === 'string_literal')) {
          return getNodeText(child, sourceCode).replace(/^["']|["']$/g, '');
        }
      }

      // If all else fails, return 'unknown'
      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting import path');
      return 'unknown';
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for a comment node before the function
      const startPosition = node.startPosition;
      const startIndex = startPosition.row > 0 ?
        sourceCode.lastIndexOf('\n', sourceCode.indexOf('\n', 0) + startPosition.row) : 0;

      if (startIndex >= 0) {
        const textBeforeNode = sourceCode.substring(0, startIndex);
        const commentMatch = textBeforeNode.match(/\/\*\*([\s\S]*?)\*\/\s*$/) ||
                            textBeforeNode.match(/\/\/(.*)\s*$/);

        if (commentMatch) {
          return commentMatch[1].trim();
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting function comment');
      return undefined;
    }
  }
}
