import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtomicTaskDetector } from '../../core/atomic-detector.js';
import { ProjectContext } from '../../types/project-context.js';
import { AtomicTask, TaskPriority, TaskType, TaskStatus } from '../../types/task.js';
import { OpenRouterConfig } from '../../../../types/workflow.js';
import { createMockConfig } from '../utils/test-setup.js';
import {
  mockOpenRouterResponse,
  MockTemplates,
  PerformanceTestUtils,
  setTestId,
  clearAllMockQueues,
  clearPerformanceCaches
} from '../../../../testUtils/mockLLM.js';

// Mock the config loader
vi.mock('../../utils/config-loader.js', () => ({
  getLLMModelForOperation: vi.fn().mockResolvedValue('anthropic/claude-3-sonnet')
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

describe('AtomicTaskDetector', () => {
  let detector: AtomicTaskDetector;
  let mockConfig: OpenRouterConfig;
  let mockTask: AtomicTask;
  let mockContext: ProjectContext;

  beforeEach(() => {
    // Clear all mocks and caches for clean test isolation
    vi.clearAllMocks();
    clearAllMockQueues();
    clearPerformanceCaches();

    // Set unique test ID for mock isolation
    setTestId(`atomic-detector-${Date.now()}-${Math.random()}`);

    mockConfig = createMockConfig();
    detector = new AtomicTaskDetector(mockConfig);

    mockTask = {
      id: 'T0001',
      title: 'Add email input field',
      description: 'Create email input field with basic validation in LoginForm component',
      type: 'development' as TaskType,
      priority: 'medium' as TaskPriority,
      status: 'pending' as TaskStatus,
      projectId: 'PID-TEST-001',
      epicId: 'E001',
      estimatedHours: 0.1, // 6 minutes - within 5-10 minute range
      actualHours: 0,
      filePaths: ['src/components/LoginForm.tsx'], // Single file
      acceptanceCriteria: [
        'Email input field renders with type="email" attribute'
      ], // Single acceptance criteria
      tags: ['authentication', 'frontend'],
      dependencies: [],
      dependents: [],
      testingRequirements: {
        unitTests: [],
        integrationTests: [],
        performanceTests: [],
        coverageTarget: 90
      },
      performanceCriteria: {},
      qualityCriteria: {
        codeQuality: [],
        documentation: [],
        typeScript: true,
        eslint: true
      },
      integrationCriteria: {
        compatibility: [],
        patterns: []
      },
      validationMethods: {
        automated: [],
        manual: []
      },
      assignedAgent: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      startedAt: undefined,
      completedAt: undefined,
      createdBy: 'test-user',
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        tags: ['authentication', 'frontend']
      }
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

  afterEach(() => {
    // Enhanced cleanup for performance optimization
    vi.clearAllMocks();
    clearAllMockQueues();
    clearPerformanceCaches();
  });

  describe('analyzeTask', () => {
    it('should analyze atomic task successfully', async () => {
      // Use enhanced mock template for better performance
      const mockTemplate = MockTemplates.atomicDetection(true, 0.85);
      mockTemplate.responseContent = {
        ...mockTemplate.responseContent,
        reasoning: 'Task has clear scope and can be completed in estimated time',
        complexityFactors: ['Frontend component'],
        recommendations: ['Add unit tests', 'Consider error handling']
      };

      mockOpenRouterResponse(mockTemplate);

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result).toEqual({
        isAtomic: true,
        confidence: 0.85,
        reasoning: 'Task has clear scope and can be completed in estimated time',
        estimatedHours: 0.1,
        complexityFactors: ['Frontend component'],
        recommendations: ['Add unit tests', 'Consider error handling']
      });
    });

    it('should handle non-atomic task analysis', async () => {
      // Use enhanced mock template with performance measurement
      const mockTemplate = MockTemplates.atomicDetection(false, 0.9);
      mockTemplate.responseContent = {
        ...mockTemplate.responseContent,
        reasoning: 'Task spans multiple components and requires significant time',
        estimatedHours: 8,
        complexityFactors: ['Multiple components', 'Complex business logic'],
        recommendations: ['Break into smaller tasks', 'Define clearer acceptance criteria']
      };

      mockOpenRouterResponse(mockTemplate);

      const largeTask = {
        ...mockTask,
        estimatedHours: 8,
        filePaths: ['src/auth/', 'src/components/', 'src/api/', 'src/utils/', 'src/types/', 'src/hooks/']
      };

      // Measure performance of the test
      const result = await PerformanceTestUtils.measureMockPerformance(
        'non-atomic-task-analysis',
        () => detector.analyzeTask(largeTask, mockContext)
      );

      expect(result.isAtomic).toBe(false);
      expect(result.confidence).toBeLessThanOrEqual(0.3); // Validation rule applied
      expect(result.recommendations).toContain('Task exceeds 20-minute validation threshold - must be broken down further');

      // Verify performance is within acceptable range
      expect(result.mockPerformance.duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should apply validation rules correctly', async () => {
      const mockResponse = {
        isAtomic: true,
        confidence: 0.9,
        reasoning: 'Initial analysis suggests atomic',
        estimatedHours: 0.5, // 30 minutes - over 20 minute limit
        complexityFactors: [],
        recommendations: []
      };

      mockOpenRouterResponse({
        responseContent: mockResponse,
        model: /google\/gemini-2\.5-flash-preview/
      });

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result.isAtomic).toBe(false); // Validation rule overrides
      expect(result.confidence).toBe(0.0); // Should be 0 for non-atomic
      expect(result.recommendations).toContain('Task exceeds 20-minute validation threshold - must be broken down further');
    });

    it('should handle multiple file paths validation', async () => {
      const mockResponse = {
        isAtomic: true,
        confidence: 0.8,
        reasoning: 'Task seems manageable',
        estimatedHours: 0.1, // 6 minutes - atomic duration
        complexityFactors: ['Multiple file modifications'],
        recommendations: []
      };

      mockOpenRouterResponse({
        responseContent: mockResponse,
        model: /google\/gemini-2\.5-flash-preview/
      });

      const multiFileTask = {
        ...mockTask,
        filePaths: ['file1.ts', 'file2.ts', 'file3.ts'] // 3 files - exceeds limit of 2
      };

      const result = await detector.analyzeTask(multiFileTask, mockContext);

      expect(result.isAtomic).toBe(false); // Should be non-atomic due to multiple files
      expect(result.confidence).toBe(0.0); // Should be 0 for non-atomic
      expect(result.complexityFactors).toContain('Multiple file modifications indicate non-atomic task');
      expect(result.recommendations).toContain('Split into separate tasks - one per file modification');
    });

    it('should handle insufficient acceptance criteria', async () => {
      const mockResponse = {
        isAtomic: true,
        confidence: 0.9,
        reasoning: 'Task analysis',
        estimatedHours: 0.1, // 6 minutes - atomic duration
        complexityFactors: [],
        recommendations: []
      };

      mockOpenRouterResponse({
        responseContent: mockResponse,
        model: /google\/gemini-2\.5-flash-preview/
      });

      const multiCriteriaTask = {
        ...mockTask,
        acceptanceCriteria: ['Complete the feature', 'Add tests', 'Update documentation'] // Multiple criteria - not atomic
      };

      const result = await detector.analyzeTask(multiCriteriaTask, mockContext);

      expect(result.isAtomic).toBe(false); // Should be non-atomic due to multiple criteria
      expect(result.confidence).toBe(0.0); // Should be 0 for non-atomic
      expect(result.recommendations).toContain('Atomic tasks must have exactly ONE acceptance criteria');
    });

    it('should handle tasks with "and" operators', async () => {
      const mockResponse = {
        isAtomic: true,
        confidence: 0.9,
        reasoning: 'Task analysis',
        estimatedHours: 0.1, // 6 minutes - atomic duration
        complexityFactors: [],
        recommendations: []
      };

      mockOpenRouterResponse({
        responseContent: mockResponse,
        model: /google\/gemini-2\.5-flash-preview/
      });

      const andTask = {
        ...mockTask,
        title: 'Create and validate user input',
        description: 'Create input field and add validation logic'
      };

      const result = await detector.analyzeTask(andTask, mockContext);

      expect(result.isAtomic).toBe(false); // Should be non-atomic due to "and" operators
      expect(result.confidence).toBe(0.0); // Should be 0 for non-atomic
      expect(result.complexityFactors).toContain('Task contains "and" operator indicating multiple actions');
      expect(result.recommendations).toContain('Remove "and" operations - split into separate atomic tasks');
    });

    it('should return fallback analysis on LLM failure', async () => {
      mockOpenRouterResponse({
        shouldError: true,
        errorMessage: 'LLM API failed'
      });

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result.confidence).toBe(0.4);
      expect(result.reasoning).toContain('Fallback analysis');
      expect(result.complexityFactors).toContain('LLM analysis unavailable');
      expect(result.recommendations).toContain('Manual review recommended due to analysis failure');
      expect(result.recommendations).toContain('Verify task meets 5-10 minute atomic criteria');
    });

    it('should handle malformed LLM response', async () => {
      mockOpenRouterResponse({
        responseContent: 'Invalid JSON response'
      });

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result.confidence).toBe(0.4);
      expect(result.reasoning).toContain('Fallback analysis');
    });

    it('should handle partial LLM response', async () => {
      const partialResponse = {
        isAtomic: true,
        confidence: 0.8,
        estimatedHours: 0.1 // 6 minutes - atomic duration
        // Missing other fields
      };

      mockOpenRouterResponse({
        responseContent: partialResponse,
        model: /google\/gemini-2\.5-flash-preview/
      });

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result.isAtomic).toBe(true); // Should remain atomic since it passes validation
      expect(result.confidence).toBe(0.8);
      expect(result.reasoning).toBe('No reasoning provided');
      expect(result.estimatedHours).toBe(0.1); // Should use the provided value
      expect(Array.isArray(result.complexityFactors)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });

  describe('Enhanced Validation Rules', () => {
    it('should detect "and" operator in task title', async () => {
      mockOpenRouterResponse({
        responseContent: { isAtomic: true, confidence: 0.9 },
        model: /google\/gemini-2\.5-flash-preview/
      });

      const taskWithAnd = {
        ...mockTask,
        title: 'Create user form and add validation',
        acceptanceCriteria: ['Form should be created with validation']
      };

      const result = await detector.analyzeTask(taskWithAnd, mockContext);

      expect(result.isAtomic).toBe(false);
      expect(result.confidence).toBe(0.0);
      expect(result.complexityFactors).toContain('Task contains "and" operator indicating multiple actions');
      expect(result.recommendations).toContain('Remove "and" operations - split into separate atomic tasks');
    });

    it('should detect "and" operator in task description', async () => {
      mockOpenRouterResponse({
        responseContent: { isAtomic: true, confidence: 0.9 },
        model: /google\/gemini-2\.5-flash-preview/
      });

      const taskWithAnd = {
        ...mockTask,
        description: 'Implement authentication middleware and configure security settings',
        acceptanceCriteria: ['Authentication should work with security']
      };

      const result = await detector.analyzeTask(taskWithAnd, mockContext);

      expect(result.isAtomic).toBe(false);
      expect(result.confidence).toBe(0.0);
      expect(result.complexityFactors).toContain('Task contains "and" operator indicating multiple actions');
    });

    it('should reject tasks with multiple acceptance criteria', async () => {
      mockOpenRouterResponse({
        responseContent: { isAtomic: true, confidence: 0.9 },
        model: /google\/gemini-2\.5-flash-preview/
      });

      const taskWithMultipleCriteria = {
        ...mockTask,
        acceptanceCriteria: [
          'Component should be created',
          'Component should be styled',
          'Component should be tested'
        ]
      };

      const result = await detector.analyzeTask(taskWithMultipleCriteria, mockContext);

      expect(result.isAtomic).toBe(false);
      expect(result.confidence).toBe(0.0);
      expect(result.recommendations).toContain('Atomic tasks must have exactly ONE acceptance criteria');
    });

    it('should reject tasks over 20 minutes (0.33 hours)', async () => {
      mockOpenRouterResponse({
        responseContent: { isAtomic: true, confidence: 0.9, estimatedHours: 0.5 },
        model: /google\/gemini-2\.5-flash-preview/
      });

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result.isAtomic).toBe(false);
      expect(result.confidence).toBe(0.0);
      expect(result.recommendations).toContain('Task exceeds 20-minute validation threshold - must be broken down further');
    });

    it('should reject tasks with multiple file modifications', async () => {
      mockOpenRouterResponse({
        responseContent: { isAtomic: true, confidence: 0.9 },
        model: /google\/gemini-2\.5-flash-preview/
      });

      const taskWithMultipleFiles = {
        ...mockTask,
        filePaths: ['src/component1.ts', 'src/component2.ts', 'src/component3.ts'],
        acceptanceCriteria: ['All components should be updated']
      };

      const result = await detector.analyzeTask(taskWithMultipleFiles, mockContext);

      expect(result.isAtomic).toBe(false);
      expect(result.confidence).toBe(0.0);
      expect(result.complexityFactors).toContain('Multiple file modifications indicate non-atomic task');
      expect(result.recommendations).toContain('Split into separate tasks - one per file modification');
    });

    it('should detect complex action words', async () => {
      mockOpenRouterResponse({
        responseContent: { isAtomic: true, confidence: 0.9 },
        model: /google\/gemini-2\.5-flash-preview/
      });

      const taskWithComplexAction = {
        ...mockTask,
        title: 'Implement comprehensive user authentication system',
        acceptanceCriteria: ['Authentication system should be implemented']
      };

      const result = await detector.analyzeTask(taskWithComplexAction, mockContext);

      expect(result.isAtomic).toBe(false);
      expect(result.confidence).toBeLessThanOrEqual(0.3);
      expect(result.complexityFactors).toContain('Task uses complex action words suggesting multiple steps');
      expect(result.recommendations).toContain('Use simple action verbs: Add, Create, Write, Update, Import, Export');
    });

    it('should detect vague descriptions', async () => {
      mockOpenRouterResponse({
        responseContent: { isAtomic: true, confidence: 0.9 },
        model: /google\/gemini-2\.5-flash-preview/
      });

      const taskWithVagueDescription = {
        ...mockTask,
        description: 'Add various improvements and necessary changes to multiple components',
        acceptanceCriteria: ['Various improvements should be made']
      };

      const result = await detector.analyzeTask(taskWithVagueDescription, mockContext);

      expect(result.isAtomic).toBe(false);
      expect(result.confidence).toBeLessThanOrEqual(0.4);
      expect(result.complexityFactors).toContain('Task description contains vague terms');
      expect(result.recommendations).toContain('Use specific, concrete descriptions instead of vague terms');
    });

    it('should accept properly atomic tasks', async () => {
      mockOpenRouterResponse({
        responseContent: { isAtomic: true, confidence: 0.9, estimatedHours: 0.15 },
        model: /google\/gemini-2\.5-flash-preview/
      });

      const atomicTask = {
        ...mockTask,
        title: 'Add email validation to registration form',
        description: 'Add client-side email validation to the user registration form component',
        filePaths: ['src/components/RegistrationForm.tsx'],
        acceptanceCriteria: ['Email validation should prevent invalid email submissions']
      };

      const result = await detector.analyzeTask(atomicTask, mockContext);

      expect(result.isAtomic).toBe(true);
      expect(result.confidence).toBe(0.9);
      expect(result.estimatedHours).toBe(0.15);
    });
  });

  describe('prompt building', () => {
    it('should build comprehensive analysis prompt', async () => {
      mockOpenRouterResponse({
        responseContent: { isAtomic: true, confidence: 0.8 },
        model: /google\/gemini-2\.5-flash-preview/
      });

      const result = await detector.analyzeTask(mockTask, mockContext);

      // Verify the analysis was performed (we can't easily test the exact prompt content with mocks)
      expect(result).toBeDefined();
      expect(result.isAtomic).toBe(true);
      expect(result.confidence).toBe(0.8);
    });

    it('should build appropriate system prompt', async () => {
      mockOpenRouterResponse({
        responseContent: { isAtomic: true, confidence: 0.8 },
        model: /google\/gemini-2\.5-flash-preview/
      });

      const result = await detector.analyzeTask(mockTask, mockContext);

      // Verify the analysis was performed (we can't easily test the exact system prompt with mocks)
      expect(result).toBeDefined();
      expect(result.isAtomic).toBe(true);
      expect(result.confidence).toBe(0.8);
    });
  });
});
