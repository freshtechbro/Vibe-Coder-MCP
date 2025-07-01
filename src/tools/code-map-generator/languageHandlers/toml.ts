/**
 * TOML language handler for the Code-Map Generator tool.
 * This file contains the language handler for TOML (Tom's Obvious Minimal Language) files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import path from 'path';

/**
 * Language handler for TOML.
 * Provides enhanced function name detection for TOML configuration files.
 */
export class TomlHandler extends BaseLanguageHandler {
  /**
   * Options for the handler.
   */
  protected options?: { filePath?: string };
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'pair',
      'table',
      'array_table',
      'inline_table'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'document',
      'table',
      'array_table'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'pair'
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
      // Handle key-value pairs
      if (node.type === 'pair') {
        const keyNode = node.childForFieldName('key');
        if (keyNode) {
          const key = getNodeText(keyNode, sourceCode);

          // Check for common function-like keys
          if (['run', 'script', 'command', 'exec', 'test', 'build', 'deploy'].includes(key)) {
            return `${key}_command`;
          }

          // Check for Cargo.toml dependencies
          if (this.isInDependenciesSection(node, sourceCode)) {
            return `dependency_${key}`;
          }

          // Check for package metadata
          if (this.isInPackageSection(node, sourceCode)) {
            return `package_${key}`;
          }

          return key;
        }
      }

      // Handle tables
      if (node.type === 'table') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for common table names
          if (['dependencies', 'dev-dependencies', 'build-dependencies'].includes(name)) {
            return `${name}_section`;
          } else if (name === 'package') {
            return 'package_metadata';
          } else if (name === 'profile') {
            return 'build_profile';
          } else if (name === 'features') {
            return 'feature_flags';
          } else if (name === 'workspace') {
            return 'workspace_config';
          } else if (name === 'bin') {
            return 'binary_target';
          } else if (name === 'lib') {
            return 'library_target';
          }

          return `table_${name}`;
        }
      }

      // Handle array tables
      if (node.type === 'array_table') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);
          return `array_table_${name}`;
        }
      }

      // Handle inline tables
      if (node.type === 'inline_table') {
        // Check if this inline table is a value in a key-value pair
        if (node.parent?.type === 'pair') {
          const keyNode = node.parent.childForFieldName('key');
          if (keyNode) {
            const key = getNodeText(keyNode, sourceCode);
            return `${key}_table`;
          }
        }

        return 'inline_table';
      }

      return 'toml_element';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting TOML function name');
      return 'toml_element';
    }
  }

  /**
   * Checks if a node is in a dependencies section.
   */
  private isInDependenciesSection(node: SyntaxNode, sourceCode: string): boolean {
    try {
      let current = node;
      while (current.parent) {
        current = current.parent;

        if (current.type === 'table') {
          const nameNode = current.childForFieldName('name');
          if (nameNode) {
            const name = getNodeText(nameNode, sourceCode);
            if (['dependencies', 'dev-dependencies', 'build-dependencies'].includes(name)) {
              return true;
            }
          }
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if TOML node is in dependencies section');
      return false;
    }
  }

  /**
   * Checks if a node is in a package section.
   */
  private isInPackageSection(node: SyntaxNode, sourceCode: string): boolean {
    try {
      let current = node;
      while (current.parent) {
        current = current.parent;

        if (current.type === 'table') {
          const nameNode = current.childForFieldName('name');
          if (nameNode) {
            const name = getNodeText(nameNode, sourceCode);
            if (name === 'package') {
              return true;
            }
          }
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if TOML node is in package section');
      return false;
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'document') {
        // For Cargo.toml files
        if (this.isCargoToml()) {
          // Try to get the package name
          const packageName = this.extractPackageName(node, sourceCode);
          if (packageName) {
            return `Cargo_${packageName}`;
          }

          return 'Cargo_Project';
        }

        // For pyproject.toml files
        if (this.isPyprojectToml()) {
          // Try to get the project name
          const projectName = this.extractPyprojectName(node, sourceCode);
          if (projectName) {
            return `Python_${projectName}`;
          }

          return 'Python_Project';
        }

        // Default to the filename without extension
        if (this.options?.filePath) {
          return `TOML_${path.basename(this.options.filePath, path.extname(this.options.filePath))}`;
        }
      } else if (node.type === 'table') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);
          return `Table_${name}`;
        }
      } else if (node.type === 'array_table') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);
          return `ArrayTable_${name}`;
        }
      }

      return 'TOML_Config';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting TOML class name');
      return 'TOML_Config';
    }
  }

  /**
   * Checks if the current file is a Cargo.toml file.
   */
  private isCargoToml(): boolean {
    if (this.options?.filePath) {
      const filename = path.basename(this.options.filePath).toLowerCase();
      return filename === 'cargo.toml';
    }

    return false;
  }

  /**
   * Checks if the current file is a pyproject.toml file.
   */
  private isPyprojectToml(): boolean {
    if (this.options?.filePath) {
      const filename = path.basename(this.options.filePath).toLowerCase();
      return filename === 'pyproject.toml';
    }

    return false;
  }

  /**
   * Extracts the package name from a Cargo.toml file.
   */
  private extractPackageName(node: SyntaxNode, sourceCode: string): string | null {
    try {
      // Find the package table
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child?.type === 'table') {
          const nameNode = child.childForFieldName('name');
          if (nameNode && getNodeText(nameNode, sourceCode) === 'package') {
            // Look for the name key in the package table
            for (let j = 0; j < child.childCount; j++) {
              const packageChild = child.child(j);
              if (packageChild?.type === 'pair') {
                const keyNode = packageChild.childForFieldName('key');
                if (keyNode && getNodeText(keyNode, sourceCode) === 'name') {
                  const valueNode = packageChild.childForFieldName('value');
                  if (valueNode) {
                    return getNodeText(valueNode, sourceCode).replace(/^["']|["']$/g, '');
                  }
                }
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Cargo.toml package name');
      return null;
    }
  }

  /**
   * Extracts the project name from a pyproject.toml file.
   */
  private extractPyprojectName(node: SyntaxNode, sourceCode: string): string | null {
    try {
      // Find the tool.poetry table or project table
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);

        // Check for [tool.poetry] table
        if (child?.type === 'table') {
          const nameNode = child.childForFieldName('name');
          if (nameNode && getNodeText(nameNode, sourceCode) === 'tool.poetry') {
            // Look for the name key in the tool.poetry table
            for (let j = 0; j < child.childCount; j++) {
              const poetryChild = child.child(j);
              if (poetryChild?.type === 'pair') {
                const keyNode = poetryChild.childForFieldName('key');
                if (keyNode && getNodeText(keyNode, sourceCode) === 'name') {
                  const valueNode = poetryChild.childForFieldName('value');
                  if (valueNode) {
                    return getNodeText(valueNode, sourceCode).replace(/^["']|["']$/g, '');
                  }
                }
              }
            }
          }

          // Check for [project] table
          if (nameNode && getNodeText(nameNode, sourceCode) === 'project') {
            // Look for the name key in the project table
            for (let j = 0; j < child.childCount; j++) {
              const projectChild = child.child(j);
              if (projectChild?.type === 'pair') {
                const keyNode = projectChild.childForFieldName('key');
                if (keyNode && getNodeText(keyNode, sourceCode) === 'name') {
                  const valueNode = projectChild.childForFieldName('value');
                  if (valueNode) {
                    return getNodeText(valueNode, sourceCode).replace(/^["']|["']$/g, '');
                  }
                }
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting pyproject.toml project name');
      return null;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      // Handle imports in TOML (e.g., path, include, import)
      if (node.type === 'pair') {
        const keyNode = node.childForFieldName('key');
        if (keyNode) {
          const key = getNodeText(keyNode, sourceCode);

          if (key === 'path' || key === 'include' || key === 'import' || key === 'from') {
            const valueNode = node.childForFieldName('value');
            if (valueNode) {
              return getNodeText(valueNode, sourceCode).replace(/^["']|["']$/g, '');
            }
          }
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting TOML import path');
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
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting TOML function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for comments at the beginning of the document or before a table
      if (node.type === 'document') {
        const firstChild = node.firstChild;

        // Check if the first node is a comment
        if (firstChild && firstChild.type === 'comment') {
          // Extract the comment text
          const commentText = getNodeText(firstChild, sourceCode);

          // Remove comment markers and whitespace
          return commentText
            .replace(/^#\s*/mg, '')
            .trim();
        }
      } else if (node.type === 'table' || node.type === 'array_table') {
        // Look for comments before the table
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
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting TOML class comment');
      return undefined;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Cargo (Rust) detection
      if (sourceCode.includes('[package]') &&
          (sourceCode.includes('[dependencies]') || sourceCode.includes('version ='))) {
        return 'cargo';
      }

      // Poetry (Python) detection
      if (sourceCode.includes('[tool.poetry]') ||
          sourceCode.includes('poetry.dependencies')) {
        return 'poetry';
      }

      // PEP 621 (Python) detection
      if (sourceCode.includes('[project]') &&
          sourceCode.includes('[build-system]')) {
        return 'pep621';
      }

      // Deno detection
      if (sourceCode.includes('[deno]') ||
          sourceCode.includes('deno.json')) {
        return 'deno';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting TOML framework');
      return null;
    }
  }
}
