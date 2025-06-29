import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResearchIntegration, ResearchRequest, EnhancedResearchResult } from '../../integrations/research-integration.js';
import { performResearchQuery } from '../../../../utils/researchHelper.js';
import { performDirectLlmCall, performFormatAwareLlmCall } from '../../../../utils/llmHelper.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';

// Mock the dependencies
vi.mock('../../../../utils/researchHelper.js', () => ({
  performResearchQuery: vi.fn()
}));

vi.mock('../../../../utils/llmHelper.js', () => ({
  performDirectLlmCall: vi.fn(),
  performFormatAwareLlmCall: vi.fn()
}));

vi.mock('../../utils/config-loader.js', () => ({
  getVibeTaskManagerConfig: vi.fn()
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

describe('ResearchIntegration', () => {
  let service: ResearchIntegration;
  let mockPerformResearchQuery: any;
  let mockPerformDirectLlmCall: any;
  let mockPerformFormatAwareLlmCall: any;
  let mockGetConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset singleton
    (ResearchIntegration as any).instance = undefined;

    // Setup mocks
    mockPerformResearchQuery = performResearchQuery as any;
    mockPerformDirectLlmCall = performDirectLlmCall as any;
    mockPerformFormatAwareLlmCall = performFormatAwareLlmCall as any;
    mockGetConfig = getVibeTaskManagerConfig as any;

    // Mock config
    mockGetConfig.mockResolvedValue({
      llm: {
        model: 'anthropic/claude-3-sonnet',
        defaultModel: 'deepseek/deepseek-r1-0528-qwen3-8b:free',
        perplexityModel: 'perplexity/sonar-deep-research'
      }
    });

    // Mock environment variable
    process.env.OPENROUTER_API_KEY = 'test-api-key';

    service = ResearchIntegration.getInstance({
      maxConcurrentRequests: 2,
      defaultCacheTTL: 60000,
      qualityThresholds: {
        minimum: 0.3,
        good: 0.7,
        excellent: 0.9
      }
    });

    // Clear any existing state
    service['activeRequests'].clear();
    service['researchCache'].clear();
    service['progressSubscriptions'].clear();
    service['completeSubscriptions'].clear();
    service['performanceMetrics'].clear();
  });

  afterEach(() => {
    service.dispose();
  });

  describe('performEnhancedResearch', () => {
    it('should perform enhanced research successfully', async () => {
      const request: ResearchRequest = {
        query: 'Best practices for React authentication',
        taskContext: {
          taskDescription: 'Implement user authentication',
          projectPath: '/test/react-app',
          domain: 'web-development',
          technology: ['React', 'TypeScript']
        },
        scope: {
          depth: 'medium',
          focus: 'technical',
          timeframe: 'current'
        },
        optimization: {
          cacheStrategy: 'session',
          qualityThreshold: 0.7,
          maxQueries: 3,
          parallelQueries: true,
          enhanceResults: true
        },
        integration: {
          includeInDecomposition: true,
          generateSubQueries: true,
          extractActionItems: true,
          createKnowledgeBase: true
        }
      };

      const mockResearchContent = `
# React Authentication Best Practices

## Key Recommendations
- Use JWT tokens for stateless authentication
- Implement proper token storage using httpOnly cookies
- Set up refresh token rotation for enhanced security

## Technical Considerations
- Configure CORS properly for cross-origin requests
- Implement rate limiting to prevent brute force attacks
- Use HTTPS in production environments

## Implementation Steps
1. Setup authentication provider
2. Configure protected routes
3. Implement token refresh logic
4. Add logout functionality
`;

      const mockEnhancedContent = `
# Enhanced React Authentication Guide

## Executive Summary
This research provides comprehensive guidance for implementing secure authentication in React applications.

## Best Practices
- **JWT Implementation**: Use JSON Web Tokens for stateless authentication
- **Secure Storage**: Store tokens in httpOnly cookies to prevent XSS attacks
- **Token Rotation**: Implement refresh token rotation for enhanced security

## Technical Implementation
- Configure CORS settings for API communication
- Implement rate limiting on authentication endpoints
- Ensure HTTPS is used in production

## Action Items
1. Setup authentication context provider
2. Configure protected route components
3. Implement automatic token refresh
4. Add secure logout functionality

## Security Considerations
- Validate tokens on every request
- Implement proper error handling
- Use secure cookie settings
`;

      mockPerformResearchQuery.mockResolvedValue(mockResearchContent);
      mockPerformFormatAwareLlmCall.mockResolvedValue(mockEnhancedContent);

      const result = await service.performEnhancedResearch(request);

      expect(result).toBeDefined();
      expect(result.content).toBe(mockEnhancedContent);
      expect(result.metadata.query).toBe(request.query);
      expect(result.metadata.qualityScore).toBeGreaterThan(0);
      expect(result.insights.keyFindings).toBeDefined();
      expect(result.insights.recommendations).toBeDefined();
      expect(result.insights.actionItems).toBeDefined();
      expect(result.integrationData.suggestedTasks).toBeDefined();
      expect(result.performance.apiCalls).toBe(2); // Research + Enhancement

      expect(mockPerformResearchQuery).toHaveBeenCalledWith(
        request.query,
        expect.objectContaining({
          perplexityModel: 'perplexity/sonar-deep-research'
        })
      );
      expect(mockPerformFormatAwareLlmCall).toHaveBeenCalled();
    });

    it('should use cache when available', async () => {
      const request: ResearchRequest = {
        query: 'Test query',
        scope: {
          depth: 'shallow',
          focus: 'technical',
          timeframe: 'current'
        },
        optimization: {
          cacheStrategy: 'session',
          qualityThreshold: 0.5,
          maxQueries: 1,
          parallelQueries: false,
          enhanceResults: false
        },
        integration: {
          includeInDecomposition: false,
          generateSubQueries: false,
          extractActionItems: false,
          createKnowledgeBase: false
        }
      };

      const mockContent = 'Test research content';
      mockPerformResearchQuery.mockResolvedValue(mockContent);

      // First call
      await service.performEnhancedResearch(request);

      // Second call should use cache
      await service.performEnhancedResearch(request);

      // Should only call the research API once
      expect(mockPerformResearchQuery).toHaveBeenCalledTimes(1);
    });

    it('should handle research without enhancement', async () => {
      const request: ResearchRequest = {
        query: 'Simple query',
        scope: {
          depth: 'shallow',
          focus: 'technical',
          timeframe: 'current'
        },
        optimization: {
          cacheStrategy: 'none',
          qualityThreshold: 0.5,
          maxQueries: 1,
          parallelQueries: false,
          enhanceResults: false
        },
        integration: {
          includeInDecomposition: false,
          generateSubQueries: false,
          extractActionItems: false,
          createKnowledgeBase: false
        }
      };

      const mockContent = 'Simple research content';
      mockPerformResearchQuery.mockResolvedValue(mockContent);

      const result = await service.performEnhancedResearch(request);

      expect(result.content).toBe(mockContent);
      expect(result.performance.apiCalls).toBe(1); // Only research, no enhancement
      expect(mockPerformFormatAwareLlmCall).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const request: ResearchRequest = {
        query: 'Error query',
        scope: {
          depth: 'medium',
          focus: 'technical',
          timeframe: 'current'
        },
        optimization: {
          cacheStrategy: 'none',
          qualityThreshold: 0.5,
          maxQueries: 1,
          parallelQueries: false,
          enhanceResults: false
        },
        integration: {
          includeInDecomposition: false,
          generateSubQueries: false,
          extractActionItems: false,
          createKnowledgeBase: false
        }
      };

      mockPerformResearchQuery.mockRejectedValue(new Error('Research API failed'));

      await expect(service.performEnhancedResearch(request))
        .rejects.toThrow('Failed to perform enhanced research: Research API failed');
    });

    it('should notify progress subscribers', async () => {
      const request: ResearchRequest = {
        query: 'Progress test',
        scope: {
          depth: 'shallow',
          focus: 'technical',
          timeframe: 'current'
        },
        optimization: {
          cacheStrategy: 'none',
          qualityThreshold: 0.5,
          maxQueries: 1,
          parallelQueries: false,
          enhanceResults: false
        },
        integration: {
          includeInDecomposition: false,
          generateSubQueries: false,
          extractActionItems: false,
          createKnowledgeBase: false
        }
      };

      const mockContent = 'Test content';
      mockPerformResearchQuery.mockResolvedValue(mockContent);

      const progressCallback = vi.fn();
      const requestId = service['generateRequestId'](request);
      service.subscribeToResearchProgress(requestId, progressCallback);

      await service.performEnhancedResearch(request);

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith('performing_research', 20, 'Performing primary research');
    });
  });

  describe('enhanceDecompositionWithResearch', () => {
    it('should enhance decomposition with research insights', async () => {
      const decompositionRequest = {
        taskDescription: 'Implement user authentication system',
        projectPath: '/test/project',
        domain: 'web-development',
        context: {}
      };

      const mockResearchContent = `
# Authentication Implementation Guide

## Best Practices
- Use secure token storage
- Implement proper validation
- Add rate limiting

## Technical Considerations
- Configure HTTPS
- Setup CORS properly
- Use strong encryption

## Implementation Steps
1. Setup authentication middleware
2. Create login/logout endpoints
3. Implement token validation
`;

      mockPerformResearchQuery.mockResolvedValue(mockResearchContent);

      const result = await service.enhanceDecompositionWithResearch(decompositionRequest);

      expect(result.enhancedRequest).toBeDefined();
      expect(result.enhancedRequest.taskDescription).toContain('Implement user authentication system');
      expect(result.enhancedRequest.taskDescription).toContain('Key Technical Considerations');
      expect(result.researchResults).toHaveLength(4); // 4 generated queries
      expect(result.integrationMetrics.researchTime).toBeGreaterThan(0);
      expect(result.integrationMetrics.queriesExecuted).toBe(4);
    });

    it('should handle parallel research queries', async () => {
      const decompositionRequest = {
        taskDescription: 'Build API endpoints',
        projectPath: '/test/api',
        domain: 'backend',
        context: {}
      };

      const mockContent = 'API development best practices';
      mockPerformResearchQuery.mockResolvedValue(mockContent);

      const result = await service.enhanceDecompositionWithResearch(decompositionRequest);

      expect(result.researchResults.length).toBeGreaterThan(0);
      expect(mockPerformResearchQuery).toHaveBeenCalledTimes(4); // 4 parallel queries
    });
  });

  describe('generateIntelligentResearchQueries', () => {
    it('should generate intelligent research queries', async () => {
      const taskDescription = 'Implement GraphQL API with authentication';
      const context = {
        projectPath: '/test/graphql-api',
        domain: 'backend',
        technology: ['Node.js', 'GraphQL', 'TypeScript']
      };

      const mockResponse = `
GraphQL authentication best practices
Securing GraphQL endpoints with JWT
GraphQL rate limiting and query complexity analysis
TypeScript GraphQL schema design patterns
`;

      mockPerformFormatAwareLlmCall.mockResolvedValue(mockResponse);

      const queries = await service.generateIntelligentResearchQueries(taskDescription, context);

      expect(queries).toHaveLength(4);
      expect(queries[0]).toContain('GraphQL authentication');
      expect(queries[1]).toContain('Securing GraphQL endpoints');
      expect(mockPerformFormatAwareLlmCall).toHaveBeenCalledWith(
        expect.stringContaining(taskDescription),
        expect.stringContaining('expert software development researcher'),
        expect.any(Object),
        'research_query_generation',
        'text',
        undefined,
        0.3
      );
    });

    it('should fallback to basic queries on error', async () => {
      const taskDescription = 'Test task';

      mockPerformFormatAwareLlmCall.mockRejectedValue(new Error('LLM call failed'));

      const queries = await service.generateIntelligentResearchQueries(taskDescription);

      expect(queries).toHaveLength(3);
      expect(queries[0]).toContain('Best practices for: Test task');
      expect(queries[1]).toContain('Common challenges and solutions for: Test task');
      expect(queries[2]).toContain('Technical implementation approaches for: Test task');
    });
  });

  describe('assessResearchQuality', () => {
    it('should assess high quality research', () => {
      const content = `
# Comprehensive Research Report

## Introduction
This is a detailed analysis of the topic with multiple sections and technical depth.

## Best Practices
- Implementation guidelines
- Architecture considerations
- Performance optimization
- Security measures
- Testing strategies

## Technical Implementation
The implementation involves several key components:
1. Authentication middleware
2. Database integration
3. API endpoint design
4. Error handling

## Conclusion
This research provides comprehensive coverage of the topic.
`;

      const query = 'authentication implementation best practices';
      const assessment = service.assessResearchQuality(content, query);

      expect(assessment.qualityScore).toBeGreaterThan(0.7);
      expect(assessment.relevanceScore).toBeGreaterThan(0.5);
      expect(assessment.completenessScore).toBeGreaterThan(0.7);
      expect(assessment.issues.length).toBeLessThanOrEqual(1); // Allow for minor issues while maintaining high quality
    });

    it('should assess low quality research', () => {
      const content = 'Short content without structure or depth.';
      const query = 'complex authentication system implementation';

      const assessment = service.assessResearchQuality(content, query);

      expect(assessment.qualityScore).toBeLessThan(0.7);
      expect(assessment.completenessScore).toBeLessThan(0.6);
      expect(assessment.issues.length).toBeGreaterThan(0);
      expect(assessment.issues).toContain('Content is too short for comprehensive research');
    });
  });

  describe('subscriptions', () => {
    it('should allow subscribing and unsubscribing from progress updates', () => {
      const requestId = 'test-request';
      const progressCallback = vi.fn();

      const unsubscribe = service.subscribeToResearchProgress(requestId, progressCallback);

      // Get the callbacks from the subscription system
      const callbacks = service['progressSubscriptions'].get(requestId) || [];

      // Simulate progress notification
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

    it('should allow subscribing to completion events', () => {
      const requestId = 'test-request';
      const completeCallback = vi.fn();

      const unsubscribe = service.subscribeToResearchComplete(requestId, completeCallback);

      const mockResult = {
        content: 'test',
        metadata: { query: 'test', timestamp: Date.now() },
        insights: { keyFindings: [] },
        integrationData: { suggestedTasks: [] },
        performance: { cacheHit: false }
      } as EnhancedResearchResult;

      service['notifyCompleteSubscribers'](requestId, mockResult);

      expect(completeCallback).toHaveBeenCalledWith(mockResult);

      // Unsubscribe
      unsubscribe();
      completeCallback.mockClear();

      service['notifyCompleteSubscribers'](requestId, mockResult);
      expect(completeCallback).not.toHaveBeenCalled();
    });
  });

  describe('statistics and management', () => {
    it('should provide comprehensive research statistics', async () => {
      const request: ResearchRequest = {
        query: 'Test query',
        scope: { depth: 'shallow', focus: 'technical', timeframe: 'current' },
        optimization: { cacheStrategy: 'none', qualityThreshold: 0.5, maxQueries: 1, parallelQueries: false, enhanceResults: false },
        integration: { includeInDecomposition: false, generateSubQueries: false, extractActionItems: false, createKnowledgeBase: false }
      };

      mockPerformResearchQuery.mockResolvedValue('Test content');

      await service.performEnhancedResearch(request);

      const stats = service.getResearchStatistics();

      expect(stats.activeRequests).toBe(0);
      expect(stats.cacheSize).toBe(0); // Cache strategy is 'none'
      expect(stats.totalResearchPerformed).toBe(1);
      expect(stats.qualityDistribution).toBeDefined();
      expect(stats.topQueries).toBeDefined();
    });

    it('should clear research cache', async () => {
      const request: ResearchRequest = {
        query: 'Cached query',
        scope: { depth: 'shallow', focus: 'technical', timeframe: 'current' },
        optimization: { cacheStrategy: 'session', qualityThreshold: 0.5, maxQueries: 1, parallelQueries: false, enhanceResults: false },
        integration: { includeInDecomposition: false, generateSubQueries: false, extractActionItems: false, createKnowledgeBase: false }
      };

      mockPerformResearchQuery.mockResolvedValue('Cached content');

      await service.performEnhancedResearch(request);
      expect(service['researchCache'].size).toBe(1);

      const clearedCount = service.clearResearchCache();
      expect(clearedCount).toBe(1);
      expect(service['researchCache'].size).toBe(0);
    });

    it('should update configuration', () => {
      const newConfig = {
        maxConcurrentRequests: 5,
        defaultCacheTTL: 120000
      };

      service.updateConfig(newConfig);

      expect(service['config'].maxConcurrentRequests).toBe(5);
      expect(service['config'].defaultCacheTTL).toBe(120000);
    });
  });
});
