import { describe, it, expect } from 'vitest';
import {
  ContextCuratorLLMTask,
  intentAnalysisResultSchema,
  fileDiscoveryResultSchema,
  promptRefinementResultSchema,
  relevanceScoringResultSchema,
  metaPromptGenerationResultSchema,
  architecturalAnalysisResultSchema,
  llmTaskErrorSchema,
  type IntentAnalysisResult,
  type FileDiscoveryResult,
  type PromptRefinementResult,
  type RelevanceScoringResult,
  type MetaPromptGenerationResult,
  type ArchitecturalAnalysisResult,
  type LLMTaskError,
  validateIntentAnalysisResult,
  validateFileDiscoveryResult,
  validatePromptRefinementResult,
  validateRelevanceScoringResult,
  validateMetaPromptGenerationResult,
  validateArchitecturalAnalysisResult
} from '../../../types/llm-tasks.js';

describe('LLM Task Type Definitions', () => {
  describe('ContextCuratorLLMTask Enum', () => {
    it('should contain all required task types with correct values', () => {
      expect(ContextCuratorLLMTask.INTENT_ANALYSIS).toBe('context_curator_intent_analysis');
      expect(ContextCuratorLLMTask.PROMPT_REFINEMENT).toBe('context_curator_prompt_refinement');
      expect(ContextCuratorLLMTask.FILE_DISCOVERY).toBe('context_curator_file_discovery');
      expect(ContextCuratorLLMTask.RELEVANCE_SCORING).toBe('context_curator_relevance_scoring');
      expect(ContextCuratorLLMTask.META_PROMPT_GENERATION).toBe('context_curator_meta_prompt_generation');
      expect(ContextCuratorLLMTask.ARCHITECTURAL_ANALYSIS).toBe('context_curator_architectural_analysis');
    });

    it('should have exactly 6 task types', () => {
      const taskValues = Object.values(ContextCuratorLLMTask);
      expect(taskValues).toHaveLength(6);
    });

    it('should have all values prefixed with context_curator_', () => {
      const taskValues = Object.values(ContextCuratorLLMTask);
      taskValues.forEach(value => {
        expect(value).toMatch(/^context_curator_/);
      });
    });
  });

  describe('IntentAnalysisResult Schema', () => {
    it('should validate valid intent analysis result', () => {
      const validResult: IntentAnalysisResult = {
        taskType: 'feature_addition',
        confidence: 0.9,
        reasoning: ['Clear feature request', 'Well-defined scope'],
        architecturalComponents: ['authentication', 'user-management'],
        scopeAssessment: {
          complexity: 'moderate',
          estimatedFiles: 8,
          riskLevel: 'medium'
        },
        suggestedFocusAreas: ['auth', 'security'],
        estimatedEffort: 'medium'
      };

      expect(() => intentAnalysisResultSchema.parse(validResult)).not.toThrow();
      expect(validateIntentAnalysisResult(validResult)).toBe(true);
    });

    it('should reject invalid confidence values', () => {
      const invalidResult = {
        taskType: 'feature_addition',
        confidence: 1.5, // Invalid: > 1
        reasoning: ['test'],
        architecturalComponents: ['test'],
        scopeAssessment: { complexity: 'moderate', estimatedFiles: 5, riskLevel: 'medium' },
        suggestedFocusAreas: ['test'],
        estimatedEffort: 'medium'
      };

      expect(() => intentAnalysisResultSchema.parse(invalidResult)).toThrow();
      expect(validateIntentAnalysisResult(invalidResult)).toBe(false);
    });

    it('should reject empty reasoning array', () => {
      const invalidResult = {
        taskType: 'feature_addition',
        confidence: 0.8,
        reasoning: [], // Invalid: empty array
        architecturalComponents: ['test'],
        scopeAssessment: { complexity: 'moderate', estimatedFiles: 5, riskLevel: 'medium' },
        suggestedFocusAreas: ['test'],
        estimatedEffort: 'medium'
      };

      expect(() => intentAnalysisResultSchema.parse(invalidResult)).toThrow();
      expect(validateIntentAnalysisResult(invalidResult)).toBe(false);
    });

    it('should reject invalid complexity values', () => {
      const invalidResult = {
        taskType: 'feature_addition',
        confidence: 0.8,
        reasoning: ['test'],
        architecturalComponents: ['test'],
        scopeAssessment: { complexity: 'invalid', estimatedFiles: 5, riskLevel: 'medium' },
        suggestedFocusAreas: ['test'],
        estimatedEffort: 'medium'
      };

      expect(() => intentAnalysisResultSchema.parse(invalidResult)).toThrow();
      expect(validateIntentAnalysisResult(invalidResult)).toBe(false);
    });
  });

  describe('FileDiscoveryResult Schema', () => {
    it('should validate valid file discovery result', () => {
      const validResult: FileDiscoveryResult = {
        relevantFiles: [
          {
            path: 'src/auth/login.ts',
            priority: 'high',
            reasoning: 'Contains authentication logic',
            confidence: 0.95,
            estimatedTokens: 500,
            modificationLikelihood: 'high'
          },
          {
            path: 'src/components/LoginForm.tsx',
            priority: 'medium',
            reasoning: 'UI component for login',
            confidence: 0.8,
            estimatedTokens: 300,
            modificationLikelihood: 'medium'
          }
        ],
        totalFilesAnalyzed: 150,
        processingTimeMs: 2500,
        searchStrategy: 'semantic_and_keyword',
        coverageMetrics: {
          totalTokens: 800,
          averageConfidence: 0.875
        }
      };

      expect(() => fileDiscoveryResultSchema.parse(validResult)).not.toThrow();
      expect(validateFileDiscoveryResult(validResult)).toBe(true);
    });

    it('should reject invalid priority values', () => {
      const invalidResult = {
        relevantFiles: [
          {
            path: 'src/test.ts',
            priority: 'invalid', // Invalid priority
            reasoning: 'test',
            confidence: 0.8,
            estimatedTokens: 100,
            modificationLikelihood: 'medium'
          }
        ],
        totalFilesAnalyzed: 10,
        processingTimeMs: 1000,
        searchStrategy: 'semantic_and_keyword',
        coverageMetrics: { totalTokens: 100, averageConfidence: 0.8 }
      };

      expect(() => fileDiscoveryResultSchema.parse(invalidResult)).toThrow();
      expect(validateFileDiscoveryResult(invalidResult)).toBe(false);
    });

    it('should reject negative processing time', () => {
      const invalidResult = {
        relevantFiles: [],
        totalFilesAnalyzed: 10,
        processingTimeMs: -100, // Invalid: negative time
        searchStrategy: 'semantic_and_keyword',
        coverageMetrics: { totalTokens: 0, averageConfidence: 0 }
      };

      expect(() => fileDiscoveryResultSchema.parse(invalidResult)).toThrow();
      expect(validateFileDiscoveryResult(invalidResult)).toBe(false);
    });
  });

  describe('PromptRefinementResult Schema', () => {
    it('should validate valid prompt refinement result', () => {
      const validResult: PromptRefinementResult = {
        refinedPrompt: 'Enhanced prompt with additional context',
        enhancementReasoning: ['Added technical context', 'Clarified requirements'],
        addedContext: ['Project uses React', 'TypeScript codebase'],
        originalLength: 50,
        refinedLength: 120,
        improvementScore: 0.8,
        contextualEnhancements: ['architecture', 'dependencies']
      };

      expect(() => promptRefinementResultSchema.parse(validResult)).not.toThrow();
      expect(validatePromptRefinementResult(validResult)).toBe(true);
    });

    it('should reject empty refined prompt', () => {
      const invalidResult = {
        refinedPrompt: '', // Invalid: empty prompt
        enhancementReasoning: ['test'],
        addedContext: ['test'],
        originalLength: 50,
        refinedLength: 0,
        improvementScore: 0.5,
        contextualEnhancements: ['test']
      };

      expect(() => promptRefinementResultSchema.parse(invalidResult)).toThrow();
      expect(validatePromptRefinementResult(invalidResult)).toBe(false);
    });

    it('should reject invalid improvement score', () => {
      const invalidResult = {
        refinedPrompt: 'test prompt',
        enhancementReasoning: ['test'],
        addedContext: ['test'],
        originalLength: 50,
        refinedLength: 60,
        improvementScore: 1.5, // Invalid: > 1
        contextualEnhancements: ['test']
      };

      expect(() => promptRefinementResultSchema.parse(invalidResult)).toThrow();
      expect(validatePromptRefinementResult(invalidResult)).toBe(false);
    });
  });

  describe('RelevanceScoringResult Schema', () => {
    it('should validate valid relevance scoring result', () => {
      const validResult: RelevanceScoringResult = {
        fileScores: [
          {
            filePath: 'src/auth.ts',
            relevanceScore: 0.9,
            confidence: 0.85,
            reasoning: 'Core authentication logic',
            categories: ['authentication', 'security'],
            modificationLikelihood: 'high',
            estimatedTokens: 200
          }
        ],
        overallMetrics: {
          averageRelevance: 0.9,
          totalFilesScored: 1,
          highRelevanceCount: 1,
          processingTimeMs: 1500
        },
        scoringStrategy: 'semantic_similarity'
      };

      expect(() => relevanceScoringResultSchema.parse(validResult)).not.toThrow();
      expect(validateRelevanceScoringResult(validResult)).toBe(true);
    });

    it('should reject empty categories array', () => {
      const invalidResult = {
        fileScores: [
          {
            filePath: 'src/test.ts',
            relevanceScore: 0.8,
            confidence: 0.7,
            reasoning: 'test',
            categories: [], // Invalid: empty categories
            modificationLikelihood: 'medium'
          }
        ],
        overallMetrics: {
          averageRelevance: 0.8,
          totalFilesScored: 1,
          highRelevanceCount: 1,
          processingTimeMs: 1000
        },
        scoringStrategy: 'semantic_similarity'
      };

      expect(() => relevanceScoringResultSchema.parse(invalidResult)).toThrow();
      expect(validateRelevanceScoringResult(invalidResult)).toBe(false);
    });
  });

  describe('MetaPromptGenerationResult Schema', () => {
    it('should validate valid meta-prompt generation result', () => {
      const validResult: MetaPromptGenerationResult = {
        systemPrompt: 'You are an expert developer...',
        userPrompt: 'Implement authentication system...',
        contextSummary: 'React TypeScript application...',
        taskDecomposition: {
          epics: [
            {
              id: 'E001',
              title: 'Authentication Epic',
              description: 'User authentication system',
              estimatedComplexity: 'medium',
              tasks: [
                {
                  id: 'T001',
                  title: 'Login component',
                  description: 'Create login form',
                  estimatedHours: 4,
                  dependencies: [],
                  subtasks: [
                    {
                      id: 'ST001',
                      title: 'Form validation',
                      description: 'Add input validation',
                      estimatedMinutes: 30
                    }
                  ]
                }
              ]
            }
          ]
        },
        guidelines: ['Follow atomic task principles'],
        estimatedComplexity: 'medium',
        qualityScore: 0.9
      };

      expect(() => metaPromptGenerationResultSchema.parse(validResult)).not.toThrow();
      expect(validateMetaPromptGenerationResult(validResult)).toBe(true);
    });

    it('should reject empty system prompt', () => {
      const invalidResult = {
        systemPrompt: '', // Invalid: empty prompt
        userPrompt: 'test',
        contextSummary: 'test',
        taskDecomposition: { epics: [] },
        guidelines: ['test'],
        estimatedComplexity: 'medium',
        qualityScore: 0.8
      };

      expect(() => metaPromptGenerationResultSchema.parse(invalidResult)).toThrow();
      expect(validateMetaPromptGenerationResult(invalidResult)).toBe(false);
    });
  });

  describe('ArchitecturalAnalysisResult Schema', () => {
    it('should validate valid architectural analysis result', () => {
      const validResult: ArchitecturalAnalysisResult = {
        architecturalPatterns: ['mvc', 'component-based'],
        dependencies: [
          {
            name: 'react',
            version: '^18.0.0',
            type: 'runtime',
            importance: 'critical'
          }
        ],
        codeStructure: {
          directories: ['src', 'components', 'services'],
          entryPoints: ['src/index.ts'],
          configFiles: ['package.json', 'tsconfig.json']
        },
        recommendations: ['Use TypeScript strict mode'],
        complexityAssessment: {
          overall: 'medium',
          factors: ['component count', 'dependency depth'],
          score: 0.6
        }
      };

      expect(() => architecturalAnalysisResultSchema.parse(validResult)).not.toThrow();
      expect(validateArchitecturalAnalysisResult(validResult)).toBe(true);
    });

    it('should reject invalid dependency importance', () => {
      const invalidResult = {
        architecturalPatterns: ['mvc'],
        dependencies: [
          {
            name: 'test',
            version: '1.0.0',
            type: 'runtime',
            importance: 'invalid' // Invalid importance level
          }
        ],
        codeStructure: {
          directories: ['src'],
          entryPoints: ['index.ts'],
          configFiles: ['package.json']
        },
        recommendations: ['test'],
        complexityAssessment: {
          overall: 'medium',
          factors: ['test'],
          score: 0.5
        }
      };

      expect(() => architecturalAnalysisResultSchema.parse(invalidResult)).toThrow();
      expect(validateArchitecturalAnalysisResult(invalidResult)).toBe(false);
    });
  });

  describe('LLMTaskError Schema', () => {
    it('should validate valid LLM task error', () => {
      const validError: LLMTaskError = {
        task: ContextCuratorLLMTask.INTENT_ANALYSIS,
        message: 'Failed to analyze intent',
        code: 'ANALYSIS_FAILED',
        details: {
          originalError: 'Network timeout',
          retryCount: 3,
          timestamp: new Date()
        },
        recoverable: true
      };

      expect(() => llmTaskErrorSchema.parse(validError)).not.toThrow();
    });

    it('should reject invalid task type', () => {
      const invalidError = {
        task: 'invalid_task', // Invalid task type
        message: 'test error',
        code: 'TEST_ERROR',
        details: {},
        recoverable: true
      };

      expect(() => llmTaskErrorSchema.parse(invalidError)).toThrow();
    });

    it('should reject empty message', () => {
      const invalidError = {
        task: ContextCuratorLLMTask.INTENT_ANALYSIS,
        message: '', // Invalid: empty message
        code: 'TEST_ERROR',
        details: {},
        recoverable: true
      };

      expect(() => llmTaskErrorSchema.parse(invalidError)).toThrow();
    });
  });

  describe('Type Inference', () => {
    it('should correctly infer TypeScript types', () => {
      // This test ensures our type exports work correctly
      const intentResult: IntentAnalysisResult = {
        taskType: 'feature_addition',
        confidence: 0.9,
        reasoning: ['test'],
        architecturalComponents: ['test'],
        scopeAssessment: {
          complexity: 'moderate',
          estimatedFiles: 5,
          riskLevel: 'medium'
        },
        suggestedFocusAreas: ['test'],
        estimatedEffort: 'medium'
      };

      const fileResult: FileDiscoveryResult = {
        relevantFiles: [],
        totalFilesAnalyzed: 0,
        processingTimeMs: 0,
        searchStrategy: 'semantic_and_keyword',
        coverageMetrics: { totalTokens: 0, averageConfidence: 0 }
      };

      // These should compile without errors
      expect(intentResult.taskType).toBe('feature_addition');
      expect(fileResult.totalFilesAnalyzed).toBe(0);
    });
  });
});
