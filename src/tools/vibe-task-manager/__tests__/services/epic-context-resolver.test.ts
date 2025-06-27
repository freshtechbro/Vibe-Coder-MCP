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
});
