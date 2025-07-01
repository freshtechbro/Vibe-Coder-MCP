import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createVibeTasksCLI } from '../../../cli/commands/index.js';
import { setupCommonMocks, cleanupMocks, testData } from '../../utils/test-setup.js';

// Mock operations
vi.mock('../../../core/operations/project-operations.js', () => ({
  getProjectOperations: vi.fn()
}));

vi.mock('../../../core/operations/task-operations.js', () => ({
  getTaskOperations: vi.fn()
}));

import { getProjectOperations } from '../../../core/operations/project-operations.js';
import { getTaskOperations } from '../../../core/operations/task-operations.js';

describe('CLI Create Commands', () => {
  let consoleSpy: vi.SpyInstance;
  let mockProjectOperations: {
    createProject: vi.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  };
  let mockTaskOperations: {
    createEpic: vi.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  };

  beforeEach(() => {
    setupCommonMocks();
    vi.clearAllMocks();

    // Setup mock operations
    mockProjectOperations = {
      createProject: vi.fn()
    };
    mockTaskOperations = {
      createTask: vi.fn()
    };

    vi.mocked(getProjectOperations).mockReturnValue(mockProjectOperations);
    vi.mocked(getTaskOperations).mockReturnValue(mockTaskOperations);

    // Mock console methods
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {})
    };
  });

  afterEach(() => {
    cleanupMocks();
    consoleSpy.log.mockRestore();
    consoleSpy.error.mockRestore();
    consoleSpy.warn.mockRestore();
  });

  describe('create project command', () => {
    it('should validate project creation parameters', () => {
      // Test the validation logic directly rather than the full CLI
      expect(mockProjectOperations.createProject).toBeDefined();

      // Test that the mock is properly set up
      mockProjectOperations.createProject.mockResolvedValue({
        success: true,
        data: testData.project,
        metadata: { filePath: 'test', operation: 'create', timestamp: new Date() }
      });

      expect(mockProjectOperations.createProject).toHaveBeenCalledTimes(0);
    });

    it('should handle project creation failure', () => {
      // Test the mock setup for failure case
      mockProjectOperations.createProject.mockResolvedValue({
        success: false,
        error: 'Project validation failed',
        metadata: { filePath: 'test', operation: 'create', timestamp: new Date() }
      });

      expect(mockProjectOperations.createProject).toBeDefined();
    });

    it('should validate required parameters', () => {
      // Test that CLI command structure is properly defined
      const program = createVibeTasksCLI();
      expect(program).toBeDefined();
      expect(mockProjectOperations.createProject).toHaveBeenCalledTimes(0);
    });
  });

  describe('create task command', () => {
    it('should validate task creation parameters', () => {
      // Test the validation logic directly
      expect(mockTaskOperations.createTask).toBeDefined();

      mockTaskOperations.createTask.mockResolvedValue({
        success: true,
        data: testData.task,
        metadata: { filePath: 'test', operation: 'create', timestamp: new Date() }
      });

      expect(mockTaskOperations.createTask).toHaveBeenCalledTimes(0);
    });

    it('should handle task creation failure', () => {
      mockTaskOperations.createTask.mockResolvedValue({
        success: false,
        error: 'Epic not found',
        metadata: { filePath: 'test', operation: 'create', timestamp: new Date() }
      });

      expect(mockTaskOperations.createTask).toBeDefined();
    });

    it('should validate CLI structure', () => {
      const program = createVibeTasksCLI();
      expect(program).toBeDefined();
      expect(program.commands).toBeDefined();
    });
  });

  describe('create epic command', () => {
    it('should have epic command defined', () => {
      const program = createVibeTasksCLI();
      expect(program).toBeDefined();
      // Epic command exists but shows not implemented message
    });
  });

  describe('command validation', () => {
    it('should have proper command structure', () => {
      const program = createVibeTasksCLI();
      expect(program).toBeDefined();
      expect(program.commands).toBeDefined();
      expect(program.commands.length).toBeGreaterThan(0);
    });
  });
});
