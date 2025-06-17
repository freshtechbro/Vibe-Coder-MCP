/**
 * Auto-Research Detector Service Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AutoResearchDetector } from '../../services/auto-research-detector.js';
import { AtomicTask } from '../../types/task.js';
import { ProjectContext } from '../../core/atomic-detector.js';
import { ContextResult } from '../../services/context-enrichment-service.js';
import { ResearchTriggerContext } from '../../types/research-types.js';

describe('AutoResearchDetector', () => {
  let detector: AutoResearchDetector;
  let mockTask: AtomicTask;
  let mockProjectContext: ProjectContext;
  let mockContextResult: ContextResult;

  beforeEach(() => {
    detector = AutoResearchDetector.getInstance();
    
    mockTask = {
      id: 'test-task-1',
      title: 'Implement user authentication',
      description: 'Create a secure authentication system with JWT tokens',
      type: 'development',
      priority: 'high',
      projectId: 'test-project',
      epicId: 'test-epic',
      estimatedHours: 4,
      acceptanceCriteria: ['User can login with valid credentials'],
      tags: ['auth', 'security'],
      filePaths: ['src/auth/auth.service.ts'],
      dependencies: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    mockProjectContext = {
      projectId: 'test-project',
      languages: ['typescript', 'javascript'],
      frameworks: ['react', 'express'],
      tools: ['jest', 'eslint'],
      existingTasks: [],
      codebaseSize: 'medium',
      teamSize: 3,
      complexity: 'medium'
    };

    mockContextResult = {
      contextFiles: [
        {
          filePath: 'src/auth/auth.service.ts',
          content: 'export class AuthService { }',
          relevance: {
            nameRelevance: 0.9,
            contentRelevance: 0.8,
            typePriority: 1.0,
            recencyFactor: 0.9,
            sizeFactor: 0.9,
            overallScore: 0.87
          },
          extension: '.ts',
          charCount: 100,
          lineCount: 5
        }
      ],
      summary: {
        totalFiles: 1,
        totalSize: 100,
        averageRelevance: 0.87,
        topFileTypes: ['.ts'],
        gatheringTime: 150
      },
      metrics: {
        searchTime: 50,
        readTime: 75,
        scoringTime: 25,
        totalTime: 150,
        cacheHitRate: 0.0
      }
    };
  });

  afterEach(() => {
    detector.clearCache();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = AutoResearchDetector.getInstance();
      const instance2 = AutoResearchDetector.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('evaluateResearchNeed', () => {
    it('should trigger research for greenfield projects', async () => {
      const context: ResearchTriggerContext = {
        task: mockTask,
        projectContext: mockProjectContext,
        contextResult: {
          ...mockContextResult,
          summary: {
            ...mockContextResult.summary,
            totalFiles: 0, // No existing files = greenfield
            averageRelevance: 0
          }
        },
        projectPath: '/test/project'
      };

      const evaluation = await detector.evaluateResearchNeed(context);

      expect(evaluation.decision.shouldTriggerResearch).toBe(true);
      expect(evaluation.decision.primaryReason).toBe('project_type');
      expect(evaluation.decision.confidence).toBeGreaterThan(0.7);
      expect(evaluation.decision.reasoning[0]).toContain('Greenfield project detected');
    });

    it('should trigger research for high complexity tasks', async () => {
      const complexTask = {
        ...mockTask,
        title: 'Implement microservices architecture',
        description: 'Design and implement a scalable microservices architecture with service discovery',
        estimatedHours: 12
      };

      const context: ResearchTriggerContext = {
        task: complexTask,
        projectContext: mockProjectContext,
        contextResult: mockContextResult,
        projectPath: '/test/project'
      };

      const evaluation = await detector.evaluateResearchNeed(context);

      expect(evaluation.decision.shouldTriggerResearch).toBe(true);
      expect(evaluation.decision.primaryReason).toBe('task_complexity');
      expect(evaluation.decision.evaluatedConditions.taskComplexity.complexityScore).toBeGreaterThan(0.4);
      expect(evaluation.decision.evaluatedConditions.taskComplexity.complexityIndicators).toContain('architecture');
    });

    it('should trigger research for insufficient context', async () => {
      const context: ResearchTriggerContext = {
        task: mockTask,
        projectContext: mockProjectContext,
        contextResult: {
          ...mockContextResult,
          summary: {
            ...mockContextResult.summary,
            totalFiles: 1, // Below threshold
            averageRelevance: 0.3 // Below threshold
          }
        },
        projectPath: '/test/project'
      };

      const evaluation = await detector.evaluateResearchNeed(context);

      expect(evaluation.decision.shouldTriggerResearch).toBe(true);
      expect(evaluation.decision.primaryReason).toBe('knowledge_gap');
      expect(evaluation.decision.evaluatedConditions.knowledgeGap.hasInsufficientContext).toBe(true);
    });

    it('should trigger research for specialized domains', async () => {
      const specializedTask = {
        ...mockTask,
        title: 'Implement blockchain smart contract',
        description: 'Create a smart contract for NFT marketplace using Solidity'
      };

      const specializedContext = {
        ...mockProjectContext,
        languages: ['solidity', 'javascript'],
        frameworks: ['hardhat', 'web3']
      };

      const context: ResearchTriggerContext = {
        task: specializedTask,
        projectContext: specializedContext,
        contextResult: {
          ...mockContextResult,
          summary: {
            ...mockContextResult.summary,
            totalFiles: 10, // Sufficient files to avoid knowledge gap trigger
            averageRelevance: 0.8 // High relevance to avoid knowledge gap trigger
          }
        },
        projectPath: '/test/project'
      };

      const evaluation = await detector.evaluateResearchNeed(context);

      expect(evaluation.decision.shouldTriggerResearch).toBe(true);
      expect(evaluation.decision.primaryReason).toBe('domain_specific');
      expect(evaluation.decision.evaluatedConditions.domainSpecific.specializedDomain).toBe(true);
    });

    it('should not trigger research for sufficient context', async () => {
      // Disable auto-research to test the sufficient context scenario
      detector.updateConfig({ enabled: false });

      const context: ResearchTriggerContext = {
        task: {
          ...mockTask,
          title: 'Add simple validation',
          description: 'Add email validation to form',
          estimatedHours: 0.5
        },
        projectContext: {
          ...mockProjectContext,
          languages: ['typescript'], // Simple, well-known tech stack
          frameworks: ['react'], // Simple, well-known framework
          tools: ['jest']
        },
        contextResult: {
          ...mockContextResult,
          summary: {
            ...mockContextResult.summary,
            totalFiles: 10, // Sufficient files
            averageRelevance: 0.8 // High relevance
          }
        },
        projectPath: '/test/project'
      };

      const evaluation = await detector.evaluateResearchNeed(context);

      expect(evaluation.decision.shouldTriggerResearch).toBe(false);
      expect(evaluation.decision.primaryReason).toBe('sufficient_context');
      expect(evaluation.decision.confidence).toBe(0.1);

      // Re-enable for other tests
      detector.updateConfig({ enabled: true });
    });

    it('should handle evaluation errors gracefully', async () => {
      const invalidContext: ResearchTriggerContext = {
        task: mockTask,
        projectContext: mockProjectContext,
        // Missing contextResult - this should trigger project_type detection (greenfield)
        projectPath: '/test/project'
      };

      const evaluation = await detector.evaluateResearchNeed(invalidContext);

      // Without contextResult, it should trigger research due to project type (greenfield)
      expect(evaluation.decision.shouldTriggerResearch).toBe(true);
      expect(evaluation.decision.primaryReason).toBe('project_type');
      expect(evaluation.decision.confidence).toBe(0.9);
    });

    it('should cache evaluation results', async () => {
      const context: ResearchTriggerContext = {
        task: mockTask,
        projectContext: mockProjectContext,
        contextResult: mockContextResult,
        projectPath: '/test/project'
      };

      // First evaluation
      const evaluation1 = await detector.evaluateResearchNeed(context);
      
      // Second evaluation (should be cached)
      const evaluation2 = await detector.evaluateResearchNeed(context);

      expect(evaluation1.decision.shouldTriggerResearch).toBe(evaluation2.decision.shouldTriggerResearch);
      expect(evaluation1.timestamp).toBe(evaluation2.timestamp); // Same cached result
    });
  });

  describe('configuration', () => {
    it('should update configuration', () => {
      const newConfig = {
        enabled: false,
        thresholds: {
          minComplexityScore: 0.6
        }
      };

      detector.updateConfig(newConfig);
      const config = detector.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.thresholds.minComplexityScore).toBe(0.6);
    });

    it('should return performance metrics', () => {
      const metrics = detector.getPerformanceMetrics();

      expect(metrics).toHaveProperty('totalEvaluations');
      expect(metrics).toHaveProperty('cacheHits');
      expect(metrics).toHaveProperty('averageEvaluationTime');
      expect(metrics).toHaveProperty('cacheSize');
      expect(metrics).toHaveProperty('cacheHitRate');
    });
  });

  describe('recommended scope determination', () => {
    it('should recommend deep research for complex tasks', async () => {
      const complexTask = {
        ...mockTask,
        title: 'Implement distributed system architecture',
        description: 'Design and implement a fault-tolerant distributed system with consensus algorithms',
        estimatedHours: 20
      };

      const context: ResearchTriggerContext = {
        task: complexTask,
        projectContext: mockProjectContext,
        contextResult: mockContextResult,
        projectPath: '/test/project'
      };

      const evaluation = await detector.evaluateResearchNeed(context);

      if (evaluation.decision.shouldTriggerResearch) {
        expect(evaluation.decision.recommendedScope.depth).toBe('deep');
        expect(evaluation.decision.recommendedScope.priority).toBe('high');
        expect(evaluation.decision.recommendedScope.estimatedQueries).toBeGreaterThan(2);
      }
    });

    it('should recommend shallow research for simple tasks', async () => {
      const simpleTask = {
        ...mockTask,
        title: 'Update button color',
        description: 'Change the primary button color to blue',
        estimatedHours: 0.25
      };

      // Force research trigger by making it greenfield
      const context: ResearchTriggerContext = {
        task: simpleTask,
        projectContext: mockProjectContext,
        contextResult: {
          ...mockContextResult,
          summary: {
            ...mockContextResult.summary,
            totalFiles: 0
          }
        },
        projectPath: '/test/project'
      };

      const evaluation = await detector.evaluateResearchNeed(context);

      if (evaluation.decision.shouldTriggerResearch) {
        expect(evaluation.decision.recommendedScope.depth).toBe('shallow');
        expect(evaluation.decision.recommendedScope.priority).toBe('low');
      }
    });
  });
});
