/**
 * Unit tests for Timeout Manager
 * Tests centralized timeout and retry management using configurable values
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TimeoutManager, getTimeoutManager } from '../../utils/timeout-manager.js';
import { VibeTaskManagerConfig } from '../../utils/config-loader.js';

// Mock dependencies
vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('TimeoutManager', () => {
  let timeoutManager: TimeoutManager;
  let mockConfig: VibeTaskManagerConfig['taskManager'];

  beforeEach(() => {
    timeoutManager = TimeoutManager.getInstance();
    
    mockConfig = {
      maxConcurrentTasks: 5,
      defaultTaskTemplate: 'default',
      dataDirectory: '/test/data',
      performanceTargets: {
        maxResponseTime: 500,
        maxMemoryUsage: 1024,
        minTestCoverage: 80
      },
      agentSettings: {
        maxAgents: 10,
        defaultAgent: 'default',
        coordinationStrategy: 'round_robin',
        healthCheckInterval: 30
      },
      nlpSettings: {
        primaryMethod: 'hybrid',
        fallbackMethod: 'pattern',
        minConfidence: 0.7,
        maxProcessingTime: 50
      },
      timeouts: {
        taskExecution: 300000,
        taskDecomposition: 600000,
        taskRefinement: 180000,
        agentCommunication: 30000,
        llmRequest: 60000,
        fileOperations: 10000,
        databaseOperations: 15000,
        networkOperations: 20000
      },
      retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2.0,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        enableExponentialBackoff: true
      },
      performance: {
        memoryManagement: {
          maxMemoryPercentage: 70,
          gcThreshold: 80
        },
        caching: {
          maxCacheSize: 1024 * 1024 * 10,
          ttlMs: 300000
        }
      }
    };

    timeoutManager.initialize(mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with configuration', () => {
      const newManager = TimeoutManager.getInstance();
      newManager.initialize(mockConfig);

      expect(newManager.getTimeout('taskExecution')).toBe(300000);
      expect(newManager.getTimeout('llmRequest')).toBe(60000);
    });

    it('should use fallback values when not initialized', () => {
      const uninitializedManager = TimeoutManager.getInstance();
      // Reset to uninitialized state
      (uninitializedManager as any).config = null;

      expect(uninitializedManager.getTimeout('taskExecution')).toBe(300000);
      expect(uninitializedManager.getTimeout('llmRequest')).toBe(60000);
    });
  });

  describe('getTimeout', () => {
    it('should return correct timeout values for all operations', () => {
      expect(timeoutManager.getTimeout('taskExecution')).toBe(300000);
      expect(timeoutManager.getTimeout('taskDecomposition')).toBe(600000);
      expect(timeoutManager.getTimeout('taskRefinement')).toBe(180000);
      expect(timeoutManager.getTimeout('agentCommunication')).toBe(30000);
      expect(timeoutManager.getTimeout('llmRequest')).toBe(60000);
      expect(timeoutManager.getTimeout('fileOperations')).toBe(10000);
      expect(timeoutManager.getTimeout('databaseOperations')).toBe(15000);
      expect(timeoutManager.getTimeout('networkOperations')).toBe(20000);
    });
  });

  describe('getRetryConfig', () => {
    it('should return correct retry configuration', () => {
      const retryConfig = timeoutManager.getRetryConfig();

      expect(retryConfig.maxRetries).toBe(3);
      expect(retryConfig.backoffMultiplier).toBe(2.0);
      expect(retryConfig.initialDelayMs).toBe(1000);
      expect(retryConfig.maxDelayMs).toBe(30000);
      expect(retryConfig.enableExponentialBackoff).toBe(true);
    });

    it('should return fallback retry config when not initialized', () => {
      const uninitializedManager = TimeoutManager.getInstance();
      (uninitializedManager as any).config = null;

      const retryConfig = uninitializedManager.getRetryConfig();

      expect(retryConfig.maxRetries).toBe(3);
      expect(retryConfig.backoffMultiplier).toBe(2.0);
      expect(retryConfig.initialDelayMs).toBe(1000);
      expect(retryConfig.maxDelayMs).toBe(30000);
      expect(retryConfig.enableExponentialBackoff).toBe(true);
    });
  });

  describe('executeWithTimeout', () => {
    it('should execute operation successfully within timeout', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');

      const result = await timeoutManager.executeWithTimeout(
        'llmRequest',
        mockOperation,
        5000 // 5 second timeout
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.timedOut).toBe(false);
      expect(result.retryCount).toBe(0);
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should timeout operation that takes too long', async () => {
      const mockOperation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('success'), 2000))
      );

      const result = await timeoutManager.executeWithTimeout(
        'llmRequest',
        mockOperation,
        100 // 100ms timeout
      );

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.error).toContain('Operation timed out after 100ms');
    });

    it('should retry failed operations', async () => {
      let callCount = 0;
      const mockOperation = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Operation failed');
        }
        return Promise.resolve('success');
      });

      const result = await timeoutManager.executeWithTimeout(
        'llmRequest',
        mockOperation,
        5000,
        { maxRetries: 3 }
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.retryCount).toBe(2);
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should fail after maximum retries', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Operation failed'));

      const result = await timeoutManager.executeWithTimeout(
        'llmRequest',
        mockOperation,
        5000,
        { maxRetries: 2 }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Operation failed');
      expect(result.retryCount).toBe(3); // Initial attempt + 2 retries
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should use custom timeout when provided', async () => {
      const mockOperation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('success'), 200))
      );

      const result = await timeoutManager.executeWithTimeout(
        'llmRequest',
        mockOperation,
        100 // Custom 100ms timeout
      );

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
    });

    it('should use exponential backoff for retries', async () => {
      const delays: number[] = [];

      // Mock the delay function to capture delay values
      const delayMock = vi.fn().mockImplementation((ms: number) => {
        delays.push(ms);
        return Promise.resolve();
      });

      // Replace the delay method on the instance
      vi.spyOn(timeoutManager as any, 'delay').mockImplementation(delayMock);

      const mockOperation = vi.fn().mockRejectedValue(new Error('Operation failed'));

      await timeoutManager.executeWithTimeout(
        'llmRequest',
        mockOperation,
        5000,
        {
          maxRetries: 3,
          enableExponentialBackoff: true,
          initialDelayMs: 100,
          backoffMultiplier: 2.0
        }
      );

      expect(delays).toEqual([100, 200, 400]); // Exponential backoff: 100, 200, 400
      expect(delayMock).toHaveBeenCalledTimes(3);
    });

    it('should use fixed delay when exponential backoff is disabled', async () => {
      const delays: number[] = [];

      // Mock the delay function to capture delay values
      const delayMock = vi.fn().mockImplementation((ms: number) => {
        delays.push(ms);
        return Promise.resolve();
      });

      // Replace the delay method on the instance
      vi.spyOn(timeoutManager as any, 'delay').mockImplementation(delayMock);

      const mockOperation = vi.fn().mockRejectedValue(new Error('Operation failed'));

      await timeoutManager.executeWithTimeout(
        'llmRequest',
        mockOperation,
        5000,
        {
          maxRetries: 3,
          enableExponentialBackoff: false,
          initialDelayMs: 100
        }
      );

      expect(delays).toEqual([100, 100, 100]); // Fixed delay
      expect(delayMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('raceWithTimeout', () => {
    it('should resolve when operation completes before timeout', async () => {
      const operationPromise = Promise.resolve('success');

      const result = await timeoutManager.raceWithTimeout(
        'llmRequest',
        operationPromise,
        5000
      );

      expect(result).toBe('success');
    });

    it('should reject when operation times out', async () => {
      const operationPromise = new Promise(resolve => 
        setTimeout(() => resolve('success'), 2000)
      );

      await expect(
        timeoutManager.raceWithTimeout('llmRequest', operationPromise, 100)
      ).rejects.toThrow('llmRequest operation timed out after 100ms');
    });
  });

  describe('getTimeoutSummary', () => {
    it('should return summary of all timeout values', () => {
      const summary = timeoutManager.getTimeoutSummary();

      expect(summary).toEqual({
        taskExecution: 300000,
        taskDecomposition: 600000,
        taskRefinement: 180000,
        agentCommunication: 30000,
        llmRequest: 60000,
        fileOperations: 10000,
        databaseOperations: 15000,
        networkOperations: 20000
      });
    });
  });

  describe('validateTimeouts', () => {
    it('should validate correct timeout configuration', () => {
      const result = timeoutManager.validateTimeouts();

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect timeout values that are too low', () => {
      const invalidConfig = {
        ...mockConfig,
        timeouts: {
          ...mockConfig.timeouts,
          taskExecution: 5000 // Too low
        }
      };

      timeoutManager.initialize(invalidConfig);
      const result = timeoutManager.validateTimeouts();

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Task execution timeout is too low (< 10 seconds)');
    });

    it('should detect timeout values that are too high', () => {
      const invalidConfig = {
        ...mockConfig,
        timeouts: {
          ...mockConfig.timeouts,
          taskExecution: 4000000 // Too high (> 1 hour)
        }
      };

      timeoutManager.initialize(invalidConfig);
      const result = timeoutManager.validateTimeouts();

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Task execution timeout is too high (> 1 hour)');
    });

    it('should detect invalid retry configuration', () => {
      const invalidConfig = {
        ...mockConfig,
        retryPolicy: {
          ...mockConfig.retryPolicy,
          maxRetries: 15 // Too high
        }
      };

      timeoutManager.initialize(invalidConfig);
      const result = timeoutManager.validateTimeouts();

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Max retries should be between 0 and 10');
    });

    it('should return invalid when not initialized', () => {
      const uninitializedManager = TimeoutManager.getInstance();
      (uninitializedManager as any).config = null;

      const result = uninitializedManager.validateTimeouts();

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Timeout configuration not initialized');
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = TimeoutManager.getInstance();
      const instance2 = getTimeoutManager();

      expect(instance1).toBe(instance2);
    });
  });
});
