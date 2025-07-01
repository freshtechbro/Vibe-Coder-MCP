import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContextEnrichmentService } from '../../services/context-enrichment-service.js';
import type { ContextRequest, ContextResult } from '../../services/context-enrichment-service.js';

// Create persistent mock instances
const mockFileSearchInstance = {
  searchFiles: vi.fn(),
  clearCache: vi.fn(),
  getPerformanceMetrics: vi.fn(() => ({
    searchTime: 100,
    filesScanned: 50,
    resultsFound: 10,
    cacheHitRate: 0.8,
    memoryUsage: 1024,
    strategy: 'fuzzy'
  })),
  getCacheStats: vi.fn(() => ({
    totalEntries: 10,
    hitRate: 0.8,
    memoryUsage: 1024,
    evictions: 0,
    avgQueryTime: 50
  }))
};

const mockFileReaderInstance = {
  readFiles: vi.fn(),
  clearCache: vi.fn(),
  getCacheStats: vi.fn(() => ({
    totalEntries: 5,
    memoryUsage: 2048,
    averageFileSize: 400
  }))
};

// Mock the shared services
vi.mock('../../../../services/file-search-service/index.js', () => ({
  FileSearchService: {
    getInstance: vi.fn(() => mockFileSearchInstance)
  },
  FileReaderService: {
    getInstance: vi.fn(() => mockFileReaderInstance)
  }
}));

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('ContextEnrichmentService', () => {
  let contextService: ContextEnrichmentService;
  let mockFileSearchService: Record<string, unknown>;
  let mockFileReaderService: Record<string, unknown>;

  beforeEach(() => {
    // Clear all mocks but preserve the mock implementations
    vi.clearAllMocks();

    // Use the persistent mock instances
    mockFileSearchService = mockFileSearchInstance;
    mockFileReaderService = mockFileReaderInstance;

    // Set default mock return values to prevent undefined errors
    mockFileSearchService.searchFiles.mockResolvedValue([]);
    mockFileReaderService.readFiles.mockResolvedValue({
      files: [],
      errors: [],
      metrics: {
        totalFiles: 0,
        successCount: 0,
        errorCount: 0,
        totalSize: 0,
        readTime: 0,
        cacheHits: 0
      }
    });

    // Reset the singleton instance to ensure fresh instance with mocked services
    (ContextEnrichmentService as unknown as { instance: unknown }).instance = null;

    // Get context service instance after mocks are set up
    contextService = ContextEnrichmentService.getInstance();
  });

  afterEach(() => {
    contextService.clearCache();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ContextEnrichmentService.getInstance();
      const instance2 = ContextEnrichmentService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('gatherContext', () => {
    const mockRequest: ContextRequest = {
      taskDescription: 'Create a new React component for user authentication',
      projectPath: '/test/project',
      searchPatterns: ['auth', 'component'],
      maxFiles: 5,
      maxContentSize: 10000
    };

    beforeEach(() => {
      // Reset only the call history, not the mock implementations
      mockFileSearchService.searchFiles.mockClear();
      mockFileReaderService.readFiles.mockClear();

      // Mock search results - ensure it always returns an array
      mockFileSearchService.searchFiles.mockResolvedValue([
        { filePath: '/test/project/src/components/Auth.tsx', score: 0.9 },
        { filePath: '/test/project/src/utils/auth.ts', score: 0.8 },
        { filePath: '/test/project/src/types/user.ts', score: 0.7 }
      ]);

      // Mock file reading results
      mockFileReaderService.readFiles.mockResolvedValue({
        files: [
          {
            filePath: '/test/project/src/components/Auth.tsx',
            content: 'import React from "react";\nexport const Auth = () => <div>Auth Component</div>;',
            size: 1024,
            lastModified: new Date('2023-12-01'),
            extension: '.tsx',
            contentType: 'text',
            encoding: 'utf-8',
            lineCount: 2,
            charCount: 80
          },
          {
            filePath: '/test/project/src/utils/auth.ts',
            content: 'export const authenticate = (user: string) => { return true; };',
            size: 512,
            lastModified: new Date('2023-12-02'),
            extension: '.ts',
            contentType: 'text',
            encoding: 'utf-8',
            lineCount: 1,
            charCount: 60
          }
        ],
        errors: [],
        metrics: {
          totalFiles: 2,
          successCount: 2,
          errorCount: 0,
          totalSize: 1536,
          readTime: 50,
          cacheHits: 0
        }
      });
    });

    it('should gather context successfully', async () => {
      const result = await contextService.gatherContext(mockRequest);

      expect(result).toBeDefined();
      expect(result.contextFiles).toHaveLength(2);
      expect(result.summary.totalFiles).toBe(2);
      expect(result.summary.totalSize).toBeGreaterThan(0);
      expect(result.metrics.totalTime).toBeGreaterThan(0);
    });

    it('should calculate relevance scores for files', async () => {
      const result = await contextService.gatherContext(mockRequest);

      result.contextFiles.forEach(file => {
        expect(file.relevance).toBeDefined();
        expect(file.relevance.overallScore).toBeGreaterThanOrEqual(0);
        expect(file.relevance.overallScore).toBeLessThanOrEqual(1);
        expect(file.relevance.nameRelevance).toBeGreaterThanOrEqual(0);
        expect(file.relevance.contentRelevance).toBeGreaterThanOrEqual(0);
        expect(file.relevance.typePriority).toBeGreaterThanOrEqual(0);
      });
    });

    it('should respect file limits', async () => {
      const limitedRequest: ContextRequest = {
        ...mockRequest,
        maxFiles: 1
      };

      const result = await contextService.gatherContext(limitedRequest);

      expect(result.contextFiles).toHaveLength(1);
    });

    it('should respect content size limits', async () => {
      const limitedRequest: ContextRequest = {
        ...mockRequest,
        maxContentSize: 50 // Very small limit
      };

      const result = await contextService.gatherContext(limitedRequest);

      const totalSize = result.contextFiles.reduce((sum, file) => sum + file.charCount, 0);
      expect(totalSize).toBeLessThanOrEqual(50);
    });

    it('should handle search patterns', async () => {
      await contextService.gatherContext(mockRequest);

      expect(mockFileSearchService.searchFiles).toHaveBeenCalledWith(
        mockRequest.projectPath,
        expect.objectContaining({
          pattern: 'auth',
          searchStrategy: 'fuzzy'
        })
      );

      expect(mockFileSearchService.searchFiles).toHaveBeenCalledWith(
        mockRequest.projectPath,
        expect.objectContaining({
          pattern: 'component',
          searchStrategy: 'fuzzy'
        })
      );
    });

    it('should handle glob patterns', async () => {
      const globRequest: ContextRequest = {
        ...mockRequest,
        globPatterns: ['**/*.tsx', '**/*.ts']
      };

      await contextService.gatherContext(globRequest);

      expect(mockFileSearchService.searchFiles).toHaveBeenCalledWith(
        mockRequest.projectPath,
        expect.objectContaining({
          glob: '**/*.tsx',
          searchStrategy: 'glob'
        })
      );
    });

    it('should handle content keywords', async () => {
      const keywordRequest: ContextRequest = {
        ...mockRequest,
        contentKeywords: ['React', 'authentication']
      };

      await contextService.gatherContext(keywordRequest);

      expect(mockFileSearchService.searchFiles).toHaveBeenCalledWith(
        mockRequest.projectPath,
        expect.objectContaining({
          content: 'React',
          searchStrategy: 'content'
        })
      );
    });

    it('should handle file reading errors gracefully', async () => {
      mockFileReaderService.readFiles.mockResolvedValue({
        files: [],
        errors: [
          {
            filePath: '/test/project/missing.ts',
            error: 'File not found',
            reason: 'not-found'
          }
        ],
        metrics: {
          totalFiles: 1,
          successCount: 0,
          errorCount: 1,
          totalSize: 0,
          readTime: 10,
          cacheHits: 0
        }
      });

      const result = await contextService.gatherContext(mockRequest);

      expect(result.contextFiles).toHaveLength(0);
      expect(result.failedFiles).toHaveLength(1);
      expect(result.failedFiles[0]).toBe('/test/project/missing.ts');
    });

    it('should extract keywords from task description', async () => {
      const taskRequest: ContextRequest = {
        taskDescription: 'Implement user authentication with JWT tokens',
        projectPath: '/test/project'
      };

      await contextService.gatherContext(taskRequest);

      // Should search for keywords extracted from task description
      expect(mockFileSearchService.searchFiles).toHaveBeenCalled();
    });
  });

  describe('createContextSummary', () => {
    it('should create a formatted context summary', async () => {
      const mockContextResult: ContextResult = {
        contextFiles: [
          {
            filePath: '/test/project/src/components/Auth.tsx',
            content: 'import React from "react";\nexport const Auth = () => <div>Auth</div>;',
            size: 1024,
            lastModified: new Date('2023-12-01'),
            extension: '.tsx',
            contentType: 'text',
            encoding: 'utf-8',
            lineCount: 2,
            charCount: 70,
            relevance: {
              nameRelevance: 0.8,
              contentRelevance: 0.7,
              typePriority: 0.95,
              recencyFactor: 0.9,
              sizeFactor: 1.0,
              overallScore: 0.85
            }
          }
        ],
        failedFiles: [],
        summary: {
          totalFiles: 1,
          totalSize: 70,
          averageRelevance: 0.85,
          topFileTypes: ['.tsx'],
          gatheringTime: 100
        },
        metrics: {
          searchTime: 50,
          readTime: 30,
          scoringTime: 20,
          totalTime: 100,
          cacheHitRate: 0.5
        }
      };

      const summary = await contextService.createContextSummary(mockContextResult);

      expect(summary).toContain('## Context Summary');
      expect(summary).toContain('Found 1 relevant files');
      expect(summary).toContain('Average relevance: 85.0%');
      expect(summary).toContain('## File Contents');
      expect(summary).toContain('Auth.tsx (85.0% relevant)');
      expect(summary).toContain('```tsx');
    });

    it('should handle empty context results', async () => {
      const emptyResult: ContextResult = {
        contextFiles: [],
        failedFiles: [],
        summary: {
          totalFiles: 0,
          totalSize: 0,
          averageRelevance: 0,
          topFileTypes: [],
          gatheringTime: 50
        },
        metrics: {
          searchTime: 25,
          readTime: 0,
          scoringTime: 0,
          totalTime: 50,
          cacheHitRate: 0
        }
      };

      const summary = await contextService.createContextSummary(emptyResult);

      expect(summary).toBe('No relevant context files found for this task.');
    });

    it('should truncate very long files', async () => {
      const longContent = 'a'.repeat(3000);
      const mockContextResult: ContextResult = {
        contextFiles: [
          {
            filePath: '/test/project/large-file.ts',
            content: longContent,
            size: 3000,
            lastModified: new Date(),
            extension: '.ts',
            contentType: 'text',
            encoding: 'utf-8',
            lineCount: 1,
            charCount: 3000,
            relevance: {
              nameRelevance: 0.5,
              contentRelevance: 0.5,
              typePriority: 1.0,
              recencyFactor: 1.0,
              sizeFactor: 0.3,
              overallScore: 0.6
            }
          }
        ],
        failedFiles: [],
        summary: {
          totalFiles: 1,
          totalSize: 3000,
          averageRelevance: 0.6,
          topFileTypes: ['.ts'],
          gatheringTime: 100
        },
        metrics: {
          searchTime: 50,
          readTime: 30,
          scoringTime: 20,
          totalTime: 100,
          cacheHitRate: 0.5
        }
      };

      const summary = await contextService.createContextSummary(mockContextResult);

      expect(summary).toContain('... (truncated)');
    });
  });

  describe('configuration management', () => {
    it('should update configuration', () => {
      const newConfig = {
        defaultMaxFiles: 30,
        minRelevanceThreshold: 0.5
      };

      contextService.updateConfig(newConfig);
      const config = contextService.getConfig();

      expect(config.defaultMaxFiles).toBe(30);
      expect(config.minRelevanceThreshold).toBe(0.5);
    });

    it('should get current configuration', () => {
      const config = contextService.getConfig();

      expect(config).toBeDefined();
      expect(typeof config.defaultMaxFiles).toBe('number');
      expect(typeof config.minRelevanceThreshold).toBe('number');
      expect(typeof config.fileTypePriorities).toBe('object');
    });
  });

  describe('performance metrics', () => {
    it('should provide performance metrics', () => {
      const metrics = contextService.getPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.searchMetrics).toBeDefined();
      expect(metrics.readerCacheStats).toBeDefined();
      expect(metrics.searchCacheStats).toBeDefined();
    });
  });

  describe('cache management', () => {
    it('should clear cache', () => {
      // Ensure the mock methods exist
      mockFileSearchService.clearCache = vi.fn();
      mockFileReaderService.clearCache = vi.fn();

      contextService.clearCache();

      expect(mockFileSearchService.clearCache).toHaveBeenCalled();
      expect(mockFileReaderService.clearCache).toHaveBeenCalled();
    });
  });
});
