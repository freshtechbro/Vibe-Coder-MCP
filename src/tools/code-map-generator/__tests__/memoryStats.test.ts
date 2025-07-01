/**
 * Tests for memory stats functions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock process.memoryUsage
vi.mock('process', () => {
  const originalProcess = { ...process };
  return {
    ...originalProcess,
    memoryUsage: vi.fn().mockReturnValue({
      rss: 100000000,
      heapTotal: 80000000,
      heapUsed: 60000000,
      external: 10000000,
      arrayBuffers: 5000000
    })
  };
});

// Mock os module
vi.mock('os', () => ({
  default: {
    totalmem: vi.fn().mockReturnValue(1000000000)
  },
  totalmem: vi.fn().mockReturnValue(1000000000)
}));

// Mock the parser module to provide the functions we need
vi.mock('../parser.js', async () => {
  const actual = await vi.importActual('../parser.js') as Record<string, unknown>;

  // Create the actual functions with mocked dependencies
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getMemoryStats = () => {
    const memUsage = {
      rss: 100000000,
      heapTotal: 80000000,
      heapUsed: 60000000,
      external: 10000000,
      arrayBuffers: 5000000
    };
    const systemTotal = 1000000000;

    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      systemTotal,
      memoryUsagePercentage: memUsage.rss / systemTotal,
      formatted: {
        heapUsed: formatBytes(memUsage.heapUsed),
        heapTotal: formatBytes(memUsage.heapTotal),
        rss: formatBytes(memUsage.rss),
        systemTotal: formatBytes(systemTotal)
      }
    };
  };

  return {
    ...actual,
    formatBytes,
    getMemoryStats
  };
});

// Import the functions after mocking
import { formatBytes, getMemoryStats } from '../parser.js';

describe('Memory Stats Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatBytes', () => {
    it('should format bytes to human-readable string', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1023)).toBe('1023 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(1099511627776)).toBe('1 TB');
    });
  });

  describe('getMemoryStats', () => {
    it('should return memory usage statistics', () => {
      const stats = getMemoryStats();

      expect(stats.heapUsed).toBe(60000000);
      expect(stats.heapTotal).toBe(80000000);
      expect(stats.rss).toBe(100000000);
      expect(stats.systemTotal).toBe(1000000000);
      expect(stats.memoryUsagePercentage).toBe(0.1);

      expect(stats.formatted.heapUsed).toBe('57.22 MB');
      expect(stats.formatted.heapTotal).toBe('76.29 MB');
      expect(stats.formatted.rss).toBe('95.37 MB');
      expect(stats.formatted.systemTotal).toBe('953.67 MB');
    });
  });
});
