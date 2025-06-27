/**
 * Test Performance Optimizer
 * Provides utilities for optimizing test execution speed and performance
 */

import { vi } from 'vitest';
import logger from '../../../../logger.js';

/**
 * Performance thresholds for different test types
 */
export const PERFORMANCE_THRESHOLDS = {
  UNIT_TEST_MAX_MS: 5000,      // 5 seconds for unit tests
  INTEGRATION_TEST_MAX_MS: 60000, // 60 seconds for integration tests
  LLM_TEST_MAX_MS: 2000,       // 2 seconds for LLM tests (should be mocked)
  FAST_MOCK_MAX_MS: 100,       // 100ms for fast mocks
  FILE_OPERATION_MAX_MS: 50,   // 50ms for file operations (should be mocked)
} as const;

/**
 * Test performance metrics
 */
export interface TestPerformanceMetrics {
  testName: string;
  startTime: number;
  endTime: number;
  duration: number;
  threshold: number;
  passed: boolean;
  category: 'unit' | 'integration' | 'llm' | 'file' | 'custom';
  warnings: string[];
}

/**
 * Performance monitoring utility for tests
 */
export class TestPerformanceMonitor {
  private static metrics = new Map<string, TestPerformanceMetrics>();
  private static activeTests = new Map<string, number>();

  /**
   * Start monitoring a test
   */
  static startTest(testName: string, category: keyof typeof PERFORMANCE_THRESHOLDS = 'UNIT_TEST_MAX_MS'): void {
    const startTime = performance.now();
    this.activeTests.set(testName, startTime);
    
    logger.debug(`Performance monitoring started for test: ${testName}`, { 
      category, 
      threshold: PERFORMANCE_THRESHOLDS[category] 
    });
  }

  /**
   * End monitoring a test and record metrics
   */
  static endTest(testName: string, category: 'unit' | 'integration' | 'llm' | 'file' | 'custom' = 'unit'): TestPerformanceMetrics {
    const endTime = performance.now();
    const startTime = this.activeTests.get(testName);

    if (!startTime) {
      // If test wasn't started, create a minimal metrics object
      logger.warn(`Test ${testName} was not started, creating default metrics`);
      return {
        testName,
        duration: 0,
        category,
        threshold: PERFORMANCE_THRESHOLDS[this.getThresholdKey(category)],
        passed: true,
        warnings: ['Test was not properly started'],
        timestamp: new Date()
      };
    }

    const duration = endTime - startTime;
    const thresholdKey = this.getThresholdKey(category);
    const threshold = PERFORMANCE_THRESHOLDS[thresholdKey];
    const passed = duration <= threshold;
    const warnings: string[] = [];

    // Generate performance warnings
    if (!passed) {
      warnings.push(`Test exceeded ${category} threshold: ${duration.toFixed(2)}ms > ${threshold}ms`);
    }

    if (category === 'llm' && duration > PERFORMANCE_THRESHOLDS.LLM_TEST_MAX_MS) {
      warnings.push('LLM test should use mocks for better performance');
    }

    if (category === 'file' && duration > PERFORMANCE_THRESHOLDS.FILE_OPERATION_MAX_MS) {
      warnings.push('File operations should be mocked for better performance');
    }

    const metrics: TestPerformanceMetrics = {
      testName,
      startTime,
      endTime,
      duration,
      threshold,
      passed,
      category,
      warnings
    };

    this.metrics.set(testName, metrics);
    this.activeTests.delete(testName);

    // Log performance results
    if (passed) {
      logger.debug(`✅ Test performance: ${testName} completed in ${duration.toFixed(2)}ms`);
    } else {
      logger.warn(`⚠️ Test performance: ${testName} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`, {
        warnings
      });
    }

    return metrics;
  }

  /**
   * Get threshold key for category
   */
  private static getThresholdKey(category: string): keyof typeof PERFORMANCE_THRESHOLDS {
    switch (category) {
      case 'unit': return 'UNIT_TEST_MAX_MS';
      case 'integration': return 'INTEGRATION_TEST_MAX_MS';
      case 'llm': return 'LLM_TEST_MAX_MS';
      case 'file': return 'FILE_OPERATION_MAX_MS';
      default: return 'UNIT_TEST_MAX_MS';
    }
  }

  /**
   * Get all recorded metrics
   */
  static getAllMetrics(): TestPerformanceMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get metrics for a specific test
   */
  static getTestMetrics(testName: string): TestPerformanceMetrics | undefined {
    return this.metrics.get(testName);
  }

  /**
   * Clear all metrics
   */
  static clearMetrics(): void {
    this.metrics.clear();
    this.activeTests.clear();
  }

  /**
   * Generate performance report
   */
  static generateReport(): {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    averageDuration: number;
    slowestTests: TestPerformanceMetrics[];
    warnings: string[];
  } {
    const allMetrics = this.getAllMetrics();
    const passedTests = allMetrics.filter(m => m.passed).length;
    const failedTests = allMetrics.length - passedTests;
    const averageDuration = allMetrics.reduce((sum, m) => sum + m.duration, 0) / allMetrics.length;
    const slowestTests = allMetrics
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);
    const warnings = allMetrics.flatMap(m => m.warnings);

    return {
      totalTests: allMetrics.length,
      passedTests,
      failedTests,
      averageDuration,
      slowestTests,
      warnings
    };
  }
}

/**
 * Performance-optimized mock factory
 */
export class FastMockFactory {
  /**
   * Create fast async mock that resolves immediately
   */
  static createFastAsyncMock<T = any>(returnValue?: T): any {
    return vi.fn().mockResolvedValue(returnValue);
  }

  /**
   * Create fast sync mock that returns immediately
   */
  static createFastSyncMock<T = any>(returnValue?: T): any {
    return vi.fn().mockReturnValue(returnValue);
  }

  /**
   * Create fast file system mock
   */
  static createFastFileSystemMock() {
    return {
      readFile: this.createFastAsyncMock('{}'),
      writeFile: this.createFastAsyncMock(undefined),
      exists: this.createFastAsyncMock(true),
      stat: this.createFastAsyncMock({ isFile: () => true, isDirectory: () => false }),
      mkdir: this.createFastAsyncMock(undefined),
      rmdir: this.createFastAsyncMock(undefined)
    };
  }

  /**
   * Create fast LLM mock with realistic response structure
   */
  static createFastLLMMock(responses: any[] = []) {
    let responseIndex = 0;
    return vi.fn().mockImplementation(() => {
      const response = responses[responseIndex] || { 
        choices: [{ message: { content: '{}' } }] 
      };
      responseIndex = (responseIndex + 1) % Math.max(responses.length, 1);
      return Promise.resolve(response);
    });
  }

  /**
   * Create fast database mock
   */
  static createFastDatabaseMock() {
    return {
      query: this.createFastAsyncMock([]),
      insert: this.createFastAsyncMock({ insertId: 1 }),
      update: this.createFastAsyncMock({ affectedRows: 1 }),
      delete: this.createFastAsyncMock({ affectedRows: 1 }),
      transaction: this.createFastAsyncMock(undefined)
    };
  }
}

/**
 * Test timeout utilities
 */
export class TestTimeoutManager {
  private static timeouts = new Map<string, NodeJS.Timeout>();

  /**
   * Set a performance timeout for a test
   */
  static setPerformanceTimeout(testName: string, timeoutMs: number, callback: () => void): void {
    const timeout = setTimeout(() => {
      logger.warn(`Test ${testName} exceeded performance timeout of ${timeoutMs}ms`);
      callback();
    }, timeoutMs);

    this.timeouts.set(testName, timeout);
  }

  /**
   * Clear timeout for a test
   */
  static clearTimeout(testName: string): void {
    const timeout = this.timeouts.get(testName);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(testName);
    }
  }

  /**
   * Clear all timeouts
   */
  static clearAllTimeouts(): void {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
  }
}

/**
 * Decorator for automatic performance monitoring
 */
export function monitorPerformance(category: 'unit' | 'integration' | 'llm' | 'file' | 'custom' = 'unit') {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const testName = `${target.constructor.name}.${propertyName}`;
      TestPerformanceMonitor.startTest(testName, TestPerformanceMonitor['getThresholdKey'](category));
      
      try {
        const result = await method.apply(this, args);
        TestPerformanceMonitor.endTest(testName, category);
        return result;
      } catch (error) {
        TestPerformanceMonitor.endTest(testName, category);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Utility function to measure execution time
 */
export async function measureExecutionTime<T>(
  fn: () => Promise<T> | T,
  testName?: string
): Promise<{ result: T; duration: number }> {
  const startTime = performance.now();
  const result = await fn();
  const endTime = performance.now();
  const duration = endTime - startTime;

  if (testName) {
    logger.debug(`Execution time for ${testName}: ${duration.toFixed(2)}ms`);
  }

  return { result, duration };
}

/**
 * Batch performance testing utility
 */
export class BatchPerformanceTester {
  private tests: Array<{ name: string; fn: () => Promise<any>; category: string }> = [];

  /**
   * Add a test to the batch
   */
  addTest(name: string, fn: () => Promise<any>, category: 'unit' | 'integration' | 'llm' | 'file' | 'custom' = 'unit'): this {
    this.tests.push({ name, fn, category });
    return this;
  }

  /**
   * Run all tests and collect performance metrics
   */
  async runAll(): Promise<TestPerformanceMetrics[]> {
    const results: TestPerformanceMetrics[] = [];

    for (const test of this.tests) {
      TestPerformanceMonitor.startTest(test.name);
      
      try {
        await test.fn();
        const metrics = TestPerformanceMonitor.endTest(test.name, test.category as any);
        results.push(metrics);
      } catch (error) {
        const metrics = TestPerformanceMonitor.endTest(test.name, test.category as any);
        results.push(metrics);
        logger.error(`Test ${test.name} failed`, { error });
      }
    }

    return results;
  }

  /**
   * Clear all tests
   */
  clear(): void {
    this.tests = [];
  }
}
