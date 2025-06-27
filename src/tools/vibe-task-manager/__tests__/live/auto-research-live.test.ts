/**
 * Live Auto-Research Integration Tests
 * 
 * Tests auto-research triggering with actual LLM calls and real project scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DecompositionService } from '../../services/decomposition-service.js';
import { AutoResearchDetector } from '../../services/auto-research-detector.js';
import { AtomicTask } from '../../types/task.js';
import { ProjectContext } from '../../types/project-context.js';
import { createMockConfig } from '../utils/test-setup.js';


describe('Auto-Research Live Integration Tests', () => {
  let decompositionService: DecompositionService;
  let autoResearchDetector: AutoResearchDetector;
  beforeEach(async () => {
    // Create test configuration with real API key from environment
    const config = createMockConfig({
      apiKey: process.env.OPENROUTER_API_KEY || 'test-key',
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
    });
    decompositionService = new DecompositionService(config);
    autoResearchDetector = AutoResearchDetector.getInstance();

    // Clear cache
    autoResearchDetector.clearCache();
  });

  afterEach(async () => {
    autoResearchDetector.clearCache();
  });

  describe('Greenfield Project - Real LLM Integration', () => {
    it('should trigger auto-research for new React TypeScript project', async () => {
      const greenfieldTask: AtomicTask = {
        id: 'live-greenfield-1',
        title: 'Setup new React TypeScript application',
        description: 'Create a modern React application with TypeScript, Vite, and best practices for a SaaS dashboard',
        type: 'development',
        priority: 'high',
        projectId: 'new-saas-dashboard',
        epicId: 'project-setup',
        estimatedHours: 8,
        acceptanceCriteria: [
          'Application compiles without errors',
          'TypeScript configuration is properly set up',
          'Modern development tooling is configured',
          'Project structure follows best practices'
        ],
        tags: ['react', 'typescript', 'vite', 'setup', 'saas'],
        filePaths: [],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const projectContext: ProjectContext = {
        projectId: 'new-saas-dashboard',
        languages: ['typescript'],
        frameworks: ['react'],
        tools: ['vite', 'eslint', 'prettier'],
        existingTasks: [],
        codebaseSize: 'small',
        teamSize: 3,
        complexity: 'medium'
      };

      console.log('🚀 Starting live greenfield project test...');
      
      const startTime = Date.now();
      const session = await decompositionService.startDecomposition({
        task: greenfieldTask,
        context: projectContext,
        sessionId: 'live-greenfield-session'
      });

      expect(session).toBeDefined();
      expect(session.id).toBe('live-greenfield-session');
      
      // Wait for decomposition to complete
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds timeout
      
      while (attempts < maxAttempts) {
        const currentSession = decompositionService.getSession('live-greenfield-session');
        console.log(`📊 Session status: ${currentSession?.status} (attempt ${attempts + 1}/${maxAttempts})`);

        if (currentSession?.status === 'completed' || currentSession?.status === 'failed') {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      const finalSession = decompositionService.getSession('live-greenfield-session');
      const duration = Date.now() - startTime;
      
      console.log(`✅ Decomposition completed in ${duration}ms`);
      console.log(`📋 Final status: ${finalSession?.status}`);

      // Verify the session completed successfully
      expect(finalSession?.status).toBe('completed');
      
      // Check if auto-research was triggered (should be visible in logs)
      const metrics = autoResearchDetector.getPerformanceMetrics();
      expect(metrics.totalEvaluations).toBeGreaterThan(0);
      
      console.log(`📈 Auto-research metrics:`, metrics);
      
    }, 60000); // 60 second timeout for live test
  });

  describe('Complex Architecture Task - Real LLM Integration', () => {
    it('should trigger auto-research for microservices architecture task', async () => {
      const complexTask: AtomicTask = {
        id: 'live-complex-1',
        title: 'Design microservices architecture',
        description: 'Design and implement a scalable microservices architecture with service discovery, API gateway, load balancing, and fault tolerance for a high-traffic e-commerce platform',
        type: 'development',
        priority: 'high',
        projectId: 'ecommerce-platform',
        epicId: 'architecture-redesign',
        estimatedHours: 24,
        acceptanceCriteria: [
          'Services are independently deployable',
          'API gateway routes requests correctly',
          'Service discovery mechanism is implemented',
          'Load balancing distributes traffic effectively',
          'Circuit breaker pattern prevents cascade failures'
        ],
        tags: ['architecture', 'microservices', 'scalability', 'distributed-systems'],
        filePaths: ['src/services/', 'src/gateway/', 'infrastructure/'],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const projectContext: ProjectContext = {
        projectId: 'ecommerce-platform',
        languages: ['typescript', 'go'],
        frameworks: ['express', 'gin', 'kubernetes'],
        tools: ['docker', 'helm', 'prometheus', 'grafana'],
        existingTasks: [],
        codebaseSize: 'large',
        teamSize: 8,
        complexity: 'high'
      };

      console.log('🏗️ Starting live complex architecture test...');
      
      const startTime = Date.now();
      const session = await decompositionService.startDecomposition({
        task: complexTask,
        context: projectContext,
        sessionId: 'live-complex-session'
      });

      expect(session).toBeDefined();
      expect(session.id).toBe('live-complex-session');
      
      // Wait for decomposition to complete
      let attempts = 0;
      const maxAttempts = 45; // 45 seconds timeout for complex task
      
      while (attempts < maxAttempts) {
        const currentSession = decompositionService.getSession('live-complex-session');
        console.log(`📊 Session status: ${currentSession?.status} (attempt ${attempts + 1}/${maxAttempts})`);

        if (currentSession?.status === 'completed' || currentSession?.status === 'failed') {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      const finalSession = decompositionService.getSession('live-complex-session');
      const duration = Date.now() - startTime;

      console.log(`✅ Decomposition completed in ${duration}ms`);
      console.log(`📋 Final status: ${finalSession?.status}`);

      // Verify the session completed successfully
      expect(finalSession?.status).toBe('completed');
      
      // Check auto-research metrics
      const metrics = autoResearchDetector.getPerformanceMetrics();
      expect(metrics.totalEvaluations).toBeGreaterThan(0);
      
      console.log(`📈 Auto-research metrics:`, metrics);
      
    }, 90000); // 90 second timeout for complex test
  });

  describe('Blockchain Domain-Specific Task - Real LLM Integration', () => {
    it('should trigger auto-research for blockchain smart contract development', async () => {
      const blockchainTask: AtomicTask = {
        id: 'live-blockchain-1',
        title: 'Implement DeFi lending protocol smart contracts',
        description: 'Develop smart contracts for a decentralized lending protocol with collateral management, interest rate calculations, liquidation mechanisms, and governance token integration on Ethereum blockchain',
        type: 'development',
        priority: 'high',
        projectId: 'defi-lending-protocol',
        epicId: 'smart-contracts',
        estimatedHours: 16,
        acceptanceCriteria: [
          'Lending pool contracts are secure and auditable',
          'Collateral management prevents under-collateralization',
          'Interest rates adjust dynamically based on utilization',
          'Liquidation mechanism protects protocol solvency',
          'Governance token holders can vote on protocol parameters'
        ],
        tags: ['blockchain', 'defi', 'smart-contracts', 'ethereum', 'solidity'],
        filePaths: ['contracts/', 'test/', 'scripts/'],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const projectContext: ProjectContext = {
        projectId: 'defi-lending-protocol',
        languages: ['solidity', 'typescript', 'javascript'],
        frameworks: ['hardhat', 'ethers', 'openzeppelin'],
        tools: ['truffle', 'ganache', 'slither', 'mythril'],
        existingTasks: [],
        codebaseSize: 'medium',
        teamSize: 4,
        complexity: 'high'
      };

      console.log('🔗 Starting live blockchain domain test...');
      
      const startTime = Date.now();
      const session = await decompositionService.startDecomposition({
        task: blockchainTask,
        context: projectContext,
        sessionId: 'live-blockchain-session'
      });

      expect(session).toBeDefined();
      expect(session.id).toBe('live-blockchain-session');
      
      // Wait for decomposition to complete
      let attempts = 0;
      const maxAttempts = 45; // 45 seconds timeout
      
      while (attempts < maxAttempts) {
        const currentSession = decompositionService.getSession('live-blockchain-session');
        console.log(`📊 Session status: ${currentSession?.status} (attempt ${attempts + 1}/${maxAttempts})`);

        if (currentSession?.status === 'completed' || currentSession?.status === 'failed') {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      const finalSession = decompositionService.getSession('live-blockchain-session');
      const duration = Date.now() - startTime;

      console.log(`✅ Decomposition completed in ${duration}ms`);
      console.log(`📋 Final status: ${finalSession?.status}`);

      // Verify the session completed successfully
      expect(finalSession?.status).toBe('completed');
      
      // Check auto-research metrics
      const metrics = autoResearchDetector.getPerformanceMetrics();
      expect(metrics.totalEvaluations).toBeGreaterThan(0);
      
      console.log(`📈 Auto-research metrics:`, metrics);
      
    }, 90000); // 90 second timeout
  });

  describe('Auto-Research Performance Analysis', () => {
    it('should provide comprehensive performance metrics after live tests', async () => {
      const metrics = autoResearchDetector.getPerformanceMetrics();
      
      console.log('📊 Final Auto-Research Performance Metrics:');
      console.log(`   Total Evaluations: ${metrics.totalEvaluations}`);
      console.log(`   Cache Hits: ${metrics.cacheHits}`);
      console.log(`   Cache Hit Rate: ${(metrics.cacheHitRate * 100).toFixed(2)}%`);
      console.log(`   Average Evaluation Time: ${metrics.averageEvaluationTime.toFixed(2)}ms`);
      console.log(`   Cache Size: ${metrics.cacheSize}`);
      
      // Verify metrics are reasonable
      expect(metrics.totalEvaluations).toBeGreaterThan(0);
      expect(metrics.averageEvaluationTime).toBeGreaterThan(0);
      expect(metrics.averageEvaluationTime).toBeLessThan(1000); // Should be under 1 second
      expect(metrics.cacheHitRate).toBeGreaterThanOrEqual(0);
      expect(metrics.cacheHitRate).toBeLessThanOrEqual(1);
      
      // Log configuration for reference
      const config = autoResearchDetector.getConfig();
      console.log('⚙️ Auto-Research Configuration:');
      console.log(`   Enabled: ${config.enabled}`);
      console.log(`   Min Complexity Score: ${config.thresholds.minComplexityScore}`);
      console.log(`   Min Context Files: ${config.thresholds.minContextFiles}`);
      console.log(`   Min Relevance: ${config.thresholds.minRelevance}`);
      console.log(`   Caching Enabled: ${config.performance.enableCaching}`);
    });
  });
});
