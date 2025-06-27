/**
 * Tests for the JavaScript language handler.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('../../utils/context-tracker.js', () => ({
  ContextTracker: vi.fn().mockImplementation(() => ({
    getCurrentContext: vi.fn().mockReturnValue({}),
    enterContext: vi.fn(),
    exitContext: vi.fn(),
    withContext: vi.fn((type, node, name, callback) => callback())
  }))
}));

vi.mock('../../utils/import-resolver-factory.js', () => ({
  ImportResolverFactory: vi.fn().mockImplementation(() => ({
    getImportResolver: vi.fn().mockReturnValue(null)
  }))
}));

// Mock tree-sitter parser
const mockSyntaxNode = {
  type: 'class_declaration',
  startPosition: { row: 0, column: 0 },
  endPosition: { row: 10, column: 0 },
  startIndex: 0,
  endIndex: 100,
  text: '',
  children: [],
  childForFieldName: vi.fn(),
  descendantsOfType: vi.fn().mockReturnValue([]),
  parent: null
};

vi.mock('tree-sitter', () => ({
  default: vi.fn().mockImplementation(() => ({
    setLanguage: vi.fn(),
    parse: vi.fn().mockReturnValue({
      rootNode: mockSyntaxNode
    })
  }))
}));

// Import the actual implementation after mocks
import { JavaScriptHandler } from '../javascript.js';

describe('JavaScript Language Handler', () => {
  let handler: JavaScriptHandler;

  beforeEach(() => {
    handler = new JavaScriptHandler();
  });

  describe('Class Property Extraction', () => {
    it('should extract class properties with access modifiers and static status', () => {
      // Create a mock class node that represents the parsed AST
      const mockClassBody = {
        type: 'class_body',
        children: [
          // Private property
          {
            type: 'property_definition',
            text: 'private id;',
            startPosition: { row: 2, column: 10 },
            endPosition: { row: 2, column: 21 },
            childForFieldName: vi.fn((field) => {
              if (field === 'name') return { text: 'id' };
              return null;
            })
          },
          // Public property
          {
            type: 'public_field_definition',
            text: 'public name;',
            startPosition: { row: 5, column: 10 },
            endPosition: { row: 5, column: 22 },
            childForFieldName: vi.fn((field) => {
              if (field === 'name') return { text: 'name' };
              return null;
            })
          },
          // Protected property
          {
            type: 'property_definition',
            text: 'protected role;',
            startPosition: { row: 8, column: 10 },
            endPosition: { row: 8, column: 25 },
            childForFieldName: vi.fn((field) => {
              if (field === 'name') return { text: 'role' };
              return null;
            })
          },
          // Static property
          {
            type: 'property_definition',
            text: 'static apiKey = \'default-key\';',
            startPosition: { row: 11, column: 10 },
            endPosition: { row: 11, column: 40 },
            childForFieldName: vi.fn((field) => {
              if (field === 'name') return { text: 'apiKey' };
              return null;
            })
          },
          // Constructor method
          {
            type: 'method_definition',
            childForFieldName: vi.fn((field) => {
              if (field === 'name') return { text: 'constructor' };
              if (field === 'body') return {
                descendantsOfType: vi.fn((type) => {
                  if (type === 'assignment_expression') {
                    return [
                      {
                        childForFieldName: vi.fn((field) => {
                          if (field === 'left') return { text: 'this.createdAt' };
                          return null;
                        }),
                        startPosition: { row: 16, column: 12 },
                        endPosition: { row: 16, column: 35 }
                      }
                    ];
                  }
                  return [];
                })
              };
              return null;
            })
          }
        ]
      };

      const mockClassNode = {
        type: 'class_declaration',
        childForFieldName: vi.fn((field) => {
          if (field === 'body') return mockClassBody;
          if (field === 'name') return { text: 'User' };
          return null;
        })
      };

      const sourceCode = `
        class User {
          // User ID
          private id;

          // User's full name
          public name;

          // User's role in the system
          protected role;

          // API key for external services
          static apiKey = 'default-key';

          constructor(id, name, role) {
            this.createdAt = new Date();
          }
        }
      `;

      // Act - Test the actual extractClassProperties method
      const properties = handler['extractClassProperties'](mockClassNode as any, sourceCode);

      // Assert
      expect(properties.length).toBeGreaterThan(0);

      // Check that properties are extracted with correct access modifiers
      const privateProps = properties.filter(p => p.accessModifier === 'private');
      const publicProps = properties.filter(p => p.accessModifier === 'public');
      const protectedProps = properties.filter(p => p.accessModifier === 'protected');
      const staticProps = properties.filter(p => p.isStatic === true);

      expect(privateProps.length).toBeGreaterThan(0);
      expect(publicProps.length).toBeGreaterThan(0);
      expect(protectedProps.length).toBeGreaterThan(0);
      expect(staticProps.length).toBeGreaterThan(0);
    });

    it('should extract TypeScript class properties with types', () => {
      // Create a mock class node for TypeScript properties
      const mockClassBody = {
        type: 'class_body',
        children: [
          // Private property with type
          {
            type: 'property_definition',
            text: 'private id: number;',
            startPosition: { row: 2, column: 10 },
            endPosition: { row: 2, column: 29 },
            childForFieldName: vi.fn((field) => {
              if (field === 'name') return { text: 'id' };
              if (field === 'type') return { text: 'number' };
              return null;
            })
          },
          // Public property with type
          {
            type: 'public_field_definition',
            text: 'public name: string;',
            startPosition: { row: 3, column: 10 },
            endPosition: { row: 3, column: 30 },
            childForFieldName: vi.fn((field) => {
              if (field === 'name') return { text: 'name' };
              if (field === 'type') return { text: 'string' };
              return null;
            })
          },
          // Protected property with type
          {
            type: 'property_definition',
            text: 'protected price: number;',
            startPosition: { row: 4, column: 10 },
            endPosition: { row: 4, column: 34 },
            childForFieldName: vi.fn((field) => {
              if (field === 'name') return { text: 'price' };
              if (field === 'type') return { text: 'number' };
              return null;
            })
          },
          // Static readonly property with type
          {
            type: 'property_definition',
            text: 'static readonly VERSION: string = \'1.0.0\';',
            startPosition: { row: 5, column: 10 },
            endPosition: { row: 5, column: 52 },
            childForFieldName: vi.fn((field) => {
              if (field === 'name') return { text: 'VERSION' };
              if (field === 'type') return { text: 'string' };
              return null;
            })
          }
        ]
      };

      const mockClassNode = {
        type: 'class_declaration',
        childForFieldName: vi.fn((field) => {
          if (field === 'body') return mockClassBody;
          if (field === 'name') return { text: 'Product' };
          return null;
        })
      };

      const sourceCode = `
        class Product {
          private id: number;
          public name: string;
          protected price: number;
          static readonly VERSION: string = '1.0.0';
        }
      `;

      // Act - Test the actual extractClassProperties method
      const properties = handler['extractClassProperties'](mockClassNode as any, sourceCode);

      // Assert
      expect(properties.length).toBeGreaterThan(0);

      // Check that properties are extracted with types
      const typedProps = properties.filter(p => p.type);
      expect(typedProps.length).toBeGreaterThan(0);

      // Check access modifiers
      const privateProps = properties.filter(p => p.accessModifier === 'private');
      const publicProps = properties.filter(p => p.accessModifier === 'public');
      const protectedProps = properties.filter(p => p.accessModifier === 'protected');

      expect(privateProps.length).toBeGreaterThan(0);
      expect(publicProps.length).toBeGreaterThan(0);
      expect(protectedProps.length).toBeGreaterThan(0);

      // Check static properties
      const staticProps = properties.filter(p => p.isStatic === true);
      expect(staticProps.length).toBeGreaterThan(0);
    });
  });
});
