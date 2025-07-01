/**
 * Vue language handler for the Code-Map Generator tool.
 * This file contains the language handler for Vue single-file components.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import path from 'path';

/**
 * Language handler for Vue.
 * Provides enhanced function name detection for Vue single-file components.
 */
export class VueHandler extends BaseLanguageHandler {
  /**
   * Options for the handler.
   */
  protected options?: { filePath?: string };
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'script_element',
      'element',
      'method_definition',
      'function_declaration',
      'arrow_function',
      'property'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'document',
      'script_element',
      'template_element',
      'style_element'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'import_statement',
      'import_declaration',
      'element'
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
      // Handle script elements
      if (node.type === 'script_element') {
        return 'script_section';
      }

      // Handle template elements
      if (node.type === 'element' && this.isTemplateElement(node, sourceCode)) {
        return 'template_section';
      }

      // Handle style elements
      if (node.type === 'element' && this.isStyleElement(node, sourceCode)) {
        return 'style_section';
      }

      // Handle method definitions in script section
      if (node.type === 'method_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for Vue lifecycle hooks
          if (this.isVueLifecycleHook(name)) {
            return `lifecycle_${name}`;
          }

          // Check for Vue computed properties
          if (this.isInComputedSection(node, sourceCode)) {
            return `computed_${name}`;
          }

          // Check for Vue watchers
          if (this.isInWatchSection(node, sourceCode)) {
            return `watch_${name}`;
          }

          // Check for Vue methods
          if (this.isInMethodsSection(node, sourceCode)) {
            return `method_${name}`;
          }

          return name;
        }
      }

      // Handle function declarations
      if (node.type === 'function_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      // Handle arrow functions
      if (node.type === 'arrow_function') {
        // Check if assigned to a property
        if (node.parent?.type === 'pair') {
          const keyNode = node.parent.childForFieldName('key');
          if (keyNode) {
            const key = getNodeText(keyNode, sourceCode);

            // Check for Vue lifecycle hooks
            if (this.isVueLifecycleHook(key)) {
              return `lifecycle_${key}`;
            }

            // Check for Vue computed properties
            if (this.isInComputedSection(node.parent, sourceCode)) {
              return `computed_${key}`;
            }

            // Check for Vue watchers
            if (this.isInWatchSection(node.parent, sourceCode)) {
              return `watch_${key}`;
            }

            // Check for Vue methods
            if (this.isInMethodsSection(node.parent, sourceCode)) {
              return `method_${key}`;
            }

            return key;
          }
        }

        return 'arrow_function';
      }

      // Handle properties (for Vue options API)
      if (node.type === 'property') {
        const keyNode = node.childForFieldName('key');
        if (keyNode) {
          const key = getNodeText(keyNode, sourceCode);

          // Check for Vue special properties
          if (['data', 'computed', 'methods', 'watch', 'props', 'components'].includes(key)) {
            return `vue_${key}`;
          }

          return key;
        }
      }

      return 'vue_element';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Vue function name');
      return 'vue_element';
    }
  }

  /**
   * Checks if a node is a template element.
   */
  private isTemplateElement(node: SyntaxNode, sourceCode: string): boolean {
    try {
      const tagNameNode = node.childForFieldName('tag_name');
      return tagNameNode ? getNodeText(tagNameNode, sourceCode) === 'template' : false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if node is a template element');
      return false;
    }
  }

  /**
   * Checks if a node is a style element.
   */
  private isStyleElement(node: SyntaxNode, sourceCode: string): boolean {
    try {
      const tagNameNode = node.childForFieldName('tag_name');
      return tagNameNode ? getNodeText(tagNameNode, sourceCode) === 'style' : false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if node is a style element');
      return false;
    }
  }

  /**
   * Checks if a name is a Vue lifecycle hook.
   */
  private isVueLifecycleHook(name: string): boolean {
    const lifecycleHooks = [
      'beforeCreate',
      'created',
      'beforeMount',
      'mounted',
      'beforeUpdate',
      'updated',
      'activated',
      'deactivated',
      'beforeDestroy',
      'destroyed',
      'beforeUnmount',
      'unmounted',
      'errorCaptured',
      'renderTracked',
      'renderTriggered',
      'serverPrefetch'
    ];

    return lifecycleHooks.includes(name);
  }

  /**
   * Checks if a node is in the computed section.
   */
  private isInComputedSection(node: SyntaxNode, sourceCode: string): boolean {
    try {
      let current = node;
      while (current.parent) {
        current = current.parent;

        if (current.type === 'pair') {
          const keyNode = current.childForFieldName('key');
          if (keyNode && getNodeText(keyNode, sourceCode) === 'computed') {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if node is in computed section');
      return false;
    }
  }

  /**
   * Checks if a node is in the watch section.
   */
  private isInWatchSection(node: SyntaxNode, sourceCode: string): boolean {
    try {
      let current = node;
      while (current.parent) {
        current = current.parent;

        if (current.type === 'pair') {
          const keyNode = current.childForFieldName('key');
          if (keyNode && getNodeText(keyNode, sourceCode) === 'watch') {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if node is in watch section');
      return false;
    }
  }

  /**
   * Checks if a node is in the methods section.
   */
  private isInMethodsSection(node: SyntaxNode, sourceCode: string): boolean {
    try {
      let current = node;
      while (current.parent) {
        current = current.parent;

        if (current.type === 'pair') {
          const keyNode = current.childForFieldName('key');
          if (keyNode && getNodeText(keyNode, sourceCode) === 'methods') {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if node is in methods section');
      return false;
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'document') {
        // Try to get the component name from the script section
        const componentName = this.extractComponentName(node, sourceCode);
        if (componentName) {
          return `Vue_${componentName}`;
        }

        // Default to the filename without extension
        if (this.options?.filePath) {
          const filename = path.basename(this.options.filePath, path.extname(this.options.filePath));
          return `Vue_${filename}`;
        }
      } else if (node.type === 'script_element') {
        return 'Vue_Script';
      } else if (node.type === 'element') {
        if (this.isTemplateElement(node, sourceCode)) {
          return 'Vue_Template';
        } else if (this.isStyleElement(node, sourceCode)) {
          return 'Vue_Style';
        }
      }

      return 'Vue_Component';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Vue class name');
      return 'Vue_Component';
    }
  }

  /**
   * Extracts the component name from a Vue file.
   */
  private extractComponentName(node: SyntaxNode, sourceCode: string): string | null {
    try {
      // Find the script element
      let scriptNode = null;
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child?.type === 'script_element') {
          scriptNode = child;
          break;
        }
      }

      if (scriptNode) {
        // Look for the name property in the component options
        const scriptContent = getNodeText(scriptNode, sourceCode);

        // Check for Vue 2 style component name
        const nameMatch = scriptContent.match(/name\s*:\s*['"]([^'"]+)['"]/);
        if (nameMatch && nameMatch[1]) {
          return nameMatch[1];
        }

        // Check for Vue 3 defineComponent with name
        const defineComponentMatch = scriptContent.match(/defineComponent\s*\(\s*\{\s*name\s*:\s*['"]([^'"]+)['"]/);
        if (defineComponentMatch && defineComponentMatch[1]) {
          return defineComponentMatch[1];
        }

        // Check for export default class style
        const classMatch = scriptContent.match(/export\s+default\s+class\s+(\w+)/);
        if (classMatch && classMatch[1]) {
          return classMatch[1];
        }
      }

      return null;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Vue component name');
      return null;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'import_statement' || node.type === 'import_declaration') {
        const sourceNode = node.childForFieldName('source');
        if (sourceNode) {
          return getNodeText(sourceNode, sourceCode).replace(/^["']|["']$/g, '');
        }
      } else if (node.type === 'element') {
        // Check for src attribute in script or style tags
        if (this.isScriptElement(node, sourceCode) || this.isStyleElement(node, sourceCode)) {
          const startTagNode = node.childForFieldName('start_tag');
          if (startTagNode) {
            const attributesNode = startTagNode.childForFieldName('attributes');
            if (attributesNode) {
              for (let i = 0; i < attributesNode.childCount; i++) {
                const attr = attributesNode.child(i);
                if (attr?.type === 'attribute') {
                  const nameNode = attr.childForFieldName('name');
                  if (nameNode && getNodeText(nameNode, sourceCode) === 'src') {
                    const valueNode = attr.childForFieldName('value');
                    if (valueNode) {
                      return getNodeText(valueNode, sourceCode).replace(/^["']|["']$/g, '');
                    }
                  }
                }
              }
            }
          }
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Vue import path');
      return 'unknown';
    }
  }

  /**
   * Checks if a node is a script element.
   */
  private isScriptElement(node: SyntaxNode, sourceCode: string): boolean {
    try {
      const tagNameNode = node.childForFieldName('tag_name');
      return tagNameNode ? getNodeText(tagNameNode, sourceCode) === 'script' : false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if node is a script element');
      return false;
    }
  }

  /**
   * Finds the script node in a Vue document.
   */
  private findScriptNode(node: SyntaxNode, sourceCode: string): SyntaxNode | null {
    try {
      // Find the script element
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && this.isScriptElement(child, sourceCode)) {
          return child;
        }
      }
      return null;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error finding script node');
      return null;
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, _sourceCode: string): string | undefined {
    try {
      // Look for JSDoc comments before the node
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment') {
        // Check if it's a JSDoc comment
        if (prev.text.startsWith('/**')) {
          // Remove comment markers and asterisks
          return prev.text
            .replace(/^\/\*\*\s*|\s*\*\/$/g, '')
            .replace(/^\s*\*\s*/mg, '')
            .trim();
        }

        // Regular comment
        return prev.text
          .replace(/^\/\/\s*/mg, '')
          .trim();
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Vue function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'document') {
        // Try to get the component description from the script section
        const scriptNode = this.findScriptNode(node, sourceCode);
        if (scriptNode) {
          // Look for a comment before the export default
          const scriptContent = getNodeText(scriptNode, sourceCode);
          const lines = scriptContent.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('export default')) {
              // Check for comments above the export default
              const commentLines = [];
              let j = i - 1;

              // Skip empty lines
              while (j >= 0 && lines[j].trim() === '') {
                j--;
              }

              // Collect comment lines
              while (j >= 0 && (lines[j].trim().startsWith('//') || lines[j].trim().startsWith('*'))) {
                const commentLine = lines[j].trim()
                  .replace(/^\/\/\s*/, '')
                  .replace(/^\*\s*/, '')
                  .trim();

                if (commentLine) {
                  commentLines.unshift(commentLine);
                }

                j--;
              }

              if (commentLines.length > 0) {
                return commentLines.join(' ');
              }

              break;
            }
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Vue class comment');
      return undefined;
    }
  }



  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Vue 3 Composition API detection
      if (sourceCode.includes('defineComponent') ||
          sourceCode.includes('setup()') ||
          sourceCode.includes('ref(') ||
          sourceCode.includes('reactive(')) {
        return 'vue3-composition';
      }

      // Vue 3 Options API detection
      if (sourceCode.includes('Vue.createApp') ||
          sourceCode.includes('createApp(')) {
        return 'vue3-options';
      }

      // Vue 2 detection
      if (sourceCode.includes('Vue.component') ||
          sourceCode.includes('new Vue(') ||
          sourceCode.includes('Vue.extend')) {
        return 'vue2';
      }

      // Vuex detection
      if (sourceCode.includes('Vuex') ||
          sourceCode.includes('createStore') ||
          sourceCode.includes('mapState') ||
          sourceCode.includes('mapGetters')) {
        return 'vuex';
      }

      // Vue Router detection
      if (sourceCode.includes('Vue-Router') ||
          sourceCode.includes('createRouter') ||
          sourceCode.includes('useRouter')) {
        return 'vue-router';
      }

      // Default to Vue
      return 'vue';
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Vue framework');
      return 'vue';
    }
  }
}
