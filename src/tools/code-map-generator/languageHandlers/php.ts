/**
 * PHP language handler for the Code-Map Generator tool.
 * This file contains the language handler for PHP files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ImportedItem } from '../codeMapModel.js';

/**
 * Language handler for PHP.
 * Provides enhanced function name detection for PHP files.
 */
export class PhpHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_definition',
      'method_declaration',
      'anonymous_function_creation_expression',
      'arrow_function'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'class_declaration',
      'interface_declaration',
      'trait_declaration'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'namespace_use_declaration',
      'namespace_use_clause',
      'require_expression',
      'include_expression'
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
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for test functions
          if (name.startsWith('test')) {
            return name;
          }

          return name;
        }
      }

      // Handle method declarations
      if (node.type === 'method_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for constructor
          if (name === '__construct') {
            return 'constructor';
          }

          // Check for magic methods
          if (name.startsWith('__')) {
            return `magic_${name.slice(2)}`;
          }

          // Check for Laravel controller actions
          if (this.isLaravelControllerAction(node, sourceCode)) {
            return `action_${name}`;
          }

          return name;
        }
      }

      // Handle anonymous functions
      if (node.type === 'anonymous_function_creation_expression') {
        // Check if assigned to a variable
        if (node.parent?.type === 'assignment_expression') {
          const leftNode = node.parent.childForFieldName('left');
          if (leftNode) {
            return getNodeText(leftNode, sourceCode);
          }
        }

        // Check if used in a function call
        if (node.parent?.type === 'argument' &&
            node.parent.parent?.type === 'argument_list' &&
            node.parent.parent.parent?.type === 'function_call_expression') {
          const funcNode = node.parent.parent.parent.childForFieldName('function');
          if (funcNode) {
            const funcName = getNodeText(funcNode, sourceCode);

            // Common PHP functions that take callbacks
            if (['array_map', 'array_filter', 'array_reduce', 'usort'].includes(funcName)) {
              return `${funcName}_callback`;
            }
          }
        }

        return 'anonymous_function';
      }

      // Handle arrow functions
      if (node.type === 'arrow_function') {
        // Check if assigned to a variable
        if (node.parent?.type === 'assignment_expression') {
          const leftNode = node.parent.childForFieldName('left');
          if (leftNode) {
            return getNodeText(leftNode, sourceCode);
          }
        }

        return 'arrow_function';
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting PHP function name');
      return 'anonymous';
    }
  }

  /**
   * Checks if a method is a Laravel controller action.
   */
  private isLaravelControllerAction(node: SyntaxNode, sourceCode: string): boolean {
    try {
      // Check if the method is in a class that extends Controller
      let current = node.parent;
      while (current && current.type !== 'class_declaration') {
        current = current.parent;
      }

      if (current) {
        const baseClauseNode = current.childForFieldName('base_clause');
        if (baseClauseNode) {
          const baseText = getNodeText(baseClauseNode, sourceCode);
          return baseText.includes('Controller');
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if method is a Laravel controller action');
      return false;
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'class_declaration' ||
          node.type === 'interface_declaration' ||
          node.type === 'trait_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return 'AnonymousClass';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting PHP class name');
      return 'AnonymousClass';
    }
  }

  /**
   * Extracts the parent class from an AST node.
   */
  protected extractParentClass(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'class_declaration') {
        const baseClauseNode = node.childForFieldName('base_clause');
        if (baseClauseNode) {
          return getNodeText(baseClauseNode, sourceCode);
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting PHP parent class');
      return undefined;
    }
  }

  /**
   * Extracts implemented interfaces from an AST node.
   */
  protected extractImplementedInterfaces(node: SyntaxNode, sourceCode: string): string[] | undefined {
    try {
      if (node.type === 'class_declaration') {
        const implementsClauseNode = node.childForFieldName('implements_clause');
        if (implementsClauseNode) {
          const interfaces = getNodeText(implementsClauseNode, sourceCode)
            .replace('implements', '')
            .split(',')
            .map(i => i.trim());

          return interfaces.length > 0 ? interfaces : undefined;
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting PHP implemented interfaces');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'namespace_use_declaration') {
        const clauseNode = node.childForFieldName('clauses');
        if (clauseNode?.firstChild) {
          return getNodeText(clauseNode.firstChild, sourceCode);
        }
      } else if (node.type === 'namespace_use_clause') {
        return getNodeText(node, sourceCode);
      } else if (node.type === 'require_expression' || node.type === 'include_expression') {
        const argumentNode = node.childForFieldName('argument');
        if (argumentNode) {
          const path = getNodeText(argumentNode, sourceCode);
          return path.replace(/^['"]|['"]$/g, '');
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting PHP import path');
      return 'unknown';
    }
  }

  /**
   * Extracts imported items from an AST node.
   */
  protected extractImportedItems(node: SyntaxNode, sourceCode: string): ImportedItem[] | undefined {
    try {
      // Handle namespace use declarations (use statements)
      if (node.type === 'namespace_use_declaration') {
        const items: ImportedItem[] = [];
        const clausesNode = node.childForFieldName('clauses');

        if (clausesNode) {
          // Get the type of import (class, function, const)
          const importType = this.getUseDeclarationType(node, sourceCode);

          // Process each clause in the use statement
          for (let i = 0; i < clausesNode.childCount; i++) {
            const clauseNode = clausesNode.child(i);
            if (clauseNode && clauseNode.type === 'namespace_use_clause') {
              const nameNode = clauseNode.childForFieldName('name');
              const aliasNode = clauseNode.childForFieldName('alias');

              if (nameNode) {
                const fullPath = getNodeText(nameNode, sourceCode);
                const parts = fullPath.split('\\');
                const name = parts[parts.length - 1];
                const alias = aliasNode ? getNodeText(aliasNode, sourceCode) : undefined;

                // Check for group use declarations
                const isGroupUse = node.childForFieldName('prefix') !== null;
                let path = fullPath;

                if (isGroupUse) {
                  const prefixNode = node.childForFieldName('prefix');
                  if (prefixNode) {
                    const prefix = getNodeText(prefixNode, sourceCode);
                    path = prefix + '\\' + fullPath;
                  }
                }

                items.push({
                  name: name,
                  path: path,
                  alias: alias,
                  isDefault: false,
                  isNamespace: false,
                  nodeText: clauseNode.text,
                  // Add PHP-specific metadata
                  importType: importType
                });
              }
            }
          }
        }

        return items.length > 0 ? items : undefined;
      }
      // Handle individual namespace use clauses
      else if (node.type === 'namespace_use_clause') {
        const nameNode = node.childForFieldName('name');
        const aliasNode = node.childForFieldName('alias');

        if (nameNode) {
          const fullPath = getNodeText(nameNode, sourceCode);
          const parts = fullPath.split('\\');
          const name = parts[parts.length - 1];
          const alias = aliasNode ? getNodeText(aliasNode, sourceCode) : undefined;

          // Check if this is part of a group use declaration
          const isGroupUse = node.parent?.parent?.childForFieldName('prefix') !== null;
          let path = fullPath;

          if (isGroupUse) {
            const prefixNode = node.parent?.parent?.childForFieldName('prefix');
            if (prefixNode) {
              const prefix = getNodeText(prefixNode, sourceCode);
              path = prefix + '\\' + fullPath;
            }
          }

          // Get the type of import from the parent declaration
          const importType = this.getUseDeclarationType(node.parent?.parent, sourceCode);

          return [{
            name: name,
            path: path,
            alias: alias,
            isDefault: false,
            isNamespace: false,
            nodeText: node.text,
            // Add PHP-specific metadata
            importType: importType
          }];
        }
      }
      // Handle require/include expressions
      else if (node.type === 'require_expression' || node.type === 'include_expression') {
        const argumentNode = node.childForFieldName('argument');

        if (argumentNode) {
          const path = getNodeText(argumentNode, sourceCode).replace(/^['"]|['"]$/g, '');
          const parts = path.split('/');
          const name = parts[parts.length - 1].replace('.php', '');

          return [{
            name: name,
            path: path,
            isDefault: false,
            isNamespace: false,
            nodeText: node.text,
            // Add PHP-specific metadata
            importType: node.type === 'require_expression' ? 'require' : 'include'
          }];
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting PHP imported items');
      return undefined;
    }
  }

  /**
   * Gets the type of a use declaration (class, function, const).
   */
  private getUseDeclarationType(node: SyntaxNode | null | undefined, sourceCode: string): string {
    try {
      if (!node) return 'class'; // Default to class import

      const keywordNode = node.childForFieldName('kind');
      if (keywordNode) {
        const keyword = getNodeText(keywordNode, sourceCode);
        if (keyword === 'function') return 'function';
        if (keyword === 'const') return 'const';
      }

      return 'class'; // Default to class import
    } catch (error) {
      logger.warn({ err: error }, 'Error getting PHP use declaration type');
      return 'class';
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for PHPDoc comments
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment' && prev.text.startsWith('/**')) {
        return this.parsePhpDocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting PHP function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for PHPDoc comments
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment' && prev.text.startsWith('/**')) {
        return this.parsePhpDocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting PHP class comment');
      return undefined;
    }
  }

  /**
   * Parses a PHPDoc comment into a clean comment.
   */
  private parsePhpDocComment(comment: string): string {
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
      logger.warn({ err: error }, 'Error parsing PHPDoc comment');
      return comment;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Laravel detection
      if (sourceCode.includes('Illuminate\\') ||
          sourceCode.includes('extends Controller') ||
          sourceCode.includes('use App\\Http\\Controllers\\Controller')) {
        return 'laravel';
      }

      // Symfony detection
      if (sourceCode.includes('Symfony\\') ||
          sourceCode.includes('extends AbstractController') ||
          sourceCode.includes('use Symfony\\Component\\HttpFoundation')) {
        return 'symfony';
      }

      // WordPress detection
      if (sourceCode.includes('add_action') ||
          sourceCode.includes('add_filter') ||
          sourceCode.includes('wp_enqueue_script')) {
        return 'wordpress';
      }

      // CodeIgniter detection
      if (sourceCode.includes('extends CI_Controller') ||
          sourceCode.includes('extends CI_Model') ||
          sourceCode.includes('$this->load->view')) {
        return 'codeigniter';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting PHP framework');
      return null;
    }
  }
}
