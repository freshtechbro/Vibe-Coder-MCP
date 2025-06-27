/**
 * Auto-Research Integration Tests
 * 
 * Tests the end-to-end integration of auto-research triggering
 * with the task decomposition process.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DecompositionService } from '../../services/decomposition-service.js';
import { AutoResearchDetector } from '../../services/auto-research-detector.js';
import { AtomicTask } from '../../types/task.js';
import { ProjectContext } from '../../types/project-context.js';
import { OpenRouterConfig } from '../../../../types/workflow.js';

describe('Auto-Research Integration', () => {
  let decompositionService: DecompositionService;
  let autoResearchDetector: AutoResearchDetector;
  let mockConfig: OpenRouterConfig;

  beforeEach(() => {
    mockConfig = {
      apiKey: 'test-key',
      baseURL: 'https://openrouter.ai/api/v1',
      model: 'google/gemini-2.5-flash-preview-05-20',
      maxTokens: 4000,
      temperature: 0.7,
      timeout: 30000
    };

    decompositionService = new DecompositionService(mockConfig);
    autoResearchDetector = AutoResearchDetector.getInstance();

    // Clear cache before each test
    autoResearchDetector.clearCache();

    // Enable auto-research for tests (it's disabled by default)
    autoResearchDetector.updateConfig({ enabled: true });

    // Mock LLM calls to avoid actual API calls in tests
    vi.mock('../../../../utils/llmHelper.js', () => ({
      performFormatAwareLlmCall: vi.fn().mockResolvedValue({
        isAtomic: true,
        reasoning: 'Task is atomic for testing',
        confidence: 0.9
      })
    }));
  });

  afterEach(() => {
    autoResearchDetector.clearCache();
  });

  describe('Greenfield Project Detection', () => {
    it('should trigger auto-research for greenfield projects', async () => {
      const greenfieldTask: AtomicTask = {
        id: 'greenfield-task-1',
        title: 'Setup new React application',
        description: 'Create a new React application with TypeScript and modern tooling',
        type: 'development',
        priority: 'high',
        projectId: 'new-project',
        epicId: 'setup-epic',
        estimatedHours: 6,
        acceptanceCriteria: ['Application should compile without errors'],
        tags: ['react', 'typescript', 'setup'],
        filePaths: [],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const greenfieldContext: ProjectContext = {
        projectId: 'new-project',
        languages: ['typescript'],
        frameworks: ['react'],
        tools: ['vite', 'eslint'],
        existingTasks: [],
        codebaseSize: 'small',
        teamSize: 2,
        complexity: 'medium'
      };

      // Mock context enrichment to return greenfield conditions (no files)
      const mockContextResult = {
        contextFiles: [],
        summary: {
          totalFiles: 0, // This triggers greenfield detection
          totalSize: 0,
          averageRelevance: 0,
          topFileTypes: [],
          gatheringTime: 100
        },
        metrics: {
          searchTime: 50,
          readTime: 0,
          scoringTime: 0,
          totalTime: 100,
          cacheHitRate: 0
        }
      };

      const contextSpy = vi.spyOn(decompositionService['contextService'], 'gatherContext')
        .mockResolvedValue(mockContextResult);

      // Mock the research integration to avoid actual API calls
      const mockResearchResult = {
        researchResults: [
          {
            content: 'React best practices for TypeScript projects',
            metadata: { query: 'React TypeScript setup best practices' },
            insights: {
              keyFindings: ['Use strict TypeScript configuration', 'Implement proper component patterns'],
              actionItems: ['Setup ESLint rules', 'Configure TypeScript paths'],
              recommendations: ['Use functional components', 'Implement proper error boundaries']
            }
          }
        ],
        integrationMetrics: {
          researchTime: 1500,
          totalQueries: 1,
          successRate: 1.0
        }
      };

      // Spy on the research integration
      const researchSpy = vi.spyOn(decompositionService['researchIntegrationService'], 'enhanceDecompositionWithResearch')
        .mockResolvedValue(mockResearchResult);

      // Start decomposition
      const decompositionRequest = {
        task: greenfieldTask,
        context: greenfieldContext,
        sessionId: 'test-session-greenfield'
      };

      const session = await decompositionService.startDecomposition(decompositionRequest);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify research was triggered
      expect(researchSpy).toHaveBeenCalled();

      // Verify session was created (check if session exists)
      expect(session).toBeDefined();
      if (session) {
        expect(session.sessionId).toBe('test-session-greenfield');
        expect(session.status).toBe('in_progress');
      }

      contextSpy.mockRestore();
      researchSpy.mockRestore();
    }, 10000);
  });

  describe('Task Complexity Detection', () => {
    it('should trigger auto-research for complex architectural tasks', async () => {
      const complexTask: AtomicTask = {
        id: 'complex-task-1',
        title: 'Implement microservices architecture',
        description: 'Design and implement a scalable microservices architecture with service discovery, load balancing, and fault tolerance',
        type: 'development',
        priority: 'high',
        projectId: 'existing-project',
        epicId: 'architecture-epic',
        estimatedHours: 20,
        acceptanceCriteria: ['Services should be independently deployable'],
        tags: ['architecture', 'microservices', 'scalability'],
        filePaths: ['src/services/', 'src/gateway/'],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const existingContext: ProjectContext = {
        projectId: 'existing-project',
        languages: ['typescript', 'javascript'],
        frameworks: ['express', 'nestjs'],
        tools: ['docker', 'kubernetes'],
        existingTasks: [],
        codebaseSize: 'large',
        teamSize: 5,
        complexity: 'high'
      };

      // Mock context enrichment to return conditions that trigger complexity-based research
      const mockContextResult = {
        contextFiles: [
          { filePath: 'src/service1.ts', relevance: { overallScore: 0.6 }, extension: '.ts', charCount: 1000 },
          { filePath: 'src/service2.ts', relevance: { overallScore: 0.5 }, extension: '.ts', charCount: 800 }
        ],
        summary: {
          totalFiles: 2, // Some files but not enough for complex task
          totalSize: 1800,
          averageRelevance: 0.55, // Below threshold for complex task
          topFileTypes: ['.ts'],
          gatheringTime: 150
        },
        metrics: {
          searchTime: 75,
          readTime: 50,
          scoringTime: 25,
          totalTime: 150,
          cacheHitRate: 0.2
        }
      };

      const contextSpy = vi.spyOn(decompositionService['contextService'], 'gatherContext')
        .mockResolvedValue(mockContextResult);

      // Mock research integration
      const mockResearchResult = {
        researchResults: [
          {
            content: 'Microservices architecture patterns and best practices',
            metadata: { query: 'microservices architecture design patterns' },
            insights: {
              keyFindings: ['Use API Gateway pattern', 'Implement circuit breaker pattern'],
              actionItems: ['Setup service registry', 'Implement health checks'],
              recommendations: ['Use event-driven communication', 'Implement distributed tracing']
            }
          }
        ],
        integrationMetrics: {
          researchTime: 2500,
          totalQueries: 2,
          successRate: 1.0
        }
      };

      const researchSpy = vi.spyOn(decompositionService['researchIntegrationService'], 'enhanceDecompositionWithResearch')
        .mockResolvedValue(mockResearchResult);

      const decompositionRequest = {
        task: complexTask,
        context: existingContext,
        sessionId: 'test-session-complex'
      };

      const session = await decompositionService.startDecomposition(decompositionRequest);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify research was triggered for complex task
      expect(researchSpy).toHaveBeenCalled();
      expect(session).toBeDefined();
      if (session) {
        expect(session.sessionId).toBe('test-session-complex');
      }

      contextSpy.mockRestore();
      researchSpy.mockRestore();
    }, 10000);
  });

  describe('Knowledge Gap Detection', () => {
    it('should trigger auto-research when context enrichment finds insufficient context', async () => {
      const taskWithLimitedContext: AtomicTask = {
        id: 'limited-context-task',
        title: 'Implement blockchain integration',
        description: 'Integrate with Ethereum blockchain for smart contract interactions',
        type: 'development',
        priority: 'medium',
        projectId: 'blockchain-project',
        epicId: 'blockchain-epic',
        estimatedHours: 8,
        acceptanceCriteria: ['Should connect to Ethereum mainnet'],
        tags: ['blockchain', 'ethereum', 'web3'],
        filePaths: [],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const limitedContext: ProjectContext = {
        projectId: 'blockchain-project',
        languages: ['javascript'],
        frameworks: ['express'],
        tools: ['npm'],
        existingTasks: [],
        codebaseSize: 'small',
        teamSize: 2,
        complexity: 'high'
      };

      // Mock context enrichment to return limited results
      const mockContextResult = {
        contextFiles: [],
        summary: {
          totalFiles: 0,
          totalSize: 0,
          averageRelevance: 0,
          topFileTypes: [],
          gatheringTime: 100
        },
        metrics: {
          searchTime: 50,
          readTime: 0,
          scoringTime: 0,
          totalTime: 100,
          cacheHitRate: 0
        }
      };

      const contextSpy = vi.spyOn(decompositionService['contextService'], 'gatherContext')
        .mockResolvedValue(mockContextResult);

      const mockResearchResult = {
        researchResults: [
          {
            content: 'Ethereum blockchain integration best practices',
            metadata: { query: 'Ethereum smart contract integration' },
            insights: {
              keyFindings: ['Use Web3.js or Ethers.js', 'Implement proper error handling'],
              actionItems: ['Setup Web3 provider', 'Create contract interfaces'],
              recommendations: ['Use environment-specific networks', 'Implement gas optimization']
            }
          }
        ],
        integrationMetrics: {
          researchTime: 2000,
          totalQueries: 1,
          successRate: 1.0
        }
      };

      const researchSpy = vi.spyOn(decompositionService['researchIntegrationService'], 'enhanceDecompositionWithResearch')
        .mockResolvedValue(mockResearchResult);

      const decompositionRequest = {
        task: taskWithLimitedContext,
        context: limitedContext,
        sessionId: 'test-session-knowledge-gap'
      };

      const session = await decompositionService.startDecomposition(decompositionRequest);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify research was triggered due to knowledge gap
      expect(researchSpy).toHaveBeenCalled();
      expect(session).toBeDefined();
      if (session) {
        expect(session.sessionId).toBe('test-session-knowledge-gap');
      }

      contextSpy.mockRestore();
      researchSpy.mockRestore();
    }, 10000);
  });

  describe('Auto-Research Configuration', () => {
    it('should respect auto-research configuration settings', async () => {
      // Disable auto-research
      autoResearchDetector.updateConfig({ enabled: false });

      const task: AtomicTask = {
        id: 'config-test-task',
        title: 'Complex system integration',
        description: 'Integrate multiple complex systems with advanced architecture patterns',
        type: 'development',
        priority: 'high',
        projectId: 'config-test-project',
        epicId: 'config-epic',
        estimatedHours: 15,
        acceptanceCriteria: ['Systems should integrate seamlessly'],
        tags: ['integration', 'architecture', 'complex'],
        filePaths: [],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const context: ProjectContext = {
        projectId: 'config-test-project',
        languages: ['typescript'],
        frameworks: ['nestjs'],
        tools: ['docker'],
        existingTasks: [],
        codebaseSize: 'medium',
        teamSize: 3,
        complexity: 'high'
      };

      const researchSpy = vi.spyOn(decompositionService['researchIntegrationService'], 'enhanceDecompositionWithResearch');

      const decompositionRequest = {
        task,
        context,
        sessionId: 'test-session-config'
      };

      const session = await decompositionService.startDecomposition(decompositionRequest);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify research was NOT triggered due to disabled config
      expect(researchSpy).not.toHaveBeenCalled();
      expect(session).toBeDefined();
      if (session) {
        expect(session.sessionId).toBe('test-session-config');
      }

      // Re-enable for other tests
      autoResearchDetector.updateConfig({ enabled: true });

      researchSpy.mockRestore();
    }, 10000);
  });

  describe('Performance Metrics', () => {
    it('should track auto-research performance metrics', async () => {
      const initialMetrics = autoResearchDetector.getPerformanceMetrics();
      const initialEvaluations = initialMetrics.totalEvaluations;

      const task: AtomicTask = {
        id: 'metrics-task',
        title: 'Simple task',
        description: 'A simple task for metrics testing',
        type: 'development',
        priority: 'low',
        projectId: 'metrics-project',
        epicId: 'metrics-epic',
        estimatedHours: 1,
        acceptanceCriteria: ['Task should complete'],
        tags: ['simple'],
        filePaths: [],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const context: ProjectContext = {
        projectId: 'metrics-project',
        languages: ['javascript'],
        frameworks: ['express'],
        tools: ['npm'],
        existingTasks: [],
        codebaseSize: 'small',
        teamSize: 1,
        complexity: 'low'
      };

      const decompositionRequest = {
        task,
        context,
        sessionId: 'test-session-metrics'
      };

      await decompositionService.startDecomposition(decompositionRequest);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 100));

      const finalMetrics = autoResearchDetector.getPerformanceMetrics();

      // Verify metrics were updated
      expect(finalMetrics.totalEvaluations).toBeGreaterThan(initialEvaluations);
      expect(finalMetrics.averageEvaluationTime).toBeGreaterThan(0);
      expect(finalMetrics.cacheHitRate).toBeGreaterThanOrEqual(0);
    }, 10000);
  });
});
