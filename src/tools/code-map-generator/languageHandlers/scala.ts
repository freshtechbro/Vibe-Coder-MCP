/**
 * Scala language handler for the Code-Map Generator tool.
 * This file contains the language handler for Scala files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ImportedItem } from '../codeMapModel.js';

/**
 * Language handler for Scala.
 * Provides enhanced function name detection for Scala files.
 */
export class ScalaHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_definition',
      'method_definition',
      'val_definition',
      'var_definition',
      'anonymous_function'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'class_definition',
      'object_definition',
      'trait_definition',
      'case_class_definition'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'import_declaration',
      'package_declaration'
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
      if (node.type === 'function_definition' || node.type === 'method_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for test functions
          if (name.startsWith('test') || this.hasAnnotation(node, 'Test')) {
            return `test_${name}`;
          }

          // Check for apply/unapply methods
          if (name === 'apply') {
            return 'factory_apply';
          } else if (name === 'unapply') {
            return 'extractor_unapply';
          }

          return name;
        }
      }

      // Handle val/var definitions with function values
      if (node.type === 'val_definition' || node.type === 'var_definition') {
        const nameNode = node.childForFieldName('name');
        const valueNode = node.childForFieldName('value');

        if (nameNode && valueNode &&
            (valueNode.type === 'anonymous_function' ||
             valueNode.text.includes('=>'))) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      // Handle anonymous functions
      if (node.type === 'anonymous_function') {
        // Check if assigned to a val/var
        if (node.parent?.type === 'val_definition' || node.parent?.type === 'var_definition') {
          const nameNode = node.parent.childForFieldName('name');
          if (nameNode) {
            return getNodeText(nameNode, sourceCode);
          }
        }

        // Check if used in a function call
        if (node.parent?.type === 'argument' &&
            node.parent.parent?.type === 'argument_list' &&
            node.parent.parent.parent?.type === 'call_expression') {
          const funcNode = node.parent.parent.parent.childForFieldName('function');
          if (funcNode) {
            const funcName = getNodeText(funcNode, sourceCode);

            // Common Scala higher-order functions
            if (['map', 'flatMap', 'filter', 'foreach', 'fold', 'reduce'].includes(funcName)) {
              return `${funcName}_function`;
            }
          }
        }

        return 'anonymous_function';
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Scala function name');
      return 'anonymous';
    }
  }

  /**
   * Checks if a function has a specific annotation.
   */
  private hasAnnotation(node: SyntaxNode, annotationName: string): boolean {
    try {
      const annotationsNode = node.childForFieldName('annotations');
      if (!annotationsNode) return false;

      // Check each annotation
      for (let i = 0; i < annotationsNode.childCount; i++) {
        const annotation = annotationsNode.child(i);
        if (annotation?.text.includes(`@${annotationName}`)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking Scala annotation');
      return false;
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'class_definition' ||
          node.type === 'trait_definition' ||
          node.type === 'case_class_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      } else if (node.type === 'object_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return `Object_${getNodeText(nameNode, sourceCode)}`;
        }
      }

      return 'AnonymousClass';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Scala class name');
      return 'AnonymousClass';
    }
  }

  /**
   * Extracts the parent class from an AST node.
   */
  protected extractParentClass(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'class_definition' ||
          node.type === 'case_class_definition' ||
          node.type === 'object_definition') {
        const extendsNode = node.childForFieldName('extends_clause');
        if (extendsNode) {
          const typeNode = extendsNode.childForFieldName('type');
          if (typeNode) {
            return getNodeText(typeNode, sourceCode);
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Scala parent class');
      return undefined;
    }
  }

  /**
   * Extracts implemented interfaces (traits) from an AST node.
   */
  protected extractImplementedInterfaces(node: SyntaxNode, sourceCode: string): string[] | undefined {
    try {
      if (node.type === 'class_definition' ||
          node.type === 'case_class_definition' ||
          node.type === 'object_definition') {
        const withClausesNode = node.childForFieldName('with_clauses');
        if (withClausesNode) {
          const traits: string[] = [];

          // Extract traits from with clauses
          for (let i = 0; i < withClausesNode.childCount; i++) {
            const withClause = withClausesNode.child(i);
            if (withClause?.type === 'with_clause') {
              const typeNode = withClause.childForFieldName('type');
              if (typeNode) {
                traits.push(getNodeText(typeNode, sourceCode));
              }
            }
          }

          return traits.length > 0 ? traits : undefined;
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Scala implemented interfaces');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'import_declaration') {
        const importeeNode = node.childForFieldName('importee');
        if (importeeNode) {
          return getNodeText(importeeNode, sourceCode);
        }
      } else if (node.type === 'package_declaration') {
        const refNode = node.childForFieldName('ref');
        if (refNode) {
          return getNodeText(refNode, sourceCode);
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Scala import path');
      return 'unknown';
    }
  }

  /**
   * Extracts imported items from an AST node.
   */
  protected extractImportedItems(node: SyntaxNode, sourceCode: string): ImportedItem[] | undefined {
    try {
      // Handle import declarations (import scala.collection.mutable.{Map, Set})
      if (node.type === 'import_declaration') {
        const importeeNode = node.childForFieldName('importee');

        if (importeeNode) {
          const fullPath = getNodeText(importeeNode, sourceCode);

          // Check for different types of Scala imports

          // Case 1: Wildcard import - import scala.collection._
          if (fullPath.endsWith('._')) {
            const basePath = fullPath.substring(0, fullPath.length - 2);

            return [{
              name: '*',
              path: basePath,
              isDefault: false,
              isNamespace: true,
              nodeText: node.text,
              // Add Scala-specific metadata
              isWildcardImport: true
            }];
          }

          // Case 2: Selector import - import scala.collection.mutable.{Map, Set}
          else if (fullPath.includes('{') && fullPath.includes('}')) {
            const basePath = fullPath.substring(0, fullPath.indexOf('{'));
            const selectorsText = fullPath.substring(
              fullPath.indexOf('{') + 1,
              fullPath.lastIndexOf('}')
            );

            // Split selectors by comma, handling potential whitespace
            const selectors = selectorsText.split(',').map(s => s.trim());
            const items: ImportedItem[] = [];

            for (const selector of selectors) {
              // Handle renamed imports - Map => MutableMap
              if (selector.includes('=>')) {
                const [originalName, alias] = selector.split('=>').map(s => s.trim());
                items.push({
                  name: originalName,
                  path: basePath + originalName,
                  alias: alias,
                  isDefault: false,
                  isNamespace: false,
                  nodeText: selector,
                  // Add Scala-specific metadata
                  isSelectorImport: true
                });
              }
              // Handle regular selector imports
              else {
                items.push({
                  name: selector,
                  path: basePath + selector,
                  isDefault: false,
                  isNamespace: false,
                  nodeText: selector,
                  // Add Scala-specific metadata
                  isSelectorImport: true
                });
              }
            }

            return items.length > 0 ? items : undefined;
          }

          // Case 3: Simple import - import scala.collection.mutable.Map
          else {
            const parts = fullPath.split('.');
            const name = parts[parts.length - 1];

            return [{
              name: name,
              path: fullPath,
              isDefault: false,
              isNamespace: false,
              nodeText: node.text
            }];
          }
        }
      }
      // Handle package declarations (package com.example.app)
      else if (node.type === 'package_declaration') {
        const refNode = node.childForFieldName('ref');

        if (refNode) {
          const packagePath = getNodeText(refNode, sourceCode);

          return [{
            name: packagePath,
            path: packagePath,
            isDefault: false,
            isNamespace: true,
            nodeText: node.text,
            // Add Scala-specific metadata
            isPackageDeclaration: true
          }];
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Scala imported items');
      return undefined;
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for Scaladoc comments
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment' && prev.text.startsWith('/**')) {
        return this.parseScaladocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Scala function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for Scaladoc comments
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment' && prev.text.startsWith('/**')) {
        return this.parseScaladocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Scala class comment');
      return undefined;
    }
  }

  /**
   * Parses a Scaladoc comment into a clean comment.
   */
  private parseScaladocComment(comment: string): string {
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
      logger.warn({ err: error }, 'Error parsing Scaladoc comment');
      return comment;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Akka detection
      if (sourceCode.includes('import akka.') ||
          sourceCode.includes('extends Actor') ||
          sourceCode.includes('ActorSystem')) {
        return 'akka';
      }

      // Play Framework detection
      if (sourceCode.includes('import play.') ||
          sourceCode.includes('extends Controller') ||
          sourceCode.includes('Action {')) {
        return 'play';
      }

      // Spark detection
      if (sourceCode.includes('import org.apache.spark') ||
          sourceCode.includes('SparkContext') ||
          sourceCode.includes('SparkSession')) {
        return 'spark';
      }

      // Cats/Cats Effect detection
      if (sourceCode.includes('import cats.') ||
          sourceCode.includes('import cats.effect.') ||
          sourceCode.includes('extends IOApp')) {
        return 'cats';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Scala framework');
      return null;
    }
  }
}
