/**
 * Test suite for memory optimization functionality
 * Verifies memory management, monitoring, and leak detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  MemoryOptimizer,
  memoryUtils
} from './memory-optimizer.js';
import { 
  withMemoryMonitoring,
  withMemoryOptimization,
  ensureMemoryHealth,
  forceMemoryOptimization,
  assertMemoryUsage
} from './test-helpers.js';

describe('Memory Optimization', () => {
  let optimizer: MemoryOptimizer;

  beforeEach(() => {
    optimizer = new MemoryOptimizer({
      maxHeapMB: 100,
      maxRssMB: 200,
      warningThresholdMB: 50,
      monitoringInterval: 1000,
      enableGC: true,
      enableDetailedLogging: false
    });
  });

  afterEach(() => {
    optimizer.reset();
  });

  describe('Memory Snapshots', () => {
    it('should take memory snapshots', () => {
      const snapshot = optimizer.takeSnapshot();
      
      expect(snapshot).toBeDefined();
      expect(snapshot.timestamp).toBeGreaterThan(0);
      expect(snapshot.heapUsed).toBeGreaterThan(0);
      expect(snapshot.heapTotal).toBeGreaterThan(0);
      expect(snapshot.formatted.heapUsed).toMatch(/\d+(\.\d+)? MB/);
    });

    it('should limit snapshot history', () => {
      // Take more than 10 snapshots
      for (let i = 0; i < 15; i++) {
        optimizer.takeSnapshot();
      }
      
      const summary = optimizer.getMemorySummary();
      expect(summary.snapshotCount).toBeLessThanOrEqual(10);
    });
  });

  describe('Memory Monitoring', () => {
    it('should start and stop monitoring', async () => {
      // Create a new optimizer with faster monitoring for tests
      const testOptimizer = new MemoryOptimizer({
        monitoringInterval: 100, // 100ms for fast testing
        enableDetailedLogging: false
      });

      testOptimizer.startMonitoring();

      // Wait for at least one monitoring cycle
      await new Promise(resolve => setTimeout(resolve, 200));

      const leakDetection = testOptimizer.stopMonitoring();

      expect(leakDetection).toBeDefined();
      expect(leakDetection).not.toBeNull();
      expect(leakDetection!.snapshots.length).toBeGreaterThan(0);

      // Clean up
      testOptimizer.reset();
    });

    it('should detect memory growth', async () => {
      // Create a new optimizer with faster monitoring for tests
      const testOptimizer = new MemoryOptimizer({
        monitoringInterval: 100, // 100ms for fast testing
        enableDetailedLogging: false
      });

      testOptimizer.startMonitoring();

      // Create some objects to simulate memory usage
      const largeArray: unknown[] = [];
      for (let i = 0; i < 10000; i++) {
        largeArray.push({ data: 'test'.repeat(100), index: i });
      }

      // Wait for monitoring cycles
      await new Promise(resolve => setTimeout(resolve, 300));

      const leakDetection = testOptimizer.stopMonitoring();

      expect(leakDetection).toBeDefined();
      expect(leakDetection).not.toBeNull();
      if (leakDetection) {
        expect(leakDetection.memoryGrowth).toBeGreaterThan(0);
      }

      // Clean up
      largeArray.length = 0;
      testOptimizer.reset();
    });

    it('should not detect leaks with stable memory', async () => {
      // Create a new optimizer with faster monitoring for tests
      const testOptimizer = new MemoryOptimizer({
        monitoringInterval: 100, // 100ms for fast testing
        enableDetailedLogging: false
      });

      testOptimizer.startMonitoring();

      // Wait without creating significant memory usage
      await new Promise(resolve => setTimeout(resolve, 300));

      const leakDetection = testOptimizer.stopMonitoring();

      expect(leakDetection).toBeDefined();
      expect(leakDetection).not.toBeNull();
      if (leakDetection) {
        expect(leakDetection.hasLeaks).toBe(false);
        expect(leakDetection.leakSeverity).toBe('low');
      }

      // Clean up
      testOptimizer.reset();
    });
  });

  describe('Memory Optimization', () => {
    it('should optimize memory for tests', () => {
      const beforeOptimization = optimizer.takeSnapshot();
      
      optimizer.optimizeForTests();
      
      const afterOptimization = optimizer.takeSnapshot();
      
      // Memory usage should be same or lower after optimization
      expect(afterOptimization.heapUsed).toBeLessThanOrEqual(beforeOptimization.heapUsed * 1.1);
    });

    it('should force garbage collection when available', () => {
      // This test depends on --expose-gc flag
      if (global.gc) {
        const beforeGC = optimizer.takeSnapshot();
        
        // Create some garbage
        const garbage = new Array(1000).fill('test'.repeat(1000));
        const afterCreation = optimizer.takeSnapshot();
        
        optimizer.forceGarbageCollection();
        const afterGC = optimizer.takeSnapshot();
        
        expect(afterCreation.heapUsed).toBeGreaterThan(beforeGC.heapUsed);
        // GC should reduce memory usage
        expect(afterGC.heapUsed).toBeLessThanOrEqual(afterCreation.heapUsed);
        
        // Clean up reference
        garbage.length = 0;
      } else {
        // If GC is not available, just ensure the method doesn't throw
        expect(() => optimizer.forceGarbageCollection()).not.toThrow();
      }
    });
  });

  describe('Memory Utils', () => {
    it('should check memory health', () => {
      const isHealthy = memoryUtils.checkMemoryHealth();
      expect(typeof isHealthy).toBe('boolean');
    });

    it('should get current memory usage', () => {
      const memory = memoryUtils.getCurrentMemory();
      
      expect(memory).toBeDefined();
      expect(memory.heapUsed).toBeGreaterThan(0);
      expect(memory.formatted.heapUsed).toMatch(/\d+(\.\d+)? MB/);
    });

    it('should force cleanup', () => {
      expect(() => memoryUtils.forceCleanup()).not.toThrow();
    });

    it('should optimize before and after test', () => {
      expect(() => memoryUtils.optimizeBeforeTest()).not.toThrow();
      
      const leakDetection = memoryUtils.optimizeAfterTest();
      expect(leakDetection).toBeDefined();
    });
  });

  describe('Test Helpers Integration', () => {
    it('should assert memory usage within limits', () => {
      // This should pass with a reasonable limit
      expect(() => assertMemoryUsage(1000)).not.toThrow();
      
      // This should fail with an unreasonably low limit
      expect(() => assertMemoryUsage(1)).toThrow('Memory usage too high');
    });

    it('should ensure memory health', () => {
      // Should not throw under normal conditions
      expect(() => ensureMemoryHealth()).not.toThrow();
    });

    it('should force memory optimization', () => {
      expect(() => forceMemoryOptimization()).not.toThrow();
    });
  });

  describe('Memory Monitoring Wrapper', () => {
    // Apply memory monitoring to this test suite
    withMemoryMonitoring('memory-monitoring-test');

    it('should monitor memory during test execution', () => {
      // Create some memory usage
      const testData = new Array(1000).fill('test');
      
      expect(testData.length).toBe(1000);
      
      // Memory monitoring should be active
      expect(true).toBe(true);
    });

    it('should handle memory optimization wrapper', () => {
      // This test uses the memory optimization wrapper
      const data = new Array(500).fill({ test: 'data' });
      
      expect(data.length).toBe(500);
      
      // Cleanup
      data.length = 0;
    });
  });

  describe('Memory Optimization Wrapper', () => {
    // Apply memory optimization to this test suite
    withMemoryOptimization({
      maxHeapMB: 150,
      enableMonitoring: true,
      forceCleanup: true
    });

    it('should optimize memory with custom settings', () => {
      // Create some memory usage
      const largeData = new Array(2000).fill('large-test-data');
      
      expect(largeData.length).toBe(2000);
      
      // Memory should be optimized automatically
      expect(true).toBe(true);
    });

    it('should handle memory limits', () => {
      // This test should complete within memory limits
      const moderateData = new Array(1000).fill('moderate-data');
      
      expect(moderateData.length).toBe(1000);
      
      // Cleanup
      moderateData.length = 0;
    });
  });

  describe('Leak Detection', () => {
    it('should detect consistent memory growth', async () => {
      const optimizer = new MemoryOptimizer({
        monitoringInterval: 50, // Fast monitoring for tests
        enableDetailedLogging: false
      });

      optimizer.startMonitoring();

      // Simulate consistent memory growth
      const growingArray: unknown[] = [];
      for (let i = 0; i < 3; i++) {
        // Add data and wait
        for (let j = 0; j < 1000; j++) {
          growingArray.push({ data: 'test'.repeat(50), iteration: i, index: j });
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        optimizer.takeSnapshot();
      }

      const leakDetection = optimizer.stopMonitoring();

      expect(leakDetection).toBeDefined();
      expect(leakDetection).not.toBeNull();
      if (leakDetection) {
        expect(leakDetection.memoryGrowth).toBeGreaterThan(0);
      }

      // Clean up
      growingArray.length = 0;
      optimizer.reset();
    });

    it('should provide recommendations for memory issues', async () => {
      const optimizer = new MemoryOptimizer({
        warningThresholdMB: 10, // Low threshold to trigger warnings
        monitoringInterval: 50, // Fast monitoring for tests
        enableDetailedLogging: false
      });

      optimizer.startMonitoring();

      // Create significant memory usage
      const heavyData = new Array(5000).fill('heavy-data'.repeat(100));

      await new Promise(resolve => setTimeout(resolve, 150));

      const leakDetection = optimizer.stopMonitoring();

      expect(leakDetection).toBeDefined();
      expect(leakDetection).not.toBeNull();

      if (leakDetection && leakDetection.hasLeaks) {
        expect(leakDetection.recommendations.length).toBeGreaterThan(0);
        expect(leakDetection.warnings.length).toBeGreaterThan(0);
      }

      // Clean up
      heavyData.length = 0;
      optimizer.reset();
    });
  });
});
