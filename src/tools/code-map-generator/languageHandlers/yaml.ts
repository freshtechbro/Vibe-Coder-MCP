/**
 * YAML/Configuration language handler for the Code-Map Generator tool.
 * This file contains the language handler for YAML and other configuration files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import path from 'path';

/**
 * Language handler for YAML/Configuration.
 * Provides enhanced function name detection for YAML and other configuration files.
 */
export class YamlHandler extends BaseLanguageHandler {
  /**
   * Options for the handler.
   */
  protected options?: { filePath?: string };
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'block_mapping_pair',
      'flow_mapping',
      'block_sequence_item'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'document',
      'block_mapping',
      'flow_mapping'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'block_mapping_pair'
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
      // Handle block mapping pairs (key: value)
      if (node.type === 'block_mapping_pair') {
        const keyNode = node.childForFieldName('key');
        if (keyNode) {
          const key = getNodeText(keyNode, sourceCode);

          // Check for common function-like keys
          if (['run', 'script', 'command', 'exec', 'test', 'build', 'deploy'].includes(key)) {
            return `${key}_command`;
          }

          // Check for CI/CD steps
          if (this.isInCiCdContext(node, sourceCode)) {
            return `step_${key}`;
          }

          // Check for Kubernetes resources
          if (this.isKubernetesResource(node, sourceCode)) {
            const valueNode = node.childForFieldName('value');
            if (valueNode) {
              const nameNode = this.findNameInMapping(valueNode);
              if (nameNode) {
                return `${key}_${getNodeText(nameNode, sourceCode)}`;
              }
            }
            return `${key}_resource`;
          }

          return key;
        }
      }

      // Handle block sequence items (- item)
      if (node.type === 'block_sequence_item') {
        // Check if this is a step in a sequence
        if (this.isInCiCdContext(node, sourceCode)) {
          // Try to find a name or key property
          const valueNode = node.childForFieldName('value');
          if (valueNode) {
            if (valueNode.type === 'block_mapping') {
              const nameNode = this.findNameInMapping(valueNode);
              if (nameNode) {
                return `step_${getNodeText(nameNode, sourceCode)}`;
              }
            }
          }

          return 'sequence_step';
        }

        return 'sequence_item';
      }

      return 'configuration_item';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting YAML/Configuration function name');
      return 'configuration_item';
    }
  }

  /**
   * Checks if a node is in a CI/CD context.
   */
  private isInCiCdContext(node: SyntaxNode, sourceCode: string): boolean {
    try {
      // Check if we're in a CI/CD file based on filename
      if (this.options?.filePath) {
        const filename = path.basename(this.options.filePath).toLowerCase();
        if (filename.includes('workflow') ||
            filename.includes('pipeline') ||
            filename.includes('ci') ||
            filename.includes('cd') ||
            filename.includes('travis') ||
            filename.includes('jenkins') ||
            filename.includes('gitlab') ||
            filename.includes('github') ||
            filename.includes('azure-pipelines')) {
          return true;
        }
      }

      // Check for CI/CD keywords in the document
      let current = node;
      while (current.parent) {
        current = current.parent;

        if (current.type === 'block_mapping') {
          for (let i = 0; i < current.childCount; i++) {
            const child = current.child(i);
            if (child?.type === 'block_mapping_pair') {
              const keyNode = child.childForFieldName('key');
              if (keyNode) {
                const key = getNodeText(keyNode, sourceCode);
                if (['jobs', 'stages', 'steps', 'tasks', 'pipeline', 'workflow'].includes(key)) {
                  return true;
                }
              }
            }
          }
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if YAML node is in CI/CD context');
      return false;
    }
  }

  /**
   * Checks if a node is a Kubernetes resource.
   */
  private isKubernetesResource(node: SyntaxNode, sourceCode: string): boolean {
    try {
      // Check if we're in a Kubernetes file based on filename
      if (this.options?.filePath) {
        const filename = path.basename(this.options.filePath).toLowerCase();
        if (filename.includes('kube') ||
            filename.includes('k8s') ||
            filename.endsWith('.yaml') ||
            filename.endsWith('.yml')) {

          // Look for kind and apiVersion fields
          let current = node;
          while (current.parent) {
            current = current.parent;

            if (current.type === 'block_mapping') {
              let hasKind = false;
              let hasApiVersion = false;

              for (let i = 0; i < current.childCount; i++) {
                const child = current.child(i);
                if (child?.type === 'block_mapping_pair') {
                  const keyNode = child.childForFieldName('key');
                  if (keyNode) {
                    const key = getNodeText(keyNode, sourceCode);
                    if (key === 'kind') hasKind = true;
                    if (key === 'apiVersion') hasApiVersion = true;
                  }
                }
              }

              if (hasKind && hasApiVersion) {
                return true;
              }
            }
          }
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if YAML node is a Kubernetes resource');
      return false;
    }
  }

  /**
   * Finds a name property in a mapping.
   */
  private findNameInMapping(node: SyntaxNode): SyntaxNode | null {
    try {
      if (node.type === 'block_mapping') {
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child?.type === 'block_mapping_pair') {
            const keyNode = child.childForFieldName('key');
            if (keyNode && ['name', 'id', 'key', 'title'].includes(keyNode.text)) {
              return child.childForFieldName('value');
            }
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error finding name in YAML mapping');
      return null;
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'document') {
        // For Kubernetes resources, use kind as the class name
        const contentNode = node.childForFieldName('content');
        if (contentNode?.type === 'block_mapping') {
          const mapping = contentNode;
          let kind = null;

          for (let i = 0; i < mapping.childCount; i++) {
            const child = mapping.child(i);
            if (child?.type === 'block_mapping_pair') {
              const keyNode = child.childForFieldName('key');
              if (keyNode && getNodeText(keyNode, sourceCode) === 'kind') {
                const valueNode = child.childForFieldName('value');
                if (valueNode) {
                  kind = getNodeText(valueNode, sourceCode);
                  break;
                }
              }
            }
          }

          if (kind) {
            return `K8s_${kind}`;
          }
        }

        // For CI/CD files, use the filename as the class name
        if (this.options?.filePath) {
          const filename = path.basename(this.options.filePath, path.extname(this.options.filePath));
          if (filename.includes('workflow') ||
              filename.includes('pipeline') ||
              filename.includes('ci') ||
              filename.includes('cd')) {
            return `CI_${filename}`;
          }
        }

        // Default to the filename without extension
        if (this.options?.filePath) {
          return path.basename(this.options.filePath, path.extname(this.options.filePath));
        }
      } else if (node.type === 'block_mapping' || node.type === 'flow_mapping') {
        // Try to find a name or kind property
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child?.type === 'block_mapping_pair') {
            const keyNode = child.childForFieldName('key');
            if (keyNode) {
              const key = getNodeText(keyNode, sourceCode);
              if (key === 'kind') {
                const valueNode = child.childForFieldName('value');
                if (valueNode) {
                  return getNodeText(valueNode, sourceCode);
                }
              } else if (key === 'name') {
                const valueNode = child.childForFieldName('value');
                if (valueNode) {
                  return `Config_${getNodeText(valueNode, sourceCode)}`;
                }
              }
            }
          }
        }
      }

      return 'Configuration';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting YAML/Configuration class name');
      return 'Configuration';
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      // Handle imports in YAML (e.g., include, import, $ref)
      if (node.type === 'block_mapping_pair') {
        const keyNode = node.childForFieldName('key');
        if (keyNode) {
          const key = getNodeText(keyNode, sourceCode);

          if (key === 'include' || key === 'import' || key === '$ref' || key === 'extends') {
            const valueNode = node.childForFieldName('value');
            if (valueNode) {
              return getNodeText(valueNode, sourceCode);
            }
          }
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting YAML/Configuration import path');
      return 'unknown';
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
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
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting YAML/Configuration function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for comments at the beginning of the document
      if (node.type === 'document') {
        let firstChild = node.firstChild;

        // Skip directives
        while (firstChild && firstChild.type === 'directive') {
          firstChild = firstChild.nextNamedSibling;
        }

        // Check if the first non-directive node is a comment
        if (firstChild && firstChild.type === 'comment') {
          // Extract the comment text
          const commentText = getNodeText(firstChild, sourceCode);

          // Remove comment markers and whitespace
          return commentText
            .replace(/^#\s*/mg, '')
            .trim();
        }
      } else {
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
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting YAML/Configuration class comment');
      return undefined;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Kubernetes detection
      if (sourceCode.includes('apiVersion:') &&
          sourceCode.includes('kind:') &&
          (sourceCode.includes('metadata:') || sourceCode.includes('spec:'))) {
        return 'kubernetes';
      }

      // GitHub Actions detection
      if (sourceCode.includes('name:') &&
          sourceCode.includes('on:') &&
          sourceCode.includes('jobs:')) {
        return 'github-actions';
      }

      // Docker Compose detection
      if (sourceCode.includes('version:') &&
          sourceCode.includes('services:') &&
          (sourceCode.includes('image:') || sourceCode.includes('build:'))) {
        return 'docker-compose';
      }

      // GitLab CI detection
      if (sourceCode.includes('stages:') &&
          (sourceCode.includes('script:') || sourceCode.includes('image:'))) {
        return 'gitlab-ci';
      }

      // Travis CI detection
      if (sourceCode.includes('language:') &&
          (sourceCode.includes('script:') || sourceCode.includes('before_script:'))) {
        return 'travis-ci';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting YAML/Configuration framework');
      return null;
    }
  }
}
