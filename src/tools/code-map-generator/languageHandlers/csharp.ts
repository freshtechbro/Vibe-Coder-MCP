/**
 * C# language handler for the Code-Map Generator tool.
 * This file contains the language handler for C# files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ImportedItem } from '../codeMapModel.js';

/**
 * Language handler for C#.
 * Provides enhanced function name detection for C# files.
 */
export class CSharpHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'method_declaration',
      'constructor_declaration',
      'local_function_statement',
      'anonymous_method_expression',
      'lambda_expression'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'class_declaration',
      'interface_declaration',
      'struct_declaration',
      'enum_declaration'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'using_directive'
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
      // Handle method declarations
      if (node.type === 'method_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for attributes
          const attributes = this.getMethodAttributes(node, sourceCode);

          // ASP.NET Core attributes
          if (attributes.includes('[HttpGet]') ||
              attributes.includes('[HttpPost]') ||
              attributes.includes('[Route]') ||
              attributes.includes('[ApiController]')) {
            return `api_${name}`;
          }

          // Test attributes
          if (attributes.includes('[Fact]') ||
              attributes.includes('[Theory]') ||
              attributes.includes('[Test]')) {
            return `test_${name}`;
          }

          return name;
        }
      }

      // Handle constructor declarations
      if (node.type === 'constructor_declaration') {
        const className = this.findClassName(node, sourceCode);
        return `${className}_Constructor`;
      }

      // Handle local function statements
      if (node.type === 'local_function_statement') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return `local_${getNodeText(nameNode, sourceCode)}`;
        }
      }

      // Handle anonymous method expressions
      if (node.type === 'anonymous_method_expression') {
        // Check if used in a delegate assignment
        if (node.parent?.type === 'assignment_expression') {
          const leftNode = node.parent.childForFieldName('left');
          if (leftNode) {
            return getNodeText(leftNode, sourceCode);
          }
        }

        // Check if used in an event assignment
        if (node.parent?.type === 'assignment_expression' &&
            node.parent.parent?.type === 'expression_statement' &&
            node.parent.parent.previousNamedSibling?.type === 'event_field_declaration') {
          const eventNode = node.parent.parent.previousNamedSibling.childForFieldName('declarator');
          if (eventNode) {
            const eventName = getNodeText(eventNode, sourceCode);
            return `${eventName}Handler`;
          }
        }

        return 'anonymousMethod';
      }

      // Handle lambda expressions
      if (node.type === 'lambda_expression') {
        // Check if used in a variable declaration
        if (node.parent?.type === 'variable_declarator') {
          const nameNode = node.parent.childForFieldName('name');
          if (nameNode) {
            return getNodeText(nameNode, sourceCode);
          }
        }

        // Check if used in LINQ
        if (node.parent?.type === 'argument' &&
            node.parent.parent?.type === 'argument_list' &&
            node.parent.parent.parent?.type === 'invocation_expression') {
          const methodNode = node.parent.parent.parent.childForFieldName('name');
          if (methodNode) {
            const methodName = getNodeText(methodNode, sourceCode);

            // LINQ methods
            if (['Select', 'Where', 'OrderBy', 'GroupBy', 'Join', 'ForEach'].includes(methodName)) {
              return `linq_${methodName}`;
            }
          }
        }

        // Check if used in an event assignment
        if (node.parent?.type === 'assignment_expression' &&
            node.parent.childForFieldName('left')?.text.includes('+=')) {
          const leftNode = node.parent.childForFieldName('left');
          if (leftNode) {
            const eventName = getNodeText(leftNode, sourceCode).split('+=')[0].trim();
            return `${eventName}Handler`;
          }
        }

        return 'lambda';
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C# function name');
      return 'anonymous';
    }
  }

  /**
   * Finds the class name for a node.
   */
  private findClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      // Find the parent class declaration
      let current = node.parent;
      while (current && current.type !== 'class_declaration') {
        current = current.parent;
      }

      if (current) {
        const nameNode = current.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return 'Unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error finding C# class name');
      return 'Unknown';
    }
  }

  /**
   * Gets attributes for a method.
   */
  private getMethodAttributes(node: SyntaxNode, sourceCode: string): string[] {
    try {
      const attributes: string[] = [];

      // Check for attributes before the method
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type === 'attribute_list') {
        attributes.push(getNodeText(prev, sourceCode));
        prev = prev.previousNamedSibling;
      }

      return attributes;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error getting C# method attributes');
      return [];
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'class_declaration' ||
          node.type === 'interface_declaration' ||
          node.type === 'struct_declaration' ||
          node.type === 'enum_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return 'AnonymousClass';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C# class name');
      return 'AnonymousClass';
    }
  }

  /**
   * Extracts the parent class from an AST node.
   */
  protected extractParentClass(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'class_declaration') {
        const baseListNode = node.childForFieldName('base_list');
        if (baseListNode) {
          // Find the first base type that's not an interface
          const baseTypes = baseListNode.descendantsOfType('base_type');
          for (const baseType of baseTypes) {
            const typeNode = baseType.childForFieldName('type');
            if (typeNode) {
              const typeName = getNodeText(typeNode, sourceCode);
              // Heuristic: interfaces in C# typically start with 'I'
              if (!typeName.startsWith('I') || typeName.length <= 1) {
                return typeName;
              }
            }
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C# parent class');
      return undefined;
    }
  }

  /**
   * Extracts implemented interfaces from an AST node.
   */
  protected extractImplementedInterfaces(node: SyntaxNode, sourceCode: string): string[] | undefined {
    try {
      if (node.type === 'class_declaration' || node.type === 'struct_declaration') {
        const interfaces: string[] = [];
        const baseListNode = node.childForFieldName('base_list');

        if (baseListNode) {
          const baseTypes = baseListNode.descendantsOfType('base_type');
          for (const baseType of baseTypes) {
            const typeNode = baseType.childForFieldName('type');
            if (typeNode) {
              const typeName = getNodeText(typeNode, sourceCode);
              // Heuristic: interfaces in C# typically start with 'I'
              if (typeName.startsWith('I') && typeName.length > 1) {
                interfaces.push(typeName);
              }
            }
          }
        }

        return interfaces.length > 0 ? interfaces : undefined;
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C# implemented interfaces');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'using_directive') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C# import path');
      return 'unknown';
    }
  }

  /**
   * Extracts imported items from an AST node.
   */
  protected extractImportedItems(node: SyntaxNode, sourceCode: string): ImportedItem[] | undefined {
    try {
      if (node.type === 'using_directive') {
        // Get the name node which contains the namespace
        const nameNode = node.childForFieldName('name');

        if (nameNode) {
          const fullPath = getNodeText(nameNode, sourceCode);
          const parts = fullPath.split('.');
          const name = parts[parts.length - 1];

          // Check for static imports - using static System.Console;
          const isStatic = this.isStaticUsing(node, sourceCode);

          // Check for aliased imports - using Project = MyCompany.Project;
          const aliasNode = node.childForFieldName('alias');
          const alias = aliasNode ? getNodeText(aliasNode, sourceCode) : undefined;

          // Check for global using (C# 10+)
          const isGlobal = this.isGlobalUsing(node, sourceCode);

          return [{
            name: alias || name,
            path: fullPath,
            alias: alias,
            isDefault: false,
            isNamespace: true,
            nodeText: node.text,
            // Add C#-specific metadata
            isStatic,
            isGlobal
          }];
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C# imported items');
      return undefined;
    }
  }

  /**
   * Checks if a using directive is a static using.
   */
  private isStaticUsing(node: SyntaxNode, _sourceCode: string): boolean {
    try {
      // Look for the 'static' keyword in the using directive
      const staticNode = node.childForFieldName('static');
      return staticNode !== null;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if C# using is static');
      return false;
    }
  }

  /**
   * Checks if a using directive is a global using (C# 10+).
   */
  private isGlobalUsing(node: SyntaxNode, _sourceCode: string): boolean {
    try {
      // Look for the 'global' keyword in the using directive
      const globalNode = node.childForFieldName('global');
      return globalNode !== null;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if C# using is global');
      return false;
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for XML documentation comments
      let prev = node.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment' && prev.text.startsWith('///')) {
        return this.parseXmlDocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C# function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for XML documentation comments
      let prev = node.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment' && prev.text.startsWith('///')) {
        return this.parseXmlDocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting C# class comment');
      return undefined;
    }
  }

  /**
   * Parses an XML documentation comment into a clean comment.
   */
  private parseXmlDocComment(comment: string): string {
    try {
      // Split into lines and remove leading '///' and whitespace
      const lines = comment.split('\n')
        .map(line => line.trim().replace(/^\/\/\/\s*/, ''));

      // Extract summary tag content
      const summaryStart = lines.findIndex(line => line.includes('<summary>'));
      const summaryEnd = lines.findIndex(line => line.includes('</summary>'));

      if (summaryStart !== -1 && summaryEnd !== -1 && summaryEnd > summaryStart) {
        const summaryLines = lines.slice(summaryStart + 1, summaryEnd);
        return summaryLines
          .map(line => line.trim())
          .join(' ')
          .replace(/<[^>]+>/g, '') // Remove XML tags
          .trim();
      }

      // If no summary tag, just join all lines
      return lines
        .map(line => line.trim())
        .join(' ')
        .replace(/<[^>]+>/g, '') // Remove XML tags
        .trim();
    } catch (error) {
      logger.warn({ err: error }, 'Error parsing C# XML documentation comment');
      return comment;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // ASP.NET Core detection
      if (sourceCode.includes('Microsoft.AspNetCore') ||
          sourceCode.includes('[ApiController]') ||
          sourceCode.includes('IActionResult')) {
        return 'aspnetcore';
      }

      // WPF detection
      if (sourceCode.includes('System.Windows') ||
          sourceCode.includes('Window') ||
          sourceCode.includes('UserControl')) {
        return 'wpf';
      }

      // Entity Framework detection
      if (sourceCode.includes('Microsoft.EntityFrameworkCore') ||
          sourceCode.includes('DbContext') ||
          sourceCode.includes('DbSet<')) {
        return 'entityframework';
      }

      // xUnit detection
      if (sourceCode.includes('Xunit') ||
          sourceCode.includes('[Fact]') ||
          sourceCode.includes('[Theory]')) {
        return 'xunit';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting C# framework');
      return null;
    }
  }
}
