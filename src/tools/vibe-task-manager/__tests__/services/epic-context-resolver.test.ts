import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { EpicContextResolver, EpicCreationParams, EpicContextResult } from '../../services/epic-context-resolver.js';
import { Epic, TaskPriority } from '../../types/task.js';

// Mock dependencies
vi.mock('../../core/storage/storage-manager.js');
vi.mock('../../core/operations/project-operations.js');
vi.mock('../../services/epic-service.js');
vi.mock('../../utils/id-generator.js');
vi.mock('../../../logger.js');

describe('EpicContextResolver', () => {
  let resolver: EpicContextResolver;
  let mockStorageManager: any;
  let mockProjectOperations: any;
  let mockEpicService: any;
  let mockIdGenerator: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    vi.resetAllMocks();

    // Setup mock implementations
    mockStorageManager = {
      epicExists: vi.fn(),
      getEpic: vi.fn(),
      getProject: vi.fn().mockResolvedValue({ success: true, data: { id: 'test-project', epicIds: [], metadata: {} } }),
      updateProject: vi.fn().mockResolvedValue({ success: true }),
      getTask: vi.fn(),
      updateTask: vi.fn(),
      updateEpic: vi.fn(),
      getDependenciesForTask: vi.fn().mockResolvedValue([])
    };

    mockProjectOperations = {
      getProject: vi.fn(),
      updateProject: vi.fn().mockResolvedValue({ success: true }),
    };

    mockEpicService = {
      createEpic: vi.fn(),
    };

    mockIdGenerator = {
      generateEpicId: vi.fn(),
    };

    // Setup the mocked modules to return our mock objects
    const { getStorageManager } = await import('../../core/storage/storage-manager.js');
    const { getProjectOperations } = await import('../../core/operations/project-operations.js');
    const { getEpicService } = await import('../../services/epic-service.js');
    const { getIdGenerator } = await import('../../utils/id-generator.js');

    vi.mocked(getStorageManager).mockResolvedValue(mockStorageManager);
    vi.mocked(getProjectOperations).mockReturnValue(mockProjectOperations);
    vi.mocked(getEpicService).mockReturnValue(mockEpicService);
    vi.mocked(getIdGenerator).mockReturnValue(mockIdGenerator);

    // Get fresh instance
    resolver = EpicContextResolver.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = EpicContextResolver.getInstance();
      const instance2 = EpicContextResolver.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('extractFunctionalArea', () => {
    it('should extract functional area from task tags', () => {
      const taskContext = {
        title: 'Create user registration',
        description: 'Implement user registration functionality',
        type: 'development' as const,
        tags: ['auth', 'backend']
      };

      const result = resolver.extractFunctionalArea(taskContext);
      expect(result).toBe('auth');
    });

    it('should extract functional area from task title', () => {
      const taskContext = {
        title: 'Implement video streaming player',
        description: 'Create video player component',
        type: 'development' as const,
        tags: []
      };

      const result = resolver.extractFunctionalArea(taskContext);
      expect(result).toBe('video');
    });

    it('should extract functional area from task description', () => {
      const taskContext = {
        title: 'Create component',
        description: 'Build API endpoint for user management',
        type: 'development' as const,
        tags: []
      };

      const result = resolver.extractFunctionalArea(taskContext);
      // 'auth' is detected because 'user' appears in the text and 'auth' comes before 'api' in the functional areas
      expect(result).toBe('auth');
    });

    it('should return null when no functional area detected', () => {
      const taskContext = {
        title: 'Random task',
        description: 'Some random work',
        type: 'development' as const,
        tags: []
      };

      const result = resolver.extractFunctionalArea(taskContext);
      expect(result).toBeNull();
    });

    it('should return null when no task context provided', () => {
      const result = resolver.extractFunctionalArea(undefined);
      expect(result).toBeNull();
    });

    it('should prioritize tags over text content', () => {
      const taskContext = {
        title: 'Create video player with authentication',
        description: 'Build video streaming with auth',
        type: 'development' as const,
        tags: ['documentation'] // documentation tag should take priority over auth/video in text
      };

      const result = resolver.extractFunctionalArea(taskContext);
      expect(result).toBe('docs');
    });
  });

  describe('resolveEpicContext', () => {
    const mockParams: EpicCreationParams = {
      projectId: 'test-project',
      functionalArea: 'auth',
      taskContext: {
        title: 'User authentication',
        description: 'Implement user login',
        type: 'development',
        tags: ['auth']
      },
      priority: 'high' as TaskPriority,
      estimatedHours: 8
    };

    it('should return existing epic when found', async () => {
      const mockProject = {
        id: 'test-project',
        epicIds: ['test-project-auth-epic'],
        name: 'Test Project'
      };

      const mockExistingEpic = {
        id: 'test-project-auth-epic',
        title: 'Auth Epic',
        metadata: { tags: ['auth'] }
      };

      mockProjectOperations.getProject.mockResolvedValue({
        success: true,
        data: mockProject
      });

      mockStorageManager.getEpic.mockResolvedValue({
        success: true,
        data: mockExistingEpic
      });

      const result = await resolver.resolveEpicContext(mockParams);

      expect(result).toEqual({
        epicId: 'test-project-auth-epic',
        epicName: 'Auth Epic',
        source: 'existing',
        confidence: 0.9,
        created: false
      });
    });

    it('should create functional area epic when none exists', async () => {
      const mockProject = {
        id: 'test-project',
        epicIds: [],
        name: 'Test Project'
      };

      mockProjectOperations.getProject.mockResolvedValue({
        success: true,
        data: mockProject
      });

      const mockCreatedEpic = {
        id: 'E001',
        title: 'Auth Epic',
        description: 'Epic for auth related tasks and features'
      };

      mockEpicService.createEpic.mockResolvedValue({
        success: true,
        data: mockCreatedEpic
      });

      mockProjectOperations.updateProject.mockResolvedValue({
        success: true
      });

      const result = await resolver.resolveEpicContext(mockParams);

      expect(result).toEqual({
        epicId: 'E002',
        epicName: 'Auth Epic',
        source: 'created',
        confidence: 0.8,
        created: true
      });

      expect(mockEpicService.createEpic).toHaveBeenCalledWith({
        title: 'Auth Epic',
        description: 'Epic for auth related tasks and features',
        projectId: 'test-project',
        priority: 'high',
        estimatedHours: 8,
        tags: ['auth', 'auto-created']
      }, 'epic-context-resolver');
    });

    it('should create main epic as fallback', async () => {
      const paramsWithoutFunctionalArea = {
        ...mockParams,
        functionalArea: undefined,
        taskContext: {
          title: 'Random task',
          description: 'Some work',
          type: 'development' as const,
          tags: []
        }
      };

      const mockProject = {
        id: 'test-project',
        epicIds: [],
        name: 'Test Project'
      };

      mockProjectOperations.getProject.mockResolvedValue({
        success: true,
        data: mockProject
      });

      const mockCreatedEpic = {
        id: 'E002',
        title: 'Main Epic',
        description: 'Main epic for project tasks and features'
      };

      mockEpicService.createEpic.mockResolvedValue({
        success: true,
        data: mockCreatedEpic
      });

      const result = await resolver.resolveEpicContext(paramsWithoutFunctionalArea);

      expect(result).toEqual({
        epicId: 'E002',
        epicName: 'Main Epic',
        source: 'created',
        confidence: 0.6,
        created: true
      });
    });

    it('should return fallback epic on error', async () => {
      // Make all operations fail to force fallback
      mockProjectOperations.getProject.mockRejectedValue(new Error('Database error'));
      mockEpicService.createEpic.mockRejectedValue(new Error('Epic service error'));

      const result = await resolver.resolveEpicContext(mockParams);

      expect(result).toEqual({
        epicId: 'test-project-main-epic',
        epicName: 'Main Epic',
        source: 'fallback',
        confidence: 0.1,
        created: false
      });
    });

    it('should handle epic creation failure gracefully', async () => {
      const mockProject = {
        id: 'test-project',
        epicIds: [],
        name: 'Test Project'
      };

      mockProjectOperations.getProject.mockResolvedValue({
        success: true,
        data: mockProject
      });

      mockEpicService.createEpic.mockResolvedValue({
        success: false,
        error: 'Epic creation failed'
      });

      const result = await resolver.resolveEpicContext(mockParams);

      expect(result).toEqual({
        epicId: 'test-project-main-epic',
        epicName: 'Main Epic',
        source: 'fallback',
        confidence: 0.1,
        created: false
      });
    });

    it('should update project epic association when creating epic', async () => {
      const mockProject = {
        id: 'test-project',
        epicIds: ['existing-epic'],
        name: 'Test Project',
        metadata: { updatedAt: new Date() }
      };

      mockProjectOperations.getProject.mockResolvedValue({
        success: true,
        data: mockProject
      });

      // Mock storage manager to return no match for existing epic
      mockStorageManager.getEpic.mockResolvedValue({
        success: true,
        data: {
          id: 'existing-epic',
          title: 'Existing Epic',
          metadata: { tags: ['other'] } // Different tag so it won't match 'auth'
        }
      });

      // Mock storage manager for project operations in updateProjectEpicAssociation
      mockStorageManager.getProject.mockResolvedValue({
        success: true,
        data: {
          ...mockProject,
          epicIds: ['existing-epic'], // Will be modified by the method
          metadata: { updatedAt: new Date() }
        }
      });

      mockStorageManager.updateProject.mockResolvedValue({
        success: true
      });

      const mockCreatedEpic = {
        id: 'E003',
        title: 'Auth Epic'
      };

      mockEpicService.createEpic.mockResolvedValue({
        success: true,
        data: mockCreatedEpic
      });

      await resolver.resolveEpicContext(mockParams);

      // Check that storage manager was called to update the project
      expect(mockStorageManager.updateProject).toHaveBeenCalled();
    });
  });

  describe('functional area detection patterns', () => {
    const testCases = [
      { input: 'auth login register', expected: 'auth' },
      { input: 'video stream media player', expected: 'video' },
      { input: 'api endpoint route controller', expected: 'api' },
      { input: 'documentation readme guide', expected: 'docs' },
      { input: 'ui component frontend interface', expected: 'ui' },
      { input: 'database db model schema', expected: 'database' },
      { input: 'test testing spec unit', expected: 'test' },
      { input: 'config configuration setup', expected: 'config' },
      { input: 'security permission access', expected: 'security' },
      { input: 'multilingual language locale', expected: 'multilingual' },
      { input: 'a11y wcag screen reader', expected: 'accessibility' },
      { input: 'interactive feature engagement', expected: 'interactive' }
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should detect ${expected} functional area from "${input}"`, () => {
        const taskContext = {
          title: input,
          description: '',
          type: 'development' as const,
          tags: []
        };

        const result = resolver.extractFunctionalArea(taskContext);
        expect(result).toBe(expected);
      });
    });
  });

  describe('bidirectional relationship management', () => {
    let mockTask: any;
    let mockEpic: any;
    let mockToEpic: any;

    beforeEach(() => {
      mockTask = {
        id: 'task-001',
        title: 'Test Task',
        epicId: 'epic-001',
        status: 'pending',
        metadata: { updatedAt: new Date() }
      };

      mockEpic = {
        id: 'epic-001',
        title: 'Source Epic',
        taskIds: ['task-001'],
        metadata: { updatedAt: new Date() }
      };

      mockToEpic = {
        id: 'epic-002',
        title: 'Destination Epic',
        taskIds: [],
        metadata: { updatedAt: new Date() }
      };
    });

    describe('addTaskToEpic', () => {
      it('should successfully add task to epic with bidirectional relationships', async () => {
        mockStorageManager.getTask.mockResolvedValue({
          success: true,
          data: mockTask
        });

        mockStorageManager.getEpic.mockResolvedValue({
          success: true,
          data: mockEpic
        });

        mockStorageManager.updateTask.mockResolvedValue({
          success: true,
          data: { ...mockTask, epicId: 'epic-001' }
        });

        mockStorageManager.updateEpic.mockResolvedValue({
          success: true,
          data: { ...mockEpic, taskIds: ['task-001'] }
        });

        const result = await resolver.addTaskToEpic('task-001', 'epic-001', 'test-project');

        expect(result.success).toBe(true);
        expect(result.epicId).toBe('epic-001');
        expect(result.taskId).toBe('task-001');
        expect(result.relationshipType).toBe('added');
        expect(result.metadata.epicProgress).toBeDefined();
        expect(result.metadata.taskCount).toBeDefined();
        expect(result.metadata.completedTaskCount).toBeDefined();

        // Verify task was updated
        expect(mockStorageManager.updateTask).toHaveBeenCalledWith('task-001', expect.objectContaining({
          epicId: 'epic-001'
        }));

        // Verify epic was updated
        expect(mockStorageManager.updateEpic).toHaveBeenCalledWith('epic-001', expect.objectContaining({
          taskIds: expect.arrayContaining(['task-001'])
        }));
      });

      it('should handle task or epic not found', async () => {
        mockStorageManager.getTask.mockResolvedValue({
          success: false,
          error: 'Task not found'
        });

        const result = await resolver.addTaskToEpic('invalid-task', 'epic-001', 'test-project');

        expect(result.success).toBe(false);
        expect(result.epicId).toBe('epic-001');
        expect(result.taskId).toBe('invalid-task');
        expect(result.relationshipType).toBe('added');
      });

      it('should prevent duplicate task additions', async () => {
        const epicWithTask = {
          ...mockEpic,
          taskIds: ['task-001'] // Task already exists
        };

        mockStorageManager.getTask.mockResolvedValue({
          success: true,
          data: mockTask
        });

        mockStorageManager.getEpic.mockResolvedValue({
          success: true,
          data: epicWithTask
        });

        mockStorageManager.updateTask.mockResolvedValue({
          success: true,
          data: mockTask
        });

        mockStorageManager.updateEpic.mockResolvedValue({
          success: true,
          data: epicWithTask
        });

        mockStorageManager.getDependenciesForTask.mockResolvedValue([]);

        const result = await resolver.addTaskToEpic('task-001', 'epic-001', 'test-project');

        expect(result.success).toBe(true);
        // Should not duplicate the task in taskIds
        expect(mockStorageManager.updateEpic).toHaveBeenCalledWith('epic-001', expect.objectContaining({
          taskIds: ['task-001'] // Should still be just one instance
        }));
      });
    });

    describe('moveTaskBetweenEpics', () => {
      it('should successfully move task between epics', async () => {
        const fromEpic = {
          ...mockEpic,
          taskIds: ['task-001']
        };

        const toEpic = {
          ...mockToEpic,
          taskIds: []
        };

        mockStorageManager.getTask.mockResolvedValue({
          success: true,
          data: mockTask
        });

        mockStorageManager.getEpic
          .mockResolvedValueOnce({ success: true, data: fromEpic })
          .mockResolvedValueOnce({ success: true, data: toEpic });

        mockStorageManager.updateTask.mockResolvedValue({
          success: true,
          data: { ...mockTask, epicId: 'epic-002' }
        });

        mockStorageManager.updateEpic.mockResolvedValue({
          success: true
        });

        mockStorageManager.getDependenciesForTask.mockResolvedValue([]);

        const result = await resolver.moveTaskBetweenEpics('task-001', 'epic-001', 'epic-002', 'test-project');

        expect(result.success).toBe(true);
        expect(result.epicId).toBe('epic-002');
        expect(result.taskId).toBe('task-001');
        expect(result.relationshipType).toBe('moved');
        expect(result.previousEpicId).toBe('epic-001');

        // Verify task epic was updated
        expect(mockStorageManager.updateTask).toHaveBeenCalledWith('task-001', expect.objectContaining({
          epicId: 'epic-002'
        }));

        // Verify both epics were updated
        expect(mockStorageManager.updateEpic).toHaveBeenCalledTimes(2);
      });

      it('should handle missing task gracefully', async () => {
        mockStorageManager.getTask.mockResolvedValue({
          success: false,
          error: 'Task not found'
        });

        const result = await resolver.moveTaskBetweenEpics('invalid-task', 'epic-001', 'epic-002', 'test-project');

        expect(result.success).toBe(false);
        expect(result.epicId).toBe('epic-002');
        expect(result.taskId).toBe('invalid-task');
        expect(result.relationshipType).toBe('moved');
        expect(result.previousEpicId).toBe('epic-001');
      });

      it('should handle missing source epic gracefully', async () => {
        mockStorageManager.getTask.mockResolvedValue({
          success: true,
          data: mockTask
        });

        mockStorageManager.getEpic
          .mockResolvedValueOnce({ success: false, error: 'Epic not found' })
          .mockResolvedValueOnce({ success: true, data: mockToEpic });

        mockStorageManager.updateTask.mockResolvedValue({
          success: true,
          data: { ...mockTask, epicId: 'epic-002' }
        });

        mockStorageManager.updateEpic.mockResolvedValue({
          success: true
        });

        mockStorageManager.getDependenciesForTask.mockResolvedValue([]);

        const result = await resolver.moveTaskBetweenEpics('task-001', 'epic-001', 'epic-002', 'test-project');

        expect(result.success).toBe(true);
        // Should still work even if source epic doesn't exist
        expect(result.epicId).toBe('epic-002');
      });
    });

    describe('calculateEpicProgress', () => {
      it('should calculate comprehensive epic progress metrics', async () => {
        const epicWithTasks = {
          ...mockEpic,
          taskIds: ['task-001', 'task-002', 'task-003']
        };

        const mockTasks = [
          { id: 'task-001', status: 'completed', estimatedHours: 8, filePaths: ['file1.ts'] },
          { id: 'task-002', status: 'in_progress', estimatedHours: 6, filePaths: ['file2.ts'] },
          { id: 'task-003', status: 'blocked', estimatedHours: 4, filePaths: ['file1.ts'] }
        ];

        mockStorageManager.getEpic.mockResolvedValue({
          success: true,
          data: epicWithTasks
        });

        mockStorageManager.getTask
          .mockResolvedValueOnce({ success: true, data: mockTasks[0] })
          .mockResolvedValueOnce({ success: true, data: mockTasks[1] })
          .mockResolvedValueOnce({ success: true, data: mockTasks[2] });

        mockStorageManager.getDependenciesForTask.mockResolvedValue([]);

        const result = await resolver.calculateEpicProgress('epic-001');

        expect(result.epicId).toBe('epic-001');
        expect(result.totalTasks).toBe(3);
        expect(result.completedTasks).toBe(1);
        expect(result.inProgressTasks).toBe(1);
        expect(result.blockedTasks).toBe(1);
        expect(result.progressPercentage).toBe(33); // 1 of 3 completed

        // Check resource utilization metrics
        expect(result.resourceUtilization).toBeDefined();
        expect(result.resourceUtilization.filePathConflicts).toBe(1); // file1.ts used by 2 tasks
        expect(result.resourceUtilization.dependencyComplexity).toBeDefined();
        expect(result.resourceUtilization.parallelizableTaskGroups).toBeDefined();
      });

      it('should handle epic with no tasks', async () => {
        const emptyEpic = {
          ...mockEpic,
          taskIds: []
        };

        mockStorageManager.getEpic.mockResolvedValue({
          success: true,
          data: emptyEpic
        });

        const result = await resolver.calculateEpicProgress('epic-001');

        expect(result.epicId).toBe('epic-001');
        expect(result.totalTasks).toBe(0);
        expect(result.completedTasks).toBe(0);
        expect(result.progressPercentage).toBe(0);
      });

      it('should handle epic not found', async () => {
        mockStorageManager.getEpic.mockResolvedValue({
          success: false,
          error: 'Epic not found'
        });

        const result = await resolver.calculateEpicProgress('invalid-epic');

        expect(result.epicId).toBe('invalid-epic');
        expect(result.totalTasks).toBe(0);
        expect(result.completedTasks).toBe(0);
        expect(result.progressPercentage).toBe(0);
      });
    });

    describe('updateEpicStatusFromTasks', () => {
      it('should update epic status to completed when all tasks completed', async () => {
        const epicWithCompletedTasks = {
          ...mockEpic,
          status: 'in_progress',
          taskIds: ['task-001', 'task-002']
        };

        const completedTasks = [
          { id: 'task-001', status: 'completed' },
          { id: 'task-002', status: 'completed' }
        ];

        mockStorageManager.getEpic.mockResolvedValue({
          success: true,
          data: epicWithCompletedTasks
        });

        mockStorageManager.getTask
          .mockResolvedValueOnce({ success: true, data: completedTasks[0] })
          .mockResolvedValueOnce({ success: true, data: completedTasks[1] });

        mockStorageManager.updateEpic.mockResolvedValue({
          success: true
        });

        mockStorageManager.getDependenciesForTask.mockResolvedValue([]);

        const result = await resolver.updateEpicStatusFromTasks('epic-001');

        expect(result).toBe(true);
        expect(mockStorageManager.updateEpic).toHaveBeenCalledWith('epic-001', expect.objectContaining({
          status: 'completed'
        }));
      });

      it('should update epic status to in_progress when some tasks started', async () => {
        const epicWithMixedTasks = {
          ...mockEpic,
          status: 'todo',
          taskIds: ['task-001', 'task-002']
        };

        const mixedTasks = [
          { id: 'task-001', status: 'completed' },
          { id: 'task-002', status: 'pending' }
        ];

        mockStorageManager.getEpic.mockResolvedValue({
          success: true,
          data: epicWithMixedTasks
        });

        mockStorageManager.getTask
          .mockResolvedValueOnce({ success: true, data: mixedTasks[0] })
          .mockResolvedValueOnce({ success: true, data: mixedTasks[1] });

        mockStorageManager.updateEpic.mockResolvedValue({
          success: true
        });

        mockStorageManager.getDependenciesForTask.mockResolvedValue([]);

        const result = await resolver.updateEpicStatusFromTasks('epic-001');

        expect(result).toBe(true);
        expect(mockStorageManager.updateEpic).toHaveBeenCalledWith('epic-001', expect.objectContaining({
          status: 'in_progress'
        }));
      });

      it('should update epic status to blocked when all tasks blocked', async () => {
        const epicWithBlockedTasks = {
          ...mockEpic,
          status: 'in_progress',
          taskIds: ['task-001', 'task-002']
        };

        const blockedTasks = [
          { id: 'task-001', status: 'blocked' },
          { id: 'task-002', status: 'blocked' }
        ];

        mockStorageManager.getEpic.mockResolvedValue({
          success: true,
          data: epicWithBlockedTasks
        });

        mockStorageManager.getTask
          .mockResolvedValueOnce({ success: true, data: blockedTasks[0] })
          .mockResolvedValueOnce({ success: true, data: blockedTasks[1] });

        mockStorageManager.updateEpic.mockResolvedValue({
          success: true
        });

        mockStorageManager.getDependenciesForTask.mockResolvedValue([]);

        const result = await resolver.updateEpicStatusFromTasks('epic-001');

        expect(result).toBe(true);
        expect(mockStorageManager.updateEpic).toHaveBeenCalledWith('epic-001', expect.objectContaining({
          status: 'blocked'
        }));
      });

      it('should return false when epic not found', async () => {
        mockStorageManager.getEpic.mockResolvedValue({
          success: false,
          error: 'Epic not found'
        });

        const result = await resolver.updateEpicStatusFromTasks('invalid-epic');

        expect(result).toBe(false);
        expect(mockStorageManager.updateEpic).not.toHaveBeenCalled();
      });

      it('should not update status if no change needed', async () => {
        const epicWithCorrectStatus = {
          ...mockEpic,
          status: 'completed',
          taskIds: ['task-001']
        };

        const completedTask = { id: 'task-001', status: 'completed' };

        mockStorageManager.getEpic.mockResolvedValue({
          success: true,
          data: epicWithCorrectStatus
        });

        mockStorageManager.getTask.mockResolvedValue({
          success: true,
          data: completedTask
        });

        mockStorageManager.getDependenciesForTask.mockResolvedValue([]);

        const result = await resolver.updateEpicStatusFromTasks('epic-001');

        expect(result).toBe(false); // No change needed
        expect(mockStorageManager.updateEpic).not.toHaveBeenCalled();
      });
    });

    describe('resource conflict detection', () => {
      it('should detect file path conflicts between tasks', async () => {
        const epicWithConflicts = {
          ...mockEpic,
          taskIds: ['task-001', 'task-002', 'task-003']
        };

        const conflictingTasks = [
          { id: 'task-001', status: 'pending', filePaths: ['shared.ts', 'file1.ts'] },
          { id: 'task-002', status: 'pending', filePaths: ['shared.ts', 'file2.ts'] },
          { id: 'task-003', status: 'pending', filePaths: ['file3.ts'] }
        ];

        mockStorageManager.getEpic.mockResolvedValue({
          success: true,
          data: epicWithConflicts
        });

        mockStorageManager.getTask
          .mockResolvedValueOnce({ success: true, data: conflictingTasks[0] })
          .mockResolvedValueOnce({ success: true, data: conflictingTasks[1] })
          .mockResolvedValueOnce({ success: true, data: conflictingTasks[2] });

        mockStorageManager.getDependenciesForTask.mockResolvedValue([]);

        const result = await resolver.calculateEpicProgress('epic-001');

        expect(result.resourceUtilization.filePathConflicts).toBe(1); // 'shared.ts' used by 2 tasks
      });

      it('should calculate dependency complexity', async () => {
        const epicWithDependencies = {
          ...mockEpic,
          taskIds: ['task-001', 'task-002']
        };

        const tasksWithDeps = [
          { id: 'task-001', status: 'pending' },
          { id: 'task-002', status: 'pending' }
        ];

        mockStorageManager.getEpic.mockResolvedValue({
          success: true,
          data: epicWithDependencies
        });

        mockStorageManager.getTask
          .mockResolvedValueOnce({ success: true, data: tasksWithDeps[0] })
          .mockResolvedValueOnce({ success: true, data: tasksWithDeps[1] });

        // Mock dependencies
        mockStorageManager.getDependenciesForTask
          .mockResolvedValueOnce([{ id: 'dep1' }, { id: 'dep2' }]) // task-001 has 2 deps
          .mockResolvedValueOnce([{ id: 'dep3' }]); // task-002 has 1 dep

        const result = await resolver.calculateEpicProgress('epic-001');

        expect(result.resourceUtilization.dependencyComplexity).toBeGreaterThan(0);
      });
    });
  });
});
