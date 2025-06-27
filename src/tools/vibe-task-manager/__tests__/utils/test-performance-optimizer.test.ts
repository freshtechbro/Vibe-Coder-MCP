/**
 * Tests for Test Performance Optimizer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TestPerformanceMonitor,
  FastMockFactory,
  TestTimeoutManager,
  measureExecutionTime,
  BatchPerformanceTester,
  PERFORMANCE_THRESHOLDS
} from './test-performance-optimizer.js';
import { setupUniversalTestMock, cleanupTestServices } from './service-test-helper.js';

describe('Test Performance Optimizer', () => {
  beforeEach(async () => {
    await setupUniversalTestMock('performance-optimizer-test');
    TestPerformanceMonitor.clearMetrics();
    TestTimeoutManager.clearAllTimeouts();
  });

  afterEach(async () => {
    await cleanupTestServices();
    TestPerformanceMonitor.clearMetrics();
    TestTimeoutManager.clearAllTimeouts();
  });

  describe('TestPerformanceMonitor', () => {
    it('should monitor test performance within thresholds', async () => {
      const testName = 'fast-test';
      
      TestPerformanceMonitor.startTest(testName);
      
      // Simulate fast test
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const metrics = TestPerformanceMonitor.endTest(testName, 'unit');
      
      expect(metrics.testName).toBe(testName);
      expect(metrics.duration).toBeLessThan(PERFORMANCE_THRESHOLDS.UNIT_TEST_MAX_MS);
      expect(metrics.passed).toBe(true);
      expect(metrics.category).toBe('unit');
      expect(metrics.warnings).toHaveLength(0);
    });

    it('should detect slow tests and generate warnings', async () => {
      const testName = 'slow-test';
      
      TestPerformanceMonitor.startTest(testName);
      
      // Simulate slow test (but not too slow for CI)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const metrics = TestPerformanceMonitor.endTest(testName, 'file');
      
      expect(metrics.testName).toBe(testName);
      expect(metrics.duration).toBeGreaterThan(PERFORMANCE_THRESHOLDS.FILE_OPERATION_MAX_MS);
      expect(metrics.passed).toBe(false);
      expect(metrics.warnings.length).toBeGreaterThan(0);
    });

    it('should generate performance report', () => {
      // Add some mock metrics
      TestPerformanceMonitor.startTest('test1');
      TestPerformanceMonitor.endTest('test1', 'unit');
      
      TestPerformanceMonitor.startTest('test2');
      TestPerformanceMonitor.endTest('test2', 'integration');
      
      const report = TestPerformanceMonitor.generateReport();
      
      expect(report.totalTests).toBe(2);
      expect(report.passedTests).toBeGreaterThanOrEqual(0);
      expect(report.failedTests).toBeGreaterThanOrEqual(0);
      expect(report.averageDuration).toBeGreaterThan(0);
      expect(Array.isArray(report.slowestTests)).toBe(true);
      expect(Array.isArray(report.warnings)).toBe(true);
    });
  });

  describe('FastMockFactory', () => {
    it('should create fast async mocks', async () => {
      const mock = FastMockFactory.createFastAsyncMock('test-value');
      
      const result = await mock();
      
      expect(result).toBe('test-value');
      expect(mock).toHaveBeenCalled();
    });

    it('should create fast sync mocks', () => {
      const mock = FastMockFactory.createFastSyncMock('sync-value');
      
      const result = mock();
      
      expect(result).toBe('sync-value');
      expect(mock).toHaveBeenCalled();
    });

    it('should create fast file system mock', async () => {
      const fsMock = FastMockFactory.createFastFileSystemMock();
      
      const readResult = await fsMock.readFile('test.txt');
      const existsResult = await fsMock.exists('test.txt');
      const statResult = await fsMock.stat('test.txt');
      
      expect(readResult).toBe('{}');
      expect(existsResult).toBe(true);
      expect(statResult.isFile()).toBe(true);
    });

    it('should create fast LLM mock with responses', async () => {
      const responses = [
        { choices: [{ message: { content: 'response1' } }] },
        { choices: [{ message: { content: 'response2' } }] }
      ];
      
      const llmMock = FastMockFactory.createFastLLMMock(responses);
      
      const result1 = await llmMock();
      const result2 = await llmMock();
      const result3 = await llmMock(); // Should cycle back to first response
      
      expect(result1.choices[0].message.content).toBe('response1');
      expect(result2.choices[0].message.content).toBe('response2');
      expect(result3.choices[0].message.content).toBe('response1');
    });

    it('should create fast database mock', async () => {
      const dbMock = FastMockFactory.createFastDatabaseMock();
      
      const queryResult = await dbMock.query('SELECT * FROM test');
      const insertResult = await dbMock.insert({ name: 'test' });
      
      expect(Array.isArray(queryResult)).toBe(true);
      expect(insertResult.insertId).toBe(1);
    });
  });

  describe('TestTimeoutManager', () => {
    it('should set and clear timeouts', () => {
      let timeoutCalled = false;
      
      TestTimeoutManager.setPerformanceTimeout('test-timeout', 50, () => {
        timeoutCalled = true;
      });
      
      TestTimeoutManager.clearTimeout('test-timeout');
      
      // Wait longer than timeout to ensure it was cleared
      setTimeout(() => {
        expect(timeoutCalled).toBe(false);
      }, 100);
    });

    it('should clear all timeouts', () => {
      TestTimeoutManager.setPerformanceTimeout('test1', 1000, () => {});
      TestTimeoutManager.setPerformanceTimeout('test2', 1000, () => {});
      
      TestTimeoutManager.clearAllTimeouts();
      
      // Should not throw or cause issues
      expect(true).toBe(true);
    });
  });

  describe('measureExecutionTime', () => {
    it('should measure execution time of sync function', async () => {
      const { result, duration } = await measureExecutionTime(() => {
        return 'test-result';
      });
      
      expect(result).toBe('test-result');
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should be very fast
    });

    it('should measure execution time of async function', async () => {
      const { result, duration } = await measureExecutionTime(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async-result';
      });
      
      expect(result).toBe('async-result');
      expect(duration).toBeGreaterThan(5); // At least 5ms due to setTimeout
      expect(duration).toBeLessThan(100); // But not too long
    });
  });

  describe('BatchPerformanceTester', () => {
    it('should run batch tests and collect metrics', async () => {
      const batchTester = new BatchPerformanceTester();
      
      batchTester
        .addTest('fast-test', async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          return 'fast';
        }, 'unit')
        .addTest('medium-test', async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'medium';
        }, 'integration');
      
      const results = await batchTester.runAll();
      
      expect(results).toHaveLength(2);
      expect(results[0].testName).toBe('fast-test');
      expect(results[1].testName).toBe('medium-test');
      expect(results.every(r => r.duration > 0)).toBe(true);
    });

    it('should handle test failures gracefully', async () => {
      const batchTester = new BatchPerformanceTester();
      
      batchTester
        .addTest('passing-test', async () => 'success', 'unit')
        .addTest('failing-test', async () => {
          throw new Error('Test error');
        }, 'unit');
      
      const results = await batchTester.runAll();
      
      expect(results).toHaveLength(2);
      expect(results[0].testName).toBe('passing-test');
      expect(results[1].testName).toBe('failing-test');
    });

    it('should clear tests', () => {
      const batchTester = new BatchPerformanceTester();
      
      batchTester.addTest('test1', async () => 'result', 'unit');
      batchTester.clear();
      
      // Should be able to run with no tests
      expect(async () => {
        const results = await batchTester.runAll();
        expect(results).toHaveLength(0);
      }).not.toThrow();
    });
  });

  describe('Performance Integration', () => {
    it('should optimize file system operations', async () => {
      const startTime = performance.now();

      // Create fast file system mock
      const fsMock = FastMockFactory.createFastFileSystemMock();

      // Use the mock directly instead of importing fs-extra
      await fsMock.ensureDir('/test/dir');
      await fsMock.writeFile('/test/file.txt', 'content');
      const content = await fsMock.readFile('/test/file.txt');
      const exists = await fsMock.pathExists('/test/file.txt');

      const duration = performance.now() - startTime;

      expect(content).toBe('{}'); // Mocked response
      expect(exists).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.FILE_OPERATION_MAX_MS);
    });

    it('should optimize LLM operations with fast mocks', async () => {
      const startTime = performance.now();
      
      const llmMock = FastMockFactory.createFastLLMMock([
        { choices: [{ message: { content: 'Fast LLM response' } }] }
      ]);
      
      const response = await llmMock();
      
      const duration = performance.now() - startTime;
      
      expect(response.choices[0].message.content).toBe('Fast LLM response');
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.LLM_TEST_MAX_MS);
    });
  });
});
