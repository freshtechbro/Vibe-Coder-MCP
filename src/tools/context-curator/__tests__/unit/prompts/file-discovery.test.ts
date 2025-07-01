import { describe, it, expect } from 'vitest';
import {
  FILE_DISCOVERY_SYSTEM_PROMPT,
  buildFileDiscoveryPrompt,
  FILE_DISCOVERY_RESPONSE_SCHEMA,
  FILE_DISCOVERY_EXAMPLES,
  getFileDiscoveryTaskId,
  validateFileDiscoveryResponse,
  calculateCoverageMetrics,
  filterFilesByPriority,
  sortFilesByConfidence,
  getRecommendedSearchStrategy
} from '../../../prompts/file-discovery.js';
import { ContextCuratorLLMTask } from '../../../types/llm-tasks.js';
import type { IntentAnalysisResult } from '../../../types/llm-tasks.js';

describe('File Discovery Templates', () => {
  describe('FILE_DISCOVERY_SYSTEM_PROMPT', () => {
    it('should contain comprehensive system instructions', () => {
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('software architect');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('codebase analyst');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('intelligent file discovery');
    });

    it('should define all discovery strategies', () => {
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('Semantic Similarity');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('Keyword Matching');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('Semantic and Keyword Combined');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('Structural Analysis');
    });

    it('should include prioritization criteria', () => {
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('High Priority');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('Medium Priority');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('Low Priority');
    });

    it('should define confidence assessment guidelines', () => {
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('Rate confidence');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('0.0 to 1.0');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('Strength of relationship');
    });

    it('should define modification likelihood levels', () => {
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('very_high');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('high');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('medium');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('low');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('very_low');
    });

    it('should specify JSON response format', () => {
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('JSON object');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('relevantFiles');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('totalFilesAnalyzed');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('processingTimeMs');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('searchStrategy');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('coverageMetrics');
    });

    it('should include discovery guidelines', () => {
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('Be Comprehensive');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('Prioritize Effectively');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('Provide Clear Reasoning');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('Estimate Accurately');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('Consider Dependencies');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('Balance Breadth and Focus');
    });
  });

  describe('buildFileDiscoveryPrompt', () => {
    const originalPrompt = 'Add user authentication to the application';
    const codemapContent = 'React application with Express.js backend, using MongoDB for data storage';
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

    it('should build basic prompt with required sections', () => {
      const prompt = buildFileDiscoveryPrompt(originalPrompt, intentAnalysis, codemapContent, 'semantic_similarity');

      expect(prompt).toContain('DEVELOPMENT REQUEST:');
      expect(prompt).toContain(originalPrompt);
      expect(prompt).toContain('INTENT ANALYSIS:');
      expect(prompt).toContain('Task Type: feature_addition');
      expect(prompt).toContain('Confidence: 0.9');
      expect(prompt).toContain('Complexity: moderate');
      expect(prompt).toContain('Risk Level: medium');
      expect(prompt).toContain('Estimated Files: 8');
      expect(prompt).toContain('Estimated Effort: medium');
      expect(prompt).toContain('CODEBASE CONTEXT:');
      expect(prompt).toContain(codemapContent);
      expect(prompt).toContain('SEARCH STRATEGY: semantic_similarity');
    });

    it('should include intent analysis details', () => {
      const prompt = buildFileDiscoveryPrompt(originalPrompt, intentAnalysis, codemapContent, 'keyword_matching');
      
      expect(prompt).toContain('Reasoning: Clear feature request for authentication');
      expect(prompt).toContain('Architectural Components: frontend, backend, authentication');
      expect(prompt).toContain('Suggested Focus Areas: security-patterns, user-management');
    });

    it('should support all search strategies', () => {
      const strategies = ['semantic_similarity', 'keyword_matching', 'semantic_and_keyword', 'structural_analysis'] as const;
      
      strategies.forEach(strategy => {
        const prompt = buildFileDiscoveryPrompt(originalPrompt, intentAnalysis, codemapContent, strategy);
        expect(prompt).toContain(`SEARCH STRATEGY: ${strategy}`);
        expect(prompt).toContain(`Using the ${strategy} strategy`);
      });
    });

    it('should include additional context when provided', () => {
      const additionalContext = {
        filePatterns: ['*.ts', '*.tsx'],
        excludePatterns: ['*.test.ts', '*.spec.ts'],
        focusDirectories: ['src/auth', 'src/components'],
        maxFiles: 10,
        tokenBudget: 5000
      };
      
      const prompt = buildFileDiscoveryPrompt(originalPrompt, intentAnalysis, codemapContent, 'semantic_similarity', additionalContext);
      
      expect(prompt).toContain('ADDITIONAL CONSTRAINTS:');
      expect(prompt).toContain('File Patterns: *.ts, *.tsx');
      expect(prompt).toContain('Exclude Patterns: *.test.ts, *.spec.ts');
      expect(prompt).toContain('Focus Directories: src/auth, src/components');
      expect(prompt).toContain('Maximum Files: 10');
      expect(prompt).toContain('Token Budget: 5000');
    });

    it('should handle partial additional context', () => {
      const additionalContext = {
        filePatterns: ['*.ts'],
        maxFiles: 5
      };
      
      const prompt = buildFileDiscoveryPrompt(originalPrompt, intentAnalysis, codemapContent, 'keyword_matching', additionalContext);
      
      expect(prompt).toContain('File Patterns: *.ts');
      expect(prompt).toContain('Maximum Files: 5');
      expect(prompt).not.toContain('Exclude Patterns:');
      expect(prompt).not.toContain('Focus Directories:');
      expect(prompt).not.toContain('Token Budget:');
    });

    it('should handle empty additional context', () => {
      const prompt = buildFileDiscoveryPrompt(originalPrompt, intentAnalysis, codemapContent, 'structural_analysis', {});
      
      expect(prompt).not.toContain('ADDITIONAL CONSTRAINTS:');
      expect(prompt).toContain('DEVELOPMENT REQUEST:');
      expect(prompt).toContain('INTENT ANALYSIS:');
      expect(prompt).toContain('CODEBASE CONTEXT:');
    });

    it('should handle empty arrays in additional context', () => {
      const additionalContext = {
        filePatterns: [],
        excludePatterns: ['*.test.ts'],
        focusDirectories: []
      };
      
      const prompt = buildFileDiscoveryPrompt(originalPrompt, intentAnalysis, codemapContent, 'semantic_and_keyword', additionalContext);
      
      expect(prompt).toContain('Exclude Patterns: *.test.ts');
      expect(prompt).not.toContain('File Patterns:');
      expect(prompt).not.toContain('Focus Directories:');
    });
  });

  describe('FILE_DISCOVERY_RESPONSE_SCHEMA', () => {
    it('should define correct schema structure', () => {
      expect(FILE_DISCOVERY_RESPONSE_SCHEMA.type).toBe('object');
      expect(FILE_DISCOVERY_RESPONSE_SCHEMA.properties).toBeDefined();
      expect(FILE_DISCOVERY_RESPONSE_SCHEMA.required).toEqual([
        'relevantFiles',
        'totalFilesAnalyzed',
        'processingTimeMs',
        'searchStrategy',
        'coverageMetrics'
      ]);
      expect(FILE_DISCOVERY_RESPONSE_SCHEMA.additionalProperties).toBe(false);
    });

    it('should define relevantFiles as array of objects', () => {
      const relevantFilesProperty = FILE_DISCOVERY_RESPONSE_SCHEMA.properties.relevantFiles;
      expect(relevantFilesProperty.type).toBe('array');
      expect(relevantFilesProperty.items.type).toBe('object');
      expect(relevantFilesProperty.items.required).toEqual([
        'path', 'priority', 'reasoning', 'confidence', 'estimatedTokens', 'modificationLikelihood'
      ]);
    });

    it('should define file object properties correctly', () => {
      const fileSchema = FILE_DISCOVERY_RESPONSE_SCHEMA.properties.relevantFiles.items;

      expect(fileSchema.properties.path.type).toBe('string');
      expect(fileSchema.properties.path.minLength).toBe(1);

      expect(fileSchema.properties.priority.enum).toEqual(['high', 'medium', 'low']);

      expect(fileSchema.properties.reasoning.type).toBe('string');
      expect(fileSchema.properties.reasoning.minLength).toBe(1);

      expect(fileSchema.properties.confidence.type).toBe('number');
      expect(fileSchema.properties.confidence.minimum).toBe(0);
      expect(fileSchema.properties.confidence.maximum).toBe(1);

      expect(fileSchema.properties.estimatedTokens.type).toBe('number');
      expect(fileSchema.properties.estimatedTokens.minimum).toBe(0);

      expect(fileSchema.properties.modificationLikelihood.enum).toEqual([
        'very_high', 'high', 'medium', 'low', 'very_low'
      ]);
    });

    it('should define numeric properties correctly', () => {
      const totalFilesProperty = FILE_DISCOVERY_RESPONSE_SCHEMA.properties.totalFilesAnalyzed;
      const processingTimeProperty = FILE_DISCOVERY_RESPONSE_SCHEMA.properties.processingTimeMs;

      expect(totalFilesProperty.type).toBe('number');
      expect(totalFilesProperty.minimum).toBe(0);
      expect(processingTimeProperty.type).toBe('number');
      expect(processingTimeProperty.minimum).toBe(0);
    });

    it('should define searchStrategy enum correctly', () => {
      const searchStrategyProperty = FILE_DISCOVERY_RESPONSE_SCHEMA.properties.searchStrategy;
      expect(searchStrategyProperty.type).toBe('string');
      expect(searchStrategyProperty.enum).toEqual([
        'semantic_similarity', 'keyword_matching', 'semantic_and_keyword', 'structural_analysis', 'multi_strategy'
      ]);
    });

    it('should define coverageMetrics object correctly', () => {
      const coverageMetricsProperty = FILE_DISCOVERY_RESPONSE_SCHEMA.properties.coverageMetrics;
      expect(coverageMetricsProperty.type).toBe('object');
      expect(coverageMetricsProperty.required).toEqual(['totalTokens', 'averageConfidence']);
      expect(coverageMetricsProperty.additionalProperties).toBe(false);

      expect(coverageMetricsProperty.properties.totalTokens.type).toBe('number');
      expect(coverageMetricsProperty.properties.totalTokens.minimum).toBe(0);

      expect(coverageMetricsProperty.properties.averageConfidence.type).toBe('number');
      expect(coverageMetricsProperty.properties.averageConfidence.minimum).toBe(0);
      expect(coverageMetricsProperty.properties.averageConfidence.maximum).toBe(1);
    });
  });

  describe('FILE_DISCOVERY_EXAMPLES', () => {
    it('should contain examples for all search strategies', () => {
      expect(FILE_DISCOVERY_EXAMPLES.semantic_similarity_refactoring).toBeDefined();
      expect(FILE_DISCOVERY_EXAMPLES.keyword_matching_feature).toBeDefined();
      expect(FILE_DISCOVERY_EXAMPLES.semantic_and_keyword_bugfix).toBeDefined();
      expect(FILE_DISCOVERY_EXAMPLES.structural_analysis_general).toBeDefined();
    });

    it('should have valid semantic similarity example', () => {
      const example = FILE_DISCOVERY_EXAMPLES.semantic_similarity_refactoring;

      expect(example.originalPrompt).toContain('Refactor');
      expect(example.searchStrategy).toBe('semantic_similarity');
      expect(example.intentAnalysis.taskType).toBe('refactoring');
      expect(example.intentAnalysis.confidence).toBeGreaterThan(0.8);
      expect(example.expectedResponse.searchStrategy).toBe('semantic_similarity');
      expect(example.expectedResponse.relevantFiles).toHaveLength(3);
      expect(example.expectedResponse.relevantFiles[0].priority).toBe('high');
      expect(example.expectedResponse.relevantFiles[0].confidence).toBeGreaterThan(0.9);
      expect(example.expectedResponse.coverageMetrics.averageConfidence).toBeGreaterThan(0.8);
    });

    it('should have valid keyword matching example', () => {
      const example = FILE_DISCOVERY_EXAMPLES.keyword_matching_feature;

      expect(example.originalPrompt).toContain('dashboard');
      expect(example.searchStrategy).toBe('keyword_matching');
      expect(example.intentAnalysis.taskType).toBe('feature_addition');
      expect(example.intentAnalysis.confidence).toBeGreaterThan(0.9);
      expect(example.expectedResponse.searchStrategy).toBe('keyword_matching');
      expect(example.expectedResponse.relevantFiles).toHaveLength(3);
      expect(example.expectedResponse.relevantFiles[0].path).toContain('Dashboard');
      expect(example.expectedResponse.coverageMetrics.totalTokens).toBeGreaterThan(2000);
    });

    it('should have valid semantic and keyword example', () => {
      const example = FILE_DISCOVERY_EXAMPLES.semantic_and_keyword_bugfix;

      expect(example.originalPrompt).toContain('memory leak');
      expect(example.searchStrategy).toBe('semantic_and_keyword');
      expect(example.intentAnalysis.taskType).toBe('bug_fix');
      expect(example.intentAnalysis.confidence).toBeGreaterThan(0.9);
      expect(example.expectedResponse.searchStrategy).toBe('semantic_and_keyword');
      expect(example.expectedResponse.relevantFiles).toHaveLength(3);
      expect(example.expectedResponse.relevantFiles[0].modificationLikelihood).toBe('very_high');
      expect(example.expectedResponse.totalFilesAnalyzed).toBeLessThan(100);
    });

    it('should have valid structural analysis example', () => {
      const example = FILE_DISCOVERY_EXAMPLES.structural_analysis_general;

      expect(example.originalPrompt).toContain('documentation');
      expect(example.searchStrategy).toBe('structural_analysis');
      expect(example.intentAnalysis.taskType).toBe('general');
      expect(example.expectedResponse.searchStrategy).toBe('structural_analysis');
      expect(example.expectedResponse.relevantFiles).toHaveLength(3);
      expect(example.expectedResponse.relevantFiles[0].path).toContain('openapi');
      expect(example.expectedResponse.coverageMetrics.averageConfidence).toBeGreaterThan(0.8);
    });

    it('should have consistent response structure across examples', () => {
      Object.values(FILE_DISCOVERY_EXAMPLES).forEach(example => {
        const response = example.expectedResponse;

        expect(response.relevantFiles).toBeInstanceOf(Array);
        expect(response.relevantFiles.length).toBeGreaterThan(0);

        response.relevantFiles.forEach(file => {
          expect(file.path).toBeDefined();
          expect(typeof file.path).toBe('string');
          expect(file.path.length).toBeGreaterThan(0);

          expect(['high', 'medium', 'low']).toContain(file.priority);
          expect(file.reasoning).toBeDefined();
          expect(typeof file.reasoning).toBe('string');
          expect(file.reasoning.length).toBeGreaterThan(0);

          expect(file.confidence).toBeGreaterThanOrEqual(0);
          expect(file.confidence).toBeLessThanOrEqual(1);

          expect(file.estimatedTokens).toBeGreaterThanOrEqual(0);
          expect(['very_high', 'high', 'medium', 'low', 'very_low']).toContain(file.modificationLikelihood);
        });

        expect(response.totalFilesAnalyzed).toBeGreaterThanOrEqual(0);
        expect(response.processingTimeMs).toBeGreaterThanOrEqual(0);
        expect(['semantic_similarity', 'keyword_matching', 'semantic_and_keyword', 'structural_analysis']).toContain(response.searchStrategy);

        expect(response.coverageMetrics.totalTokens).toBeGreaterThanOrEqual(0);
        expect(response.coverageMetrics.averageConfidence).toBeGreaterThanOrEqual(0);
        expect(response.coverageMetrics.averageConfidence).toBeLessThanOrEqual(1);
      });
    });

    it('should show realistic file discovery metrics', () => {
      Object.values(FILE_DISCOVERY_EXAMPLES).forEach(example => {
        const response = example.expectedResponse;

        // Should have reasonable number of files
        expect(response.relevantFiles.length).toBeGreaterThanOrEqual(2);
        expect(response.relevantFiles.length).toBeLessThanOrEqual(10);

        // Should have at least one high priority file
        const highPriorityFiles = response.relevantFiles.filter(f => f.priority === 'high');
        expect(highPriorityFiles.length).toBeGreaterThanOrEqual(1);

        // Processing time should be reasonable
        expect(response.processingTimeMs).toBeGreaterThan(1000);
        expect(response.processingTimeMs).toBeLessThan(5000);

        // Total files analyzed should be reasonable
        expect(response.totalFilesAnalyzed).toBeGreaterThan(response.relevantFiles.length);
        expect(response.totalFilesAnalyzed).toBeLessThan(500);
      });
    });
  });

  describe('getFileDiscoveryTaskId', () => {
    it('should return correct LLM task identifier without strategy', () => {
      const taskId = getFileDiscoveryTaskId();
      expect(taskId).toBe(ContextCuratorLLMTask.FILE_DISCOVERY);
      expect(taskId).toBe('context_curator_file_discovery');
    });

    it('should return strategy-specific task identifier with strategy', () => {
      const taskId = getFileDiscoveryTaskId('semantic_similarity');
      expect(taskId).toBe('context_curator_file_discovery_semantic_similarity');
    });

    it('should return strategy-specific task identifier for all strategies', () => {
      const strategies = ['semantic_similarity', 'keyword_matching', 'semantic_and_keyword', 'structural_analysis'];

      strategies.forEach(strategy => {
        const taskId = getFileDiscoveryTaskId(strategy);
        expect(taskId).toBe(`context_curator_file_discovery_${strategy}`);
      });
    });
  });

  describe('validateFileDiscoveryResponse', () => {
    it('should validate correct response structure', () => {
      const validResponse = {
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
        totalFilesAnalyzed: 150,
        processingTimeMs: 2500,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: {
          totalTokens: 500,
          averageConfidence: 0.95
        }
      };

      expect(validateFileDiscoveryResponse(validResponse)).toBe(true);
    });

    it('should reject invalid priority values', () => {
      const invalidResponse = {
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
        searchStrategy: 'semantic_similarity',
        coverageMetrics: { totalTokens: 100, averageConfidence: 0.8 }
      };

      expect(validateFileDiscoveryResponse(invalidResponse)).toBe(false);
    });

    it('should reject invalid modification likelihood values', () => {
      const invalidResponse = {
        relevantFiles: [
          {
            path: 'src/test.ts',
            priority: 'high',
            reasoning: 'test',
            confidence: 0.8,
            estimatedTokens: 100,
            modificationLikelihood: 'invalid' // Invalid modification likelihood
          }
        ],
        totalFilesAnalyzed: 10,
        processingTimeMs: 1000,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: { totalTokens: 100, averageConfidence: 0.8 }
      };

      expect(validateFileDiscoveryResponse(invalidResponse)).toBe(false);
    });

    it('should reject invalid search strategy', () => {
      const invalidResponse = {
        relevantFiles: [],
        totalFilesAnalyzed: 10,
        processingTimeMs: 1000,
        searchStrategy: 'invalid_strategy', // Invalid search strategy
        coverageMetrics: { totalTokens: 0, averageConfidence: 0 }
      };

      expect(validateFileDiscoveryResponse(invalidResponse)).toBe(false);
    });

    it('should reject missing required fields', () => {
      const incompleteResponse = {
        relevantFiles: [],
        totalFilesAnalyzed: 10
        // Missing other required fields
      };

      expect(validateFileDiscoveryResponse(incompleteResponse)).toBe(false);
    });

    it('should reject invalid confidence range', () => {
      const invalidResponse = {
        relevantFiles: [
          {
            path: 'src/test.ts',
            priority: 'high',
            reasoning: 'test',
            confidence: 1.5, // Invalid: > 1
            estimatedTokens: 100,
            modificationLikelihood: 'medium'
          }
        ],
        totalFilesAnalyzed: 10,
        processingTimeMs: 1000,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: { totalTokens: 100, averageConfidence: 0.8 }
      };

      expect(validateFileDiscoveryResponse(invalidResponse)).toBe(false);
    });

    it('should reject negative estimated tokens', () => {
      const invalidResponse = {
        relevantFiles: [
          {
            path: 'src/test.ts',
            priority: 'high',
            reasoning: 'test',
            confidence: 0.8,
            estimatedTokens: -100, // Invalid: negative
            modificationLikelihood: 'medium'
          }
        ],
        totalFilesAnalyzed: 10,
        processingTimeMs: 1000,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: { totalTokens: 100, averageConfidence: 0.8 }
      };

      expect(validateFileDiscoveryResponse(invalidResponse)).toBe(false);
    });

    it('should reject empty file path', () => {
      const invalidResponse = {
        relevantFiles: [
          {
            path: '', // Invalid: empty string
            priority: 'high',
            reasoning: 'test',
            confidence: 0.8,
            estimatedTokens: 100,
            modificationLikelihood: 'medium'
          }
        ],
        totalFilesAnalyzed: 10,
        processingTimeMs: 1000,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: { totalTokens: 100, averageConfidence: 0.8 }
      };

      expect(validateFileDiscoveryResponse(invalidResponse)).toBe(false);
    });

    it('should reject invalid coverage metrics', () => {
      const invalidResponse = {
        relevantFiles: [],
        totalFilesAnalyzed: 10,
        processingTimeMs: 1000,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: {
          totalTokens: -100, // Invalid: negative
          averageConfidence: 0.8
        }
      };

      expect(validateFileDiscoveryResponse(invalidResponse)).toBe(false);
    });
  });

  describe('calculateCoverageMetrics', () => {
    it('should calculate correct metrics for multiple files', () => {
      const relevantFiles = [
        { estimatedTokens: 500, confidence: 0.9 },
        { estimatedTokens: 300, confidence: 0.8 },
        { estimatedTokens: 200, confidence: 0.7 }
      ];

      const metrics = calculateCoverageMetrics(relevantFiles);

      expect(metrics.totalTokens).toBe(1000);
      expect(metrics.averageConfidence).toBe(0.8); // (0.9 + 0.8 + 0.7) / 3 = 0.8
    });

    it('should handle empty files array', () => {
      const metrics = calculateCoverageMetrics([]);

      expect(metrics.totalTokens).toBe(0);
      expect(metrics.averageConfidence).toBe(0);
    });

    it('should handle single file', () => {
      const relevantFiles = [
        { estimatedTokens: 750, confidence: 0.95 }
      ];

      const metrics = calculateCoverageMetrics(relevantFiles);

      expect(metrics.totalTokens).toBe(750);
      expect(metrics.averageConfidence).toBe(0.95);
    });

    it('should round average confidence to 2 decimal places', () => {
      const relevantFiles = [
        { estimatedTokens: 100, confidence: 0.333 },
        { estimatedTokens: 200, confidence: 0.666 },
        { estimatedTokens: 300, confidence: 0.999 }
      ];

      const metrics = calculateCoverageMetrics(relevantFiles);

      expect(metrics.totalTokens).toBe(600);
      // (0.333 + 0.666 + 0.999) / 3 = 0.666, rounded to 0.67
      expect(metrics.averageConfidence).toBe(0.67);
    });
  });

  describe('filterFilesByPriority', () => {
    const testFiles = [
      { priority: 'high' as const, path: 'file1.ts' },
      { priority: 'medium' as const, path: 'file2.ts' },
      { priority: 'high' as const, path: 'file3.ts' },
      { priority: 'low' as const, path: 'file4.ts' },
      { priority: 'medium' as const, path: 'file5.ts' }
    ];

    it('should filter high priority files', () => {
      const highPriorityFiles = filterFilesByPriority(testFiles, 'high');

      expect(highPriorityFiles).toHaveLength(2);
      expect(highPriorityFiles[0].path).toBe('file1.ts');
      expect(highPriorityFiles[1].path).toBe('file3.ts');
    });

    it('should filter medium priority files', () => {
      const mediumPriorityFiles = filterFilesByPriority(testFiles, 'medium');

      expect(mediumPriorityFiles).toHaveLength(2);
      expect(mediumPriorityFiles[0].path).toBe('file2.ts');
      expect(mediumPriorityFiles[1].path).toBe('file5.ts');
    });

    it('should filter low priority files', () => {
      const lowPriorityFiles = filterFilesByPriority(testFiles, 'low');

      expect(lowPriorityFiles).toHaveLength(1);
      expect(lowPriorityFiles[0].path).toBe('file4.ts');
    });

    it('should return empty array when no files match priority', () => {
      const emptyFiles = filterFilesByPriority([], 'high');
      expect(emptyFiles).toHaveLength(0);
    });
  });

  describe('sortFilesByConfidence', () => {
    it('should sort files by confidence in descending order', () => {
      const files = [
        { confidence: 0.7, path: 'file1.ts' },
        { confidence: 0.9, path: 'file2.ts' },
        { confidence: 0.8, path: 'file3.ts' },
        { confidence: 0.95, path: 'file4.ts' }
      ];

      const sortedFiles = sortFilesByConfidence(files);

      expect(sortedFiles).toHaveLength(4);
      expect(sortedFiles[0].confidence).toBe(0.95);
      expect(sortedFiles[0].path).toBe('file4.ts');
      expect(sortedFiles[1].confidence).toBe(0.9);
      expect(sortedFiles[1].path).toBe('file2.ts');
      expect(sortedFiles[2].confidence).toBe(0.8);
      expect(sortedFiles[2].path).toBe('file3.ts');
      expect(sortedFiles[3].confidence).toBe(0.7);
      expect(sortedFiles[3].path).toBe('file1.ts');
    });

    it('should not modify original array', () => {
      const files = [
        { confidence: 0.7, path: 'file1.ts' },
        { confidence: 0.9, path: 'file2.ts' }
      ];

      const originalOrder = [...files];
      const sortedFiles = sortFilesByConfidence(files);

      expect(files).toEqual(originalOrder);
      expect(sortedFiles).not.toBe(files);
    });

    it('should handle empty array', () => {
      const sortedFiles = sortFilesByConfidence([]);
      expect(sortedFiles).toHaveLength(0);
    });

    it('should handle single file', () => {
      const files = [{ confidence: 0.8, path: 'file1.ts' }];
      const sortedFiles = sortFilesByConfidence(files);

      expect(sortedFiles).toHaveLength(1);
      expect(sortedFiles[0].confidence).toBe(0.8);
    });
  });

  describe('getRecommendedSearchStrategy', () => {
    it('should recommend semantic_similarity for refactoring', () => {
      const strategy = getRecommendedSearchStrategy('refactoring');
      expect(strategy).toBe('semantic_similarity');
    });

    it('should recommend semantic_and_keyword for feature_addition', () => {
      const strategy = getRecommendedSearchStrategy('feature_addition');
      expect(strategy).toBe('semantic_and_keyword');
    });

    it('should recommend keyword_matching for bug_fix', () => {
      const strategy = getRecommendedSearchStrategy('bug_fix');
      expect(strategy).toBe('keyword_matching');
    });

    it('should recommend structural_analysis for general', () => {
      const strategy = getRecommendedSearchStrategy('general');
      expect(strategy).toBe('structural_analysis');
    });

    it('should recommend semantic_and_keyword for unknown task types', () => {
      const strategy = getRecommendedSearchStrategy('unknown_task');
      expect(strategy).toBe('semantic_and_keyword');
    });

    it('should handle empty string', () => {
      const strategy = getRecommendedSearchStrategy('');
      expect(strategy).toBe('semantic_and_keyword');
    });
  });
});
