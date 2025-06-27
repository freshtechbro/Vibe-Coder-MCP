/**
 * Memory Manager Integration for Vibe Task Manager
 *
 * Integrates with the shared memory management service for advanced optimization.
 * Provides tool-specific memory configuration, aggressive cleanup for large projects,
 * memory usage monitoring, and memory leak detection.
 */

import { MemoryManager } from '../../code-map-generator/cache/memoryManager.js';
import { VibeTaskManagerConfig } from './config-loader.js';
import { AppError } from '../../../utils/errors.js';
import logger from '../../../logger.js';

/**
 * Memory usage statistics for task manager
 */
export interface TaskManagerMemoryStats {
  totalMemoryUsage: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
  percentageUsed: number;
  cacheMemoryUsage: number;
  taskStorageMemoryUsage: number;
  agentMemoryUsage: number;
  timestamp: Date;
}

/**
 * Memory alert information
 */
export interface MemoryAlert {
  id: string;
  type: 'warning' | 'critical';
  threshold: number;
  currentUsage: number;
  message: string;
  timestamp: Date;
  resolved: boolean;
}

/**
 * Memory cleanup result
 */
export interface MemoryCleanupResult {
  success: boolean;
  memoryFreed: number; // bytes
  itemsRemoved: number;
  duration: number; // ms
  error?: string;
}

/**
 * Task Manager Memory Manager Integration
 */
export class TaskManagerMemoryManager {
  private static instance: TaskManagerMemoryManager | null = null;
  private memoryManager: MemoryManager;
  private config: VibeTaskManagerConfig['taskManager']['performance']['memoryManagement'];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private memoryStats: TaskManagerMemoryStats[] = [];
  private alerts: Map<string, MemoryAlert> = new Map();
  private cleanupCallbacks: Map<string, () => Promise<MemoryCleanupResult>> = new Map();

  private constructor(config: VibeTaskManagerConfig['taskManager']['performance']['memoryManagement']) {
    this.config = config;
    this.memoryManager = new MemoryManager({
      maxMemoryPercentage: config.maxMemoryPercentage,
      monitorInterval: config.monitorInterval,
      autoManage: config.autoManage,
      pruneThreshold: config.pruneThreshold,
      prunePercentage: config.prunePercentage
    });

    if (config.enabled) {
      this.startMonitoring();
    }

    logger.info({ config }, 'Task Manager Memory Manager initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: VibeTaskManagerConfig['taskManager']['performance']['memoryManagement']): TaskManagerMemoryManager {
    if (!TaskManagerMemoryManager.instance) {
      if (!config) {
        throw new AppError('Memory manager configuration required for first initialization');
      }
      TaskManagerMemoryManager.instance = new TaskManagerMemoryManager(config);
    }
    return TaskManagerMemoryManager.instance;
  }

  /**
   * Start memory monitoring
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.collectMemoryStats();
      this.checkMemoryThresholds();
    }, this.config.monitorInterval);

    logger.debug('Memory monitoring started');
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.debug('Memory monitoring stopped');
    }
  }

  /**
   * Collect current memory statistics
   */
  private collectMemoryStats(): void {
    try {
      const memoryUsage = process.memoryUsage();

      // Safely get memory stats with fallback
      let memStats;
      try {
        memStats = this.memoryManager?.getMemoryStats?.();
      } catch (error) {
        logger.debug({ err: error }, 'Failed to get memory stats from memory manager, using fallback');
        memStats = null;
      }

      const stats: TaskManagerMemoryStats = {
        totalMemoryUsage: memoryUsage.heapUsed + memoryUsage.external,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers || 0,
        rss: memoryUsage.rss,
        percentageUsed: memStats?.raw?.memoryUsagePercentage || 0,
        cacheMemoryUsage: this.estimateCacheMemoryUsage(),
        taskStorageMemoryUsage: this.estimateTaskStorageMemoryUsage(),
        agentMemoryUsage: this.estimateAgentMemoryUsage(),
        timestamp: new Date()
      };

      this.memoryStats.push(stats);

      // Keep only last 100 stats entries
      if (this.memoryStats.length > 100) {
        this.memoryStats = this.memoryStats.slice(-100);
      }

      logger.debug({
        heapUsed: `${Math.round(stats.heapUsed / 1024 / 1024)} MB`,
        percentageUsed: `${(stats.percentageUsed * 100).toFixed(1)}%`,
        cacheMemory: `${Math.round(stats.cacheMemoryUsage / 1024 / 1024)} MB`
      }, 'Memory stats collected');
    } catch (error) {
      logger.error({ err: error }, 'Failed to collect memory stats');
    }
  }

  /**
   * Check memory thresholds and generate alerts
   */
  private checkMemoryThresholds(): void {
    const currentStats = this.memoryStats[this.memoryStats.length - 1];
    if (!currentStats) return;

    const warningThreshold = this.config.pruneThreshold * 0.8; // 80% of prune threshold
    const criticalThreshold = this.config.pruneThreshold;

    // Check for critical threshold
    if (currentStats.percentageUsed >= criticalThreshold) {
      this.generateAlert('critical', criticalThreshold, currentStats.percentageUsed,
        'Critical memory usage detected - automatic cleanup triggered');
      this.performAggressiveCleanup();
    }
    // Check for warning threshold
    else if (currentStats.percentageUsed >= warningThreshold) {
      this.generateAlert('warning', warningThreshold, currentStats.percentageUsed,
        'High memory usage detected - consider manual cleanup');
    }
  }

  /**
   * Generate memory alert
   */
  private generateAlert(type: 'warning' | 'critical', threshold: number, currentUsage: number, message: string): void {
    const alertId = `${type}_${Date.now()}`;
    const alert: MemoryAlert = {
      id: alertId,
      type,
      threshold,
      currentUsage,
      message,
      timestamp: new Date(),
      resolved: false
    };

    this.alerts.set(alertId, alert);

    logger[type === 'critical' ? 'error' : 'warn']({
      alertId,
      threshold: `${(threshold * 100).toFixed(1)}%`,
      currentUsage: `${(currentUsage * 100).toFixed(1)}%`,
      message
    }, `Memory ${type} alert`);
  }

  /**
   * Perform aggressive memory cleanup
   */
  async performAggressiveCleanup(): Promise<MemoryCleanupResult> {
    const startTime = Date.now();
    let totalMemoryFreed = 0;
    let totalItemsRemoved = 0;

    try {
      logger.info('Starting aggressive memory cleanup');

      // Execute all registered cleanup callbacks
      for (const [name, callback] of this.cleanupCallbacks) {
        try {
          const result = await callback();
          if (result.success) {
            totalMemoryFreed += result.memoryFreed;
            totalItemsRemoved += result.itemsRemoved;
            logger.debug({ name, result }, 'Cleanup callback executed');
          }
        } catch (error) {
          logger.error({ err: error, name }, 'Cleanup callback failed');
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.debug('Forced garbage collection');
      }

      // Prune memory manager caches
      try {
        this.memoryManager?.pruneCaches?.();
      } catch (error) {
        logger.debug({ err: error }, 'Failed to prune memory manager caches');
      }

      const duration = Date.now() - startTime;
      const result: MemoryCleanupResult = {
        success: true,
        memoryFreed: totalMemoryFreed,
        itemsRemoved: totalItemsRemoved,
        duration
      };

      logger.info({
        memoryFreed: `${Math.round(totalMemoryFreed / 1024 / 1024)} MB`,
        itemsRemoved: totalItemsRemoved,
        duration: `${duration}ms`
      }, 'Aggressive memory cleanup completed');

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ err: error, duration }, 'Aggressive memory cleanup failed');

      return {
        success: false,
        memoryFreed: totalMemoryFreed,
        itemsRemoved: totalItemsRemoved,
        duration,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Register cleanup callback for specific component
   */
  registerCleanupCallback(name: string, callback: () => Promise<MemoryCleanupResult>): void {
    this.cleanupCallbacks.set(name, callback);
    logger.debug({ name }, 'Cleanup callback registered');
  }

  /**
   * Unregister cleanup callback
   */
  unregisterCleanupCallback(name: string): void {
    this.cleanupCallbacks.delete(name);
    logger.debug({ name }, 'Cleanup callback unregistered');
  }

  /**
   * Get current memory statistics
   */
  getCurrentMemoryStats(): TaskManagerMemoryStats | null {
    return this.memoryStats.length > 0 ? this.memoryStats[this.memoryStats.length - 1] : null;
  }

  /**
   * Get memory statistics history
   */
  getMemoryStatsHistory(limit?: number): TaskManagerMemoryStats[] {
    const stats = [...this.memoryStats];
    return limit ? stats.slice(-limit) : stats;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): MemoryAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      logger.debug({ alertId }, 'Memory alert resolved');
      return true;
    }
    return false;
  }

  /**
   * Estimate cache memory usage (placeholder - to be implemented by specific caches)
   */
  private estimateCacheMemoryUsage(): number {
    // This will be enhanced when cache-utils is implemented
    return 0;
  }

  /**
   * Estimate task storage memory usage (placeholder)
   */
  private estimateTaskStorageMemoryUsage(): number {
    // This will be enhanced when task-file-manager is implemented
    return 0;
  }

  /**
   * Estimate agent memory usage (placeholder)
   */
  private estimateAgentMemoryUsage(): number {
    // This will be enhanced with agent memory tracking
    return 0;
  }

  /**
   * Get memory usage summary
   */
  getMemoryUsageSummary(): {
    current: TaskManagerMemoryStats | null;
    peak: TaskManagerMemoryStats | null;
    average: number;
    alertCount: number;
    cleanupCallbacksCount: number;
  } {
    const current = this.getCurrentMemoryStats();
    const peak = this.memoryStats.reduce((max, stats) =>
      stats.totalMemoryUsage > max.totalMemoryUsage ? stats : max,
      this.memoryStats[0] || current
    );

    const average = this.memoryStats.length > 0
      ? this.memoryStats.reduce((sum, stats) => sum + stats.totalMemoryUsage, 0) / this.memoryStats.length
      : 0;

    return {
      current,
      peak,
      average,
      alertCount: this.getActiveAlerts().length,
      cleanupCallbacksCount: this.cleanupCallbacks.size
    };
  }

  /**
   * Shutdown memory manager
   */
  shutdown(): void {
    this.stopMonitoring();
    this.cleanupCallbacks.clear();
    this.alerts.clear();
    this.memoryStats = [];
    logger.info('Task Manager Memory Manager shutdown');
  }
}

/**
 * Convenience function to get memory manager instance
 */
export function getTaskManagerMemoryManager(): TaskManagerMemoryManager | null {
  try {
    return TaskManagerMemoryManager.getInstance();
  } catch {
    return null;
  }
}
