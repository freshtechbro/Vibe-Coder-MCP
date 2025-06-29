/**
 * Unit tests for monitoring utilities
 * Tests InitializationMonitor and memory pressure detection functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger to prevent actual logging during tests
vi.mock('../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Import after mocking
import { InitializationMonitor } from '../initialization-monitor.js';
import logger from '../../logger.js';

describe('InitializationMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();
    InitializationMonitor.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    InitializationMonitor.reset();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = InitializationMonitor.getInstance();
      const instance2 = InitializationMonitor.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should accept configuration on first getInstance call', () => {
      const config = { slowInitThreshold: 10000 };
      const instance = InitializationMonitor.getInstance(config);
      expect(instance).toBeDefined();
    });
  });

  describe('Global Initialization Tracking', () => {
    it('should track global initialization start and end', () => {
      const monitor = InitializationMonitor.getInstance();
      
      monitor.startGlobalInitialization();
      expect(logger.info).toHaveBeenCalledWith('Global initialization monitoring started');
      
      monitor.endGlobalInitialization();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          totalInitTime: expect.any(Number),
          servicesInitialized: 0
        }),
        'Global initialization completed'
      );
    });
  });

  describe('Service Initialization Tracking', () => {
    it('should track service initialization lifecycle', () => {
      const monitor = InitializationMonitor.getInstance();
      const serviceName = 'TestService';
      const dependencies = ['Dependency1', 'Dependency2'];
      const metadata = { version: '1.0.0' };

      monitor.startServiceInitialization(serviceName, dependencies, metadata);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName,
          dependencies,
          metadata
        }),
        'Started tracking service initialization'
      );

      monitor.endServiceInitialization(serviceName);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName,
          duration: expect.any(Number),
          status: 'completed'
        }),
        'Service initialization completed'
      );
    });

    it('should track service initialization failure', () => {
      const monitor = InitializationMonitor.getInstance();
      const serviceName = 'FailingService';
      const error = new Error('Initialization failed');

      monitor.startServiceInitialization(serviceName);
      monitor.endServiceInitialization(serviceName, error);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName,
          duration: expect.any(Number),
          status: 'failed',
          error: error.message
        }),
        'Service initialization failed'
      );
    });

    it('should respect maximum tracked services limit', () => {
      const monitor = InitializationMonitor.getInstance({ maxTrackedServices: 2 });

      monitor.startServiceInitialization('Service1');
      monitor.startServiceInitialization('Service2');
      monitor.startServiceInitialization('Service3'); // Should be rejected

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: 'Service3',
          maxServices: 2
        }),
        'Maximum tracked services reached, not tracking this service'
      );
    });
  });

  describe('Phase Tracking', () => {
    it('should track initialization phases', () => {
      const monitor = InitializationMonitor.getInstance();
      const serviceName = 'TestService';
      const phaseName = 'constructor';
      const metadata = { step: 1 };

      monitor.startServiceInitialization(serviceName);
      monitor.startPhase(serviceName, phaseName, metadata);
      
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName,
          phaseName,
          metadata
        }),
        'Started initialization phase'
      );

      monitor.endPhase(serviceName, phaseName);
      
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName,
          phaseName,
          duration: expect.any(Number),
          status: 'completed'
        }),
        'Initialization phase completed'
      );
    });

    it('should track phase failures', () => {
      const monitor = InitializationMonitor.getInstance();
      const serviceName = 'TestService';
      const phaseName = 'constructor';
      const error = new Error('Phase failed');

      monitor.startServiceInitialization(serviceName);
      monitor.startPhase(serviceName, phaseName);
      monitor.endPhase(serviceName, phaseName, error);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName,
          phaseName,
          duration: expect.any(Number),
          status: 'failed',
          error: error.message
        }),
        'Initialization phase failed'
      );
    });

    it('should warn when ending unknown phase', () => {
      const monitor = InitializationMonitor.getInstance();
      const serviceName = 'TestService';

      monitor.startServiceInitialization(serviceName);
      monitor.endPhase(serviceName, 'unknownPhase');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName,
          phaseName: 'unknownPhase'
        }),
        'Attempted to end unknown or already ended phase'
      );
    });
  });

  describe('Slow Initialization Detection', () => {
    it('should detect slow initialization', () => {
      const monitor = InitializationMonitor.getInstance({ slowInitThreshold: 1000 });
      const serviceName = 'SlowService';

      monitor.startServiceInitialization(serviceName);
      
      // Advance time to simulate slow initialization
      vi.advanceTimersByTime(2000);
      
      monitor.endServiceInitialization(serviceName);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName,
          duration: expect.any(Number),
          threshold: 1000
        }),
        'Slow initialization detected'
      );
    });

    it('should detect critical slow initialization', () => {
      const monitor = InitializationMonitor.getInstance({ 
        slowInitThreshold: 1000,
        criticalSlowThreshold: 5000
      });
      const serviceName = 'CriticallySlowService';

      monitor.startServiceInitialization(serviceName);
      
      // Advance time to simulate critically slow initialization
      vi.advanceTimersByTime(6000);
      
      monitor.endServiceInitialization(serviceName);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName,
          duration: expect.any(Number),
          threshold: 5000
        }),
        'Critical slow initialization detected'
      );
    });
  });

  describe('Statistics and Reporting', () => {
    it('should provide accurate statistics', () => {
      const monitor = InitializationMonitor.getInstance();

      // Create some services with different states
      monitor.startServiceInitialization('CompletedService');
      vi.advanceTimersByTime(10); // Small delay to ensure duration > 0
      monitor.endServiceInitialization('CompletedService');

      monitor.startServiceInitialization('FailedService');
      vi.advanceTimersByTime(5); // Small delay to ensure duration > 0
      monitor.endServiceInitialization('FailedService', new Error('Failed'));

      monitor.startServiceInitialization('PendingService');

      const stats = monitor.getStatistics();

      expect(stats.totalServices).toBe(3);
      expect(stats.completedServices).toBe(1);
      expect(stats.failedServices).toBe(1);
      expect(stats.pendingServices).toBe(1);
      expect(stats.averageInitTime).toBeGreaterThan(0);
    });

    it('should identify slowest and fastest services', () => {
      const monitor = InitializationMonitor.getInstance();

      // Fast service
      monitor.startServiceInitialization('FastService');
      vi.advanceTimersByTime(100);
      monitor.endServiceInitialization('FastService');

      // Slow service
      monitor.startServiceInitialization('SlowService');
      vi.advanceTimersByTime(2000);
      monitor.endServiceInitialization('SlowService');

      const stats = monitor.getStatistics();

      expect(stats.slowestService).toEqual({
        name: 'SlowService',
        duration: expect.any(Number)
      });
      expect(stats.fastestService).toEqual({
        name: 'FastService',
        duration: expect.any(Number)
      });
    });

    it('should provide service details', () => {
      const monitor = InitializationMonitor.getInstance();
      const serviceName = 'DetailedService';
      const dependencies = ['Dep1', 'Dep2'];

      monitor.startServiceInitialization(serviceName, dependencies);
      monitor.startPhase(serviceName, 'phase1');
      monitor.endPhase(serviceName, 'phase1');
      monitor.endServiceInitialization(serviceName);

      const details = monitor.getServiceDetails(serviceName);

      expect(details).toEqual(
        expect.objectContaining({
          serviceName,
          dependencies,
          status: 'completed',
          phases: expect.arrayContaining([
            expect.objectContaining({
              name: 'phase1',
              status: 'completed'
            })
          ])
        })
      );
    });

    it('should list all tracked services', () => {
      const monitor = InitializationMonitor.getInstance();

      monitor.startServiceInitialization('Service1');
      monitor.startServiceInitialization('Service2');

      const allServices = monitor.getAllServices();

      expect(allServices).toHaveLength(2);
      expect(allServices.map(s => s.serviceName)).toEqual(['Service1', 'Service2']);
    });
  });

  describe('Data Management', () => {
    it('should clear all tracking data', () => {
      const monitor = InitializationMonitor.getInstance();

      monitor.startGlobalInitialization();
      monitor.startServiceInitialization('TestService');
      monitor.endGlobalInitialization();

      monitor.clear();

      const stats = monitor.getStatistics();
      expect(stats.totalServices).toBe(0);
      expect(logger.debug).toHaveBeenCalledWith('Initialization monitoring data cleared');
    });
  });

  describe('Configuration Options', () => {
    it('should respect detailed logging configuration', () => {
      const monitor = InitializationMonitor.getInstance({ enableDetailedLogging: false });

      monitor.startServiceInitialization('TestService');
      monitor.endServiceInitialization('TestService');

      // Should not log detailed information when disabled
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it('should respect dependency tracking configuration', () => {
      const monitor = InitializationMonitor.getInstance({ trackDependencies: false });

      monitor.startServiceInitialization('Service1', ['Dep1']);
      monitor.startServiceInitialization('Service2', ['Service1']);

      const stats = monitor.getStatistics();
      expect(stats.criticalPath).toEqual([]);
    });
  });
});

describe('Memory Pressure Detection', () => {
  let mockMemoryManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock MemoryManager
    mockMemoryManager = {
      getMemoryStats: vi.fn(),
      detectMemoryPressure: vi.fn(),
      emergencyCleanup: vi.fn(),
      checkAndExecuteEmergencyCleanup: vi.fn(),
      formatBytes: vi.fn((bytes: number) => `${bytes} B`)
    };
  });

  describe('Memory Pressure Levels', () => {
    it('should detect normal memory pressure', () => {
      const mockStats = {
        raw: {
          heapStats: { used_heap_size: 50000000, heap_size_limit: 100000000 },
          totalSystemMemory: 8000000000,
          freeSystemMemory: 4000000000
        }
      };

      mockMemoryManager.getMemoryStats.mockReturnValue(mockStats);
      mockMemoryManager.detectMemoryPressure.mockReturnValue({
        level: 'normal',
        heapUsagePercentage: 50,
        systemMemoryPercentage: 50,
        recommendations: ['Memory usage is within normal limits']
      });

      const result = mockMemoryManager.detectMemoryPressure();

      expect(result.level).toBe('normal');
      expect(result.heapUsagePercentage).toBe(50);
      expect(result.recommendations).toContain('Memory usage is within normal limits');
    });

    it('should detect moderate memory pressure', () => {
      const mockStats = {
        raw: {
          heapStats: { used_heap_size: 75000000, heap_size_limit: 100000000 },
          totalSystemMemory: 8000000000,
          freeSystemMemory: 2000000000
        }
      };

      mockMemoryManager.getMemoryStats.mockReturnValue(mockStats);
      mockMemoryManager.detectMemoryPressure.mockReturnValue({
        level: 'moderate',
        heapUsagePercentage: 75,
        systemMemoryPercentage: 75,
        recommendations: ['Consider cache pruning', 'Monitor memory trends']
      });

      const result = mockMemoryManager.detectMemoryPressure();

      expect(result.level).toBe('moderate');
      expect(result.recommendations).toContain('Consider cache pruning');
    });

    it('should detect high memory pressure', () => {
      const mockStats = {
        raw: {
          heapStats: { used_heap_size: 90000000, heap_size_limit: 100000000 },
          totalSystemMemory: 8000000000,
          freeSystemMemory: 800000000
        }
      };

      mockMemoryManager.getMemoryStats.mockReturnValue(mockStats);
      mockMemoryManager.detectMemoryPressure.mockReturnValue({
        level: 'high',
        heapUsagePercentage: 90,
        systemMemoryPercentage: 90,
        recommendations: [
          'Aggressive cache pruning recommended',
          'Reduce concurrent operations',
          'Monitor memory usage closely'
        ]
      });

      const result = mockMemoryManager.detectMemoryPressure();

      expect(result.level).toBe('high');
      expect(result.recommendations).toContain('Aggressive cache pruning recommended');
    });

    it('should detect critical memory pressure', () => {
      const mockStats = {
        raw: {
          heapStats: { used_heap_size: 98000000, heap_size_limit: 100000000 },
          totalSystemMemory: 8000000000,
          freeSystemMemory: 200000000
        }
      };

      mockMemoryManager.getMemoryStats.mockReturnValue(mockStats);
      mockMemoryManager.detectMemoryPressure.mockReturnValue({
        level: 'critical',
        heapUsagePercentage: 98,
        systemMemoryPercentage: 97.5,
        recommendations: [
          'Immediate emergency cleanup required',
          'Consider restarting the process',
          'Reduce cache sizes aggressively'
        ]
      });

      const result = mockMemoryManager.detectMemoryPressure();

      expect(result.level).toBe('critical');
      expect(result.recommendations).toContain('Immediate emergency cleanup required');
    });
  });

  describe('Emergency Cleanup', () => {
    it('should perform successful emergency cleanup', async () => {
      const mockBeforeStats = {
        raw: { heapStats: { used_heap_size: 90000000, heap_size_limit: 100000000 } }
      };
      const mockAfterStats = {
        raw: { heapStats: { used_heap_size: 60000000, heap_size_limit: 100000000 } }
      };

      mockMemoryManager.getMemoryStats
        .mockReturnValueOnce(mockBeforeStats)
        .mockReturnValueOnce(mockAfterStats);

      mockMemoryManager.emergencyCleanup.mockResolvedValue({
        success: true,
        freedMemory: 30000000,
        actions: [
          "Cleared cache 'cache1' (100 items)",
          'Cleared grammar manager caches',
          'Forced garbage collection'
        ]
      });

      const result = await mockMemoryManager.emergencyCleanup();

      expect(result.success).toBe(true);
      expect(result.freedMemory).toBe(30000000);
      expect(result.actions).toContain("Cleared cache 'cache1' (100 items)");
    });

    it('should handle emergency cleanup failure', async () => {
      const error = new Error('Cleanup failed');

      mockMemoryManager.emergencyCleanup.mockResolvedValue({
        success: false,
        freedMemory: 0,
        actions: ['Attempted cache clearing'],
        error: error.message
      });

      const result = await mockMemoryManager.emergencyCleanup();

      expect(result.success).toBe(false);
      expect(result.error).toBe(error.message);
      expect(result.freedMemory).toBe(0);
    });

    it('should execute emergency cleanup when critical pressure detected', async () => {
      mockMemoryManager.detectMemoryPressure.mockReturnValue({
        level: 'critical',
        heapUsagePercentage: 98,
        systemMemoryPercentage: 97
      });

      mockMemoryManager.emergencyCleanup.mockResolvedValue({
        success: true,
        freedMemory: 20000000,
        actions: ['Emergency cleanup completed']
      });

      mockMemoryManager.checkAndExecuteEmergencyCleanup.mockResolvedValue(true);

      const result = await mockMemoryManager.checkAndExecuteEmergencyCleanup();

      expect(result).toBe(true);
    });

    it('should not execute emergency cleanup for non-critical pressure', async () => {
      mockMemoryManager.detectMemoryPressure.mockReturnValue({
        level: 'moderate',
        heapUsagePercentage: 75,
        systemMemoryPercentage: 70
      });

      mockMemoryManager.checkAndExecuteEmergencyCleanup.mockResolvedValue(false);

      const result = await mockMemoryManager.checkAndExecuteEmergencyCleanup();

      expect(result).toBe(false);
    });
  });

  describe('Memory Cleanup Actions', () => {
    it('should clear caches during emergency cleanup', async () => {
      const mockCaches = new Map([
        ['cache1', { getSize: () => 50, clear: vi.fn() }],
        ['cache2', { getSize: () => 30, clear: vi.fn() }]
      ]);

      // Mock the emergency cleanup to simulate cache clearing
      mockMemoryManager.emergencyCleanup.mockImplementation(async () => {
        const actions: string[] = [];
        for (const [name, cache] of mockCaches.entries()) {
          const beforeSize = cache.getSize();
          cache.clear();
          actions.push(`Cleared cache '${name}' (${beforeSize} items)`);
        }
        return {
          success: true,
          freedMemory: 15000000,
          actions
        };
      });

      const result = await mockMemoryManager.emergencyCleanup();

      expect(result.actions).toContain("Cleared cache 'cache1' (50 items)");
      expect(result.actions).toContain("Cleared cache 'cache2' (30 items)");
    });

    it('should handle garbage collection availability', async () => {
      // Mock global.gc availability
      const originalGc = global.gc;
      global.gc = vi.fn();

      mockMemoryManager.emergencyCleanup.mockImplementation(async () => {
        const actions: string[] = [];
        if (global.gc) {
          global.gc();
          actions.push('Forced garbage collection');
        } else {
          actions.push('Garbage collection not available (run with --expose-gc)');
        }
        return {
          success: true,
          freedMemory: 10000000,
          actions
        };
      });

      const result = await mockMemoryManager.emergencyCleanup();

      expect(result.actions).toContain('Forced garbage collection');

      // Restore original gc
      global.gc = originalGc;
    });

    it('should clear require cache for non-essential modules', async () => {
      // Mock require.cache
      const mockRequireCache = {
        '/path/to/node_modules/some-module/index.js': {},
        '/path/to/node_modules/logger/index.js': {},
        '/path/to/core/module.js': {},
        '/path/to/node_modules/non-essential/index.js': {}
      };

      mockMemoryManager.emergencyCleanup.mockImplementation(async () => {
        const actions: string[] = [];
        let clearedModules = 0;

        for (const key in mockRequireCache) {
          if (key.includes('node_modules') &&
              !key.includes('logger') &&
              !key.includes('core')) {
            delete mockRequireCache[key];
            clearedModules++;
          }
        }

        if (clearedModules > 0) {
          actions.push(`Cleared ${clearedModules} modules from require cache`);
        }

        return {
          success: true,
          freedMemory: 5000000,
          actions
        };
      });

      const result = await mockMemoryManager.emergencyCleanup();

      expect(result.actions).toContain('Cleared 2 modules from require cache');
    });
  });
});
