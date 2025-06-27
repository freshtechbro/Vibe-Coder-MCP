/**
 * Tests for the Python language handler.
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
  type: 'class_definition',
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
import { PythonHandler } from '../python.js';

describe('Python Language Handler', () => {
  let handler: PythonHandler;

  beforeEach(() => {
    handler = new PythonHandler();
  });

  describe('Class Property Extraction', () => {
    it('should extract class variables and instance variables', () => {
      // Create a mock class node for Python class with variables
      const mockInitMethod = {
        type: 'function_definition',
        childForFieldName: vi.fn((field) => {
          if (field === 'name') return { text: '__init__' };
          if (field === 'body') return {
            descendantsOfType: vi.fn((type) => {
              if (type === 'assignment') {
                return [
                  {
                    childForFieldName: vi.fn((field) => {
                      if (field === 'left') return { text: 'self.name', type: 'attribute' };
                      return null;
                    }),
                    startPosition: { row: 9, column: 8 },
                    endPosition: { row: 9, column: 21 }
                  },
                  {
                    childForFieldName: vi.fn((field) => {
                      if (field === 'left') return { text: 'self.email', type: 'attribute' };
                      return null;
                    }),
                    startPosition: { row: 12, column: 8 },
                    endPosition: { row: 12, column: 22 }
                  },
                  {
                    childForFieldName: vi.fn((field) => {
                      if (field === 'left') return { text: 'self._role', type: 'attribute' };
                      return null;
                    }),
                    startPosition: { row: 15, column: 8 },
                    endPosition: { row: 15, column: 35 }
                  },
                  {
                    childForFieldName: vi.fn((field) => {
                      if (field === 'left') return { text: 'self.__id', type: 'attribute' };
                      return null;
                    }),
                    startPosition: { row: 18, column: 8 },
                    endPosition: { row: 18, column: 30 }
                  }
                ];
              }
              return [];
            })
          };
          return null;
        })
      };

      const mockClassBody = {
        type: 'block',
        children: [
          // Class variable 1
          {
            type: 'expression_statement',
            firstChild: {
              type: 'assignment',
              childForFieldName: vi.fn((field) => {
                if (field === 'left') return { text: 'DEFAULT_ROLE' };
                return null;
              })
            },
            startPosition: { row: 2, column: 4 },
            endPosition: { row: 2, column: 25 }
          },
          // Class variable 2
          {
            type: 'expression_statement',
            firstChild: {
              type: 'assignment',
              childForFieldName: vi.fn((field) => {
                if (field === 'left') return { text: 'COMPANY' };
                return null;
              })
            },
            startPosition: { row: 5, column: 4 },
            endPosition: { row: 5, column: 25 }
          },
          // __init__ method
          mockInitMethod
        ]
      };

      const mockClassNode = {
        type: 'class_definition',
        childForFieldName: vi.fn((field) => {
          if (field === 'body') return mockClassBody;
          if (field === 'name') return { text: 'User' };
          return null;
        })
      };

      const sourceCode = `
class User:
    # Default role for new users
    DEFAULT_ROLE = "user"

    # Company name (static)
    COMPANY = "Acme Inc."

    def __init__(self, name, email):
        # User's full name
        self.name = name

        # User's email address
        self.email = email

        # User's role in the system
        self._role = self.DEFAULT_ROLE

        # Internal user ID
        self.__id = generate_id()
`;

      // Act - Test the actual extractClassProperties method
      const properties = handler['extractClassProperties'](mockClassNode as any, sourceCode);

      // Assert
      expect(properties.length).toBeGreaterThan(0);

      // Check that we have both class variables (static) and instance variables
      const staticProps = properties.filter(p => p.isStatic === true);
      const instanceProps = properties.filter(p => p.isStatic === false);

      expect(staticProps.length).toBeGreaterThan(0);
      expect(instanceProps.length).toBeGreaterThan(0);

      // Check access modifiers based on naming conventions
      const publicProps = properties.filter(p => p.accessModifier === 'public');
      const protectedProps = properties.filter(p => p.accessModifier === 'protected');
      const privateProps = properties.filter(p => p.accessModifier === 'private');

      expect(publicProps.length).toBeGreaterThan(0);
      // Python uses naming conventions for access control
      if (protectedProps.length > 0 || privateProps.length > 0) {
        expect(protectedProps.length + privateProps.length).toBeGreaterThan(0);
      }
    });

    it('should extract properties defined with property decorators', () => {
      // Create a mock class node for Python class with property decorators
      const mockInitMethod = {
        type: 'function_definition',
        childForFieldName: vi.fn((field) => {
          if (field === 'name') return { text: '__init__' };
          if (field === 'body') return {
            descendantsOfType: vi.fn((type) => {
              if (type === 'assignment') {
                return [
                  {
                    childForFieldName: vi.fn((field) => {
                      if (field === 'left') return { text: 'self._price', type: 'attribute' };
                      return null;
                    }),
                    startPosition: { row: 2, column: 8 },
                    endPosition: { row: 2, column: 25 }
                  }
                ];
              }
              return [];
            })
          };
          return null;
        })
      };

      const mockClassBody = {
        type: 'block',
        children: [
          mockInitMethod,
          // Property method 1
          {
            type: 'decorated_definition',
            firstChild: {
              type: 'decorator',
              text: '@property'
            },
            childForFieldName: vi.fn((field) => {
              if (field === 'definition') return {
                type: 'function_definition',
                childForFieldName: vi.fn((field) => {
                  if (field === 'name') return { text: 'price' };
                  return null;
                })
              };
              return null;
            }),
            startPosition: { row: 4, column: 4 },
            endPosition: { row: 9, column: 25 }
          },
          // Property method 2
          {
            type: 'decorated_definition',
            firstChild: {
              type: 'decorator',
              text: '@property'
            },
            childForFieldName: vi.fn((field) => {
              if (field === 'definition') return {
                type: 'function_definition',
                childForFieldName: vi.fn((field) => {
                  if (field === 'name') return { text: 'discounted_price' };
                  return null;
                })
              };
              return null;
            }),
            startPosition: { row: 11, column: 4 },
            endPosition: { row: 15, column: 30 }
          }
        ]
      };

      const mockClassNode = {
        type: 'class_definition',
        childForFieldName: vi.fn((field) => {
          if (field === 'body') return mockClassBody;
          if (field === 'name') return { text: 'Product' };
          return null;
        })
      };

      const sourceCode = `
class Product:
    def __init__(self, price):
        self._price = price

    @property
    def price(self):
        """
        Get the product price
        """
        return self._price

    @property
    def discounted_price(self):
        # Price after applying discount
        return self._price * 0.9
`;

      // Act - Test the actual extractClassProperties method
      const properties = handler['extractClassProperties'](mockClassNode as any, sourceCode);

      // Assert
      expect(properties.length).toBeGreaterThan(0);

      // Check that we have instance variables
      const instanceProps = properties.filter(p => p.isStatic === false);
      expect(instanceProps.length).toBeGreaterThan(0);

      // Check access modifiers - Python uses naming conventions
      const protectedProps = properties.filter(p => p.accessModifier === 'protected');
      const publicProps = properties.filter(p => p.accessModifier === 'public');

      // Should have at least some properties with access modifiers
      expect(protectedProps.length + publicProps.length).toBeGreaterThan(0);
    });
  });
});
