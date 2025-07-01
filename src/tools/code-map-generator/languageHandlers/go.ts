/**
 * Go language handler for the Code-Map Generator tool.
 * This file contains the language handler for Go files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ImportedItem } from '../codeMapModel.js';

/**
 * Language handler for Go.
 * Provides enhanced function name detection for Go files.
 */
export class GoHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_declaration',
      'method_declaration',
      'func_literal'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'type_declaration',
      'type_spec',
      'struct_type',
      'interface_type'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'import_declaration',
      'import_spec'
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
          if (name.startsWith('Test') && this.hasTestSignature(node, sourceCode)) {
            return `test_${name.substring(4)}`;
          }

          // Check for benchmark functions
          if (name.startsWith('Benchmark') && this.hasBenchmarkSignature(node, sourceCode)) {
            return `benchmark_${name.substring(9)}`;
          }

          // Check for example functions
          if (name.startsWith('Example')) {
            return `example_${name.substring(7)}`;
          }

          // Check for main function
          if (name === 'main') {
            return 'main_entrypoint';
          }

          // Check for init function
          if (name === 'init') {
            return 'init_function';
          }

          return name;
        }
      }

      // Handle method declarations
      if (node.type === 'method_declaration') {
        const nameNode = node.childForFieldName('name');
        const receiverNode = node.childForFieldName('receiver');

        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Extract receiver type for context
          if (receiverNode) {
            const receiverType = this.extractReceiverType(receiverNode, sourceCode);

            // Check for HTTP handlers
            if (this.isHttpHandler(node, sourceCode)) {
              return `http_handler_${receiverType}_${name}`;
            }

            return `${receiverType}.${name}`;
          }

          return name;
        }
      }

      // Handle function literals (closures)
      if (node.type === 'func_literal') {
        // Check if assigned to a variable
        if (node.parent?.type === 'short_var_declaration' || node.parent?.type === 'assignment_statement') {
          const leftNode = node.parent.childForFieldName('left');
          if (leftNode?.firstChild) {
            return getNodeText(leftNode.firstChild, sourceCode);
          }
        }

        // Check if used as a goroutine
        if (node.parent?.type === 'call_expression' &&
            node.parent.previousSibling?.type === 'go') {
          return 'goroutine';
        }

        // Check if used in a function call
        if (node.parent?.type === 'argument_list' &&
            node.parent.parent?.type === 'call_expression') {
          const funcNode = node.parent.parent.childForFieldName('function');
          if (funcNode) {
            // Check if it's a method call
            if (funcNode.type === 'selector_expression') {
              const methodNode = funcNode.childForFieldName('field');
              if (methodNode) {
                const methodName = getNodeText(methodNode, sourceCode);

                // Common method names that take callbacks
                if (['Map', 'Filter', 'ForEach', 'Handle', 'HandleFunc'].includes(methodName)) {
                  return `${methodName.toLowerCase()}_callback`;
                }
              }
            }
          }
        }

        return 'closure';
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Go function name');
      return 'anonymous';
    }
  }

  /**
   * Checks if a function has a test signature.
   */
  private hasTestSignature(node: SyntaxNode, _sourceCode: string): boolean {
    try {
      const paramsNode = node.childForFieldName('parameters');
      if (!paramsNode) return false;

      // Test functions have signature func TestXxx(*testing.T)
      return paramsNode.text.includes('*testing.T');
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking Go test signature');
      return false;
    }
  }

  /**
   * Checks if a function has a benchmark signature.
   */
  private hasBenchmarkSignature(node: SyntaxNode, _sourceCode: string): boolean {
    try {
      const paramsNode = node.childForFieldName('parameters');
      if (!paramsNode) return false;

      // Benchmark functions have signature func BenchmarkXxx(*testing.B)
      return paramsNode.text.includes('*testing.B');
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking Go benchmark signature');
      return false;
    }
  }

  /**
   * Extracts the receiver type from a receiver node.
   */
  private extractReceiverType(receiverNode: SyntaxNode, sourceCode: string): string {
    try {
      // Receiver can be in different formats: (t *Type), (t Type), etc.
      const parameterNode = receiverNode.childForFieldName('parameter');
      if (!parameterNode) return 'Unknown';

      const typeNode = parameterNode.childForFieldName('type');
      if (!typeNode) return 'Unknown';

      // Handle pointer receivers
      if (typeNode.type === 'pointer_type') {
        const baseTypeNode = typeNode.childForFieldName('type');
        if (baseTypeNode) {
          return getNodeText(baseTypeNode, sourceCode);
        }
      }

      return getNodeText(typeNode, sourceCode);
    } catch (error) {
      logger.warn({ err: error, nodeType: 'unknown' }, 'Error extracting Go receiver type');
      return 'Unknown';
    }
  }

  /**
   * Checks if a method is an HTTP handler.
   */
  private isHttpHandler(node: SyntaxNode, sourceCode: string): boolean {
    try {
      // HTTP handlers have signature ServeHTTP(http.ResponseWriter, *http.Request)
      const paramsNode = node.childForFieldName('parameters');
      if (!paramsNode) return false;

      const paramsText = getNodeText(paramsNode, sourceCode);
      return paramsText.includes('http.ResponseWriter') && paramsText.includes('*http.Request');
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Go method is HTTP handler');
      return false;
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'type_declaration') {
        const specNode = node.childForFieldName('spec');
        if (specNode && specNode.type === 'type_spec') {
          const nameNode = specNode.childForFieldName('name');
          if (nameNode) {
            return getNodeText(nameNode, sourceCode);
          }
        }
      } else if (node.type === 'type_spec') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return 'AnonymousType';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Go class name');
      return 'AnonymousType';
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'import_spec') {
        const pathNode = node.childForFieldName('path');
        if (pathNode) {
          const path = getNodeText(pathNode, sourceCode);
          return path.replace(/^["']|["']$/g, '');
        }
      } else if (node.type === 'import_declaration') {
        // For single import declarations
        const specNode = node.childForFieldName('spec');
        if (specNode && specNode.type === 'import_spec') {
          const pathNode = specNode.childForFieldName('path');
          if (pathNode) {
            const path = getNodeText(pathNode, sourceCode);
            return path.replace(/^["']|["']$/g, '');
          }
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Go import path');
      return 'unknown';
    }
  }

  /**
   * Extracts imported items from an AST node.
   */
  protected extractImportedItems(node: SyntaxNode, sourceCode: string): ImportedItem[] | undefined {
    try {
      if (node.type === 'import_spec') {
        const nameNode = node.childForFieldName('name');
        const pathNode = node.childForFieldName('path');

        if (pathNode) {
          const path = getNodeText(pathNode, sourceCode).replace(/^["']|["']$/g, '');
          const parts = path.split('/');
          const name = parts[parts.length - 1];

          if (nameNode) {
            // Named import: import alias "package/path"
            return [{
              name: getNodeText(nameNode, sourceCode),
              path: path,
              isDefault: false,
              isNamespace: false,
              nodeText: node.text
            }];
          } else {
            // Regular import: import "package/path"
            return [{
              name: name,
              path: path,
              isDefault: false,
              isNamespace: false,
              nodeText: node.text
            }];
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Go imported items');
      return undefined;
    }
  }

  /**
   * Checks if an import is a default import.
   */
  protected isDefaultImport(node: SyntaxNode, sourceCode: string): boolean | undefined {
    try {
      if (node.type === 'import_spec') {
        const nameNode = node.childForFieldName('name');
        // In Go, a dot import is similar to a default import in other languages
        return nameNode ? getNodeText(nameNode, sourceCode) === '.' : false;
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Go import is default');
      return undefined;
    }
  }

  /**
   * Extracts the import alias from an AST node.
   */
  protected extractImportAlias(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'import_spec') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Go import alias');
      return undefined;
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for Go doc comments
      let prev = node.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment' && prev.text.startsWith('//')) {
        return this.parseGoDocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Go function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for Go doc comments
      let prev = node.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment' && prev.text.startsWith('//')) {
        return this.parseGoDocComment(prev.text);
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Go class comment');
      return undefined;
    }
  }

  /**
   * Parses a Go doc comment into a clean comment.
   */
  private parseGoDocComment(comment: string): string {
    try {
      // Split into lines and remove leading '//' and whitespace
      const lines = comment.split('\n')
        .map(line => line.trim().replace(/^\/\/\s*/, ''));

      // Join lines and return the description
      return lines.join(' ').trim();
    } catch (error) {
      logger.warn({ err: error }, 'Error parsing Go doc comment');
      return comment;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Gin detection
      if (sourceCode.includes('github.com/gin-gonic/gin') ||
          sourceCode.includes('gin.Context') ||
          sourceCode.includes('gin.Engine')) {
        return 'gin';
      }

      // Echo detection
      if (sourceCode.includes('github.com/labstack/echo') ||
          sourceCode.includes('echo.Context') ||
          sourceCode.includes('echo.New()')) {
        return 'echo';
      }

      // Gorilla detection
      if (sourceCode.includes('github.com/gorilla/mux') ||
          sourceCode.includes('mux.Router') ||
          sourceCode.includes('gorilla/websocket')) {
        return 'gorilla';
      }

      // Standard library HTTP detection
      if (sourceCode.includes('net/http') &&
          (sourceCode.includes('http.HandleFunc') ||
           sourceCode.includes('http.Handler') ||
           sourceCode.includes('http.ServeMux'))) {
        return 'net/http';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Go framework');
      return null;
    }
  }
}
