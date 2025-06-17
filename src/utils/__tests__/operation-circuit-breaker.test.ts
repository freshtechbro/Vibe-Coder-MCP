/**
 * Unit tests for OperationCircuitBreaker utility
 * Tests circuit breaker pattern implementation and graceful fallback mechanisms
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OperationCircuitBreaker, CircuitState } from '../operation-circuit-breaker.js';

// Mock logger to prevent actual logging during tests
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

// Mock the logger module
vi.mock('../../logger.js', () => ({
  default: mockLogger
}));

describe('OperationCircuitBreaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();
    OperationCircuitBreaker.resetAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    OperationCircuitBreaker.resetAll();
  });

  describe('Circuit States', () => {
    it('should start in CLOSED state', () => {
      const circuit = OperationCircuitBreaker.getCircuit('test-operation');
      const stats = circuit.getStats();
      
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
    });

    it('should transition to OPEN state after failure threshold', async () => {
      const circuit = OperationCircuitBreaker.getCircuit('test-operation', {
        failureThreshold: 3,
        operationTimeout: 1000
      });

      // Simulate failures
      for (let i = 0; i < 3; i++) {
        await circuit.execute(
          async () => { throw new Error('Operation failed'); },
          'fallback'
        );
      }

      const stats = circuit.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
      expect(stats.failures).toBe(3);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const circuit = OperationCircuitBreaker.getCircuit('test-operation', {
        failureThreshold: 2,
        timeout: 5000,
        operationTimeout: 1000
      });

      // Trigger circuit to open
      for (let i = 0; i < 2; i++) {
        await circuit.execute(
          async () => { throw new Error('Operation failed'); },
          'fallback'
        );
      }

      expect(circuit.getStats().state).toBe(CircuitState.OPEN);

      // Advance time past timeout
      vi.advanceTimersByTime(6000);

      // Next operation should transition to HALF_OPEN
      await circuit.execute(
        async () => 'success',
        'fallback'
      );

      const stats = circuit.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED); // Should close after success
    });

    it('should transition to CLOSED after success threshold in HALF_OPEN', async () => {
      const circuit = OperationCircuitBreaker.getCircuit('test-operation', {
        failureThreshold: 2,
        successThreshold: 2,
        timeout: 5000,
        operationTimeout: 1000
      });

      // Open circuit
      for (let i = 0; i < 2; i++) {
        await circuit.execute(
          async () => { throw new Error('Operation failed'); },
          'fallback'
        );
      }

      // Force to HALF_OPEN
      circuit.forceState(CircuitState.HALF_OPEN);

      // Execute successful operations
      for (let i = 0; i < 2; i++) {
        await circuit.execute(
          async () => 'success',
          'fallback'
        );
      }

      const stats = circuit.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('Operation Execution', () => {
    it('should execute operation successfully when circuit is CLOSED', async () => {
      const result = await OperationCircuitBreaker.safeExecute(
        'test-operation',
        async () => 'success',
        'fallback'
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.usedFallback).toBe(false);
      expect(result.circuitState).toBe(CircuitState.CLOSED);
    });

    it('should use fallback when operation fails', async () => {
      const result = await OperationCircuitBreaker.safeExecute(
        'test-operation',
        async () => { throw new Error('Operation failed'); },
        'fallback-value'
      );

      expect(result.success).toBe(false);
      expect(result.result).toBe('fallback-value');
      expect(result.usedFallback).toBe(true);
      expect(result.error).toBeInstanceOf(Error);
    });

    it('should use fallback function when provided', async () => {
      const fallbackFn = vi.fn().mockReturnValue('dynamic-fallback');

      const result = await OperationCircuitBreaker.safeExecute(
        'test-operation',
        async () => { throw new Error('Operation failed'); },
        fallbackFn
      );

      expect(result.success).toBe(false);
      expect(result.result).toBe('dynamic-fallback');
      expect(result.usedFallback).toBe(true);
      expect(fallbackFn).toHaveBeenCalled();
    });

    it('should handle async fallback functions', async () => {
      const fallbackFn = vi.fn().mockResolvedValue('async-fallback');

      const result = await OperationCircuitBreaker.safeExecute(
        'test-operation',
        async () => { throw new Error('Operation failed'); },
        fallbackFn
      );

      expect(result.success).toBe(false);
      expect(result.result).toBe('async-fallback');
      expect(result.usedFallback).toBe(true);
      expect(fallbackFn).toHaveBeenCalled();
    });

    it('should timeout operations that take too long', async () => {
      const result = await OperationCircuitBreaker.safeExecute(
        'test-operation',
        async () => {
          // Simulate long-running operation
          return new Promise(resolve => setTimeout(() => resolve('success'), 10000));
        },
        'timeout-fallback',
        { operationTimeout: 1000 }
      );

      // Advance time to trigger timeout
      vi.advanceTimersByTime(1500);

      expect(result.success).toBe(false);
      expect(result.result).toBe('timeout-fallback');
      expect(result.usedFallback).toBe(true);
      expect(result.error?.message).toContain('timeout');
    });
  });

  describe('Circuit Breaker Behavior', () => {
    it('should prevent operations when circuit is OPEN', async () => {
      const circuit = OperationCircuitBreaker.getCircuit('test-operation', {
        failureThreshold: 2,
        timeout: 5000
      });

      // Open circuit
      for (let i = 0; i < 2; i++) {
        await circuit.execute(
          async () => { throw new Error('Operation failed'); },
          'fallback'
        );
      }

      // Operation should be prevented
      const result = await circuit.execute(
        async () => 'should-not-execute',
        'circuit-open-fallback'
      );

      expect(result.success).toBe(false);
      expect(result.result).toBe('circuit-open-fallback');
      expect(result.usedFallback).toBe(true);
      expect(result.circuitState).toBe(CircuitState.OPEN);
    });

    it('should calculate failure rate correctly', async () => {
      const circuit = OperationCircuitBreaker.getCircuit('test-operation', {
        monitoringWindow: 10
      });

      // Execute mixed operations
      for (let i = 0; i < 5; i++) {
        await circuit.execute(async () => 'success', 'fallback');
      }
      for (let i = 0; i < 3; i++) {
        await circuit.execute(async () => { throw new Error('fail'); }, 'fallback');
      }

      const stats = circuit.getStats();
      expect(stats.failureRate).toBeCloseTo(3/8, 2); // 3 failures out of 8 total
    });

    it('should maintain monitoring window size', async () => {
      const circuit = OperationCircuitBreaker.getCircuit('test-operation', {
        monitoringWindow: 5
      });

      // Execute more operations than window size
      for (let i = 0; i < 10; i++) {
        await circuit.execute(async () => 'success', 'fallback');
      }

      const stats = circuit.getStats();
      expect(stats.totalRequests).toBe(10); // Total counter
      expect(stats.failureRate).toBe(0); // All recent operations were successful
    });
  });

  describe('Configuration', () => {
    it('should use custom configuration', async () => {
      const customConfig = {
        failureThreshold: 1,
        successThreshold: 1,
        timeout: 1000,
        operationTimeout: 500,
        monitoringWindow: 50
      };

      const result = await OperationCircuitBreaker.safeExecute(
        'custom-operation',
        async () => { throw new Error('fail'); },
        'fallback',
        customConfig
      );

      const circuit = OperationCircuitBreaker.getCircuit('custom-operation');
      const stats = circuit.getStats();

      expect(stats.state).toBe(CircuitState.OPEN); // Should open after 1 failure
      expect(result.usedFallback).toBe(true);
    });

    it('should use default configuration when not specified', async () => {
      const circuit = OperationCircuitBreaker.getCircuit('default-operation');
      const stats = circuit.getStats();

      // Default values should be applied
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide accurate statistics', async () => {
      const circuit = OperationCircuitBreaker.getCircuit('stats-test');

      // Execute some operations
      await circuit.execute(async () => 'success', 'fallback');
      await circuit.execute(async () => { throw new Error('fail'); }, 'fallback');
      await circuit.execute(async () => 'success', 'fallback');

      const stats = circuit.getStats();
      expect(stats.successes).toBe(2);
      expect(stats.failures).toBe(1);
      expect(stats.totalRequests).toBe(3);
      expect(stats.lastSuccessTime).toBeDefined();
      expect(stats.lastFailureTime).toBeDefined();
    });

    it('should provide all circuit statistics', () => {
      OperationCircuitBreaker.getCircuit('circuit1');
      OperationCircuitBreaker.getCircuit('circuit2');

      const allStats = OperationCircuitBreaker.getAllStats();
      expect(Object.keys(allStats)).toContain('circuit1');
      expect(Object.keys(allStats)).toContain('circuit2');
    });

    it('should reset circuit correctly', async () => {
      const circuit = OperationCircuitBreaker.getCircuit('reset-test');

      // Execute some operations
      await circuit.execute(async () => { throw new Error('fail'); }, 'fallback');
      await circuit.execute(async () => 'success', 'fallback');

      circuit.reset();

      const stats = circuit.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });

    it('should force circuit state', () => {
      const circuit = OperationCircuitBreaker.getCircuit('force-test');

      circuit.forceState(CircuitState.OPEN);
      expect(circuit.getStats().state).toBe(CircuitState.OPEN);

      circuit.forceState(CircuitState.HALF_OPEN);
      expect(circuit.getStats().state).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('Error Handling', () => {
    it('should handle fallback function errors', async () => {
      const fallbackFn = vi.fn().mockImplementation(() => {
        throw new Error('Fallback failed');
      });

      await expect(
        OperationCircuitBreaker.safeExecute(
          'error-test',
          async () => { throw new Error('Operation failed'); },
          fallbackFn
        )
      ).rejects.toThrow('Fallback failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          circuit: 'error-test'
        }),
        'Fallback execution failed'
      );
    });

    it('should track execution time', async () => {
      const result = await OperationCircuitBreaker.safeExecute(
        'timing-test',
        async () => {
          // Simulate some work
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'success';
        },
        'fallback'
      );

      vi.advanceTimersByTime(100);

      expect(result.executionTime).toBeGreaterThan(0);
    });
  });

  describe('Circuit Management', () => {
    it('should reuse existing circuits', () => {
      const circuit1 = OperationCircuitBreaker.getCircuit('shared-circuit');
      const circuit2 = OperationCircuitBreaker.getCircuit('shared-circuit');

      expect(circuit1).toBe(circuit2);
    });

    it('should remove circuits', () => {
      OperationCircuitBreaker.getCircuit('removable-circuit');
      
      const removed = OperationCircuitBreaker.removeCircuit('removable-circuit');
      expect(removed).toBe(true);

      const removedAgain = OperationCircuitBreaker.removeCircuit('removable-circuit');
      expect(removedAgain).toBe(false);
    });

    it('should reset all circuits', async () => {
      const circuit1 = OperationCircuitBreaker.getCircuit('circuit1');
      const circuit2 = OperationCircuitBreaker.getCircuit('circuit2');

      // Execute operations to change state
      await circuit1.execute(async () => { throw new Error('fail'); }, 'fallback');
      await circuit2.execute(async () => 'success', 'fallback');

      OperationCircuitBreaker.resetAll();

      expect(circuit1.getStats().failures).toBe(0);
      expect(circuit2.getStats().successes).toBe(0);
    });
  });
});
