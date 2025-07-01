/**
 * JSON language handler for the Code-Map Generator tool.
 * This file contains the language handler for JSON files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import path from 'path';

/**
 * Language handler for JSON.
 * Provides enhanced function name detection for JSON files.
 */
export class JsonHandler extends BaseLanguageHandler {
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
      'object',
      'array'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'document',
      'object'
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
          const key = getNodeText(keyNode, sourceCode).replace(/^["']|["']$/g, '');

          // Check for common function-like keys
          if (['function', 'handler', 'callback', 'run', 'script', 'command', 'exec', 'test'].includes(key)) {
            return `${key}_function`;
          }

          // Check for API endpoints in OpenAPI/Swagger
          if (this.isInOpenApiContext(node, sourceCode)) {
            const valueNode = node.childForFieldName('value');
            if (valueNode && valueNode.type === 'object') {
              // Look for HTTP methods
              for (let i = 0; i < valueNode.childCount; i++) {
                const child = valueNode.child(i);
                if (child?.type === 'pair') {
                  const methodKeyNode = child.childForFieldName('key');
                  if (methodKeyNode) {
                    const method = getNodeText(methodKeyNode, sourceCode).replace(/^["']|["']$/g, '');
                    if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method.toLowerCase())) {
                      return `${method.toUpperCase()}_${key}`;
                    }
                  }
                }
              }
            }
            return `endpoint_${key}`;
          }

          // Check for AWS CloudFormation/SAM resources
          if (this.isInCloudFormationContext(node, sourceCode)) {
            if (key === 'Type') {
              const valueNode = node.childForFieldName('value');
              if (valueNode) {
                const resourceType = getNodeText(valueNode, sourceCode).replace(/^["']|["']$/g, '');
                return `resource_${resourceType.split('::').pop()}`;
              }
            }

            if (key === 'Properties') {
              return 'resource_properties';
            }
          }

          // Check for package.json scripts
          if (this.isInPackageJsonContext(node, sourceCode) && key === 'scripts') {
            return 'npm_scripts';
          }

          // Check for tsconfig.json compiler options
          if (this.isInTsConfigContext(node, sourceCode) && key === 'compilerOptions') {
            return 'compiler_options';
          }

          return key;
        }
      }

      // Handle arrays
      if (node.type === 'array') {
        // Check if this array is a value in a key-value pair
        if (node.parent?.type === 'pair') {
          const keyNode = node.parent.childForFieldName('key');
          if (keyNode) {
            const key = getNodeText(keyNode, sourceCode).replace(/^["']|["']$/g, '');
            return `${key}_array`;
          }
        }

        return 'array';
      }

      // Handle objects
      if (node.type === 'object') {
        // Check if this object is a value in a key-value pair
        if (node.parent?.type === 'pair') {
          const keyNode = node.parent.childForFieldName('key');
          if (keyNode) {
            const key = getNodeText(keyNode, sourceCode).replace(/^["']|["']$/g, '');
            return `${key}_object`;
          }
        }

        return 'object';
      }

      return 'json_element';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting JSON function name');
      return 'json_element';
    }
  }

  /**
   * Checks if a node is in an OpenAPI/Swagger context.
   */
  private isInOpenApiContext(node: SyntaxNode, sourceCode: string): boolean {
    try {
      // Check if we're in an OpenAPI file based on filename
      if (this.options?.filePath) {
        const filename = path.basename(this.options.filePath).toLowerCase();
        if (filename.includes('swagger') ||
            filename.includes('openapi') ||
            filename.includes('api')) {
          return true;
        }
      }

      // Check for OpenAPI keywords in the document
      let current = node;
      while (current.parent) {
        current = current.parent;

        if (current.type === 'object') {
          for (let i = 0; i < current.childCount; i++) {
            const child = current.child(i);
            if (child?.type === 'pair') {
              const keyNode = child.childForFieldName('key');
              if (keyNode) {
                const key = getNodeText(keyNode, sourceCode).replace(/^["']|["']$/g, '');
                if (['swagger', 'openapi', 'paths', 'components', 'info'].includes(key)) {
                  return true;
                }
              }
            }
          }
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if JSON node is in OpenAPI context');
      return false;
    }
  }

  /**
   * Checks if a node is in a CloudFormation/SAM context.
   */
  private isInCloudFormationContext(node: SyntaxNode, sourceCode: string): boolean {
    try {
      // Check if we're in a CloudFormation file based on filename
      if (this.options?.filePath) {
        const filename = path.basename(this.options.filePath).toLowerCase();
        if (filename.includes('cloudformation') ||
            filename.includes('template') ||
            filename.includes('stack') ||
            filename.includes('sam')) {
          return true;
        }
      }

      // Check for CloudFormation keywords in the document
      let current = node;
      while (current.parent) {
        current = current.parent;

        if (current.type === 'object') {
          for (let i = 0; i < current.childCount; i++) {
            const child = current.child(i);
            if (child?.type === 'pair') {
              const keyNode = child.childForFieldName('key');
              if (keyNode) {
                const key = getNodeText(keyNode, sourceCode).replace(/^["']|["']$/g, '');
                if (['AWSTemplateFormatVersion', 'Resources', 'Outputs', 'Parameters'].includes(key)) {
                  return true;
                }
              }
            }
          }
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if JSON node is in CloudFormation context');
      return false;
    }
  }

  /**
   * Checks if a node is in a package.json context.
   */
  private isInPackageJsonContext(node: SyntaxNode, sourceCode: string): boolean {
    try {
      // Check if we're in a package.json file based on filename
      if (this.options?.filePath) {
        const filename = path.basename(this.options.filePath).toLowerCase();
        if (filename === 'package.json') {
          return true;
        }
      }

      // Check for package.json keywords in the document
      let current = node;
      while (current.parent) {
        current = current.parent;

        if (current.type === 'object') {
          let hasName = false;
          let hasVersion = false;
          let hasDependencies = false;

          for (let i = 0; i < current.childCount; i++) {
            const child = current.child(i);
            if (child?.type === 'pair') {
              const keyNode = child.childForFieldName('key');
              if (keyNode) {
                const key = getNodeText(keyNode, sourceCode).replace(/^["']|["']$/g, '');
                if (key === 'name') hasName = true;
                if (key === 'version') hasVersion = true;
                if (key === 'dependencies' || key === 'devDependencies') hasDependencies = true;
              }
            }
          }

          if (hasName && hasVersion && hasDependencies) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if JSON node is in package.json context');
      return false;
    }
  }

  /**
   * Checks if a node is in a tsconfig.json context.
   */
  private isInTsConfigContext(node: SyntaxNode, sourceCode: string): boolean {
    try {
      // Check if we're in a tsconfig.json file based on filename
      if (this.options?.filePath) {
        const filename = path.basename(this.options.filePath).toLowerCase();
        if (filename === 'tsconfig.json' || filename.startsWith('tsconfig.')) {
          return true;
        }
      }

      // Check for tsconfig.json keywords in the document
      let current = node;
      while (current.parent) {
        current = current.parent;

        if (current.type === 'object') {
          for (let i = 0; i < current.childCount; i++) {
            const child = current.child(i);
            if (child?.type === 'pair') {
              const keyNode = child.childForFieldName('key');
              if (keyNode) {
                const key = getNodeText(keyNode, sourceCode).replace(/^["']|["']$/g, '');
                if (key === 'compilerOptions') {
                  return true;
                }
              }
            }
          }
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if JSON node is in tsconfig.json context');
      return false;
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'document') {
        // For OpenAPI/Swagger documents
        if (this.isInOpenApiContext(node, sourceCode)) {
          return 'OpenAPI_Document';
        }

        // For CloudFormation templates
        if (this.isInCloudFormationContext(node, sourceCode)) {
          return 'CloudFormation_Template';
        }

        // For package.json
        if (this.isInPackageJsonContext(node, sourceCode)) {
          // Try to get the package name
          const rootObject = node.firstChild;
          if (rootObject?.type === 'object') {
            for (let i = 0; i < rootObject.childCount; i++) {
              const child = rootObject.child(i);
              if (child?.type === 'pair') {
                const keyNode = child.childForFieldName('key');
                if (keyNode && getNodeText(keyNode, sourceCode).replace(/^["']|["']$/g, '') === 'name') {
                  const valueNode = child.childForFieldName('value');
                  if (valueNode) {
                    return `Package_${getNodeText(valueNode, sourceCode).replace(/^["']|["']$/g, '')}`;
                  }
                }
              }
            }
          }

          return 'Package_JSON';
        }

        // For tsconfig.json
        if (this.isInTsConfigContext(node, sourceCode)) {
          return 'TSConfig';
        }

        // Default to the filename without extension
        if (this.options?.filePath) {
          return `JSON_${path.basename(this.options.filePath, path.extname(this.options.filePath))}`;
        }
      } else if (node.type === 'object') {
        // Check if this object is a value in a key-value pair
        if (node.parent?.type === 'pair') {
          const keyNode = node.parent.childForFieldName('key');
          if (keyNode) {
            const key = getNodeText(keyNode, sourceCode).replace(/^["']|["']$/g, '');
            return `Object_${key}`;
          }
        }
      }

      return 'JSON_Object';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting JSON class name');
      return 'JSON_Object';
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      // Handle imports in JSON (e.g., $ref, import, include)
      if (node.type === 'pair') {
        const keyNode = node.childForFieldName('key');
        if (keyNode) {
          const key = getNodeText(keyNode, sourceCode).replace(/^["']|["']$/g, '');

          if (key === '$ref' || key === 'import' || key === 'include' || key === 'extends') {
            const valueNode = node.childForFieldName('value');
            if (valueNode) {
              return getNodeText(valueNode, sourceCode).replace(/^["']|["']$/g, '');
            }
          }
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting JSON import path');
      return 'unknown';
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for description fields in OpenAPI
      if (this.isInOpenApiContext(node, sourceCode) && node.type === 'pair') {
        // Check if there's a description field
        const parent = node.parent;
        if (parent) {
          for (let i = 0; i < parent.childCount; i++) {
            const child = parent.child(i);
            if (child?.type === 'pair') {
              const keyNode = child.childForFieldName('key');
              if (keyNode && getNodeText(keyNode, sourceCode).replace(/^["']|["']$/g, '') === 'description') {
                const valueNode = child.childForFieldName('value');
                if (valueNode) {
                  return getNodeText(valueNode, sourceCode).replace(/^["']|["']$/g, '');
                }
              }
            }
          }
        }
      }

      // Look for comments before the node (not typically supported in JSON)
      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting JSON function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for description or info fields in OpenAPI
      if (this.isInOpenApiContext(node, sourceCode) && node.type === 'document') {
        const rootObject = node.firstChild;
        if (rootObject?.type === 'object') {
          // Look for info object
          for (let i = 0; i < rootObject.childCount; i++) {
            const child = rootObject.child(i);
            if (child?.type === 'pair') {
              const keyNode = child.childForFieldName('key');
              if (keyNode && getNodeText(keyNode, sourceCode).replace(/^["']|["']$/g, '') === 'info') {
                const valueNode = child.childForFieldName('value');
                if (valueNode && valueNode.type === 'object') {
                  // Look for description in info object
                  for (let j = 0; j < valueNode.childCount; j++) {
                    const infoChild = valueNode.child(j);
                    if (infoChild?.type === 'pair') {
                      const infoKeyNode = infoChild.childForFieldName('key');
                      if (infoKeyNode && getNodeText(infoKeyNode, sourceCode).replace(/^["']|["']$/g, '') === 'description') {
                        const infoValueNode = infoChild.childForFieldName('value');
                        if (infoValueNode) {
                          return getNodeText(infoValueNode, sourceCode).replace(/^["']|["']$/g, '');
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Look for description in package.json
      if (this.isInPackageJsonContext(node, sourceCode) && node.type === 'document') {
        const rootObject = node.firstChild;
        if (rootObject?.type === 'object') {
          for (let i = 0; i < rootObject.childCount; i++) {
            const child = rootObject.child(i);
            if (child?.type === 'pair') {
              const keyNode = child.childForFieldName('key');
              if (keyNode && getNodeText(keyNode, sourceCode).replace(/^["']|["']$/g, '') === 'description') {
                const valueNode = child.childForFieldName('value');
                if (valueNode) {
                  return getNodeText(valueNode, sourceCode).replace(/^["']|["']$/g, '');
                }
              }
            }
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting JSON class comment');
      return undefined;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // OpenAPI/Swagger detection
      if ((sourceCode.includes('"swagger"') || sourceCode.includes('"openapi"')) &&
          sourceCode.includes('"paths"')) {
        return 'openapi';
      }

      // AWS CloudFormation detection
      if (sourceCode.includes('"AWSTemplateFormatVersion"') ||
          (sourceCode.includes('"Resources"') && sourceCode.includes('"Type"'))) {
        return 'cloudformation';
      }

      // package.json detection
      if (sourceCode.includes('"name"') &&
          sourceCode.includes('"version"') &&
          (sourceCode.includes('"dependencies"') || sourceCode.includes('"devDependencies"'))) {
        return 'npm';
      }

      // tsconfig.json detection
      if (sourceCode.includes('"compilerOptions"') &&
          (sourceCode.includes('"target"') || sourceCode.includes('"module"'))) {
        return 'typescript';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting JSON framework');
      return null;
    }
  }
}
