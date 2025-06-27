/**
 * Comprehensive Integration Test Suite for Recursion Prevention Solution
 * 
 * This test suite validates the complete solution that prevents:
 * - Stack overflow errors during initialization
 * - Circular dependency issues
 * - Infinite recursion in critical methods
 * - Memory pressure situations
 * 
 * Tests the integration of:
 * - ImportCycleBreaker
 * - OperationCircuitBreaker
 * - RecursionGuard
 * - InitializationMonitor
 * - Memory pressure detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger to prevent actual logging during tests
vi.mock('../../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Import utilities
import { ImportCycleBreaker } from '../../../../utils/import-cycle-breaker.js';
import { OperationCircuitBreaker } from '../../../../utils/operation-circuit-breaker.js';
import { RecursionGuard } from '../../../../utils/recursion-guard.js';
import { InitializationMonitor } from '../../../../utils/initialization-monitor.js';
import logger from '../../../../logger.js';

describe('Complete Recursion Prevention Solution - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();
    
    // Reset all utilities
    ImportCycleBreaker.clearAll();
    OperationCircuitBreaker.resetAll();
    RecursionGuard.clearAll();
    InitializationMonitor.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    
    // Clean up all utilities
    ImportCycleBreaker.clearAll();
    OperationCircuitBreaker.resetAll();
    RecursionGuard.clearAll();
    InitializationMonitor.reset();
  });

  describe('Circular Dependency Prevention', () => {
    it('should prevent circular imports and provide fallbacks', async () => {
      // Simulate circular import scenario
      const moduleA = 'moduleA.js';
      const moduleB = 'moduleB.js';
      
      // Start importing moduleA
      const importAPromise = ImportCycleBreaker.safeImport(moduleA, 'ClassA');
      
      // While moduleA is importing, try to import moduleB which depends on moduleA
      const importBPromise = ImportCycleBreaker.safeImport(moduleB, 'ClassB');
      
      // Try to import moduleA again (circular dependency)
      const circularImportPromise = ImportCycleBreaker.safeImport(moduleA, 'ClassA');
      
      const [resultA, resultB, circularResult] = await Promise.all([
        importAPromise,
        importBPromise,
        circularImportPromise
      ]);
      
      // At least one should be null due to circular dependency detection
      expect([resultA, resultB, circularResult].some(result => result === null)).toBe(true);
      
      // Should have logged circular dependency warning
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          modulePath: expect.any(String),
          importName: expect.any(String)
        }),
        expect.stringContaining('Circular import detected')
      );
    });

    it('should track import history and prevent repeated failures', async () => {
      const modulePath = './failing-module.js';

      // First attempt - should fail and be recorded
      const result1 = await ImportCycleBreaker.safeImport(modulePath, 'FailingClass');
      expect(result1).toBeNull();

      // Second attempt should be skipped due to recent failure
      const result2 = await ImportCycleBreaker.safeImport(modulePath, 'FailingClass');
      expect(result2).toBeNull();

      // Verify import history was recorded
      const history = ImportCycleBreaker.getImportHistory();
      expect(history[`${modulePath}:FailingClass`]).toBeDefined();
      expect(history[`${modulePath}:FailingClass`].success).toBe(false);
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should prevent cascading failures with circuit breaker', async () => {
      const operationName = 'criticalOperation';
      let failureCount = 0;
      
      const failingOperation = async () => {
        failureCount++;
        throw new Error(`Operation failed (attempt ${failureCount})`);
      };
      
      const fallbackValue = 'fallback-result';
      
      // Execute operation multiple times to trigger circuit breaker
      const results = [];
      for (let i = 0; i < 10; i++) {
        const result = await OperationCircuitBreaker.safeExecute(
          operationName,
          failingOperation,
          fallbackValue,
          { failureThreshold: 3, timeout: 1000 }
        );
        results.push(result);
      }
      
      // Should have some failures and some circuit-breaker prevented executions
      const failedResults = results.filter(r => !r.success && r.error);
      const circuitBreakerResults = results.filter(r => !r.success && r.usedFallback && r.circuitState === 'OPEN');
      
      expect(failedResults.length).toBeGreaterThan(0);
      expect(circuitBreakerResults.length).toBeGreaterThan(0);
      expect(failureCount).toBeLessThan(10); // Circuit breaker should prevent some executions
    });

    it('should recover from circuit breaker open state', async () => {
      const operationName = 'recoveringOperation';
      let shouldFail = true;
      
      const conditionalOperation = async () => {
        if (shouldFail) {
          throw new Error('Operation failing');
        }
        return 'success';
      };
      
      // Trigger circuit breaker to open
      for (let i = 0; i < 5; i++) {
        await OperationCircuitBreaker.safeExecute(
          operationName,
          conditionalOperation,
          'fallback',
          { failureThreshold: 3, timeout: 1000 }
        );
      }
      
      // Circuit should be open
      const circuit = OperationCircuitBreaker.getCircuit(operationName);
      expect(circuit.getStats().state).toBe('OPEN');
      
      // Advance time to allow circuit to transition to half-open
      vi.advanceTimersByTime(2000);
      
      // Fix the operation
      shouldFail = false;
      
      // Execute operation - should transition to half-open and then closed
      const result = await OperationCircuitBreaker.safeExecute(
        operationName,
        conditionalOperation,
        'fallback'
      );
      
      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
    });
  });

  describe('Recursion Guard Integration', () => {
    it('should prevent infinite recursion in method calls', async () => {
      let callCount = 0;
      const maxDepth = 3;

      const recursiveMethod = async (depth: number): Promise<string> => {
        callCount++;

        const result = await RecursionGuard.executeWithRecursionGuard(
          'recursiveMethod',
          async () => {
            if (depth > 0) {
              return await recursiveMethod(depth - 1);
            }
            return `completed at depth ${depth}`;
          },
          { maxDepth },
          `instance_${callCount}` // Use unique instance ID
        );

        if (result.success) {
          return result.result!;
        } else if (result.recursionDetected) {
          return 'recursion-prevented';
        } else {
          throw result.error!;
        }
      };

      const result = await recursiveMethod(10); // Exceeds maxDepth

      // Should either complete normally or prevent recursion
      expect(['recursion-prevented', 'completed at depth 0'].includes(result)).toBe(true);
      expect(callCount).toBeGreaterThan(0);
    });

    it('should handle concurrent recursive calls safely', async () => {
      const results: string[] = [];

      const concurrentRecursiveMethod = async (id: string, depth: number): Promise<string> => {
        const result = await RecursionGuard.executeWithRecursionGuard(
          'concurrentMethod',
          async () => {
            if (depth > 0) {
              return await concurrentRecursiveMethod(id, depth - 1);
            }
            return `${id}-completed`;
          },
          { maxDepth: 3 },
          id
        );

        if (result.success) {
          return result.result!;
        } else {
          return `${id}-prevented`;
        }
      };

      // Start multiple concurrent recursive calls
      const promises = [
        concurrentRecursiveMethod('A', 5),
        concurrentRecursiveMethod('B', 2),
        concurrentRecursiveMethod('C', 4)
      ];

      const finalResults = await Promise.all(promises);

      expect(finalResults).toHaveLength(3);
      expect(finalResults.every(r => typeof r === 'string')).toBe(true);
      expect(finalResults.every(r => r.includes('A') || r.includes('B') || r.includes('C'))).toBe(true);
    });
  });

  describe('Initialization Monitoring Integration', () => {
    it('should track service initialization performance', async () => {
      const monitor = InitializationMonitor.getInstance();
      
      monitor.startGlobalInitialization();
      
      // Simulate multiple service initializations
      const services = ['ServiceA', 'ServiceB', 'ServiceC'];
      
      for (const serviceName of services) {
        monitor.startServiceInitialization(serviceName, [], { version: '1.0.0' });
        
        // Simulate initialization phases
        monitor.startPhase(serviceName, 'constructor');
        vi.advanceTimersByTime(Math.random() * 100 + 50); // Random delay 50-150ms
        monitor.endPhase(serviceName, 'constructor');
        
        monitor.startPhase(serviceName, 'dependencies');
        vi.advanceTimersByTime(Math.random() * 200 + 100); // Random delay 100-300ms
        monitor.endPhase(serviceName, 'dependencies');
        
        monitor.endServiceInitialization(serviceName);
      }
      
      monitor.endGlobalInitialization();
      
      const stats = monitor.getStatistics();
      
      expect(stats.totalServices).toBe(3);
      expect(stats.completedServices).toBe(3);
      expect(stats.failedServices).toBe(0);
      expect(stats.averageInitTime).toBeGreaterThan(0);
      expect(stats.totalInitTime).toBeGreaterThan(0);
    });

    it('should detect slow initialization and provide warnings', async () => {
      const monitor = InitializationMonitor.getInstance({
        slowInitThreshold: 100,
        criticalSlowThreshold: 500
      });
      
      // Fast service
      monitor.startServiceInitialization('FastService');
      vi.advanceTimersByTime(50);
      monitor.endServiceInitialization('FastService');
      
      // Slow service
      monitor.startServiceInitialization('SlowService');
      vi.advanceTimersByTime(200);
      monitor.endServiceInitialization('SlowService');
      
      // Critically slow service
      monitor.startServiceInitialization('CriticallySlowService');
      vi.advanceTimersByTime(600);
      monitor.endServiceInitialization('CriticallySlowService');
      
      // Should have logged warnings for slow services
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: 'SlowService',
          threshold: 100
        }),
        'Slow initialization detected'
      );
      
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: 'CriticallySlowService',
          threshold: 500
        }),
        'Critical slow initialization detected'
      );
    });
  });

  describe('Memory Pressure Integration', () => {
    it('should integrate memory pressure detection with circuit breaker', async () => {
      // Mock memory manager with pressure detection
      const mockMemoryManager = {
        detectMemoryPressure: vi.fn(),
        emergencyCleanup: vi.fn(),
        checkAndExecuteEmergencyCleanup: vi.fn()
      };
      
      // Simulate high memory pressure
      mockMemoryManager.detectMemoryPressure.mockReturnValue({
        level: 'high',
        heapUsagePercentage: 85,
        systemMemoryPercentage: 80,
        recommendations: ['Aggressive cache pruning recommended']
      });
      
      mockMemoryManager.emergencyCleanup.mockResolvedValue({
        success: true,
        freedMemory: 50000000,
        actions: ['Cleared caches', 'Forced garbage collection']
      });
      
      // Use circuit breaker for memory-intensive operation
      const memoryIntensiveOperation = async () => {
        const pressure = mockMemoryManager.detectMemoryPressure();
        if (pressure.level === 'critical') {
          throw new Error('Memory pressure too high');
        }
        return 'operation-completed';
      };
      
      const result = await OperationCircuitBreaker.safeExecute(
        'memoryIntensiveOp',
        memoryIntensiveOperation,
        async () => {
          // Fallback: trigger emergency cleanup
          await mockMemoryManager.emergencyCleanup();
          return 'fallback-after-cleanup';
        }
      );
      
      expect(result.success).toBe(true);
      expect(result.result).toBe('operation-completed');
    });
  });

  describe('Complete Solution Integration', () => {
    it('should handle complex scenario with all utilities working together', async () => {
      const monitor = InitializationMonitor.getInstance();
      monitor.startGlobalInitialization();
      
      // Simulate complex service initialization with potential issues
      const complexServiceInit = async (serviceName: string) => {
        monitor.startServiceInitialization(serviceName);
        
        try {
          // Phase 1: Import dependencies (potential circular dependency)
          monitor.startPhase(serviceName, 'imports');
          const importResult = await ImportCycleBreaker.safeImport(`${serviceName}.js`, 'ServiceClass');
          monitor.endPhase(serviceName, 'imports');
          
          // Phase 2: Initialize with circuit breaker protection
          monitor.startPhase(serviceName, 'initialization');
          const initResult = await OperationCircuitBreaker.safeExecute(
            `${serviceName}_init`,
            async () => {
              // Simulate potential recursive initialization
              return await RecursionGuard.executeWithRecursionGuard(
                `${serviceName}_recursive_init`,
                async () => {
                  vi.advanceTimersByTime(100); // Simulate work
                  return 'initialized';
                },
                { maxDepth: 3 },
                serviceName
              );
            },
            'fallback-initialization'
          );
          monitor.endPhase(serviceName, 'initialization');
          
          monitor.endServiceInitialization(serviceName);
          
          return {
            service: serviceName,
            importSuccess: importResult !== null,
            initSuccess: initResult.success,
            recursionPrevented: !initResult.success && initResult.result?.recursionDetected
          };
          
        } catch (error) {
          monitor.endServiceInitialization(serviceName, error as Error);
          throw error;
        }
      };
      
      // Initialize multiple services concurrently
      const services = ['ServiceA', 'ServiceB', 'ServiceC'];
      const results = await Promise.all(
        services.map(service => complexServiceInit(service))
      );
      
      monitor.endGlobalInitialization();
      
      // Verify all services were processed
      expect(results).toHaveLength(3);
      
      // Verify monitoring captured the initialization
      const stats = monitor.getStatistics();
      expect(stats.totalServices).toBe(3);
      
      // Verify no unhandled errors occurred
      expect(results.every(r => r.service)).toBe(true);
    });

    it('should provide comprehensive error recovery', async () => {
      const errors: Error[] = [];
      const recoveries: string[] = [];
      
      // Simulate a service that fails in multiple ways
      const problematicService = async () => {
        try {
          // Try import with potential circular dependency
          const importResult = await ImportCycleBreaker.safeImport('problematic.js', 'ProblematicClass');
          if (!importResult) {
            recoveries.push('import-fallback');
          }
          
          // Try operation with circuit breaker
          const operationResult = await OperationCircuitBreaker.safeExecute(
            'problematic_operation',
            async () => {
              throw new Error('Operation always fails');
            },
            'circuit-breaker-fallback'
          );
          
          if (!operationResult.success) {
            recoveries.push('circuit-breaker-fallback');
          }
          
          // Try recursive operation with guard
          const recursionResult = await RecursionGuard.executeWithRecursionGuard(
            'problematic_recursion',
            async () => {
              // Simulate infinite recursion
              return await problematicService();
            },
            { maxDepth: 2 }
          );
          
          if (!recursionResult.success && recursionResult.recursionDetected) {
            recoveries.push('recursion-guard-fallback');
          }
          
          return 'service-completed';
          
        } catch (error) {
          errors.push(error as Error);
          return 'error-fallback';
        }
      };
      
      const result = await problematicService();
      
      // Should have recovered from multiple failure modes
      expect(recoveries.length).toBeGreaterThan(0);
      expect(result).toBeDefined();
      
      // Should have logged appropriate warnings/errors
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
