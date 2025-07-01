/**
 * Elixir language handler for the Code-Map Generator tool.
 * This file contains the language handler for Elixir files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ImportedItem } from '../codeMapModel.js';

/**
 * Language handler for Elixir.
 * Provides enhanced function name detection for Elixir files.
 */
export class ElixirHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function',
      'anonymous_function',
      'call',
      'def',
      'defp'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'module',
      'defmodule',
      'defprotocol',
      'defimpl'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'import',
      'alias',
      'require',
      'use'
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
      // Handle function definitions (def/defp)
      if (node.type === 'function' || node.type === 'def' || node.type === 'defp') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for test functions
          if (name.startsWith('test_') || this.hasTestMacro(node, sourceCode)) {
            return `test_${name}`;
          }

          // Check for callback functions
          if (this.hasCallbackAttribute(node, sourceCode)) {
            return `callback_${name}`;
          }

          // Check for Phoenix controller actions
          if (this.isPhoenixControllerAction(node, sourceCode)) {
            return `action_${name}`;
          }

          // Check for GenServer callbacks
          if (this.isGenServerCallback(name)) {
            return `genserver_${name}`;
          }

          // Check for function with arity
          const arityMatch = name.match(/^(.+)\/(\d+)$/);
          if (arityMatch) {
            return `${arityMatch[1]}_${arityMatch[2]}`;
          }

          return name;
        }
      }

      // Handle anonymous functions
      if (node.type === 'anonymous_function') {
        // Check if assigned to a variable
        if (node.parent?.type === 'match') {
          const leftNode = node.parent.childForFieldName('left');
          if (leftNode) {
            return getNodeText(leftNode, sourceCode);
          }
        }

        // Check if used in a pipe
        if (node.parent?.type === 'call' &&
            node.parent.childForFieldName('operator')?.text === '|>') {
          const nameNode = node.parent.childForFieldName('name');
          if (nameNode) {
            const funcName = getNodeText(nameNode, sourceCode);

            // Common Elixir functions that take anonymous functions
            if (['map', 'filter', 'reduce', 'each'].includes(funcName)) {
              return `${funcName}_function`;
            }
          }
        }

        return 'anonymous_function';
      }

      // Handle function calls with anonymous functions as arguments
      if (node.type === 'call') {
        const nameNode = node.childForFieldName('name');
        const argsNode = node.childForFieldName('arguments');

        if (nameNode && argsNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for macro definitions
          if (['defmacro', 'defmacrop'].includes(name)) {
            const macroNameNode = argsNode.firstChild;
            if (macroNameNode) {
              return `macro_${getNodeText(macroNameNode, sourceCode)}`;
            }
          }
        }
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Elixir function name');
      return 'anonymous';
    }
  }

  /**
   * Checks if a function has a test macro.
   */
  private hasTestMacro(node: SyntaxNode, _sourceCode: string): boolean {
    try {
      // Look for @tag :unit or similar attributes
      let current = node.previousNamedSibling;
      while (current) {
        if (current.type === 'call' &&
            current.childForFieldName('name')?.text === '@tag') {
          return true;
        }

        if (current.type === 'call' &&
            current.childForFieldName('name')?.text === 'test') {
          return true;
        }

        current = current.previousNamedSibling;
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Elixir function has test macro');
      return false;
    }
  }

  /**
   * Checks if a function has a callback attribute.
   */
  private hasCallbackAttribute(node: SyntaxNode, _sourceCode: string): boolean {
    try {
      // Look for @callback attribute
      let current = node.previousNamedSibling;
      while (current) {
        if (current.type === 'call' &&
            current.childForFieldName('name')?.text === '@callback') {
          return true;
        }

        current = current.previousNamedSibling;
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Elixir function has callback attribute');
      return false;
    }
  }

  /**
   * Checks if a function is a Phoenix controller action.
   */
  private isPhoenixControllerAction(node: SyntaxNode, sourceCode: string): boolean {
    try {
      // Find the module name
      let current = node.parent;
      while (current && current.type !== 'module' && current.type !== 'defmodule') {
        current = current.parent;
      }

      if (current) {
        const nameNode = current.childForFieldName('name');
        if (nameNode) {
          const moduleName = getNodeText(nameNode, sourceCode);

          // Check if the module name contains "Controller"
          return moduleName.includes('Controller');
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Elixir function is Phoenix controller action');
      return false;
    }
  }

  /**
   * Checks if a function name is a GenServer callback.
   */
  private isGenServerCallback(name: string): boolean {
    const callbacks = [
      'init',
      'handle_call',
      'handle_cast',
      'handle_info',
      'terminate',
      'code_change'
    ];

    return callbacks.includes(name);
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'module' ||
          node.type === 'defmodule' ||
          node.type === 'defprotocol' ||
          node.type === 'defimpl') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return 'AnonymousModule';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Elixir class name');
      return 'AnonymousModule';
    }
  }

  /**
   * Extracts implemented interfaces from an AST node.
   */
  protected extractImplementedInterfaces(node: SyntaxNode, sourceCode: string): string[] | undefined {
    try {
      if (node.type === 'module' || node.type === 'defmodule') {
        const behaviours: string[] = [];

        // Look for @behaviour attributes
        let child = node.firstChild;
        while (child) {
          if (child.type === 'call' &&
              child.childForFieldName('name')?.text === '@behaviour') {
            const argsNode = child.childForFieldName('arguments');
            if (argsNode?.firstChild) {
              behaviours.push(getNodeText(argsNode.firstChild, sourceCode));
            }
          }

          child = child.nextNamedSibling;
        }

        // Look for use statements with 'behaviour: true'
        child = node.firstChild;
        while (child) {
          if (child.type === 'call' &&
              child.childForFieldName('name')?.text === 'use') {
            const argsNode = child.childForFieldName('arguments');
            if (argsNode?.firstChild) {
              behaviours.push(getNodeText(argsNode.firstChild, sourceCode));
            }
          }

          child = child.nextNamedSibling;
        }

        return behaviours.length > 0 ? behaviours : undefined;
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Elixir implemented interfaces');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'import' ||
          node.type === 'alias' ||
          node.type === 'require' ||
          node.type === 'use') {
        const argsNode = node.childForFieldName('arguments');
        if (argsNode?.firstChild) {
          return getNodeText(argsNode.firstChild, sourceCode);
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Elixir import path');
      return 'unknown';
    }
  }

  /**
   * Extracts imported items from an AST node.
   */
  protected extractImportedItems(node: SyntaxNode, sourceCode: string): ImportedItem[] | undefined {
    try {
      // Handle import statements (import Module)
      if (node.type === 'import') {
        const argsNode = node.childForFieldName('arguments');

        if (argsNode?.firstChild) {
          const moduleName = getNodeText(argsNode.firstChild, sourceCode);

          // Check for options in the import statement
          const options = this.extractImportOptions(argsNode, sourceCode);

          // Check for 'only' option - import Module, only: [:function1, :function2]
          if (options && options.only) {
            return (options.only as string[]).map((item: string) => ({
              name: item.replace(/^:/, ''), // Remove leading colon from atom
              path: moduleName,
              isDefault: false,
              isNamespace: false,
              nodeText: node.text,
              // Add Elixir-specific metadata
              importType: 'import',
              onlyImport: true
            }));
          }

          // Check for 'except' option - import Module, except: [:function1, :function2]
          if (options && options.except) {
            return [{
              name: moduleName,
              path: moduleName,
              isDefault: false,
              isNamespace: true,
              nodeText: node.text,
              // Add Elixir-specific metadata
              importType: 'import',
              exceptItems: (options.except as string[]).map((item: string) => item.replace(/^:/, ''))
            }];
          }

          // Simple import - import Module
          return [{
            name: moduleName,
            path: moduleName,
            isDefault: false,
            isNamespace: true,
            nodeText: node.text,
            // Add Elixir-specific metadata
            importType: 'import'
          }];
        }
      }
      // Handle alias statements (alias Module.SubModule)
      else if (node.type === 'alias') {
        const argsNode = node.childForFieldName('arguments');

        if (argsNode?.firstChild) {
          const modulePath = getNodeText(argsNode.firstChild, sourceCode);

          // Check for options in the alias statement
          const options = this.extractImportOptions(argsNode, sourceCode);

          // Check for 'as' option - alias Module.SubModule, as: NewName
          if (options && options.as) {
            return [{
              name: options.as as string,
              path: modulePath,
              alias: options.as as string,
              isDefault: false,
              isNamespace: true,
              nodeText: node.text,
              // Add Elixir-specific metadata
              importType: 'alias'
            }];
          }

          // Check for multi-alias - alias Module.{SubModule1, SubModule2}
          if (modulePath.includes('{') && modulePath.includes('}')) {
            const basePath = modulePath.substring(0, modulePath.indexOf('{'));
            const subModulesText = modulePath.substring(
              modulePath.indexOf('{') + 1,
              modulePath.lastIndexOf('}')
            );

            // Split by comma, handling potential whitespace
            const subModules = subModulesText.split(',').map(s => s.trim());

            return subModules.map(subModule => ({
              name: subModule,
              path: basePath + subModule,
              isDefault: false,
              isNamespace: true,
              nodeText: subModule,
              // Add Elixir-specific metadata
              importType: 'alias',
              isMultiAlias: true
            }));
          }

          // Simple alias - alias Module.SubModule
          const parts = modulePath.split('.');
          const name = parts[parts.length - 1];

          return [{
            name: name,
            path: modulePath,
            isDefault: false,
            isNamespace: true,
            nodeText: node.text,
            // Add Elixir-specific metadata
            importType: 'alias'
          }];
        }
      }
      // Handle require statements (require Logger)
      else if (node.type === 'require') {
        const argsNode = node.childForFieldName('arguments');

        if (argsNode?.firstChild) {
          const moduleName = getNodeText(argsNode.firstChild, sourceCode);

          // Check for options in the require statement
          const options = this.extractImportOptions(argsNode, sourceCode);

          // Check for 'as' option - require Logger, as: Log
          if (options && options.as) {
            return [{
              name: options.as as string,
              path: moduleName,
              alias: options.as as string,
              isDefault: false,
              isNamespace: true,
              nodeText: node.text,
              // Add Elixir-specific metadata
              importType: 'require'
            }];
          }

          // Simple require - require Logger
          return [{
            name: moduleName,
            path: moduleName,
            isDefault: false,
            isNamespace: true,
            nodeText: node.text,
            // Add Elixir-specific metadata
            importType: 'require'
          }];
        }
      }
      // Handle use statements (use GenServer)
      else if (node.type === 'use') {
        const argsNode = node.childForFieldName('arguments');

        if (argsNode?.firstChild) {
          const moduleName = getNodeText(argsNode.firstChild, sourceCode);

          // Check for options in the use statement
          const options = this.extractImportOptions(argsNode, sourceCode);

          return [{
            name: moduleName,
            path: moduleName,
            isDefault: false,
            isNamespace: true,
            nodeText: node.text,
            // Add Elixir-specific metadata
            importType: 'use',
            options: options
          }];
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Elixir imported items');
      return undefined;
    }
  }

  /**
   * Extracts options from an import/alias/require/use statement.
   */
  private extractImportOptions(argsNode: SyntaxNode, sourceCode: string): Record<string, unknown> | undefined {
    try {
      // Skip the first child (module name)
      const optionsNode = argsNode.firstChild?.nextNamedSibling;

      if (!optionsNode) {
        return undefined;
      }

      const options: Record<string, unknown> = {};

      // Extract options from the node
      const optionsText = getNodeText(optionsNode, sourceCode);

      // Parse 'only' option - only: [:function1, :function2]
      const onlyMatch = optionsText.match(/only:\s*\[(.*?)\]/);
      if (onlyMatch && onlyMatch[1]) {
        options.only = onlyMatch[1].split(',').map(s => s.trim());
      }

      // Parse 'except' option - except: [:function1, :function2]
      const exceptMatch = optionsText.match(/except:\s*\[(.*?)\]/);
      if (exceptMatch && exceptMatch[1]) {
        options.except = exceptMatch[1].split(',').map(s => s.trim());
      }

      // Parse 'as' option - as: NewName
      const asMatch = optionsText.match(/as:\s*([A-Za-z0-9._]+)/);
      if (asMatch && asMatch[1]) {
        options.as = asMatch[1];
      }

      return Object.keys(options).length > 0 ? options : undefined;
    } catch (error) {
      logger.warn({ err: error }, 'Error extracting Elixir import options');
      return undefined;
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

      // Look for @doc attributes
      prev = current.previousNamedSibling;
      while (prev) {
        if (prev.type === 'call' &&
            prev.childForFieldName('name')?.text === '@doc') {
          const argsNode = prev.childForFieldName('arguments');
          if (argsNode?.firstChild) {
            return getNodeText(argsNode.firstChild, sourceCode)
              .replace(/^["']|["']$/g, ''); // Remove quotes
          }
        }

        prev = prev.previousNamedSibling;
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Elixir function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for comments before the module
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

      // Look for @moduledoc attributes
      let child = node.firstChild;
      while (child) {
        if (child.type === 'call' &&
            child.childForFieldName('name')?.text === '@moduledoc') {
          const argsNode = child.childForFieldName('arguments');
          if (argsNode?.firstChild) {
            return getNodeText(argsNode.firstChild, sourceCode)
              .replace(/^["']|["']$/g, ''); // Remove quotes
          }
        }

        child = child.nextNamedSibling;
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Elixir class comment');
      return undefined;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Phoenix detection
      if (sourceCode.includes('use Phoenix.') ||
          sourceCode.includes('Phoenix.Controller') ||
          sourceCode.includes('Phoenix.Router')) {
        return 'phoenix';
      }

      // Ecto detection
      if (sourceCode.includes('use Ecto.') ||
          sourceCode.includes('Ecto.Schema') ||
          sourceCode.includes('Ecto.Changeset')) {
        return 'ecto';
      }

      // Nerves detection
      if (sourceCode.includes('use Nerves.') ||
          sourceCode.includes('Nerves.Runtime') ||
          sourceCode.includes('Nerves.Network')) {
        return 'nerves';
      }

      // LiveView detection
      if (sourceCode.includes('use Phoenix.LiveView') ||
          sourceCode.includes('Phoenix.LiveComponent') ||
          sourceCode.includes('mount/3')) {
        return 'liveview';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Elixir framework');
      return null;
    }
  }
}
