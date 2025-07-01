import { describe, it, expect } from 'vitest';
import {
  RELEVANCE_SCORING_SYSTEM_PROMPT,
  buildRelevanceScoringPrompt,
  RELEVANCE_SCORING_RESPONSE_SCHEMA,
  RELEVANCE_SCORING_EXAMPLES,
  getRelevanceScoringTaskId,
  validateRelevanceScoringResponse,
  enhanceRelevanceScoringResponse,
  calculateOverallMetrics,
  filterFilesByRelevance,
  sortFilesByRelevance,
  filterFilesByCategory,
  getHighRelevanceFiles,
  getRecommendedScoringStrategy,
  calculateCategoryDistribution,
  getRelevanceStatistics
} from '../../../prompts/relevance-scoring.js';
import { ContextCuratorLLMTask } from '../../../types/llm-tasks.js';
import type { IntentAnalysisResult, FileDiscoveryResult } from '../../../types/llm-tasks.js';

describe('Relevance Scoring Templates', () => {
  describe('RELEVANCE_SCORING_SYSTEM_PROMPT', () => {
    it('should contain comprehensive system instructions', () => {
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('software architect');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('relevance analyst');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('scoring file relevance');
    });

    it('should define all scoring strategies', () => {
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('Semantic Similarity');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('Keyword Density');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('Structural Importance');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('Hybrid');
    });

    it('should include relevance scoring criteria', () => {
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('Score Range');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('0.0 to 1.0');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('0.9-1.0');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('Critical files');
    });

    it('should define confidence assessment guidelines', () => {
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('Rate confidence');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('Quality and completeness');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('Clarity of the relationship');
    });

    it('should define relevance categories', () => {
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('core');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('integration');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('configuration');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('testing');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('documentation');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('utilities');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('dependencies');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('infrastructure');
    });

    it('should define modification likelihood levels', () => {
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('very_high');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('high');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('medium');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('low');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('very_low');
    });

    it('should specify JSON response format', () => {
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('JSON object');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('fileScores');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('overallMetrics');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('scoringStrategy');
    });

    it('should include scoring guidelines', () => {
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('Be Precise');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('Be Comprehensive');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('Provide Clear Reasoning');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('Categorize Appropriately');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('Assess Realistically');
      expect(RELEVANCE_SCORING_SYSTEM_PROMPT).toContain('Consider Context');
    });
  });

  describe('buildRelevanceScoringPrompt', () => {
    const originalPrompt = 'Add user authentication to the application';
    const refinedPrompt = 'Implement secure JWT-based authentication system with user registration, login, and session management';
    const intentAnalysis: IntentAnalysisResult = {
      taskType: 'feature_addition',
      confidence: 0.9,
      reasoning: ['Clear feature request for authentication'],
      architecturalComponents: ['frontend', 'backend', 'authentication'],
      scopeAssessment: {
        complexity: 'moderate',
        estimatedFiles: 8,
        riskLevel: 'medium'
      },
      suggestedFocusAreas: ['security-patterns', 'user-management'],
      estimatedEffort: 'medium'
    };

    const fileDiscoveryResult: FileDiscoveryResult = {
      relevantFiles: [
        {
          path: 'src/auth/authentication.ts',
          priority: 'high',
          reasoning: 'Core authentication module',
          confidence: 0.95,
          estimatedTokens: 800,
          modificationLikelihood: 'very_high'
        },
        {
          path: 'src/auth/middleware.ts',
          priority: 'medium',
          reasoning: 'Authentication middleware',
          confidence: 0.8,
          estimatedTokens: 400,
          modificationLikelihood: 'high'
        }
      ],
      totalFilesAnalyzed: 150,
      processingTimeMs: 2500,
      searchStrategy: 'semantic_similarity',
      coverageMetrics: {
        totalTokens: 1200,
        averageConfidence: 0.875
      }
    };

    it('should include additional context when provided', () => {
      const additionalContext = {
        codemapContent: 'React application with Express.js backend',
        priorityWeights: {
          semantic: 0.4,
          keyword: 0.3,
          structural: 0.3
        },
        categoryFilters: ['core', 'integration'],
        minRelevanceThreshold: 0.6
      };

      const prompt = buildRelevanceScoringPrompt(
        originalPrompt,
        intentAnalysis,
        refinedPrompt,
        fileDiscoveryResult,
        'hybrid',
        additionalContext
      );

      expect(prompt).toContain('ADDITIONAL CONTEXT:');
      expect(prompt).toContain('Complete Codebase Content: React application with Express.js backend');
      expect(prompt).toContain('Priority Weights: Semantic=0.4, Keyword=0.3, Structural=0.3');
      expect(prompt).toContain('Focus Categories: core, integration');
      expect(prompt).toContain('Minimum Relevance Threshold: 0.6');
    });

    it('should handle partial additional context', () => {
      const additionalContext = {
        codemapContent: 'TypeScript project',
        minRelevanceThreshold: 0.5
      };

      const prompt = buildRelevanceScoringPrompt(
        originalPrompt,
        intentAnalysis,
        refinedPrompt,
        fileDiscoveryResult,
        'semantic_similarity',
        additionalContext
      );

      expect(prompt).toContain('Complete Codebase Content: TypeScript project');
      expect(prompt).toContain('Minimum Relevance Threshold: 0.5');
      expect(prompt).not.toContain('Priority Weights:');
      expect(prompt).not.toContain('Focus Categories:');
    });

    it('should handle empty additional context', () => {
      const prompt = buildRelevanceScoringPrompt(
        originalPrompt,
        intentAnalysis,
        refinedPrompt,
        fileDiscoveryResult,
        'keyword_density',
        {}
      );

      expect(prompt).not.toContain('ADDITIONAL CONTEXT:');
      expect(prompt).toContain('DEVELOPMENT REQUEST:');
      expect(prompt).toContain('REFINED PROMPT:');
      expect(prompt).toContain('INTENT ANALYSIS:');
      expect(prompt).toContain('DISCOVERED FILES:');
    });

    it('should handle empty category filters', () => {
      const additionalContext = {
        categoryFilters: [],
        minRelevanceThreshold: 0.7
      };

      const prompt = buildRelevanceScoringPrompt(
        originalPrompt,
        intentAnalysis,
        refinedPrompt,
        fileDiscoveryResult,
        'structural_importance',
        additionalContext
      );

      expect(prompt).toContain('Minimum Relevance Threshold: 0.7');
      expect(prompt).not.toContain('Focus Categories:');
    });
  });

  describe('RELEVANCE_SCORING_RESPONSE_SCHEMA', () => {
    it('should define correct schema structure', () => {
      expect(RELEVANCE_SCORING_RESPONSE_SCHEMA.type).toBe('object');
      expect(RELEVANCE_SCORING_RESPONSE_SCHEMA.properties).toBeDefined();
      expect(RELEVANCE_SCORING_RESPONSE_SCHEMA.required).toEqual([
        'fileScores',
        'overallMetrics',
        'scoringStrategy'
      ]);
      expect(RELEVANCE_SCORING_RESPONSE_SCHEMA.additionalProperties).toBe(false);
    });

    it('should define fileScores as array of objects', () => {
      const fileScoresProperty = RELEVANCE_SCORING_RESPONSE_SCHEMA.properties.fileScores;
      expect(fileScoresProperty.type).toBe('array');
      expect(fileScoresProperty.items.type).toBe('object');
      expect(fileScoresProperty.items.required).toEqual([
        'filePath', 'relevanceScore', 'confidence', 'reasoning', 'categories', 'modificationLikelihood', 'estimatedTokens'
      ]);
    });

    it('should define file score properties correctly', () => {
      const fileSchema = RELEVANCE_SCORING_RESPONSE_SCHEMA.properties.fileScores.items;

      expect(fileSchema.properties.filePath.type).toBe('string');
      expect(fileSchema.properties.filePath.minLength).toBe(1);

      expect(fileSchema.properties.relevanceScore.type).toBe('number');
      expect(fileSchema.properties.relevanceScore.minimum).toBe(0);
      expect(fileSchema.properties.relevanceScore.maximum).toBe(1);

      expect(fileSchema.properties.confidence.type).toBe('number');
      expect(fileSchema.properties.confidence.minimum).toBe(0);
      expect(fileSchema.properties.confidence.maximum).toBe(1);

      expect(fileSchema.properties.reasoning.type).toBe('string');
      expect(fileSchema.properties.reasoning.minLength).toBe(1);

      expect(fileSchema.properties.categories.type).toBe('array');
      expect(fileSchema.properties.categories.minItems).toBe(1);

      expect(fileSchema.properties.modificationLikelihood.enum).toEqual([
        'very_high', 'high', 'medium', 'low', 'very_low'
      ]);
    });

    it('should define overallMetrics object correctly', () => {
      const metricsProperty = RELEVANCE_SCORING_RESPONSE_SCHEMA.properties.overallMetrics;
      expect(metricsProperty.type).toBe('object');
      expect(metricsProperty.required).toEqual([
        'averageRelevance', 'totalFilesScored', 'highRelevanceCount', 'processingTimeMs'
      ]);
      expect(metricsProperty.additionalProperties).toBe(false);

      expect(metricsProperty.properties.averageRelevance.type).toBe('number');
      expect(metricsProperty.properties.averageRelevance.minimum).toBe(0);
      expect(metricsProperty.properties.averageRelevance.maximum).toBe(1);

      expect(metricsProperty.properties.totalFilesScored.type).toBe('number');
      expect(metricsProperty.properties.totalFilesScored.minimum).toBe(0);

      expect(metricsProperty.properties.highRelevanceCount.type).toBe('number');
      expect(metricsProperty.properties.highRelevanceCount.minimum).toBe(0);

      expect(metricsProperty.properties.processingTimeMs.type).toBe('number');
      expect(metricsProperty.properties.processingTimeMs.minimum).toBe(0);
    });

    it('should define scoringStrategy enum correctly', () => {
      const strategyProperty = RELEVANCE_SCORING_RESPONSE_SCHEMA.properties.scoringStrategy;
      expect(strategyProperty.type).toBe('string');
      expect(strategyProperty.enum).toEqual([
        'semantic_similarity', 'keyword_density', 'structural_importance', 'hybrid'
      ]);
    });
  });

  describe('RELEVANCE_SCORING_EXAMPLES', () => {
    it('should contain examples for different scoring strategies', () => {
      expect(RELEVANCE_SCORING_EXAMPLES.semantic_similarity_refactoring).toBeDefined();
      expect(RELEVANCE_SCORING_EXAMPLES.keyword_density_feature).toBeDefined();
    });

    it('should have valid semantic similarity example', () => {
      const example = RELEVANCE_SCORING_EXAMPLES.semantic_similarity_refactoring;

      expect(example.originalPrompt).toContain('Refactor');
      expect(example.scoringStrategy).toBe('semantic_similarity');
      expect(example.intentAnalysis.taskType).toBe('refactoring');
      expect(example.intentAnalysis.confidence).toBeGreaterThan(0.8);
      expect(example.expectedResponse.scoringStrategy).toBe('semantic_similarity');
      expect(example.expectedResponse.fileScores).toHaveLength(2);
      expect(example.expectedResponse.fileScores[0].relevanceScore).toBeGreaterThan(0.9);
      expect(example.expectedResponse.overallMetrics.averageRelevance).toBeGreaterThan(0.8);
    });

    it('should have valid keyword density example', () => {
      const example = RELEVANCE_SCORING_EXAMPLES.keyword_density_feature;

      expect(example.originalPrompt).toContain('dashboard');
      expect(example.scoringStrategy).toBe('keyword_density');
      expect(example.intentAnalysis.taskType).toBe('feature_addition');
      expect(example.intentAnalysis.confidence).toBeGreaterThan(0.9);
      expect(example.expectedResponse.scoringStrategy).toBe('keyword_density');
      expect(example.expectedResponse.fileScores).toHaveLength(2);
      expect(example.expectedResponse.fileScores[0].categories).toContain('core');
      expect(example.expectedResponse.overallMetrics.highRelevanceCount).toBe(2);
    });

    it('should have consistent response structure across examples', () => {
      Object.values(RELEVANCE_SCORING_EXAMPLES).forEach(example => {
        const response = example.expectedResponse;

        expect(response.fileScores).toBeInstanceOf(Array);
        expect(response.fileScores.length).toBeGreaterThan(0);

        response.fileScores.forEach(fileScore => {
          expect(fileScore.filePath).toBeDefined();
          expect(typeof fileScore.filePath).toBe('string');
          expect(fileScore.filePath.length).toBeGreaterThan(0);

          expect(fileScore.relevanceScore).toBeGreaterThanOrEqual(0);
          expect(fileScore.relevanceScore).toBeLessThanOrEqual(1);

          expect(fileScore.confidence).toBeGreaterThanOrEqual(0);
          expect(fileScore.confidence).toBeLessThanOrEqual(1);

          expect(fileScore.reasoning).toBeDefined();
          expect(typeof fileScore.reasoning).toBe('string');
          expect(fileScore.reasoning.length).toBeGreaterThan(0);

          expect(Array.isArray(fileScore.categories)).toBe(true);
          expect(fileScore.categories.length).toBeGreaterThan(0);

          expect(['very_high', 'high', 'medium', 'low', 'very_low']).toContain(fileScore.modificationLikelihood);
        });

        expect(response.overallMetrics.averageRelevance).toBeGreaterThanOrEqual(0);
        expect(response.overallMetrics.averageRelevance).toBeLessThanOrEqual(1);
        expect(response.overallMetrics.totalFilesScored).toBeGreaterThanOrEqual(0);
        expect(response.overallMetrics.highRelevanceCount).toBeGreaterThanOrEqual(0);
        expect(response.overallMetrics.processingTimeMs).toBeGreaterThanOrEqual(0);

        expect(['semantic_similarity', 'keyword_density', 'structural_importance', 'hybrid']).toContain(response.scoringStrategy);
      });
    });
  });

  describe('getRelevanceScoringTaskId', () => {
    it('should return correct LLM task identifier', () => {
      const taskId = getRelevanceScoringTaskId();
      expect(taskId).toBe(ContextCuratorLLMTask.RELEVANCE_SCORING);
      expect(taskId).toBe('context_curator_relevance_scoring');
    });
  });

  describe('validateRelevanceScoringResponse', () => {
    it('should validate correct response structure', () => {
      const validResponse = {
        fileScores: [
          {
            filePath: 'src/auth/login.ts',
            relevanceScore: 0.95,
            confidence: 0.9,
            reasoning: 'Core authentication logic',
            categories: ['core', 'authentication'],
            modificationLikelihood: 'very_high',
            estimatedTokens: 150
          }
        ],
        overallMetrics: {
          averageRelevance: 0.95,
          totalFilesScored: 1,
          highRelevanceCount: 1,
          processingTimeMs: 1500
        },
        scoringStrategy: 'semantic_similarity'
      };

      expect(validateRelevanceScoringResponse(validResponse)).toBe(true);
    });

    it('should reject invalid relevance score range', () => {
      const invalidResponse = {
        fileScores: [
          {
            filePath: 'src/test.ts',
            relevanceScore: 1.5, // Invalid: > 1
            confidence: 0.8,
            reasoning: 'test',
            categories: ['core'],
            modificationLikelihood: 'medium',
            estimatedTokens: 100
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

      expect(validateRelevanceScoringResponse(invalidResponse)).toBe(false);
    });

    it('should reject empty categories array', () => {
      const invalidResponse = {
        fileScores: [
          {
            filePath: 'src/test.ts',
            relevanceScore: 0.8,
            confidence: 0.8,
            reasoning: 'test',
            categories: [], // Invalid: empty array
            modificationLikelihood: 'medium',
            estimatedTokens: 100
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

      expect(validateRelevanceScoringResponse(invalidResponse)).toBe(false);
    });

    it('should reject invalid scoring strategy', () => {
      const invalidResponse = {
        fileScores: [],
        overallMetrics: {
          averageRelevance: 0,
          totalFilesScored: 0,
          highRelevanceCount: 0,
          processingTimeMs: 1000
        },
        scoringStrategy: 'invalid_strategy' // Invalid strategy
      };

      expect(validateRelevanceScoringResponse(invalidResponse)).toBe(false);
    });

    it('should reject missing required fields', () => {
      const incompleteResponse = {
        fileScores: [],
        overallMetrics: {
          averageRelevance: 0,
          totalFilesScored: 0
          // Missing other required fields
        }
      };

      expect(validateRelevanceScoringResponse(incompleteResponse)).toBe(false);
    });
  });

  describe('calculateOverallMetrics', () => {
    it('should calculate correct metrics for multiple files', () => {
      const fileScores = [
        { relevanceScore: 0.9 },
        { relevanceScore: 0.8 },
        { relevanceScore: 0.6 }
      ];

      const metrics = calculateOverallMetrics(fileScores, 2000);

      expect(metrics.averageRelevance).toBe(0.77); // (0.9 + 0.8 + 0.6) / 3 = 0.77
      expect(metrics.totalFilesScored).toBe(3);
      expect(metrics.highRelevanceCount).toBe(2); // >= 0.7
      expect(metrics.processingTimeMs).toBe(2000);
    });

    it('should handle empty files array', () => {
      const metrics = calculateOverallMetrics([], 1000);

      expect(metrics.averageRelevance).toBe(0);
      expect(metrics.totalFilesScored).toBe(0);
      expect(metrics.highRelevanceCount).toBe(0);
      expect(metrics.processingTimeMs).toBe(1000);
    });

    it('should round average relevance to 2 decimal places', () => {
      const fileScores = [
        { relevanceScore: 0.333 },
        { relevanceScore: 0.666 },
        { relevanceScore: 0.999 }
      ];

      const metrics = calculateOverallMetrics(fileScores, 1500);

      expect(metrics.averageRelevance).toBe(0.67); // (0.333 + 0.666 + 0.999) / 3 = 0.666, rounded to 0.67
      expect(metrics.totalFilesScored).toBe(3);
      expect(metrics.highRelevanceCount).toBe(1); // Only 0.999 >= 0.7
    });
  });

  describe('filterFilesByRelevance', () => {
    const testFiles = [
      { relevanceScore: 0.9, path: 'file1.ts' },
      { relevanceScore: 0.6, path: 'file2.ts' },
      { relevanceScore: 0.8, path: 'file3.ts' },
      { relevanceScore: 0.4, path: 'file4.ts' }
    ];

    it('should filter files by minimum relevance threshold', () => {
      const highRelevanceFiles = filterFilesByRelevance(testFiles, 0.7);

      expect(highRelevanceFiles).toHaveLength(2);
      expect(highRelevanceFiles[0].path).toBe('file1.ts');
      expect(highRelevanceFiles[1].path).toBe('file3.ts');
    });

    it('should return all files when threshold is 0', () => {
      const allFiles = filterFilesByRelevance(testFiles, 0);
      expect(allFiles).toHaveLength(4);
    });

    it('should return empty array when threshold is too high', () => {
      const noFiles = filterFilesByRelevance(testFiles, 1.0);
      expect(noFiles).toHaveLength(0);
    });
  });

  describe('sortFilesByRelevance', () => {
    it('should sort files by relevance in descending order', () => {
      const files = [
        { relevanceScore: 0.6, path: 'file1.ts' },
        { relevanceScore: 0.9, path: 'file2.ts' },
        { relevanceScore: 0.7, path: 'file3.ts' }
      ];

      const sortedFiles = sortFilesByRelevance(files);

      expect(sortedFiles).toHaveLength(3);
      expect(sortedFiles[0].relevanceScore).toBe(0.9);
      expect(sortedFiles[0].path).toBe('file2.ts');
      expect(sortedFiles[1].relevanceScore).toBe(0.7);
      expect(sortedFiles[1].path).toBe('file3.ts');
      expect(sortedFiles[2].relevanceScore).toBe(0.6);
      expect(sortedFiles[2].path).toBe('file1.ts');
    });

    it('should not modify original array', () => {
      const files = [
        { relevanceScore: 0.6, path: 'file1.ts' },
        { relevanceScore: 0.9, path: 'file2.ts' }
      ];

      const originalOrder = [...files];
      const sortedFiles = sortFilesByRelevance(files);

      expect(files).toEqual(originalOrder);
      expect(sortedFiles).not.toBe(files);
    });
  });

  describe('filterFilesByCategory', () => {
    const testFiles = [
      { categories: ['core', 'authentication'], path: 'file1.ts' },
      { categories: ['utilities'], path: 'file2.ts' },
      { categories: ['core', 'integration'], path: 'file3.ts' },
      { categories: ['testing'], path: 'file4.ts' }
    ];

    it('should filter files by target category', () => {
      const coreFiles = filterFilesByCategory(testFiles, 'core');

      expect(coreFiles).toHaveLength(2);
      expect(coreFiles[0].path).toBe('file1.ts');
      expect(coreFiles[1].path).toBe('file3.ts');
    });

    it('should return empty array when no files match category', () => {
      const documentationFiles = filterFilesByCategory(testFiles, 'documentation');
      expect(documentationFiles).toHaveLength(0);
    });
  });

  describe('getHighRelevanceFiles', () => {
    it('should return files with relevance >= 0.7', () => {
      const files = [
        { relevanceScore: 0.9, path: 'file1.ts' },
        { relevanceScore: 0.6, path: 'file2.ts' },
        { relevanceScore: 0.8, path: 'file3.ts' },
        { relevanceScore: 0.7, path: 'file4.ts' }
      ];

      const highRelevanceFiles = getHighRelevanceFiles(files);

      expect(highRelevanceFiles).toHaveLength(3);
      expect(highRelevanceFiles.map(f => f.path)).toEqual(['file1.ts', 'file3.ts', 'file4.ts']);
    });
  });

  describe('getRecommendedScoringStrategy', () => {
    it('should recommend keyword_density for small file sets', () => {
      const strategy = getRecommendedScoringStrategy('feature_addition', 3);
      expect(strategy).toBe('keyword_density');
    });

    it('should recommend structural_importance for large file sets with codemap', () => {
      const strategy = getRecommendedScoringStrategy('general', 25, true);
      expect(strategy).toBe('structural_importance');
    });

    it('should recommend semantic_similarity for refactoring', () => {
      const strategy = getRecommendedScoringStrategy('refactoring', 10);
      expect(strategy).toBe('semantic_similarity');
    });

    it('should recommend hybrid for feature_addition', () => {
      const strategy = getRecommendedScoringStrategy('feature_addition', 10);
      expect(strategy).toBe('hybrid');
    });

    it('should recommend keyword_density for bug_fix', () => {
      const strategy = getRecommendedScoringStrategy('bug_fix', 10);
      expect(strategy).toBe('keyword_density');
    });

    it('should recommend structural_importance for general', () => {
      const strategy = getRecommendedScoringStrategy('general', 10);
      expect(strategy).toBe('structural_importance');
    });

    it('should recommend hybrid for unknown task types', () => {
      const strategy = getRecommendedScoringStrategy('unknown_task', 10);
      expect(strategy).toBe('hybrid');
    });
  });

  describe('calculateCategoryDistribution', () => {
    it('should calculate correct category distribution', () => {
      const fileScores = [
        { categories: ['core', 'authentication'] },
        { categories: ['core', 'integration'] },
        { categories: ['utilities'] },
        { categories: ['core'] }
      ];

      const distribution = calculateCategoryDistribution(fileScores);

      expect(distribution.core).toBe(3);
      expect(distribution.authentication).toBe(1);
      expect(distribution.integration).toBe(1);
      expect(distribution.utilities).toBe(1);
    });

    it('should handle empty array', () => {
      const distribution = calculateCategoryDistribution([]);
      expect(Object.keys(distribution)).toHaveLength(0);
    });
  });

  describe('getRelevanceStatistics', () => {
    it('should calculate correct statistics', () => {
      const fileScores = [
        { relevanceScore: 0.6 },
        { relevanceScore: 0.8 },
        { relevanceScore: 0.9 },
        { relevanceScore: 0.7 }
      ];

      const stats = getRelevanceStatistics(fileScores);

      expect(stats.min).toBe(0.6);
      expect(stats.max).toBe(0.9);
      expect(stats.mean).toBe(0.75); // (0.6 + 0.8 + 0.9 + 0.7) / 4
      expect(stats.median).toBe(0.75); // (0.7 + 0.8) / 2
      expect(stats.standardDeviation).toBeCloseTo(0.11, 2);
    });

    it('should handle empty array', () => {
      const stats = getRelevanceStatistics([]);

      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.mean).toBe(0);
      expect(stats.median).toBe(0);
      expect(stats.standardDeviation).toBe(0);
    });

    it('should handle single file', () => {
      const stats = getRelevanceStatistics([{ relevanceScore: 0.8 }]);

      expect(stats.min).toBe(0.8);
      expect(stats.max).toBe(0.8);
      expect(stats.mean).toBe(0.8);
      expect(stats.median).toBe(0.8);
      expect(stats.standardDeviation).toBe(0);
    });
  });

  describe('enhanceRelevanceScoringResponse', () => {
    it('should handle incomplete LLM responses by adding missing files', () => {
      const incompleteResponse = {
        fileScores: [
          {
            filePath: 'file1.ts',
            relevanceScore: 0.9,
            confidence: 0.8,
            reasoning: 'High relevance file',
            categories: ['core'],
            modificationLikelihood: 'very_high',
            estimatedTokens: 500
          }
        ]
      };

      const expectedFiles = [
        { path: 'file1.ts', estimatedTokens: 500 },
        { path: 'file2.ts', estimatedTokens: 300 },
        { path: 'file3.ts', estimatedTokens: 200 }
      ];

      const enhanced = enhanceRelevanceScoringResponse(
        incompleteResponse,
        'hybrid',
        1000,
        expectedFiles
      ) as Record<string, unknown>;

      expect(enhanced.fileScores).toHaveLength(3);
      expect(enhanced.fileScores[0].filePath).toBe('file1.ts');
      expect(enhanced.fileScores[1].filePath).toBe('file2.ts');
      expect(enhanced.fileScores[2].filePath).toBe('file3.ts');

      // Check that missing files have default scores
      expect(enhanced.fileScores[1].relevanceScore).toBe(0.3);
      expect(enhanced.fileScores[1].confidence).toBe(0.5);
      expect(enhanced.fileScores[1].reasoning).toContain('Auto-generated score');
      expect(enhanced.fileScores[1].categories).toEqual(['utility']);
      expect(enhanced.fileScores[1].modificationLikelihood).toBe('low');
    });

    it('should handle single file responses by converting to array and adding missing files', () => {
      const singleFileResponse = {
        filePath: 'file1.ts',
        relevanceScore: 0.9,
        confidence: 0.8,
        reasoning: 'High relevance file',
        categories: ['core'],
        modificationLikelihood: 'very_high',
        estimatedTokens: 500
      };

      const expectedFiles = [
        { path: 'file1.ts', estimatedTokens: 500 },
        { path: 'file2.ts', estimatedTokens: 300 }
      ];

      const enhanced = enhanceRelevanceScoringResponse(
        singleFileResponse,
        'hybrid',
        1000,
        expectedFiles
      ) as Record<string, unknown>;

      expect(enhanced.fileScores).toHaveLength(2);
      expect(enhanced.fileScores[0].filePath).toBe('file1.ts');
      expect(enhanced.fileScores[1].filePath).toBe('file2.ts');

      // Check that the original file properties are removed from top level
      expect(enhanced.filePath).toBeUndefined();
      expect(enhanced.relevanceScore).toBeUndefined();
    });

    it('should not modify complete responses', () => {
      const completeResponse = {
        fileScores: [
          {
            filePath: 'file1.ts',
            relevanceScore: 0.9,
            confidence: 0.8,
            reasoning: 'High relevance file',
            categories: ['core'],
            modificationLikelihood: 'very_high',
            estimatedTokens: 500
          },
          {
            filePath: 'file2.ts',
            relevanceScore: 0.7,
            confidence: 0.6,
            reasoning: 'Medium relevance file',
            categories: ['utility'],
            modificationLikelihood: 'medium',
            estimatedTokens: 300
          }
        ],
        overallMetrics: {
          averageRelevance: 0.8,
          totalFilesScored: 2,
          highRelevanceCount: 2,
          processingTimeMs: 1000
        },
        scoringStrategy: 'hybrid'
      };

      const expectedFiles = [
        { path: 'file1.ts', estimatedTokens: 500 },
        { path: 'file2.ts', estimatedTokens: 300 }
      ];

      const enhanced = enhanceRelevanceScoringResponse(
        completeResponse,
        'hybrid',
        1000,
        expectedFiles
      ) as Record<string, unknown>;

      // Should not modify complete responses
      expect(enhanced.fileScores).toHaveLength(2);
      expect(enhanced.overallMetrics).toEqual(completeResponse.overallMetrics);
      expect(enhanced.scoringStrategy).toBe('hybrid');
    });
  });
});
