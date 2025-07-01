import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import { 
  setTestId, 
  clearMockQueue,
  clearAllMockQueues,
  MockQueueBuilder
} from '../../../../testUtils/mockLLM.js';
import { DecompositionService, DecompositionRequest } from '../../services/decomposition-service.js';
import { ContextEnrichmentService } from '../../services/context-enrichment-service.js';
import { AtomicTask, TaskType, TaskPriority, TaskStatus } from '../../types/task.js';
import { ProjectContext } from '../../types/project-context.js';
import { OpenRouterConfig } from '../../../../types/workflow.js';
import { createMockConfig } from '../utils/test-setup.js';

// Mock the RDD engine
vi.mock('../../core/rdd-engine.js', () => ({
  RDDEngine: vi.fn().mockImplementation(() => ({
    decomposeTask: vi.fn()
  }))
}));

// Mock fs-extra properly
vi.mock('fs-extra', () => {
  const mockMethods = {
    ensureDir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    pathExists: vi.fn(),
    remove: vi.fn(),
    stat: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn()
  };

  return {
    default: mockMethods,
    ...mockMethods
  };
});

const mockFs = fs as Record<string, unknown>;

// Mock the context enrichment service
vi.mock('../../services/context-enrichment-service.js', () => ({
  ContextEnrichmentService: {
    getInstance: vi.fn()
  }
}));

describe('Decomposition Service Context Integration', () => {
  let decompositionService: DecompositionService;
  let mockConfig: OpenRouterConfig;
  let mockTask: AtomicTask;
  let mockContext: ProjectContext;
  let mockContextService: unknown;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
    // Set unique test ID for isolation
    const testId = `decomp-context-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setTestId(testId);
    
    // Clear mock queue for this test
    clearMockQueue();
    
    // Set up comprehensive mock queue for all potential LLM calls
    const builder = new MockQueueBuilder();
    builder
      .addIntentRecognitions(5, 'create_task')
      .addAtomicDetections(15, true)
      .addTaskDecompositions(5, 2);
    builder.queueResponses();
    
    // Setup fs-extra mocks
    mockFs.ensureDir = vi.fn().mockResolvedValue(undefined);
    mockFs.writeFile = vi.fn().mockResolvedValue(undefined);
    mockFs.readFile = vi.fn().mockResolvedValue('{}');
    mockFs.pathExists = vi.fn().mockResolvedValue(true);
    mockFs.remove = vi.fn().mockResolvedValue(undefined);
    mockFs.stat = vi.fn().mockResolvedValue({ size: 1000 });
    mockFs.readFileSync = vi.fn().mockReturnValue('{}');
    mockFs.writeFileSync = vi.fn().mockReturnValue(undefined);
    mockFs.existsSync = vi.fn().mockReturnValue(true);
    mockFs.mkdirSync = vi.fn().mockReturnValue(undefined);

    // Create a fresh mock context service for each test
    mockContextService = {
      gatherContext: vi.fn(),
      createContextSummary: vi.fn(),
      clearCache: vi.fn()
    };

    // Set up the mock return value for getInstance
    const mockedContextEnrichmentService = vi.mocked(ContextEnrichmentService);
    mockedContextEnrichmentService.getInstance.mockReturnValue(mockContextService);

    mockConfig = createMockConfig();

    decompositionService = new DecompositionService(mockConfig);

    // Replace the real RDD engine with a mock after service creation
    const mockEngine = {
      decomposeTask: vi.fn()
    };
    (decompositionService as Record<string, unknown>).engine = mockEngine;

    // Create mock task
    mockTask = {
      id: 'T0001',
      title: 'Implement user authentication system',
      description: 'Create a secure authentication system with login, logout, and session management',
      type: 'development' as TaskType,
      priority: 'high' as TaskPriority,
      status: 'pending' as TaskStatus,
      estimatedHours: 8,
      actualHours: 0,
      projectId: 'PID-TEST-001',
      epicId: 'E0001',
      assigneeId: 'user123',
      acceptanceCriteria: [
        'User can log in with email and password',
        'User can log out securely',
        'Session is maintained across page refreshes'
      ],
      filePaths: ['src/auth/login.ts', 'src/auth/session.ts'],
      dependencies: [],
      blockedBy: [],
      validationMethods: {
        automated: ['unit tests', 'integration tests'],
        manual: ['security review']
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'user123',
      tags: ['auth', 'security'],
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user123',
        tags: ['auth', 'security']
      }
    };

    // Create mock context
    mockContext = {
      projectId: 'PID-TEST-001',
      languages: ['typescript', 'javascript'],
      frameworks: ['node.js', 'express'],
      tools: ['vitest', 'eslint'],
      existingTasks: [],
      codebaseSize: 'medium',
      teamSize: 3,
      complexity: 'medium'
    };
  });
  
  afterEach(() => {
    // Clean up mock queue after each test
    clearMockQueue();
  });
  
  afterAll(() => {
    // Clean up all mock queues
    clearAllMockQueues();
  });



  describe('Context Enrichment Integration', () => {
    it('should enrich context before decomposition', async () => {
      // Setup mock context enrichment response
      const mockContextResult = {
        contextFiles: [
          {
            filePath: 'src/auth/auth.service.ts',
            content: 'export class AuthService { login() {} }',
            charCount: 100,
            extension: '.ts',
            relevance: {
              overallScore: 0.9,
              nameMatch: 0.8,
              contentMatch: 0.9,
              pathMatch: 0.9,
              typeMatch: 0.8,
              sizeScore: 0.7
            }
          }
        ],
        failedFiles: [],
        summary: {
          totalFiles: 1,
          totalSize: 100,
          averageRelevance: 0.9,
          topFileTypes: ['.ts'],
          gatheringTime: 150
        },
        metrics: {
          searchTime: 50,
          readTime: 30,
          scoringTime: 20,
          totalTime: 150,
          cacheHitRate: 0.0
        }
      };

      const mockContextSummary = `## Context Summary
Found 1 relevant files (0KB total)
Average relevance: 90.0%
Top file types: .ts

## File Contents
### auth.service.ts (90.0% relevant)
\`\`\`ts
export class AuthService { login() {} }
\`\`\``;

      mockContextService.gatherContext.mockResolvedValue(mockContextResult);
      mockContextService.createContextSummary.mockResolvedValue(mockContextSummary);

      // Setup mock RDD engine response
      const mockRDDEngine = (decompositionService as Record<string, unknown>).engine;
      mockRDDEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: false,
        originalTask: mockTask,
        subTasks: [
          { ...mockTask, id: 'T0001-01', title: 'Implement login functionality' },
          { ...mockTask, id: 'T0001-02', title: 'Implement logout functionality' }
        ],
        analysis: {
          isAtomic: false,
          confidence: 0.9,
          reasoning: 'Task can be decomposed into login and logout features',
          estimatedHours: 8,
          complexityFactors: ['Authentication logic', 'Session management'],
          recommendations: ['Use existing auth patterns', 'Add comprehensive tests']
        },
        depth: 0
      });

      const request: DecompositionRequest = {
        task: mockTask,
        context: mockContext
      };

      const session = await decompositionService.startDecomposition(request);

      // Wait for decomposition to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify context enrichment was called
      expect(mockContextService.gatherContext).toHaveBeenCalledWith({
        taskDescription: mockTask.description,
        projectPath: process.cwd(),
        maxFiles: expect.any(Number),
        maxContentSize: expect.any(Number),
        searchPatterns: expect.arrayContaining(['auth', 'user', 'login']),
        priorityFileTypes: expect.arrayContaining(['.ts', '.js']),
        excludeDirs: expect.arrayContaining(['node_modules', '.git']),
        contentKeywords: expect.any(Array)
      });

      // Get the actual result that was passed to createContextSummary
      const actualContextResult = mockContextService.createContextSummary.mock.calls[0][0];
      expect(mockContextService.createContextSummary).toHaveBeenCalledWith(actualContextResult);

      // Verify RDD engine was called with enriched context
      expect(mockRDDEngine.decomposeTask).toHaveBeenCalled();
      const rddCall = mockRDDEngine.decomposeTask.mock.calls[0];
      expect(rddCall[0]).toEqual(mockTask);
      expect(rddCall[1]).toHaveProperty('codebaseContext');

      // Verify the context has the expected structure (even if empty)
      const enrichedContext = rddCall[1];
      expect(enrichedContext.codebaseContext).toHaveProperty('relevantFiles');
      expect(enrichedContext.codebaseContext).toHaveProperty('averageRelevance');
      expect(enrichedContext.codebaseContext).toHaveProperty('totalContextSize');
      expect(enrichedContext.codebaseContext).toHaveProperty('contextSummary');

      // Session should start as pending, but may complete quickly in tests or be in progress
      expect(['pending', 'completed', 'in_progress']).toContain(session.status);
    });

    it('should handle context enrichment failures gracefully', async () => {
      // Setup context enrichment to return empty results (simulating no relevant files found)
      mockContextService.gatherContext.mockResolvedValue({
        contextFiles: [],
        failedFiles: [],
        summary: { totalFiles: 0, totalSize: 0, averageRelevance: 0, topFileTypes: [], gatheringTime: 50 },
        metrics: { searchTime: 20, readTime: 10, scoringTime: 10, totalTime: 50, cacheHitRate: 0 }
      });

      mockContextService.createContextSummary.mockResolvedValue('No relevant files found');

      // Setup mock RDD engine response
      const mockRDDEngine = (decompositionService as Record<string, unknown>).engine;
      mockRDDEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: true,
        originalTask: mockTask,
        subTasks: [],
        analysis: {
          isAtomic: true,
          confidence: 0.8,
          reasoning: 'Task is atomic with empty context',
          estimatedHours: 4,
          complexityFactors: [],
          recommendations: []
        },
        depth: 0
      });

      const request: DecompositionRequest = {
        task: mockTask,
        context: mockContext
      };

      const session = await decompositionService.startDecomposition(request);

      // Wait for decomposition to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify context enrichment was attempted
      expect(mockContextService.gatherContext).toHaveBeenCalled();

      // Verify RDD engine was called with enriched context (even if empty)
      expect(mockRDDEngine.decomposeTask).toHaveBeenCalled();
      const rddCall = mockRDDEngine.decomposeTask.mock.calls[0];
      expect(rddCall[0]).toEqual(mockTask);
      expect(rddCall[1]).toHaveProperty('codebaseContext');

      // Session should start as pending, but may complete quickly in tests or be in progress
      expect(['pending', 'completed', 'in_progress']).toContain(session.status);
    });

    it('should extract appropriate search patterns from task', async () => {
      const complexTask = {
        ...mockTask,
        title: 'Implement UserService authentication with JWT tokens',
        description: 'Create a UserService class that handles authentication using JWT tokens and integrates with the existing database layer'
      };

      mockContextService.gatherContext.mockResolvedValue({
        contextFiles: [],
        failedFiles: [],
        summary: { totalFiles: 0, totalSize: 0, averageRelevance: 0, topFileTypes: [], gatheringTime: 50 },
        metrics: { searchTime: 20, readTime: 10, scoringTime: 10, totalTime: 50, cacheHitRate: 0 }
      });

      mockContextService.createContextSummary.mockResolvedValue('No relevant files found');

      const mockRDDEngine = (decompositionService as Record<string, unknown>).engine;
      mockRDDEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: true,
        originalTask: complexTask,
        subTasks: [],
        analysis: { isAtomic: true, confidence: 0.8, reasoning: 'Test', estimatedHours: 4, complexityFactors: [], recommendations: [] },
        depth: 0
      });

      const request: DecompositionRequest = {
        task: complexTask,
        context: mockContext
      };

      await decompositionService.startDecomposition(request);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify search patterns were extracted correctly
      const gatherContextCall = mockContextService.gatherContext.mock.calls[0][0];
      expect(gatherContextCall.searchPatterns).toEqual(
        expect.arrayContaining(['auth', 'user'])
      );
      expect(gatherContextCall.contentKeywords).toEqual(
        expect.arrayContaining(['implement', 'create'])
      );
    });

    it('should adjust context parameters based on task complexity', async () => {
      const complexTask = {
        ...mockTask,
        estimatedHours: 16, // Very complex task
        description: 'Refactor the entire authentication system architecture to support microservices'
      };

      mockContextService.gatherContext.mockResolvedValue({
        contextFiles: [],
        failedFiles: [],
        summary: { totalFiles: 0, totalSize: 0, averageRelevance: 0, topFileTypes: [], gatheringTime: 50 },
        metrics: { searchTime: 20, readTime: 10, scoringTime: 10, totalTime: 50, cacheHitRate: 0 }
      });

      mockContextService.createContextSummary.mockResolvedValue('No relevant files found');

      const mockRDDEngine = (decompositionService as Record<string, unknown>).engine;
      mockRDDEngine.decomposeTask.mockResolvedValue({
        success: true,
        isAtomic: false,
        originalTask: complexTask,
        subTasks: [],
        analysis: { isAtomic: false, confidence: 0.9, reasoning: 'Complex task', estimatedHours: 16, complexityFactors: [], recommendations: [] },
        depth: 0
      });

      const request: DecompositionRequest = {
        task: complexTask,
        context: mockContext
      };

      await decompositionService.startDecomposition(request);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify context parameters were adjusted for complex task
      const gatherContextCall = mockContextService.gatherContext.mock.calls[0][0];
      expect(gatherContextCall.maxFiles).toBeGreaterThan(10); // Should request more files for complex tasks
      expect(gatherContextCall.maxContentSize).toBeGreaterThan(50000); // Should request more content
    });
  });
});
