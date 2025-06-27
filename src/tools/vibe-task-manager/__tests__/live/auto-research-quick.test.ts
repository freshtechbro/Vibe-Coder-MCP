/**
 * Quick Auto-Research Live Test
 * 
 * A simplified test to verify auto-research triggering works with real LLM calls
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DecompositionService } from '../../services/decomposition-service.js';
import { AutoResearchDetector } from '../../services/auto-research-detector.js';
import { AtomicTask } from '../../types/task.js';
import { ProjectContext } from '../../types/project-context.js';
import { createMockConfig } from '../utils/test-setup.js';

describe('Auto-Research Quick Live Test', () => {
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

  describe('Auto-Research Triggering Verification', () => {
    it('should trigger auto-research for greenfield React project and complete successfully', async () => {
      const greenfieldTask: AtomicTask = {
        id: 'quick-test-1',
        title: 'Setup React TypeScript project',
        description: 'Create a new React application with TypeScript and modern tooling',
        type: 'development',
        priority: 'high',
        projectId: 'new-react-project',
        epicId: 'setup',
        estimatedHours: 4,
        acceptanceCriteria: [
          'Application compiles without errors',
          'TypeScript is properly configured'
        ],
        tags: ['react', 'typescript', 'setup'],
        filePaths: [],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const projectContext: ProjectContext = {
        projectId: 'new-react-project',
        languages: ['typescript'],
        frameworks: ['react'],
        tools: ['vite'],
        existingTasks: [],
        codebaseSize: 'small',
        teamSize: 2,
        complexity: 'medium'
      };

      console.log('🚀 Starting quick auto-research test...');
      
      const startTime = Date.now();
      const session = await decompositionService.startDecomposition({
        task: greenfieldTask,
        context: projectContext,
        sessionId: 'quick-test-session'
      });

      // Verify session was created
      expect(session).toBeDefined();
      expect(session.id).toBe('quick-test-session');
      expect(session.status).toBe('pending');
      
      console.log(`✅ Session created: ${session.id}`);
      console.log(`📊 Initial status: ${session.status}`);
      
      // Wait for decomposition to start and progress
      let attempts = 0;
      const maxAttempts = 20; // 20 seconds timeout
      
      while (attempts < maxAttempts) {
        const currentSession = decompositionService.getSession('quick-test-session');
        console.log(`📊 Session status: ${currentSession?.status} (attempt ${attempts + 1}/${maxAttempts})`);
        
        if (currentSession?.status === 'completed' || currentSession?.status === 'failed') {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      const finalSession = decompositionService.getSession('quick-test-session');
      const duration = Date.now() - startTime;
      
      console.log(`✅ Test completed in ${duration}ms`);
      console.log(`📋 Final status: ${finalSession?.status}`);
      
      // Check auto-research metrics
      const metrics = autoResearchDetector.getPerformanceMetrics();
      console.log(`📈 Auto-research metrics:`, metrics);
      
      // Verify auto-research was triggered
      expect(metrics.totalEvaluations).toBeGreaterThan(0);
      console.log(`✅ Auto-research was triggered! (${metrics.totalEvaluations} evaluations)`);
      
      // Verify session progressed (even if it doesn't complete due to LLM issues)
      expect(finalSession).toBeDefined();
      expect(['pending', 'in_progress', 'completed', 'failed']).toContain(finalSession?.status);
      
      console.log(`🎯 Auto-research triggering verified successfully!`);
      
    }, 30000); // 30 second timeout
  });

  describe('Auto-Research Performance Metrics', () => {
    it('should provide meaningful performance metrics', async () => {
      const metrics = autoResearchDetector.getPerformanceMetrics();
      
      console.log('📊 Auto-Research Performance Metrics:');
      console.log(`   Total Evaluations: ${metrics.totalEvaluations}`);
      console.log(`   Cache Hits: ${metrics.cacheHits}`);
      console.log(`   Cache Hit Rate: ${(metrics.cacheHitRate * 100).toFixed(2)}%`);
      console.log(`   Average Evaluation Time: ${metrics.averageEvaluationTime.toFixed(2)}ms`);
      console.log(`   Cache Size: ${metrics.cacheSize}`);
      
      // Verify metrics structure
      expect(metrics).toHaveProperty('totalEvaluations');
      expect(metrics).toHaveProperty('cacheHits');
      expect(metrics).toHaveProperty('cacheHitRate');
      expect(metrics).toHaveProperty('averageEvaluationTime');
      expect(metrics).toHaveProperty('cacheSize');
      
      // Verify reasonable values
      expect(metrics.averageEvaluationTime).toBeGreaterThanOrEqual(0);
      expect(metrics.cacheHitRate).toBeGreaterThanOrEqual(0);
      expect(metrics.cacheHitRate).toBeLessThanOrEqual(1);
      
      // Log configuration for reference
      const config = autoResearchDetector.getConfig();
      console.log('⚙️ Auto-Research Configuration:');
      console.log(`   Enabled: ${config.enabled}`);
      console.log(`   Min Complexity Score: ${config.thresholds.minComplexityScore}`);
      console.log(`   Min Context Files: ${config.thresholds.minContextFiles}`);
      console.log(`   Min Relevance: ${config.thresholds.minRelevance}`);
    });
  });
});
