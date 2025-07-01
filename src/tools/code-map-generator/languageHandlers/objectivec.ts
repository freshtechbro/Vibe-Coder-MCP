/**
 * Objective-C language handler for the Code-Map Generator tool.
 * This file contains the language handler for Objective-C files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';

/**
 * Language handler for Objective-C.
 * Provides enhanced function name detection for Objective-C files.
 */
export class ObjectiveCHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_definition',
      'method_definition',
      'method_declaration',
      'block_literal_expression'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'interface_declaration',
      'implementation_definition',
      'category_definition',
      'protocol_declaration'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'import_declaration',
      'include_directive'
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

      // Handle method definitions and declarations
      if (node.type === 'method_definition' || node.type === 'method_declaration') {
        const selectorNode = node.childForFieldName('selector');
        if (selectorNode) {
          const selector = getNodeText(selectorNode, sourceCode);

          // Check for UIKit lifecycle methods
          if (this.isUIKitLifecycleMethod(selector)) {
            return `lifecycle_${selector}`;
          }

          // Check for initializers
          if (selector.startsWith('init')) {
            return `initializer_${selector}`;
          }

          // Check for delegate methods
          if (this.isDelegateMethod(node, sourceCode)) {
            return `delegate_${selector}`;
          }

          // Check for IBAction methods
          if (this.hasIBActionAttribute(node, sourceCode)) {
            return `action_${selector}`;
          }

          return selector;
        }
      }

      // Handle block literal expressions
      if (node.type === 'block_literal_expression') {
        // Check if assigned to a variable
        if (node.parent?.type === 'init_declarator') {
          const declaratorNode = node.parent.childForFieldName('declarator');
          if (declaratorNode) {
            return getNodeText(declaratorNode, sourceCode);
          }
        }

        // Check if used in a method call
        if (node.parent?.type === 'argument_list' &&
            node.parent.parent?.type === 'message_expression') {
          const selectorNode = node.parent.parent.childForFieldName('selector');
          if (selectorNode) {
            const selector = getNodeText(selectorNode, sourceCode);

            // Common Objective-C methods that take blocks
            if (['enumerateObjectsUsingBlock', 'animateWithDuration', 'performBlockAndWait'].includes(selector)) {
              return `${selector}_block`;
            }
          }
        }

        return 'block';
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Objective-C function name');
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
      }

      return null;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Objective-C function declarator name');
      return null;
    }
  }

  /**
   * Checks if a method is a UIKit lifecycle method.
   */
  private isUIKitLifecycleMethod(selector: string): boolean {
    const lifecycleMethods = [
      'viewDidLoad',
      'viewWillAppear:',
      'viewDidAppear:',
      'viewWillDisappear:',
      'viewDidDisappear:',
      'didReceiveMemoryWarning',
      'applicationDidFinishLaunching:',
      'applicationWillTerminate:'
    ];

    return lifecycleMethods.includes(selector);
  }

  /**
   * Checks if a method is a delegate method.
   */
  private isDelegateMethod(node: SyntaxNode, sourceCode: string): boolean {
    try {
      // Find the class name
      let current = node.parent;
      while (current &&
             current.type !== 'interface_declaration' &&
             current.type !== 'implementation_definition') {
        current = current.parent;
      }

      if (current) {
        const nameNode = current.childForFieldName('name');
        if (nameNode) {
          const className = getNodeText(nameNode, sourceCode);

          // Check if the class name contains "Delegate"
          return className.includes('Delegate');
        }
      }

      // Check if the method selector contains "delegate"
      const selectorNode = node.childForFieldName('selector');
      if (selectorNode) {
        const selector = getNodeText(selectorNode, sourceCode);
        return selector.includes('delegate');
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Objective-C method is delegate method');
      return false;
    }
  }

  /**
   * Checks if a method has the IBAction attribute.
   */
  private hasIBActionAttribute(node: SyntaxNode, sourceCode: string): boolean {
    try {
      const returnTypeNode = node.childForFieldName('return_type');
      if (returnTypeNode) {
        const returnType = getNodeText(returnTypeNode, sourceCode);
        return returnType.includes('IBAction');
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Objective-C method has IBAction attribute');
      return false;
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'interface_declaration' ||
          node.type === 'implementation_definition' ||
          node.type === 'protocol_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      } else if (node.type === 'category_definition') {
        const nameNode = node.childForFieldName('name');
        const categoryNode = node.childForFieldName('category');
        if (nameNode && categoryNode) {
          return `${getNodeText(nameNode, sourceCode)}+${getNodeText(categoryNode, sourceCode)}`;
        }
      }

      return 'AnonymousClass';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Objective-C class name');
      return 'AnonymousClass';
    }
  }

  /**
   * Extracts the parent class from an AST node.
   */
  protected extractParentClass(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'interface_declaration') {
        const superclassNode = node.childForFieldName('superclass');
        if (superclassNode) {
          return getNodeText(superclassNode, sourceCode);
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Objective-C parent class');
      return undefined;
    }
  }

  /**
   * Extracts implemented interfaces (protocols) from an AST node.
   */
  protected extractImplementedInterfaces(node: SyntaxNode, sourceCode: string): string[] | undefined {
    try {
      if (node.type === 'interface_declaration') {
        const protocolsNode = node.childForFieldName('protocols');
        if (protocolsNode) {
          const protocols: string[] = [];

          // Extract protocols from protocol list
          const protocolList = getNodeText(protocolsNode, sourceCode);
          if (protocolList) {
            // Remove angle brackets and split by comma
            const protocolNames = protocolList.replace(/^<|>$/g, '').split(',');
            for (const name of protocolNames) {
              protocols.push(name.trim());
            }
          }

          return protocols.length > 0 ? protocols : undefined;
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Objective-C implemented interfaces');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'import_declaration') {
        const pathNode = node.childForFieldName('path');
        if (pathNode) {
          return getNodeText(pathNode, sourceCode);
        }
      } else if (node.type === 'include_directive') {
        const pathNode = node.childForFieldName('path');
        if (pathNode) {
          return getNodeText(pathNode, sourceCode);
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Objective-C import path');
      return 'unknown';
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
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Objective-C function comment');
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
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Objective-C class comment');
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
      // UIKit detection
      if (sourceCode.includes('#import <UIKit/UIKit.h>') ||
          sourceCode.includes('UIViewController') ||
          sourceCode.includes('UIView')) {
        return 'uikit';
      }

      // Foundation detection
      if (sourceCode.includes('#import <Foundation/Foundation.h>') ||
          sourceCode.includes('NSObject') ||
          sourceCode.includes('NSString')) {
        return 'foundation';
      }

      // AppKit detection
      if (sourceCode.includes('#import <AppKit/AppKit.h>') ||
          sourceCode.includes('NSViewController') ||
          sourceCode.includes('NSView')) {
        return 'appkit';
      }

      // Core Data detection
      if (sourceCode.includes('#import <CoreData/CoreData.h>') ||
          sourceCode.includes('NSManagedObject') ||
          sourceCode.includes('NSPersistentContainer')) {
        return 'coredata';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Objective-C framework');
      return null;
    }
  }
}
