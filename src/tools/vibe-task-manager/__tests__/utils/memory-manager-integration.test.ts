/**
 * Tests for Task Manager Memory Manager Integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskManagerMemoryManager, TaskManagerMemoryStats } from '../../utils/memory-manager-integration.js';

// Mock the MemoryManager from code-map-generator
vi.mock('../../../code-map-generator/cache/memoryManager.js', () => ({
  MemoryManager: vi.fn().mockImplementation(() => ({
    getMemoryStats: vi.fn(() => ({
      raw: {
        memoryUsagePercentage: 0.5
      }
    })),
    pruneCaches: vi.fn(),
    registerCache: vi.fn(),
    unregisterCache: vi.fn(),
    stopMonitoring: vi.fn()
  }))
}));

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('TaskManagerMemoryManager', () => {
  let memoryManager: TaskManagerMemoryManager;
  let mockConfig: Record<string, unknown>;

  beforeEach(() => {
    mockConfig = {
      enabled: true,
      maxMemoryPercentage: 0.4,
      monitorInterval: 1000,
      autoManage: true,
      pruneThreshold: 0.7,
      prunePercentage: 0.3
    };

    // Reset singleton
    (TaskManagerMemoryManager as Record<string, unknown> as { instance: unknown }).instance = null;
  });

  afterEach(() => {
    if (memoryManager) {
      memoryManager.shutdown();
    }
  });

  describe('Initialization', () => {
    it('should create singleton instance with configuration', () => {
      memoryManager = TaskManagerMemoryManager.getInstance(mockConfig);

      expect(memoryManager).toBeDefined();
      expect(memoryManager).toBeInstanceOf(TaskManagerMemoryManager);
    });

    it('should return same instance on subsequent calls', () => {
      const instance1 = TaskManagerMemoryManager.getInstance(mockConfig);
      const instance2 = TaskManagerMemoryManager.getInstance();

      expect(instance1).toBe(instance2);

      instance1.shutdown();
    });

    it('should throw error if no config provided for first initialization', () => {
      expect(() => {
        TaskManagerMemoryManager.getInstance();
      }).toThrow('Memory manager configuration required for first initialization');
    });
  });

  describe('Memory Statistics Collection', () => {
    beforeEach(() => {
      memoryManager = TaskManagerMemoryManager.getInstance(mockConfig);
    });

    it('should collect memory statistics', async () => {
      // Wait for initial stats collection
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = memoryManager.getCurrentMemoryStats();
      expect(stats).toBeDefined();

      if (stats) {
        expect(stats.heapUsed).toBeGreaterThan(0);
        expect(stats.heapTotal).toBeGreaterThan(0);
        expect(stats.timestamp).toBeInstanceOf(Date);
        expect(stats.percentageUsed).toBeGreaterThanOrEqual(0);
      }
    });

    it('should maintain statistics history', async () => {
      // Manually trigger stats collection to ensure we have data
      (memoryManager as Record<string, unknown>).collectMemoryStats();
      (memoryManager as Record<string, unknown>).collectMemoryStats();

      const history = memoryManager.getMemoryStatsHistory();
      expect(history.length).toBeGreaterThan(0);

      // Check that stats are ordered by timestamp
      for (let i = 1; i < history.length; i++) {
        expect(history[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          history[i - 1].timestamp.getTime()
        );
      }
    });

    it('should limit statistics history to 100 entries', async () => {
      // Simulate many stats collections
      for (let i = 0; i < 150; i++) {
        (memoryManager as Record<string, unknown>).collectMemoryStats();
      }

      const history = memoryManager.getMemoryStatsHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Memory Alerts', () => {
    beforeEach(() => {
      memoryManager = TaskManagerMemoryManager.getInstance(mockConfig);
    });

    it('should generate warning alerts for high memory usage', () => {
      // Mock high memory usage
      const mockStats: TaskManagerMemoryStats = {
        totalMemoryUsage: 100 * 1024 * 1024,
        heapUsed: 80 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
        rss: 120 * 1024 * 1024,
        percentageUsed: 0.6, // Above warning threshold (0.56)
        cacheMemoryUsage: 20 * 1024 * 1024,
        taskStorageMemoryUsage: 10 * 1024 * 1024,
        agentMemoryUsage: 5 * 1024 * 1024,
        timestamp: new Date()
      };

      // Inject mock stats
      (memoryManager as unknown).memoryStats = [mockStats];
      (memoryManager as unknown).checkMemoryThresholds();

      const alerts = memoryManager.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);

      const warningAlert = alerts.find(alert => alert.type === 'warning');
      expect(warningAlert).toBeDefined();
    });

    it('should generate critical alerts for very high memory usage', () => {
      // Mock critical memory usage
      const mockStats: TaskManagerMemoryStats = {
        totalMemoryUsage: 100 * 1024 * 1024,
        heapUsed: 90 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
        rss: 120 * 1024 * 1024,
        percentageUsed: 0.8, // Above critical threshold (0.7)
        cacheMemoryUsage: 30 * 1024 * 1024,
        taskStorageMemoryUsage: 15 * 1024 * 1024,
        agentMemoryUsage: 10 * 1024 * 1024,
        timestamp: new Date()
      };

      // Inject mock stats
      (memoryManager as unknown).memoryStats = [mockStats];
      (memoryManager as unknown).checkMemoryThresholds();

      const alerts = memoryManager.getActiveAlerts();
      const criticalAlert = alerts.find(alert => alert.type === 'critical');
      expect(criticalAlert).toBeDefined();
    });

    it('should resolve alerts', () => {
      // Generate an alert first
      const mockStats: TaskManagerMemoryStats = {
        totalMemoryUsage: 100 * 1024 * 1024,
        heapUsed: 80 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
        rss: 120 * 1024 * 1024,
        percentageUsed: 0.6,
        cacheMemoryUsage: 20 * 1024 * 1024,
        taskStorageMemoryUsage: 10 * 1024 * 1024,
        agentMemoryUsage: 5 * 1024 * 1024,
        timestamp: new Date()
      };

      (memoryManager as unknown).memoryStats = [mockStats];
      (memoryManager as unknown).checkMemoryThresholds();

      const alerts = memoryManager.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);

      const alertId = alerts[0].id;
      const resolved = memoryManager.resolveAlert(alertId);
      expect(resolved).toBe(true);

      const activeAlerts = memoryManager.getActiveAlerts();
      expect(activeAlerts.length).toBe(alerts.length - 1);
    });
  });

  describe('Cleanup Callbacks', () => {
    beforeEach(() => {
      memoryManager = TaskManagerMemoryManager.getInstance(mockConfig);
    });

    it('should register cleanup callbacks', () => {
      const mockCallback = vi.fn().mockResolvedValue({
        success: true,
        memoryFreed: 1024 * 1024,
        itemsRemoved: 10,
        duration: 100
      });

      memoryManager.registerCleanupCallback('test-component', mockCallback);

      // Verify callback is registered (internal state check)
      expect((memoryManager as unknown).cleanupCallbacks.has('test-component')).toBe(true);
    });

    it('should unregister cleanup callbacks', () => {
      const mockCallback = vi.fn().mockResolvedValue({
        success: true,
        memoryFreed: 1024 * 1024,
        itemsRemoved: 10,
        duration: 100
      });

      memoryManager.registerCleanupCallback('test-component', mockCallback);
      memoryManager.unregisterCleanupCallback('test-component');

      expect((memoryManager as unknown).cleanupCallbacks.has('test-component')).toBe(false);
    });

    it('should execute cleanup callbacks during aggressive cleanup', async () => {
      const mockCallback = vi.fn().mockResolvedValue({
        success: true,
        memoryFreed: 1024 * 1024,
        itemsRemoved: 10,
        duration: 100
      });

      memoryManager.registerCleanupCallback('test-component', mockCallback);

      const result = await memoryManager.performAggressiveCleanup();

      expect(mockCallback).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.memoryFreed).toBeGreaterThanOrEqual(1024 * 1024);
      expect(result.itemsRemoved).toBeGreaterThanOrEqual(10);
    });

    it('should handle cleanup callback failures gracefully', async () => {
      const failingCallback = vi.fn().mockRejectedValue(new Error('Cleanup failed'));
      const successCallback = vi.fn().mockResolvedValue({
        success: true,
        memoryFreed: 512 * 1024,
        itemsRemoved: 5,
        duration: 50
      });

      memoryManager.registerCleanupCallback('failing-component', failingCallback);
      memoryManager.registerCleanupCallback('success-component', successCallback);

      const result = await memoryManager.performAggressiveCleanup();

      expect(result.success).toBe(true); // Should still succeed overall
      expect(failingCallback).toHaveBeenCalled();
      expect(successCallback).toHaveBeenCalled();
    });
  });

  describe('Memory Usage Summary', () => {
    beforeEach(() => {
      memoryManager = TaskManagerMemoryManager.getInstance(mockConfig);
    });

    it('should provide memory usage summary', async () => {
      // Wait for initial stats
      await new Promise(resolve => setTimeout(resolve, 100));

      const summary = memoryManager.getMemoryUsageSummary();

      expect(summary).toHaveProperty('current');
      expect(summary).toHaveProperty('peak');
      expect(summary).toHaveProperty('average');
      expect(summary).toHaveProperty('alertCount');
      expect(summary).toHaveProperty('cleanupCallbacksCount');

      expect(typeof summary.average).toBe('number');
      expect(typeof summary.alertCount).toBe('number');
      expect(typeof summary.cleanupCallbacksCount).toBe('number');
    });

    it('should track peak memory usage', async () => {
      // Simulate varying memory usage
      const stats1: TaskManagerMemoryStats = {
        totalMemoryUsage: 50 * 1024 * 1024,
        heapUsed: 40 * 1024 * 1024,
        heapTotal: 60 * 1024 * 1024,
        external: 5 * 1024 * 1024,
        arrayBuffers: 2 * 1024 * 1024,
        rss: 70 * 1024 * 1024,
        percentageUsed: 0.3,
        cacheMemoryUsage: 10 * 1024 * 1024,
        taskStorageMemoryUsage: 5 * 1024 * 1024,
        agentMemoryUsage: 2 * 1024 * 1024,
        timestamp: new Date()
      };

      const stats2: TaskManagerMemoryStats = {
        ...stats1,
        totalMemoryUsage: 100 * 1024 * 1024, // Higher usage
        heapUsed: 80 * 1024 * 1024,
        timestamp: new Date()
      };

      (memoryManager as unknown).memoryStats = [stats1, stats2];

      const summary = memoryManager.getMemoryUsageSummary();
      expect(summary.peak?.totalMemoryUsage).toBe(100 * 1024 * 1024);
    });
  });

  describe('Monitoring Control', () => {
    it('should start monitoring when enabled', () => {
      memoryManager = TaskManagerMemoryManager.getInstance(mockConfig);

      // Check that monitoring interval is set
      expect((memoryManager as unknown).monitoringInterval).toBeDefined();
    });

    it('should not start monitoring when disabled', () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      memoryManager = TaskManagerMemoryManager.getInstance(disabledConfig);

      // Check that monitoring interval is not set
      expect((memoryManager as unknown).monitoringInterval).toBeNull();
    });

    it('should stop monitoring on shutdown', () => {
      memoryManager = TaskManagerMemoryManager.getInstance(mockConfig);

      expect((memoryManager as unknown).monitoringInterval).toBeDefined();

      memoryManager.stopMonitoring();

      expect((memoryManager as unknown).monitoringInterval).toBeNull();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      memoryManager = TaskManagerMemoryManager.getInstance(mockConfig);
    });

    it('should handle errors during cleanup gracefully', async () => {
      // Mock a cleanup callback that throws an error
      const errorCallback = vi.fn().mockRejectedValue(new Error('Cleanup error'));
      memoryManager.registerCleanupCallback('error-component', errorCallback);

      const result = await memoryManager.performAggressiveCleanup();

      // Should still succeed overall even with one failing callback
      expect(result.success).toBe(true);
      expect(errorCallback).toHaveBeenCalled();

      // Clean up
      memoryManager.unregisterCleanupCallback('error-component');
    });

    it('should handle invalid alert IDs gracefully', () => {
      const resolved = memoryManager.resolveAlert('invalid-alert-id');
      expect(resolved).toBe(false);
    });
  });
});
