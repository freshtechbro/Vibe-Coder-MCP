import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { TaskOperations, CreateTaskParams, UpdateTaskParams } from '../../../core/operations/task-operations.js';
import { AtomicTask, TaskStatus, TaskPriority, TaskType } from '../../../types/task.js';

// Mock dependencies
vi.mock('../../../core/storage/storage-manager.js');
vi.mock('../../../core/access/access-manager.js');
vi.mock('../../../utils/data-sanitizer.js');
vi.mock('../../../utils/id-generator.js');
vi.mock('../../../utils/config-loader.js');
vi.mock('../../../utils/epic-validator.js');
vi.mock('../../../../logger.js');

describe('TaskOperations Integration Tests', () => {
  let taskOps: TaskOperations;
  let mockStorageManager: any;
  let mockAccessManager: any;
  let mockDataSanitizer: any;
  let mockIdGenerator: any;
  let mockEpicValidator: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock implementations
    mockStorageManager = {
      projectExists: vi.fn(),
      epicExists: vi.fn(),
      createTask: vi.fn(),
      getTask: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(),
      listTasks: vi.fn(),
      searchTasks: vi.fn(),
      getTasksByStatus: vi.fn(),
      getTasksByPriority: vi.fn(),
      taskExists: vi.fn(),
    };

    mockAccessManager = {
      acquireLock: vi.fn(),
      releaseLock: vi.fn(),
    };

    mockDataSanitizer = {
      sanitizeInput: vi.fn(),
    };

    mockIdGenerator = {
      generateTaskId: vi.fn(),
    };

    mockEpicValidator = {
      validateEpicForTask: vi.fn(),
    };

    // Mock the dynamic imports
    vi.doMock('../../../core/storage/storage-manager.js', () => ({
      getStorageManager: vi.fn().mockResolvedValue(mockStorageManager),
    }));

    vi.doMock('../../../core/access/access-manager.js', () => ({
      getAccessManager: vi.fn().mockResolvedValue(mockAccessManager),
    }));

    vi.doMock('../../../utils/data-sanitizer.js', () => ({
      DataSanitizer: {
        getInstance: vi.fn().mockReturnValue(mockDataSanitizer),
      },
    }));

    vi.doMock('../../../utils/id-generator.js', () => ({
      getIdGenerator: vi.fn().mockReturnValue(mockIdGenerator),
    }));

    vi.doMock('../../../utils/config-loader.js', () => ({
      getVibeTaskManagerConfig: vi.fn().mockResolvedValue({
        taskManager: {
          performanceTargets: {
            minTestCoverage: 95,
            maxResponseTime: 200,
            maxMemoryUsage: 512,
          },
        },
      }),
    }));

    vi.doMock('../../../utils/epic-validator.js', () => ({
      validateEpicForTask: mockEpicValidator.validateEpicForTask,
    }));

    // Get fresh instance
    taskOps = TaskOperations.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createTask with dynamic epic resolution', () => {
    const mockCreateParams: CreateTaskParams = {
      title: 'Test Task',
      description: 'Test task description',
      projectId: 'test-project',
      epicId: 'test-epic',
      priority: 'medium' as TaskPriority,
      type: 'development' as TaskType,
      estimatedHours: 4,
      tags: ['test'],
      acceptanceCriteria: ['Task should work'],
    };

    beforeEach(() => {
      // Setup default successful mocks
      mockAccessManager.acquireLock.mockResolvedValue({
        success: true,
        lock: { id: 'lock-1' },
      });

      mockDataSanitizer.sanitizeInput.mockResolvedValue({
        success: true,
        sanitizedData: mockCreateParams,
      });

      mockStorageManager.projectExists.mockResolvedValue(true);

      mockIdGenerator.generateTaskId.mockResolvedValue({
        success: true,
        id: 'T001',
      });

      mockStorageManager.createTask.mockResolvedValue({
        success: true,
        data: {
          ...mockCreateParams,
          id: 'T001',
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      mockAccessManager.releaseLock.mockResolvedValue(undefined);
    });

    it('should create task with existing epic', async () => {
      mockEpicValidator.validateEpicForTask.mockResolvedValue({
        valid: true,
        epicId: 'test-epic',
        exists: true,
        created: false,
      });

      const result = await taskOps.createTask(mockCreateParams, 'test-user');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.epicId).toBe('test-epic');

      expect(mockEpicValidator.validateEpicForTask).toHaveBeenCalledWith({
        epicId: 'test-epic',
        projectId: 'test-project',
        title: 'Test Task',
        description: 'Test task description',
        type: 'development',
        tags: ['test'],
      });
    });

    it('should create task with dynamically created epic', async () => {
      mockEpicValidator.validateEpicForTask.mockResolvedValue({
        valid: true,
        epicId: 'test-project-auth-epic',
        exists: false,
        created: true,
      });

      const result = await taskOps.createTask(mockCreateParams, 'test-user');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.epicId).toBe('test-project-auth-epic');

      expect(mockStorageManager.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          epicId: 'test-project-auth-epic',
        })
      );
    });

    it('should handle epic validation failure', async () => {
      mockEpicValidator.validateEpicForTask.mockResolvedValue({
        valid: false,
        epicId: 'test-epic',
        exists: false,
        created: false,
        error: 'Epic validation failed',
      });

      const result = await taskOps.createTask(mockCreateParams, 'test-user');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Epic validation failed');
      expect(mockStorageManager.createTask).not.toHaveBeenCalled();
    });

    it('should handle epic ID resolution during validation', async () => {
      const paramsWithDefaultEpic = {
        ...mockCreateParams,
        epicId: 'default-epic',
      };

      mockDataSanitizer.sanitizeInput.mockResolvedValue({
        success: true,
        sanitizedData: paramsWithDefaultEpic,
      });

      mockEpicValidator.validateEpicForTask.mockResolvedValue({
        valid: true,
        epicId: 'test-project-main-epic',
        exists: false,
        created: true,
      });

      const result = await taskOps.createTask(paramsWithDefaultEpic, 'test-user');

      expect(result.success).toBe(true);
      expect(result.data!.epicId).toBe('test-project-main-epic');

      expect(mockStorageManager.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          epicId: 'test-project-main-epic',
        })
      );
    });

    it('should acquire and release locks properly', async () => {
      mockEpicValidator.validateEpicForTask.mockResolvedValue({
        valid: true,
        epicId: 'test-epic',
        exists: true,
        created: false,
      });

      await taskOps.createTask(mockCreateParams, 'test-user');

      expect(mockAccessManager.acquireLock).toHaveBeenCalledTimes(2);
      expect(mockAccessManager.acquireLock).toHaveBeenCalledWith(
        'project:test-project',
        'test-user',
        'write',
        expect.any(Object)
      );
      expect(mockAccessManager.acquireLock).toHaveBeenCalledWith(
        'epic:test-epic',
        'test-user',
        'write',
        expect.any(Object)
      );

      expect(mockAccessManager.releaseLock).toHaveBeenCalledTimes(2);
    });

    it('should handle lock acquisition failure', async () => {
      mockAccessManager.acquireLock.mockResolvedValueOnce({
        success: false,
        error: 'Lock acquisition failed',
      });

      const result = await taskOps.createTask(mockCreateParams, 'test-user');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to acquire project lock');
      expect(mockEpicValidator.validateEpicForTask).not.toHaveBeenCalled();
    });

    it('should handle data sanitization failure', async () => {
      mockDataSanitizer.sanitizeInput.mockResolvedValue({
        success: false,
        violations: [{ description: 'Invalid input' }],
      });

      const result = await taskOps.createTask(mockCreateParams, 'test-user');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Input sanitization failed');
      expect(mockEpicValidator.validateEpicForTask).not.toHaveBeenCalled();
    });

    it('should handle project not found', async () => {
      mockStorageManager.projectExists.mockResolvedValue(false);

      const result = await taskOps.createTask(mockCreateParams, 'test-user');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Project test-project not found');
      expect(mockEpicValidator.validateEpicForTask).not.toHaveBeenCalled();
    });

    it('should handle task ID generation failure', async () => {
      mockEpicValidator.validateEpicForTask.mockResolvedValue({
        valid: true,
        epicId: 'test-epic',
        exists: true,
        created: false,
      });

      mockIdGenerator.generateTaskId.mockResolvedValue({
        success: false,
        error: 'ID generation failed',
      });

      const result = await taskOps.createTask(mockCreateParams, 'test-user');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to generate task ID');
    });

    it('should handle storage creation failure', async () => {
      mockEpicValidator.validateEpicForTask.mockResolvedValue({
        valid: true,
        epicId: 'test-epic',
        exists: true,
        created: false,
      });

      mockStorageManager.createTask.mockResolvedValue({
        success: false,
        error: 'Storage creation failed',
      });

      const result = await taskOps.createTask(mockCreateParams, 'test-user');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to save task');
    });
  });

  describe('task operations with epic validation integration', () => {
    it('should get task successfully', async () => {
      const mockTask: AtomicTask = {
        id: 'T001',
        title: 'Test Task',
        description: 'Test description',
        status: 'pending' as TaskStatus,
        priority: 'medium' as TaskPriority,
        type: 'development' as TaskType,
        estimatedHours: 4,
        actualHours: 0,
        epicId: 'test-epic',
        projectId: 'test-project',
        dependencies: [],
        dependents: [],
        filePaths: [],
        acceptanceCriteria: [],
        testingRequirements: {
          unitTests: [],
          integrationTests: [],
          performanceTests: [],
          coverageTarget: 95,
        },
        performanceCriteria: {},
        qualityCriteria: {
          codeQuality: [],
          documentation: [],
          typeScript: true,
          eslint: true,
        },
        integrationCriteria: {
          compatibility: [],
          patterns: [],
        },
        validationMethods: {
          automated: [],
          manual: [],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        tags: [],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test-user',
          tags: [],
        },
      };

      mockStorageManager.getTask.mockResolvedValue({
        success: true,
        data: mockTask,
      });

      const result = await taskOps.getTask('T001');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTask);
      expect(mockStorageManager.getTask).toHaveBeenCalledWith('T001');
    });

    it('should list tasks with filtering', async () => {
      const mockTasks: AtomicTask[] = [
        {
          id: 'T001',
          title: 'Task 1',
          projectId: 'test-project',
          epicId: 'test-epic',
          status: 'pending' as TaskStatus,
          priority: 'high' as TaskPriority,
        } as AtomicTask,
      ];

      mockStorageManager.listTasks.mockResolvedValue({
        success: true,
        data: mockTasks,
      });

      const result = await taskOps.listTasks({
        projectId: 'test-project',
        status: 'pending',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTasks);
    });
  });
});
