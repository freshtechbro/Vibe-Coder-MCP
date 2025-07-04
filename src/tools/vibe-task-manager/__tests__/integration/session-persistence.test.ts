import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  setTestId, 
  clearMockQueue,
  clearAllMockQueues,
  MockQueueBuilder
} from '../../../../testUtils/mockLLM.js';

// Mock all external dependencies to avoid live LLM calls
vi.mock('../../../../utils/llmHelper.js', () => ({
  performDirectLlmCall: vi.fn().mockResolvedValue(JSON.stringify({
    isAtomic: true,
    confidence: 0.95,
    reasoning: 'Task is atomic and focused',
    estimatedHours: 0.1
  })),
  performFormatAwareLlmCall: vi.fn().mockResolvedValue(JSON.stringify({
    tasks: [{
      title: 'Test Subtask',
      description: 'Test subtask description',
      estimatedHours: 0.1,
      acceptanceCriteria: ['Test criteria'],
      priority: 'medium'
    }]
  }))
}));

// Mock config loader FIRST before any other imports
vi.mock('../../utils/config-loader.js', () => ({
  getVibeTaskManagerConfig: vi.fn().mockResolvedValue({
    taskManager: {
      dataDirectory: '/test/output',
      maxDepth: 3,
      maxTasks: 100
    },
    openRouter: {
      baseUrl: 'https://test.openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'test-model',
      geminiModel: 'test-gemini',
      perplexityModel: 'test-perplexity'
    }
  }),
  getVibeTaskManagerOutputDir: vi.fn().mockReturnValue('/test/output'),
  getBaseOutputDir: vi.fn().mockReturnValue('/test/output')
}));

// Mock the project root function that getVibeTaskManagerOutputDir depends on
vi.mock('../../../code-map-generator/utils/pathUtils.enhanced.js', () => ({
  getProjectRoot: vi.fn().mockReturnValue('/test/project')
}));

import { DecompositionService, DecompositionRequest } from '../../services/decomposition-service.js';
import { AtomicTask, TaskType, TaskPriority, TaskStatus } from '../../types/task.js';
import { AtomicDetectorContext } from '../../core/atomic-detector.js';
import { OpenRouterConfig } from '../../../../types/workflow.js';

// Mock the RDD engine to return controlled results
vi.mock('../../core/rdd-engine.js', () => ({
  RDDEngine: vi.fn().mockImplementation(() => ({
    decomposeTask: vi.fn().mockResolvedValue({
      success: true,
      isAtomic: false,
      depth: 0,
      subTasks: [
        {
          id: 'test-task-1',
          title: 'Test Task 1',
          description: 'First test task',
          type: 'development' as TaskType,
          priority: 'medium' as TaskPriority,
          status: 'pending' as TaskStatus,
          estimatedHours: 2,
          acceptanceCriteria: ['Task 1 should work'],
          tags: ['test'],
          dependencies: [],
          filePaths: [],
          epicId: 'test-epic'
        },
        {
          id: 'test-task-2',
          title: 'Test Task 2',
          description: 'Second test task',
          type: 'development' as TaskType,
          priority: 'high' as TaskPriority,
          status: 'pending' as TaskStatus,
          estimatedHours: 4,
          acceptanceCriteria: ['Task 2 should work'],
          tags: ['test'],
          dependencies: [],
          filePaths: [],
          epicId: 'test-epic'
        }
      ]
    })
  }))
}));

// Mock task operations to simulate successful task creation
vi.mock('../../core/operations/task-operations.js', () => ({
  TaskOperations: {
    getInstance: vi.fn(() => ({
      createTask: vi.fn().mockImplementation((taskData, _sessionId) => ({
        success: true,
        data: {
          ...taskData,
          id: `generated-${taskData.title.replace(/\s+/g, '-').toLowerCase()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          filePaths: [`/test/path/${taskData.title.replace(/\s+/g, '-').toLowerCase()}.yaml`]
        }
      }))
    }))
  }
}));

// Mock workflow state manager
vi.mock('../../services/workflow-state-manager.js', () => ({
  WorkflowStateManager: vi.fn().mockImplementation(() => ({
    initializeWorkflow: vi.fn().mockResolvedValue(undefined),
    transitionWorkflow: vi.fn().mockResolvedValue(undefined),
    updatePhaseProgress: vi.fn().mockResolvedValue(undefined)
  }))
}));

// Mock summary generator
vi.mock('../../services/decomposition-summary-generator.js', () => ({
  DecompositionSummaryGenerator: vi.fn().mockImplementation(() => ({
    generateSessionSummary: vi.fn().mockResolvedValue({
      success: true,
      outputDirectory: '/test/output',
      generatedFiles: ['summary.md'],
      metadata: {
        sessionId: 'test-session',
        projectId: 'test-project',
        totalTasks: 2,
        totalHours: 6,
        generationTime: 100,
        timestamp: new Date()
      }
    })
  }))
}));

// Mock context enrichment service
vi.mock('../../services/context-enrichment-service.js', () => ({
  ContextEnrichmentService: {
    getInstance: vi.fn(() => ({
      gatherContext: vi.fn().mockResolvedValue({
        contextFiles: [],
        summary: { totalFiles: 0, totalSize: 0, averageRelevance: 0 },
        metrics: { totalTime: 100 }
      }),
      createContextSummary: vi.fn().mockResolvedValue('Mock context summary')
    }))
  }
}));

// Mock auto-research detector
vi.mock('../../services/auto-research-detector.js', () => ({
  AutoResearchDetector: {
    getInstance: vi.fn(() => ({
      evaluateResearchNeed: vi.fn().mockResolvedValue({
        decision: {
          shouldTriggerResearch: false,
          primaryReason: 'No research needed for test',
          confidence: 0.9
        },
        metadata: {
          performance: { totalTime: 50 }
        }
      })
    }))
  }
}));

// Mock research integration service
vi.mock('../../services/research-integration.js', () => ({
  ResearchIntegration: {
    getInstance: vi.fn(() => ({
      enhanceDecompositionWithResearch: vi.fn().mockResolvedValue({
        researchResults: [],
        integrationMetrics: { researchTime: 0 }
      })
    }))
  }
}));



describe('Session Persistence Integration Tests', () => {
  let decompositionService: DecompositionService;
  let mockConfig: OpenRouterConfig;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
    // Set unique test ID for isolation
    const testId = `session-persist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setTestId(testId);
    
    // Clear mock queue for this test
    clearMockQueue();
    
    // Set up comprehensive mock queue for all potential LLM calls
    const builder = new MockQueueBuilder();
    builder
      .addIntentRecognitions(3, 'create_task')
      .addAtomicDetections(10, true)
      .addTaskDecompositions(5, 2);
    builder.queueResponses();
    
    // Set up environment variables for test BEFORE creating the service
    process.env.VIBE_CODER_OUTPUT_DIR = '/test/output';
    process.env.VIBE_TASK_MANAGER_READ_DIR = '/test/project';

    mockConfig = {
      baseUrl: 'https://test.openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'test-model',
      geminiModel: 'test-gemini',
      perplexityModel: 'test-perplexity'
    };

    // Create the service after environment variables are set
    decompositionService = new DecompositionService(mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clean up mock queue after each test
    clearMockQueue();
    // Clean up environment variables
    delete process.env.VIBE_CODER_OUTPUT_DIR;
    delete process.env.VIBE_TASK_MANAGER_READ_DIR;
  });
  
  afterAll(() => {
    // Clean up all mock queues
    clearAllMockQueues();
  });

  describe('executeDecomposition path', () => {
    it('should properly populate session.persistedTasks after successful decomposition', async () => {
      // Arrange
      const mockTask: AtomicTask = {
        id: 'test-task',
        title: 'Test Task',
        description: 'A test task for decomposition',
        type: 'development',
        priority: 'medium',
        status: 'pending',
        estimatedHours: 8,
        acceptanceCriteria: ['Should decompose properly'],
        tags: ['test'],
        dependencies: [],
        filePaths: [],
        epicId: 'test-epic',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockContext: AtomicDetectorContext = {
        projectId: 'test-project-001',
        languages: ['typescript'],
        frameworks: ['node'],
        buildTools: ['npm'],
        configFiles: [],
        entryPoints: [],
        architecturalPatterns: []
      };

      const request: DecompositionRequest = {
        task: mockTask,
        context: mockContext,
        sessionId: 'test-session-001'
      };

      // Act
      const session = await decompositionService.startDecomposition(request);

      // Wait for decomposition to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect(session).toBeDefined();
      expect(session.id).toBe('test-session-001');
      expect(session.projectId).toBe('test-project-001');

      // Get the updated session
      const updatedSession = decompositionService.getSession(session.id);
      expect(updatedSession).toBeDefined();

      // Verify session persistence
      expect(updatedSession!.persistedTasks).toBeDefined();
      expect(updatedSession!.persistedTasks).toHaveLength(2);
      
      // Verify task details
      const persistedTasks = updatedSession!.persistedTasks!;
      expect(persistedTasks[0].title).toBe('Test Task 1');
      expect(persistedTasks[1].title).toBe('Test Task 2');
      
      // Verify task IDs were generated
      expect(persistedTasks[0].id).toMatch(/^generated-test-task-1$/);
      expect(persistedTasks[1].id).toMatch(/^generated-test-task-2$/);

      // Verify rich results are populated
      expect(updatedSession!.richResults).toBeDefined();
      expect(updatedSession!.richResults!.tasks).toHaveLength(2);
      expect(updatedSession!.richResults!.summary.successfullyPersisted).toBe(2);
      expect(updatedSession!.richResults!.summary.totalGenerated).toBe(2);
    });

    it('should handle empty decomposition results gracefully', async () => {
      // Mock RDD engine to return no sub-tasks
      const mockRDDEngine = vi.mocked(await import('../../core/rdd-engine.js')).RDDEngine;
      mockRDDEngine.mockImplementation(() => ({
        decomposeTask: vi.fn().mockResolvedValue({
          success: true,
          isAtomic: true,
          depth: 0,
          subTasks: []
        })
      }) as Record<string, unknown>);

      const mockTask: AtomicTask = {
        id: 'atomic-task',
        title: 'Atomic Task',
        description: 'A task that cannot be decomposed further',
        type: 'development',
        priority: 'low',
        status: 'pending',
        estimatedHours: 1,
        acceptanceCriteria: ['Should remain atomic'],
        tags: ['atomic'],
        dependencies: [],
        filePaths: [],
        epicId: 'test-epic',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockContext: AtomicDetectorContext = {
        projectId: 'test-project-002',
        languages: ['typescript'],
        frameworks: ['node'],
        buildTools: ['npm'],
        configFiles: [],
        entryPoints: [],
        architecturalPatterns: []
      };

      const request: DecompositionRequest = {
        task: mockTask,
        context: mockContext,
        sessionId: 'test-session-002'
      };

      // Act
      const session = await decompositionService.startDecomposition(request);

      // Wait for decomposition to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      const updatedSession = decompositionService.getSession(session.id);
      expect(updatedSession).toBeDefined();
      
      // For atomic tasks, persistedTasks should be empty or contain the original task
      expect(updatedSession!.persistedTasks).toBeDefined();
      expect(updatedSession!.persistedTasks).toHaveLength(0);
      
      // Rich results should reflect the atomic nature
      expect(updatedSession!.richResults).toBeDefined();
      expect(updatedSession!.richResults!.summary.successfullyPersisted).toBe(0);
      expect(updatedSession!.richResults!.summary.totalGenerated).toBe(0);
    });
  });

  describe('session state verification', () => {
    it('should maintain session state consistency throughout decomposition', async () => {
      const mockTask: AtomicTask = {
        id: 'consistency-test',
        title: 'Consistency Test Task',
        description: 'Testing session state consistency',
        type: 'development',
        priority: 'high',
        status: 'pending',
        estimatedHours: 6,
        acceptanceCriteria: ['Should maintain consistency'],
        tags: ['consistency'],
        dependencies: [],
        filePaths: [],
        epicId: 'test-epic',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockContext: AtomicDetectorContext = {
        projectId: 'test-project-003',
        languages: ['typescript'],
        frameworks: ['node'],
        buildTools: ['npm'],
        configFiles: [],
        entryPoints: [],
        architecturalPatterns: []
      };

      const request: DecompositionRequest = {
        task: mockTask,
        context: mockContext,
        sessionId: 'test-session-003'
      };

      // Act
      const session = await decompositionService.startDecomposition(request);

      // Verify initial state
      expect(session.status).toBe('pending');
      expect(session.progress).toBe(0);
      expect(session.persistedTasks).toBeUndefined();

      // Wait for decomposition to complete
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify final state
      const updatedSession = decompositionService.getSession(session.id);
      expect(updatedSession!.status).toBe('completed');
      expect(updatedSession!.progress).toBe(100);
      expect(updatedSession!.persistedTasks).toBeDefined();
      expect(updatedSession!.persistedTasks).toHaveLength(2);
      expect(updatedSession!.endTime).toBeDefined();
    });
  });
});
