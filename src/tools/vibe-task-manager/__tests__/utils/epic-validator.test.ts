import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EpicValidator, validateAndEnsureEpic, validateEpicForTask } from '../../utils/epic-validator.js';
import { AtomicTask } from '../../types/task.js';

// Mock dependencies
vi.mock('../../core/storage/storage-manager.js');
vi.mock('../../services/epic-context-resolver.js');
vi.mock('../../../logger.js');

describe('EpicValidator', () => {
  let validator: EpicValidator;
  let mockStorageManager: Record<string, unknown>;
  let mockEpicContextResolver: Record<string, unknown>;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock implementations
    mockStorageManager = {
      epicExists: vi.fn(),
    };

    mockEpicContextResolver = {
      resolveEpicContext: vi.fn(),
      extractFunctionalArea: vi.fn(),
    };

    // Mock the dynamic imports
    vi.doMock('../../core/storage/storage-manager.js', () => ({
      getStorageManager: vi.fn().mockResolvedValue(mockStorageManager),
    }));

    vi.doMock('../../services/epic-context-resolver.js', () => ({
      getEpicContextResolver: vi.fn().mockReturnValue(mockEpicContextResolver),
    }));

    // Get fresh instance
    validator = EpicValidator.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = EpicValidator.getInstance();
      const instance2 = EpicValidator.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('validateAndEnsureEpic', () => {
    it('should return valid result when epic exists', async () => {
      mockStorageManager.epicExists.mockResolvedValue(true);

      const result = await validator.validateAndEnsureEpic(
        'E001',
        'test-project',
        {
          title: 'Test task',
          description: 'Test description',
          type: 'development',
          tags: ['test']
        }
      );

      expect(result).toEqual({
        valid: true,
        epicId: 'E001',
        exists: true,
        created: false
      });

      expect(mockStorageManager.epicExists).toHaveBeenCalledWith('E001');
    });

    it('should create epic when it does not exist', async () => {
      mockStorageManager.epicExists.mockResolvedValue(false);
      mockEpicContextResolver.resolveEpicContext.mockResolvedValue({
        epicId: 'E002',
        epicName: 'Test Epic',
        source: 'created',
        confidence: 0.8,
        created: true
      });

      const result = await validator.validateAndEnsureEpic(
        'E001',
        'test-project',
        {
          title: 'Test task',
          description: 'Test description',
          type: 'development',
          tags: ['test']
        }
      );

      expect(result).toEqual({
        valid: true,
        epicId: 'E002',
        exists: false,
        created: true
      });

      expect(mockEpicContextResolver.resolveEpicContext).toHaveBeenCalledWith({
        projectId: 'test-project',
        taskContext: {
          title: 'Test task',
          description: 'Test description',
          type: 'development',
          tags: ['test']
        }
      });
    });

    it('should handle epic creation failure gracefully', async () => {
      mockStorageManager.epicExists.mockResolvedValue(false);
      mockEpicContextResolver.resolveEpicContext.mockRejectedValue(new Error('Creation failed'));

      const result = await validator.validateAndEnsureEpic('E001', 'test-project');

      expect(result).toEqual({
        valid: false,
        epicId: 'E001',
        exists: false,
        created: false,
        error: 'Creation failed'
      });
    });

    it('should handle storage manager errors', async () => {
      mockStorageManager.epicExists.mockRejectedValue(new Error('Storage error'));

      const result = await validator.validateAndEnsureEpic('E001', 'test-project');

      expect(result).toEqual({
        valid: false,
        epicId: 'E001',
        exists: false,
        created: false,
        error: 'Storage error'
      });
    });
  });

  describe('validateEpicForTask', () => {
    it('should validate epic for complete task', async () => {
      const task: Partial<AtomicTask> = {
        id: 'T001',
        title: 'Test task',
        description: 'Test description',
        epicId: 'E001',
        projectId: 'test-project',
        type: 'development',
        tags: ['test']
      };

      mockStorageManager.epicExists.mockResolvedValue(true);

      const result = await validator.validateEpicForTask(task);

      expect(result).toEqual({
        valid: true,
        epicId: 'E001',
        exists: true,
        created: false
      });
    });

    it('should return error for task without epic ID', async () => {
      const task: Partial<AtomicTask> = {
        id: 'T001',
        title: 'Test task',
        projectId: 'test-project'
      };

      const result = await validator.validateEpicForTask(task);

      expect(result).toEqual({
        valid: false,
        epicId: 'unknown',
        exists: false,
        created: false,
        error: 'Missing epic ID or project ID'
      });
    });

    it('should return error for task without project ID', async () => {
      const task: Partial<AtomicTask> = {
        id: 'T001',
        title: 'Test task',
        epicId: 'E001'
      };

      const result = await validator.validateEpicForTask(task);

      expect(result).toEqual({
        valid: false,
        epicId: 'E001',
        exists: false,
        created: false,
        error: 'Missing epic ID or project ID'
      });
    });
  });

  describe('batchValidateEpics', () => {
    it('should validate multiple tasks with unique epics', async () => {
      const tasks: Partial<AtomicTask>[] = [
        {
          id: 'T001',
          title: 'Task 1',
          description: 'Description 1',
          epicId: 'E001',
          projectId: 'project-1',
          type: 'development',
          tags: ['auth']
        },
        {
          id: 'T002',
          title: 'Task 2',
          description: 'Description 2',
          epicId: 'E002',
          projectId: 'project-1',
          type: 'development',
          tags: ['video']
        }
      ];

      mockStorageManager.epicExists
        .mockResolvedValueOnce(true)  // E001 exists
        .mockResolvedValueOnce(false); // E002 doesn't exist

      mockEpicContextResolver.resolveEpicContext.mockResolvedValue({
        epicId: 'E002-created',
        epicName: 'Video Epic',
        source: 'created',
        confidence: 0.8,
        created: true
      });

      const results = await validator.batchValidateEpics(tasks);

      expect(results.size).toBe(2);
      expect(results.get('project-1:E001')).toEqual({
        valid: true,
        epicId: 'E001',
        exists: true,
        created: false
      });
      expect(results.get('project-1:E002')).toEqual({
        valid: true,
        epicId: 'E002-created',
        exists: false,
        created: true
      });
    });

    it('should handle duplicate epic-project combinations', async () => {
      const tasks: Partial<AtomicTask>[] = [
        {
          id: 'T001',
          epicId: 'E001',
          projectId: 'project-1',
          title: 'Task 1',
          description: 'Description 1'
        },
        {
          id: 'T002',
          epicId: 'E001',
          projectId: 'project-1',
          title: 'Task 2',
          description: 'Description 2'
        }
      ];

      mockStorageManager.epicExists.mockResolvedValue(true);

      const results = await validator.batchValidateEpics(tasks);

      expect(results.size).toBe(1);
      expect(mockStorageManager.epicExists).toHaveBeenCalledTimes(1);
    });

    it('should handle validation errors in batch', async () => {
      const tasks: Partial<AtomicTask>[] = [
        {
          id: 'T001',
          epicId: 'E001',
          projectId: 'project-1',
          title: 'Task 1'
        }
      ];

      mockStorageManager.epicExists.mockRejectedValue(new Error('Batch error'));

      const results = await validator.batchValidateEpics(tasks);

      expect(results.size).toBe(1);
      expect(results.get('project-1:E001')).toEqual({
        valid: false,
        epicId: 'E001',
        exists: false,
        created: false,
        error: 'Batch error'
      });
    });
  });

  describe('isValidEpicIdFormat', () => {
    it('should validate generated epic ID format', () => {
      expect(validator.isValidEpicIdFormat('E001')).toBe(true);
      expect(validator.isValidEpicIdFormat('E123')).toBe(true);
      expect(validator.isValidEpicIdFormat('E999')).toBe(true);
    });

    it('should validate descriptive epic ID format', () => {
      expect(validator.isValidEpicIdFormat('project-auth-epic')).toBe(true);
      expect(validator.isValidEpicIdFormat('myapp-video-epic')).toBe(true);
      expect(validator.isValidEpicIdFormat('test-main-epic')).toBe(true);
    });

    it('should reject invalid epic ID formats', () => {
      expect(validator.isValidEpicIdFormat('E1')).toBe(false);
      expect(validator.isValidEpicIdFormat('E1234')).toBe(false);
      expect(validator.isValidEpicIdFormat('epic-001')).toBe(false);
      expect(validator.isValidEpicIdFormat('project-epic')).toBe(false);
      expect(validator.isValidEpicIdFormat('')).toBe(false);
    });
  });

  describe('suggestEpicId', () => {
    it('should suggest epic ID based on task context', () => {
      mockEpicContextResolver.extractFunctionalArea.mockReturnValue('auth');

      const result = validator.suggestEpicId('test-project', {
        title: 'User authentication',
        description: 'Login functionality',
        type: 'development',
        tags: ['auth']
      });

      expect(result).toBe('test-project-auth-epic');
      expect(mockEpicContextResolver.extractFunctionalArea).toHaveBeenCalled();
    });

    it('should suggest main epic when no functional area detected', () => {
      mockEpicContextResolver.extractFunctionalArea.mockReturnValue(null);

      const result = validator.suggestEpicId('test-project', {
        title: 'Random task',
        description: 'Some work',
        type: 'development',
        tags: []
      });

      expect(result).toBe('test-project-main-epic');
    });

    it('should suggest main epic when no task context provided', () => {
      const result = validator.suggestEpicId('test-project');
      expect(result).toBe('test-project-main-epic');
    });
  });

  describe('convenience functions', () => {
    it('should export validateAndEnsureEpic convenience function', async () => {
      mockStorageManager.epicExists.mockResolvedValue(true);

      const result = await validateAndEnsureEpic('E001', 'test-project');

      expect(result).toEqual({
        valid: true,
        epicId: 'E001',
        exists: true,
        created: false
      });
    });

    it('should export validateEpicForTask convenience function', async () => {
      const task: Partial<AtomicTask> = {
        epicId: 'E001',
        projectId: 'test-project',
        title: 'Test',
        description: 'Test'
      };

      mockStorageManager.epicExists.mockResolvedValue(true);

      const result = await validateEpicForTask(task);

      expect(result).toEqual({
        valid: true,
        epicId: 'E001',
        exists: true,
        created: false
      });
    });
  });
});
