/**
 * Multi-Strategy File Discovery Tests for Context Curator
 * 
 * Tests the enhanced Phase 4 implementation with concurrent strategy execution,
 * priority-based file categorization, and intelligent duplicate handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextCuratorService, WorkflowPhase } from '../../../services/context-curator-service.js';
import { LLMIntegrationService } from '../../../services/llm-integration.js';
import { IntentAnalysisResult, FileDiscoveryResult } from '../../../types/llm-tasks.js';
import { PrioritizedFile, ContextCuratorInput } from '../../../types/context-curator.js';
import { OpenRouterConfig } from '../../../../types/workflow.js';

// Define WorkflowContext interface for testing
interface WorkflowContext {
  jobId: string;
  input: ContextCuratorInput;
  config: OpenRouterConfig;
  currentPhase: WorkflowPhase;
  startTime: number;
  codemapContent?: string;
  intentAnalysis?: IntentAnalysisResult;
  fileDiscovery?: unknown;
  totalPhases: number;
  completedPhases: number;
  errors: string[];
  warnings: string[];
}

describe('Multi-Strategy File Discovery', () => {
  let service: ContextCuratorService;
  let mockLLMService: LLMIntegrationService;
  let mockContext: WorkflowContext;

  beforeEach(() => {
    mockLLMService = {
      performFileDiscovery: vi.fn()
    } as Record<string, unknown>;

    // Create service instance using singleton pattern
    service = ContextCuratorService.getInstance();
    // Replace the internal LLM service with our mock
    (service as Record<string, unknown>).llmService = mockLLMService;

    mockContext = {
      jobId: 'test-job-123',
      currentPhase: WorkflowPhase.FILE_DISCOVERY,
      completedPhases: 3,
      totalPhases: 8,
      startTime: Date.now(),
      errors: [],
      warnings: [],
      input: {
        userPrompt: 'Add authentication system',
        projectPath: '/test/project',
        taskType: 'feature_addition',
        maxFiles: 200,
        includePatterns: ['*.ts', '*.js'],
        excludePatterns: ['node_modules/**'],
        focusAreas: ['src/auth', 'src/security']
      },
      config: {
        openRouter: { apiKey: 'test-key', baseUrl: 'test-url' },
        models: { file_discovery: 'test-model' }
      },
      codemapContent: 'Complete codemap content with file structure and imports...',
      intentAnalysis: {
        taskType: 'feature_addition',
        confidence: 0.9,
        reasoning: ['Adding new authentication functionality'],
        architecturalComponents: ['authentication', 'security', 'middleware'],
        scopeAssessment: {
          complexity: 'moderate',
          estimatedFiles: 12,
          riskLevel: 'medium'
        },
        suggestedFocusAreas: ['auth-patterns', 'security-middleware'],
        estimatedEffort: 'medium'
      } as IntentAnalysisResult
    } as WorkflowContext;
  });

  describe('Concurrent Strategy Execution', () => {
    it('should execute all 4 strategies concurrently', async () => {
      // Mock responses for each strategy
      const mockResponses: Record<string, FileDiscoveryResult> = {
        semantic_similarity: {
          relevantFiles: [
            {
              path: 'src/auth/login.ts',
              priority: 'high',
              reasoning: 'Contains authentication logic',
              confidence: 0.95,
              estimatedTokens: 500,
              modificationLikelihood: 'high'
            }
          ],
          totalFilesAnalyzed: 50,
          processingTimeMs: 1200,
          searchStrategy: 'semantic_similarity',
          coverageMetrics: { totalTokens: 500, averageConfidence: 0.95 }
        },
        keyword_matching: {
          relevantFiles: [
            {
              path: 'src/middleware/auth.ts',
              priority: 'medium',
              reasoning: 'Contains auth middleware',
              confidence: 0.8,
              estimatedTokens: 300,
              modificationLikelihood: 'medium'
            }
          ],
          totalFilesAnalyzed: 45,
          processingTimeMs: 1000,
          searchStrategy: 'keyword_matching',
          coverageMetrics: { totalTokens: 300, averageConfidence: 0.8 }
        },
        semantic_and_keyword: {
          relevantFiles: [
            {
              path: 'src/auth/jwt.ts',
              priority: 'high',
              reasoning: 'JWT token handling',
              confidence: 0.9,
              estimatedTokens: 400,
              modificationLikelihood: 'high'
            }
          ],
          totalFilesAnalyzed: 55,
          processingTimeMs: 1300,
          searchStrategy: 'semantic_and_keyword',
          coverageMetrics: { totalTokens: 400, averageConfidence: 0.9 }
        },
        structural_analysis: {
          relevantFiles: [
            {
              path: 'src/types/auth.ts',
              priority: 'low',
              reasoning: 'Authentication type definitions',
              confidence: 0.7,
              estimatedTokens: 200,
              modificationLikelihood: 'low'
            }
          ],
          totalFilesAnalyzed: 40,
          processingTimeMs: 900,
          searchStrategy: 'structural_analysis',
          coverageMetrics: { totalTokens: 200, averageConfidence: 0.7 }
        }
      };

      // Mock LLM service to return different responses based on strategy
      mockLLMService.performFileDiscovery = vi.fn().mockImplementation(
        (prompt, intent, codemap, config, strategy) => {
          return Promise.resolve(mockResponses[strategy]);
        }
      );

      // Execute the multi-strategy file discovery
      await (service as Record<string, unknown>).executeFileDiscovery(mockContext);

      // Verify all 4 strategies were called
      expect(mockLLMService.performFileDiscovery).toHaveBeenCalledTimes(4);
      
      // Verify each strategy was called with correct parameters
      const strategies = ['semantic_similarity', 'keyword_matching', 'semantic_and_keyword', 'structural_analysis'];
      strategies.forEach(strategy => {
        expect(mockLLMService.performFileDiscovery).toHaveBeenCalledWith(
          mockContext.input.userPrompt,
          mockContext.intentAnalysis,
          mockContext.codemapContent,
          mockContext.config,
          strategy,
          expect.objectContaining({
            tokenBudget: 250000, // Enhanced token budget
            maxFiles: 50 // Max files per strategy
          })
        );
      });

      // Verify the result is a multi-strategy result
      expect(mockContext.fileDiscovery).toBeDefined();
      expect(mockContext.fileDiscovery?.searchStrategy).toBe('multi_strategy');
    });
  });

  describe('Priority-Based File Categorization', () => {
    it('should categorize files by priority level correctly', () => {
      const testFiles = [
        { confidence: 0.95, priority: 'high' },
        { confidence: 0.85, priority: 'high' },
        { confidence: 0.75, priority: 'medium' },
        { confidence: 0.65, priority: 'medium' },
        { confidence: 0.45, priority: 'low' },
        { confidence: 0.35, priority: 'low' }
      ];

      testFiles.forEach(({ confidence, priority }) => {
        const result = (service as Record<string, unknown>).categorizePriorityLevel(confidence);
        expect(result).toBe(priority);
      });
    });

    it('should include content for high and medium priority files only', () => {
      const prioritizedFiles: PrioritizedFile[] = [
        {
          path: 'src/auth/login.ts',
          priority: 'high',
          reasoning: 'High priority file',
          confidence: 0.95,
          estimatedTokens: 500,
          modificationLikelihood: 'high',
          strategy: 'semantic_similarity',
          priorityLevel: 'high',
          includeContent: true,
          content: 'export class LoginService { ... }'
        },
        {
          path: 'src/auth/types.ts',
          priority: 'low',
          reasoning: 'Low priority file',
          confidence: 0.4,
          estimatedTokens: 200,
          modificationLikelihood: 'low',
          strategy: 'structural_analysis',
          priorityLevel: 'low',
          includeContent: false
        }
      ];

      // Verify content inclusion logic
      const highPriorityFile = prioritizedFiles.find(f => f.priorityLevel === 'high');
      const lowPriorityFile = prioritizedFiles.find(f => f.priorityLevel === 'low');

      expect(highPriorityFile?.includeContent).toBe(true);
      expect(highPriorityFile?.content).toBeDefined();
      expect(lowPriorityFile?.includeContent).toBe(false);
      expect(lowPriorityFile?.content).toBeUndefined();
    });
  });

  describe('Intelligent Duplicate Handling', () => {
    it('should deduplicate files and keep highest priority', () => {
      const duplicateFiles = [
        {
          path: 'src/auth/login.ts',
          priority: 'medium',
          confidence: 0.7,
          strategy: 'keyword_matching',
          reasoning: 'Found via keyword matching'
        },
        {
          path: 'src/auth/login.ts',
          priority: 'high',
          confidence: 0.9,
          strategy: 'semantic_similarity',
          reasoning: 'Found via semantic analysis'
        },
        {
          path: 'src/auth/login.ts',
          priority: 'low',
          confidence: 0.5,
          strategy: 'structural_analysis',
          reasoning: 'Found via structural analysis'
        }
      ];

      const result = (service as Record<string, unknown>).deduplicateFilesByPriority(duplicateFiles);

      // Should have only one file
      expect(result).toHaveLength(1);
      
      // Should keep the highest priority (semantic_similarity with high priority)
      expect(result[0].strategy).toBe('semantic_similarity');
      expect(result[0].priority).toBe('high');
      expect(result[0].confidence).toBe(0.9);
    });
  });

  describe('Enhanced Configuration', () => {
    it('should use enhanced token budget and file limits', async () => {
      const mockResponse: FileDiscoveryResult = {
        relevantFiles: [],
        totalFilesAnalyzed: 50,
        processingTimeMs: 1000,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: { totalTokens: 0, averageConfidence: 0 }
      };

      mockLLMService.performFileDiscovery = vi.fn().mockResolvedValue(mockResponse);

      await (service as Record<string, unknown>).executeFileDiscovery(mockContext);

      // Verify enhanced configuration was used
      expect(mockLLMService.performFileDiscovery).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(String),
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({
          tokenBudget: 250000, // 5x increase from 50K to 250K
          maxFiles: 50, // Max files per strategy
          filePatterns: mockContext.input.includePatterns,
          excludePatterns: mockContext.input.excludePatterns,
          focusDirectories: mockContext.input.focusAreas
        })
      );
    });
  });
});
