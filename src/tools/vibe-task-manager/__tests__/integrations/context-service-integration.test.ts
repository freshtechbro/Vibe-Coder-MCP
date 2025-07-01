import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextServiceIntegration, EnhancedContextRequest } from '../../integrations/context-service-integration.js';
import { ContextEnrichmentService } from '../../services/context-enrichment-service.js';

// Mock the dependencies
vi.mock('../../services/context-enrichment-service.js', () => ({
  ContextEnrichmentService: {
    getInstance: vi.fn(() => ({
      gatherContext: vi.fn(),
      createContextSummary: vi.fn(),
      updateConfig: vi.fn(),
      getConfig: vi.fn(),
      getPerformanceMetrics: vi.fn()
    }))
  }
}));

vi.mock('../../../../services/file-search-service/index.js', () => ({
  FileSearchService: {
    getInstance: vi.fn(() => ({
      searchFiles: vi.fn(),
      clearCache: vi.fn(),
      getPerformanceMetrics: vi.fn(),
      getCacheStats: vi.fn()
    }))
  },
  FileReaderService: {
    getInstance: vi.fn(() => ({
      readFiles: vi.fn(),
      clearCache: vi.fn(),
      getCacheStats: vi.fn()
    }))
  }
}));

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('ContextServiceIntegration', () => {
  let service: ContextServiceIntegration;
  let mockContextService: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset singleton
    (ContextServiceIntegration as Record<string, unknown>).instance = undefined;

    // Setup mocks
    mockContextService = {
      gatherContext: vi.fn(),
      createContextSummary: vi.fn(),
      updateConfig: vi.fn(),
      getConfig: vi.fn(),
      getPerformanceMetrics: vi.fn()
    };


    (ContextEnrichmentService.getInstance as Record<string, unknown>).mockReturnValue(mockContextService);

    service = ContextServiceIntegration.getInstance({
      maxConcurrentRequests: 2,
      defaultCacheTTL: 60000,
      enablePerformanceMonitoring: true
    });

    // Clear any existing state
    (service as Record<string, unknown>)['activeRequests']?.clear?.();
    (service as Record<string, unknown>)['contextCache']?.clear?.();
    (service as Record<string, unknown>)['sessionContexts']?.clear?.();
    (service as Record<string, unknown>)['contextSubscriptions']?.clear?.();
    service['progressSubscriptions'].clear();
    service['performanceMetrics'].clear();
  });

  afterEach(() => {
    service.dispose();
  });

  describe('gatherEnhancedContext', () => {
    it('should gather enhanced context successfully', async () => {
      const request: EnhancedContextRequest = {
        taskDescription: 'Implement user authentication',
        projectPath: '/test/project',
        priority: 'high',
        cacheStrategy: 'session',
        enrichmentDepth: 'medium',
        sessionId: 'test-session',
        taskId: 'task-1',
        includeArchitecturalPatterns: true,
        includeDependencyAnalysis: true,
        includeCodeQualityMetrics: true
      };

      const mockBasicResult = {
        contextFiles: [
          {
            filePath: '/test/project/auth.ts',
            content: 'export class AuthService { }',
            charCount: 100,
            extension: '.ts',
            relevance: {
              overallScore: 0.8,
              fileNameMatch: 0.9,
              contentMatch: 0.7,
              recencyScore: 0.8,
              sizeScore: 0.6
            }
          }
        ],
        failedFiles: [],
        summary: {
          totalFiles: 1,
          totalSize: 100,
          averageRelevance: 0.8,
          topFileTypes: ['.ts'],
          gatheringTime: 50
        },
        metrics: {
          searchTime: 20,
          readTime: 15,
          scoringTime: 10,
          totalTime: 50,
          cacheHitRate: 0.5
        }
      };

      mockContextService.gatherContext.mockResolvedValue(mockBasicResult);

      const result = await service.gatherEnhancedContext(request);

      expect(result).toBeDefined();
      expect(result.sessionInfo.sessionId).toBe('test-session');
      expect(result.sessionInfo.taskId).toBe('task-1');
      expect(result.sessionInfo.enrichmentDepth).toBe('medium');
      expect(result.architecturalInsights).toBeDefined();
      expect(result.dependencyAnalysis).toBeDefined();
      expect(result.codeQualityMetrics).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.enhancedMetrics).toBeDefined();
      expect(result.enhancedMetrics.contextQualityScore).toBeGreaterThan(0);
    });

    it('should use cache when available', async () => {
      const request: EnhancedContextRequest = {
        taskDescription: 'Test task',
        projectPath: '/test/project',
        priority: 'medium',
        cacheStrategy: 'session',
        enrichmentDepth: 'shallow'
      };

      const mockResult = {
        contextFiles: [],
        failedFiles: [],
        summary: { totalFiles: 0, totalSize: 0, averageRelevance: 0, topFileTypes: [], gatheringTime: 0 },
        metrics: { searchTime: 0, readTime: 0, scoringTime: 0, totalTime: 0, cacheHitRate: 0 }
      };

      mockContextService.gatherContext.mockResolvedValue(mockResult);

      // First call
      await service.gatherEnhancedContext(request);

      // Second call should use cache
      await service.gatherEnhancedContext(request);

      // Should only call the underlying service once
      expect(mockContextService.gatherContext).toHaveBeenCalledTimes(1);
    });

    it('should handle shallow enrichment depth', async () => {
      const request: EnhancedContextRequest = {
        taskDescription: 'Simple task',
        projectPath: '/test/project',
        priority: 'low',
        cacheStrategy: 'none',
        enrichmentDepth: 'shallow'
      };

      const mockResult = {
        contextFiles: [],
        failedFiles: [],
        summary: { totalFiles: 0, totalSize: 0, averageRelevance: 0, topFileTypes: [], gatheringTime: 0 },
        metrics: { searchTime: 0, readTime: 0, scoringTime: 0, totalTime: 0, cacheHitRate: 0 }
      };

      mockContextService.gatherContext.mockResolvedValue(mockResult);

      const result = await service.gatherEnhancedContext(request);

      expect(result.architecturalInsights).toBeUndefined();
      expect(result.dependencyAnalysis).toBeUndefined();
      expect(result.codeQualityMetrics).toBeUndefined();
    });

    it('should handle errors gracefully', async () => {
      const request: EnhancedContextRequest = {
        taskDescription: 'Error task',
        projectPath: '/test/project',
        priority: 'medium',
        cacheStrategy: 'none',
        enrichmentDepth: 'medium'
      };

      mockContextService.gatherContext.mockRejectedValue(new Error('Context gathering failed'));

      await expect(service.gatherEnhancedContext(request))
        .rejects.toThrow('Failed to gather enhanced context: Context gathering failed');
    });

    it('should notify progress subscribers', async () => {
      const request: EnhancedContextRequest = {
        taskDescription: 'Progress task',
        projectPath: '/test/project',
        priority: 'medium',
        cacheStrategy: 'none',
        enrichmentDepth: 'medium'
      };

      const mockResult = {
        contextFiles: [],
        failedFiles: [],
        summary: { totalFiles: 0, totalSize: 0, averageRelevance: 0, topFileTypes: [], gatheringTime: 0 },
        metrics: { searchTime: 0, readTime: 0, scoringTime: 0, totalTime: 0, cacheHitRate: 0 }
      };

      mockContextService.gatherContext.mockResolvedValue(mockResult);

      const progressCallback = vi.fn();
      const requestId = service['generateRequestId'](request);
      service.subscribeToContextProgress(requestId, progressCallback);

      await service.gatherEnhancedContext(request);

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith('gathering_basic_context', 10, 'Gathering basic context');
    });
  });

  describe('gatherBatchContext', () => {
    it('should process multiple context requests', async () => {
      const requests: EnhancedContextRequest[] = [
        {
          taskDescription: 'Task 1',
          projectPath: '/test/project1',
          priority: 'high',
          cacheStrategy: 'none', // Disable cache to ensure separate requests
          enrichmentDepth: 'shallow'
        },
        {
          taskDescription: 'Task 2',
          projectPath: '/test/project2',
          priority: 'medium',
          cacheStrategy: 'none', // Disable cache to ensure separate requests
          enrichmentDepth: 'shallow'
        }
      ];

      const mockResult = {
        contextFiles: [],
        failedFiles: [],
        summary: { totalFiles: 0, totalSize: 0, averageRelevance: 0, topFileTypes: [], gatheringTime: 0 },
        metrics: { searchTime: 0, readTime: 0, scoringTime: 0, totalTime: 0, cacheHitRate: 0 }
      };

      mockContextService.gatherContext.mockResolvedValue(mockResult);

      const results = await service.gatherBatchContext(requests);

      expect(results.size).toBe(2);
      expect(mockContextService.gatherContext).toHaveBeenCalledTimes(2);
    });

    it('should handle batch request failures gracefully', async () => {
      const requests: EnhancedContextRequest[] = [
        {
          taskDescription: 'Good task',
          projectPath: '/test/project1',
          priority: 'high',
          cacheStrategy: 'none',
          enrichmentDepth: 'shallow'
        },
        {
          taskDescription: 'Bad task',
          projectPath: '/test/project2',
          priority: 'medium',
          cacheStrategy: 'none',
          enrichmentDepth: 'shallow'
        }
      ];

      const mockResult = {
        contextFiles: [],
        failedFiles: [],
        summary: { totalFiles: 0, totalSize: 0, averageRelevance: 0, topFileTypes: [], gatheringTime: 0 },
        metrics: { searchTime: 0, readTime: 0, scoringTime: 0, totalTime: 0, cacheHitRate: 0 }
      };

      mockContextService.gatherContext
        .mockResolvedValueOnce(mockResult)
        .mockRejectedValueOnce(new Error('Failed'));

      const results = await service.gatherBatchContext(requests);

      // Should have one successful result
      expect(results.size).toBe(1);
    });
  });

  describe('getSessionContextSummary', () => {
    it('should return session context summary', async () => {
      const sessionId = 'test-session';
      const request: EnhancedContextRequest = {
        taskDescription: 'Test task',
        projectPath: '/test/project',
        priority: 'medium',
        cacheStrategy: 'session',
        enrichmentDepth: 'shallow',
        sessionId
      };

      const mockResult = {
        contextFiles: [
          {
            filePath: '/test/file.ts',
            content: 'test',
            charCount: 100,
            extension: '.ts',
            relevance: { overallScore: 0.8 }
          }
        ],
        failedFiles: [],
        summary: { totalFiles: 1, totalSize: 100, averageRelevance: 0.8, topFileTypes: ['.ts'], gatheringTime: 50 },
        metrics: { searchTime: 0, readTime: 0, scoringTime: 0, totalTime: 0, cacheHitRate: 0 }
      };

      mockContextService.gatherContext.mockResolvedValue(mockResult);

      await service.gatherEnhancedContext(request);

      const summary = service.getSessionContextSummary(sessionId);

      expect(summary).toBeDefined();
      expect(summary!.totalContexts).toBe(1);
      expect(summary!.totalFiles).toBe(1);
      expect(summary!.totalSize).toBe(100);
      expect(summary!.topFileTypes).toContain('.ts');
    });

    it('should return null for non-existent session', () => {
      const summary = service.getSessionContextSummary('non-existent');
      expect(summary).toBeNull();
    });
  });

  describe('subscriptions', () => {
    it('should allow subscribing and unsubscribing from context updates', async () => {
      const request: EnhancedContextRequest = {
        taskDescription: 'Test task',
        projectPath: '/test/project',
        priority: 'medium',
        cacheStrategy: 'none',
        enrichmentDepth: 'shallow'
      };

      const mockResult = {
        contextFiles: [],
        failedFiles: [],
        summary: { totalFiles: 0, totalSize: 0, averageRelevance: 0, topFileTypes: [], gatheringTime: 0 },
        metrics: { searchTime: 0, readTime: 0, scoringTime: 0, totalTime: 0, cacheHitRate: 0 }
      };

      mockContextService.gatherContext.mockResolvedValue(mockResult);

      const callback = vi.fn();
      const requestId = service['generateRequestId'](request);
      const unsubscribe = service.subscribeToContextUpdates(requestId, callback);

      await service.gatherEnhancedContext(request);

      // Unsubscribe and verify no more calls
      unsubscribe();
      callback.mockClear();

      await service.gatherEnhancedContext({
        ...request,
        taskDescription: 'Different task'
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should allow subscribing to progress updates', () => {
      const requestId = 'test-request';
      const progressCallback = vi.fn();

      const unsubscribe = service.subscribeToContextProgress(requestId, progressCallback);

      // Get the callbacks from the subscription system
      const callbacks = service['progressSubscriptions'].get(requestId) || [];

      // Simulate progress notification through the subscription system
      service['notifyProgress'](callbacks, 'test_stage', 50, 'Test message');

      expect(progressCallback).toHaveBeenCalledWith('test_stage', 50, 'Test message');

      // Unsubscribe
      unsubscribe();
      progressCallback.mockClear();

      // Get updated callbacks after unsubscribe
      const updatedCallbacks = service['progressSubscriptions'].get(requestId) || [];
      service['notifyProgress'](updatedCallbacks, 'test_stage', 75, 'Another message');
      expect(progressCallback).not.toHaveBeenCalled();
    });
  });

  describe('cache management', () => {
    it('should invalidate cache by pattern', async () => {
      const request1: EnhancedContextRequest = {
        taskDescription: 'Auth task',
        projectPath: '/test/auth',
        priority: 'medium',
        cacheStrategy: 'session',
        enrichmentDepth: 'shallow'
      };

      const request2: EnhancedContextRequest = {
        taskDescription: 'User task',
        projectPath: '/test/user',
        priority: 'medium',
        cacheStrategy: 'session',
        enrichmentDepth: 'shallow'
      };

      const mockResult = {
        contextFiles: [],
        failedFiles: [],
        summary: { totalFiles: 0, totalSize: 0, averageRelevance: 0, topFileTypes: [], gatheringTime: 0 },
        metrics: { searchTime: 0, readTime: 0, scoringTime: 0, totalTime: 0, cacheHitRate: 0 }
      };

      mockContextService.gatherContext.mockResolvedValue(mockResult);

      // Cache both requests
      await service.gatherEnhancedContext(request1);
      await service.gatherEnhancedContext(request2);

      expect(service['contextCache'].size).toBe(2);

      // Get the actual cache keys to test invalidation
      const cacheKeys = Array.from(service['contextCache'].keys());

      // Invalidate using the first cache key (which should be for the auth request)
      const firstKey = cacheKeys[0];
      const invalidatedCount = service.invalidateContextCache(firstKey.substring(0, 8)); // Use partial key

      expect(invalidatedCount).toBe(1);
      expect(service['contextCache'].size).toBe(1);
    });

    it('should clear all cache when no pattern provided', async () => {
      const request: EnhancedContextRequest = {
        taskDescription: 'Test task',
        projectPath: '/test/project',
        priority: 'medium',
        cacheStrategy: 'session',
        enrichmentDepth: 'shallow'
      };

      const mockResult = {
        contextFiles: [],
        failedFiles: [],
        summary: { totalFiles: 0, totalSize: 0, averageRelevance: 0, topFileTypes: [], gatheringTime: 0 },
        metrics: { searchTime: 0, readTime: 0, scoringTime: 0, totalTime: 0, cacheHitRate: 0 }
      };

      mockContextService.gatherContext.mockResolvedValue(mockResult);

      await service.gatherEnhancedContext(request);
      expect(service['contextCache'].size).toBe(1);

      const invalidatedCount = service.invalidateContextCache();
      expect(invalidatedCount).toBe(1);
      expect(service['contextCache'].size).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should provide comprehensive context statistics', async () => {
      const request: EnhancedContextRequest = {
        taskDescription: 'Test task',
        projectPath: '/test/project',
        priority: 'medium',
        cacheStrategy: 'session',
        enrichmentDepth: 'shallow',
        sessionId: 'test-session'
      };

      const mockResult = {
        contextFiles: [],
        failedFiles: [],
        summary: { totalFiles: 1, totalSize: 100, averageRelevance: 0.8, topFileTypes: ['.ts'], gatheringTime: 50 },
        metrics: { searchTime: 0, readTime: 0, scoringTime: 0, totalTime: 0, cacheHitRate: 0 }
      };

      mockContextService.gatherContext.mockResolvedValue(mockResult);

      await service.gatherEnhancedContext(request);

      const stats = service.getContextStatistics();

      expect(stats.activeRequests).toBe(0);
      expect(stats.cacheSize).toBe(1);
      expect(stats.sessionCount).toBe(1);
      expect(stats.totalContextsGathered).toBe(1);
      expect(stats.qualityDistribution).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should allow updating configuration', () => {
      const newConfig = {
        maxConcurrentRequests: 10,
        defaultCacheTTL: 120000
      };

      service.updateConfig(newConfig);

      // Verify config was updated by checking internal state
      expect(service['config'].maxConcurrentRequests).toBe(10);
      expect(service['config'].defaultCacheTTL).toBe(120000);
    });
  });

  describe('session management', () => {
    it('should clear session context', async () => {
      const sessionId = 'test-session';
      const request: EnhancedContextRequest = {
        taskDescription: 'Test task',
        projectPath: '/test/project',
        priority: 'medium',
        cacheStrategy: 'session',
        enrichmentDepth: 'shallow',
        sessionId
      };

      const mockResult = {
        contextFiles: [],
        failedFiles: [],
        summary: { totalFiles: 0, totalSize: 0, averageRelevance: 0, topFileTypes: [], gatheringTime: 0 },
        metrics: { searchTime: 0, readTime: 0, scoringTime: 0, totalTime: 0, cacheHitRate: 0 }
      };

      mockContextService.gatherContext.mockResolvedValue(mockResult);

      await service.gatherEnhancedContext(request);
      expect(service['sessionContexts'].has(sessionId)).toBe(true);

      const cleared = service.clearSessionContext(sessionId);
      expect(cleared).toBe(true);
      expect(service['sessionContexts'].has(sessionId)).toBe(false);
    });

    it('should return false when clearing non-existent session', () => {
      const cleared = service.clearSessionContext('non-existent');
      expect(cleared).toBe(false);
    });
  });
});
