/**
 * Tests for the TieredCache class.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TieredCache } from '../tieredCache.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock the parser's getMemoryStats function
vi.mock('../../parser.js', () => ({
  getMemoryStats: vi.fn().mockReturnValue({
    memoryUsagePercentage: 0.5, // 50% memory usage
  }),
}));

describe('TieredCache', () => {
  let tempDir: string;
  let cache: TieredCache<unknown>;

  beforeEach(async () => {
    // Create a temporary directory for the cache
    tempDir = path.join(os.tmpdir(), `tiered-cache-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Create a new cache instance
    cache = new TieredCache<unknown>({
      name: 'test-cache',
      cacheDir: tempDir,
      maxEntries: 100,
      maxAge: 1000, // 1 second
      useMemoryCache: true,
      memoryMaxEntries: 50,
      memoryMaxAge: 500, // 0.5 seconds
      memoryThreshold: 0.8, // 80% memory usage threshold
    });

    await cache.init();
  });

  afterEach(async () => {
    // Close the cache
    cache.close();

    // Clean up the temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Error cleaning up temp directory:', error);
    }
  });

  it('should store and retrieve values', async () => {
    await cache.set('key1', 'value1');
    const value = await cache.get('key1');
    expect(value).toBe('value1');
  });

  it('should check if a key exists', async () => {
    await cache.set('key2', 'value2');
    const exists = await cache.has('key2');
    expect(exists).toBe(true);

    const notExists = await cache.has('nonexistent');
    expect(notExists).toBe(false);
  });

  it('should delete values', async () => {
    await cache.set('key3', 'value3');
    await cache.delete('key3');
    const value = await cache.get('key3');
    expect(value).toBeUndefined();
  });

  it('should clear all values', async () => {
    await cache.set('key4', 'value4');
    await cache.set('key5', 'value5');
    await cache.clear();
    const value4 = await cache.get('key4');
    const value5 = await cache.get('key5');
    expect(value4).toBeUndefined();
    expect(value5).toBeUndefined();
  });

  it('should prune expired entries', async () => {
    await cache.set('key6', 'value6');
    
    // Wait for the entry to expire
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const value = await cache.get('key6');
    expect(value).toBeUndefined();
  });

  it('should get cache statistics', async () => {
    await cache.set('key7', 'value7');
    const stats = await cache.getStats();
    
    expect(stats.name).toBe('test-cache');
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.memoryStats).toBeDefined();
  });

  it('should hit memory cache first', async () => {
    await cache.set('key8', 'value8');
    
    // First get should hit memory cache
    const value1 = await cache.get('key8');
    
    // Wait for memory cache to expire but not file cache
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Second get should hit file cache
    const value2 = await cache.get('key8');
    
    expect(value1).toBe('value8');
    expect(value2).toBe('value8');
    
    const stats = await cache.getStats();
    expect(stats.memoryStats?.hits).toBe(1);
  });
});
