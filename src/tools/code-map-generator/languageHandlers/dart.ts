/**
 * Dart/Flutter language handler for the Code-Map Generator tool.
 * This file contains the language handler for Dart and Flutter files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ImportedItem } from '../codeMapModel.js';

/**
 * Language handler for Dart/Flutter.
 * Provides enhanced function name detection for Dart and Flutter files.
 */
export class DartHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_declaration',
      'method_declaration',
      'function_expression',
      'lambda_expression'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'class_declaration',
      'mixin_declaration',
      'enum_declaration',
      'extension_declaration'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'import_directive',
      'export_directive',
      'part_directive',
      'part_of_directive'
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

          return name;
        }
      }

      // Handle method declarations
      if (node.type === 'method_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for Flutter lifecycle methods
          if (this.isFlutterLifecycleMethod(name)) {
            return `lifecycle_${name}`;
          }

          // Check for constructor
          if (name === 'constructor' || this.isConstructor(node, sourceCode)) {
            return 'constructor';
          }

          // Check for getter/setter
          if (this.isGetter(node, sourceCode)) {
            return `get_${name}`;
          }
          if (this.isSetter(node, sourceCode)) {
            return `set_${name}`;
          }

          // Check for override methods
          if (this.hasAnnotation(node, 'override')) {
            return `override_${name}`;
          }

          return name;
        }
      }

      // Handle function expressions
      if (node.type === 'function_expression') {
        // Check if assigned to a variable
        if (node.parent?.type === 'variable_declaration') {
          const nameNode = node.parent.childForFieldName('name');
          if (nameNode) {
            return getNodeText(nameNode, sourceCode);
          }
        }

        return 'anonymous_function';
      }

      // Handle lambda expressions
      if (node.type === 'lambda_expression') {
        // Check if assigned to a variable
        if (node.parent?.type === 'variable_declaration') {
          const nameNode = node.parent.childForFieldName('name');
          if (nameNode) {
            return getNodeText(nameNode, sourceCode);
          }
        }

        // Check if used in a function call
        if (node.parent?.type === 'argument' &&
            node.parent.parent?.type === 'argument_list' &&
            node.parent.parent.parent?.type === 'method_invocation') {
          const methodNode = node.parent.parent.parent.childForFieldName('name');
          if (methodNode) {
            const methodName = getNodeText(methodNode, sourceCode);

            // Common Dart higher-order functions
            if (['map', 'where', 'forEach', 'reduce', 'listen', 'then'].includes(methodName)) {
              return `${methodName}_lambda`;
            }
          }
        }

        return 'lambda';
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Dart/Flutter function name');
      return 'anonymous';
    }
  }

  /**
   * Checks if a node has a specific annotation.
   */
  private hasAnnotation(node: SyntaxNode, annotationName: string): boolean {
    try {
      const metadataNode = node.childForFieldName('metadata');
      if (!metadataNode) return false;

      // Check each annotation
      for (let i = 0; i < metadataNode.childCount; i++) {
        const annotation = metadataNode.child(i);
        if (annotation?.text.includes(`@${annotationName}`)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking Dart/Flutter annotation');
      return false;
    }
  }

  /**
   * Checks if a method name is a Flutter lifecycle method.
   */
  private isFlutterLifecycleMethod(name: string): boolean {
    const lifecycleMethods = [
      'initState',
      'didChangeDependencies',
      'build',
      'didUpdateWidget',
      'deactivate',
      'dispose',
      'reassemble',
      'activate'
    ];

    return lifecycleMethods.includes(name);
  }

  /**
   * Checks if a method is a constructor.
   */
  private isConstructor(node: SyntaxNode, sourceCode: string): boolean {
    try {
      // Find the class name
      let current = node.parent;
      while (current && current.type !== 'class_declaration') {
        current = current.parent;
      }

      if (current) {
        const classNameNode = current.childForFieldName('name');
        if (classNameNode) {
          const className = getNodeText(classNameNode, sourceCode);

          // Check if the method name matches the class name
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const methodName = getNodeText(nameNode, sourceCode);
            return methodName === className;
          }
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Dart/Flutter method is constructor');
      return false;
    }
  }

  /**
   * Checks if a method is a getter.
   */
  private isGetter(node: SyntaxNode, _sourceCode: string): boolean {
    try {
      return node.text.includes('get ');
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Dart/Flutter method is getter');
      return false;
    }
  }

  /**
   * Checks if a method is a setter.
   */
  private isSetter(node: SyntaxNode, _sourceCode: string): boolean {
    try {
      return node.text.includes('set ');
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Dart/Flutter method is setter');
      return false;
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'class_declaration' ||
          node.type === 'enum_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      } else if (node.type === 'mixin_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return `Mixin_${getNodeText(nameNode, sourceCode)}`;
        }
      } else if (node.type === 'extension_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return `Extension_${getNodeText(nameNode, sourceCode)}`;
        }
      }

      return 'AnonymousClass';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Dart/Flutter class name');
      return 'AnonymousClass';
    }
  }

  /**
   * Extracts the parent class from an AST node.
   */
  protected extractParentClass(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'class_declaration') {
        const extendsClauseNode = node.childForFieldName('extends_clause');
        if (extendsClauseNode) {
          const typeNode = extendsClauseNode.childForFieldName('type');
          if (typeNode) {
            return getNodeText(typeNode, sourceCode);
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Dart/Flutter parent class');
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

        // Get interfaces from implements clause
        const implementsClauseNode = node.childForFieldName('implements_clause');
        if (implementsClauseNode) {
          const typeListNode = implementsClauseNode.childForFieldName('type_list');
          if (typeListNode) {
            for (let i = 0; i < typeListNode.childCount; i++) {
              const typeNode = typeListNode.child(i);
              if (typeNode) {
                interfaces.push(getNodeText(typeNode, sourceCode));
              }
            }
          }
        }

        // Get mixins from with clause
        const withClauseNode = node.childForFieldName('with_clause');
        if (withClauseNode) {
          const typeListNode = withClauseNode.childForFieldName('type_list');
          if (typeListNode) {
            for (let i = 0; i < typeListNode.childCount; i++) {
              const typeNode = typeListNode.child(i);
              if (typeNode) {
                interfaces.push(`mixin:${getNodeText(typeNode, sourceCode)}`);
              }
            }
          }
        }

        return interfaces.length > 0 ? interfaces : undefined;
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Dart/Flutter implemented interfaces');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'import_directive' ||
          node.type === 'export_directive' ||
          node.type === 'part_directive' ||
          node.type === 'part_of_directive') {
        const uriNode = node.childForFieldName('uri');
        if (uriNode) {
          return getNodeText(uriNode, sourceCode).replace(/^['"]|['"]$/g, '');
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Dart/Flutter import path');
      return 'unknown';
    }
  }

  /**
   * Extracts imported items from an AST node.
   */
  protected extractImportedItems(node: SyntaxNode, sourceCode: string): ImportedItem[] | undefined {
    try {
      // Handle import directives (import 'package:flutter/material.dart')
      if (node.type === 'import_directive') {
        const uriNode = node.childForFieldName('uri');

        if (uriNode) {
          const path = getNodeText(uriNode, sourceCode).replace(/^['"]|['"]$/g, '');

          // Check for package imports (package:flutter/material.dart)
          const isPackageImport = path.startsWith('package:');

          // Check for relative imports (../models/user.dart)
          const isRelativeImport = path.startsWith('./') || path.startsWith('../') || !path.includes(':');

          // Check for dart: imports (dart:io)
          const isDartImport = path.startsWith('dart:');

          // Extract the library name (last part of the path)
          const parts = path.split('/');
          const fileName = parts[parts.length - 1];
          const libraryName = fileName.replace('.dart', '');

          // Check for show/hide clauses
          const showClauseNode = node.childForFieldName('show_clause');
          const hideClauseNode = node.childForFieldName('hide_clause');

          // Check for as clause (import 'package:flutter/material.dart' as material)
          const asClauseNode = node.childForFieldName('as_clause');
          const alias = asClauseNode ? this.extractAsClause(asClauseNode, sourceCode) : undefined;

          // Create the base import item
          const importItem: ImportedItem = {
            name: libraryName,
            path,
            alias,
            isDefault: false,
            isNamespace: true,
            nodeText: node.text,
            // Add Dart-specific metadata
            isPackageImport,
            isRelativeImport,
            isDartImport
          };

          // If there's a show clause, extract the specific items being imported
          if (showClauseNode) {
            const showItems = this.extractShowHideItems(showClauseNode, sourceCode);
            if (showItems && showItems.length > 0) {
              return showItems.map(item => ({
                ...importItem,
                name: item,
                isNamespace: false,
                showClause: true
              }));
            }
          }

          // If there's a hide clause, note what's being hidden
          if (hideClauseNode) {
            const hideItems = this.extractShowHideItems(hideClauseNode, sourceCode);
            if (hideItems) {
              importItem.hideItems = hideItems;
            }
          }

          return [importItem];
        }
      }
      // Handle export directives (export 'package:flutter/material.dart')
      else if (node.type === 'export_directive') {
        const uriNode = node.childForFieldName('uri');

        if (uriNode) {
          const path = getNodeText(uriNode, sourceCode).replace(/^['"]|['"]$/g, '');

          // Extract the library name (last part of the path)
          const parts = path.split('/');
          const fileName = parts[parts.length - 1];
          const libraryName = fileName.replace('.dart', '');

          // Check for show/hide clauses
          const showClauseNode = node.childForFieldName('show_clause');
          const hideClauseNode = node.childForFieldName('hide_clause');

          // Create the base export item
          const exportItem: ImportedItem = {
            name: libraryName,
            path,
            isDefault: false,
            isNamespace: true,
            nodeText: node.text,
            // Add Dart-specific metadata
            isExport: true
          };

          // If there's a show clause, extract the specific items being exported
          if (showClauseNode) {
            const showItems = this.extractShowHideItems(showClauseNode, sourceCode);
            if (showItems && showItems.length > 0) {
              return showItems.map(item => ({
                ...exportItem,
                name: item,
                isNamespace: false,
                showClause: true
              }));
            }
          }

          // If there's a hide clause, note what's being hidden
          if (hideClauseNode) {
            const hideItems = this.extractShowHideItems(hideClauseNode, sourceCode);
            if (hideItems) {
              exportItem.hideItems = hideItems;
            }
          }

          return [exportItem];
        }
      }
      // Handle part directives (part 'user.dart')
      else if (node.type === 'part_directive') {
        const uriNode = node.childForFieldName('uri');

        if (uriNode) {
          const path = getNodeText(uriNode, sourceCode).replace(/^['"]|['"]$/g, '');

          // Extract the file name (last part of the path)
          const parts = path.split('/');
          const fileName = parts[parts.length - 1];

          return [{
            name: fileName,
            path,
            isDefault: false,
            isNamespace: false,
            nodeText: node.text,
            // Add Dart-specific metadata
            isPart: true
          }];
        }
      }
      // Handle part of directives (part of 'package:myapp/models.dart')
      else if (node.type === 'part_of_directive') {
        const uriNode = node.childForFieldName('uri');

        if (uriNode) {
          const path = getNodeText(uriNode, sourceCode).replace(/^['"]|['"]$/g, '');

          // Extract the library name (last part of the path)
          const parts = path.split('/');
          const fileName = parts[parts.length - 1];
          const libraryName = fileName.replace('.dart', '');

          return [{
            name: libraryName,
            path,
            isDefault: false,
            isNamespace: true,
            nodeText: node.text,
            // Add Dart-specific metadata
            isPartOf: true
          }];
        }

        // Handle part of with library name (part of models)
        const libraryNameNode = node.childForFieldName('library_name');
        if (libraryNameNode) {
          const libraryName = getNodeText(libraryNameNode, sourceCode);

          return [{
            name: libraryName,
            path: libraryName,
            isDefault: false,
            isNamespace: true,
            nodeText: node.text,
            // Add Dart-specific metadata
            isPartOf: true,
            isLibraryName: true
          }];
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Dart/Flutter imported items');
      return undefined;
    }
  }

  /**
   * Extracts items from a show or hide clause.
   */
  private extractShowHideItems(node: SyntaxNode, sourceCode: string): string[] | undefined {
    try {
      const items: string[] = [];

      // Extract identifiers from the clause
      node.descendantsOfType('identifier').forEach(identifierNode => {
        items.push(getNodeText(identifierNode, sourceCode));
      });

      return items.length > 0 ? items : undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Dart/Flutter show/hide items');
      return undefined;
    }
  }

  /**
   * Extracts the alias from an as clause.
   */
  private extractAsClause(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      const identifierNode = node.childForFieldName('identifier');
      if (identifierNode) {
        return getNodeText(identifierNode, sourceCode);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Dart/Flutter as clause');
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

      while (prev && prev.type !== 'documentation_comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'documentation_comment') {
        return this.parseDartDocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Dart/Flutter function comment');
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

      while (prev && prev.type !== 'documentation_comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'documentation_comment') {
        return this.parseDartDocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Dart/Flutter class comment');
      return undefined;
    }
  }

  /**
   * Parses a Dart documentation comment into a clean comment.
   */
  private parseDartDocComment(comment: string): string {
    try {
      // Remove comment markers and whitespace
      return comment
        .replace(/^\/\*\*|\*\/$/g, '')
        .replace(/^\s*\*\s*/mg, '')
        .trim();
    } catch (error) {
      logger.warn({ err: error }, 'Error parsing Dart documentation comment');
      return comment;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Flutter detection
      if (sourceCode.includes("import 'package:flutter/") ||
          sourceCode.includes('extends StatelessWidget') ||
          sourceCode.includes('extends StatefulWidget')) {
        return 'flutter';
      }

      // AngularDart detection
      if (sourceCode.includes("import 'package:angular/") ||
          sourceCode.includes('@Component') ||
          sourceCode.includes('@Directive')) {
        return 'angulardart';
      }

      // Firebase detection
      if (sourceCode.includes("import 'package:firebase_") ||
          sourceCode.includes('FirebaseAuth') ||
          sourceCode.includes('FirebaseFirestore')) {
        return 'firebase';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Dart/Flutter framework');
      return null;
    }
  }
}
