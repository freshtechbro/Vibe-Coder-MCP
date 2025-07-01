import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EpicService, CreateEpicParams, UpdateEpicParams, EpicQueryParams, getEpicService } from '../../services/epic-service.js';
import { Epic, AtomicTask, TaskStatus, TaskPriority, TaskType } from '../../types/task.js';

// Mock storage manager
vi.mock('../../core/storage/storage-manager.js', () => ({
  getStorageManager: vi.fn()
}));

// Mock task operations
vi.mock('../../core/operations/task-operations.js', () => ({
  getTaskOperations: vi.fn()
}));

// Mock ID generator
vi.mock('../../utils/id-generator.js', () => ({
  getIdGenerator: vi.fn()
}));

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('EpicService', () => {
  let epicService: EpicService;
  let mockStorageManager: Record<string, unknown>;
  let mockTaskOperations: Record<string, unknown>;
  let mockIdGenerator: Record<string, unknown>;

  const mockEpic: Epic = {
    id: 'E001',
    title: 'Test Epic',
    description: 'Complete user authentication system',
    status: 'pending',
    priority: 'high',
    projectId: 'PID-TEST-001',
    estimatedHours: 40,
    taskIds: ['T001', 'T002'],
    dependencies: [],
    dependents: [],
    metadata: {
      createdAt: new Date('2024-01-20'),
      updatedAt: new Date('2024-01-20'),
      createdBy: 'test-user',
      tags: ['authentication', 'security']
    }
  };

  const mockTask: AtomicTask = {
    id: 'T001',
    title: 'Implement login form',
    description: 'Create login form component',
    type: 'development' as TaskType,
    priority: 'high' as TaskPriority,
    status: 'pending' as TaskStatus,
    projectId: 'PID-TEST-001',
    epicId: 'E001',
    estimatedHours: 4,
    actualHours: 0,
    filePaths: ['src/components/LoginForm.tsx'],
    acceptanceCriteria: ['Form validates input', 'Form submits correctly'],
    tags: ['frontend', 'authentication'],
    dependencies: [],
    assignedAgent: null,
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date('2024-01-20'),
    createdBy: 'test-user'
  };

  beforeEach(async () => {
    // Clear singleton instance
    (EpicService as unknown as { instance: unknown }).instance = undefined;
    epicService = EpicService.getInstance();

    // Setup mocks
    const storageModule = await import('../../core/storage/storage-manager.js');
    const taskModule = await import('../../core/operations/task-operations.js');
    const idModule = await import('../../utils/id-generator.js');

    mockStorageManager = {
      projectExists: vi.fn(),
      createEpic: vi.fn(),
      getEpic: vi.fn(),
      updateEpic: vi.fn(),
      deleteEpic: vi.fn(),
      listEpics: vi.fn()
    };

    mockTaskOperations = {
      getTask: vi.fn()
    };

    mockIdGenerator = {
      generateEpicId: vi.fn()
    };

    vi.mocked(storageModule.getStorageManager).mockResolvedValue(mockStorageManager);
    vi.mocked(taskModule.getTaskOperations).mockReturnValue(mockTaskOperations);
    vi.mocked(idModule.getIdGenerator).mockReturnValue(mockIdGenerator);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = EpicService.getInstance();
      const instance2 = EpicService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should work with convenience function', () => {
      const instance1 = getEpicService();
      const instance2 = EpicService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('createEpic', () => {
    const createParams: CreateEpicParams = {
      title: 'Test Epic',
      description: 'Test epic description',
      projectId: 'PID-TEST-001',
      priority: 'high',
      estimatedHours: 40,
      tags: ['test'],
      dependencies: []
    };

    it('should create epic successfully', async () => {
      mockStorageManager.projectExists.mockResolvedValue(true);
      mockIdGenerator.generateEpicId.mockResolvedValue({
        success: true,
        id: 'E001'
      });
      mockStorageManager.createEpic.mockResolvedValue({
        success: true,
        data: mockEpic,
        metadata: { filePath: 'test', operation: 'create', timestamp: new Date() }
      });

      const result = await epicService.createEpic(createParams, 'test-user');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.title).toBe('Test Epic');
      expect(mockStorageManager.projectExists).toHaveBeenCalledWith('PID-TEST-001');
      expect(mockIdGenerator.generateEpicId).toHaveBeenCalledWith('PID-TEST-001');
      expect(mockStorageManager.createEpic).toHaveBeenCalled();
    });

    it('should fail when project does not exist', async () => {
      mockStorageManager.projectExists.mockResolvedValue(false);

      const result = await epicService.createEpic(createParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Project PID-TEST-001 not found');
    });

    it('should fail with invalid parameters', async () => {
      const invalidParams = {
        title: '', // Invalid: empty title
        description: 'Valid description',
        projectId: 'PID-TEST-001'
      };

      const result = await epicService.createEpic(invalidParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should fail when ID generation fails', async () => {
      mockStorageManager.projectExists.mockResolvedValue(true);
      mockIdGenerator.generateEpicId.mockResolvedValue({
        success: false,
        error: 'ID generation failed'
      });

      const result = await epicService.createEpic(createParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to generate epic ID');
    });

    it('should fail when storage creation fails', async () => {
      mockStorageManager.projectExists.mockResolvedValue(true);
      mockIdGenerator.generateEpicId.mockResolvedValue({
        success: true,
        id: 'E001'
      });
      mockStorageManager.createEpic.mockResolvedValue({
        success: false,
        error: 'Storage error',
        metadata: { filePath: 'test', operation: 'create', timestamp: new Date() }
      });

      const result = await epicService.createEpic(createParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to save epic');
    });
  });

  describe('getEpic', () => {
    it('should get epic successfully', async () => {
      mockStorageManager.getEpic.mockResolvedValue({
        success: true,
        data: mockEpic,
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      const result = await epicService.getEpic('E001');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockEpic);
      expect(mockStorageManager.getEpic).toHaveBeenCalledWith('E001');
    });

    it('should fail when epic not found', async () => {
      mockStorageManager.getEpic.mockResolvedValue({
        success: false,
        error: 'Epic not found',
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      const result = await epicService.getEpic('E999');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Epic not found');
    });
  });

  describe('updateEpic', () => {
    const updateParams: UpdateEpicParams = {
      title: 'Updated Epic Title',
      status: 'in_progress',
      priority: 'critical'
    };

    it('should update epic successfully', async () => {
      const updatedEpic = { ...mockEpic, ...updateParams };
      mockStorageManager.updateEpic.mockResolvedValue({
        success: true,
        data: updatedEpic,
        metadata: { filePath: 'test', operation: 'update', timestamp: new Date() }
      });

      const result = await epicService.updateEpic('E001', updateParams, 'test-user');

      expect(result.success).toBe(true);
      expect(result.data!.title).toBe(updateParams.title);
      expect(result.data!.status).toBe(updateParams.status);
      expect(mockStorageManager.updateEpic).toHaveBeenCalledWith('E001', expect.objectContaining(updateParams));
    });

    it('should fail with invalid update parameters', async () => {
      const invalidParams = {
        title: '', // Invalid: empty title
        status: 'invalid_status' as TaskStatus // Invalid status
      };

      const result = await epicService.updateEpic('E001', invalidParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should fail when storage update fails', async () => {
      mockStorageManager.updateEpic.mockResolvedValue({
        success: false,
        error: 'Update failed',
        metadata: { filePath: 'test', operation: 'update', timestamp: new Date() }
      });

      const result = await epicService.updateEpic('E001', updateParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to update epic');
    });
  });

  describe('deleteEpic', () => {
    it('should delete epic successfully', async () => {
      mockStorageManager.deleteEpic.mockResolvedValue({
        success: true,
        metadata: { filePath: 'test', operation: 'delete', timestamp: new Date() }
      });

      const result = await epicService.deleteEpic('E001', 'test-user');

      expect(result.success).toBe(true);
      expect(mockStorageManager.deleteEpic).toHaveBeenCalledWith('E001');
    });

    it('should fail when storage deletion fails', async () => {
      mockStorageManager.deleteEpic.mockResolvedValue({
        success: false,
        error: 'Delete failed',
        metadata: { filePath: 'test', operation: 'delete', timestamp: new Date() }
      });

      const result = await epicService.deleteEpic('E001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to delete epic');
    });
  });

  describe('listEpics', () => {
    const mockEpics = [mockEpic, { ...mockEpic, id: 'E002', title: 'Another Epic' }];

    it('should list epics successfully', async () => {
      mockStorageManager.listEpics.mockResolvedValue({
        success: true,
        data: mockEpics,
        metadata: { filePath: 'test', operation: 'list', timestamp: new Date() }
      });

      const result = await epicService.listEpics();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(mockStorageManager.listEpics).toHaveBeenCalledWith(undefined);
    });

    it('should list epics with project filter', async () => {
      mockStorageManager.listEpics.mockResolvedValue({
        success: true,
        data: mockEpics,
        metadata: { filePath: 'test', operation: 'list', timestamp: new Date() }
      });

      const query: EpicQueryParams = { projectId: 'PID-TEST-001' };
      const result = await epicService.listEpics(query);

      expect(result.success).toBe(true);
      expect(mockStorageManager.listEpics).toHaveBeenCalledWith('PID-TEST-001');
    });

    it('should apply additional filters', async () => {
      const epicsWithDifferentStatus = [
        { ...mockEpic, status: 'pending' as TaskStatus },
        { ...mockEpic, id: 'E002', status: 'completed' as TaskStatus }
      ];

      mockStorageManager.listEpics.mockResolvedValue({
        success: true,
        data: epicsWithDifferentStatus,
        metadata: { filePath: 'test', operation: 'list', timestamp: new Date() }
      });

      const query: EpicQueryParams = { status: 'pending' };
      const result = await epicService.listEpics(query);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].status).toBe('pending');
    });

    it('should fail when storage listing fails', async () => {
      mockStorageManager.listEpics.mockResolvedValue({
        success: false,
        error: 'List failed',
        metadata: { filePath: 'test', operation: 'list', timestamp: new Date() }
      });

      const result = await epicService.listEpics();

      expect(result.success).toBe(false);
      expect(result.error).toContain('List failed');
    });
  });

  describe('addTaskToEpic', () => {
    it('should add task to epic successfully', async () => {
      mockStorageManager.getEpic.mockResolvedValue({
        success: true,
        data: mockEpic,
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      mockTaskOperations.getTask.mockResolvedValue({
        success: true,
        data: mockTask,
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      const updatedEpic = { ...mockEpic, taskIds: [...mockEpic.taskIds, 'T003'] };
      mockStorageManager.updateEpic.mockResolvedValue({
        success: true,
        data: updatedEpic,
        metadata: { filePath: 'test', operation: 'update', timestamp: new Date() }
      });

      const result = await epicService.addTaskToEpic('E001', 'T003');

      expect(result.success).toBe(true);
      expect(mockStorageManager.getEpic).toHaveBeenCalledWith('E001');
      expect(mockTaskOperations.getTask).toHaveBeenCalledWith('T003');
    });

    it('should fail when epic not found', async () => {
      mockStorageManager.getEpic.mockResolvedValue({
        success: false,
        error: 'Epic not found',
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      const result = await epicService.addTaskToEpic('E999', 'T003');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Epic not found');
    });

    it('should fail when task not found', async () => {
      mockStorageManager.getEpic.mockResolvedValue({
        success: true,
        data: mockEpic,
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      mockTaskOperations.getTask.mockResolvedValue({
        success: false,
        error: 'Task not found',
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      const result = await epicService.addTaskToEpic('E001', 'T999');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Task not found');
    });

    it('should fail when task already in epic', async () => {
      mockStorageManager.getEpic.mockResolvedValue({
        success: true,
        data: mockEpic,
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      const result = await epicService.addTaskToEpic('E001', 'T001'); // T001 already in epic

      expect(result.success).toBe(false);
      expect(result.error).toContain('Task T001 is already in epic E001');
    });
  });

  describe('removeTaskFromEpic', () => {
    it('should remove task from epic successfully', async () => {
      mockStorageManager.getEpic.mockResolvedValue({
        success: true,
        data: mockEpic,
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      const updatedEpic = { ...mockEpic, taskIds: ['T002'] }; // T001 removed
      mockStorageManager.updateEpic.mockResolvedValue({
        success: true,
        data: updatedEpic,
        metadata: { filePath: 'test', operation: 'update', timestamp: new Date() }
      });

      const result = await epicService.removeTaskFromEpic('E001', 'T001');

      expect(result.success).toBe(true);
      expect(mockStorageManager.getEpic).toHaveBeenCalledWith('E001');
      expect(mockStorageManager.updateEpic).toHaveBeenCalled();
    });

    it('should fail when epic not found', async () => {
      mockStorageManager.getEpic.mockResolvedValue({
        success: false,
        error: 'Epic not found',
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      const result = await epicService.removeTaskFromEpic('E999', 'T001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Epic not found');
    });

    it('should fail when task not in epic', async () => {
      mockStorageManager.getEpic.mockResolvedValue({
        success: true,
        data: mockEpic,
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      const result = await epicService.removeTaskFromEpic('E001', 'T999'); // T999 not in epic

      expect(result.success).toBe(false);
      expect(result.error).toContain('Task T999 is not in epic E001');
    });
  });

  describe('getEpicProgress', () => {
    it('should calculate epic progress correctly', async () => {
      const tasksInEpic = [
        { ...mockTask, id: 'T001', status: 'completed' as TaskStatus, estimatedHours: 4, actualHours: 4 },
        { ...mockTask, id: 'T002', status: 'in_progress' as TaskStatus, estimatedHours: 6, actualHours: 2 },
        { ...mockTask, id: 'T003', status: 'pending' as TaskStatus, estimatedHours: 8, actualHours: 0 },
        { ...mockTask, id: 'T004', status: 'blocked' as TaskStatus, estimatedHours: 4, actualHours: 1 }
      ];

      const epicWithTasks = { ...mockEpic, taskIds: ['T001', 'T002', 'T003', 'T004'] };

      mockStorageManager.getEpic.mockResolvedValue({
        success: true,
        data: epicWithTasks,
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      tasksInEpic.forEach((task, _index) => {
        mockTaskOperations.getTask.mockResolvedValueOnce({
          success: true,
          data: task,
          metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
        });
      });

      const result = await epicService.getEpicProgress('E001');

      expect(result.success).toBe(true);
      expect(result.data!.totalTasks).toBe(4);
      expect(result.data!.completedTasks).toBe(1);
      expect(result.data!.inProgressTasks).toBe(1);
      expect(result.data!.pendingTasks).toBe(1);
      expect(result.data!.blockedTasks).toBe(1);
      expect(result.data!.progressPercentage).toBe(25); // 1/4 * 100
      expect(result.data!.estimatedHours).toBe(22); // 4+6+8+4
      expect(result.data!.actualHours).toBe(7); // 4+2+0+1
      expect(result.data!.remainingHours).toBe(15); // 22-7
    });

    it('should handle epic with no tasks', async () => {
      const epicWithNoTasks = { ...mockEpic, taskIds: [] };

      mockStorageManager.getEpic.mockResolvedValue({
        success: true,
        data: epicWithNoTasks,
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      const result = await epicService.getEpicProgress('E001');

      expect(result.success).toBe(true);
      expect(result.data!.totalTasks).toBe(0);
      expect(result.data!.progressPercentage).toBe(0);
      expect(result.data!.estimatedHours).toBe(0);
      expect(result.data!.actualHours).toBe(0);
      expect(result.data!.remainingHours).toBe(0);
    });

    it('should fail when epic not found', async () => {
      mockStorageManager.getEpic.mockResolvedValue({
        success: false,
        error: 'Epic not found',
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      const result = await epicService.getEpicProgress('E999');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Epic not found');
    });

    it('should handle missing tasks gracefully', async () => {
      const epicWithTasks = { ...mockEpic, taskIds: ['T001', 'T999'] }; // T999 doesn't exist

      mockStorageManager.getEpic.mockResolvedValue({
        success: true,
        data: epicWithTasks,
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      mockTaskOperations.getTask
        .mockResolvedValueOnce({
          success: true,
          data: mockTask,
          metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Task not found',
          metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
        });

      const result = await epicService.getEpicProgress('E001');

      expect(result.success).toBe(true);
      expect(result.data!.totalTasks).toBe(1); // Only T001 found
    });
  });

  describe('validation', () => {
    it('should validate create epic parameters', async () => {
      const invalidParams = {
        title: '', // Invalid: empty
        description: 'Valid description',
        projectId: '', // Invalid: empty
        priority: 'invalid' as TaskPriority, // Invalid priority
        estimatedHours: -5, // Invalid: negative
        tags: 'not-array', // Invalid: not array
        dependencies: 'not-array' // Invalid: not array
      };

      const result = await epicService.createEpic(invalidParams as unknown);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should validate update epic parameters', async () => {
      const invalidParams = {
        title: '', // Invalid: empty
        status: 'invalid' as TaskStatus, // Invalid status
        priority: 'invalid' as TaskPriority, // Invalid priority
        estimatedHours: -5, // Invalid: negative
        tags: 'not-array', // Invalid: not array
        dependencies: 'not-array' // Invalid: not array
      };

      const result = await epicService.updateEpic('E001', invalidParams as unknown);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });
  });
});
