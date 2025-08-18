/**
 * Tests for the batch processor with memory checks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processBatchesWithMemoryCheck } from '../batchProcessor';
import * as parser from '../parser';

// Mock getMemoryStats and grammarManager
vi.mock('../parser', () => ({
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
  grammarManager: {
    unloadUnusedGrammars: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock logger
vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Batch Processor with Memory Checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock global.gc
    global.gc = vi.fn();
  });
  
  afterEach(() => {
    delete global.gc;
  });
  
  it('should process items in batches', async () => {
    // Create test items
    const items = Array.from({ length: 100 }, (_, i) => i);
    
    // Create processor function
    const processor = vi.fn().mockImplementation(item => Promise.resolve(item * 2));
    
    // Process items
    const results = await processBatchesWithMemoryCheck(
      items,
      processor,
      20 // batch size
    );
    
    // Verify all items were processed
    expect(results.length).toBe(100);
    expect(results[0]).toBe(0);
    expect(results[99]).toBe(198);
    
    // Verify processor was called for each item
    expect(processor).toHaveBeenCalledTimes(100);
  });
  
  it('should run cleanup when memory threshold is exceeded', async () => {
    // Create test items
    const items = Array.from({ length: 100 }, (_, i) => i);
    
    // Create processor function
    const processor = vi.fn().mockImplementation(item => Promise.resolve(item * 2));
    
    // Create cleanup function
    const cleanup = vi.fn().mockResolvedValue(undefined);
    
    // Mock memory usage to exceed threshold after first batch
    vi.mocked(parser.getMemoryStats).mockReturnValueOnce({
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
    }).mockReturnValueOnce({
      heapUsed: 800000000,
      heapTotal: 900000000,
      rss: 850000000,
      systemTotal: 1000000000,
      memoryUsagePercentage: 0.85, // Exceeds threshold
      formatted: {
        heapUsed: '762.94 MB',
        heapTotal: '858.31 MB',
        rss: '810.62 MB',
        systemTotal: '953.67 MB'
      }
    }).mockReturnValue({
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
    });
    
    // Process items
    const results = await processBatchesWithMemoryCheck(
      items,
      processor,
      20, // batch size
      0.8, // memory threshold
      cleanup
    );
    
    // Verify all items were processed
    expect(results.length).toBe(100);
    
    // Verify cleanup was called
    expect(cleanup).toHaveBeenCalledTimes(1);
    
    // Verify garbage collection was called
    expect(global.gc).toHaveBeenCalledTimes(1);
  });
});
