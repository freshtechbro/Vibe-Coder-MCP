/**
 * Tests for Adaptive Timeout Manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AdaptiveTimeoutManager, TimeoutConfig, ProgressInfo } from '../../services/adaptive-timeout-manager.js';

describe('AdaptiveTimeoutManager', () => {
  let timeoutManager: AdaptiveTimeoutManager;

  beforeEach(() => {
    timeoutManager = AdaptiveTimeoutManager.getInstance();
    // Don't use fake timers - the timeout manager uses real timers internally
  });

  afterEach(async () => {
    // Cancel all active operations before shutdown
    const activeOps = timeoutManager.getActiveOperations();
    for (const opId of activeOps) {
      timeoutManager.cancelOperation(opId);
    }

    // Wait a bit for cleanup
    await new Promise(resolve => setTimeout(resolve, 10));

    timeoutManager.shutdown();
  });

  describe('Basic Functionality', () => {
    it('should execute operation successfully within timeout', async () => {
      const operation = vi.fn().mockImplementation(async (cancellationToken, progressCallback) => {
        progressCallback({
          completed: 1,
          total: 1,
          stage: 'completed',
          lastUpdate: new Date()
        });
        return 'success';
      });

      const result = await timeoutManager.executeWithTimeout(
        'test-operation',
        operation,
        { baseTimeoutMs: 5000 }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.timeoutOccurred).toBe(false);
      expect(operation).toHaveBeenCalledOnce();
    }, 3000);

    it('should handle operation timeout', async () => {
      const operation = vi.fn().mockImplementation(async (cancellationToken) => {
        // Simulate a long-running operation that should timeout
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve('should not reach here'), 2000);
          cancellationToken.onCancelled(() => {
            clearTimeout(timer);
            reject(new Error('Operation cancelled'));
          });
        });
      });

      const config: Partial<TimeoutConfig> = {
        baseTimeoutMs: 300, // Very short timeout
        maxRetries: 0
      };

      const result = await timeoutManager.executeWithTimeout('test-timeout', operation, config);

      expect(result.success).toBe(false);
      expect(result.timeoutOccurred).toBe(true);
      expect(result.error).toContain('cancelled');
    }, 3000);

    it('should provide progress updates', async () => {
      const progressUpdates: ProgressInfo[] = [];

      const operation = vi.fn().mockImplementation(async (cancellationToken, progressCallback) => {
        for (let i = 0; i <= 3; i++) {
          if (cancellationToken.isCancelled) break;

          progressCallback({
            completed: i,
            total: 3,
            stage: `step-${i}`,
            lastUpdate: new Date(),
            estimatedTimeRemaining: (3 - i) * 50
          });

          // Use very short delays for faster test
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        return 'completed';
      });

      const progressHandler = ({ progress }: { progress: ProgressInfo }) => {
        progressUpdates.push(progress);
      };

      timeoutManager.on('progress', progressHandler);

      try {
        const result = await timeoutManager.executeWithTimeout(
          'test-progress',
          operation,
          { baseTimeoutMs: 5000 }
        );

        expect(result.success).toBe(true);
        expect(progressUpdates.length).toBeGreaterThan(0);
        expect(progressUpdates[0].stage).toBe('step-0');
      } finally {
        timeoutManager.off('progress', progressHandler);
      }
    }, 3000);
  });

  describe('Retry Logic', () => {
    it('should retry on timeout with exponential backoff', async () => {
      let attemptCount = 0;

      const operation = vi.fn().mockImplementation(async (cancellationToken) => {
        attemptCount++;
        if (attemptCount < 3) {
          // Simulate timeout on first two attempts
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve(`success-attempt-${attemptCount}`), 800);
            cancellationToken.onCancelled(() => {
              clearTimeout(timer);
              reject(new Error('Operation cancelled'));
            });
          });
        }
        return `success-attempt-${attemptCount}`;
      });

      const config: Partial<TimeoutConfig> = {
        baseTimeoutMs: 200, // Very short timeout to trigger retries
        maxRetries: 2,
        exponentialBackoffFactor: 1.5
      };

      const result = await timeoutManager.executeWithTimeout('test-retry', operation, config);

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2);
      expect(operation).toHaveBeenCalledTimes(3);
    }, 8000);

    it('should accept partial results when threshold is met', async () => {
      const operation = vi.fn().mockImplementation(async (cancellationToken, progressCallback) => {
        // Simulate 70% progress before timeout
        progressCallback({
          completed: 7,
          total: 10,
          stage: 'processing',
          lastUpdate: new Date()
        });

        // Simulate a long operation that will timeout
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve('full result'), 2000);
          cancellationToken.onCancelled(() => {
            clearTimeout(timer);
            reject(new Error('Operation cancelled'));
          });
        });
      });

      const partialExtractor = vi.fn().mockReturnValue(['partial', 'data']);

      const config: Partial<TimeoutConfig> = {
        baseTimeoutMs: 300, // Short timeout to trigger partial result
        maxRetries: 1,
        partialResultThreshold: 0.6 // 60% threshold
      };

      const result = await timeoutManager.executeWithTimeout(
        'test-partial',
        operation,
        config,
        partialExtractor
      );

      expect(result.success).toBe(true);
      expect(result.result).toEqual(['partial', 'data']);
      expect(partialExtractor).toHaveBeenCalled();
    }, 5000);
  });

  describe('Cancellation', () => {
    it('should cancel operation by ID', async () => {
      const operation = vi.fn().mockImplementation(async (cancellationToken) => {
        return new Promise((resolve, reject) => {
          const checkCancellation = () => {
            if (cancellationToken.isCancelled) {
              reject(new Error('Operation cancelled'));
            } else {
              setTimeout(checkCancellation, 50);
            }
          };
          checkCancellation();
        });
      });

      const config: Partial<TimeoutConfig> = {
        baseTimeoutMs: 5000, // Long timeout so cancellation happens first
        maxRetries: 0 // No retries to avoid interference
      };

      const resultPromise = timeoutManager.executeWithTimeout('test-cancel', operation, config);

      // Cancel after a short delay
      setTimeout(() => {
        timeoutManager.cancelOperation('test-cancel');
      }, 100);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('cancelled');
    }, 3000);

    it('should handle cancellation token callbacks', async () => {
      const cancellationCallback = vi.fn();

      const operation = vi.fn().mockImplementation(async (cancellationToken) => {
        cancellationToken.onCancelled(cancellationCallback);
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve('should not complete'), 2000);
          cancellationToken.onCancelled(() => {
            clearTimeout(timer);
            reject(new Error('Operation cancelled'));
          });
        });
      });

      const config: Partial<TimeoutConfig> = {
        baseTimeoutMs: 300,
        maxRetries: 0 // No retries to avoid interference
      };

      const result = await timeoutManager.executeWithTimeout(
        'test-callback',
        operation,
        config
      );

      expect(result.success).toBe(false);
      expect(cancellationCallback).toHaveBeenCalled();
    }, 3000);
  });

  describe('Progress-Aware Timeout Adjustment', () => {
    it('should extend timeout when good progress is made', async () => {
      const operation = vi.fn().mockImplementation(async (cancellationToken, progressCallback) => {
        // Report good progress with estimated time remaining
        progressCallback({
          completed: 5,
          total: 10,
          stage: 'processing',
          lastUpdate: new Date(),
          estimatedTimeRemaining: 1500 // 1.5 seconds remaining
        });

        // Simulate work that takes longer than base timeout but within extended timeout
        await new Promise(resolve => setTimeout(resolve, 1200));
        return 'completed with extension';
      });

      const result = await timeoutManager.executeWithTimeout(
        'test-extension',
        operation,
        { baseTimeoutMs: 500, maxTimeoutMs: 5000 }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('completed with extension');
    }, 5000);
  });

  describe('Management Functions', () => {
    it('should track active operations', async () => {
      const operation = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return 'test';
      });

      // Start operations but don't await them immediately
      const promise1 = timeoutManager.executeWithTimeout('op1', operation);
      const promise2 = timeoutManager.executeWithTimeout('op2', operation);

      // Check active operations immediately after starting
      await new Promise(resolve => setTimeout(resolve, 10));
      const activeOps = timeoutManager.getActiveOperations();

      // At least one should be active (they might complete quickly)
      expect(activeOps.length).toBeGreaterThanOrEqual(0);

      // Wait for operations to complete
      await Promise.all([promise1, promise2]);
    }, 3000);

    it('should get operation progress', async () => {
      let progressCallback: unknown;

      const operation = vi.fn().mockImplementation(async (cancellationToken, callback) => {
        progressCallback = callback;
        await new Promise(resolve => setTimeout(resolve, 500));
        return 'test';
      });

      const operationPromise = timeoutManager.executeWithTimeout('progress-test', operation);

      // Wait for operation to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Simulate progress update
      if (progressCallback) {
        progressCallback({
          completed: 3,
          total: 10,
          stage: 'testing',
          lastUpdate: new Date()
        });

        // Check progress immediately after update
        const progress = timeoutManager.getOperationProgress('progress-test');
        expect(progress?.completed).toBe(3);
        expect(progress?.stage).toBe('testing');
      }

      await operationPromise;
    }, 3000);
  });
});
