/**
 * GraphQL/Schema language handler for the Code-Map Generator tool.
 * This file contains the language handler for GraphQL and Schema files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';

/**
 * Language handler for GraphQL/Schema.
 * Provides enhanced function name detection for GraphQL and Schema files.
 */
export class GraphQLHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'field_definition',
      'operation_definition',
      'fragment_definition',
      'directive_definition'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'type_definition',
      'interface_definition',
      'union_definition',
      'enum_definition',
      'input_object_type_definition',
      'scalar_type_definition'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'import_declaration',
      'include_directive',
      'import_statement',
      'call_expression'
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
      // Handle field definitions
      if (node.type === 'field_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for resolver fields
          if (this.hasArguments(node)) {
            return `resolver_${name}`;
          }

          return name;
        }
      }

      // Handle operation definitions (queries, mutations, subscriptions)
      if (node.type === 'operation_definition') {
        const operationNode = node.childForFieldName('operation_type');
        const nameNode = node.childForFieldName('name');

        if (operationNode) {
          const operationType = getNodeText(operationNode, sourceCode);

          if (nameNode) {
            return `${operationType}_${getNodeText(nameNode, sourceCode)}`;
          }

          return `anonymous_${operationType}`;
        }
      }

      // Handle fragment definitions
      if (node.type === 'fragment_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return `fragment_${getNodeText(nameNode, sourceCode)}`;
        }
      }

      // Handle directive definitions
      if (node.type === 'directive_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return `directive_${getNodeText(nameNode, sourceCode)}`;
        }
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting GraphQL/Schema function name');
      return 'anonymous';
    }
  }

  /**
   * Checks if a field has arguments.
   */
  private hasArguments(node: SyntaxNode): boolean {
    try {
      const argsNode = node.childForFieldName('arguments');
      return !!argsNode && argsNode.childCount > 0;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if GraphQL field has arguments');
      return false;
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'type_definition' ||
          node.type === 'interface_definition' ||
          node.type === 'union_definition' ||
          node.type === 'enum_definition' ||
          node.type === 'input_object_type_definition' ||
          node.type === 'scalar_type_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return 'AnonymousType';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting GraphQL/Schema class name');
      return 'AnonymousType';
    }
  }

  /**
   * Extracts implemented interfaces from an AST node.
   */
  protected extractImplementedInterfaces(node: SyntaxNode, sourceCode: string): string[] | undefined {
    try {
      if (node.type === 'type_definition') {
        const implementsNode = node.childForFieldName('implements');
        if (implementsNode) {
          const interfaces: string[] = [];

          // Extract interfaces from named types
          const namedTypes = implementsNode.descendantsOfType('named_type');
          for (const namedType of namedTypes) {
            interfaces.push(getNodeText(namedType, sourceCode));
          }

          return interfaces.length > 0 ? interfaces : undefined;
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting GraphQL/Schema implemented interfaces');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      // GraphQL doesn't have standard imports, but some implementations use custom directives
      if (node.type === 'import_declaration') {
        const pathNode = node.childForFieldName('path');
        if (pathNode) {
          return getNodeText(pathNode, sourceCode);
        }
      } else if (node.type === 'include_directive') {
        const argumentNode = node.childForFieldName('argument');
        if (argumentNode) {
          return getNodeText(argumentNode, sourceCode);
        }
      }

      // For actual imports in the file (not in GraphQL syntax), we need to extract them from the source code
      // This is a special case for GraphQL files that are actually JavaScript/TypeScript files with GraphQL syntax
      if (node.type === 'import_statement' || node.type === 'import_declaration') {
        const source = node.childForFieldName('source');
        if (source && source.text) {
          return source.text.replace(/['"`]/g, '');
        }
      }

      // For require statements
      if (node.type === 'call_expression' && node.childForFieldName('function')?.text === 'require') {
        const args = node.childForFieldName('arguments');
        const firstArg = args?.firstChild;
        if (firstArg && firstArg.text) {
          return firstArg.text.replace(/['"`]/g, '');
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting GraphQL/Schema import path');
      return 'unknown';
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for description strings
      const descriptionNode = node.childForFieldName('description');
      if (descriptionNode) {
        return this.parseGraphQLDescription(descriptionNode.text);
      }

      // Look for comments before the node
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
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting GraphQL/Schema function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for description strings
      const descriptionNode = node.childForFieldName('description');
      if (descriptionNode) {
        return this.parseGraphQLDescription(descriptionNode.text);
      }

      // Look for comments before the node
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
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting GraphQL/Schema class comment');
      return undefined;
    }
  }

  /**
   * Parses a GraphQL description string into a clean comment.
   */
  private parseGraphQLDescription(description: string): string {
    try {
      // Remove quotes and trim whitespace
      return description
        .replace(/^"""|"""$/g, '') // Triple quotes
        .replace(/^"|"$/g, '')     // Single quotes
        .trim();
    } catch (error) {
      logger.warn({ err: error }, 'Error parsing GraphQL description');
      return description;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Apollo detection
      if (sourceCode.includes('ApolloServer') ||
          sourceCode.includes('gql`') ||
          sourceCode.includes('apollo-server')) {
        return 'apollo';
      }

      // Relay detection
      if (sourceCode.includes('Relay') ||
          sourceCode.includes('graphql-relay') ||
          sourceCode.includes('relay-runtime')) {
        return 'relay';
      }

      // GraphQL Yoga detection
      if (sourceCode.includes('GraphQLYoga') ||
          sourceCode.includes('createYoga') ||
          sourceCode.includes('graphql-yoga')) {
        return 'yoga';
      }

      // Prisma detection
      if (sourceCode.includes('Prisma') ||
          sourceCode.includes('prisma') ||
          sourceCode.includes('@prisma/client')) {
        return 'prisma';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting GraphQL/Schema framework');
      return null;
    }
  }
}
