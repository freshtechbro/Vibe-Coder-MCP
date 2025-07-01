/**
 * Tests for Response Generator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ResponseGenerator, ResponseContext } from '../../nl/response-generator.js';
import { CommandExecutionResult } from '../../nl/command-handlers.js';
import { RecognizedIntent } from '../../types/nl.js';

describe('ResponseGenerator', () => {
  let responseGenerator: ResponseGenerator;
  let mockContext: ResponseContext;

  beforeEach(() => {
    responseGenerator = ResponseGenerator.getInstance();
    mockContext = {
      sessionId: 'test-session',
      userId: 'test-user',
      userPreferences: {},
      conversationHistory: [],
      currentProject: 'Test Project'
    };
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ResponseGenerator.getInstance();
      const instance2 = ResponseGenerator.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Success Response Generation', () => {
    it('should generate success response for create project', () => {
      const mockIntent: RecognizedIntent = {
        intent: 'create_project',
        confidence: 0.9,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'Create a project called Web App',
        processedInput: 'create a project called web app',
        alternatives: [],
        metadata: {
          processingTime: 50,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const mockExecutionResult: CommandExecutionResult = {
        success: true,
        result: {
          content: [{
            type: 'text',
            text: '✅ Project "Web App" created successfully!\n\nDescription: A web application\nPriority: high\nType: development'
          }]
        },
        updatedContext: {
          currentProject: 'Web App'
        },
        followUpSuggestions: [
          'Add a task to Web App',
          'Check the status of Web App',
          'List all projects'
        ]
      };

      const response = responseGenerator.generateResponse(
        mockExecutionResult,
        mockIntent,
        mockContext
      );

      expect(response.type).toBe('success');
      expect(response.text).toContain('Project "Web App" created successfully');
      expect(response.suggestions).toContain('Add a task to Web App');
      expect(response.data?.intent).toBe('create_project');
      expect(response.requiresConfirmation).toBe(false);
    });

    it('should generate success response for create task', () => {
      const mockIntent: RecognizedIntent = {
        intent: 'create_task',
        confidence: 0.85,
        confidenceLevel: 'high',
        entities: {},
        originalInput: 'Create a task for authentication',
        processedInput: 'create a task for authentication',
        alternatives: [],
        metadata: {
          processingTime: 45,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const mockExecutionResult: CommandExecutionResult = {
        success: true,
        result: {
          content: [{
            type: 'text',
            text: '✅ Task created successfully!\n\nTask ID: task-123\nTitle: Implement authentication'
          }]
        },
        followUpSuggestions: [
          'Run task task-123',
          'Refine task task-123'
        ]
      };

      const response = responseGenerator.generateResponse(
        mockExecutionResult,
        mockIntent,
        mockContext
      );

      expect(response.type).toBe('success');
      expect(response.text).toContain('Task created successfully');
      expect(response.suggestions).toContain('Run task task-123');
    });

    it('should generate success response for list commands', () => {
      const mockIntent: RecognizedIntent = {
        intent: 'list_projects',
        confidence: 0.95,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'Show me all projects',
        processedInput: 'show me all projects',
        alternatives: [],
        metadata: {
          processingTime: 30,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const mockExecutionResult: CommandExecutionResult = {
        success: true,
        result: {
          content: [{
            type: 'text',
            text: '📋 Projects:\n\n• Web App (in_progress) - 5 tasks\n• Mobile App (pending) - 3 tasks'
          }]
        },
        followUpSuggestions: [
          'Create a new project',
          'Check status of a specific project'
        ]
      };

      const response = responseGenerator.generateResponse(
        mockExecutionResult,
        mockIntent,
        mockContext
      );

      expect(response.type).toBe('success');
      expect(response.text).toContain('Projects:');
      expect(response.suggestions).toContain('Create a new project');
    });
  });

  describe('Error Response Generation', () => {
    it('should generate error response for failed commands', () => {
      const mockIntent: RecognizedIntent = {
        intent: 'create_project',
        confidence: 0.6,
        confidenceLevel: 'medium',
        entities: {},
        originalInput: 'Create a project',
        processedInput: 'create a project',
        alternatives: [],
        metadata: {
          processingTime: 50,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const mockExecutionResult: CommandExecutionResult = {
        success: false,
        result: {
          content: [{
            type: 'text',
            text: 'Error: Project name is required'
          }],
          isError: true
        }
      };

      const response = responseGenerator.generateResponse(
        mockExecutionResult,
        mockIntent,
        mockContext
      );

      expect(response.type).toBe('error');
      expect(response.text).toContain('Project name is required');
      expect(response.suggestions).toContain('Try rephrasing your request');
    });

    it('should make error messages more helpful for low confidence', () => {
      const mockIntent: RecognizedIntent = {
        intent: 'unknown',
        confidence: 0.3,
        confidenceLevel: 'low',
        entities: {},
        originalInput: 'Do something unclear',
        processedInput: 'do something unclear',
        alternatives: [],
        metadata: {
          processingTime: 40,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const mockExecutionResult: CommandExecutionResult = {
        success: false,
        result: {
          content: [{
            type: 'text',
            text: 'Command not understood'
          }],
          isError: true
        }
      };

      const response = responseGenerator.generateResponse(
        mockExecutionResult,
        mockIntent,
        mockContext
      );

      expect(response.text).toContain('wasn\'t very confident');
      expect(response.text).toContain('try rephrasing');
    });
  });

  describe('Personalization', () => {
    it('should add contextual greeting for first interaction', () => {
      const mockIntent: RecognizedIntent = {
        intent: 'create_project',
        confidence: 0.9,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'Create a project',
        processedInput: 'create a project',
        alternatives: [],
        metadata: {
          processingTime: 50,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const mockExecutionResult: CommandExecutionResult = {
        success: true,
        result: {
          content: [{
            type: 'text',
            text: 'Project created successfully'
          }]
        }
      };

      const contextWithNoHistory: ResponseContext = {
        ...mockContext,
        conversationHistory: []
      };

      const response = responseGenerator.generateResponse(
        mockExecutionResult,
        mockIntent,
        contextWithNoHistory
      );

      expect(response.text).toContain('Great! Let\'s get your new project started');
    });

    it('should add project context when relevant', () => {
      const mockIntent: RecognizedIntent = {
        intent: 'create_task',
        confidence: 0.85,
        confidenceLevel: 'high',
        entities: {},
        originalInput: 'Create a task',
        processedInput: 'create a task',
        alternatives: [],
        metadata: {
          processingTime: 45,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const mockExecutionResult: CommandExecutionResult = {
        success: true,
        result: {
          content: [{
            type: 'text',
            text: 'Task created successfully'
          }]
        }
      };

      const response = responseGenerator.generateResponse(
        mockExecutionResult,
        mockIntent,
        mockContext
      );

      expect(response.text).toContain('current project: Test Project');
    });
  });

  describe('Tone Adjustment', () => {
    it('should adjust tone to formal when configured', () => {
      responseGenerator.updateConfig({ tone: 'formal' });

      const mockIntent: RecognizedIntent = {
        intent: 'create_project',
        confidence: 0.9,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'Create a project',
        processedInput: 'create a project',
        alternatives: [],
        metadata: {
          processingTime: 50,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const mockExecutionResult: CommandExecutionResult = {
        success: true,
        result: {
          content: [{
            type: 'text',
            text: 'Great! I\'ll help you create that project.'
          }]
        }
      };

      const response = responseGenerator.generateResponse(
        mockExecutionResult,
        mockIntent,
        mockContext
      );

      expect(response.text).toContain('Excellent.');
      expect(response.text).toContain('I will');
    });

    it('should adjust tone to technical when configured', () => {
      responseGenerator.updateConfig({ tone: 'technical' });

      const mockIntent: RecognizedIntent = {
        intent: 'run_task',
        confidence: 0.9,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'Run task',
        processedInput: 'run task',
        alternatives: [],
        metadata: {
          processingTime: 40,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const mockExecutionResult: CommandExecutionResult = {
        success: true,
        result: {
          content: [{
            type: 'text',
            text: 'Great! Let me execute that task.'
          }]
        }
      };

      const response = responseGenerator.generateResponse(
        mockExecutionResult,
        mockIntent,
        mockContext
      );

      expect(response.text).toContain('Operation successful');
      expect(response.text).toContain('Processing');
    });
  });

  describe('Suggestions Generation', () => {
    it('should include follow-up suggestions from execution result', () => {
      const mockIntent: RecognizedIntent = {
        intent: 'create_project',
        confidence: 0.9,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'Create a project',
        processedInput: 'create a project',
        alternatives: [],
        metadata: {
          processingTime: 50,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const mockExecutionResult: CommandExecutionResult = {
        success: true,
        result: {
          content: [{
            type: 'text',
            text: 'Project created'
          }]
        },
        followUpSuggestions: [
          'Add tasks to your project',
          'Set project priorities',
          'Invite team members'
        ]
      };

      const response = responseGenerator.generateResponse(
        mockExecutionResult,
        mockIntent,
        mockContext
      );

      expect(response.suggestions).toContain('Add tasks to your project');
      expect(response.suggestions).toContain('Set project priorities');
      expect(response.suggestions).toContain('Invite team members');
    });

    it('should limit suggestions to configured maximum', () => {
      responseGenerator.updateConfig({ maxSuggestions: 2 });

      const mockIntent: RecognizedIntent = {
        intent: 'list_projects',
        confidence: 0.9,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'List projects',
        processedInput: 'list projects',
        alternatives: [],
        metadata: {
          processingTime: 30,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const mockExecutionResult: CommandExecutionResult = {
        success: true,
        result: {
          content: [{
            type: 'text',
            text: 'Projects listed'
          }]
        },
        followUpSuggestions: [
          'Create a new project',
          'Check project status',
          'Archive old projects',
          'Update project settings'
        ]
      };

      const response = responseGenerator.generateResponse(
        mockExecutionResult,
        mockIntent,
        mockContext
      );

      expect(response.suggestions).toHaveLength(2);
    });
  });

  describe('Configuration', () => {
    it('should allow configuration updates', () => {
      const newConfig = {
        includeSuggestions: false,
        tone: 'formal' as const,
        includeEmojis: false
      };

      responseGenerator.updateConfig(newConfig);
      const config = responseGenerator.getConfig();

      expect(config.includeSuggestions).toBe(false);
      expect(config.tone).toBe('formal');
      expect(config.includeEmojis).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle response generation errors gracefully', () => {
      // Create a malformed execution result that might cause errors
      const mockIntent: RecognizedIntent = {
        intent: 'create_project',
        confidence: 0.9,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'Create a project',
        processedInput: 'create a project',
        alternatives: [],
        metadata: {
          processingTime: 50,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const malformedResult: Record<string, unknown> = {
        success: true,
        result: null // This could cause errors
      };

      const response = responseGenerator.generateResponse(
        malformedResult,
        mockIntent,
        mockContext
      );

      expect(response.type).toBe('error');
      expect(response.text).toContain('encountered an error');
      expect(response.suggestions).toContain('Try rephrasing your request');
    });
  });
});
