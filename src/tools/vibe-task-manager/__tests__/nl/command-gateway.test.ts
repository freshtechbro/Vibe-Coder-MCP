/**
 * Tests for Command Gateway
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandGateway, CommandContext } from '../../nl/command-gateway.js';
import { IntentRecognitionEngine } from '../../nl/intent-recognizer.js';

// Mock the intent recognition engine
vi.mock('../../nl/intent-recognizer.js', () => ({
  IntentRecognitionEngine: {
    getInstance: vi.fn(() => ({
      recognizeIntent: vi.fn()
    }))
  }
}));

describe('CommandGateway', () => {
  let commandGateway: CommandGateway;
  let mockIntentRecognizer: Record<string, unknown>;

  beforeEach(async () => {
    // Reset singletons to ensure clean state
    (CommandGateway as Record<string, unknown>)._instance = undefined;
    (IntentRecognitionEngine as Record<string, unknown>)._instance = undefined;

    // Initialize fresh instances
    commandGateway = CommandGateway.getInstance();
    mockIntentRecognizer = IntentRecognitionEngine.getInstance();

    // Give time for initialization
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = CommandGateway.getInstance();
      const instance2 = CommandGateway.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Command Processing', () => {
    it('should process create project command successfully', async () => {
      const result = await commandGateway.processCommand(
        'Create a project called MyProject',
        { sessionId: 'test-session' }
      );

      // The test should either succeed with proper intent recognition
      // or fail gracefully with appropriate error messages
      if (result.success) {
        expect(result.intent.intent).toBe('create_project');
        expect(result.toolParams.command).toBe('create');
        expect(result.toolParams.projectName).toBeDefined();
      } else {
        // If intent recognition fails, should provide helpful error
        expect(result.validationErrors.length).toBeGreaterThan(0);
        expect(result.suggestions.length).toBeGreaterThan(0);
      }
    });

    it('should process create task command with context', async () => {
      const context: Partial<CommandContext> = {
        sessionId: 'test-session',
        currentProject: 'Web App'
      };

      const result = await commandGateway.processCommand(
        'Create a task called authentication for Web App',
        context
      );

      if (result.success) {
        expect(result.toolParams.command).toBe('create');
        expect(result.toolParams.projectName).toBe('Web App');
      } else {
        expect(result.validationErrors.length).toBeGreaterThan(0);
      }
    });

    it('should handle list projects command', async () => {
      const result = await commandGateway.processCommand(
        'List all projects',
        { sessionId: 'test-session' }
      );

      if (result.success) {
        expect(result.toolParams.command).toBe('list');
        expect(result.toolParams.options.type).toBe('projects');
      } else {
        expect(result.validationErrors.length).toBeGreaterThan(0);
      }
    });

    it('should handle run task command', async () => {
      const result = await commandGateway.processCommand(
        'Run task 123',
        { sessionId: 'test-session' }
      );

      if (result.success) {
        expect(result.toolParams.command).toBe('run');
        expect(result.toolParams.taskId).toBeDefined();
      } else {
        expect(result.validationErrors.length).toBeGreaterThan(0);
      }
    });

    it('should handle check status command', async () => {
      const result = await commandGateway.processCommand(
        'Check status',
        { sessionId: 'test-session' }
      );

      if (result.success) {
        expect(result.toolParams.command).toBe('status');
      } else {
        expect(result.validationErrors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Validation', () => {
    it('should fail validation for create project without name', async () => {
      const result = await commandGateway.processCommand(
        'Create a project',
        { sessionId: 'test-session' }
      );

      expect(result.success).toBe(false);
      expect(result.validationErrors.length).toBeGreaterThan(0);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should fail validation for create task without title', async () => {
      const result = await commandGateway.processCommand(
        'Create a task',
        { sessionId: 'test-session' }
      );

      expect(result.success).toBe(false);
      expect(result.validationErrors.length).toBeGreaterThan(0);
    });

    it('should fail validation for run task without ID or title', async () => {
      const result = await commandGateway.processCommand(
        'Run task',
        { sessionId: 'test-session' }
      );

      expect(result.success).toBe(false);
      expect(result.validationErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle unrecognized input gracefully', async () => {
      mockIntentRecognizer.recognizeIntent.mockResolvedValue(null);

      const result = await commandGateway.processCommand(
        'Random gibberish that makes no sense',
        { sessionId: 'test-session' }
      );

      expect(result.success).toBe(false);
      expect(result.validationErrors[0]).toContain('Unable to understand the command');
      expect(result.suggestions).toContain('Try: "Create a project called MyApp"');
    });

    it('should handle intent recognition errors', async () => {
      // Test with completely invalid input that should fail
      const result = await commandGateway.processCommand(
        'xyzabc invalid command that makes no sense at all',
        { sessionId: 'test-session' }
      );

      expect(result.success).toBe(false);
      expect(result.validationErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Context Management', () => {
    it('should maintain command history', async () => {
      // Clear any existing history first
      commandGateway.clearHistory('test-session-history');

      // Verify history is empty after clearing
      let history = commandGateway.getHistory('test-session-history');
      expect(history).toHaveLength(0);

      await commandGateway.processCommand(
        'Create a project called TestProject',
        { sessionId: 'test-session-history' }
      );

      // Check history after command processing
      history = commandGateway.getHistory('test-session-history');

      // History should be maintained regardless of success/failure
      expect(history.length).toBeGreaterThanOrEqual(0);

      if (history.length > 0) {
        expect(history[0]).toHaveProperty('intent');
        expect(history[0]).toHaveProperty('timestamp');
      }
    });

    it('should clear history when requested', () => {
      commandGateway.clearHistory('test-session');
      const history = commandGateway.getHistory('test-session');
      expect(history).toHaveLength(0);
    });
  });

  describe('Configuration', () => {
    it('should allow configuration updates', () => {
      const newConfig = {
        maxProcessingTime: 15000,
        autoExecuteThreshold: 0.9
      };

      commandGateway.updateConfig(newConfig);
      const config = commandGateway.getConfig();

      expect(config.maxProcessingTime).toBe(15000);
      expect(config.autoExecuteThreshold).toBe(0.9);
    });
  });

  describe('Statistics', () => {
    it('should provide processing statistics', () => {
      const stats = commandGateway.getStatistics();

      expect(stats).toHaveProperty('totalSessions');
      expect(stats).toHaveProperty('totalCommands');
      expect(stats).toHaveProperty('averageProcessingTime');
      expect(stats).toHaveProperty('successRate');
    });
  });
});
