import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContextCuratorLLMService } from '../../../services/llm-integration.js';
import type { IntentAnalysisResult, FileDiscoveryResult, RelevanceScoringResult } from '../../../types/llm-tasks.js';

// Mock the LLM helper
vi.mock('../../../../utils/llmHelper.js', () => ({
  performFormatAwareLlmCall: vi.fn(),
  intelligentJsonParse: vi.fn()
}));

// Mock the preprocessing utility
vi.mock('../../../utils/json-preprocessing.js', () => ({
  preprocessRelevanceScoringResponse: vi.fn((response) => response)
}));

// Mock the config loader
vi.mock('../../../services/config-loader.js', () => ({
  ContextCuratorConfigLoader: {
    getInstance: vi.fn(() => ({
      getLLMModel: vi.fn(() => 'deepseek/deepseek-r1-0528-qwen3-8b:free')
    }))
  }
}));

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('ContextCuratorLLMService - Relevance Scoring with Retry and Chunking', () => {
  let llmService: ContextCuratorLLMService;
  let mockPerformResilientLlmCall: any;
  let mockIntelligentJsonParse: any;

  const mockConfig = {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: 'test-key',
    defaultModel: 'deepseek/deepseek-r1-0528-qwen3-8b:free',
    perplexityModel: 'perplexity/sonar-deep-research',
    llm_mapping: {}
  };

  const mockIntentAnalysis: IntentAnalysisResult = {
    taskType: 'feature_addition',
    confidence: 0.9,
    reasoning: ['Test reasoning'],
    architecturalComponents: ['frontend'],
    scopeAssessment: {
      complexity: 'moderate',
      estimatedFiles: 5,
      riskLevel: 'medium'
    },
    suggestedFocusAreas: ['ui'],
    estimatedEffort: 'medium'
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import mocked modules
    const { intelligentJsonParse } = await import('../../../../utils/llmHelper.js');
    mockIntelligentJsonParse = intelligentJsonParse as any;

    llmService = ContextCuratorLLMService.getInstance();

    // Mock the private performResilientLlmCall method
    mockPerformResilientLlmCall = vi.spyOn(llmService as any, 'performResilientLlmCall');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Single File Response Detection and Retry', () => {
    it('should detect single file response and retry with enhanced prompt', async () => {
      const mockFileDiscoveryResult: FileDiscoveryResult = {
        relevantFiles: [
          { path: 'src/file1.ts', priority: 'high', reasoning: 'Test', confidence: 0.9, estimatedTokens: 100, modificationLikelihood: 'high' },
          { path: 'src/file2.ts', priority: 'medium', reasoning: 'Test', confidence: 0.8, estimatedTokens: 200, modificationLikelihood: 'medium' }
        ],
        totalFilesAnalyzed: 10,
        processingTimeMs: 1000,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: { totalTokens: 300, averageConfidence: 0.85 }
      };

      // First call returns single file object (incorrect format)
      const singleFileResponse = JSON.stringify({
        filePath: 'src/file1.ts',
        relevanceScore: 0.95,
        confidence: 0.9,
        reasoning: 'Single file response',
        categories: ['core'],
        modificationLikelihood: 'very_high',
        estimatedTokens: 100
      });

      // Second call (retry) returns correct array format
      const correctResponse = JSON.stringify({
        fileScores: [
          {
            filePath: 'src/file1.ts',
            relevanceScore: 0.95,
            confidence: 0.9,
            reasoning: 'Corrected response',
            categories: ['core'],
            modificationLikelihood: 'very_high',
            estimatedTokens: 100
          },
          {
            filePath: 'src/file2.ts',
            relevanceScore: 0.8,
            confidence: 0.85,
            reasoning: 'Second file',
            categories: ['integration'],
            modificationLikelihood: 'medium',
            estimatedTokens: 200
          }
        ],
        overallMetrics: {
          averageRelevance: 0.875,
          totalFilesScored: 2,
          highRelevanceCount: 1,
          processingTimeMs: 1500
        },
        scoringStrategy: 'semantic_similarity'
      });

      mockPerformResilientLlmCall
        .mockResolvedValueOnce(singleFileResponse)  // First call returns single file
        .mockResolvedValueOnce(correctResponse);    // Retry returns correct format

      mockIntelligentJsonParse
        .mockReturnValueOnce({
          filePath: 'src/file1.ts',
          relevanceScore: 0.95,
          confidence: 0.9,
          reasoning: 'Single file response',
          categories: ['core'],
          modificationLikelihood: 'very_high',
          estimatedTokens: 100
        })
        .mockReturnValueOnce({
          fileScores: [
            {
              filePath: 'src/file1.ts',
              relevanceScore: 0.95,
              confidence: 0.9,
              reasoning: 'Corrected response',
              categories: ['core'],
              modificationLikelihood: 'very_high',
              estimatedTokens: 100
            },
            {
              filePath: 'src/file2.ts',
              relevanceScore: 0.8,
              confidence: 0.85,
              reasoning: 'Second file',
              categories: ['integration'],
              modificationLikelihood: 'medium',
              estimatedTokens: 200
            }
          ],
          overallMetrics: {
            averageRelevance: 0.875,
            totalFilesScored: 2,
            highRelevanceCount: 1,
            processingTimeMs: 1500
          },
          scoringStrategy: 'semantic_similarity'
        });

      const result = await llmService.performRelevanceScoring(
        'Test prompt',
        mockIntentAnalysis,
        'Refined prompt',
        mockFileDiscoveryResult,
        mockConfig,
        'semantic_similarity'
      );

      // Should have called LLM twice (original + retry)
      expect(mockPerformResilientLlmCall).toHaveBeenCalledTimes(2);

      // Second call should include retry instructions
      const secondCallArgs = mockPerformResilientLlmCall.mock.calls[1];
      expect(secondCallArgs[0]).toContain('CRITICAL RETRY INSTRUCTIONS');
      expect(secondCallArgs[0]).toContain('Previous attempt returned incomplete response');
      expect(secondCallArgs[0]).toContain('You MUST score ALL 2 files');

      // Result should have correct format
      expect(result.fileScores).toHaveLength(2);
      expect(result.fileScores[0].filePath).toBe('src/file1.ts');
      expect(result.fileScores[1].filePath).toBe('src/file2.ts');
    });
  });

  describe('Incomplete Response Detection and Retry', () => {
    it('should detect incomplete response (<80% files) and retry', async () => {
      const mockFileDiscoveryResult: FileDiscoveryResult = {
        relevantFiles: [
          { path: 'src/file1.ts', priority: 'high', reasoning: 'Test', confidence: 0.9, estimatedTokens: 100, modificationLikelihood: 'high' },
          { path: 'src/file2.ts', priority: 'medium', reasoning: 'Test', confidence: 0.8, estimatedTokens: 200, modificationLikelihood: 'medium' },
          { path: 'src/file3.ts', priority: 'low', reasoning: 'Test', confidence: 0.7, estimatedTokens: 150, modificationLikelihood: 'low' },
          { path: 'src/file4.ts', priority: 'low', reasoning: 'Test', confidence: 0.6, estimatedTokens: 120, modificationLikelihood: 'low' },
          { path: 'src/file5.ts', priority: 'low', reasoning: 'Test', confidence: 0.5, estimatedTokens: 80, modificationLikelihood: 'low' }
        ],
        totalFilesAnalyzed: 20,
        processingTimeMs: 1500,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: { totalTokens: 650, averageConfidence: 0.7 }
      };

      // First call returns incomplete response (only 1 file out of 5 = 20% < 80%)
      const incompleteResponse = JSON.stringify({
        fileScores: [
          {
            filePath: 'src/file1.ts',
            relevanceScore: 0.95,
            confidence: 0.9,
            reasoning: 'Only scored one file',
            categories: ['core'],
            modificationLikelihood: 'very_high',
            estimatedTokens: 100
          }
        ],
        overallMetrics: {
          averageRelevance: 0.95,
          totalFilesScored: 1,
          highRelevanceCount: 1,
          processingTimeMs: 1000
        },
        scoringStrategy: 'semantic_similarity'
      });

      // Second call (retry) returns complete response
      const completeResponse = JSON.stringify({
        fileScores: [
          { filePath: 'src/file1.ts', relevanceScore: 0.95, confidence: 0.9, reasoning: 'Complete response', categories: ['core'], modificationLikelihood: 'very_high', estimatedTokens: 100 },
          { filePath: 'src/file2.ts', relevanceScore: 0.8, confidence: 0.85, reasoning: 'Second file', categories: ['integration'], modificationLikelihood: 'medium', estimatedTokens: 200 },
          { filePath: 'src/file3.ts', relevanceScore: 0.7, confidence: 0.8, reasoning: 'Third file', categories: ['utility'], modificationLikelihood: 'low', estimatedTokens: 150 },
          { filePath: 'src/file4.ts', relevanceScore: 0.6, confidence: 0.75, reasoning: 'Fourth file', categories: ['utility'], modificationLikelihood: 'low', estimatedTokens: 120 },
          { filePath: 'src/file5.ts', relevanceScore: 0.5, confidence: 0.7, reasoning: 'Fifth file', categories: ['utility'], modificationLikelihood: 'low', estimatedTokens: 80 }
        ],
        overallMetrics: {
          averageRelevance: 0.72,
          totalFilesScored: 5,
          highRelevanceCount: 1,
          processingTimeMs: 1500
        },
        scoringStrategy: 'semantic_similarity'
      });

      mockPerformResilientLlmCall
        .mockResolvedValueOnce(incompleteResponse)  // First call incomplete
        .mockResolvedValueOnce(completeResponse);   // Retry complete

      mockIntelligentJsonParse
        .mockReturnValueOnce({
          fileScores: [
            {
              filePath: 'src/file1.ts',
              relevanceScore: 0.95,
              confidence: 0.9,
              reasoning: 'Only scored one file',
              categories: ['core'],
              modificationLikelihood: 'very_high',
              estimatedTokens: 100
            }
          ],
          overallMetrics: {
            averageRelevance: 0.95,
            totalFilesScored: 1,
            highRelevanceCount: 1,
            processingTimeMs: 1000
          },
          scoringStrategy: 'semantic_similarity'
        })
        .mockReturnValueOnce({
          fileScores: [
            { filePath: 'src/file1.ts', relevanceScore: 0.95, confidence: 0.9, reasoning: 'Complete response', categories: ['core'], modificationLikelihood: 'very_high', estimatedTokens: 100 },
            { filePath: 'src/file2.ts', relevanceScore: 0.8, confidence: 0.85, reasoning: 'Second file', categories: ['integration'], modificationLikelihood: 'medium', estimatedTokens: 200 },
            { filePath: 'src/file3.ts', relevanceScore: 0.7, confidence: 0.8, reasoning: 'Third file', categories: ['utility'], modificationLikelihood: 'low', estimatedTokens: 150 },
            { filePath: 'src/file4.ts', relevanceScore: 0.6, confidence: 0.75, reasoning: 'Fourth file', categories: ['utility'], modificationLikelihood: 'low', estimatedTokens: 120 },
            { filePath: 'src/file5.ts', relevanceScore: 0.5, confidence: 0.7, reasoning: 'Fifth file', categories: ['utility'], modificationLikelihood: 'low', estimatedTokens: 80 }
          ],
          overallMetrics: {
            averageRelevance: 0.72,
            totalFilesScored: 5,
            highRelevanceCount: 1,
            processingTimeMs: 1500
          },
          scoringStrategy: 'semantic_similarity'
        });

      const result = await llmService.performRelevanceScoring(
        'Test prompt',
        mockIntentAnalysis,
        'Refined prompt',
        mockFileDiscoveryResult,
        mockConfig,
        'semantic_similarity'
      );

      // Should have called LLM twice (original + retry)
      expect(mockPerformResilientLlmCall).toHaveBeenCalledTimes(2);
      
      // Result should have all 5 files
      expect(result.fileScores).toHaveLength(5);
      expect(result.overallMetrics.totalFilesScored).toBe(5);
    });
  });

  describe('Chunked Processing for Large File Sets', () => {
    it('should use chunked processing for file sets > 40 files', async () => {
      // Create a large file discovery result with 45 files
      const largeFileDiscoveryResult: FileDiscoveryResult = {
        relevantFiles: Array.from({ length: 45 }, (_, i) => ({
          path: `src/file${i + 1}.ts`,
          priority: 'medium' as const,
          reasoning: `File ${i + 1}`,
          confidence: 0.8,
          estimatedTokens: 100,
          modificationLikelihood: 'medium' as const
        })),
        totalFilesAnalyzed: 100,
        processingTimeMs: 2000,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: { totalTokens: 4500, averageConfidence: 0.8 }
      };

      // Mock responses for 3 chunks (45 files / 20 per chunk = 3 chunks)
      const chunk1Response = JSON.stringify({
        fileScores: Array.from({ length: 20 }, (_, i) => ({
          filePath: `src/file${i + 1}.ts`,
          relevanceScore: 0.7,
          confidence: 0.8,
          reasoning: `Chunk 1 file ${i + 1}`,
          categories: ['utility'],
          modificationLikelihood: 'medium',
          estimatedTokens: 100
        })),
        overallMetrics: { averageRelevance: 0.7, totalFilesScored: 20, highRelevanceCount: 0, processingTimeMs: 500 },
        scoringStrategy: 'semantic_similarity'
      });

      const chunk2Response = JSON.stringify({
        fileScores: Array.from({ length: 20 }, (_, i) => ({
          filePath: `src/file${i + 21}.ts`,
          relevanceScore: 0.6,
          confidence: 0.75,
          reasoning: `Chunk 2 file ${i + 21}`,
          categories: ['utility'],
          modificationLikelihood: 'low',
          estimatedTokens: 100
        })),
        overallMetrics: { averageRelevance: 0.6, totalFilesScored: 20, highRelevanceCount: 0, processingTimeMs: 600 },
        scoringStrategy: 'semantic_similarity'
      });

      const chunk3Response = JSON.stringify({
        fileScores: Array.from({ length: 5 }, (_, i) => ({
          filePath: `src/file${i + 41}.ts`,
          relevanceScore: 0.8,
          confidence: 0.85,
          reasoning: `Chunk 3 file ${i + 41}`,
          categories: ['core'],
          modificationLikelihood: 'high',
          estimatedTokens: 100
        })),
        overallMetrics: { averageRelevance: 0.8, totalFilesScored: 5, highRelevanceCount: 5, processingTimeMs: 400 },
        scoringStrategy: 'semantic_similarity'
      });

      mockPerformResilientLlmCall
        .mockResolvedValueOnce(chunk1Response)
        .mockResolvedValueOnce(chunk2Response)
        .mockResolvedValueOnce(chunk3Response);

      mockIntelligentJsonParse
        .mockReturnValueOnce({
          fileScores: Array.from({ length: 20 }, (_, i) => ({
            filePath: `src/file${i + 1}.ts`,
            relevanceScore: 0.7,
            confidence: 0.8,
            reasoning: `Chunk 1 file ${i + 1}`,
            categories: ['utility'],
            modificationLikelihood: 'medium',
            estimatedTokens: 100
          }))
        })
        .mockReturnValueOnce({
          fileScores: Array.from({ length: 20 }, (_, i) => ({
            filePath: `src/file${i + 21}.ts`,
            relevanceScore: 0.6,
            confidence: 0.75,
            reasoning: `Chunk 2 file ${i + 21}`,
            categories: ['utility'],
            modificationLikelihood: 'low',
            estimatedTokens: 100
          }))
        })
        .mockReturnValueOnce({
          fileScores: Array.from({ length: 5 }, (_, i) => ({
            filePath: `src/file${i + 41}.ts`,
            relevanceScore: 0.8,
            confidence: 0.85,
            reasoning: `Chunk 3 file ${i + 41}`,
            categories: ['core'],
            modificationLikelihood: 'high',
            estimatedTokens: 100
          }))
        });

      const result = await llmService.performRelevanceScoring(
        'Test prompt',
        mockIntentAnalysis,
        'Refined prompt',
        largeFileDiscoveryResult,
        mockConfig,
        'semantic_similarity'
      ) as RelevanceScoringResult & { chunkingUsed?: boolean; totalChunks?: number; chunkSize?: number };

      // Should have called LLM 3 times (one for each chunk)
      expect(mockPerformResilientLlmCall).toHaveBeenCalledTimes(3);

      // Each call should include chunk-specific instructions
      const calls = mockPerformResilientLlmCall.mock.calls;
      expect(calls[0][0]).toContain('CHUNK PROCESSING: This is chunk 1 of 3');
      expect(calls[1][0]).toContain('CHUNK PROCESSING: This is chunk 2 of 3');
      expect(calls[2][0]).toContain('CHUNK PROCESSING: This is chunk 3 of 3');

      // Result should have all 45 files
      expect(result.fileScores).toHaveLength(45);
      expect(result.overallMetrics.totalFilesScored).toBe(45);

      // Should include chunking metadata
      expect(result.chunkingUsed).toBe(true);
      expect(result.totalChunks).toBe(3);
      expect(result.chunkSize).toBe(20);

      // Should have correct high relevance count (20 files from chunk 1 with score 0.7 + 5 files from chunk 3 with score 0.8 >= 0.7)
      expect(result.overallMetrics.highRelevanceCount).toBe(25);
    });

    it('should handle chunk processing errors gracefully', async () => {
      // Create file discovery result with 45 files (will be processed in 3 chunks, with chunk 2 failing)
      const fileDiscoveryResult: FileDiscoveryResult = {
        relevantFiles: Array.from({ length: 45 }, (_, i) => ({
          path: `src/file${i + 1}.ts`,
          priority: 'medium' as const,
          reasoning: `File ${i + 1}`,
          confidence: 0.8,
          estimatedTokens: 100,
          modificationLikelihood: 'medium' as const
        })),
        totalFilesAnalyzed: 90,
        processingTimeMs: 2000,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: { totalTokens: 4500, averageConfidence: 0.8 }
      };

      // First chunk succeeds, second chunk fails, third chunk succeeds
      const chunk1Response = JSON.stringify({
        fileScores: Array.from({ length: 20 }, (_, i) => ({
          filePath: `src/file${i + 1}.ts`,
          relevanceScore: 0.7,
          confidence: 0.8,
          reasoning: `Successful chunk file ${i + 1}`,
          categories: ['utility'],
          modificationLikelihood: 'medium',
          estimatedTokens: 100
        }))
      });

      const chunk3Response = JSON.stringify({
        fileScores: Array.from({ length: 5 }, (_, i) => ({
          filePath: `src/file${i + 41}.ts`,
          relevanceScore: 0.8,
          confidence: 0.85,
          reasoning: `Successful chunk 3 file ${i + 41}`,
          categories: ['core'],
          modificationLikelihood: 'high',
          estimatedTokens: 100
        }))
      });

      mockPerformResilientLlmCall
        .mockResolvedValueOnce(chunk1Response)
        .mockRejectedValueOnce(new Error('Chunk 2 failed'))
        .mockResolvedValueOnce(chunk3Response);

      mockIntelligentJsonParse
        .mockReturnValueOnce({
          fileScores: Array.from({ length: 20 }, (_, i) => ({
            filePath: `src/file${i + 1}.ts`,
            relevanceScore: 0.7,
            confidence: 0.8,
            reasoning: `Successful chunk file ${i + 1}`,
            categories: ['utility'],
            modificationLikelihood: 'medium',
            estimatedTokens: 100
          }))
        })
        .mockReturnValueOnce({
          fileScores: Array.from({ length: 5 }, (_, i) => ({
            filePath: `src/file${i + 41}.ts`,
            relevanceScore: 0.8,
            confidence: 0.85,
            reasoning: `Successful chunk 3 file ${i + 41}`,
            categories: ['core'],
            modificationLikelihood: 'high',
            estimatedTokens: 100
          }))
        });

      const result = await llmService.performRelevanceScoring(
        'Test prompt',
        mockIntentAnalysis,
        'Refined prompt',
        fileDiscoveryResult,
        mockConfig,
        'semantic_similarity'
      ) as RelevanceScoringResult & { chunkingUsed?: boolean; totalChunks?: number };

      // Should have all 45 files (20 from chunk 1 + 20 default from chunk 2 + 5 from chunk 3)
      expect(result.fileScores).toHaveLength(45);

      // Files 1-20 should have LLM scores from chunk 1
      const chunk1Files = result.fileScores.slice(0, 20);
      chunk1Files.forEach((file, i) => {
        expect(file.filePath).toBe(`src/file${i + 1}.ts`);
        expect(file.relevanceScore).toBe(0.7);
        expect(file.reasoning).toBe(`Successful chunk file ${i + 1}`);
      });

      // Files 21-40 should have default scores due to chunk 2 failure
      const chunk2Files = result.fileScores.slice(20, 40);
      chunk2Files.forEach((file, i) => {
        expect(file.filePath).toBe(`src/file${i + 21}.ts`);
        expect(file.relevanceScore).toBe(0.3);
        expect(file.reasoning).toBe('Auto-generated score: Chunk processing failed');
        expect(file.categories).toEqual(['utility']);
        expect(file.modificationLikelihood).toBe('low');
      });

      // Files 41-45 should have LLM scores from chunk 3
      const chunk3Files = result.fileScores.slice(40);
      chunk3Files.forEach((file, i) => {
        expect(file.filePath).toBe(`src/file${i + 41}.ts`);
        expect(file.relevanceScore).toBe(0.8);
        expect(file.reasoning).toBe(`Successful chunk 3 file ${i + 41}`);
      });

      expect(result.chunkingUsed).toBe(true);
      expect(result.totalChunks).toBe(3);
    });

    it('should not use chunked processing for file sets <= 40 files', async () => {
      const smallFileDiscoveryResult: FileDiscoveryResult = {
        relevantFiles: Array.from({ length: 35 }, (_, i) => ({
          path: `src/file${i + 1}.ts`,
          priority: 'medium' as const,
          reasoning: `File ${i + 1}`,
          confidence: 0.8,
          estimatedTokens: 100,
          modificationLikelihood: 'medium' as const
        })),
        totalFilesAnalyzed: 50,
        processingTimeMs: 1500,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: { totalTokens: 3500, averageConfidence: 0.8 }
      };

      const singleResponse = JSON.stringify({
        fileScores: Array.from({ length: 35 }, (_, i) => ({
          filePath: `src/file${i + 1}.ts`,
          relevanceScore: 0.7,
          confidence: 0.8,
          reasoning: `Single call file ${i + 1}`,
          categories: ['utility'],
          modificationLikelihood: 'medium',
          estimatedTokens: 100
        })),
        overallMetrics: { averageRelevance: 0.7, totalFilesScored: 35, highRelevanceCount: 0, processingTimeMs: 1000 },
        scoringStrategy: 'semantic_similarity'
      });

      mockPerformResilientLlmCall.mockResolvedValueOnce(singleResponse);
      mockIntelligentJsonParse.mockReturnValueOnce({
        fileScores: Array.from({ length: 35 }, (_, i) => ({
          filePath: `src/file${i + 1}.ts`,
          relevanceScore: 0.7,
          confidence: 0.8,
          reasoning: `Single call file ${i + 1}`,
          categories: ['utility'],
          modificationLikelihood: 'medium',
          estimatedTokens: 100
        })),
        overallMetrics: { averageRelevance: 0.7, totalFilesScored: 35, highRelevanceCount: 0, processingTimeMs: 1000 },
        scoringStrategy: 'semantic_similarity'
      });

      const result = await llmService.performRelevanceScoring(
        'Test prompt',
        mockIntentAnalysis,
        'Refined prompt',
        smallFileDiscoveryResult,
        mockConfig,
        'semantic_similarity'
      ) as RelevanceScoringResult & { chunkingUsed?: boolean };

      // Should have called LLM only once (no chunking)
      expect(mockPerformResilientLlmCall).toHaveBeenCalledTimes(1);

      // Should not include chunking metadata
      expect(result.chunkingUsed).toBeUndefined();

      // Should have all 35 files
      expect(result.fileScores).toHaveLength(35);
    });
  });
});
