/**
 * Test helper utilities for consistent test setup and cleanup
 */

import { beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import logger from '../../../../logger.js';
import {
  performTestCleanup,
  registerEventEmitter,
  registerCleanupFunction,
  registerSingleton,
  getMemoryUsage
} from './test-cleanup.js';
import { initializeTestServices, resetTestServices } from '../setup.js';
import { registerSingletonForReset, resetSingleton } from './singleton-reset-manager.js';
import { memoryUtils, testMemoryOptimizer } from './memory-optimizer.js';

/**
 * Enhanced test wrapper that provides automatic cleanup
 */
export function withTestCleanup(testName?: string) {
  const testId = testName || `test-${Date.now()}`;
  let startMemory: ReturnType<typeof getMemoryUsage>;
  
  beforeEach(async () => {
    // Optimize memory before test
    memoryUtils.optimizeBeforeTest();

    // Record starting memory
    startMemory = getMemoryUsage();

    // Ensure test services are initialized
    initializeTestServices();

    logger.debug({ testId, memory: startMemory.formatted }, 'Test started');
  });
  
  afterEach(async () => {
    try {
      // Perform cleanup
      await performTestCleanup();

      // Optimize memory after test and check for leaks
      const leakDetection = memoryUtils.optimizeAfterTest();

      // Record ending memory
      const endMemory = getMemoryUsage();
      const memoryDiff = endMemory.heapUsed - startMemory.heapUsed;

      // Enhanced memory leak detection
      if (leakDetection?.hasLeaks) {
        logger.warn({
          testId,
          leakSeverity: leakDetection.leakSeverity,
          warnings: leakDetection.warnings,
          recommendations: leakDetection.recommendations
        }, 'Memory leaks detected');
      }

      if (memoryDiff > 10 * 1024 * 1024) { // > 10MB increase
        logger.warn({
          testId,
          startMemory: startMemory.formatted.heapUsed,
          endMemory: endMemory.formatted.heapUsed,
          diff: `${Math.round(memoryDiff / 1024 / 1024)} MB`
        }, 'Significant memory increase detected');
      }

      logger.debug({ testId, memory: endMemory.formatted }, 'Test cleanup completed');
    } catch (error) {
      logger.error({ err: error, testId }, 'Test cleanup failed');
    }
  });
}

/**
 * Create a test EventEmitter with automatic cleanup
 */
export function createTestEventEmitter(name?: string): EventEmitter {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50); // Higher limit for tests
  registerEventEmitter(emitter, name);
  return emitter;
}

/**
 * Create a test service with automatic cleanup
 */
export function createTestService<T>(
  name: string,
  factory: () => T,
  cleanupMethod?: keyof T
): T {
  const service = factory();
  
  if (cleanupMethod && typeof service[cleanupMethod] === 'function') {
    registerCleanupFunction(name, () => (service[cleanupMethod] as any)());
  }
  
  return service;
}

/**
 * Register a singleton for automatic reset
 */
export function registerTestSingleton(
  name: string,
  getInstanceOrInstance: (() => any) | any,
  resetMethod?: string
): void {
  // Register with both the legacy system and the enhanced singleton manager
  const instance = typeof getInstanceOrInstance === 'function'
    ? getInstanceOrInstance()
    : getInstanceOrInstance;

  // Legacy registration
  registerSingleton(name, instance, resetMethod);

  // Enhanced registration
  if (typeof getInstanceOrInstance === 'function') {
    registerSingletonForReset({
      name,
      getInstance: getInstanceOrInstance,
      resetMethod
    });
  }
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const result = await condition();
    if (result) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Create a mock function with automatic cleanup
 */
export function createMockFunction<T extends (...args: any[]) => any>(
  name: string,
  implementation?: T
): T & { cleanup: () => void } {
  const calls: Array<{ args: Parameters<T>; result: ReturnType<T>; timestamp: number }> = [];
  
  const mockFn = ((...args: Parameters<T>): ReturnType<T> => {
    const result = implementation ? implementation(...args) : undefined;
    calls.push({ args, result, timestamp: Date.now() });
    return result;
  }) as T & { cleanup: () => void };
  
  mockFn.cleanup = () => {
    calls.length = 0;
  };
  
  // Register for cleanup
  registerCleanupFunction(`mock-${name}`, mockFn.cleanup);
  
  return mockFn;
}

/**
 * Test timeout wrapper
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 100,
  backoffMultiplier: number = 2
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}

/**
 * Create a test configuration with overrides
 */
export function createTestConfig(overrides: any = {}): any {
  const baseConfig = {
    maxConcurrentTasks: 2,
    defaultTaskTemplate: 'test',
    dataDirectory: process.env.TEST_OUTPUT_DIR || '/tmp/test',
    timeouts: {
      taskExecution: 10000,
      taskDecomposition: 15000,
      llmRequest: 10000,
      fileOperations: 2000,
      databaseOperations: 2000,
      networkOperations: 5000
    },
    retryPolicy: {
      maxRetries: 1,
      backoffMultiplier: 1.5,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      enableExponentialBackoff: true
    }
  };
  
  return { ...baseConfig, ...overrides };
}

/**
 * Assert memory usage is within acceptable limits
 */
export function assertMemoryUsage(maxHeapMB: number = 500): void {
  const usage = getMemoryUsage();
  const heapMB = usage.heapUsed / 1024 / 1024;

  if (heapMB > maxHeapMB) {
    throw new Error(`Memory usage too high: ${Math.round(heapMB)}MB > ${maxHeapMB}MB`);
  }
}

/**
 * Monitor memory usage during test execution
 */
export function withMemoryMonitoring(testName?: string) {
  const testId = testName || `memory-test-${Date.now()}`;

  beforeEach(() => {
    memoryUtils.optimizeBeforeTest();
    logger.debug({ testId }, 'Memory monitoring started for test');
  });

  afterEach(() => {
    const leakDetection = memoryUtils.optimizeAfterTest();

    if (leakDetection?.hasLeaks) {
      logger.warn({
        testId,
        leakDetection
      }, 'Memory issues detected during test');
    }

    logger.debug({ testId }, 'Memory monitoring completed for test');
  });
}

/**
 * Check memory health and throw if unhealthy
 */
export function ensureMemoryHealth(): void {
  if (!memoryUtils.checkMemoryHealth()) {
    const current = memoryUtils.getCurrentMemory();
    throw new Error(`Memory health check failed: ${current.formatted.heapUsed} heap usage`);
  }
}

/**
 * Force memory cleanup and optimization
 */
export function forceMemoryOptimization(): void {
  memoryUtils.forceCleanup();

  // Additional cleanup for test environment
  if (global.gc) {
    // Multiple GC cycles for thorough cleanup
    global.gc();
    setTimeout(() => global.gc && global.gc(), 50);
    setTimeout(() => global.gc && global.gc(), 100);
  }
}

/**
 * Create a memory-optimized test environment
 */
export function withMemoryOptimization(options: {
  maxHeapMB?: number;
  enableMonitoring?: boolean;
  forceCleanup?: boolean;
} = {}) {
  const { maxHeapMB = 200, enableMonitoring = true, forceCleanup = true } = options;

  beforeEach(() => {
    if (forceCleanup) {
      forceMemoryOptimization();
    }

    if (enableMonitoring) {
      testMemoryOptimizer.startMonitoring();
    }
  });

  afterEach(() => {
    if (enableMonitoring) {
      const leakDetection = testMemoryOptimizer.stopMonitoring();

      if (leakDetection?.hasLeaks && leakDetection.leakSeverity !== 'low') {
        logger.warn({ leakDetection }, 'Memory optimization detected issues');
      }
    }

    if (forceCleanup) {
      forceMemoryOptimization();
    }

    // Assert memory usage is within limits
    try {
      assertMemoryUsage(maxHeapMB);
    } catch (error) {
      logger.error({ err: error }, 'Memory usage assertion failed');
      // Force cleanup and retry
      forceMemoryOptimization();
      assertMemoryUsage(maxHeapMB * 1.2); // Allow 20% tolerance after cleanup
    }
  });
}
