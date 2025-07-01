/**
 * Memory Leak Detector for the Code-Map Generator tool.
 * This file contains the MemoryLeakDetector class for detecting memory leaks.
 */

import v8 from 'v8';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import logger from '../../../logger.js';
import { getMemoryStats } from '../parser.js';

/**
 * Result of heap snapshot comparison
 */
export interface HeapSnapshotComparison {
  snapshot1Path: string;
  snapshot2Path: string;
  snapshot1Size: number;
  snapshot2Size: number;
  sizeDiff: number;
  percentChange: number;
  memoryDifference: number;
  objectCountDifference: number;
  leakSuspects: Array<{
    type: string;
    count: number;
    size: number;
  }>;
  analysis: {
    hasLeak: boolean;
    confidence: number;
    recommendations: string[];
  };
}

/**
 * Options for the MemoryLeakDetector.
 */
export interface MemoryLeakDetectorOptions {
  /**
   * The directory to store heap snapshots.
   * Default: os.tmpdir()
   */
  snapshotDir?: string;

  /**
   * The interval in milliseconds for taking heap snapshots.
   * Default: 5 minutes
   */
  snapshotInterval?: number;

  /**
   * The maximum number of snapshots to keep.
   * Default: 5
   */
  maxSnapshots?: number;

  /**
   * The threshold percentage increase in memory usage to trigger a leak alert.
   * Default: 0.2 (20%)
   */
  leakThreshold?: number;

  /**
   * Whether to enable automatic leak detection.
   * Default: true
   */
  autoDetect?: boolean;

  /**
   * The interval in milliseconds for checking memory trends.
   * Default: 1 minute
   */
  checkInterval?: number;

  /**
   * The number of memory samples to keep for trend analysis.
   * Default: 10
   */
  maxSamples?: number;
}

/**
 * Memory sample data.
 */
interface MemorySample {
  /**
   * The timestamp when the sample was taken.
   */
  timestamp: number;

  /**
   * The heap used in bytes.
   */
  heapUsed: number;

  /**
   * The heap total in bytes.
   */
  heapTotal: number;

  /**
   * The resident set size in bytes.
   */
  rss: number;

  /**
   * The external memory in bytes.
   */
  external: number;

  /**
   * The array buffers memory in bytes.
   */
  arrayBuffers: number;
}

/**
 * Heap snapshot metadata.
 */
interface HeapSnapshotMetadata {
  /**
   * The timestamp when the snapshot was taken.
   */
  timestamp: number;

  /**
   * The path to the snapshot file.
   */
  path: string;

  /**
   * The memory usage at the time the snapshot was taken.
   */
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
    arrayBuffers: number;
  };
}

/**
 * Memory leak detection result.
 */
export interface MemoryLeakDetectionResult {
  /**
   * Whether a memory leak was detected.
   */
  leakDetected: boolean;

  /**
   * The type of leak detected.
   */
  leakType?: 'heap' | 'external' | 'arrayBuffers';

  /**
   * The percentage increase in memory usage.
   */
  increasePercentage?: number;

  /**
   * The memory usage trend.
   */
  trend: 'increasing' | 'decreasing' | 'stable';

  /**
   * The memory samples used for analysis.
   */
  samples: MemorySample[];

  /**
   * The latest memory stats.
   */
  latestStats: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    systemTotal: number;
    memoryUsagePercentage: number;
    formatted: {
      heapUsed: string;
      heapTotal: string;
      rss: string;
      systemTotal: string;
    };
  };

  /**
   * The timestamp when the analysis was performed.
   */
  timestamp: number;
}

/**
 * Detects memory leaks in the Code-Map Generator tool.
 */
export class MemoryLeakDetector {
  private options: Required<MemoryLeakDetectorOptions>;
  private memorySamples: MemorySample[] = [];
  private snapshots: HeapSnapshotMetadata[] = [];
  private snapshotTimer: NodeJS.Timeout | null = null;
  private checkTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;

  /**
   * Default options for the MemoryLeakDetector.
   */
  private static readonly DEFAULT_OPTIONS: Required<MemoryLeakDetectorOptions> = {
    snapshotDir: path.join(os.tmpdir(), 'code-map-generator-heap-snapshots'),
    snapshotInterval: 5 * 60 * 1000, // 5 minutes
    maxSnapshots: 5,
    leakThreshold: 0.2, // 20%
    autoDetect: true,
    checkInterval: 60 * 1000, // 1 minute
    maxSamples: 10
  };

  /**
   * Creates a new MemoryLeakDetector instance.
   * @param options The detector options
   */
  constructor(options: MemoryLeakDetectorOptions = {}) {
    // Apply default options
    this.options = {
      ...MemoryLeakDetector.DEFAULT_OPTIONS,
      ...options
    };
  }

  /**
   * Initializes the memory leak detector.
   * @returns A promise that resolves when initialization is complete
   */
  public async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Create snapshot directory if it doesn't exist
    await fs.mkdir(this.options.snapshotDir, { recursive: true });

    // Start automatic detection if enabled
    if (this.options.autoDetect) {
      this.startAutomaticDetection();
    }

    this.isInitialized = true;
    logger.info(`MemoryLeakDetector initialized with snapshot directory: ${this.options.snapshotDir}`);
  }

  /**
   * Starts automatic memory leak detection.
   */
  public startAutomaticDetection(): void {
    // Start taking memory samples
    this.startMemorySampling();

    // Start taking heap snapshots
    this.startSnapshotSchedule();

    logger.info('Automatic memory leak detection started');
  }

  /**
   * Stops automatic memory leak detection.
   */
  public stopAutomaticDetection(): void {
    // Stop memory sampling
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    // Stop heap snapshots
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }

    logger.info('Automatic memory leak detection stopped');
  }

  /**
   * Starts periodic memory sampling.
   */
  private startMemorySampling(): void {
    // Clear existing timer if any
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }

    // Take an initial sample
    this.takeMemorySample();

    // Start new timer
    this.checkTimer = setInterval(() => {
      this.takeMemorySample();
      this.analyzeMemoryTrend();
    }, this.options.checkInterval);

    logger.debug(`Memory sampling started with interval: ${this.options.checkInterval}ms`);
  }

  /**
   * Takes a memory sample.
   */
  private takeMemorySample(): void {
    const memoryUsage = process.memoryUsage();

    const sample: MemorySample = {
      timestamp: Date.now(),
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      rss: memoryUsage.rss,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers || 0
    };

    // Add sample to the list
    this.memorySamples.push(sample);

    // Keep only the most recent samples
    if (this.memorySamples.length > this.options.maxSamples) {
      this.memorySamples.shift();
    }

    logger.debug(`Memory sample taken: ${JSON.stringify(sample)}`);
  }

  /**
   * Starts the heap snapshot schedule.
   */
  private startSnapshotSchedule(): void {
    // Clear existing timer if any
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
    }

    // Start new timer
    this.snapshotTimer = setInterval(() => {
      this.takeHeapSnapshot();
    }, this.options.snapshotInterval);

    logger.debug(`Heap snapshot schedule started with interval: ${this.options.snapshotInterval}ms`);
  }

  /**
   * Takes a heap snapshot.
   * @returns A promise that resolves to the path of the snapshot file
   */
  public async takeHeapSnapshot(): Promise<string> {
    const timestamp = Date.now();
    const snapshotPath = path.join(this.options.snapshotDir, `heap-snapshot-${timestamp}.heapsnapshot`);

    try {
      // Take heap snapshot
      const snapshot = v8.getHeapSnapshot();

      // Write snapshot to file
      const writeStream = fsSync.createWriteStream(snapshotPath);
      snapshot.pipe(writeStream);

      // Wait for the write to complete
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Get memory usage at the time of the snapshot
      const memoryUsage = process.memoryUsage();

      // Add snapshot metadata
      const metadata: HeapSnapshotMetadata = {
        timestamp,
        path: snapshotPath,
        memoryUsage: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          rss: memoryUsage.rss,
          external: memoryUsage.external,
          arrayBuffers: memoryUsage.arrayBuffers || 0
        }
      };

      this.snapshots.push(metadata);

      // Keep only the most recent snapshots
      if (this.snapshots.length > this.options.maxSnapshots) {
        const oldestSnapshot = this.snapshots.shift();
        if (oldestSnapshot) {
          try {
            await fs.unlink(oldestSnapshot.path);
            logger.debug(`Deleted old heap snapshot: ${oldestSnapshot.path}`);
          } catch (error) {
            logger.warn(`Failed to delete old heap snapshot: ${oldestSnapshot.path}`, { error });
          }
        }
      }

      logger.info(`Heap snapshot taken: ${snapshotPath}`);
      return snapshotPath;
    } catch (error) {
      logger.error(`Failed to take heap snapshot: ${error}`);
      throw error;
    }
  }

  /**
   * Analyzes memory usage trend to detect potential leaks.
   * @returns The memory leak detection result
   */
  public analyzeMemoryTrend(): MemoryLeakDetectionResult {
    // Need at least 2 samples to detect a trend
    if (this.memorySamples.length < 2) {
      const stats = getMemoryStats();
      return {
        leakDetected: false,
        trend: 'stable',
        samples: [...this.memorySamples],
        latestStats: stats,
        timestamp: Date.now()
      };
    }

    // Get the oldest and newest samples
    const oldestSample = this.memorySamples[0];
    const newestSample = this.memorySamples[this.memorySamples.length - 1];

    // Calculate percentage changes
    const heapUsedChange = (newestSample.heapUsed - oldestSample.heapUsed) / oldestSample.heapUsed;
    const externalChange = (newestSample.external - oldestSample.external) / oldestSample.external;
    const arrayBuffersChange = oldestSample.arrayBuffers > 0
      ? (newestSample.arrayBuffers - oldestSample.arrayBuffers) / oldestSample.arrayBuffers
      : 0;

    // Determine trend
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (heapUsedChange > 0.05) { // 5% increase
      trend = 'increasing';
    } else if (heapUsedChange < -0.05) { // 5% decrease
      trend = 'decreasing';
    }

    // Check for leaks
    let leakDetected = false;
    let leakType: 'heap' | 'external' | 'arrayBuffers' | undefined;
    let increasePercentage: number | undefined;

    if (heapUsedChange > this.options.leakThreshold) {
      leakDetected = true;
      leakType = 'heap';
      increasePercentage = heapUsedChange * 100;
      logger.warn(`Potential heap memory leak detected: ${increasePercentage.toFixed(2)}% increase over ${this.memorySamples.length} samples`);
    } else if (externalChange > this.options.leakThreshold) {
      leakDetected = true;
      leakType = 'external';
      increasePercentage = externalChange * 100;
      logger.warn(`Potential external memory leak detected: ${increasePercentage.toFixed(2)}% increase over ${this.memorySamples.length} samples`);
    } else if (arrayBuffersChange > this.options.leakThreshold) {
      leakDetected = true;
      leakType = 'arrayBuffers';
      increasePercentage = arrayBuffersChange * 100;
      logger.warn(`Potential array buffers memory leak detected: ${increasePercentage.toFixed(2)}% increase over ${this.memorySamples.length} samples`);
    }

    const stats = getMemoryStats();
    return {
      leakDetected,
      leakType,
      increasePercentage,
      trend,
      samples: [...this.memorySamples],
      latestStats: stats,
      timestamp: Date.now()
    };
  }

  /**
   * Compares two heap snapshots to find memory leaks.
   * @param snapshot1Path The path to the first snapshot
   * @param snapshot2Path The path to the second snapshot
   * @returns A promise that resolves to the comparison result
   */
  public async compareHeapSnapshots(snapshot1Path: string, snapshot2Path: string): Promise<HeapSnapshotComparison> {
    // This is a placeholder for heap snapshot comparison
    // In a real implementation, you would use a library like heapdump or v8-profiler
    // to analyze and compare heap snapshots
    logger.info(`Comparing heap snapshots: ${snapshot1Path} and ${snapshot2Path}`);

    // For now, just return a simple comparison of file sizes
    const stat1 = await fs.stat(snapshot1Path);
    const stat2 = await fs.stat(snapshot2Path);

    const sizeDiff = stat2.size - stat1.size;
    const percentChange = (sizeDiff / stat1.size) * 100;

    return {
      snapshot1Path,
      snapshot2Path,
      snapshot1Size: stat1.size,
      snapshot2Size: stat2.size,
      sizeDiff,
      percentChange,
      memoryDifference: sizeDiff,
      objectCountDifference: 0, // Placeholder - would need actual heap analysis
      leakSuspects: [], // Placeholder - would need actual heap analysis
      analysis: {
        hasLeak: sizeDiff > 0,
        confidence: Math.min(Math.abs(percentChange) / 10, 1),
        recommendations: sizeDiff > 0 ? ['Monitor memory usage', 'Check for memory leaks'] : ['Memory usage is stable']
      }
    };
  }

  /**
   * Gets the latest heap snapshot.
   * @returns The latest heap snapshot metadata, or undefined if none exists
   */
  public getLatestSnapshot(): HeapSnapshotMetadata | undefined {
    if (this.snapshots.length === 0) {
      return undefined;
    }

    return this.snapshots[this.snapshots.length - 1];
  }

  /**
   * Gets all heap snapshots.
   * @returns An array of heap snapshot metadata
   */
  public getAllSnapshots(): HeapSnapshotMetadata[] {
    return [...this.snapshots];
  }

  /**
   * Cleans up resources used by the memory leak detector.
   */
  public cleanup(): void {
    // Stop automatic detection
    this.stopAutomaticDetection();

    // Clear memory samples
    this.memorySamples = [];

    logger.info('Memory leak detector cleaned up');
  }
}
