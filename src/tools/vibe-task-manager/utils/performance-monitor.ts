/**
 * Performance Monitoring System
 *
 * Implements comprehensive performance monitoring including:
 * - Real-time performance metrics collection
 * - Performance bottleneck identification
 * - Resource usage tracking
 * - Performance regression detection
 * - Automated performance alerts
 */

import { VibeTaskManagerConfig } from './config-loader.js';
import { TaskManagerMemoryManager } from './memory-manager-integration.js';
import { AppError } from '../../../utils/errors.js';
import logger from '../../../logger.js';

/**
 * Real-time performance tracking for <50ms optimization
 */
export interface RealTimeMetrics {
  responseTime: number;
  memoryUsage: number;
  cpuUsage: number;
  cacheHitRate: number;
  activeConnections: number;
  queueLength: number;
  timestamp: number;
}

/**
 * Performance optimization suggestions
 */
export interface OptimizationSuggestion {
  category: 'memory' | 'cpu' | 'cache' | 'io' | 'network';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  implementation: string;
  estimatedImpact: string;
}

/**
 * Performance metric types
 */
export type MetricType =
  | 'response_time'
  | 'memory_usage'
  | 'cpu_usage'
  | 'disk_io'
  | 'cache_hit_rate'
  | 'task_throughput'
  | 'error_rate'
  | 'agent_performance';

/**
 * Performance metric data point
 */
export interface PerformanceMetric {
  id: string;
  type: MetricType;
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags: Record<string, string>;
  threshold?: {
    warning: number;
    critical: number;
  };
}

/**
 * Performance alert
 */
export interface PerformanceAlert {
  id: string;
  metricId: string;
  type: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

/**
 * Performance bottleneck information
 */
export interface PerformanceBottleneck {
  id: string;
  component: string;
  type: 'memory' | 'cpu' | 'io' | 'network' | 'cache';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metrics: PerformanceMetric[];
  suggestions: string[];
  detectedAt: Date;
}

/**
 * Performance regression data
 */
export interface PerformanceRegression {
  id: string;
  metricType: MetricType;
  baselineValue: number;
  currentValue: number;
  degradationPercentage: number;
  detectedAt: Date;
  timeWindow: string;
}

/**
 * Performance monitoring configuration
 */
export interface PerformanceMonitorConfig {
  enabled: boolean;
  metricsInterval: number;
  enableAlerts: boolean;
  performanceThresholds: {
    maxResponseTime: number;
    maxMemoryUsage: number;
    maxCpuUsage: number;
  };
  bottleneckDetection: {
    enabled: boolean;
    analysisInterval: number;
    minSampleSize: number;
  };
  regressionDetection: {
    enabled: boolean;
    baselineWindow: number; // hours
    comparisonWindow: number; // hours
    significanceThreshold: number; // percentage
  };
}

/**
 * Performance Monitor implementation
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor | null = null;
  private config: PerformanceMonitorConfig;
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private alerts: Map<string, PerformanceAlert> = new Map();
  private bottlenecks: Map<string, PerformanceBottleneck> = new Map();
  private regressions: Map<string, PerformanceRegression> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private analysisInterval: NodeJS.Timeout | null = null;
  private memoryManager: TaskManagerMemoryManager | null = null;
  private metricCounter = 0;

  // Enhanced real-time tracking
  private realTimeMetrics: RealTimeMetrics[] = [];
  private operationTimings: Map<string, number> = new Map();
  private activeOperations: Set<string> = new Set();
  private optimizationSuggestions: OptimizationSuggestion[] = [];

  private constructor(config: PerformanceMonitorConfig) {
    this.config = config;
    this.memoryManager = TaskManagerMemoryManager.getInstance();

    if (config.enabled) {
      this.startMonitoring();
    }

    if (config.bottleneckDetection.enabled) {
      this.startBottleneckAnalysis();
    }

    logger.info({ config }, 'Performance Monitor initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: PerformanceMonitorConfig): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      if (!config) {
        throw new AppError('Performance monitor configuration required for first initialization');
      }
      PerformanceMonitor.instance = new PerformanceMonitor(config);
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start performance monitoring
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.checkThresholds();
      this.detectRegressions();
    }, this.config.metricsInterval);

    logger.debug('Performance monitoring started');
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.debug('Performance monitoring stopped');
    }
  }

  /**
   * Start bottleneck analysis
   */
  private startBottleneckAnalysis(): void {
    if (this.analysisInterval) {
      return;
    }

    this.analysisInterval = setInterval(() => {
      this.analyzeBottlenecks();
    }, this.config.bottleneckDetection.analysisInterval);

    logger.debug('Bottleneck analysis started');
  }

  /**
   * Stop bottleneck analysis
   */
  stopBottleneckAnalysis(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
      logger.debug('Bottleneck analysis stopped');
    }
  }

  /**
   * Collect system performance metrics
   */
  private collectSystemMetrics(): void {
    const timestamp = new Date();

    // Memory metrics
    const memoryUsage = process.memoryUsage();
    this.recordMetric({
      type: 'memory_usage',
      name: 'heap_used',
      value: memoryUsage.heapUsed,
      unit: 'bytes',
      timestamp,
      tags: { component: 'system' },
      threshold: {
        warning: this.config.performanceThresholds.maxMemoryUsage * 0.8 * 1024 * 1024,
        critical: this.config.performanceThresholds.maxMemoryUsage * 1024 * 1024
      }
    });

    // CPU metrics (approximation using event loop delay)
    const startTime = process.hrtime.bigint();
    setImmediate(() => {
      const delay = Number(process.hrtime.bigint() - startTime) / 1000000; // Convert to ms
      this.recordMetric({
        type: 'cpu_usage',
        name: 'event_loop_delay',
        value: delay,
        unit: 'ms',
        timestamp,
        tags: { component: 'system' },
        threshold: {
          warning: 10,
          critical: 50
        }
      });
    });

    // Task manager specific metrics
    if (this.memoryManager) {
      const memStats = this.memoryManager.getCurrentMemoryStats();
      if (memStats) {
        this.recordMetric({
          type: 'memory_usage',
          name: 'task_manager_memory',
          value: memStats.totalMemoryUsage,
          unit: 'bytes',
          timestamp,
          tags: { component: 'task_manager' }
        });

        this.recordMetric({
          type: 'cache_hit_rate',
          name: 'cache_memory_usage',
          value: memStats.cacheMemoryUsage,
          unit: 'bytes',
          timestamp,
          tags: { component: 'cache' }
        });
      }
    }
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: Omit<PerformanceMetric, 'id'>): void {
    const fullMetric: PerformanceMetric = {
      id: `metric_${++this.metricCounter}_${Date.now()}`,
      ...metric
    };

    const key = `${metric.type}_${metric.name}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    const metricArray = this.metrics.get(key)!;
    metricArray.push(fullMetric);

    // Keep only last 1000 metrics per type
    if (metricArray.length > 1000) {
      metricArray.splice(0, metricArray.length - 1000);
    }

    logger.debug({
      type: metric.type,
      name: metric.name,
      value: metric.value,
      unit: metric.unit
    }, 'Performance metric recorded');
  }

  /**
   * Check performance thresholds and generate alerts
   */
  private checkThresholds(): void {
    for (const [key, metricArray] of this.metrics) {
      const latestMetric = metricArray[metricArray.length - 1];
      if (!latestMetric?.threshold) continue;

      const { warning, critical } = latestMetric.threshold;

      if (latestMetric.value >= critical) {
        this.generateAlert(latestMetric, 'critical', critical);
      } else if (latestMetric.value >= warning) {
        this.generateAlert(latestMetric, 'warning', warning);
      }
    }
  }

  /**
   * Generate performance alert
   */
  private generateAlert(metric: PerformanceMetric, type: 'warning' | 'critical', threshold: number): void {
    const alertId = `alert_${metric.type}_${metric.name}_${Date.now()}`;

    // Check if similar alert already exists and is not resolved
    const existingAlert = Array.from(this.alerts.values()).find(alert =>
      alert.metricId === metric.id && !alert.resolved
    );

    if (existingAlert) {
      return; // Don't create duplicate alerts
    }

    const alert: PerformanceAlert = {
      id: alertId,
      metricId: metric.id,
      type,
      message: `${metric.name} ${type}: ${metric.value}${metric.unit} exceeds threshold of ${threshold}${metric.unit}`,
      value: metric.value,
      threshold,
      timestamp: new Date(),
      resolved: false
    };

    this.alerts.set(alertId, alert);

    logger[type === 'critical' ? 'error' : 'warn']({
      alertId,
      metric: metric.name,
      value: metric.value,
      threshold,
      unit: metric.unit
    }, `Performance ${type} alert`);
  }

  /**
   * Analyze performance bottlenecks
   */
  private analyzeBottlenecks(): void {
    const now = Date.now();
    const analysisWindow = 5 * 60 * 1000; // 5 minutes

    for (const [key, metricArray] of this.metrics) {
      const recentMetrics = metricArray.filter(
        metric => now - metric.timestamp.getTime() < analysisWindow
      );

      if (recentMetrics.length < this.config.bottleneckDetection.minSampleSize) {
        continue;
      }

      const bottleneck = this.detectBottleneck(key, recentMetrics);
      if (bottleneck) {
        this.bottlenecks.set(bottleneck.id, bottleneck);
        logger.warn({ bottleneck }, 'Performance bottleneck detected');
      }
    }
  }

  /**
   * Detect bottleneck from metrics
   */
  private detectBottleneck(key: string, metrics: PerformanceMetric[]): PerformanceBottleneck | null {
    const avgValue = metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
    const maxValue = Math.max(...metrics.map(m => m.value));
    const latestMetric = metrics[metrics.length - 1];

    // Simple bottleneck detection logic
    if (latestMetric.threshold) {
      const { warning, critical } = latestMetric.threshold;

      if (avgValue > critical * 0.9) {
        return {
          id: `bottleneck_${key}_${Date.now()}`,
          component: latestMetric.tags.component || 'unknown',
          type: this.getBottleneckType(latestMetric.type),
          severity: 'critical',
          description: `${latestMetric.name} consistently high: avg ${avgValue.toFixed(2)}${latestMetric.unit}`,
          metrics: metrics.slice(-10), // Last 10 metrics
          suggestions: this.getBottleneckSuggestions(latestMetric.type),
          detectedAt: new Date()
        };
      } else if (avgValue > warning * 0.9) {
        return {
          id: `bottleneck_${key}_${Date.now()}`,
          component: latestMetric.tags.component || 'unknown',
          type: this.getBottleneckType(latestMetric.type),
          severity: 'medium',
          description: `${latestMetric.name} elevated: avg ${avgValue.toFixed(2)}${latestMetric.unit}`,
          metrics: metrics.slice(-10),
          suggestions: this.getBottleneckSuggestions(latestMetric.type),
          detectedAt: new Date()
        };
      }
    }

    return null;
  }

  /**
   * Get bottleneck type from metric type
   */
  private getBottleneckType(metricType: MetricType): PerformanceBottleneck['type'] {
    switch (metricType) {
      case 'memory_usage': return 'memory';
      case 'cpu_usage': return 'cpu';
      case 'disk_io': return 'io';
      case 'cache_hit_rate': return 'cache';
      default: return 'cpu';
    }
  }

  /**
   * Get suggestions for bottleneck type
   */
  private getBottleneckSuggestions(metricType: MetricType): string[] {
    switch (metricType) {
      case 'memory_usage':
        return [
          'Enable aggressive memory cleanup',
          'Reduce cache sizes',
          'Implement lazy loading',
          'Check for memory leaks'
        ];
      case 'cpu_usage':
        return [
          'Reduce concurrent operations',
          'Optimize algorithms',
          'Implement batching',
          'Use worker threads for heavy tasks'
        ];
      case 'cache_hit_rate':
        return [
          'Increase cache size',
          'Optimize cache warming',
          'Review eviction policies',
          'Implement better caching strategies'
        ];
      default:
        return ['Monitor and analyze further'];
    }
  }

  /**
   * Detect performance regressions
   */
  private detectRegressions(): void {
    if (!this.config.regressionDetection.enabled) {
      return;
    }

    const now = Date.now();
    const baselineWindow = this.config.regressionDetection.baselineWindow * 60 * 60 * 1000;
    const comparisonWindow = this.config.regressionDetection.comparisonWindow * 60 * 60 * 1000;

    for (const [key, metricArray] of this.metrics) {
      const baselineMetrics = metricArray.filter(
        metric => now - metric.timestamp.getTime() >= comparisonWindow &&
                 now - metric.timestamp.getTime() < baselineWindow + comparisonWindow
      );

      const recentMetrics = metricArray.filter(
        metric => now - metric.timestamp.getTime() < comparisonWindow
      );

      if (baselineMetrics.length < 10 || recentMetrics.length < 10) {
        continue;
      }

      const baselineAvg = baselineMetrics.reduce((sum, m) => sum + m.value, 0) / baselineMetrics.length;
      const recentAvg = recentMetrics.reduce((sum, m) => sum + m.value, 0) / recentMetrics.length;

      const degradationPercentage = ((recentAvg - baselineAvg) / baselineAvg) * 100;

      if (degradationPercentage > this.config.regressionDetection.significanceThreshold) {
        const regression: PerformanceRegression = {
          id: `regression_${key}_${Date.now()}`,
          metricType: recentMetrics[0].type,
          baselineValue: baselineAvg,
          currentValue: recentAvg,
          degradationPercentage,
          detectedAt: new Date(),
          timeWindow: `${this.config.regressionDetection.comparisonWindow}h`
        };

        this.regressions.set(regression.id, regression);
        logger.warn({ regression }, 'Performance regression detected');
      }
    }
  }

  /**
   * Get comprehensive performance summary
   */
  getComprehensivePerformanceSummary(): {
    metrics: { [key: string]: PerformanceMetric };
    activeAlerts: PerformanceAlert[];
    bottlenecks: PerformanceBottleneck[];
    regressions: PerformanceRegression[];
    overallHealth: 'good' | 'warning' | 'critical';
  } {
    // Get latest metrics
    const latestMetrics: { [key: string]: PerformanceMetric } = {};
    for (const [key, metricArray] of this.metrics) {
      if (metricArray.length > 0) {
        latestMetrics[key] = metricArray[metricArray.length - 1];
      }
    }

    const activeAlerts = Array.from(this.alerts.values()).filter(alert => !alert.resolved);
    const bottlenecks = Array.from(this.bottlenecks.values());
    const regressions = Array.from(this.regressions.values());

    // Determine overall health
    let overallHealth: 'good' | 'warning' | 'critical' = 'good';
    if (activeAlerts.some(alert => alert.type === 'critical') ||
        bottlenecks.some(b => b.severity === 'critical')) {
      overallHealth = 'critical';
    } else if (activeAlerts.length > 0 || bottlenecks.length > 0 || regressions.length > 0) {
      overallHealth = 'warning';
    }

    return {
      metrics: latestMetrics,
      activeAlerts,
      bottlenecks,
      regressions,
      overallHealth
    };
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      logger.info({ alertId }, 'Performance alert resolved');
      return true;
    }
    return false;
  }

  /**
   * Get metrics for specific type and time range
   */
  getMetrics(type: MetricType, name?: string, timeRange?: { start: Date; end: Date }): PerformanceMetric[] {
    const results: PerformanceMetric[] = [];

    for (const [key, metricArray] of this.metrics) {
      const [metricType, metricName] = key.split('_', 2);

      if (metricType === type && (!name || metricName === name)) {
        let filteredMetrics = metricArray;

        if (timeRange) {
          filteredMetrics = metricArray.filter(
            metric => metric.timestamp >= timeRange.start && metric.timestamp <= timeRange.end
          );
        }

        results.push(...filteredMetrics);
      }
    }

    return results.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Start tracking an operation for performance measurement
   */
  startOperation(operationId: string): void {
    this.operationTimings.set(operationId, performance.now());
    this.activeOperations.add(operationId);
  }

  /**
   * End tracking an operation and record performance
   */
  endOperation(operationId: string, metadata?: Record<string, any>): number {
    const startTime = this.operationTimings.get(operationId);
    if (!startTime) {
      logger.warn({ operationId }, 'Operation timing not found');
      return 0;
    }

    const duration = performance.now() - startTime;
    this.operationTimings.delete(operationId);
    this.activeOperations.delete(operationId);

    // Record as response time metric
    this.recordMetric({
      type: 'response_time',
      name: operationId,
      value: duration,
      unit: 'ms',
      timestamp: new Date(),
      tags: {
        operation: operationId,
        ...metadata
      },
      threshold: {
        warning: this.config.performanceThresholds.maxResponseTime * 0.8,
        critical: this.config.performanceThresholds.maxResponseTime
      }
    });

    // Check if operation exceeded target
    if (duration > this.config.performanceThresholds.maxResponseTime) {
      this.generateOptimizationSuggestion({
        category: 'cpu',
        priority: duration > this.config.performanceThresholds.maxResponseTime * 2 ? 'critical' : 'high',
        description: `Operation ${operationId} took ${duration.toFixed(2)}ms, exceeding target of ${this.config.performanceThresholds.maxResponseTime}ms`,
        implementation: 'Consider caching, batching, or algorithm optimization',
        estimatedImpact: `Potential ${((duration - this.config.performanceThresholds.maxResponseTime) / duration * 100).toFixed(1)}% improvement`
      });
    }

    return duration;
  }

  /**
   * Get current real-time metrics
   */
  getCurrentRealTimeMetrics(): RealTimeMetrics {
    const memoryUsage = process.memoryUsage();
    const now = performance.now();

    const metrics: RealTimeMetrics = {
      responseTime: this.getAverageResponseTime(),
      memoryUsage: memoryUsage.heapUsed / 1024 / 1024, // MB
      cpuUsage: this.getEstimatedCpuUsage(),
      cacheHitRate: this.getCacheHitRate(),
      activeConnections: this.getActiveConnectionCount(),
      queueLength: this.activeOperations.size,
      timestamp: now
    };

    // Keep last 100 real-time metrics
    this.realTimeMetrics.push(metrics);
    if (this.realTimeMetrics.length > 100) {
      this.realTimeMetrics.shift();
    }

    return metrics;
  }

  /**
   * Get average response time from recent operations
   */
  private getAverageResponseTime(): number {
    const recentMetrics = this.getMetrics('response_time', undefined, {
      start: new Date(Date.now() - 60000), // Last minute
      end: new Date()
    });

    if (recentMetrics.length === 0) return 0;

    const total = recentMetrics.reduce((sum, metric) => sum + metric.value, 0);
    return total / recentMetrics.length;
  }

  /**
   * Estimate CPU usage based on event loop delay
   */
  private getEstimatedCpuUsage(): number {
    const recentCpuMetrics = this.getMetrics('cpu_usage', 'event_loop_delay', {
      start: new Date(Date.now() - 10000), // Last 10 seconds
      end: new Date()
    });

    if (recentCpuMetrics.length === 0) return 0;

    const avgDelay = recentCpuMetrics.reduce((sum, metric) => sum + metric.value, 0) / recentCpuMetrics.length;

    // Convert delay to estimated CPU usage percentage (rough approximation)
    return Math.min(100, (avgDelay / 100) * 100);
  }

  /**
   * Get cache hit rate
   */
  private getCacheHitRate(): number {
    // This would be implemented based on actual cache metrics
    // For now, return a placeholder
    return 0;
  }

  /**
   * Get active connection count
   */
  private getActiveConnectionCount(): number {
    // This would be implemented based on actual connection pool metrics
    // For now, return a placeholder
    return 0;
  }

  /**
   * Generate optimization suggestion
   */
  private generateOptimizationSuggestion(suggestion: OptimizationSuggestion): void {
    this.optimizationSuggestions.push(suggestion);

    // Keep only last 50 suggestions
    if (this.optimizationSuggestions.length > 50) {
      this.optimizationSuggestions.shift();
    }

    logger.info({ suggestion }, 'Performance optimization suggestion generated');
  }

  /**
   * Auto-apply performance optimizations
   */
  async autoOptimize(): Promise<{
    applied: string[];
    skipped: string[];
    errors: string[];
  }> {
    const applied: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    try {
      // Get current metrics
      const metrics = this.getCurrentRealTimeMetrics();

      // Memory optimization
      if (metrics.memoryUsage > this.config.performanceThresholds.maxMemoryUsage * 0.8) {
        try {
          await this.optimizeMemoryUsage();
          applied.push('memory-optimization');
        } catch (error) {
          errors.push(`Memory optimization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Cache optimization
      if (metrics.cacheHitRate < 0.7) {
        try {
          await this.optimizeCacheStrategy();
          applied.push('cache-optimization');
        } catch (error) {
          errors.push(`Cache optimization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Concurrent processing optimization
      if (metrics.queueLength > 10) {
        try {
          await this.optimizeConcurrentProcessing();
          applied.push('concurrency-optimization');
        } catch (error) {
          errors.push(`Concurrency optimization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Response time optimization
      if (metrics.responseTime > this.config.performanceThresholds.maxResponseTime) {
        try {
          await this.optimizeResponseTime();
          applied.push('response-time-optimization');
        } catch (error) {
          errors.push(`Response time optimization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      logger.info({ applied, skipped, errors }, 'Auto-optimization completed');
      return { applied, skipped, errors };

    } catch (error) {
      logger.error({ err: error }, 'Auto-optimization failed');
      errors.push(`Auto-optimization failed: ${error instanceof Error ? error.message : String(error)}`);
      return { applied, skipped, errors };
    }
  }

  /**
   * Optimize memory usage
   */
  private async optimizeMemoryUsage(): Promise<void> {
    logger.info('Starting memory optimization');

    // Trigger memory manager cleanup
    if (this.memoryManager) {
      await this.memoryManager.performAggressiveCleanup();
    }

    // Clear old metrics
    if (this.realTimeMetrics.length > 50) {
      this.realTimeMetrics.splice(0, this.realTimeMetrics.length - 50);
    }

    // Clear old operation timings
    const cutoffTime = Date.now() - (60 * 60 * 1000); // 1 hour ago
    for (const [operationId, timestamp] of this.operationTimings.entries()) {
      if (timestamp < cutoffTime) {
        this.operationTimings.delete(operationId);
      }
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    logger.info('Memory optimization completed');
  }

  /**
   * Optimize cache strategy
   */
  private async optimizeCacheStrategy(): Promise<void> {
    logger.info('Starting cache optimization');

    // Import cache managers dynamically
    try {
      const { ConfigLoader } = await import('./config-loader.js');
      const configLoader = ConfigLoader.getInstance();

      // Reset cache statistics
      configLoader.resetCacheStats();

      // Warm up frequently accessed configurations
      await configLoader.warmupCache();

      logger.info('Cache optimization completed');
    } catch (error) {
      logger.warn({ err: error }, 'Cache optimization partially failed');
    }
  }

  /**
   * Optimize concurrent processing
   */
  private async optimizeConcurrentProcessing(): Promise<void> {
    logger.info('Starting concurrency optimization');

    try {
      // Import execution coordinator dynamically
      const { ExecutionCoordinator } = await import('../services/execution-coordinator.js');
      const coordinator = await ExecutionCoordinator.getInstance();

      // Optimize batch processing
      await coordinator.optimizeBatchProcessing();

      logger.info('Concurrency optimization completed');
    } catch (error) {
      logger.warn({ err: error }, 'Concurrency optimization failed');
      throw error;
    }
  }

  /**
   * Optimize response time
   */
  private async optimizeResponseTime(): Promise<void> {
    logger.info('Starting response time optimization');

    // Reduce monitoring intervals temporarily for faster processing
    const originalInterval = this.config.metricsInterval;
    this.config.metricsInterval = Math.max(originalInterval * 2, 5000);

    // Clear active operations that might be stuck
    const stuckOperations = Array.from(this.activeOperations).filter(op => {
      const startTime = this.operationTimings.get(op);
      return startTime && (Date.now() - startTime) > 30000; // 30 seconds
    });

    for (const operationId of stuckOperations) {
      this.activeOperations.delete(operationId);
      this.operationTimings.delete(operationId);
    }

    // Restore original interval after a delay
    setTimeout(() => {
      this.config.metricsInterval = originalInterval;
    }, 60000); // 1 minute

    logger.info({ clearedOperations: stuckOperations.length }, 'Response time optimization completed');
  }

  /**
   * Get optimization suggestions
   */
  getOptimizationSuggestions(category?: OptimizationSuggestion['category']): OptimizationSuggestion[] {
    if (category) {
      return this.optimizationSuggestions.filter(s => s.category === category);
    }
    return [...this.optimizationSuggestions];
  }

  /**
   * Get performance summary for the last period
   */
  getPerformanceSummary(periodMinutes: number = 5): {
    averageResponseTime: number;
    maxResponseTime: number;
    memoryUsage: number;
    alertCount: number;
    bottleneckCount: number;
    targetsMet: boolean;
  } {
    const since = new Date(Date.now() - periodMinutes * 60 * 1000);
    const responseMetrics = this.getMetrics('response_time', undefined, {
      start: since,
      end: new Date()
    });

    const averageResponseTime = responseMetrics.length > 0
      ? responseMetrics.reduce((sum, m) => sum + m.value, 0) / responseMetrics.length
      : 0;

    const maxResponseTime = responseMetrics.length > 0
      ? Math.max(...responseMetrics.map(m => m.value))
      : 0;

    const recentAlerts = Array.from(this.alerts.values())
      .filter(alert => alert.timestamp.getTime() > since.getTime());

    const recentBottlenecks = Array.from(this.bottlenecks.values())
      .filter(bottleneck => bottleneck.detectedAt.getTime() > since.getTime());

    return {
      averageResponseTime,
      maxResponseTime,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
      alertCount: recentAlerts.length,
      bottleneckCount: recentBottlenecks.length,
      targetsMet: averageResponseTime <= this.config.performanceThresholds.maxResponseTime
    };
  }

  /**
   * Shutdown performance monitor
   */
  shutdown(): void {
    this.stopMonitoring();
    this.stopBottleneckAnalysis();

    this.metrics.clear();
    this.alerts.clear();
    this.bottlenecks.clear();
    this.regressions.clear();
    this.realTimeMetrics.length = 0;
    this.operationTimings.clear();
    this.activeOperations.clear();
    this.optimizationSuggestions.length = 0;

    logger.info('Performance Monitor shutdown');
  }
}

/**
 * Convenience function to get performance monitor instance
 */
export function getPerformanceMonitor(): PerformanceMonitor | null {
  try {
    return PerformanceMonitor.getInstance();
  } catch {
    return null;
  }
}
