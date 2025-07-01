/**
 * R language handler for the Code-Map Generator tool.
 * This file contains the language handler for R files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';

/**
 * Language handler for R.
 * Provides enhanced function name detection for R files.
 */
export class RHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_definition',
      'assignment',
      'left_assignment',
      'right_assignment'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'call',
      'assignment',
      'left_assignment',
      'right_assignment'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'call'
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
        // Check if this function is being assigned to a variable
        if (node.parent?.type === 'assignment' ||
            node.parent?.type === 'left_assignment' ||
            node.parent?.type === 'right_assignment') {
          const leftNode = node.parent.childForFieldName('left');
          if (leftNode) {
            const name = getNodeText(leftNode, sourceCode);

            // Check for test functions
            if (name.startsWith('test_') || name.startsWith('test.')) {
              return `test_${name.substring(5)}`;
            }

            // Check for S3 methods
            if (name.includes('.')) {
              const parts = name.split('.');
              if (parts.length >= 2) {
                return `method_${parts[0]}_${parts[1]}`;
              }
            }

            return name;
          }
        }

        return 'anonymous_function';
      }

      // Handle assignments with function on the right side
      if (node.type === 'assignment' ||
          node.type === 'left_assignment' ||
          node.type === 'right_assignment') {
        const rightNode = node.childForFieldName('right');
        const leftNode = node.childForFieldName('left');

        if (rightNode?.type === 'function_definition' && leftNode) {
          const name = getNodeText(leftNode, sourceCode);

          // Check for test functions
          if (name.startsWith('test_') || name.startsWith('test.')) {
            return `test_${name.substring(5)}`;
          }

          // Check for S3 methods
          if (name.includes('.')) {
            const parts = name.split('.');
            if (parts.length >= 2) {
              return `method_${parts[0]}_${parts[1]}`;
            }
          }

          return name;
        }
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting R function name');
      return 'anonymous';
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      // In R, classes are often created with setClass or similar functions
      if (node.type === 'call') {
        const functionNode = node.childForFieldName('function');
        if (functionNode && getNodeText(functionNode, sourceCode) === 'setClass') {
          const argsNode = node.childForFieldName('arguments');
          if (argsNode?.firstChild) {
            return getNodeText(argsNode.firstChild, sourceCode).replace(/^["']|["']$/g, '');
          }
        }
      } else if (node.type === 'assignment' ||
                 node.type === 'left_assignment' ||
                 node.type === 'right_assignment') {
        const rightNode = node.childForFieldName('right');
        const leftNode = node.childForFieldName('left');

        // Check for S4 class definition
        if (rightNode?.type === 'call' &&
            getNodeText(rightNode.childForFieldName('function') || rightNode, sourceCode) === 'setClass' &&
            leftNode) {
          return getNodeText(leftNode, sourceCode);
        }

        // Check for R6 class definition
        if (rightNode?.type === 'call' &&
            getNodeText(rightNode.childForFieldName('function') || rightNode, sourceCode).includes('R6Class') &&
            leftNode) {
          return getNodeText(leftNode, sourceCode);
        }

        // Check for S3 class definition
        if (rightNode?.type === 'call' &&
            getNodeText(rightNode.childForFieldName('function') || rightNode, sourceCode) === 'structure' &&
            leftNode) {
          const argsNode = rightNode.childForFieldName('arguments');
          if (argsNode) {
            for (let i = 0; i < argsNode.childCount; i++) {
              const arg = argsNode.child(i);
              if (arg?.text.includes('class =')) {
                return getNodeText(leftNode, sourceCode);
              }
            }
          }
        }
      }

      return 'AnonymousClass';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting R class name');
      return 'AnonymousClass';
    }
  }

  /**
   * Extracts the parent class from an AST node.
   */
  protected extractParentClass(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // For S4 classes
      if (node.type === 'call') {
        const functionNode = node.childForFieldName('function');
        if (functionNode && getNodeText(functionNode, sourceCode) === 'setClass') {
          const argsNode = node.childForFieldName('arguments');
          if (argsNode) {
            // Look for 'contains' argument
            for (let i = 0; i < argsNode.childCount; i++) {
              const arg = argsNode.child(i);
              if (arg?.text.includes('contains =')) {
                const valueNode = arg.childForFieldName('value');
                if (valueNode) {
                  return getNodeText(valueNode, sourceCode);
                }
              }
            }
          }
        }
      }

      // For R6 classes
      if (node.type === 'assignment' ||
          node.type === 'left_assignment' ||
          node.type === 'right_assignment') {
        const rightNode = node.childForFieldName('right');

        if (rightNode?.type === 'call' &&
            getNodeText(rightNode.childForFieldName('function') || rightNode, sourceCode).includes('R6Class')) {
          const argsNode = rightNode.childForFieldName('arguments');
          if (argsNode) {
            // Look for 'inherit' argument
            for (let i = 0; i < argsNode.childCount; i++) {
              const arg = argsNode.child(i);
              if (arg?.text.includes('inherit =')) {
                const valueNode = arg.childForFieldName('value');
                if (valueNode) {
                  return getNodeText(valueNode, sourceCode);
                }
              }
            }
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting R parent class');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      // In R, imports are often done with library() or require()
      if (node.type === 'call') {
        const functionNode = node.childForFieldName('function');
        if (functionNode) {
          const funcName = getNodeText(functionNode, sourceCode);

          if (funcName === 'library' || funcName === 'require') {
            const argsNode = node.childForFieldName('arguments');
            if (argsNode?.firstChild) {
              return getNodeText(argsNode.firstChild, sourceCode).replace(/^["']|["']$/g, '');
            }
          }
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting R import path');
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
          .replace(/^#'\s*/mg, '') // Roxygen comments
          .replace(/^#\s*/mg, '')  // Regular comments
          .trim();
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting R function comment');
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
          .replace(/^#'\s*/mg, '') // Roxygen comments
          .replace(/^#\s*/mg, '')  // Regular comments
          .trim();
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting R class comment');
      return undefined;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Shiny detection
      if (sourceCode.includes('library(shiny)') ||
          sourceCode.includes('shinyApp(') ||
          sourceCode.includes('renderPlot(')) {
        return 'shiny';
      }

      // ggplot2 detection
      if (sourceCode.includes('library(ggplot2)') ||
          sourceCode.includes('ggplot(') ||
          sourceCode.includes('geom_')) {
        return 'ggplot2';
      }

      // dplyr detection
      if (sourceCode.includes('library(dplyr)') ||
          sourceCode.includes('%>%') ||
          sourceCode.includes('mutate(')) {
        return 'dplyr';
      }

      // tidyverse detection
      if (sourceCode.includes('library(tidyverse)') ||
          sourceCode.includes('tidyr::') ||
          sourceCode.includes('readr::')) {
        return 'tidyverse';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting R framework');
      return null;
    }
  }
}
