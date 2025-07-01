/**
 * Tests for the ProcessLifecycleManager class.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'os';
import { ProcessLifecycleManager } from '../processLifecycleManager.js';
import { MemoryManager } from '../memoryManager.js';
import { ResourceTracker } from '../resourceTracker.js';

// Mock the os module
vi.mock('os', () => ({
  cpus: vi.fn()
}));

// Mock the FileCache class
vi.mock('../fileCache.js', () => ({
  FileCache: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockResolvedValue(false),
    delete: vi.fn().mockResolvedValue(true),
    clear: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockReturnValue({
      name: 'mock-cache',
      size: 0,
      hits: 0,
      misses: 0,
      hitRatio: 0,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      sizeInBytes: 0
    })
  }))
}));

// Mock the parser module
vi.mock('../../parser.js', () => {
  return {
    getMemoryStats: vi.fn().mockReturnValue({
      heapUsed: 100000000,
      heapTotal: 200000000,
      rss: 150000000,
      systemTotal: 1000000000,
      memoryUsagePercentage: 0.15,
      formatted: {
        heapUsed: '95.37 MB',
        heapTotal: '190.73 MB',
        rss: '143.05 MB',
        systemTotal: '953.67 MB'
      }
    })
  };
});

// Mock process.cpuUsage
vi.mock('process', async () => {
  const originalProcess = { ...process };
  return {
    ...originalProcess,
    cpuUsage: vi.fn().mockReturnValue({
      user: 10000000,
      system: 5000000
    }),
    hrtime: {
      bigint: vi.fn().mockReturnValue(BigInt(1000000000))
    }
  };
});

// Mock os module
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      cpus: () => [{}, {}, {}, {}] // 4 CPUs
    },
    cpus: () => [{}, {}, {}, {}] // 4 CPUs
  };
});

// Mock MemoryLeakDetector
vi.mock('../memoryLeakDetector.js', async () => {
  return {
    default: {},
    MemoryLeakDetector: vi.fn().mockImplementation(() => ({
      init: vi.fn().mockResolvedValue(undefined),
      startAutomaticDetection: vi.fn(),
      stopAutomaticDetection: vi.fn(),
      takeMemorySample: vi.fn(),
      analyzeMemoryTrend: vi.fn().mockReturnValue({
        leakDetected: false,
        trend: 'stable',
        samples: [],
        latestStats: {
          heapUsed: 100000000,
          heapTotal: 200000000,
          rss: 150000000,
          systemTotal: 1000000000,
          memoryUsagePercentage: 0.15,
          formatted: {
            heapUsed: '95.37 MB',
            heapTotal: '190.73 MB',
            rss: '143.05 MB',
            systemTotal: '953.67 MB'
          }
        },
        timestamp: Date.now()
      }),
      takeHeapSnapshot: vi.fn().mockResolvedValue('/tmp/snapshot.heapsnapshot'),
      cleanup: vi.fn()
    }))
  };
});

// Mock MemoryManager
vi.mock('../memoryManager.js', async () => {
  return {
    default: {},
    MemoryManager: vi.fn().mockImplementation(() => ({
      pruneAllCaches: vi.fn(),
      clearAllCaches: vi.fn(),
      runGarbageCollection: vi.fn()
    }))
  };
});

// Mock ResourceTracker
vi.mock('../resourceTracker.js', async () => {
  return {
    default: {},
    ResourceTracker: vi.fn().mockImplementation(() => ({
      trackJob: vi.fn(),
      cleanupJob: vi.fn().mockResolvedValue(undefined)
    }))
  };
});

describe('ProcessLifecycleManager', () => {
  let manager: ProcessLifecycleManager;
  let memoryManager: MemoryManager;
  let resourceTracker: ResourceTracker;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock instances
    memoryManager = new MemoryManager();
    resourceTracker = new ResourceTracker();

    // Create a new manager instance
    manager = new ProcessLifecycleManager({
      maxMemoryPercentage: 0.7,
      healthCheckInterval: 1000, // 1 second
      degradationThreshold: 0.8,
      emergencyThreshold: 0.9,
      autoMonitor: false, // Disable auto-monitoring for tests
      gcInterval: 5000 // 5 seconds
    });

    await manager.init(memoryManager, resourceTracker);
  });

  afterEach(() => {
    // Clean up the manager
    manager.cleanup();
  });

  it('should initialize correctly', () => {
    expect(manager).toBeDefined();
    expect(manager.getMemoryLeakDetector()).toBeDefined();
    expect(manager.getResourceTracker()).toBeDefined();
  });

  it('should check process health', () => {
    // Mock the os.cpus function
    vi.mocked(os.cpus).mockReturnValue([{}, {}, {}, {}] as os.CpuInfo[]); // 4 CPUs

    // Check health
    const health = manager.checkProcessHealth();

    // Should return valid health info
    expect(health.status).toBe('healthy');
    expect(health.memoryUsagePercentage).toBe(0.15);
    expect(health.cpuUsagePercentage).toBeDefined();
    expect(health.memoryLeakDetected).toBe(false);
    expect(health.activeJobs).toBe(0);
  });

  it.skip('should handle degraded memory', async () => {
    // Mock getMemoryStats to return high memory usage
    const parserModule = await import('../../parser.js');
    const originalGetMemoryStats = parserModule.getMemoryStats;

    parserModule.getMemoryStats = vi.fn().mockReturnValue({
      heapUsed: 160000000,
      heapTotal: 200000000,
      rss: 180000000,
      systemTotal: 1000000000,
      memoryUsagePercentage: 0.85, // 85% (above degradation threshold)
      formatted: {
        heapUsed: '152.59 MB',
        heapTotal: '190.73 MB',
        rss: '171.66 MB',
        systemTotal: '953.67 MB'
      }
    });

    // Check health
    const health = manager.checkProcessHealth();

    // Should return degraded status
    expect(health.status).toBe('degraded');

    // Should have called pruneAllCaches
    expect(memoryManager.pruneAllCaches).toHaveBeenCalled();

    // Restore original function
    parserModule.getMemoryStats = originalGetMemoryStats;
  });

  it.skip('should handle critical memory', async () => {
    // Mock getMemoryStats to return critical memory usage
    const parserModule = await import('../../parser.js');
    const originalGetMemoryStats = parserModule.getMemoryStats;

    parserModule.getMemoryStats = vi.fn().mockReturnValue({
      heapUsed: 180000000,
      heapTotal: 200000000,
      rss: 190000000,
      systemTotal: 1000000000,
      memoryUsagePercentage: 0.95, // 95% (above emergency threshold)
      formatted: {
        heapUsed: '171.66 MB',
        heapTotal: '190.73 MB',
        rss: '181.20 MB',
        systemTotal: '953.67 MB'
      }
    });

    // Check health
    const health = manager.checkProcessHealth();

    // Should return critical status
    expect(health.status).toBe('critical');

    // Should have called clearAllCaches
    expect(memoryManager.clearAllCaches).toHaveBeenCalled();

    // Restore original function
    parserModule.getMemoryStats = originalGetMemoryStats;
  });

  it('should register and unregister jobs', async () => {
    // Register a job
    manager.registerJob('test-job-1');

    // Should have one active job
    expect(manager.getActiveJobCount()).toBe(1);
    expect(manager.getActiveJobIds()).toContain('test-job-1');

    // Should have called trackJob
    expect(resourceTracker.trackJob).toHaveBeenCalledWith('test-job-1');

    // Unregister the job
    await manager.unregisterJob('test-job-1');

    // Should have no active jobs
    expect(manager.getActiveJobCount()).toBe(0);

    // Should have called cleanupJob
    expect(resourceTracker.cleanupJob).toHaveBeenCalledWith('test-job-1');
  });

  it('should notify health listeners', () => {
    // Mock the os.cpus function
    vi.mocked(os.cpus).mockReturnValue([{}, {}, {}, {}] as os.CpuInfo[]); // 4 CPUs

    // Create a mock listener
    const listener = vi.fn();

    // Add the listener
    manager.addHealthListener(listener);

    // Check health
    const health = manager.checkProcessHealth();

    // Should have called the listener
    expect(listener).toHaveBeenCalledWith(health);

    // Remove the listener
    manager.removeHealthListener(listener);

    // Reset the mock
    listener.mockReset();

    // Check health again
    manager.checkProcessHealth();

    // Should not have called the listener
    expect(listener).not.toHaveBeenCalled();
  });
});
