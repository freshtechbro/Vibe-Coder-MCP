/**
 * Ruby language handler for the Code-Map Generator tool.
 * This file contains the language handler for Ruby files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';

/**
 * Language handler for Ruby.
 * Provides enhanced function name detection for Ruby files.
 */
export class RubyHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'method',
      'method_definition',
      'singleton_method',
      'lambda',
      'block'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'class',
      'class_definition',
      'module',
      'module_definition'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'require',
      'require_relative',
      'include',
      'extend'
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
      // Handle method definitions
      if (node.type === 'method' || node.type === 'method_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for test methods
          if (name.startsWith('test_')) {
            return name;
          }

          // Check for Rails controller actions
          if (this.isRailsControllerAction(node, sourceCode)) {
            return `action_${name}`;
          }

          // Check for Rails model callbacks
          if (this.isRailsModelCallback(name)) {
            return `callback_${name}`;
          }

          // Check for attribute accessors
          if (name.startsWith('get_') || name.startsWith('set_')) {
            return name;
          }

          // Check for predicate methods (ending with ?)
          if (name.endsWith('?')) {
            return `predicate_${name.slice(0, -1)}`;
          }

          // Check for destructive methods (ending with !)
          if (name.endsWith('!')) {
            return `destructive_${name.slice(0, -1)}`;
          }

          return name;
        }
      }

      // Handle singleton methods (class methods)
      if (node.type === 'singleton_method') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);
          return `self_${name}`;
        }
      }

      // Handle lambda expressions
      if (node.type === 'lambda') {
        // Check if assigned to a variable
        if (node.parent?.type === 'assignment') {
          const leftNode = node.parent.childForFieldName('left');
          if (leftNode) {
            return getNodeText(leftNode, sourceCode);
          }
        }

        return 'lambda';
      }

      // Handle blocks
      if (node.type === 'block') {
        // Check if it's a method call with a block
        if (node.parent?.type === 'method_call') {
          const methodNode = node.parent.childForFieldName('method');
          if (methodNode) {
            const methodName = getNodeText(methodNode, sourceCode);

            // Common Ruby methods that take blocks
            if (['map', 'each', 'select', 'reject', 'reduce'].includes(methodName)) {
              return `${methodName}_block`;
            }

            // Rails-specific methods
            if (['before_action', 'after_action', 'around_action'].includes(methodName)) {
              return `filter_${methodName.split('_')[0]}`;
            }

            return `${methodName}_block`;
          }
        }

        return 'block';
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Ruby function name');
      return 'anonymous';
    }
  }

  /**
   * Checks if a method is a Rails controller action.
   */
  private isRailsControllerAction(node: SyntaxNode, sourceCode: string): boolean {
    try {
      // Check if the method is in a class that inherits from ApplicationController
      let current = node.parent;
      while (current && current.type !== 'class') {
        current = current.parent;
      }

      if (current) {
        const superclassNode = current.childForFieldName('superclass');
        if (superclassNode) {
          const superclass = getNodeText(superclassNode, sourceCode);
          return superclass.includes('Controller');
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if method is a Rails controller action');
      return false;
    }
  }

  /**
   * Checks if a method name is a Rails model callback.
   */
  private isRailsModelCallback(name: string): boolean {
    const callbacks = [
      'before_validation', 'after_validation',
      'before_save', 'after_save',
      'before_create', 'after_create',
      'before_update', 'after_update',
      'before_destroy', 'after_destroy'
    ];

    return callbacks.includes(name);
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'class' || node.type === 'class_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      } else if (node.type === 'module' || node.type === 'module_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return `Module_${getNodeText(nameNode, sourceCode)}`;
        }
      }

      return 'AnonymousClass';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Ruby class name');
      return 'AnonymousClass';
    }
  }

  /**
   * Extracts the parent class from an AST node.
   */
  protected extractParentClass(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'class' || node.type === 'class_definition') {
        const superclassNode = node.childForFieldName('superclass');
        if (superclassNode) {
          return getNodeText(superclassNode, sourceCode);
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Ruby parent class');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'require' || node.type === 'require_relative') {
        const argumentNode = node.childForFieldName('argument');
        if (argumentNode) {
          const path = getNodeText(argumentNode, sourceCode);
          return path.replace(/^['"]|['"]$/g, '');
        }
      } else if (node.type === 'include' || node.type === 'extend') {
        const argumentNode = node.childForFieldName('argument');
        if (argumentNode) {
          return getNodeText(argumentNode, sourceCode);
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Ruby import path');
      return 'unknown';
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for comments before the method
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
          .replace(/^#\s*/mg, '')
          .trim();
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Ruby function comment');
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
          .replace(/^#\s*/mg, '')
          .trim();
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Ruby class comment');
      return undefined;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Rails detection
      if (sourceCode.includes('Rails') ||
          sourceCode.includes('ActiveRecord') ||
          sourceCode.includes('ApplicationController')) {
        return 'rails';
      }

      // Sinatra detection
      if (sourceCode.includes('Sinatra') ||
          sourceCode.includes('get {') ||
          sourceCode.includes('post {')) {
        return 'sinatra';
      }

      // RSpec detection
      if (sourceCode.includes('RSpec') ||
          sourceCode.includes('describe') ||
          sourceCode.includes('it "')) {
        return 'rspec';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Ruby framework');
      return null;
    }
  }
}
