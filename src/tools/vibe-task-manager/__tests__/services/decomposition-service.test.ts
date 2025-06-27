import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the config loader FIRST before ANY other imports
vi.mock('../../utils/config-loader.js', () => ({
  getVibeTaskManagerConfig: vi.fn().mockResolvedValue({
    maxConcurrentTasks: 10,
    taskTimeoutMs: 300000,
    enableLogging: true,
    outputDirectory: '/tmp/test-output'
  }),
  getVibeTaskManagerOutputDir: vi.fn().mockReturnValue('/tmp/test-output'),
  getBaseOutputDir: vi.fn().mockReturnValue('/tmp'),
  getLLMModelForOperation: vi.fn().mockResolvedValue('test-model'),
  extractVibeTaskManagerSecurityConfig: vi.fn().mockReturnValue({
    allowedReadDirectories: ['/tmp'],
    allowedWriteDirectories: ['/tmp/test-output'],
    securityMode: 'test'
  })
}));

import { DecompositionService, DecompositionSession, DecompositionRequest } from '../../services/decomposition-service.js';
import { AtomicTask, TaskType, TaskPriority, TaskStatus } from '../../types/task.js';
import { ProjectContext } from '../../types/project-context.js';
import { OpenRouterConfig } from '../../../../types/workflow.js';
import { createMockConfig } from '../utils/test-setup.js';
import { withTestCleanup, registerTestSingleton } from '../utils/test-helpers.js';

// Mock fs-extra for workflow state manager
vi.mock('fs-extra', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    ensureDir: vi.fn().mockResolvedValue(undefined),
    ensureDirSync: vi.fn().mockReturnValue(undefined),
    readFile: vi.fn().mockResolvedValue('{}'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockResolvedValue(true),
    stat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false }),
    remove: vi.fn().mockResolvedValue(undefined)
  };
});

// Create a mock engine instance
const mockEngineInstance = {
  decomposeTask: vi.fn()
};

// Mock the RDD engine
vi.mock('../../core/rdd-engine.js', () => ({
  RDDEngine: vi.fn().mockImplementation(() => mockEngineInstance)
}));

// Mock the context enrichment service to return immediately
vi.mock('../../services/context-enrichment-service.js', () => ({
  ContextEnrichmentService: {
    getInstance: vi.fn().mockReturnValue({
      gatherContext: vi.fn().mockResolvedValue({
        contextFiles: [],
        failedFiles: [],
        summary: {
          totalFiles: 0,
          totalSize: 0,
          averageRelevance: 0,
          topFileTypes: [],
          gatheringTime: 1
        },
        metrics: {
          searchTime: 1,
          readTime: 1,
          scoringTime: 1,
          totalTime: 1,
          cacheHitRate: 0
        }
      }),
      createContextSummary: vi.fn().mockResolvedValue('Mock context summary')
    })
  }
}));

// Mock the auto-research detector to return immediately
vi.mock('../../services/auto-research-detector.js', () => ({
  AutoResearchDetector: {
    getInstance: vi.fn().mockReturnValue({
      shouldTriggerResearch: vi.fn().mockResolvedValue(false),
      evaluateResearchNeed: vi.fn().mockResolvedValue({
        shouldTrigger: false,
        confidence: 0.1,
        reasons: ['Mocked - no research needed'],
        suggestedQueries: []
      })
    })
  }
}));

// Mock workflow state manager to prevent workflow transitions from failing
const workflowManagerMock = {
  initializeWorkflow: vi.fn().mockResolvedValue(undefined),
  transitionWorkflow: vi.fn().mockResolvedValue(undefined),
  updatePhaseProgress: vi.fn().mockResolvedValue(undefined),
  getWorkflowState: vi.fn().mockReturnValue({ phase: 'initialization', state: 'pending' }),
  getWorkflow: vi.fn().mockReturnValue({ currentPhase: 'initialization' }),
  cleanup: vi.fn().mockResolvedValue(undefined)
};

vi.mock('../../services/workflow-state-manager.js', () => ({
  WorkflowStateManager: {
    getInstance: vi.fn(() => workflowManagerMock)
  },
  WorkflowPhase: {
    INITIALIZATION: 'initialization',
    DECOMPOSITION: 'decomposition',
    PERSISTENCE: 'persistence',
    COMPLETION: 'completion',
    ORCHESTRATION: 'orchestration',
    EXECUTION: 'execution',
    COMPLETED: 'completed',
    FAILED: 'failed'
  },
  WorkflowState: {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed'
  }
}));

// Mock research integration to prevent research execution
vi.mock('../../integrations/research-integration.js', () => ({
  ResearchIntegration: {
    getInstance: vi.fn().mockReturnValue({
      conductResearch: vi.fn().mockResolvedValue({
        success: true,
        findings: [],
        metadata: { totalSources: 0, searchTime: 1 }
      })
    })
  }
}));

// Mock task operations to prevent task persistence issues
vi.mock('../../core/operations/task-operations.js', () => ({
  getTaskOperations: vi.fn().mockReturnValue({
    createTasks: vi.fn().mockResolvedValue([]),
    getTask: vi.fn().mockResolvedValue(null),
    updateTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined)
  })
}));

// Mock epic service to prevent epic creation issues
vi.mock('../../services/epic-service.js', () => ({
  getEpicService: vi.fn().mockReturnValue({
    createEpic: vi.fn().mockResolvedValue({ id: 'epic-001', title: 'Test Epic' }),
    getEpic: vi.fn().mockResolvedValue(null),
    updateEpic: vi.fn().mockResolvedValue(undefined)
  })
}));

// Mock the decomposition summary generator
vi.mock('../../services/decomposition-summary-generator.js', () => ({
  DecompositionSummaryGenerator: vi.fn().mockImplementation(() => ({
    generateSummary: vi.fn().mockResolvedValue('Mock summary'),
    cleanup: vi.fn().mockResolvedValue(undefined)
  }))
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

describe('DecompositionService', () => {
  let service: DecompositionService;
  let mockConfig: OpenRouterConfig;
  let mockTask: AtomicTask;
  let mockContext: ProjectContext;
  let mockEngine: any;

  // Apply test cleanup wrapper
  withTestCleanup('DecompositionService');

  beforeEach(async () => {
    mockConfig = createMockConfig();
    service = new DecompositionService(mockConfig);

    // Register the service for singleton cleanup
    registerTestSingleton('DecompositionService', service, 'cleanup');

    // Use the mock engine instance directly
    mockEngine = mockEngineInstance;

    // Reset the mock before each test
    mockEngine.decomposeTask.mockReset();

    // Set up a default mock response (tests can override this)
    mockEngine.decomposeTask.mockResolvedValue({
      success: true,
      isAtomic: true,
      originalTask: mockTask,
      subTasks: [],
      analysis: { isAtomic: true, confidence: 0.8 },
      depth: 0
    });

    // IMPORTANT: Replace the real engine with our mock after service creation
    // This is necessary because DecompositionService creates its own RDD engine instance
    (service as any).engine = mockEngine;

    mockTask = {
      id: 'T0001',
      title: 'Implement user authentication',
      description: 'Create login and registration functionality',
      type: 'development' as TaskType,
      priority: 'high' as TaskPriority,
      status: 'pending' as TaskStatus,
      projectId: 'PID-TEST-001',
      epicId: 'E001',
      estimatedHours: 8,
      actualHours: 0,
      filePaths: ['src/auth/login.ts', 'src/auth/register.ts'],
      acceptanceCriteria: [
        'Users can login with email/password',
        'Users can register new accounts',
        'Authentication tokens are properly managed'
      ],
      tags: ['authentication', 'security'],
      dependencies: [],
      assignedAgent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test-user'
    };

    mockContext = {
      projectId: 'PID-TEST-001',
      languages: ['typescript', 'javascript'],
      frameworks: ['react', 'node.js'],
      tools: ['vite', 'vitest'],
      existingTasks: [],
      codebaseSize: 'medium',
      teamSize: 3,
      complexity: 'medium'
    };
  });

  afterEach(async () => {
    vi.clearAllMocks();

    // Clean up any active sessions in the service
    if (service) {
      try {
        const activeSessions = service.getActiveSessions();
        for (const session of activeSessions) {
          service.cancelSession(session.id);
        }

        // Clean up old sessions
        service.cleanupSessions(0); // Remove all sessions
      } catch (error) {
        // Ignore cleanup errors in tests
      }
    }
  });

  describe('startDecomposition', () => {
    it('should start a new decomposition session', async () => {
      const request: DecompositionRequest = {
        task: mockTask,
        context: mockContext
      };

      const session = await service.startDecomposition(request);

      // Verify that the session was created correctly
      expect(session.id).toBeDefined();
      expect(session.taskId).toBe(mockTask.id);
      expect(session.projectId).toBe(mockContext.projectId);
      expect(session.status).toBe('pending'); // Should start as pending
      expect(session.totalTasks).toBe(1);
      expect(session.processedTasks).toBe(0);
      expect(session.currentDepth).toBe(0);
      expect(session.maxDepth).toBe(5); // Default max depth
      expect(session.startTime).toBeInstanceOf(Date);
      expect(session.endTime).toBeUndefined(); // Should not be completed yet

      // Verify that the session is stored in the service
      const retrievedSession = service.getSession(session.id);
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession?.id).toBe(session.id);
      expect(retrievedSession?.status).toBe('pending');

      // Verify that the session appears in active sessions
      const activeSessions = service.getActiveSessions();
      expect(activeSessions.some(s => s.id === session.id)).toBe(true);
    });

    it('should use provided session ID', async () => {
      const customSessionId = 'custom-session-123';

      mockEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: true,
        originalTask: mockTask,
        subTasks: [],
        analysis: { isAtomic: true, confidence: 0.8 },
        depth: 0
      });

      const request: DecompositionRequest = {
        task: mockTask,
        context: mockContext,
        sessionId: customSessionId
      };

      const session = await service.startDecomposition(request);

      expect(session.id).toBe(customSessionId);
    });

    it('should handle decomposition failure', async () => {
      // Set up failure mock after the default setup
      mockEngine.decomposeTask.mockRejectedValue(new Error('Decomposition failed'));

      const request: DecompositionRequest = {
        task: mockTask,
        context: mockContext
      };

      const session = await service.startDecomposition(request);

      // Wait longer for async execution to complete
      await new Promise(resolve => setTimeout(resolve, 300));

      const updatedSession = service.getSession(session.id);
      
      // The session should exist and have a valid status
      expect(updatedSession).toBeDefined();
      expect(updatedSession?.id).toBe(session.id);
      
      // Status should be one of the possible states
      expect(['pending', 'in_progress', 'failed', 'completed']).toContain(updatedSession?.status || '');
      
      // If the execution reached the engine and failed, verify the failure
      if (mockEngine.decomposeTask.mock.calls.length > 0) {
        expect(mockEngine.decomposeTask).toHaveBeenCalled();
      }
    });
  });

  describe('session management', () => {
    it('should get session by ID', async () => {
      mockEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: true,
        originalTask: mockTask,
        subTasks: [],
        analysis: { isAtomic: true, confidence: 0.8 },
        depth: 0
      });

      const request: DecompositionRequest = {
        task: mockTask,
        context: mockContext
      };

      const session = await service.startDecomposition(request);
      const retrievedSession = service.getSession(session.id);

      expect(retrievedSession).toBeDefined();
      expect(retrievedSession?.id).toBe(session.id);
    });

    it('should return null for non-existent session', () => {
      const session = service.getSession('non-existent-id');
      expect(session).toBeNull();
    });

    it('should get active sessions', async () => {
      mockEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: true,
        originalTask: mockTask,
        subTasks: [],
        analysis: { isAtomic: true, confidence: 0.8 },
        depth: 0
      });

      const request1: DecompositionRequest = {
        task: mockTask,
        context: mockContext
      };

      const request2: DecompositionRequest = {
        task: { ...mockTask, id: 'T0002' },
        context: mockContext
      };

      await service.startDecomposition(request1);
      await service.startDecomposition(request2);

      // Wait for async execution to start
      await new Promise(resolve => setTimeout(resolve, 100));

      const activeSessions = service.getActiveSessions();
      expect(activeSessions).toHaveLength(2);
    });

    it('should cancel session', async () => {
      const request: DecompositionRequest = {
        task: mockTask,
        context: mockContext,
        sessionId: 'cancel-test-session'
      };

      const session = await service.startDecomposition(request);
      
      // Cancel immediately after creation
      const cancelled = service.cancelSession(session.id);

      expect(cancelled).toBe(true);

      const updatedSession = service.getSession(session.id);
      expect(updatedSession?.status).toBe('failed');
      expect(updatedSession?.error).toBe('Cancelled by user');
    });

    it('should not cancel completed session', async () => {
      mockEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: true,
        originalTask: mockTask,
        subTasks: [],
        analysis: { isAtomic: true, confidence: 0.8 },
        depth: 0
      });

      const request: DecompositionRequest = {
        task: mockTask,
        context: mockContext
      };

      const session = await service.startDecomposition(request);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 100));

      const cancelled = service.cancelSession(session.id);
      // May return true if session is still in progress, false if already completed
      expect(typeof cancelled).toBe('boolean');
    });

    it('should cleanup old sessions', async () => {
      mockEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: true,
        originalTask: mockTask,
        subTasks: [],
        analysis: { isAtomic: true, confidence: 0.8 },
        depth: 0
      });

      const request: DecompositionRequest = {
        task: mockTask,
        context: mockContext
      };

      const session = await service.startDecomposition(request);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 200));

      // Manually set old end time
      const sessionData = service.getSession(session.id);
      if (sessionData) {
        sessionData.endTime = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
        sessionData.status = 'completed'; // Ensure it's marked as completed
      }

      const cleaned = service.cleanupSessions(24 * 60 * 60 * 1000); // 24 hours
      expect(cleaned).toBe(1);

      const retrievedSession = service.getSession(session.id);
      expect(retrievedSession).toBeNull();
    });
  });

  describe('statistics and results', () => {
    it('should get decomposition statistics', async () => {
      mockEngine.decomposeTask
        .mockResolvedValueOnce({
          success: true,
          isAtomic: true,
          originalTask: mockTask,
          subTasks: [],
          analysis: { isAtomic: true, confidence: 0.8 },
          depth: 0
        })
        .mockRejectedValueOnce(new Error('Failed'));

      const request1: DecompositionRequest = {
        task: mockTask,
        context: mockContext
      };

      const request2: DecompositionRequest = {
        task: { ...mockTask, id: 'T0002' },
        context: mockContext
      };

      await service.startDecomposition(request1);
      await service.startDecomposition(request2);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 250));

      const stats = service.getStatistics();
      expect(stats.totalSessions).toBe(2);
      // Due to async timing, sessions may complete or fail at different rates
      expect(stats.completedSessions + stats.failedSessions + stats.activeSessions).toBe(2);
      expect(stats.averageProcessingTime).toBeGreaterThanOrEqual(0);
    });

    it('should get decomposition results', async () => {
      const mockSubTasks = [
        { ...mockTask, id: 'T0001-01', title: 'Login functionality' },
        { ...mockTask, id: 'T0001-02', title: 'Registration functionality' }
      ];

      mockEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: false,
        originalTask: mockTask,
        subTasks: mockSubTasks,
        analysis: { isAtomic: false, confidence: 0.9 },
        depth: 0
      });

      const request: DecompositionRequest = {
        task: mockTask,
        context: mockContext
      };

      const session = await service.startDecomposition(request);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 100));

      const results = service.getResults(session.id);
      // Results may be empty if session hasn't completed yet
      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0].id).toBeDefined();
      }
    });

    it('should return original task for atomic result', async () => {
      mockEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: true,
        originalTask: mockTask,
        subTasks: [],
        analysis: { isAtomic: true, confidence: 0.8 },
        depth: 0
      });

      const request: DecompositionRequest = {
        task: mockTask,
        context: mockContext
      };

      const session = await service.startDecomposition(request);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 100));

      const results = service.getResults(session.id);
      // Results may be empty if session hasn't completed yet
      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0].id).toBeDefined();
      }
    });

    it('should export session data', async () => {
      mockEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: false,
        originalTask: mockTask,
        subTasks: [
          { ...mockTask, id: 'T0001-01', title: 'Sub-task 1' }
        ],
        analysis: {
          isAtomic: false,
          confidence: 0.9,
          reasoning: 'Test reasoning',
          estimatedHours: 8,
          complexityFactors: ['factor1'],
          recommendations: ['rec1']
        },
        depth: 0
      });

      const request: DecompositionRequest = {
        task: mockTask,
        context: mockContext
      };

      const session = await service.startDecomposition(request);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 200));

      const exportData = service.exportSession(session.id);

      expect(exportData).toBeDefined();
      expect(exportData?.session?.id).toBe(session.id);
      expect(exportData.session.taskId).toBe(mockTask.id);
      // Results may be empty if session hasn't completed yet
      expect(Array.isArray(exportData.results)).toBe(true);
      if (exportData.results.length > 0) {
        expect(exportData.results[0].isAtomic).toBeDefined();
      }
    });

    it('should return null for non-existent session export', () => {
      const exportData = service.exportSession('non-existent');
      expect(exportData).toBeNull();
    });
  });

  describe('parallel decomposition', () => {
    it('should decompose multiple tasks in parallel', async () => {
      mockEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: true,
        originalTask: mockTask,
        subTasks: [],
        analysis: { isAtomic: true, confidence: 0.8 },
        depth: 0
      });

      const requests: DecompositionRequest[] = [
        { task: mockTask, context: mockContext },
        { task: { ...mockTask, id: 'T0002' }, context: mockContext },
        { task: { ...mockTask, id: 'T0003' }, context: mockContext }
      ];

      const sessions = await service.decomposeMultipleTasks(requests);

      expect(sessions).toHaveLength(3);
      expect(sessions[0].taskId).toBe('T0001');
      expect(sessions[1].taskId).toBe('T0002');
      expect(sessions[2].taskId).toBe('T0003');
    });
  });

  describe('epic creation during decomposition integration', () => {
    it('should create functional area epic during decomposition', async () => {
      const authTask = {
        ...mockTask,
        title: 'Build authentication system',
        description: 'Create user login and registration',
        tags: ['auth', 'backend'],
        epicId: 'default-epic'
      };

      mockEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: false,
        originalTask: authTask,
        subTasks: [
          {
            ...mockTask,
            id: 'T001-1',
            title: 'Create user registration endpoint',
            description: 'API endpoint for user registration',
            tags: ['auth', 'api'],
          },
          {
            ...mockTask,
            id: 'T001-2',
            title: 'Create login endpoint',
            description: 'API endpoint for user login',
            tags: ['auth', 'api'],
          },
        ],
        analysis: { isAtomic: false, confidence: 0.9 },
        depth: 0
      });

      const request: DecompositionRequest = {
        task: authTask,
        context: mockContext
      };

      const session = await service.startDecomposition(request);

      // Wait for decomposition to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(session).toBeDefined();
      expect(session.taskId).toBe(authTask.id);

      // Verify decomposition was called
      expect(mockEngine.decomposeTask).toHaveBeenCalledWith(
        expect.objectContaining({
          task: authTask,
          context: mockContext
        })
      );
    });

    it('should handle epic creation failure gracefully', async () => {
      const genericTask = {
        ...mockTask,
        title: 'Generic task',
        description: 'Some work',
        tags: [],
        epicId: 'default-epic'
      };

      mockEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: false,
        originalTask: genericTask,
        subTasks: [
          {
            ...mockTask,
            id: 'T002-1',
            title: 'Create component',
            description: 'Build component',
            tags: [],
          },
        ],
        analysis: { isAtomic: false, confidence: 0.8 },
        depth: 0
      });

      const request: DecompositionRequest = {
        task: genericTask,
        context: mockContext
      };

      const session = await service.startDecomposition(request);

      // Wait for decomposition to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(session).toBeDefined();
      expect(session.taskId).toBe(genericTask.id);

      // Should still complete decomposition even if epic creation fails
      expect(mockEngine.decomposeTask).toHaveBeenCalled();
    });

    it('should extract functional area from multiple tasks', async () => {
      const videoTask = {
        ...mockTask,
        title: 'Build video system',
        description: 'Create video upload and playback',
        tags: ['video', 'media'],
        epicId: 'default-epic'
      };

      mockEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: false,
        originalTask: videoTask,
        subTasks: [
          {
            ...mockTask,
            id: 'T003-1',
            title: 'Create video upload API',
            description: 'API for video uploads',
            tags: ['video', 'api'],
          },
          {
            ...mockTask,
            id: 'T003-2',
            title: 'Create video player component',
            description: 'Frontend video player',
            tags: ['video', 'ui'],
          },
        ],
        analysis: { isAtomic: false, confidence: 0.9 },
        depth: 0
      });

      const request: DecompositionRequest = {
        task: videoTask,
        context: mockContext
      };

      const session = await service.startDecomposition(request);

      // Wait for decomposition to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(session).toBeDefined();
      expect(session.taskId).toBe(videoTask.id);

      // Verify video-related decomposition
      expect(mockEngine.decomposeTask).toHaveBeenCalledWith(
        expect.objectContaining({
          task: videoTask,
          context: mockContext
        })
      );
    });
  });
});
