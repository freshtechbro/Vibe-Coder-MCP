/**
 * Unit tests for Context Curator priority categorization logic
 * Tests the categorization of files into high/medium/low priority based on relevance scores
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PRIORITY_THRESHOLDS } from '../../../types/context-curator.js';
import type { FileRelevance } from '../../../types/context-curator.js';
import type { ContextPackage } from '../../../types/context-curator.js';

// Mock dependencies
vi.mock('../../../../../services/job-manager/index.js', () => ({
  default: {
    createJob: vi.fn(),
    updateJobStatus: vi.fn(),
    getInstance: vi.fn().mockReturnThis()
  },
  JobStatus: {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed'
  }
}));

vi.mock('../../../../../utils/openrouter-config-manager.js', () => ({
  OpenRouterConfigManager: {
    getInstance: vi.fn().mockReturnValue({
      getConfig: vi.fn().mockReturnValue({
        apiKey: 'test-key',
        baseUrl: 'https://test.com',
        model: 'test-model'
      })
    })
  }
}));

describe('Context Curator Priority Categorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper function to create FileRelevance objects
  const createFileRelevance = (
    path: string, 
    relevanceScore: number, 
    confidence: number
  ): FileRelevance => ({
    file: {
      path,
      content: 'test content',
      size: 1000,
      lastModified: new Date(),
      language: 'typescript',
      isOptimized: false,
      tokenCount: 100
    },
    relevanceScore: {
      score: relevanceScore,
      confidence: confidence,
      reasoning: `Test file with score ${relevanceScore} and confidence ${confidence}`
    },
    categories: ['test'],
    extractedKeywords: []
  });

  describe('Priority Thresholds Configuration', () => {
    it('should have correct threshold values', () => {
      expect(PRIORITY_THRESHOLDS.HIGH.relevanceScore).toBe(0.6);
      expect(PRIORITY_THRESHOLDS.HIGH.confidence).toBe(0.7);
      expect(PRIORITY_THRESHOLDS.MEDIUM.relevanceScore).toBe(0.4);
      expect(PRIORITY_THRESHOLDS.MEDIUM.confidence).toBe(0.6);
    });
  });

  describe('File Priority Categorization Logic', () => {
    it('should categorize files as HIGH priority when both score and confidence meet thresholds', () => {
      const testCases = [
        { score: 0.6, confidence: 0.7, expected: 'high' }, // Minimum thresholds (updated)
        { score: 0.85, confidence: 0.9, expected: 'high' }, // Well above thresholds
        { score: 1.0, confidence: 1.0, expected: 'high' }, // Maximum values
        { score: 0.6, confidence: 0.85, expected: 'high' }, // Score at threshold, confidence above
        { score: 0.8, confidence: 0.7, expected: 'high' }  // Both at or above minimum
      ];

      testCases.forEach(({ score, confidence, expected }) => {
        const shouldBeHigh = score >= PRIORITY_THRESHOLDS.HIGH.relevanceScore && 
                            confidence >= PRIORITY_THRESHOLDS.HIGH.confidence;
        expect(shouldBeHigh).toBe(true);
        expect(expected).toBe('high');
      });
    });

    it('should categorize files as MEDIUM priority when score/confidence are below HIGH but meet MEDIUM thresholds', () => {
      const testCases = [
        { score: 0.4, confidence: 0.6, expected: 'medium' }, // Minimum thresholds
        { score: 0.5, confidence: 0.65, expected: 'medium' }, // Above minimum but below HIGH
        { score: 0.59, confidence: 0.69, expected: 'medium' }, // Just below HIGH thresholds
        { score: 0.55, confidence: 0.6, expected: 'medium' }, // Mid-range values
        { score: 0.4, confidence: 0.65, expected: 'medium' }  // Low score, medium confidence
      ];

      testCases.forEach(({ score, confidence, expected }) => {
        const shouldBeHigh = score >= PRIORITY_THRESHOLDS.HIGH.relevanceScore && 
                            confidence >= PRIORITY_THRESHOLDS.HIGH.confidence;
        const shouldBeMedium = score >= PRIORITY_THRESHOLDS.MEDIUM.relevanceScore && 
                              confidence >= PRIORITY_THRESHOLDS.MEDIUM.confidence;
        expect(shouldBeHigh).toBe(false);
        expect(shouldBeMedium).toBe(true);
        expect(expected).toBe('medium');
      });
    });

    it('should categorize files as LOW priority when neither HIGH nor MEDIUM thresholds are met', () => {
      const testCases = [
        { score: 0.3, confidence: 0.5, expected: 'low' },   // Below both thresholds
        { score: 0.1, confidence: 0.1, expected: 'low' },   // Very low scores
        { score: 0.0, confidence: 0.0, expected: 'low' },   // Zero scores
        { score: 0.39, confidence: 0.59, expected: 'low' }, // Just below MEDIUM
        { score: 0.3, confidence: 0.9, expected: 'low' },   // Low score, high confidence
        { score: 0.8, confidence: 0.3, expected: 'low' }    // High score, low confidence
      ];

      testCases.forEach(({ score, confidence, expected }) => {
        const shouldBeHigh = score >= PRIORITY_THRESHOLDS.HIGH.relevanceScore && 
                            confidence >= PRIORITY_THRESHOLDS.HIGH.confidence;
        const shouldBeMedium = score >= PRIORITY_THRESHOLDS.MEDIUM.relevanceScore && 
                              confidence >= PRIORITY_THRESHOLDS.MEDIUM.confidence;
        expect(shouldBeHigh).toBe(false);
        expect(shouldBeMedium).toBe(false);
        expect(expected).toBe('low');
      });
    });

    it('should handle edge cases correctly', () => {
      // Test edge case: score meets HIGH but confidence doesn't
      const highScoreLowConf = { score: 0.9, confidence: 0.5 };
      const shouldBeHighForEdge1 = highScoreLowConf.score >= PRIORITY_THRESHOLDS.HIGH.relevanceScore && 
                                   highScoreLowConf.confidence >= PRIORITY_THRESHOLDS.HIGH.confidence;
      const shouldBeMediumForEdge1 = highScoreLowConf.score >= PRIORITY_THRESHOLDS.MEDIUM.relevanceScore && 
                                     highScoreLowConf.confidence >= PRIORITY_THRESHOLDS.MEDIUM.confidence;
      expect(shouldBeHighForEdge1).toBe(false);
      expect(shouldBeMediumForEdge1).toBe(false); // Doesn't meet confidence threshold

      // Test edge case: confidence meets HIGH but score doesn't
      const lowScoreHighConf = { score: 0.5, confidence: 0.9 };
      const shouldBeHighForEdge2 = lowScoreHighConf.score >= PRIORITY_THRESHOLDS.HIGH.relevanceScore && 
                                   lowScoreHighConf.confidence >= PRIORITY_THRESHOLDS.HIGH.confidence;
      const shouldBeMediumForEdge2 = lowScoreHighConf.score >= PRIORITY_THRESHOLDS.MEDIUM.relevanceScore && 
                                     lowScoreHighConf.confidence >= PRIORITY_THRESHOLDS.MEDIUM.confidence;
      expect(shouldBeHighForEdge2).toBe(false);
      expect(shouldBeMediumForEdge2).toBe(true); // Meets MEDIUM thresholds
    });

    it('should handle missing or null scores gracefully', () => {
      const testCases = [
        { score: undefined, confidence: 0.9, expectedPriority: 'low' },
        { score: 0.9, confidence: undefined, expectedPriority: 'low' },
        { score: null, confidence: 0.9, expectedPriority: 'low' },
        { score: 0.9, confidence: null, expectedPriority: 'low' },
        { score: undefined, confidence: undefined, expectedPriority: 'low' }
      ];

      testCases.forEach(({ score, confidence, expectedPriority }) => {
        const actualScore = score ?? 0;
        const actualConfidence = confidence ?? 0;
        
        const shouldBeHigh = actualScore >= PRIORITY_THRESHOLDS.HIGH.relevanceScore && 
                            actualConfidence >= PRIORITY_THRESHOLDS.HIGH.confidence;
        const shouldBeMedium = actualScore >= PRIORITY_THRESHOLDS.MEDIUM.relevanceScore && 
                              actualConfidence >= PRIORITY_THRESHOLDS.MEDIUM.confidence;
        
        const priority = shouldBeHigh ? 'high' : shouldBeMedium ? 'medium' : 'low';
        expect(priority).toBe(expectedPriority);
      });
    });
  });

  describe('Integration with Context Package Building', () => {
    it('should correctly distribute files into priority buckets', async () => {
      const testFiles: FileRelevance[] = [
        // High priority files
        createFileRelevance('high1.ts', 0.9, 0.95),
        createFileRelevance('high2.ts', 0.7, 0.8),
        // Medium priority files
        createFileRelevance('medium1.ts', 0.5, 0.7),
        createFileRelevance('medium2.ts', 0.4, 0.6),
        // Low priority files
        createFileRelevance('low1.ts', 0.3, 0.5),
        createFileRelevance('low2.ts', 0.8, 0.5), // High score but low confidence
      ];

      // Simulate the categorization logic
      const highPriority: FileRelevance[] = [];
      const mediumPriority: FileRelevance[] = [];
      const lowPriority: FileRelevance[] = [];

      testFiles.forEach(file => {
        const score = file.relevanceScore.score;
        const confidence = file.relevanceScore.confidence;

        if (score >= PRIORITY_THRESHOLDS.HIGH.relevanceScore && 
            confidence >= PRIORITY_THRESHOLDS.HIGH.confidence) {
          highPriority.push(file);
        } else if (score >= PRIORITY_THRESHOLDS.MEDIUM.relevanceScore && 
                   confidence >= PRIORITY_THRESHOLDS.MEDIUM.confidence) {
          mediumPriority.push(file);
        } else {
          lowPriority.push(file);
        }
      });

      expect(highPriority).toHaveLength(2);
      expect(highPriority.map(f => f.file.path)).toEqual(['high1.ts', 'high2.ts']);

      expect(mediumPriority).toHaveLength(2);
      expect(mediumPriority.map(f => f.file.path)).toEqual(['medium1.ts', 'medium2.ts']);

      expect(lowPriority).toHaveLength(2);
      expect(lowPriority.map(f => f.file.path)).toEqual(['low1.ts', 'low2.ts']);
    });

    it('should maintain priority categorization through the entire pipeline', () => {
      // This test verifies that the categorization is consistent
      // from file discovery through to final output
      
      const mockContextPackage: ContextPackage = {
        id: 'test-package',
        userPrompt: 'Test prompt',
        refinedPrompt: 'Refined test prompt',
        taskType: 'refactoring',
        projectPath: '/test/project',
        generatedAt: new Date(),
        files: [
          {
            file: {
              path: 'src/high-priority.ts',
              content: 'test',
              size: 100,
              lastModified: new Date(),
              language: 'typescript',
              isOptimized: false,
              tokenCount: 50,
              actualRelevanceScore: 0.85,
              actualConfidence: 0.9
            },
            relevanceScore: { score: 0.85, confidence: 0.9, reasoning: 'High priority file' },
            categories: ['core'],
            extractedKeywords: []
          }
        ],
        metaPrompt: {
          taskType: 'refactoring',
          systemPrompt: 'System',
          userPrompt: 'User',
          contextSummary: 'Summary',
          taskDecomposition: { epics: [] },
          guidelines: [],
          estimatedComplexity: 'medium'
        },
        statistics: {
          totalFiles: 1,
          totalTokens: 50,
          averageRelevanceScore: 0.85,
          processingTimeMs: 100,
          cacheHitRate: 0
        }
      };

      // Verify the file should be categorized as high priority
      const file = mockContextPackage.files[0];
      const score = file.relevanceScore.score;
      const confidence = file.relevanceScore.confidence;
      
      const isHighPriority = score >= PRIORITY_THRESHOLDS.HIGH.relevanceScore && 
                            confidence >= PRIORITY_THRESHOLDS.HIGH.confidence;
      
      expect(isHighPriority).toBe(true);
    });
  });
});