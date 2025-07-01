/**
 * Tests for the debug configuration options.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateDebugConfig, validateCacheConfig } from '../../configValidator.js';
import { DebugConfig, CacheConfig } from '../../types.js';
import fs from 'fs';

// Mock the logger
vi.mock('../../../../logger.js', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

describe('Debug Configuration', () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
  });

  it('should use default values when no config is provided', () => {
    const result = validateDebugConfig();

    expect(result).toEqual({
      showDetailedImports: false,
      generateASTDebugFiles: false
    });
  });

  it('should override default values with provided values', () => {
    const config: Partial<DebugConfig> = {
      showDetailedImports: true,
      generateASTDebugFiles: true
    };

    const result = validateDebugConfig(config);

    expect(result).toEqual({
      showDetailedImports: true,
      generateASTDebugFiles: true
    });
  });

  it('should handle partial configuration', () => {
    const config: Partial<DebugConfig> = {
      showDetailedImports: true
    };

    const result = validateDebugConfig(config);

    expect(result).toEqual({
      showDetailedImports: true,
      generateASTDebugFiles: false
    });
  });
});

describe('Cache Configuration Validation', () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
  });

  it('should use default values when no config is provided', () => {
    const result = validateCacheConfig();

    expect(result).toEqual({
      enabled: true,
      maxEntries: 10000,
      maxAge: 24 * 60 * 60 * 1000,
      cacheDir: undefined,
      useFileBasedAccess: true,
      useFileHashes: true,
      maxCachedFiles: 0,
      useMemoryCache: false,
      memoryMaxEntries: 1000,
      memoryMaxAge: 10 * 60 * 1000,
      memoryThreshold: 0.8,
    });
  });

  it('should validate absolute cacheDir path', () => {
    const config: Partial<CacheConfig> = {
      enabled: true,
      cacheDir: '/tmp/cache'
    };

    const result = validateCacheConfig(config);

    expect(result.cacheDir).toBe('/tmp/cache');
  });

  it('should warn for relative cacheDir path', () => {
    const config: Partial<CacheConfig> = {
      enabled: true,
      cacheDir: 'relative/cache'
    };

    const result = validateCacheConfig(config);

    // Should still work but with a warning
    expect(result.cacheDir).toBe('relative/cache');
  });

  it('should skip validation when caching is disabled', () => {
    const config: Partial<CacheConfig> = {
      enabled: false,
      cacheDir: 'invalid/path'
    };

    const result = validateCacheConfig(config);

    expect(result.enabled).toBe(false);
    expect(result.cacheDir).toBe('invalid/path');
  });

  it('should handle empty cacheDir gracefully', () => {
    const config: Partial<CacheConfig> = {
      enabled: true,
      cacheDir: ''
    };

    const result = validateCacheConfig(config);

    expect(result.enabled).toBe(true);
    expect(result.cacheDir).toBe('');
  });

  it('should validate parent directory existence for cacheDir', () => {
    // Mock fs.existsSync to return false for parent directory
    const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const config: Partial<CacheConfig> = {
      enabled: true,
      cacheDir: '/nonexistent/parent/cache'
    };

    const result = validateCacheConfig(config);

    expect(result.cacheDir).toBe('/nonexistent/parent/cache');
    expect(existsSyncSpy).toHaveBeenCalled();

    existsSyncSpy.mockRestore();
  });
});
