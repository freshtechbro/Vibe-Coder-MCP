import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtomicTaskDetector, AtomicityAnalysis, ProjectContext } from '../../core/atomic-detector.js';
import { AtomicTask, TaskPriority, TaskType, TaskStatus } from '../../types/task.js';
import { OpenRouterConfig } from '../../../../types/workflow.js';
import { createMockConfig } from '../utils/test-setup.js';

// Mock the LLM helper
vi.mock('../../../../utils/llmHelper.js', () => ({
  performDirectLlmCall: vi.fn(),
  performFormatAwareLlmCall: vi.fn()
}));

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
    vi.clearAllMocks();
  });

  describe('analyzeTask', () => {
    it('should analyze atomic task successfully', async () => {
      const { performFormatAwareLlmCall } = await import('../../../../utils/llmHelper.js');
      const mockResponse = JSON.stringify({
        isAtomic: true,
        confidence: 0.85,
        reasoning: 'Task has clear scope and can be completed in estimated time',
        estimatedHours: 0.1, // 6 minutes - atomic
        complexityFactors: ['Frontend component'],
        recommendations: ['Add unit tests', 'Consider error handling']
      });

      vi.mocked(performFormatAwareLlmCall).mockResolvedValue(mockResponse);

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result).toEqual({
        isAtomic: true,
        confidence: 0.85,
        reasoning: 'Task has clear scope and can be completed in estimated time',
        estimatedHours: 0.1,
        complexityFactors: ['Frontend component'],
        recommendations: ['Add unit tests', 'Consider error handling']
      });

      expect(performFormatAwareLlmCall).toHaveBeenCalledWith(
        expect.stringContaining('Analyze the following task'),
        expect.stringContaining('You are an expert software development task analyzer'),
        mockConfig,
        'task_decomposition',
        'json',
        undefined,
        0.1
      );
    });

    it('should handle non-atomic task analysis', async () => {
      const { performFormatAwareLlmCall } = await import('../../../../utils/llmHelper.js');
      const mockResponse = JSON.stringify({
        isAtomic: false,
        confidence: 0.9,
        reasoning: 'Task spans multiple components and requires significant time',
        estimatedHours: 8,
        complexityFactors: ['Multiple components', 'Complex business logic'],
        recommendations: ['Break into smaller tasks', 'Define clearer acceptance criteria']
      });

      vi.mocked(performFormatAwareLlmCall).mockResolvedValue(mockResponse);

      const largeTask = {
        ...mockTask,
        estimatedHours: 8,
        filePaths: ['src/auth/', 'src/components/', 'src/api/', 'src/utils/', 'src/types/', 'src/hooks/']
      };

      const result = await detector.analyzeTask(largeTask, mockContext);

      expect(result.isAtomic).toBe(false);
      expect(result.confidence).toBeLessThanOrEqual(0.3); // Validation rule applied
      expect(result.recommendations).toContain('Task exceeds 20-minute validation threshold - must be broken down further');
    });

    it('should apply validation rules correctly', async () => {
      const { performFormatAwareLlmCall } = await import('../../../../utils/llmHelper.js');
      const mockResponse = JSON.stringify({
        isAtomic: true,
        confidence: 0.9,
        reasoning: 'Initial analysis suggests atomic',
        estimatedHours: 0.5, // 30 minutes - over 20 minute limit
        complexityFactors: [],
        recommendations: []
      });

      vi.mocked(performFormatAwareLlmCall).mockResolvedValue(mockResponse);

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result.isAtomic).toBe(false); // Validation rule overrides
      expect(result.confidence).toBe(0.0); // Should be 0 for non-atomic
      expect(result.recommendations).toContain('Task exceeds 20-minute validation threshold - must be broken down further');
    });

    it('should handle multiple file paths validation', async () => {
      const { performFormatAwareLlmCall } = await import('../../../../utils/llmHelper.js');
      const mockResponse = JSON.stringify({
        isAtomic: true,
        confidence: 0.8,
        reasoning: 'Task seems manageable',
        estimatedHours: 0.1, // 6 minutes - atomic duration
        complexityFactors: ['Multiple file modifications'],
        recommendations: []
      });

      vi.mocked(performFormatAwareLlmCall).mockResolvedValue(mockResponse);

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
      const { performFormatAwareLlmCall } = await import('../../../../utils/llmHelper.js');
      const mockResponse = JSON.stringify({
        isAtomic: true,
        confidence: 0.9,
        reasoning: 'Task analysis',
        estimatedHours: 0.1, // 6 minutes - atomic duration
        complexityFactors: [],
        recommendations: []
      });

      vi.mocked(performFormatAwareLlmCall).mockResolvedValue(mockResponse);

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
      const { performFormatAwareLlmCall } = await import('../../../../utils/llmHelper.js');
      const mockResponse = JSON.stringify({
        isAtomic: true,
        confidence: 0.9,
        reasoning: 'Task analysis',
        estimatedHours: 0.1, // 6 minutes - atomic duration
        complexityFactors: [],
        recommendations: []
      });

      vi.mocked(performFormatAwareLlmCall).mockResolvedValue(mockResponse);

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
      const { performFormatAwareLlmCall } = await import('../../../../utils/llmHelper.js');
      vi.mocked(performFormatAwareLlmCall).mockRejectedValue(new Error('LLM API failed'));

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result.confidence).toBe(0.4);
      expect(result.reasoning).toContain('Fallback analysis');
      expect(result.complexityFactors).toContain('LLM analysis unavailable');
      expect(result.recommendations).toContain('Manual review recommended due to analysis failure');
      expect(result.recommendations).toContain('Verify task meets 5-10 minute atomic criteria');
    });

    it('should handle malformed LLM response', async () => {
      const { performFormatAwareLlmCall } = await import('../../../../utils/llmHelper.js');
      vi.mocked(performFormatAwareLlmCall).mockResolvedValue('Invalid JSON response');

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result.confidence).toBe(0.4);
      expect(result.reasoning).toContain('Fallback analysis');
    });

    it('should handle partial LLM response', async () => {
      const { performFormatAwareLlmCall } = await import('../../../../utils/llmHelper.js');
      const partialResponse = JSON.stringify({
        isAtomic: true,
        confidence: 0.8,
        estimatedHours: 0.1 // 6 minutes - atomic duration
        // Missing other fields
      });

      vi.mocked(performFormatAwareLlmCall).mockResolvedValue(partialResponse);

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result.isAtomic).toBe(true); // Should remain atomic since it passes validation
      expect(result.confidence).toBe(0.8);
      expect(result.reasoning).toBe('No reasoning provided');
      expect(result.estimatedHours).toBe(0.1); // Should use the provided value
      expect(Array.isArray(result.complexityFactors)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });

  describe('prompt building', () => {
    it('should build comprehensive analysis prompt', async () => {
      const { performFormatAwareLlmCall } = await import('../../../../utils/llmHelper.js');
      vi.mocked(performFormatAwareLlmCall).mockResolvedValue('{"isAtomic": true, "confidence": 0.8}');

      await detector.analyzeTask(mockTask, mockContext);

      const callArgs = vi.mocked(performFormatAwareLlmCall).mock.calls[0];
      const prompt = callArgs[0];

      expect(prompt).toContain(mockTask.title);
      expect(prompt).toContain(mockTask.description);
      expect(prompt).toContain(mockContext.projectId);
      expect(prompt).toContain('ANALYSIS CRITERIA');
      expect(prompt).toContain('JSON format');
    });

    it('should build appropriate system prompt', async () => {
      const { performFormatAwareLlmCall } = await import('../../../../utils/llmHelper.js');
      vi.mocked(performFormatAwareLlmCall).mockResolvedValue('{"isAtomic": true, "confidence": 0.8}');

      await detector.analyzeTask(mockTask, mockContext);

      const callArgs = vi.mocked(performFormatAwareLlmCall).mock.calls[0];
      const systemPrompt = callArgs[1];

      expect(systemPrompt).toContain('expert software development task analyzer');
      expect(systemPrompt).toContain('RDD');
      expect(systemPrompt).toContain('ATOMIC TASK CRITERIA');
      expect(systemPrompt).toContain('NON-ATOMIC INDICATORS');
    });
  });
});
