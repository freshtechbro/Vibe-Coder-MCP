/**
 * Kotlin language handler for the Code-Map Generator tool.
 * This file contains the language handler for Kotlin files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ImportedItem } from '../codeMapModel.js';

/**
 * Language handler for Kotlin.
 * Provides enhanced function name detection for Kotlin files.
 */
export class KotlinHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_declaration',
      'function_literal',
      'lambda_expression',
      'anonymous_function'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'class_declaration',
      'object_declaration',
      'interface_declaration',
      'enum_class'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'import_header',
      'package_header'
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
          if (name.startsWith('test') || this.hasAnnotation(node, 'Test')) {
            return `test_${name}`;
          }

          // Check for Android lifecycle methods
          if (this.isAndroidLifecycleMethod(name)) {
            return `lifecycle_${name}`;
          }

          // Check for extension functions
          if (this.isExtensionFunction(node, sourceCode)) {
            const receiverType = this.getReceiverType(node, sourceCode);
            return `${receiverType}_${name}`;
          }

          return name;
        }
      }

      // Handle lambda expressions
      if (node.type === 'lambda_expression' || node.type === 'function_literal' || node.type === 'anonymous_function') {
        // Check if assigned to a variable
        if (node.parent?.type === 'property_declaration') {
          const nameNode = node.parent.childForFieldName('name');
          if (nameNode) {
            return getNodeText(nameNode, sourceCode);
          }
        }

        // Check if used in a function call
        if (node.parent?.type === 'value_argument' &&
            node.parent.parent?.type === 'value_arguments' &&
            node.parent.parent.parent?.type === 'call_expression') {
          const funcNode = node.parent.parent.parent.childForFieldName('expression');
          if (funcNode) {
            const funcName = getNodeText(funcNode, sourceCode);

            // Common Kotlin higher-order functions
            if (['map', 'filter', 'forEach', 'apply', 'let', 'run', 'with', 'also'].includes(funcName)) {
              return `${funcName}_lambda`;
            }
          }
        }

        return 'lambda';
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Kotlin function name');
      return 'anonymous';
    }
  }

  /**
   * Checks if a function has a specific annotation.
   */
  private hasAnnotation(node: SyntaxNode, annotationName: string): boolean {
    try {
      const modifierListNode = node.childForFieldName('modifiers');
      if (!modifierListNode) return false;

      // Check each modifier for annotations
      for (let i = 0; i < modifierListNode.childCount; i++) {
        const modifier = modifierListNode.child(i);
        if (modifier?.type === 'annotation' && modifier.text.includes(`@${annotationName}`)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking Kotlin annotation');
      return false;
    }
  }

  /**
   * Checks if a method name is an Android lifecycle method.
   */
  private isAndroidLifecycleMethod(name: string): boolean {
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
  }

  /**
   * Checks if a function is an extension function.
   */
  private isExtensionFunction(node: SyntaxNode, _sourceCode: string): boolean {
    try {
      const receiverTypeNode = node.childForFieldName('receiver_type');
      return !!receiverTypeNode;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Kotlin function is extension function');
      return false;
    }
  }

  /**
   * Gets the receiver type for an extension function.
   */
  private getReceiverType(node: SyntaxNode, sourceCode: string): string {
    try {
      const receiverTypeNode = node.childForFieldName('receiver_type');
      if (receiverTypeNode) {
        return getNodeText(receiverTypeNode, sourceCode);
      }

      return 'Unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error getting Kotlin receiver type');
      return 'Unknown';
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'class_declaration' ||
          node.type === 'interface_declaration' ||
          node.type === 'enum_class') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      } else if (node.type === 'object_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return `Object_${getNodeText(nameNode, sourceCode)}`;
        }
      }

      return 'AnonymousClass';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Kotlin class name');
      return 'AnonymousClass';
    }
  }

  /**
   * Extracts the parent class from an AST node.
   */
  protected extractParentClass(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'class_declaration') {
        const parentEntryNode = node.childForFieldName('parent_entry');
        if (parentEntryNode) {
          const typeNode = parentEntryNode.childForFieldName('type');
          if (typeNode) {
            return getNodeText(typeNode, sourceCode);
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Kotlin parent class');
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

        // Get interfaces from parent entries
        const parentEntriesNode = node.childForFieldName('parent_entries');
        if (parentEntriesNode) {
          parentEntriesNode.children.forEach(entry => {
            if (entry.type === 'parent_entry') {
              const typeNode = entry.childForFieldName('type');
              if (typeNode) {
                interfaces.push(getNodeText(typeNode, sourceCode));
              }
            }
          });
        }

        // Remove the first entry if it's a class (not an interface)
        if (interfaces.length > 0 && this.extractParentClass(node, sourceCode)) {
          interfaces.shift();
        }

        return interfaces.length > 0 ? interfaces : undefined;
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Kotlin implemented interfaces');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'import_header') {
        const identifierNode = node.childForFieldName('identifier');
        if (identifierNode) {
          return getNodeText(identifierNode, sourceCode);
        }
      } else if (node.type === 'package_header') {
        const identifierNode = node.childForFieldName('identifier');
        if (identifierNode) {
          return getNodeText(identifierNode, sourceCode);
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Kotlin import path');
      return 'unknown';
    }
  }

  /**
   * Extracts imported items from an AST node.
   */
  protected extractImportedItems(node: SyntaxNode, sourceCode: string): ImportedItem[] | undefined {
    try {
      if (node.type === 'import_header') {
        const identifierNode = node.childForFieldName('identifier');

        if (identifierNode) {
          const fullPath = getNodeText(identifierNode, sourceCode);
          const parts = fullPath.split('.');

          // Check for wildcard imports (e.g., import kotlin.collections.*)
          const isWildcard = fullPath.endsWith('.*');

          // Check for aliased imports (e.g., import kotlin.collections.List as KtList)
          const aliasNode = node.childForFieldName('alias');
          const alias = aliasNode ? getNodeText(aliasNode, sourceCode) : undefined;

          if (isWildcard) {
            // Wildcard import (e.g., import kotlin.collections.*)
            const basePath = fullPath.substring(0, fullPath.length - 2); // Remove .*

            return [{
              name: '*',
              path: basePath,
              alias: alias,
              isDefault: false,
              isNamespace: true,
              nodeText: node.text,
              // Add Kotlin-specific metadata
              packageName: basePath
            }];
          } else {
            // Specific import (e.g., import kotlin.collections.List)
            const name = parts[parts.length - 1];
            const packageName = parts.slice(0, parts.length - 1).join('.');

            return [{
              name: alias || name,
              path: fullPath,
              alias: alias,
              isDefault: false,
              isNamespace: false,
              nodeText: node.text,
              // Add Kotlin-specific metadata
              packageName: packageName
            }];
          }
        }
      } else if (node.type === 'package_header') {
        // Package declaration (e.g., package com.example.app)
        const identifierNode = node.childForFieldName('identifier');

        if (identifierNode) {
          const packagePath = getNodeText(identifierNode, sourceCode);

          return [{
            name: packagePath,
            path: packagePath,
            isDefault: false,
            isNamespace: true,
            nodeText: node.text,
            // Add Kotlin-specific metadata
            isPackageDeclaration: true
          }];
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Kotlin imported items');
      return undefined;
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for KDoc comments
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment' && prev.text.startsWith('/**')) {
        return this.parseKDocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Kotlin function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for KDoc comments
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment' && prev.text.startsWith('/**')) {
        return this.parseKDocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Kotlin class comment');
      return undefined;
    }
  }

  /**
   * Parses a KDoc comment into a clean comment.
   */
  private parseKDocComment(comment: string): string {
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
      logger.warn({ err: error }, 'Error parsing KDoc comment');
      return comment;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Android detection
      if (sourceCode.includes('import android.') ||
          sourceCode.includes('extends Activity') ||
          sourceCode.includes('extends Fragment')) {
        return 'android';
      }

      // Ktor detection
      if (sourceCode.includes('import io.ktor.') ||
          sourceCode.includes('embeddedServer') ||
          sourceCode.includes('routing {')) {
        return 'ktor';
      }

      // Spring detection
      if (sourceCode.includes('import org.springframework.') ||
          sourceCode.includes('@Controller') ||
          sourceCode.includes('@Service')) {
        return 'spring';
      }

      // Compose detection
      if (sourceCode.includes('import androidx.compose.') ||
          sourceCode.includes('@Composable') ||
          sourceCode.includes('setContent {')) {
        return 'compose';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Kotlin framework');
      return null;
    }
  }
}
