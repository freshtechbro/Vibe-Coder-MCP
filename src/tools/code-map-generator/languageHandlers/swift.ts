/**
 * Swift language handler for the Code-Map Generator tool.
 * This file contains the language handler for Swift files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ImportedItem } from '../codeMapModel.js';

/**
 * Language handler for Swift.
 * Provides enhanced function name detection for Swift files.
 */
export class SwiftHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_declaration',
      'method_declaration',
      'closure_expression'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'class_declaration',
      'struct_declaration',
      'enum_declaration',
      'protocol_declaration',
      'extension_declaration'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'import_declaration'
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
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for test functions
          if (name.startsWith('test')) {
            return `test_${name.substring(4)}`;
          }

          return name;
        }
      }

      // Handle method declarations
      if (node.type === 'method_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for initializers
          if (name === 'init') {
            return 'initializer';
          }

          // Check for deinitializers
          if (name === 'deinit') {
            return 'deinitializer';
          }

          // Check for UIKit lifecycle methods
          if (this.isUIKitLifecycleMethod(name)) {
            return `lifecycle_${name}`;
          }

          // Check for SwiftUI view methods
          if (this.isSwiftUIViewMethod(name)) {
            return `view_${name}`;
          }

          return name;
        }
      }

      // Handle closure expressions
      if (node.type === 'closure_expression') {
        // Check if assigned to a variable
        if (node.parent?.type === 'variable_declaration') {
          const patternNode = node.parent.childForFieldName('pattern');
          if (patternNode) {
            return getNodeText(patternNode, sourceCode);
          }
        }

        // Check if used in a function call
        if (node.parent?.type === 'argument' &&
            node.parent.parent?.type === 'argument_list' &&
            node.parent.parent.parent?.type === 'call_expression') {
          const funcNode = node.parent.parent.parent.childForFieldName('function');
          if (funcNode) {
            const funcName = getNodeText(funcNode, sourceCode);

            // Common Swift higher-order functions
            if (['map', 'filter', 'reduce', 'forEach', 'compactMap', 'flatMap'].includes(funcName)) {
              return `${funcName}_closure`;
            }
          }
        }

        return 'closure';
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Swift function name');
      return 'anonymous';
    }
  }

  /**
   * Checks if a method name is a UIKit lifecycle method.
   */
  private isUIKitLifecycleMethod(name: string): boolean {
    const lifecycleMethods = [
      'viewDidLoad',
      'viewWillAppear',
      'viewDidAppear',
      'viewWillDisappear',
      'viewDidDisappear',
      'viewWillLayoutSubviews',
      'viewDidLayoutSubviews',
      'didReceiveMemoryWarning'
    ];

    return lifecycleMethods.includes(name);
  }

  /**
   * Checks if a method name is a SwiftUI view method.
   */
  private isSwiftUIViewMethod(name: string): boolean {
    const viewMethods = [
      'body',
      'makeBody',
      'makeUIView',
      'updateUIView',
      'makeCoordinator'
    ];

    return viewMethods.includes(name);
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'class_declaration' ||
          node.type === 'struct_declaration' ||
          node.type === 'enum_declaration' ||
          node.type === 'protocol_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      } else if (node.type === 'extension_declaration') {
        const typeNode = node.childForFieldName('type');
        if (typeNode) {
          return `Extension_${getNodeText(typeNode, sourceCode)}`;
        }
      }

      return 'AnonymousType';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Swift class name');
      return 'AnonymousType';
    }
  }

  /**
   * Extracts the parent class from an AST node.
   */
  protected extractParentClass(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'class_declaration') {
        const inheritanceNode = node.childForFieldName('inheritance_clause');
        if (inheritanceNode) {
          const inheritanceText = getNodeText(inheritanceNode, sourceCode);
          const types = inheritanceText.split(',').map(t => t.trim());

          // In Swift, the first type in the inheritance list is typically the superclass
          // (if any), followed by protocols
          if (types.length > 0) {
            return types[0];
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Swift parent class');
      return undefined;
    }
  }

  /**
   * Extracts implemented interfaces (protocols) from an AST node.
   */
  protected extractImplementedInterfaces(node: SyntaxNode, sourceCode: string): string[] | undefined {
    try {
      if (node.type === 'class_declaration' ||
          node.type === 'struct_declaration' ||
          node.type === 'enum_declaration') {
        const inheritanceNode = node.childForFieldName('inheritance_clause');
        if (inheritanceNode) {
          const inheritanceText = getNodeText(inheritanceNode, sourceCode);
          const types = inheritanceText.split(',').map(t => t.trim());

          // For classes, skip the first type (superclass)
          // For structs and enums, include all types (all are protocols)
          const protocols = node.type === 'class_declaration' && types.length > 0 ?
            types.slice(1) : types;

          return protocols.length > 0 ? protocols : undefined;
        }
      } else if (node.type === 'extension_declaration') {
        const conformanceNode = node.childForFieldName('protocol_conformance');
        if (conformanceNode) {
          const conformanceText = getNodeText(conformanceNode, sourceCode);
          const protocols = conformanceText.split(',').map(t => t.trim());

          return protocols.length > 0 ? protocols : undefined;
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Swift implemented interfaces');
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
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Swift import path');
      return 'unknown';
    }
  }

  /**
   * Extracts imported items from an AST node.
   */
  protected extractImportedItems(node: SyntaxNode, sourceCode: string): ImportedItem[] | undefined {
    try {
      if (node.type === 'import_declaration') {
        const pathNode = node.childForFieldName('path');

        if (pathNode) {
          const fullPath = getNodeText(pathNode, sourceCode);

          // Handle different types of Swift imports

          // Get the import kind (e.g., 'class', 'struct', 'enum', etc.)
          const kindNode = node.childForFieldName('kind');
          const importKind = kindNode ? getNodeText(kindNode, sourceCode) : undefined;

          // Check for submodule imports (e.g., import UIKit.UIView)
          const parts = fullPath.split('.');
          const moduleName = parts[0];

          if (parts.length === 1) {
            // Simple module import (e.g., import Foundation)
            return [{
              name: moduleName,
              path: moduleName,
              isDefault: false,
              isNamespace: true,
              nodeText: node.text,
              // Add Swift-specific metadata
              importKind: importKind || 'module'
            }];
          } else {
            // Submodule or specific type import (e.g., import UIKit.UIView)
            const submoduleName = parts[parts.length - 1];

            return [{
              name: submoduleName,
              path: fullPath,
              isDefault: false,
              isNamespace: false,
              nodeText: node.text,
              // Add Swift-specific metadata
              importKind: importKind || 'type',
              moduleName: moduleName
            }];
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Swift imported items');
      return undefined;
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for documentation comments
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment' &&
          (prev.text.startsWith('///') || prev.text.startsWith('/**'))) {
        return this.parseSwiftDocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Swift function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for documentation comments
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment' &&
          (prev.text.startsWith('///') || prev.text.startsWith('/**'))) {
        return this.parseSwiftDocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Swift class comment');
      return undefined;
    }
  }

  /**
   * Parses a Swift documentation comment into a clean comment.
   */
  private parseSwiftDocComment(comment: string): string {
    try {
      if (comment.startsWith('///')) {
        // Line doc comment
        return comment.replace(/^\/\/\/\s*/mg, '').trim();
      } else if (comment.startsWith('/**')) {
        // Block doc comment
        const text = comment.substring(3, comment.length - 2);

        // Split into lines and remove leading asterisks and whitespace
        const lines = text.split('\n')
          .map(line => line.trim().replace(/^\*\s*/, ''))
          .filter(line => !line.startsWith('- Parameter') &&
                         !line.startsWith('- Returns') &&
                         !line.startsWith('- Throws')); // Remove tag lines

        // Join lines and return the description
        return lines.join(' ').trim();
      }

      return comment;
    } catch (error) {
      logger.warn({ err: error }, 'Error parsing Swift doc comment');
      return comment;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // UIKit detection
      if (sourceCode.includes('import UIKit') ||
          sourceCode.includes('UIViewController') ||
          sourceCode.includes('UIView')) {
        return 'uikit';
      }

      // SwiftUI detection
      if (sourceCode.includes('import SwiftUI') ||
          sourceCode.includes('struct') && sourceCode.includes(': View') ||
          sourceCode.includes('var body: some View')) {
        return 'swiftui';
      }

      // Combine detection
      if (sourceCode.includes('import Combine') ||
          sourceCode.includes('Publisher') ||
          sourceCode.includes('Subscriber')) {
        return 'combine';
      }

      // Core Data detection
      if (sourceCode.includes('import CoreData') ||
          sourceCode.includes('NSManagedObject') ||
          sourceCode.includes('NSPersistentContainer')) {
        return 'coredata';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Swift framework');
      return null;
    }
  }
}
