/**
 * Bash/Shell language handler for the Code-Map Generator tool.
 * This file contains the language handler for Bash and Shell script files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';

/**
 * Language handler for Bash/Shell.
 * Provides enhanced function name detection for Bash and Shell script files.
 */
export class BashHandler extends BaseLanguageHandler {
  /**
   * Options for the handler.
   */
  protected options?: { filePath?: string };
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_definition',
      'declaration_command'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      // Bash doesn't have classes in the traditional sense
      // We'll use file-level detection instead
      'program'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'source_command',
      'command'
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
          if (name.startsWith('test_')) {
            return name;
          }

          // Check for hook functions
          if (this.isHookFunction(name)) {
            return `hook_${name}`;
          }

          return name;
        }
      }

      // Handle declaration commands (alternative function syntax)
      if (node.type === 'declaration_command') {
        // Check if it's a function declaration
        const commandNode = node.childForFieldName('command');
        if (commandNode?.text === 'function') {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const name = getNodeText(nameNode, sourceCode);

            // Check for test functions
            if (name.startsWith('test_')) {
              return name;
            }

            // Check for hook functions
            if (this.isHookFunction(name)) {
              return `hook_${name}`;
            }

            return name;
          }
        }
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Bash/Shell function name');
      return 'anonymous';
    }
  }

  /**
   * Checks if a function name is a hook function.
   */
  private isHookFunction(name: string): boolean {
    const hookFunctions = [
      'pre_install',
      'post_install',
      'pre_upgrade',
      'post_upgrade',
      'pre_remove',
      'post_remove',
      'setup',
      'teardown',
      'before_script',
      'after_script'
    ];

    return hookFunctions.includes(name);
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, _sourceCode: string): string {
    try {
      // For shell scripts, use the filename as the "class" name
      if (node.type === 'program' && this.options?.filePath) {
        const filename = this.options.filePath.split('/').pop() || 'script';
        return filename.replace(/\.[^.]+$/, ''); // Remove extension
      }

      return 'Script';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Bash/Shell class name');
      return 'Script';
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      // Handle source commands (. or source)
      if (node.type === 'source_command') {
        const pathNode = node.childForFieldName('path');
        if (pathNode) {
          return getNodeText(pathNode, sourceCode);
        }
      } else if (node.type === 'command') {
        // Check if it's a source or dot command
        const nameNode = node.childForFieldName('name');
        if (nameNode && (nameNode.text === 'source' || nameNode.text === '.')) {
          const argumentNode = node.childForFieldName('argument');
          if (argumentNode) {
            return getNodeText(argumentNode, sourceCode);
          }
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Bash/Shell import path');
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
          .replace(/^#\s*/mg, '')
          .trim();
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Bash/Shell function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'program') {
        // Look for a shebang line
        const firstChild = node.firstChild;
        if (firstChild?.type === 'shebang') {
          return `Shell: ${getNodeText(firstChild, sourceCode)}`;
        }

        // Look for a comment block at the top of the file
        let commentBlock = '';
        let current = node.firstChild;

        // Skip shebang if present
        if (current?.type === 'shebang') {
          current = current.nextNamedSibling;
        }

        // Collect consecutive comments at the beginning
        while (current && current.type === 'comment') {
          commentBlock += getNodeText(current, sourceCode).replace(/^#\s*/mg, '') + '\n';
          current = current.nextNamedSibling;
        }

        if (commentBlock) {
          return commentBlock.trim();
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Bash/Shell class comment');
      return undefined;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Docker detection
      if (sourceCode.includes('docker ') ||
          sourceCode.includes('Dockerfile') ||
          sourceCode.includes('docker-compose')) {
        return 'docker';
      }

      // Ansible detection
      if (sourceCode.includes('ansible-playbook') ||
          sourceCode.includes('ansible-galaxy') ||
          sourceCode.includes('ansible ')) {
        return 'ansible';
      }

      // Kubernetes detection
      if (sourceCode.includes('kubectl ') ||
          sourceCode.includes('kubelet') ||
          sourceCode.includes('kubernetes')) {
        return 'kubernetes';
      }

      // AWS CLI detection
      if (sourceCode.includes('aws ') ||
          sourceCode.includes('AWS_') ||
          sourceCode.includes('aws-cli')) {
        return 'aws';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Bash/Shell framework');
      return null;
    }
  }
}
