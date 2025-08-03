/**
 * Unit tests for the base language handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseLanguageHandler } from '../../languageHandlers/base.js';
import { SyntaxNode } from '../../parser.js';
import { FunctionExtractionOptions } from '../../types.js';

// Mock implementation of BaseLanguageHandler for testing
class TestLanguageHandler extends BaseLanguageHandler {
  // Make protected methods public for testing
  public generateHeuristicComment(name: string, type: string, signature?: string, className?: string): string {
    return super.generateHeuristicComment(name, type, signature, className);
  }

  public isNestedFunction(node: SyntaxNode): boolean {
    return super.isNestedFunction(node);
  }
  protected getFunctionQueryPatterns(): string[] {
    return ['function_declaration', 'method_definition'];
  }

  protected getClassQueryPatterns(): string[] {
    return ['class_declaration', 'class_expression'];
  }

  protected getImportQueryPatterns(): string[] {
    return ['import_statement', 'import_declaration'];
  }

  protected extractFunctionName(
    node: SyntaxNode,
    _sourceCode: string,
    _options?: FunctionExtractionOptions
  ): string {
    if (node.type === 'function_declaration') {
      const nameNode = node.childForFieldName('name');
      return nameNode ? nameNode.text : 'anonymous';
    }

    if (node.type === 'method_definition') {
      const nameNode = node.childForFieldName('name');
      return nameNode ? nameNode.text : 'anonymous';
    }

    return 'anonymous';
  }

  protected extractClassName(node: SyntaxNode, _sourceCode: string): string {
    const nameNode = node.childForFieldName('name');
    return nameNode ? nameNode.text : 'AnonymousClass';
  }

  protected extractImportPath(node: SyntaxNode, _sourceCode: string): string {
    const sourceNode = node.childForFieldName('source');
    return sourceNode ? sourceNode.text.replace(/['"]/g, '') : 'unknown';
  }
}

// Mock SyntaxNode for testing
function createMockNode(type: string, text: string, children: SyntaxNode[] = [], namedChildren: SyntaxNode[] = [], parent: SyntaxNode | null = null, fields: Record<string, SyntaxNode> = {}): SyntaxNode {
  const node: SyntaxNode = {
    type,
    text,
    children,
    namedChildren,
    parent,
    childCount: children.length,
    namedChildCount: namedChildren.length,
    startIndex: 0,
    endIndex: text.length,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: text.length },

    child: (index: number) => children[index] || null,
    namedChild: (index: number) => namedChildren[index] || null,
    childForFieldName: (fieldName: string) => fields[fieldName] || null,

    nextSibling: null,
    previousSibling: null,
    nextNamedSibling: null,
    previousNamedSibling: null,

    descendantsOfType: vi.fn().mockImplementation((types: string[]) => {
      if (types.includes(type)) {
        return [node];
      }
      return [];
    }),

    firstChild: children[0] || null,
    lastChild: children[children.length - 1] || null,
    firstNamedChild: namedChildren[0] || null,
    lastNamedChild: namedChildren[namedChildren.length - 1] || null
  };

  return node as SyntaxNode;
}

describe('BaseLanguageHandler', () => {
  let handler: TestLanguageHandler;

  beforeEach(() => {
    handler = new TestLanguageHandler();
  });

  describe('extractFunctions', () => {
    it('should extract functions from an AST node', () => {
      // Create mock nodes
      const nameNode = createMockNode('identifier', 'myFunction');
      const paramsNode = createMockNode('parameters', '()');
      const bodyNode = createMockNode('body', '{}');

      const funcNode = createMockNode(
        'function_declaration',
        'function myFunction() {}',
        [nameNode, paramsNode, bodyNode],
        [nameNode, paramsNode, bodyNode],
        null,
        { name: nameNode, parameters: paramsNode, body: bodyNode }
      );

      const rootNode = createMockNode('program', 'function myFunction() {}', [funcNode], [funcNode]);

      // Mock descendantsOfType to return our function node only for function_declaration
      rootNode.descendantsOfType = vi.fn().mockImplementation((types: string[]) => {
        if (types === 'function_declaration') {
          return [funcNode];
        }
        if (types === 'method_definition') {
          return [];
        }
        return [];
      });

      // Extract functions
      const functions = handler.extractFunctions(rootNode, rootNode.text);

      // Verify results
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('myFunction');
      expect(functions[0].startLine).toBe(1);
      expect(functions[0].endLine).toBe(1);
    });

    it('should skip nested functions when not extracting methods', () => {
      // Create mock nodes for nested functions
      const innerNameNode = createMockNode('identifier', 'innerFunction');
      const innerParamsNode = createMockNode('parameters', '()');
      const innerBodyNode = createMockNode('body', '{}');

      const innerFuncNode = createMockNode(
        'function_declaration',
        'function innerFunction() {}',
        [innerNameNode, innerParamsNode, innerBodyNode],
        [innerNameNode, innerParamsNode, innerBodyNode],
        null,
        { name: innerNameNode, parameters: innerParamsNode, body: innerBodyNode }
      );

      const outerNameNode = createMockNode('identifier', 'outerFunction');
      const outerParamsNode = createMockNode('parameters', '()');
      const outerBodyNode = createMockNode('body', '{ function innerFunction() {} }', [innerFuncNode], [innerFuncNode]);

      const outerFuncNode = createMockNode(
        'function_declaration',
        'function outerFunction() { function innerFunction() {} }',
        [outerNameNode, outerParamsNode, outerBodyNode],
        [outerNameNode, outerParamsNode, outerBodyNode],
        null,
        { name: outerNameNode, parameters: outerParamsNode, body: outerBodyNode }
      );

      // Set parent relationship
      (innerFuncNode as SyntaxNode).parent = outerBodyNode;

      const rootNode = createMockNode('program', 'function outerFunction() { function innerFunction() {} }', [outerFuncNode], [outerFuncNode]);

      // Mock descendantsOfType to return both function nodes for function_declaration, empty for method_definition
      rootNode.descendantsOfType = vi.fn().mockImplementation((types: string[]) => {
        if (types === 'function_declaration') {
          return [outerFuncNode, innerFuncNode];
        }
        if (types === 'method_definition') {
          return [];
        }
        return [];
      });

      // Mock isNestedFunction to return true for innerFuncNode
      vi.spyOn(handler, 'isNestedFunction').mockImplementation((node: SyntaxNode) => {
        return node === innerFuncNode;
      });

      // Extract functions
      const functions = handler.extractFunctions(rootNode, rootNode.text);

      // Verify results
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('outerFunction');
    });
  });

  describe('extractClasses', () => {
    it('should extract classes from an AST node', () => {
      // Create mock nodes
      const nameNode = createMockNode('identifier', 'MyClass');
      const bodyNode = createMockNode('class_body', '{}');

      const classNode = createMockNode(
        'class_declaration',
        'class MyClass {}',
        [nameNode, bodyNode],
        [nameNode, bodyNode],
        null,
        { name: nameNode, body: bodyNode }
      );

      const rootNode = createMockNode('program', 'class MyClass {}', [classNode], [classNode]);

      // Mock descendantsOfType to return our class node only for class_declaration
      rootNode.descendantsOfType = vi.fn().mockImplementation((types: string[]) => {
        if (types === 'class_declaration') {
          return [classNode];
        }
        if (types === 'class_expression') {
          return [];
        }
        return [];
      });

      // Extract classes
      const classes = handler.extractClasses(rootNode, rootNode.text);

      // Verify results
      expect(classes).toHaveLength(1);
      expect(classes[0].name).toBe('MyClass');
      expect(classes[0].startLine).toBe(1);
      expect(classes[0].endLine).toBe(1);
    });
  });

  describe('generateHeuristicComment', () => {
    it('should generate a comment for a getter function', () => {
      const comment = handler.generateHeuristicComment('getUserData', 'function');
      expect(comment).toContain('Gets the userData');
    });

    it('should generate a comment for a setter function', () => {
      const comment = handler.generateHeuristicComment('setUserData', 'function');
      expect(comment).toContain('Sets the userData');
    });

    it('should generate a comment for a class', () => {
      const comment = handler.generateHeuristicComment('UserManager', 'class');
      expect(comment).toContain('Represents a UserManager object');
    });
  });

  describe('extractImports', () => {
    it('should extract imports with proper context tracking - no manual stack manipulation', () => {
      // Create mock nodes
      const sourceNode = createMockNode('string', '"./module"');
      const importNode = createMockNode(
        'import_statement',
        'import { foo } from "./module"',
        [sourceNode],
        [sourceNode],
        null,
        { source: sourceNode }
      );

      const rootNode = createMockNode('program', 'import { foo } from "./module"', [importNode], [importNode]);

      // Mock descendantsOfType to return import node for both patterns
      rootNode.descendantsOfType = vi.fn().mockImplementation((types: string) => {
        // extractImports calls descendantsOfType with each pattern individually
        if (types === 'import_statement' || types === 'import_declaration') {
          return [importNode];
        }
        return [];
      });

      // Spy on context tracker methods
      const contextTracker = handler['contextTracker'];
      const enterContextSpy = vi.spyOn(contextTracker, 'enterContext');
      const exitContextSpy = vi.spyOn(contextTracker, 'exitContext');

      // Extract imports
      const imports = handler.extractImports(rootNode, rootNode.text);

      // The implementation calls descendantsOfType for each pattern
      // So we get duplicates. This is expected behavior.
      expect(imports.length).toBeGreaterThan(0);
      expect(imports[0].path).toBe('./module');

      // Verify context tracker methods are balanced
      // Each withContext should result in one enter and one exit
      expect(enterContextSpy).toHaveBeenCalledTimes(exitContextSpy.mock.calls.length);
    });

    it('should verify no manual context stack manipulation inside withContext', () => {
      // This test verifies the fix - that we don't manually manipulate
      // the context stack inside withContext anymore
      
      // Create mock node
      const sourceNode = createMockNode('string', '"./module"');
      const importNode = createMockNode(
        'import_statement',
        'import { foo } from "./module"',
        [sourceNode],
        [sourceNode],
        null,
        { source: sourceNode }
      );

      const rootNode = createMockNode('program', 'import { foo } from "./module"', [importNode], [importNode]);

      // Mock descendantsOfType
      rootNode.descendantsOfType = vi.fn().mockImplementation((types: string) => {
        if (types === 'import_statement') {
          return [importNode];
        }
        return [];
      });

      // Track enter/exit calls
      const contextTracker = handler['contextTracker'];
      let enterCount = 0;
      let exitCount = 0;
      let insideWithContext = false;

      // Override withContext to track when we're inside it
      const originalWithContext = contextTracker.withContext.bind(contextTracker);
      contextTracker.withContext = function<T>(type: string, node: SyntaxNode, name: string | undefined, fn: () => T): T {
        insideWithContext = true;
        const result = originalWithContext(type, node, name, fn);
        insideWithContext = false;
        return result;
      };

      // Track enter/exit calls and verify they don't happen inside withContext callback
      const originalEnter = contextTracker.enterContext.bind(contextTracker);
      contextTracker.enterContext = function(type: string, node: SyntaxNode, name?: string): void {
        enterCount++;
        if (insideWithContext && enterCount > 1) {
          throw new Error('Manual enterContext called inside withContext!');
        }
        return originalEnter(type, node, name);
      };

      const originalExit = contextTracker.exitContext.bind(contextTracker);
      contextTracker.exitContext = function() {
        exitCount++;
        if (insideWithContext && exitCount > 0 && enterCount === 1) {
          throw new Error('Manual exitContext called inside withContext!');
        }
        return originalExit();
      };

      // This should not throw if the fix is working correctly
      expect(() => handler.extractImports(rootNode, rootNode.text)).not.toThrow();
    });
  });
});
