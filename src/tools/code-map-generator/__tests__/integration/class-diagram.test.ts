/**
 * Integration tests for class diagram generation with properties.
 */

import { describe, it, expect } from 'vitest';
import { generateMermaidClassDiagram } from '../../diagramGenerator.js';
import { ClassInfo } from '../../codeMapModel.js';
import { GraphNode, GraphEdge } from '../../graphBuilder.js';

describe('Class Diagram Generation', () => {
  describe('Mermaid Class Diagram with Properties', () => {
    it('should generate a class diagram with properties including access modifiers and static indicators', () => {
      // Arrange
      const classes: ClassInfo[] = [
        {
          name: 'User',
          filePath: '/src/models/User.js',
          startLine: 1,
          endLine: 20,
          methods: [
            {
              name: 'constructor',
              signature: 'constructor(id, name, role)',
              comment: 'Creates a new user',
              startLine: 10,
              endLine: 14,
              accessModifier: 'public',
              isStatic: false
            },
            {
              name: 'getFullName',
              signature: 'getFullName()',
              comment: 'Returns the user\'s full name',
              startLine: 15,
              endLine: 17,
              accessModifier: 'public',
              isStatic: false,
              returnType: 'string'
            },
            {
              name: 'fromJSON',
              signature: 'fromJSON(json)',
              comment: 'Creates a user from JSON',
              startLine: 18,
              endLine: 20,
              accessModifier: 'public',
              isStatic: true,
              returnType: 'User'
            }
          ],
          properties: [
            {
              name: 'id',
              type: 'number',
              comment: 'User ID',
              startLine: 2,
              endLine: 2,
              accessModifier: 'private',
              isStatic: false
            },
            {
              name: 'name',
              type: 'string',
              comment: 'User\'s full name',
              startLine: 3,
              endLine: 3,
              accessModifier: 'public',
              isStatic: false
            },
            {
              name: 'role',
              type: 'string',
              comment: 'User\'s role in the system',
              startLine: 4,
              endLine: 4,
              accessModifier: 'protected',
              isStatic: false
            },
            {
              name: 'API_KEY',
              type: 'string',
              comment: 'API key for external services',
              startLine: 5,
              endLine: 5,
              accessModifier: 'public',
              isStatic: true
            }
          ],
          imports: [],
          framework: 'none',
          comment: 'Represents a user in the system'
        }
      ];

      // Create nodes for the classes
      const nodes: GraphNode[] = [
        {
          id: 'User',
          label: 'User',
          type: 'class'
        }
      ];

      // Act
      const mermaidDiagram = generateMermaidClassDiagram(nodes, [], classes);

      // Assert
      expect(mermaidDiagram).toContain('classDiagram');
      expect(mermaidDiagram).toContain('class User');

      // Check properties with access modifiers and static indicators
      expect(mermaidDiagram).toContain('-id : number');
      expect(mermaidDiagram).toContain('+name : string');
      expect(mermaidDiagram).toContain('#role : string');
      expect(mermaidDiagram).toContain('+API_KEY : string$');

      // Check methods with access modifiers and static indicators
      expect(mermaidDiagram).toContain('+constructor(id, name, role)');
      expect(mermaidDiagram).toContain('+getFullName() : string');
      expect(mermaidDiagram).toContain('+fromJSON(json) : User$');
    });

    it('should generate a class diagram with inheritance relationships', () => {
      // Arrange
      const classes: ClassInfo[] = [
        {
          name: 'Person',
          filePath: '/src/models/Person.js',
          startLine: 1,
          endLine: 10,
          methods: [
            {
              name: 'constructor',
              signature: 'constructor(name)',
              comment: 'Creates a new person',
              startLine: 5,
              endLine: 7,
              accessModifier: 'public',
              isStatic: false
            }
          ],
          properties: [
            {
              name: 'name',
              type: 'string',
              comment: 'Person\'s name',
              startLine: 2,
              endLine: 2,
              accessModifier: 'protected',
              isStatic: false
            }
          ],
          imports: [],
          framework: 'none',
          comment: 'Base class for people'
        },
        {
          name: 'Employee',
          filePath: '/src/models/Employee.js',
          startLine: 1,
          endLine: 15,
          methods: [
            {
              name: 'constructor',
              signature: 'constructor(name, employeeId)',
              comment: 'Creates a new employee',
              startLine: 6,
              endLine: 9,
              accessModifier: 'public',
              isStatic: false
            }
          ],
          properties: [
            {
              name: 'employeeId',
              type: 'string',
              comment: 'Employee ID',
              startLine: 3,
              endLine: 3,
              accessModifier: 'private',
              isStatic: false
            },
            {
              name: 'COMPANY',
              type: 'string',
              comment: 'Company name',
              startLine: 4,
              endLine: 4,
              accessModifier: 'public',
              isStatic: true
            }
          ],
          imports: [
            {
              path: '../models/Person',
              importedItems: ['Person'],
              absolutePath: '/src/models/Person.js'
            }
          ],
          extends: 'Person',
          framework: 'none',
          comment: 'Represents an employee'
        }
      ];

      // Create nodes for the classes
      const nodes: GraphNode[] = [
        {
          id: 'Person',
          label: 'Person',
          type: 'class'
        },
        {
          id: 'Employee',
          label: 'Employee',
          type: 'class'
        }
      ];

      // Create edges for inheritance
      const edges: GraphEdge[] = [
        {
          from: 'Person',
          to: 'Employee',
          label: 'inherits'
        }
      ];

      // Act
      const mermaidDiagram = generateMermaidClassDiagram(nodes, edges, classes);

      // Assert
      expect(mermaidDiagram).toContain('classDiagram');
      expect(mermaidDiagram).toContain('class Person');
      expect(mermaidDiagram).toContain('class Employee');

      // Check inheritance relationship
      expect(mermaidDiagram).toContain('Person <|-- Employee');

      // Check properties with access modifiers and static indicators
      expect(mermaidDiagram).toContain('#name : string');
      expect(mermaidDiagram).toContain('-employeeId : string');
      expect(mermaidDiagram).toContain('+COMPANY : string$');
    });
  });
});
