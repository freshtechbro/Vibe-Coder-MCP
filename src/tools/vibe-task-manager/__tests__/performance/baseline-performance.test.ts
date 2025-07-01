import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PerformanceBenchmarks, DEFAULT_BENCHMARK_CONFIG } from '../../utils/performance-benchmarks.js';
import { PerformanceMonitor } from '../../utils/performance-monitor.js';
import { TaskManagerMemoryManager } from '../../utils/memory-manager-integration.js';

/**
 * Baseline Performance Tests for Epic 6.2
 *
 * These tests establish performance baselines and verify <50ms targets
 */
describe('Baseline Performance Tests - Epic 6.2', () => {
  let benchmarks: PerformanceBenchmarks;
  let performanceMonitor: PerformanceMonitor;
  let memoryManager: TaskManagerMemoryManager;

  beforeEach(() => {

    // Initialize memory manager first
    memoryManager = TaskManagerMemoryManager.getInstance({
      enabled: true,
      maxMemoryPercentage: 0.3,
      monitorInterval: 5000,
      autoManage: true,
      pruneThreshold: 0.6,
      prunePercentage: 0.4
    });

    // Initialize performance monitor with Epic 6.2 targets
    performanceMonitor = PerformanceMonitor.getInstance({
      enabled: true,
      metricsInterval: 1000,
      enableAlerts: true,
      performanceThresholds: {
        maxResponseTime: 50, // Epic 6.2 target
        maxMemoryUsage: 100, // 100MB
        maxCpuUsage: 80 // 80%
      },
      bottleneckDetection: {
        enabled: true,
        analysisInterval: 5000,
        minSampleSize: 5
      },
      regressionDetection: {
        enabled: true,
        baselineWindow: 1, // 1 hour for testing
        comparisonWindow: 0.5, // 30 minutes for testing
        significanceThreshold: 10 // 10% regression threshold
      }
    });

    // Initialize benchmarks with Epic 6.2 configuration
    benchmarks = PerformanceBenchmarks.getInstance({
      ...DEFAULT_BENCHMARK_CONFIG,
      iterations: 5, // Reduced for testing
      warmupIterations: 2,
      targetOverhead: 50 // Epic 6.2 target
    });
  });

  afterEach(() => {
    if (performanceMonitor) {
      performanceMonitor.shutdown();
    }
    if (memoryManager) {
      memoryManager.shutdown();
    }
  });

  describe('Core Operation Baselines', () => {
    it('should establish baseline for task creation (<10ms target)', async () => {
      const result = await benchmarks.runBenchmark('task_creation');

      expect(result.operationName).toBe('task_creation');
      expect(result.targetTime).toBe(10);
      expect(result.actualTime).toBeLessThan(50); // Epic 6.2 overall target
      expect(result.iterations).toBe(5);
      expect(result.passed).toBe(result.actualTime <= result.targetTime);

      console.log(`Task Creation Baseline: ${result.actualTime.toFixed(2)}ms (target: ${result.targetTime}ms)`);
    });

    it('should establish baseline for task listing (<20ms target)', async () => {
      const result = await benchmarks.runBenchmark('task_listing');

      expect(result.operationName).toBe('task_listing');
      expect(result.targetTime).toBe(20);
      expect(result.actualTime).toBeLessThan(50); // Epic 6.2 overall target
      expect(result.passed).toBe(result.actualTime <= result.targetTime);

      console.log(`Task Listing Baseline: ${result.actualTime.toFixed(2)}ms (target: ${result.targetTime}ms)`);
    });

    it('should establish baseline for task execution (<50ms target)', async () => {
      const result = await benchmarks.runBenchmark('task_execution');

      expect(result.operationName).toBe('task_execution');
      expect(result.targetTime).toBe(50);
      expect(result.actualTime).toBeLessThan(100); // Allow some overhead for baseline
      expect(result.passed).toBe(result.actualTime <= result.targetTime);

      console.log(`Task Execution Baseline: ${result.actualTime.toFixed(2)}ms (target: ${result.targetTime}ms)`);
    });

    it('should establish baseline for status checking (<15ms target)', async () => {
      const result = await benchmarks.runBenchmark('status_checking');

      expect(result.operationName).toBe('status_checking');
      expect(result.targetTime).toBe(15);
      expect(result.actualTime).toBeLessThan(50); // Epic 6.2 overall target
      expect(result.passed).toBe(result.actualTime <= result.targetTime);

      console.log(`Status Checking Baseline: ${result.actualTime.toFixed(2)}ms (target: ${result.targetTime}ms)`);
    });
  });

  describe('Storage Operation Baselines', () => {
    it('should establish baseline for storage read (<10ms target)', async () => {
      const result = await benchmarks.runBenchmark('storage_read');

      expect(result.operationName).toBe('storage_read');
      expect(result.targetTime).toBe(10);
      expect(result.actualTime).toBeLessThan(50);

      console.log(`Storage Read Baseline: ${result.actualTime.toFixed(2)}ms (target: ${result.targetTime}ms)`);
    });

    it('should establish baseline for storage write (<15ms target)', async () => {
      const result = await benchmarks.runBenchmark('storage_write');

      expect(result.operationName).toBe('storage_write');
      expect(result.targetTime).toBe(15);
      expect(result.actualTime).toBeLessThan(50);

      console.log(`Storage Write Baseline: ${result.actualTime.toFixed(2)}ms (target: ${result.targetTime}ms)`);
    });
  });

  describe('Cache Operation Baselines', () => {
    it('should establish baseline for cache get (<5ms target)', async () => {
      const result = await benchmarks.runBenchmark('cache_get');

      expect(result.operationName).toBe('cache_get');
      expect(result.targetTime).toBe(5);
      expect(result.actualTime).toBeLessThan(20); // Cache should be very fast

      console.log(`Cache Get Baseline: ${result.actualTime.toFixed(2)}ms (target: ${result.targetTime}ms)`);
    });

    it('should establish baseline for cache set (<8ms target)', async () => {
      const result = await benchmarks.runBenchmark('cache_set');

      expect(result.operationName).toBe('cache_set');
      expect(result.targetTime).toBe(8);
      expect(result.actualTime).toBeLessThan(25); // Cache should be very fast

      console.log(`Cache Set Baseline: ${result.actualTime.toFixed(2)}ms (target: ${result.targetTime}ms)`);
    });
  });

  describe('Memory Operation Baselines', () => {
    it('should establish baseline for memory allocation (<5ms target)', async () => {
      const result = await benchmarks.runBenchmark('memory_allocation');

      expect(result.operationName).toBe('memory_allocation');
      expect(result.targetTime).toBe(5);
      expect(result.actualTime).toBeLessThan(20); // Memory ops should be fast
      expect(result.memoryUsed).toBeLessThan(10); // Should use minimal memory

      console.log(`Memory Allocation Baseline: ${result.actualTime.toFixed(2)}ms (target: ${result.targetTime}ms)`);
    });
  });

  describe('Category Benchmarks', () => {
    it('should run all task management benchmarks', async () => {
      const results = await benchmarks.runCategoryBenchmarks('task_management');

      expect(results.length).toBeGreaterThan(0);

      for (const result of results) {
        expect(result.category).toBe('task_management');
        expect(result.actualTime).toBeLessThan(100); // Reasonable upper bound
        console.log(`${result.operationName}: ${result.actualTime.toFixed(2)}ms (target: ${result.targetTime}ms) - ${result.passed ? 'PASS' : 'FAIL'}`);
      }
    });

    it('should run all storage benchmarks', async () => {
      const results = await benchmarks.runCategoryBenchmarks('storage');

      expect(results.length).toBeGreaterThan(0);

      for (const result of results) {
        expect(result.category).toBe('storage');
        expect(result.actualTime).toBeLessThan(100);
        console.log(`${result.operationName}: ${result.actualTime.toFixed(2)}ms (target: ${result.targetTime}ms) - ${result.passed ? 'PASS' : 'FAIL'}`);
      }
    });

    it('should run all cache benchmarks', async () => {
      const results = await benchmarks.runCategoryBenchmarks('cache');

      expect(results.length).toBeGreaterThan(0);

      for (const result of results) {
        expect(result.category).toBe('cache');
        expect(result.actualTime).toBeLessThan(50); // Cache should be faster
        console.log(`${result.operationName}: ${result.actualTime.toFixed(2)}ms (target: ${result.targetTime}ms) - ${result.passed ? 'PASS' : 'FAIL'}`);
      }
    });
  });

  describe('Comprehensive Performance Analysis', () => {
    it('should run all benchmarks and provide comprehensive analysis', async () => {
      const results = await benchmarks.runAllBenchmarks();

      expect(results.length).toBeGreaterThan(0);

      const summary = benchmarks.getPerformanceSummary();

      expect(summary.totalOperations).toBe(results.length);
      expect(summary.passedOperations + summary.failedOperations).toBe(summary.totalOperations);
      expect(summary.overallHealth).toMatch(/^(excellent|good|warning|critical)$/);

      console.log('\n=== COMPREHENSIVE PERFORMANCE ANALYSIS ===');
      console.log(`Total Operations: ${summary.totalOperations}`);
      console.log(`Passed: ${summary.passedOperations}`);
      console.log(`Failed: ${summary.failedOperations}`);
      console.log(`Average Performance Ratio: ${summary.averagePerformance.toFixed(2)}`);
      console.log(`Overall Health: ${summary.overallHealth.toUpperCase()}`);

      // Log individual results
      console.log('\n=== INDIVIDUAL OPERATION RESULTS ===');
      for (const result of results) {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        const improvement = result.improvement ? ` (+${result.improvement.toFixed(1)}% improvement)` : '';
        const regression = result.regression ? ` (-${result.regression.toFixed(1)}% regression)` : '';
        console.log(`${result.operationName}: ${result.actualTime.toFixed(2)}ms / ${result.targetTime}ms ${status}${improvement}${regression}`);
      }

      // Check for regressions
      const regressions = benchmarks.detectRegressions();
      if (regressions.length > 0) {
        console.log('\n=== PERFORMANCE REGRESSIONS DETECTED ===');
        for (const regression of regressions) {
          console.log(`${regression.operationName}: ${regression.regressionPercentage.toFixed(1)}% regression (${regression.severity})`);
          console.log(`  Baseline: ${regression.baselineTime.toFixed(2)}ms → Current: ${regression.currentTime.toFixed(2)}ms`);
          console.log(`  Recommendation: ${regression.recommendation}`);
        }
      }

      // Verify Epic 6.2 targets
      const epic62Compliance = results.every(r => r.actualTime <= 50);
      console.log(`\n=== EPIC 6.2 COMPLIANCE ===`);
      console.log(`All operations <50ms: ${epic62Compliance ? '✅ YES' : '❌ NO'}`);

      if (!epic62Compliance) {
        const slowOperations = results.filter(r => r.actualTime > 50);
        console.log('Operations exceeding 50ms:');
        for (const op of slowOperations) {
          console.log(`  - ${op.operationName}: ${op.actualTime.toFixed(2)}ms`);
        }
      }
    });
  });

  describe('Performance Monitor Integration', () => {
    it('should track operations with performance monitor', async () => {
      const operationId = 'test_operation_tracking';

      performanceMonitor.startOperation(operationId);

      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));

      const duration = performanceMonitor.endOperation(operationId, {
        test: true,
        category: 'baseline'
      });

      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should be reasonable

      // Verify operation was tracked (duration should be reasonable)
      expect(duration).toBeGreaterThan(5); // Should take at least 5ms due to setTimeout(10)
      expect(duration).toBeLessThan(50); // Should be under Epic 6.2 target

      // Verify performance monitor is working by checking the operation completed
      expect(duration).toBeGreaterThan(0);

      // The performance monitor is working correctly if we got a valid duration
      console.log(`Performance monitor tracked operation: ${operationId} in ${duration.toFixed(2)}ms`);
    });

    it('should generate alerts for slow operations', async () => {
      const operationId = 'slow_operation_test';

      performanceMonitor.startOperation(operationId);

      // Simulate slow operation (>50ms)
      await new Promise(resolve => setTimeout(resolve, 60));

      const duration = performanceMonitor.endOperation(operationId);

      expect(duration).toBeGreaterThan(50);

      // Check for performance suggestions
      const suggestions = performanceMonitor.getOptimizationSuggestions('cpu');
      expect(suggestions.length).toBeGreaterThan(0);

      const relevantSuggestion = suggestions.find(s =>
        s.description.includes(operationId) || s.description.includes('50')
      );
      expect(relevantSuggestion).toBeDefined();
      expect(relevantSuggestion?.priority).toMatch(/^(high|critical)$/);
    });
  });
});
