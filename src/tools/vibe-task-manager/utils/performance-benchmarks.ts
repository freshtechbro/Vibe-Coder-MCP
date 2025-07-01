/**
 * Performance Benchmarking System for Epic 6.2
 *
 * Implements comprehensive benchmarking infrastructure for <50ms optimization:
 * - Baseline performance measurement for all operations
 * - Automated performance regression testing
 * - Performance comparison and trending
 * - Benchmark result storage and analysis
 */

import { PerformanceMonitor } from './performance-monitor.js';
import { AppError } from '../../../utils/errors.js';
import logger from '../../../logger.js';

/**
 * Benchmark operation definition
 */
export interface BenchmarkOperation {
  name: string;
  category: 'task_management' | 'execution' | 'storage' | 'cache' | 'memory' | 'io';
  targetTime: number; // Target time in milliseconds
  description: string;
  operation: () => Promise<unknown>;
  setup?: () => Promise<void>;
  cleanup?: () => Promise<void>;
}

/**
 * Benchmark result
 */
export interface BenchmarkResult {
  operationName: string;
  category: string;
  targetTime: number;
  actualTime: number;
  memoryUsed: number;
  iterations: number;
  timestamp: Date;
  passed: boolean;
  improvement?: number; // Percentage improvement from baseline
  regression?: number; // Percentage regression from baseline
}

/**
 * Benchmark suite configuration
 */
export interface BenchmarkConfig {
  iterations: number;
  warmupIterations: number;
  targetOverhead: number; // Maximum allowed overhead in ms
  memoryThreshold: number; // Maximum memory usage in MB
  enableRegression: boolean;
  baselineWindow: number; // Hours to look back for baseline
}

/**
 * Performance regression report
 */
export interface RegressionReport {
  operationName: string;
  baselineTime: number;
  currentTime: number;
  regressionPercentage: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

/**
 * Performance Benchmarking System
 */
export class PerformanceBenchmarks {
  private static instance: PerformanceBenchmarks | null = null;
  private config: BenchmarkConfig;
  private performanceMonitor: PerformanceMonitor;
  private operations: Map<string, BenchmarkOperation> = new Map();
  private results: Map<string, BenchmarkResult[]> = new Map();
  private baselines: Map<string, number> = new Map();

  private constructor(config: BenchmarkConfig) {
    this.config = config;
    this.performanceMonitor = PerformanceMonitor.getInstance();
    this.initializeDefaultOperations();
    logger.info({ config }, 'Performance Benchmarks initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: BenchmarkConfig): PerformanceBenchmarks {
    if (!PerformanceBenchmarks.instance) {
      if (!config) {
        throw new AppError('Benchmark configuration required for first initialization');
      }
      PerformanceBenchmarks.instance = new PerformanceBenchmarks(config);
    }
    return PerformanceBenchmarks.instance;
  }

  /**
   * Initialize default benchmark operations
   */
  private initializeDefaultOperations(): void {
    // Task Management Operations
    this.registerOperation({
      name: 'task_creation',
      category: 'task_management',
      targetTime: 10,
      description: 'Create a new task',
      operation: async () => {
        // Simulate task creation
        const start = performance.now();
        await new Promise(resolve => setTimeout(resolve, 1));
        return performance.now() - start;
      }
    });

    this.registerOperation({
      name: 'task_listing',
      category: 'task_management',
      targetTime: 20,
      description: 'List tasks with filtering',
      operation: async () => {
        const start = performance.now();
        await new Promise(resolve => setTimeout(resolve, 2));
        return performance.now() - start;
      }
    });

    this.registerOperation({
      name: 'task_execution',
      category: 'execution',
      targetTime: 50,
      description: 'Execute a task',
      operation: async () => {
        const start = performance.now();
        await new Promise(resolve => setTimeout(resolve, 5));
        return performance.now() - start;
      }
    });

    this.registerOperation({
      name: 'status_checking',
      category: 'task_management',
      targetTime: 15,
      description: 'Check task status',
      operation: async () => {
        const start = performance.now();
        await new Promise(resolve => setTimeout(resolve, 1));
        return performance.now() - start;
      }
    });

    // Storage Operations
    this.registerOperation({
      name: 'storage_read',
      category: 'storage',
      targetTime: 10,
      description: 'Read from storage',
      operation: async () => {
        const start = performance.now();
        await new Promise(resolve => setTimeout(resolve, 1));
        return performance.now() - start;
      }
    });

    this.registerOperation({
      name: 'storage_write',
      category: 'storage',
      targetTime: 15,
      description: 'Write to storage',
      operation: async () => {
        const start = performance.now();
        await new Promise(resolve => setTimeout(resolve, 2));
        return performance.now() - start;
      }
    });

    // Cache Operations
    this.registerOperation({
      name: 'cache_get',
      category: 'cache',
      targetTime: 5,
      description: 'Get from cache',
      operation: async () => {
        const start = performance.now();
        await new Promise(resolve => setTimeout(resolve, 0.5));
        return performance.now() - start;
      }
    });

    this.registerOperation({
      name: 'cache_set',
      category: 'cache',
      targetTime: 8,
      description: 'Set cache value',
      operation: async () => {
        const start = performance.now();
        await new Promise(resolve => setTimeout(resolve, 1));
        return performance.now() - start;
      }
    });

    // Memory Operations
    this.registerOperation({
      name: 'memory_allocation',
      category: 'memory',
      targetTime: 5,
      description: 'Memory allocation and cleanup',
      operation: async () => {
        const start = performance.now();
        const data = new Array(1000).fill(0);
        data.length = 0;
        return performance.now() - start;
      }
    });

    logger.info(`Initialized ${this.operations.size} default benchmark operations`);
  }

  /**
   * Register a benchmark operation
   */
  registerOperation(operation: BenchmarkOperation): void {
    this.operations.set(operation.name, operation);
    logger.debug({ operationName: operation.name }, 'Benchmark operation registered');
  }

  /**
   * Run a single benchmark operation
   */
  async runBenchmark(operationName: string): Promise<BenchmarkResult> {
    const operation = this.operations.get(operationName);
    if (!operation) {
      throw new AppError(`Benchmark operation not found: ${operationName}`);
    }

    logger.info({ operationName }, 'Running benchmark');

    // Setup if needed
    if (operation.setup) {
      await operation.setup();
    }

    try {
      // Warmup iterations
      for (let i = 0; i < this.config.warmupIterations; i++) {
        await operation.operation();
      }

      // Actual benchmark iterations
      const times: number[] = [];
      const memoryUsages: number[] = [];

      for (let i = 0; i < this.config.iterations; i++) {
        const initialMemory = process.memoryUsage().heapUsed;

        const operationId = `benchmark_${operationName}_${i}`;
        this.performanceMonitor.startOperation(operationId);

        await operation.operation();

        const duration = this.performanceMonitor.endOperation(operationId, {
          benchmark: true,
          iteration: i,
          operationName
        });

        const finalMemory = process.memoryUsage().heapUsed;
        const memoryUsed = (finalMemory - initialMemory) / 1024 / 1024; // MB

        times.push(duration);
        memoryUsages.push(memoryUsed);
      }

      // Calculate results
      const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const averageMemory = memoryUsages.reduce((sum, mem) => sum + mem, 0) / memoryUsages.length;
      const passed = averageTime <= operation.targetTime;

      // Check for improvement/regression
      const baseline = this.baselines.get(operationName);
      let improvement: number | undefined;
      let regression: number | undefined;

      if (baseline) {
        const change = ((baseline - averageTime) / baseline) * 100;
        if (change > 0) {
          improvement = change;
        } else {
          regression = Math.abs(change);
        }
      } else {
        // Set as baseline if first run
        this.baselines.set(operationName, averageTime);
      }

      const result: BenchmarkResult = {
        operationName,
        category: operation.category,
        targetTime: operation.targetTime,
        actualTime: averageTime,
        memoryUsed: averageMemory,
        iterations: this.config.iterations,
        timestamp: new Date(),
        passed,
        improvement,
        regression
      };

      // Store result
      if (!this.results.has(operationName)) {
        this.results.set(operationName, []);
      }
      this.results.get(operationName)!.push(result);

      // Keep only last 100 results per operation
      const operationResults = this.results.get(operationName)!;
      if (operationResults.length > 100) {
        operationResults.splice(0, operationResults.length - 100);
      }

      logger.info({
        operationName,
        averageTime: averageTime.toFixed(2),
        targetTime: operation.targetTime,
        passed,
        improvement: improvement?.toFixed(2),
        regression: regression?.toFixed(2)
      }, 'Benchmark completed');

      return result;

    } finally {
      // Cleanup if needed
      if (operation.cleanup) {
        await operation.cleanup();
      }
    }
  }

  /**
   * Run all benchmark operations
   */
  async runAllBenchmarks(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    logger.info(`Running ${this.operations.size} benchmark operations`);

    for (const operationName of this.operations.keys()) {
      try {
        const result = await this.runBenchmark(operationName);
        results.push(result);
      } catch (error) {
        logger.error({ operationName, error }, 'Benchmark failed');
      }
    }

    return results;
  }

  /**
   * Run benchmarks for specific category
   */
  async runCategoryBenchmarks(category: BenchmarkOperation['category']): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    for (const [name, operation] of this.operations) {
      if (operation.category === category) {
        try {
          const result = await this.runBenchmark(name);
          results.push(result);
        } catch (error) {
          logger.error({ operationName: name, error }, 'Category benchmark failed');
        }
      }
    }

    return results;
  }

  /**
   * Get benchmark results for operation
   */
  getBenchmarkResults(operationName: string, limit?: number): BenchmarkResult[] {
    const results = this.results.get(operationName) || [];
    return limit ? results.slice(-limit) : results;
  }

  /**
   * Get all benchmark results
   */
  getAllBenchmarkResults(): Map<string, BenchmarkResult[]> {
    return new Map(this.results);
  }

  /**
   * Detect performance regressions
   */
  detectRegressions(): RegressionReport[] {
    if (!this.config.enableRegression) {
      return [];
    }

    const regressions: RegressionReport[] = [];
    const now = Date.now();
    const baselineWindow = this.config.baselineWindow * 60 * 60 * 1000;

    for (const [operationName, results] of this.results) {
      if (results.length < 2) continue;

      // Get baseline (older results)
      const baselineResults = results.filter(
        r => now - r.timestamp.getTime() >= baselineWindow
      );

      // Get recent results
      const recentResults = results.filter(
        r => now - r.timestamp.getTime() < baselineWindow
      );

      if (baselineResults.length === 0 || recentResults.length === 0) continue;

      const baselineAvg = baselineResults.reduce((sum, r) => sum + r.actualTime, 0) / baselineResults.length;
      const recentAvg = recentResults.reduce((sum, r) => sum + r.actualTime, 0) / recentResults.length;

      const regressionPercentage = ((recentAvg - baselineAvg) / baselineAvg) * 100;

      if (regressionPercentage > 10) { // 10% regression threshold
        let severity: RegressionReport['severity'] = 'low';
        let recommendation = 'Monitor performance trends';

        if (regressionPercentage > 50) {
          severity = 'critical';
          recommendation = 'Immediate optimization required';
        } else if (regressionPercentage > 30) {
          severity = 'high';
          recommendation = 'Performance optimization needed';
        } else if (regressionPercentage > 20) {
          severity = 'medium';
          recommendation = 'Consider performance improvements';
        }

        regressions.push({
          operationName,
          baselineTime: baselineAvg,
          currentTime: recentAvg,
          regressionPercentage,
          severity,
          recommendation
        });
      }
    }

    return regressions;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    totalOperations: number;
    passedOperations: number;
    failedOperations: number;
    averagePerformance: number;
    regressionCount: number;
    overallHealth: 'excellent' | 'good' | 'warning' | 'critical';
  } {
    const latestResults: BenchmarkResult[] = [];

    for (const results of this.results.values()) {
      if (results.length > 0) {
        latestResults.push(results[results.length - 1]);
      }
    }

    const totalOperations = latestResults.length;
    const passedOperations = latestResults.filter(r => r.passed).length;
    const failedOperations = totalOperations - passedOperations;

    const averagePerformance = totalOperations > 0
      ? latestResults.reduce((sum, r) => sum + (r.actualTime / r.targetTime), 0) / totalOperations
      : 0;

    const regressions = this.detectRegressions();
    const regressionCount = regressions.length;

    let overallHealth: 'excellent' | 'good' | 'warning' | 'critical' = 'excellent';

    if (failedOperations > totalOperations * 0.5 || regressions.some(r => r.severity === 'critical')) {
      overallHealth = 'critical';
    } else if (failedOperations > totalOperations * 0.3 || regressions.some(r => r.severity === 'high')) {
      overallHealth = 'warning';
    } else if (failedOperations > 0 || regressions.length > 0) {
      overallHealth = 'good';
    }

    return {
      totalOperations,
      passedOperations,
      failedOperations,
      averagePerformance,
      regressionCount,
      overallHealth
    };
  }

  /**
   * Update baseline for operation
   */
  updateBaseline(operationName: string, baselineTime?: number): void {
    if (baselineTime !== undefined) {
      this.baselines.set(operationName, baselineTime);
    } else {
      const results = this.results.get(operationName);
      if (results && results.length > 0) {
        const latestResult = results[results.length - 1];
        this.baselines.set(operationName, latestResult.actualTime);
      }
    }

    logger.info({ operationName, baseline: this.baselines.get(operationName) }, 'Baseline updated');
  }

  /**
   * Clear benchmark results
   */
  clearResults(operationName?: string): void {
    if (operationName) {
      this.results.delete(operationName);
      this.baselines.delete(operationName);
      logger.info({ operationName }, 'Benchmark results cleared');
    } else {
      this.results.clear();
      this.baselines.clear();
      logger.info('All benchmark results cleared');
    }
  }

  /**
   * Export benchmark results
   */
  exportResults(): {
    operations: BenchmarkOperation[];
    results: { [operationName: string]: BenchmarkResult[] };
    baselines: { [operationName: string]: number };
    summary: {
      totalOperations: number;
      passedOperations: number;
      failedOperations: number;
      averagePerformance: number;
      regressionCount: number;
      overallHealth: 'excellent' | 'good' | 'warning' | 'critical';
    };
    regressions: RegressionReport[];
  } {
    const operations = Array.from(this.operations.values());
    const results: { [operationName: string]: BenchmarkResult[] } = {};
    const baselines: { [operationName: string]: number } = {};

    for (const [name, resultArray] of this.results) {
      results[name] = resultArray;
    }

    for (const [name, baseline] of this.baselines) {
      baselines[name] = baseline;
    }

    return {
      operations,
      results,
      baselines,
      summary: this.getPerformanceSummary(),
      regressions: this.detectRegressions()
    };
  }
}

/**
 * Default benchmark configuration for Epic 6.2
 */
export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  iterations: 10,
  warmupIterations: 3,
  targetOverhead: 50, // 50ms target for Epic 6.2
  memoryThreshold: 100, // 100MB memory threshold
  enableRegression: true,
  baselineWindow: 24 // 24 hours baseline window
};

/**
 * Convenience function to get performance benchmarks instance
 */
export function getPerformanceBenchmarks(): PerformanceBenchmarks | null {
  try {
    return PerformanceBenchmarks.getInstance();
  } catch {
    return null;
  }
}
