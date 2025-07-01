/**
 * Lua language handler for the Code-Map Generator tool.
 * This file contains the language handler for Lua files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';

/**
 * Language handler for Lua.
 * Provides enhanced function name detection for Lua files.
 */
export class LuaHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_declaration',
      'function_definition',
      'local_function',
      'function',
      'anonymous_function'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'table_constructor',
      'assignment_statement',
      'variable_declaration'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'function_call',
      'variable_declaration'
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
      if (node.type === 'function_declaration' ||
          node.type === 'function_definition' ||
          node.type === 'local_function' ||
          node.type === 'function') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for method definitions (with colon)
          if (name.includes(':')) {
            const parts = name.split(':');
            return `method_${parts[0]}_${parts[1]}`;
          }

          // Check for module functions (with dot)
          if (name.includes('.')) {
            const parts = name.split('.');
            return `${parts[0]}_${parts[parts.length - 1]}`;
          }

          // Check for test functions
          if (name.startsWith('test')) {
            return `test_${name.substring(4)}`;
          }

          // Check for callback functions
          if (name.includes('Callback') || name.includes('_callback')) {
            return `callback_${name}`;
          }

          return name;
        }
      }

      // Handle anonymous functions
      if (node.type === 'anonymous_function') {
        // Check if assigned to a variable
        if (node.parent?.type === 'assignment_statement') {
          const variableNode = node.parent.childForFieldName('variables');
          if (variableNode?.firstChild) {
            return getNodeText(variableNode.firstChild, sourceCode);
          }
        }

        // Check if used in a table constructor
        if (node.parent?.type === 'field' &&
            node.parent.parent?.type === 'table_constructor') {
          const nameNode = node.parent.childForFieldName('name');
          if (nameNode) {
            return getNodeText(nameNode, sourceCode);
          }
        }

        return 'anonymous_function';
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Lua function name');
      return 'anonymous';
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      // In Lua, "classes" are often implemented as tables
      if (node.type === 'table_constructor') {
        // Check if this table is being assigned to a variable
        if (node.parent?.type === 'assignment_statement') {
          const variableNode = node.parent.childForFieldName('variables');
          if (variableNode?.firstChild) {
            return getNodeText(variableNode.firstChild, sourceCode);
          }
        }

        // Check if this table is being returned
        if (node.parent?.type === 'return_statement') {
          // Try to find a nearby variable declaration or assignment
          let current = node.parent.parent;
          while (current) {
            if (current.type === 'function_declaration' ||
                current.type === 'function_definition' ||
                current.type === 'local_function') {
              const nameNode = current.childForFieldName('name');
              if (nameNode) {
                return `${getNodeText(nameNode, sourceCode)}_Class`;
              }
            }

            current = current.parent;
          }
        }
      } else if (node.type === 'assignment_statement') {
        // Check if this is a class-like pattern (e.g., MyClass = {})
        const variableNode = node.childForFieldName('variables');
        const valueNode = node.childForFieldName('values');

        if (variableNode?.firstChild &&
            valueNode?.firstChild?.type === 'table_constructor') {
          return getNodeText(variableNode.firstChild, sourceCode);
        }
      } else if (node.type === 'variable_declaration') {
        // Check if this is a local class-like pattern (e.g., local MyClass = {})
        const nameNode = node.childForFieldName('name');
        const valueNode = node.childForFieldName('value');

        if (nameNode && valueNode?.type === 'table_constructor') {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return 'AnonymousClass';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Lua class name');
      return 'AnonymousClass';
    }
  }

  /**
   * Extracts the parent class from an AST node.
   */
  protected extractParentClass(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // In Lua, inheritance is often implemented with setmetatable
      if (node.type === 'assignment_statement' || node.type === 'variable_declaration') {
        // Look for setmetatable calls in the body
        let current = node.nextNamedSibling;
        while (current) {
          if (current.type === 'function_call' &&
              current.childForFieldName('name')?.text === 'setmetatable') {
            const argsNode = current.childForFieldName('arguments');
            if (argsNode && argsNode.childCount && argsNode.childCount >= 2) {
              // The second argument is often the parent class
              const parentNode = argsNode.child(1);
              if (parentNode) {
                return getNodeText(parentNode, sourceCode);
              }
            }
          }

          current = current.nextNamedSibling;
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Lua parent class');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      // In Lua, imports are often done with require
      if (node.type === 'function_call' &&
          node.childForFieldName('name')?.text === 'require') {
        const argsNode = node.childForFieldName('arguments');
        if (argsNode?.firstChild) {
          return getNodeText(argsNode.firstChild, sourceCode);
        }
      } else if (node.type === 'variable_declaration') {
        // Check for local module = require("module") pattern
        const valueNode = node.childForFieldName('value');
        if (valueNode?.type === 'function_call' &&
            valueNode.childForFieldName('name')?.text === 'require') {
          const argsNode = valueNode.childForFieldName('arguments');
          if (argsNode?.firstChild) {
            return getNodeText(argsNode.firstChild, sourceCode);
          }
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Lua import path');
      return 'unknown';
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for comments before the function
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment') {
        // Extract the comment text
        const commentText = getNodeText(prev, sourceCode);

        // Remove comment markers and whitespace
        return commentText
          .replace(/^--\s*/mg, '')
          .trim();
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Lua function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for comments before the class
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment') {
        // Extract the comment text
        const commentText = getNodeText(prev, sourceCode);

        // Remove comment markers and whitespace
        return commentText
          .replace(/^--\s*/mg, '')
          .trim();
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Lua class comment');
      return undefined;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Love2D detection
      if (sourceCode.includes('love.') ||
          sourceCode.includes('function love.') ||
          sourceCode.includes('love.graphics')) {
        return 'love2d';
      }

      // Corona SDK detection
      if (sourceCode.includes('display.') ||
          sourceCode.includes('physics.') ||
          sourceCode.includes('transition.')) {
        return 'corona';
      }

      // Lapis detection
      if (sourceCode.includes('lapis.') ||
          sourceCode.includes('require("lapis")') ||
          sourceCode.includes('app:get')) {
        return 'lapis';
      }

      // Torch detection
      if (sourceCode.includes('torch.') ||
          sourceCode.includes('nn.') ||
          sourceCode.includes('require("torch")')) {
        return 'torch';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Lua framework');
      return null;
    }
  }
}
