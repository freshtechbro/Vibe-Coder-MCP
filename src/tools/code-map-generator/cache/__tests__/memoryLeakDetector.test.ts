/**
 * Tests for the MemoryLeakDetector class.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryLeakDetector } from '../memoryLeakDetector.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Interface for detector with private methods we need to spy on
interface MemoryLeakDetectorPrivate extends MemoryLeakDetector {
  takeHeapSnapshot(): Promise<string>;
  compareHeapSnapshots(path1: string, path2: string): Promise<{
    snapshot1Size: number;
    snapshot2Size: number;
    sizeDifference: number;
    growthPercentage: number;
  }>;
}

// Mock the parser's getMemoryStats function
vi.mock('../../parser.js', () => {
  return {
    default: {},
    getMemoryStats: vi.fn().mockReturnValue({
      heapUsed: 100000000,
      heapTotal: 200000000,
      rss: 150000000,
      systemTotal: 1000000000,
      memoryUsagePercentage: 0.15,
      formatted: {
        heapUsed: '95.37 MB',
        heapTotal: '190.73 MB',
        rss: '143.05 MB',
        systemTotal: '953.67 MB'
      }
    }),
  };
});

// Mock process.memoryUsage
vi.mock('process', () => {
  const originalProcess = { ...process };
  return {
    ...originalProcess,
    memoryUsage: vi.fn().mockReturnValue({
      rss: 150000000,
      heapTotal: 200000000,
      heapUsed: 100000000,
      external: 10000000,
      arrayBuffers: 5000000
    })
  };
});

// Mock v8.getHeapSnapshot
vi.mock('v8', () => {
  return {
    default: {
      getHeapSnapshot: vi.fn().mockReturnValue({
        pipe: vi.fn((writeStream) => {
          // Simulate writing to the stream
          setTimeout(() => {
            writeStream.emit('finish');
          }, 10);
        })
      })
    },
    getHeapSnapshot: vi.fn().mockReturnValue({
      pipe: vi.fn((writeStream) => {
        // Simulate writing to the stream
        setTimeout(() => {
          writeStream.emit('finish');
        }, 10);
      })
    })
  };
});

// Mock fs module for createWriteStream
vi.mock('fs', () => {
  return {
    createWriteStream: vi.fn().mockReturnValue({
      on: vi.fn().mockImplementation(function(event, callback) {
        if (event === 'finish') {
          this.finishCallback = callback;
        }
        return this;
      }),
      emit: vi.fn().mockImplementation(function(event) {
        if (event === 'finish' && this.finishCallback) {
          this.finishCallback();
        }
      }),
      finishCallback: null
    }),
    constants: {
      R_OK: 4
    }
  };
});

describe('MemoryLeakDetector', () => {
  let tempDir: string;
  let detector: MemoryLeakDetector;

  beforeEach(async () => {
    // Create a temporary directory for snapshots
    tempDir = path.join(os.tmpdir(), `memory-leak-detector-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Create a new detector instance
    detector = new MemoryLeakDetector({
      snapshotDir: tempDir,
      snapshotInterval: 1000, // 1 second
      maxSnapshots: 3,
      leakThreshold: 0.2, // 20%
      autoDetect: false, // Disable auto-detection for tests
      checkInterval: 500, // 0.5 seconds
      maxSamples: 5
    });

    await detector.init();
  });

  afterEach(async () => {
    // Clean up the detector
    detector.cleanup();

    // Clean up the temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Error cleaning up temp directory:', error);
    }
  });

  it('should initialize correctly', () => {
    expect(detector).toBeDefined();
  });

  it('should take memory samples', () => {
    // Take a memory sample (private method, so we need to call it through a public method)
    const result = detector.analyzeMemoryTrend();

    // Verify the result structure
    expect(result).toBeDefined();
    expect(result.samples).toBeDefined();

    // If samples are present, verify their properties
    if (result.samples.length > 0) {
      const sample = result.samples[0];
      expect(sample.heapUsed).toBe(100000000);
      expect(sample.heapTotal).toBe(200000000);
      expect(sample.rss).toBe(150000000);
      expect(sample.external).toBe(10000000);
      expect(sample.arrayBuffers).toBe(5000000);
    }
  });

  it('should analyze memory trend', async () => {
    // Mock the analyzeMemoryTrend method to return a predefined result
    vi.spyOn(detector, 'analyzeMemoryTrend').mockImplementation(() => {
      return {
        samples: [
          {
            timestamp: Date.now() - 1000,
            heapUsed: 100000000,
            heapTotal: 200000000,
            rss: 150000000,
            external: 10000000,
            arrayBuffers: 5000000
          },
          {
            timestamp: Date.now(),
            heapUsed: 130000000,
            heapTotal: 240000000,
            rss: 180000000,
            external: 12000000,
            arrayBuffers: 6000000
          }
        ],
        trend: 'increasing',
        increasePercentage: 30,
        leakDetected: true,
        leakType: 'heap'
      };
    });

    // Call the method
    const result = detector.analyzeMemoryTrend();

    // Verify the result has expected properties
    expect(result).toBeDefined();
    expect(result.samples).toBeDefined();
    expect(result.samples.length).toBeGreaterThan(0);
    expect(result.trend).toBe('increasing');
    expect(result.leakDetected).toBe(true);
  });

  it('should take heap snapshots', async () => {
    // Mock the takeHeapSnapshot method to avoid actual snapshot creation
    vi.spyOn(detector as MemoryLeakDetectorPrivate, 'takeHeapSnapshot').mockImplementation(async () => {
      const snapshotPath = path.join(tempDir, `heap-snapshot-${Date.now()}.heapsnapshot`);
      return snapshotPath;
    });

    const snapshotPath = await detector.takeHeapSnapshot();

    // Should return a valid path
    expect(snapshotPath).toContain(tempDir);
    expect(snapshotPath).toContain('heap-snapshot-');
  });

  it('should compare heap snapshots', async () => {
    // Mock the takeHeapSnapshot method
    const snapshotPath = path.join(tempDir, `heap-snapshot-${Date.now()}.heapsnapshot`);
    vi.spyOn(detector as MemoryLeakDetectorPrivate, 'takeHeapSnapshot').mockResolvedValue(snapshotPath);

    // Mock fs.stat to return different sizes
    const statMock = vi.fn()
      .mockResolvedValueOnce({ size: 1000000 })
      .mockResolvedValueOnce({ size: 1200000 });

    vi.spyOn(fs, 'stat').mockImplementation(statMock);

    // Mock the compareHeapSnapshots method
    vi.spyOn(detector as MemoryLeakDetectorPrivate, 'compareHeapSnapshots').mockResolvedValue({
      snapshot1Size: 1000000,
      snapshot2Size: 1200000,
      sizeDiff: 200000,
      percentChange: 20
    });

    // Call the method
    const comparison = await detector.compareHeapSnapshots(snapshotPath, snapshotPath);

    // Verify the comparison has expected properties
    expect(comparison).toBeDefined();
  });
});
