/**
 * Unit tests for RecursionGuard utility
 * Tests recursion detection and prevention mechanisms
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
import { RecursionGuard } from '../recursion-guard.js';
import logger from '../../logger.js';

describe('RecursionGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();
    RecursionGuard.clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    RecursionGuard.clearAll();
  });

  describe('Basic Recursion Detection', () => {
    it('should detect and prevent infinite recursion', async () => {
      let callCount = 0;
      
      const recursiveFunction = async (): Promise<string> => {
        callCount++;
        const result = await RecursionGuard.executeWithRecursionGuard(
          'recursiveTest',
          () => recursiveFunction(),
          { maxDepth: 3 }
        );
        return result.success ? result.result! : 'recursion-prevented';
      };

      const result = await recursiveFunction();
      
      expect(result).toBe('recursion-prevented');
      expect(callCount).toBeLessThanOrEqual(4); // Initial call + 3 recursive calls
    });

    it('should allow normal execution within depth limits', async () => {
      let depth = 0;
      
      const controlledRecursion = async (maxDepth: number): Promise<number> => {
        const result = await RecursionGuard.executeWithRecursionGuard(
          'controlledRecursion',
          () => {
            depth++;
            if (depth < maxDepth) {
              return controlledRecursion(maxDepth);
            }
            return depth;
          },
          { maxDepth: 5 }
        );
        
        return result.success ? result.result! : -1;
      };

      const result = await controlledRecursion(3);
      expect(result).toBe(3);
      expect(depth).toBe(3);
    });

    it('should track call depth correctly', async () => {
      const depths: number[] = [];
      
      const depthTracker = async (remaining: number): Promise<void> => {
        const result = await RecursionGuard.executeWithRecursionGuard(
          'depthTracker',
          () => {
            const currentDepth = RecursionGuard.getCurrentDepth('depthTracker');
            depths.push(currentDepth);
            
            if (remaining > 0) {
              return depthTracker(remaining - 1);
            }
          },
          { maxDepth: 5 }
        );
        
        if (!result.success && result.recursionDetected) {
          depths.push(-1); // Mark recursion detection
        }
      };

      await depthTracker(3);
      
      expect(depths).toEqual([0, 1, 2, 3]);
    });
  });

  describe('Instance-based Tracking', () => {
    it('should track different instances separately', async () => {
      const instance1Results: boolean[] = [];
      const instance2Results: boolean[] = [];
      
      const instanceMethod = async (instanceId: string, callCount: number): Promise<void> => {
        const result = await RecursionGuard.executeWithRecursionGuard(
          'instanceMethod',
          () => {
            if (callCount > 0) {
              return instanceMethod(instanceId, callCount - 1);
            }
          },
          { maxDepth: 3 },
          instanceId
        );
        
        if (instanceId === 'instance1') {
          instance1Results.push(result.success);
        } else {
          instance2Results.push(result.success);
        }
      };

      // Run both instances concurrently
      await Promise.all([
        instanceMethod('instance1', 2),
        instanceMethod('instance2', 4)
      ]);

      expect(instance1Results.every(r => r)).toBe(true); // All successful
      expect(instance2Results.some(r => !r)).toBe(true); // Some failed due to recursion
    });

    it('should generate unique instance IDs', () => {
      const id1 = RecursionGuard.generateInstanceId('testMethod');
      const id2 = RecursionGuard.generateInstanceId('testMethod');
      const id3 = RecursionGuard.generateInstanceId('otherMethod');
      
      expect(id1).not.toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id2).not.toBe(id3);
      
      expect(id1).toContain('testMethod');
      expect(id2).toContain('testMethod');
      expect(id3).toContain('otherMethod');
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout long-running operations', async () => {
      const result = await RecursionGuard.executeWithRecursionGuard(
        'timeoutTest',
        () => {
          // Simulate long-running operation
          return new Promise(resolve => setTimeout(() => resolve('completed'), 10000));
        },
        { executionTimeout: 1000 }
      );

      // Advance time to trigger timeout
      vi.advanceTimersByTime(1500);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timeout');
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should complete fast operations before timeout', async () => {
      const result = await RecursionGuard.executeWithRecursionGuard(
        'fastTest',
        () => 'quick-result',
        { executionTimeout: 5000 }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('quick-result');
      expect(result.recursionDetected).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle synchronous errors', async () => {
      const result = await RecursionGuard.executeWithRecursionGuard(
        'syncErrorTest',
        () => {
          throw new Error('Synchronous error');
        }
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Synchronous error');
      expect(result.recursionDetected).toBe(false);
    });

    it('should handle asynchronous errors', async () => {
      const result = await RecursionGuard.executeWithRecursionGuard(
        'asyncErrorTest',
        async () => {
          throw new Error('Asynchronous error');
        }
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Asynchronous error');
      expect(result.recursionDetected).toBe(false);
    });

    it('should handle promise rejections', async () => {
      const result = await RecursionGuard.executeWithRecursionGuard(
        'rejectionTest',
        () => Promise.reject(new Error('Promise rejection'))
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Promise rejection');
      expect(result.recursionDetected).toBe(false);
    });
  });

  describe('Configuration Options', () => {
    it('should respect custom max depth', async () => {
      let callCount = 0;
      
      const customDepthTest = async (): Promise<void> => {
        const result = await RecursionGuard.executeWithRecursionGuard(
          'customDepthTest',
          () => {
            callCount++;
            return customDepthTest();
          },
          { maxDepth: 2 }
        );
        
        if (result.recursionDetected) {
          expect(callCount).toBeLessThanOrEqual(3); // Initial + 2 recursive
        }
      };

      await customDepthTest();
      expect(callCount).toBeLessThanOrEqual(3);
    });

    it('should respect logging configuration', async () => {
      await RecursionGuard.executeWithRecursionGuard(
        'loggingTest',
        () => {
          throw new Error('Test error');
        },
        { enableLogging: false }
      );

      // Should not log when disabled
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it('should track history when enabled', async () => {
      await RecursionGuard.executeWithRecursionGuard(
        'historyTest',
        () => 'success',
        { trackHistory: true }
      );

      const history = RecursionGuard.getCallHistory('historyTest');
      expect(history.length).toBe(1);
      expect(history[0].methodName).toBe('historyTest');
    });

    it('should not track history when disabled', async () => {
      await RecursionGuard.executeWithRecursionGuard(
        'noHistoryTest',
        () => 'success',
        { trackHistory: false }
      );

      const history = RecursionGuard.getCallHistory('noHistoryTest');
      expect(history.length).toBe(0);
    });
  });

  describe('Utility Methods', () => {
    it('should check if method is executing', async () => {
      let isExecutingDuringCall = false;
      
      await RecursionGuard.executeWithRecursionGuard(
        'executionCheckTest',
        () => {
          isExecutingDuringCall = RecursionGuard.isMethodExecuting('executionCheckTest');
          return 'done';
        }
      );

      expect(isExecutingDuringCall).toBe(true);
      expect(RecursionGuard.isMethodExecuting('executionCheckTest')).toBe(false);
    });

    it('should provide call stack information', async () => {
      let stackDuringCall: unknown[] = [];
      
      await RecursionGuard.executeWithRecursionGuard(
        'stackTest',
        () => {
          stackDuringCall = RecursionGuard.getCallStack('stackTest');
          return 'done';
        }
      );

      expect(stackDuringCall.length).toBe(1);
      expect(stackDuringCall[0].methodName).toBe('stackTest');
      expect(stackDuringCall[0].depth).toBe(0);
    });

    it('should provide statistics', async () => {
      await RecursionGuard.executeWithRecursionGuard('method1', () => 'result1');
      await RecursionGuard.executeWithRecursionGuard('method2', () => 'result2');

      const stats = RecursionGuard.getStatistics();
      expect(stats.totalMethods).toBeGreaterThanOrEqual(2);
      expect(stats.activeStacks).toBe(0); // No active calls
      expect(Object.keys(stats.methodStats)).toContain('method1');
      expect(Object.keys(stats.methodStats)).toContain('method2');
    });

    it('should clear method-specific data', async () => {
      await RecursionGuard.executeWithRecursionGuard('clearTest', () => 'result');
      
      expect(RecursionGuard.getCallHistory('clearTest').length).toBeGreaterThan(0);
      
      RecursionGuard.clearMethod('clearTest');
      
      expect(RecursionGuard.getCallHistory('clearTest').length).toBe(0);
      expect(RecursionGuard.getCurrentDepth('clearTest')).toBe(0);
    });

    it('should clear all data', async () => {
      await RecursionGuard.executeWithRecursionGuard('method1', () => 'result1');
      await RecursionGuard.executeWithRecursionGuard('method2', () => 'result2');
      
      RecursionGuard.clearAll();
      
      const stats = RecursionGuard.getStatistics();
      expect(stats.totalMethods).toBe(0);
      expect(stats.activeStacks).toBe(0);
    });
  });

  describe('Async and Sync Operations', () => {
    it('should handle mixed async and sync operations', async () => {
      const syncResult = await RecursionGuard.executeWithRecursionGuard(
        'syncTest',
        () => 'sync-result'
      );

      const asyncResult = await RecursionGuard.executeWithRecursionGuard(
        'asyncTest',
        async () => 'async-result'
      );

      expect(syncResult.success).toBe(true);
      expect(syncResult.result).toBe('sync-result');
      expect(asyncResult.success).toBe(true);
      expect(asyncResult.result).toBe('async-result');
    });

    it('should track execution time for both sync and async', async () => {
      const syncResult = await RecursionGuard.executeWithRecursionGuard(
        'syncTiming',
        () => 'sync'
      );

      const asyncResult = await RecursionGuard.executeWithRecursionGuard(
        'asyncTiming',
        async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'async';
        }
      );

      vi.advanceTimersByTime(100);

      expect(syncResult.executionTime).toBeGreaterThanOrEqual(0);
      expect(asyncResult.executionTime).toBeGreaterThanOrEqual(0);
    });
  });
});
