/**
 * Unit tests for MemoryManager logging recursion fix
 * Tests that startMonitoring() does not cause recursion and logs are properly deferred
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger to track calls and prevent actual logging
vi.mock('../../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Import after mocking
import { MemoryManager } from '../memoryManager.js';
import logger from '../../../../logger.js';

describe('MemoryManager Logging Recursion Fix', () => {
  let memoryManager: MemoryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (memoryManager) {
      memoryManager.stopMonitoring();
    }
    vi.useRealTimers();
  });

  it('should defer logging in startMonitoring to prevent recursion', () => {
    // Create MemoryManager with autoManage disabled to control when monitoring starts
    memoryManager = new MemoryManager({
      autoManage: false,
      monitorInterval: 1000
    });

    // Clear any logs from constructor
    vi.mocked(logger.debug).mockClear();
    vi.mocked(logger.info).mockClear();

    // Start monitoring manually
    (memoryManager as any).startMonitoring();

    // Immediately after startMonitoring, the debug log should not have been called yet
    expect(logger.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('Started memory monitoring')
    );

    // Advance timers to trigger setImmediate
    vi.runAllTimers();

    // Now the debug log should have been called
    expect(logger.debug).toHaveBeenCalledWith(
      'Started memory monitoring with interval: 1000ms'
    );
  });

  it('should not cause stack overflow during initialization', () => {
    // This test verifies that creating a MemoryManager with autoManage: true
    // does not cause infinite recursion
    expect(() => {
      memoryManager = new MemoryManager({
        autoManage: true,
        monitorInterval: 100
      });
    }).not.toThrow();

    // Verify the instance was created successfully
    expect(memoryManager).toBeDefined();
  });

  it('should handle multiple calls to startMonitoring gracefully', () => {
    memoryManager = new MemoryManager({
      autoManage: false,
      monitorInterval: 1000
    });

    // Clear constructor logs
    vi.mocked(logger.debug).mockClear();

    // Call startMonitoring multiple times
    (memoryManager as any).startMonitoring();
    (memoryManager as any).startMonitoring();
    (memoryManager as any).startMonitoring();

    // Advance timers
    vi.runAllTimers();

    // Should only log once despite multiple calls
    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      'Started memory monitoring with interval: 1000ms'
    );
  });

  it('should properly set up monitoring timer before logging', () => {
    memoryManager = new MemoryManager({
      autoManage: false,
      monitorInterval: 500
    });

    // Start monitoring
    (memoryManager as any).startMonitoring();

    // Verify timer is set up immediately
    const monitorTimer = (memoryManager as any).monitorTimer;
    expect(monitorTimer).toBeDefined();
    expect(monitorTimer).not.toBeNull();

    // Verify logging is deferred
    expect(logger.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('Started memory monitoring')
    );

    // Advance timers to trigger deferred logging
    vi.runAllTimers();

    // Now logging should have occurred
    expect(logger.debug).toHaveBeenCalledWith(
      'Started memory monitoring with interval: 500ms'
    );
  });

  it('should not interfere with memory monitoring functionality', () => {
    memoryManager = new MemoryManager({
      autoManage: true,
      monitorInterval: 100
    });

    // Mock checkMemoryUsage to verify it gets called
    const checkMemoryUsageSpy = vi.spyOn(memoryManager as any, 'checkMemoryUsage');

    // Advance time to trigger monitoring interval
    vi.advanceTimersByTime(100);

    // Verify monitoring is working
    expect(checkMemoryUsageSpy).toHaveBeenCalled();
  });

  it('should maintain proper logging order during initialization', () => {
    const logCalls: string[] = [];
    
    // Track all log calls in order
    vi.mocked(logger.info).mockImplementation((msg: string) => {
      logCalls.push(`info: ${msg}`);
    });
    vi.mocked(logger.debug).mockImplementation((msg: string) => {
      logCalls.push(`debug: ${msg}`);
    });

    memoryManager = new MemoryManager({
      autoManage: true,
      monitorInterval: 200
    });

    // Advance timers to trigger deferred logging
    vi.runAllTimers();

    // Verify constructor info log comes before monitoring debug log
    const constructorLogIndex = logCalls.findIndex(log => 
      log.includes('MemoryManager created with max memory')
    );
    const monitoringLogIndex = logCalls.findIndex(log => 
      log.includes('Started memory monitoring with interval')
    );

    expect(constructorLogIndex).toBeGreaterThanOrEqual(0);
    expect(monitoringLogIndex).toBeGreaterThanOrEqual(0);
    expect(constructorLogIndex).toBeLessThan(monitoringLogIndex);
  });
});
