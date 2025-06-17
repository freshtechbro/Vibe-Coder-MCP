/**
 * Simplified Auto-Research Integration Tests
 * 
 * Tests the auto-research triggering logic without complex dependencies
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AutoResearchDetector } from '../../services/auto-research-detector.js';
import { AtomicTask } from '../../types/task.js';
import { ProjectContext } from '../../core/atomic-detector.js';
import { ContextResult } from '../../services/context-enrichment-service.js';
import { ResearchTriggerContext } from '../../types/research-types.js';

describe('Auto-Research Triggering - Simplified Integration', () => {
  let detector: AutoResearchDetector;

  beforeEach(() => {
    detector = AutoResearchDetector.getInstance();
    detector.clearCache();
  });

  afterEach(() => {
    detector.clearCache();
  });

  describe('Trigger Condition Integration Tests', () => {
    it('should correctly prioritize project type over other triggers', async () => {
      // Create a task that would trigger multiple conditions
      const task: AtomicTask = {
        id: 'priority-test-1',
        title: 'Implement complex microservices architecture',
        description: 'Design and implement a scalable blockchain-based microservices architecture',
        type: 'development',
        priority: 'high',
        projectId: 'new-project',
        epicId: 'test-epic',
        estimatedHours: 20, // High complexity
        acceptanceCriteria: ['System should be scalable'],
        tags: ['architecture', 'microservices', 'blockchain'],
        filePaths: [],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const projectContext: ProjectContext = {
        projectId: 'new-project',
        languages: ['solidity', 'typescript'], // Specialized domain
        frameworks: ['hardhat', 'express'],
        tools: ['docker'],
        existingTasks: [],
        codebaseSize: 'small',
        teamSize: 3,
        complexity: 'high'
      };

      // Greenfield project (no files)
      const contextResult: ContextResult = {
        contextFiles: [],
        summary: {
          totalFiles: 0, // Greenfield trigger
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

      const context: ResearchTriggerContext = {
        task,
        projectContext,
        contextResult,
        projectPath: '/test/project'
      };

      const evaluation = await detector.evaluateResearchNeed(context);

      // Should trigger project_type (Priority 1) even though task complexity and domain-specific would also trigger
      expect(evaluation.decision.shouldTriggerResearch).toBe(true);
      expect(evaluation.decision.primaryReason).toBe('project_type');
      expect(evaluation.decision.confidence).toBeGreaterThan(0.7);
      expect(evaluation.decision.recommendedScope.depth).toBe('deep');
    });

    it('should trigger task complexity when project is not greenfield', async () => {
      const complexTask: AtomicTask = {
        id: 'complexity-test-1',
        title: 'Implement distributed system architecture',
        description: 'Design scalable microservices with load balancing and fault tolerance',
        type: 'development',
        priority: 'high',
        projectId: 'existing-project',
        epicId: 'test-epic',
        estimatedHours: 15,
        acceptanceCriteria: ['System should handle high load'],
        tags: ['architecture', 'distributed', 'scalability'],
        filePaths: [],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const projectContext: ProjectContext = {
        projectId: 'existing-project',
        languages: ['typescript'],
        frameworks: ['express'],
        tools: ['docker'],
        existingTasks: [],
        codebaseSize: 'medium',
        teamSize: 4,
        complexity: 'high'
      };

      // Existing project with sufficient files
      const contextResult: ContextResult = {
        contextFiles: [],
        summary: {
          totalFiles: 15, // Not greenfield
          totalSize: 5000,
          averageRelevance: 0.7, // Good relevance
          topFileTypes: ['.ts'],
          gatheringTime: 200
        },
        metrics: {
          searchTime: 100,
          readTime: 80,
          scoringTime: 20,
          totalTime: 200,
          cacheHitRate: 0
        }
      };

      const context: ResearchTriggerContext = {
        task: complexTask,
        projectContext,
        contextResult,
        projectPath: '/test/project'
      };

      const evaluation = await detector.evaluateResearchNeed(context);

      // Should trigger task_complexity (Priority 2)
      expect(evaluation.decision.shouldTriggerResearch).toBe(true);
      expect(evaluation.decision.primaryReason).toBe('task_complexity');
      expect(evaluation.decision.evaluatedConditions.taskComplexity.complexityScore).toBeGreaterThan(0.4);
      expect(evaluation.decision.evaluatedConditions.taskComplexity.complexityIndicators.length).toBeGreaterThan(0);
    });

    it('should trigger knowledge gap when context is insufficient', async () => {
      const task: AtomicTask = {
        id: 'knowledge-gap-test-1',
        title: 'Add user authentication',
        description: 'Implement user login and registration',
        type: 'development',
        priority: 'medium',
        projectId: 'existing-project',
        epicId: 'test-epic',
        estimatedHours: 4, // Not high complexity
        acceptanceCriteria: ['Users can login securely'],
        tags: ['auth', 'security'],
        filePaths: [],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const projectContext: ProjectContext = {
        projectId: 'existing-project',
        languages: ['javascript'], // Not specialized
        frameworks: ['express'],
        tools: ['npm'],
        existingTasks: [],
        codebaseSize: 'medium',
        teamSize: 2,
        complexity: 'medium'
      };

      // Insufficient context
      const contextResult: ContextResult = {
        contextFiles: [],
        summary: {
          totalFiles: 2, // Too few files
          totalSize: 300, // Too small
          averageRelevance: 0.3, // Low relevance
          topFileTypes: ['.js'],
          gatheringTime: 50
        },
        metrics: {
          searchTime: 30,
          readTime: 15,
          scoringTime: 5,
          totalTime: 50,
          cacheHitRate: 0
        }
      };

      const context: ResearchTriggerContext = {
        task,
        projectContext,
        contextResult,
        projectPath: '/test/project'
      };

      const evaluation = await detector.evaluateResearchNeed(context);

      // Should trigger knowledge_gap (Priority 3)
      expect(evaluation.decision.shouldTriggerResearch).toBe(true);
      expect(evaluation.decision.primaryReason).toBe('knowledge_gap');
      expect(evaluation.decision.evaluatedConditions.knowledgeGap.hasInsufficientContext).toBe(true);
    });

    it('should trigger domain-specific for specialized technologies', async () => {
      const blockchainTask: AtomicTask = {
        id: 'domain-test-1',
        title: 'Create blockchain NFT marketplace',
        description: 'Build a blockchain marketplace for trading NFTs using smart contracts',
        type: 'development',
        priority: 'medium',
        projectId: 'existing-project',
        epicId: 'test-epic',
        estimatedHours: 6, // Moderate complexity
        acceptanceCriteria: ['Users can trade NFTs'],
        tags: ['blockchain', 'nft', 'marketplace'],
        filePaths: [],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const projectContext: ProjectContext = {
        projectId: 'existing-project',
        languages: ['solidity', 'javascript'], // Specialized domain
        frameworks: ['hardhat', 'web3'],
        tools: ['truffle'],
        existingTasks: [],
        codebaseSize: 'medium',
        teamSize: 3,
        complexity: 'medium'
      };

      // Moderate context (to avoid knowledge gap trigger but still allow domain-specific)
      const contextResult: ContextResult = {
        contextFiles: [],
        summary: {
          totalFiles: 6, // Just above knowledge gap threshold
          totalSize: 2000, // Moderate size
          averageRelevance: 0.65, // Just above threshold
          topFileTypes: ['.sol', '.js'],
          gatheringTime: 150
        },
        metrics: {
          searchTime: 80,
          readTime: 50,
          scoringTime: 20,
          totalTime: 150,
          cacheHitRate: 0
        }
      };

      const context: ResearchTriggerContext = {
        task: blockchainTask,
        projectContext,
        contextResult,
        projectPath: '/test/project'
      };

      const evaluation = await detector.evaluateResearchNeed(context);

      // Should trigger domain_specific (Priority 4)
      expect(evaluation.decision.shouldTriggerResearch).toBe(true);
      expect(evaluation.decision.primaryReason).toBe('domain_specific');
      expect(evaluation.decision.evaluatedConditions.domainSpecific.specializedDomain).toBe(true);
    });

    it('should not trigger research when context is sufficient', async () => {
      const simpleTask: AtomicTask = {
        id: 'no-trigger-test-1',
        title: 'Update button styling',
        description: 'Change the color of the submit button',
        type: 'development',
        priority: 'low',
        projectId: 'existing-project',
        epicId: 'test-epic',
        estimatedHours: 0.5, // Low complexity
        acceptanceCriteria: ['Button has new color'],
        tags: ['ui', 'styling'],
        filePaths: [],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const projectContext: ProjectContext = {
        projectId: 'existing-project',
        languages: ['typescript'], // Standard tech
        frameworks: ['react'],
        tools: ['webpack'],
        existingTasks: [],
        codebaseSize: 'large',
        teamSize: 5,
        complexity: 'low'
      };

      // Excellent context
      const contextResult: ContextResult = {
        contextFiles: [],
        summary: {
          totalFiles: 25, // Many files
          totalSize: 15000, // Large size
          averageRelevance: 0.9, // High relevance
          topFileTypes: ['.tsx', '.ts'],
          gatheringTime: 300
        },
        metrics: {
          searchTime: 150,
          readTime: 120,
          scoringTime: 30,
          totalTime: 300,
          cacheHitRate: 0
        }
      };

      const context: ResearchTriggerContext = {
        task: simpleTask,
        projectContext,
        contextResult,
        projectPath: '/test/project'
      };

      const evaluation = await detector.evaluateResearchNeed(context);

      // Should NOT trigger research
      expect(evaluation.decision.shouldTriggerResearch).toBe(false);
      expect(evaluation.decision.primaryReason).toBe('sufficient_context');
      expect(evaluation.decision.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Performance and Configuration', () => {
    it('should respect configuration settings', () => {
      const initialConfig = detector.getConfig();
      
      // Update configuration
      detector.updateConfig({
        enabled: false,
        thresholds: {
          minComplexityScore: 0.8
        }
      });

      const updatedConfig = detector.getConfig();
      expect(updatedConfig.enabled).toBe(false);
      expect(updatedConfig.thresholds.minComplexityScore).toBe(0.8);

      // Restore original config
      detector.updateConfig(initialConfig);
    });

    it('should track performance metrics', async () => {
      const initialMetrics = detector.getPerformanceMetrics();
      const initialEvaluations = initialMetrics.totalEvaluations;

      // Perform an evaluation
      const context: ResearchTriggerContext = {
        task: {
          id: 'metrics-test',
          title: 'Test task',
          description: 'Simple test',
          type: 'development',
          priority: 'low',
          projectId: 'test',
          epicId: 'test',
          estimatedHours: 1,
          acceptanceCriteria: ['Complete'],
          tags: [],
          filePaths: [],
          dependencies: [],
          createdAt: new Date(),
          updatedAt: new Date()
        },
        projectContext: {
          projectId: 'test',
          languages: ['javascript'],
          frameworks: [],
          tools: [],
          existingTasks: [],
          codebaseSize: 'small',
          teamSize: 1,
          complexity: 'low'
        },
        contextResult: {
          contextFiles: [],
          summary: {
            totalFiles: 5,
            totalSize: 1000,
            averageRelevance: 0.7,
            topFileTypes: ['.js'],
            gatheringTime: 100
          },
          metrics: {
            searchTime: 50,
            readTime: 30,
            scoringTime: 20,
            totalTime: 100,
            cacheHitRate: 0
          }
        },
        projectPath: '/test'
      };

      await detector.evaluateResearchNeed(context);

      const finalMetrics = detector.getPerformanceMetrics();
      expect(finalMetrics.totalEvaluations).toBe(initialEvaluations + 1);
      expect(finalMetrics.averageEvaluationTime).toBeGreaterThan(0);
    });
  });
});
