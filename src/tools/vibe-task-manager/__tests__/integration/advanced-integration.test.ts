/**
 * Advanced Integration Tests
 * Comprehensive end-to-end testing with performance metrics and cross-tool validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vibeTaskManagerExecutor } from '../../index.js';
import { PerformanceMonitor } from '../../utils/performance-monitor.js';
import { ExecutionCoordinator } from '../../services/execution-coordinator.js';
import { TaskManagerMemoryManager } from '../../utils/memory-manager-integration.js';
import { getVibeTaskManagerOutputDir } from '../../utils/config-loader.js';
import { promises as fs } from 'fs';
import path from 'path';

describe('Advanced Integration Testing', () => {
  let performanceMonitor: PerformanceMonitor;
  let executionCoordinator: ExecutionCoordinator;
  let memoryManager: TaskManagerMemoryManager;
  let outputDir: string;
  let mockConfig: unknown;

  beforeEach(async () => {
    // Initialize output directory
    outputDir = getVibeTaskManagerOutputDir();
    await fs.mkdir(outputDir, { recursive: true });

    // Initialize memory manager
    memoryManager = TaskManagerMemoryManager.getInstance({
      enabled: true,
      maxMemoryPercentage: 0.3,
      monitorInterval: 5000,
      autoManage: true,
      pruneThreshold: 0.6,
      prunePercentage: 0.4
    });

    // Initialize performance monitor
    performanceMonitor = PerformanceMonitor.getInstance({
      enabled: true,
      metricsInterval: 1000,
      enableAlerts: true,
      performanceThresholds: {
        maxResponseTime: 100, // More lenient for integration tests
        maxMemoryUsage: 200,
        maxCpuUsage: 80
      },
      bottleneckDetection: {
        enabled: true,
        analysisInterval: 5000,
        minSampleSize: 3
      },
      regressionDetection: {
        enabled: true,
        baselineWindow: 1,
        comparisonWindow: 0.5,
        significanceThreshold: 15
      }
    });

    // Initialize execution coordinator
    executionCoordinator = await ExecutionCoordinator.getInstance();


    // Create mock config for task manager
    mockConfig = {
      apiKey: 'test-key',
      baseUrl: 'https://test.openrouter.ai',
      model: 'gemini-2.0-flash-exp'
    };
  });

  afterEach(async () => {
    performanceMonitor.shutdown();
    await executionCoordinator.stop();
    memoryManager.shutdown();
  });

  describe('End-to-End Workflow Validation', () => {
    it('should complete basic task manager operations with performance tracking', async () => {
      const startTime = Date.now();

      // Track operation performance
      const operationId = 'e2e-basic-operations';
      performanceMonitor.startOperation(operationId);

      try {
        // Step 1: Test project creation
        const projectResult = await vibeTaskManagerExecutor({
          command: 'create',
          projectName: 'Advanced Integration Test Project',
          description: 'Testing end-to-end workflow with performance metrics',
          options: {
            techStack: ['typescript', 'node.js', 'testing']
          }
        }, mockConfig);

        expect(projectResult.content).toBeDefined();
        expect(projectResult.content[0]).toHaveProperty('text');
        expect(projectResult.content[0].text).toContain('Project creation started');

        // Step 2: Test project listing
        const listResult = await vibeTaskManagerExecutor({
          command: 'list'
        }, mockConfig);

        expect(listResult.content).toBeDefined();
        expect(listResult.content[0]).toHaveProperty('text');

        // Step 3: Test natural language processing
        const nlResult = await vibeTaskManagerExecutor({
          input: 'Create a new project for building a todo app'
        }, mockConfig);

        expect(nlResult.content).toBeDefined();
        expect(nlResult.content[0]).toHaveProperty('text');

        // Step 4: Verify output directory exists
        const outputExists = await fs.access(outputDir).then(() => true).catch(() => false);
        expect(outputExists).toBe(true);

      } finally {
        const duration = performanceMonitor.endOperation(operationId);
        const totalTime = Date.now() - startTime;

        // Performance assertions
        expect(duration).toBeGreaterThan(0);
        expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
      }
    });

    it('should handle concurrent task manager operations', async () => {
      const operationId = 'concurrent-processing';
      performanceMonitor.startOperation(operationId);

      try {
        // Create multiple operations concurrently
        const operationPromises = Array.from({ length: 3 }, (_, i) =>
          vibeTaskManagerExecutor({
            command: 'create',
            projectName: `Concurrent Project ${i + 1}`,
            description: `Testing concurrent processing ${i + 1}`,
            options: {
              techStack: ['typescript', 'testing']
            }
          }, mockConfig)
        );

        const results = await Promise.all(operationPromises);

        // Verify all operations completed
        for (const result of results) {
          expect(result.content).toBeDefined();
          expect(result.content[0]).toHaveProperty('text');
        }

        // Test concurrent list operations
        const listPromises = Array.from({ length: 2 }, () =>
          vibeTaskManagerExecutor({
            command: 'list'
          }, mockConfig)
        );

        const listResults = await Promise.all(listPromises);

        // Verify all list operations succeeded
        for (const result of listResults) {
          expect(result.content).toBeDefined();
          expect(result.content[0]).toHaveProperty('text');
        }

      } finally {
        const duration = performanceMonitor.endOperation(operationId);
        expect(duration).toBeGreaterThan(0);
      }
    });
  });

  describe('Performance Metrics Under Load', () => {
    it('should maintain performance targets under sustained load', async () => {
      const operationId = 'load-testing';
      performanceMonitor.startOperation(operationId);

      const initialMetrics = performanceMonitor.getCurrentRealTimeMetrics();
      const loadOperations: Promise<Record<string, unknown>>[] = [];

      try {
        // Generate sustained load
        for (let i = 0; i < 5; i++) {
          loadOperations.push(
            vibeTaskManagerExecutor({
              command: 'create',
              projectName: `Load Test Project ${i}`,
              description: 'Performance testing under load',
              options: {
                techStack: ['typescript']
              }
            }, mockConfig)
          );
        }

        // Wait for all operations to complete
        const results = await Promise.all(loadOperations);

        // Verify all operations completed
        for (const result of results) {
          expect(result.content).toBeDefined();
        }

        // Check performance metrics
        const finalMetrics = performanceMonitor.getCurrentRealTimeMetrics();
        
        // Memory usage should not have increased dramatically
        const memoryIncrease = finalMetrics.memoryUsage - initialMetrics.memoryUsage;
        expect(memoryIncrease).toBeLessThan(100); // Less than 100MB increase

        // Response time should be reasonable
        expect(finalMetrics.responseTime).toBeLessThan(200); // Less than 200ms

      } finally {
        const duration = performanceMonitor.endOperation(operationId);
        expect(duration).toBeGreaterThan(0);
      }
    });

    it('should auto-optimize under performance pressure', async () => {
      // Simulate high load conditions
      const mockMetrics = {
        responseTime: 150, // Above threshold
        memoryUsage: 180, // High usage
        cpuUsage: 85, // High CPU
        cacheHitRate: 0.5, // Low cache hit rate
        activeConnections: 15,
        queueLength: 25, // High queue length
        timestamp: Date.now()
      };

      vi.spyOn(performanceMonitor, 'getCurrentRealTimeMetrics').mockReturnValue(mockMetrics);

      // Trigger auto-optimization
      const optimizationResult = await performanceMonitor.autoOptimize();

      // Verify optimizations were applied
      expect(optimizationResult.applied.length).toBeGreaterThan(0);
      expect(optimizationResult.applied).toContain('memory-optimization');
      expect(optimizationResult.applied).toContain('cache-optimization');
      expect(optimizationResult.applied).toContain('concurrency-optimization');
    });
  });

  describe('Cross-Tool Integration Verification', () => {
    it('should integrate with system components correctly', async () => {
      // Test basic task manager functionality
      const basicResult = await vibeTaskManagerExecutor({
        command: 'list'
      }, mockConfig);

      expect(basicResult.content).toBeDefined();
      expect(basicResult.content[0]).toHaveProperty('text');

      // Test natural language processing
      const nlResult = await vibeTaskManagerExecutor({
        input: 'Show me all my projects'
      }, mockConfig);

      expect(nlResult.content).toBeDefined();
      expect(nlResult.content[0]).toHaveProperty('text');

      // Verify no memory leaks or excessive resource usage
      const memoryStats = memoryManager.getCurrentMemoryStats();
      expect(memoryStats).toBeDefined();
      if (memoryStats) {
        expect(memoryStats.percentageUsed).toBeLessThan(0.8); // Less than 80% memory usage
      }

      // Verify performance monitoring is working
      const performanceSummary = performanceMonitor.getPerformanceSummary(5);
      expect(performanceSummary).toBeDefined();
      expect(performanceSummary).toHaveProperty('averageResponseTime');
    });

    it('should maintain output directory structure integrity', async () => {
      // Create a project to generate outputs
      const projectResult = await vibeTaskManagerExecutor({
        command: 'create',
        projectName: 'Output Structure Test',
        description: 'Testing output directory structure',
        options: {
          techStack: ['typescript']
        }
      }, mockConfig);

      expect(projectResult.content).toBeDefined();

      // Verify output directory structure
      const outputExists = await fs.access(outputDir).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);

      // Verify no unauthorized file access outside output directory
      const parentDir = path.dirname(outputDir);
      const outputDirName = path.basename(outputDir);
      const parentContents = await fs.readdir(parentDir);

      // Output directory should exist in parent
      expect(parentContents).toContain(outputDirName);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle validation errors gracefully', async () => {
      // Test invalid command
      const invalidResult = await vibeTaskManagerExecutor({
        command: 'invalid' as Record<string, unknown>
      }, mockConfig);

      expect(invalidResult.content).toBeDefined();
      expect(invalidResult.isError).toBe(true);
      expect(invalidResult.content[0].text).toContain('Invalid enum value');

      // Test missing required parameters
      const missingParamsResult = await vibeTaskManagerExecutor({
        command: 'create'
        // Missing projectName and description
      }, mockConfig);

      expect(missingParamsResult.content).toBeDefined();
      expect(missingParamsResult.isError).toBe(true);
      expect(missingParamsResult.content[0].text).toContain('required');

      // Test malformed input
      const malformedResult = await vibeTaskManagerExecutor({
        command: 'create',
        projectName: '', // Empty name
        description: 'Test'
      }, mockConfig);

      expect(malformedResult.content).toBeDefined();
      // Should handle gracefully without crashing
    });
  });
  
  afterAll(() => {
    // Clean up all mock queues
    clearAllMockQueues();
  });
});
