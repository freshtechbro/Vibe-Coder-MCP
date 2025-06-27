/**
 * Memory Optimizer for Test Environment
 * Provides memory management, monitoring, and optimization for tests
 */

import logger from '../../../../logger.js';

/**
 * Memory usage snapshot
 */
interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  formatted: {
    heapUsed: string;
    heapTotal: string;
    external: string;
    rss: string;
  };
}

/**
 * Memory monitoring configuration
 */
interface MemoryMonitorConfig {
  maxHeapMB: number;
  maxRssMB: number;
  warningThresholdMB: number;
  monitoringInterval: number;
  enableGC: boolean;
  enableDetailedLogging: boolean;
}

/**
 * Memory leak detection result
 */
interface MemoryLeakDetection {
  hasLeaks: boolean;
  leakSeverity: 'low' | 'medium' | 'high';
  warnings: string[];
  recommendations: string[];
  memoryGrowth: number;
  snapshots: MemorySnapshot[];
}

/**
 * Default memory monitoring configuration for tests
 */
const DEFAULT_CONFIG: MemoryMonitorConfig = {
  maxHeapMB: 200, // 200MB heap limit for tests
  maxRssMB: 500, // 500MB RSS limit for tests
  warningThresholdMB: 100, // Warn at 100MB
  monitoringInterval: 5000, // 5 seconds
  enableGC: true,
  enableDetailedLogging: false
};

/**
 * Memory optimizer class
 */
export class MemoryOptimizer {
  private config: MemoryMonitorConfig;
  private snapshots: MemorySnapshot[] = [];
  private monitoringTimer?: NodeJS.Timeout;
  private isMonitoring = false;
  private startSnapshot?: MemorySnapshot;

  constructor(config: Partial<MemoryMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Take a memory snapshot
   */
  takeSnapshot(): MemorySnapshot {
    const usage = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      ...usage,
      formatted: {
        heapUsed: this.formatBytes(usage.heapUsed),
        heapTotal: this.formatBytes(usage.heapTotal),
        external: this.formatBytes(usage.external),
        rss: this.formatBytes(usage.rss)
      }
    };

    this.snapshots.push(snapshot);
    
    // Keep only last 10 snapshots to prevent memory growth
    if (this.snapshots.length > 10) {
      this.snapshots = this.snapshots.slice(-10);
    }

    return snapshot;
  }

  /**
   * Start memory monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.startSnapshot = this.takeSnapshot();

    if (this.config.enableDetailedLogging) {
      logger.debug({ 
        config: this.config,
        startMemory: this.startSnapshot.formatted 
      }, 'Memory monitoring started');
    }

    this.monitoringTimer = setInterval(() => {
      this.checkMemoryUsage();
    }, this.config.monitoringInterval);
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): MemoryLeakDetection | null {
    if (!this.isMonitoring) {
      return null;
    }

    this.isMonitoring = false;
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }

    const finalSnapshot = this.takeSnapshot();
    const leakDetection = this.detectMemoryLeaks();

    if (this.config.enableDetailedLogging) {
      logger.debug({ 
        finalMemory: finalSnapshot.formatted,
        leakDetection 
      }, 'Memory monitoring stopped');
    }

    return leakDetection;
  }

  /**
   * Check current memory usage against limits
   */
  private checkMemoryUsage(): void {
    const snapshot = this.takeSnapshot();
    const heapMB = snapshot.heapUsed / 1024 / 1024;
    const rssMB = snapshot.rss / 1024 / 1024;

    // Check warning threshold
    if (heapMB > this.config.warningThresholdMB) {
      logger.warn({ 
        heapMB: Math.round(heapMB),
        threshold: this.config.warningThresholdMB 
      }, 'Memory usage approaching warning threshold');
    }

    // Check heap limit
    if (heapMB > this.config.maxHeapMB) {
      logger.error({ 
        heapMB: Math.round(heapMB),
        limit: this.config.maxHeapMB 
      }, 'Memory usage exceeded heap limit');
      
      if (this.config.enableGC) {
        this.forceGarbageCollection();
      }
    }

    // Check RSS limit
    if (rssMB > this.config.maxRssMB) {
      logger.error({ 
        rssMB: Math.round(rssMB),
        limit: this.config.maxRssMB 
      }, 'Memory usage exceeded RSS limit');
    }
  }

  /**
   * Detect memory leaks
   */
  detectMemoryLeaks(): MemoryLeakDetection {
    if (this.snapshots.length < 2) {
      return {
        hasLeaks: false,
        leakSeverity: 'low',
        warnings: [],
        recommendations: [],
        memoryGrowth: 0,
        snapshots: this.snapshots
      };
    }

    const firstSnapshot = this.snapshots[0];
    const lastSnapshot = this.snapshots[this.snapshots.length - 1];
    const memoryGrowth = lastSnapshot.heapUsed - firstSnapshot.heapUsed;
    const growthMB = memoryGrowth / 1024 / 1024;

    const warnings: string[] = [];
    const recommendations: string[] = [];
    let leakSeverity: 'low' | 'medium' | 'high' = 'low';

    // Analyze memory growth
    if (growthMB > 50) {
      warnings.push(`High memory growth: ${Math.round(growthMB)}MB`);
      leakSeverity = 'high';
      recommendations.push('Check for memory leaks in EventEmitters, timers, or large object retention');
    } else if (growthMB > 20) {
      warnings.push(`Moderate memory growth: ${Math.round(growthMB)}MB`);
      leakSeverity = 'medium';
      recommendations.push('Monitor memory usage patterns and consider cleanup optimizations');
    } else if (growthMB > 10) {
      warnings.push(`Minor memory growth: ${Math.round(growthMB)}MB`);
      recommendations.push('Memory growth is within acceptable range but monitor trends');
    }

    // Check for consistent growth pattern
    if (this.snapshots.length >= 3) {
      const growthTrend = this.analyzeGrowthTrend();
      if (growthTrend.isConsistentGrowth && growthTrend.averageGrowthMB > 5) {
        warnings.push(`Consistent memory growth pattern detected: ${Math.round(growthTrend.averageGrowthMB)}MB per interval`);
        leakSeverity = growthTrend.averageGrowthMB > 10 ? 'high' : 'medium';
        recommendations.push('Investigate potential memory leaks or inefficient cleanup');
      }
    }

    // Check current memory levels
    const currentHeapMB = lastSnapshot.heapUsed / 1024 / 1024;
    if (currentHeapMB > this.config.warningThresholdMB) {
      warnings.push(`High current memory usage: ${Math.round(currentHeapMB)}MB`);
      recommendations.push('Consider forcing garbage collection or optimizing memory usage');
    }

    return {
      hasLeaks: warnings.length > 0,
      leakSeverity,
      warnings,
      recommendations,
      memoryGrowth,
      snapshots: this.snapshots
    };
  }

  /**
   * Analyze memory growth trend
   */
  private analyzeGrowthTrend(): { isConsistentGrowth: boolean; averageGrowthMB: number } {
    if (this.snapshots.length < 3) {
      return { isConsistentGrowth: false, averageGrowthMB: 0 };
    }

    const growthRates: number[] = [];
    for (let i = 1; i < this.snapshots.length; i++) {
      const growth = this.snapshots[i].heapUsed - this.snapshots[i - 1].heapUsed;
      growthRates.push(growth / 1024 / 1024); // Convert to MB
    }

    const averageGrowthMB = growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length;
    const positiveGrowthCount = growthRates.filter(rate => rate > 1).length; // Growth > 1MB
    const isConsistentGrowth = positiveGrowthCount >= growthRates.length * 0.7; // 70% of intervals show growth

    return { isConsistentGrowth, averageGrowthMB };
  }

  /**
   * Force garbage collection
   */
  forceGarbageCollection(): void {
    if (global.gc) {
      const beforeGC = this.takeSnapshot();
      global.gc();
      const afterGC = this.takeSnapshot();
      
      const freedMB = (beforeGC.heapUsed - afterGC.heapUsed) / 1024 / 1024;
      
      if (this.config.enableDetailedLogging) {
        logger.debug({ 
          beforeGC: beforeGC.formatted.heapUsed,
          afterGC: afterGC.formatted.heapUsed,
          freedMB: Math.round(freedMB)
        }, 'Forced garbage collection completed');
      }
    } else {
      logger.warn('Garbage collection not available (run with --expose-gc)');
    }
  }

  /**
   * Optimize memory for tests
   */
  optimizeForTests(): void {
    // Force garbage collection
    this.forceGarbageCollection();

    // Clear large objects that might be cached
    if (global.Buffer) {
      // Clear any large buffers
      global.Buffer.poolSize = 8 * 1024; // Reduce buffer pool size
    }

    // Suggest V8 to optimize for low memory usage
    if (global.gc) {
      // Multiple GC cycles to ensure thorough cleanup
      global.gc();
      setTimeout(() => global.gc && global.gc(), 100);
    }
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    return `${Math.round(mb * 100) / 100} MB`;
  }

  /**
   * Get memory usage summary
   */
  getMemorySummary(): {
    current: MemorySnapshot;
    peak: MemorySnapshot;
    growth: number;
    snapshotCount: number;
  } {
    const current = this.takeSnapshot();
    const peak = this.snapshots.reduce((max, snapshot) => 
      snapshot.heapUsed > max.heapUsed ? snapshot : max, 
      this.snapshots[0] || current
    );
    
    const growth = this.startSnapshot 
      ? current.heapUsed - this.startSnapshot.heapUsed 
      : 0;

    return {
      current,
      peak,
      growth,
      snapshotCount: this.snapshots.length
    };
  }

  /**
   * Reset monitoring data
   */
  reset(): void {
    this.snapshots = [];
    this.startSnapshot = undefined;
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }
    
    this.isMonitoring = false;
  }
}

/**
 * Global memory optimizer instance for tests
 */
export const testMemoryOptimizer = new MemoryOptimizer({
  maxHeapMB: 300, // Increased for test environment
  maxRssMB: 600,
  warningThresholdMB: 150,
  enableDetailedLogging: process.env.NODE_ENV === 'test' && process.env.MEMORY_DEBUG === 'true'
});

/**
 * Memory optimization utilities
 */
export const memoryUtils = {
  /**
   * Optimize memory before test
   */
  optimizeBeforeTest: (): void => {
    testMemoryOptimizer.optimizeForTests();
    testMemoryOptimizer.startMonitoring();
  },

  /**
   * Optimize memory after test
   */
  optimizeAfterTest: (): MemoryLeakDetection | null => {
    const leakDetection = testMemoryOptimizer.stopMonitoring();
    testMemoryOptimizer.optimizeForTests();
    return leakDetection;
  },

  /**
   * Check if memory usage is acceptable
   */
  checkMemoryHealth: (): boolean => {
    const summary = testMemoryOptimizer.getMemorySummary();
    const currentMB = summary.current.heapUsed / 1024 / 1024;
    return currentMB < 200; // 200MB threshold
  },

  /**
   * Get current memory usage
   */
  getCurrentMemory: (): MemorySnapshot => {
    return testMemoryOptimizer.takeSnapshot();
  },

  /**
   * Force cleanup
   */
  forceCleanup: (): void => {
    testMemoryOptimizer.forceGarbageCollection();
  }
};
