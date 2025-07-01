/**
 * Memory monitoring and reporting for the Code-Map Generator tool.
 * This file contains functions for tracking and reporting memory usage.
 */

import logger from '../../logger.js';
import { getMemoryStats } from './parser.js';

// Track memory usage over time
const memoryUsageSamples: MemoryUsageSample[] = [];

/**
 * Represents a memory usage sample.
 */
export interface MemoryUsageSample {
  timestamp: number;
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
  percentageUsed: number;
}

/**
 * Takes a memory usage sample and stores it for analysis.
 * @param label Optional label for the sample (e.g., "After batch 3")
 * @returns The memory usage sample
 */
export function takeMemorySample(label?: string): MemoryUsageSample {
  const memoryUsage = process.memoryUsage();
  const memStats = getMemoryStats();
  
  const sample: MemoryUsageSample = {
    timestamp: Date.now(),
    rss: memoryUsage.rss,
    heapTotal: memoryUsage.heapTotal,
    heapUsed: memoryUsage.heapUsed,
    external: memoryUsage.external,
    arrayBuffers: memoryUsage.arrayBuffers || 0,
    percentageUsed: memStats.memoryUsagePercentage || 0
  };
  
  memoryUsageSamples.push(sample);
  
  // Log the sample if a label was provided
  if (label) {
    logger.info({
      label,
      rss: `${Math.round(sample.rss / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(sample.heapUsed / 1024 / 1024)} MB`,
      percentageUsed: `${(sample.percentageUsed * 100).toFixed(1)}%`
    }, 'Memory usage sample');
  }
  
  return sample;
}

/**
 * Gets memory usage statistics.
 * @returns Memory usage statistics
 */
export function getMemoryUsageStats(): {
  current: MemoryUsageSample;
  peak: MemoryUsageSample;
  average: MemoryUsageSample;
  samples: number;
} {
  // Get current memory usage
  const current = takeMemorySample();
  
  // Find peak memory usage
  const peak = memoryUsageSamples.reduce((max, sample) => {
    return sample.heapUsed > max.heapUsed ? sample : max;
  }, memoryUsageSamples[0] || current);
  
  // Calculate average memory usage
  const average: MemoryUsageSample = {
    timestamp: Date.now(),
    rss: 0,
    heapTotal: 0,
    heapUsed: 0,
    external: 0,
    arrayBuffers: 0,
    percentageUsed: 0
  };
  
  if (memoryUsageSamples.length > 0) {
    for (const sample of memoryUsageSamples) {
      average.rss += sample.rss;
      average.heapTotal += sample.heapTotal;
      average.heapUsed += sample.heapUsed;
      average.external += sample.external;
      average.arrayBuffers += sample.arrayBuffers;
      average.percentageUsed += sample.percentageUsed;
    }
    
    average.rss /= memoryUsageSamples.length;
    average.heapTotal /= memoryUsageSamples.length;
    average.heapUsed /= memoryUsageSamples.length;
    average.external /= memoryUsageSamples.length;
    average.arrayBuffers /= memoryUsageSamples.length;
    average.percentageUsed /= memoryUsageSamples.length;
  }
  
  return {
    current,
    peak,
    average,
    samples: memoryUsageSamples.length
  };
}

/**
 * Clears memory usage samples.
 */
export function clearMemoryUsageSamples(): void {
  memoryUsageSamples.length = 0;
}

/**
 * Generates a memory usage report.
 * @returns A formatted memory usage report
 */
export function generateMemoryUsageReport(): string {
  const stats = getMemoryUsageStats();
  
  return `
Memory Usage Report
==================

Current Memory Usage:
- RSS: ${formatBytes(stats.current.rss)}
- Heap Total: ${formatBytes(stats.current.heapTotal)}
- Heap Used: ${formatBytes(stats.current.heapUsed)}
- External: ${formatBytes(stats.current.external)}
- Array Buffers: ${formatBytes(stats.current.arrayBuffers)}
- Percentage Used: ${(stats.current.percentageUsed * 100).toFixed(1)}%

Peak Memory Usage:
- RSS: ${formatBytes(stats.peak.rss)}
- Heap Used: ${formatBytes(stats.peak.heapUsed)}
- Percentage Used: ${(stats.peak.percentageUsed * 100).toFixed(1)}%

Average Memory Usage:
- RSS: ${formatBytes(stats.average.rss)}
- Heap Used: ${formatBytes(stats.average.heapUsed)}
- Percentage Used: ${(stats.average.percentageUsed * 100).toFixed(1)}%

Samples Collected: ${stats.samples}
`;
}

/**
 * Formats a byte value into a human-readable string.
 * @param bytes The number of bytes
 * @returns A human-readable string (e.g., "1.23 MB")
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
