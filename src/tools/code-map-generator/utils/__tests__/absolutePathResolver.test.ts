/**
 * Tests for absolute path resolution in the import resolver.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveImport, ResolvedImportResult, ImportResolverOptions } from '../importResolver.no-cache.js';
import { ImportResolverManager } from '../ImportResolverManager.js';

// Mock the logger
vi.mock('../../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the resolve module
vi.mock('resolve', () => {
  const mockSync = vi.fn();
  return {
    sync: mockSync,
    __esModule: true,
    default: {
      sync: mockSync
    }
  };
});

// Import the mocked modules
import * as resolve from 'resolve';

describe('Absolute Path Resolution', () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
  });

  it('should return both relative and absolute paths when includeAbsolutePath is true', () => {
    // Mock the resolve.sync function
    vi.mocked(resolve.sync).mockReturnValue('/path/to/project/src/utils/helper.js');

    const options: ImportResolverOptions = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/components/Button.js',
      language: 'javascript',
      includeAbsolutePath: true
    };

    const result = resolveImport('../utils/helper', options) as ResolvedImportResult;

    expect(result).toHaveProperty('relativePath');
    expect(result).toHaveProperty('absolutePath');
    expect(result.relativePath).toBe('./src/utils/helper.js');
    expect(result.absolutePath).toBe('/path/to/project/src/utils/helper.js');
  });

  it('should return only relative path when includeAbsolutePath is false', () => {
    // Mock the resolve.sync function
    vi.mocked(resolve.sync).mockReturnValue('/path/to/project/src/utils/helper.js');

    const options: ImportResolverOptions = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/components/Button.js',
      language: 'javascript',
      includeAbsolutePath: false
    };

    const result = resolveImport('../utils/helper', options);

    expect(typeof result).toBe('string');
    expect(result).toBe('./src/utils/helper.js');
  });

  it('should handle built-in modules correctly', () => {
    const options: ImportResolverOptions = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/components/Button.js',
      language: 'javascript',
      includeAbsolutePath: true
    };

    const result = resolveImport('fs', options) as ResolvedImportResult;

    expect(result).toHaveProperty('relativePath');
    expect(result.relativePath).toBe('fs');
    expect(result.absolutePath).toBeUndefined();
    expect(vi.mocked(resolve.sync)).not.toHaveBeenCalled();
  });

  it('should handle external packages correctly', () => {
    const options: ImportResolverOptions = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/components/Button.js',
      language: 'javascript',
      includeAbsolutePath: true
    };

    const result = resolveImport('react', options) as ResolvedImportResult;

    expect(result).toHaveProperty('relativePath');
    expect(result.relativePath).toBe('react');
    expect(result.absolutePath).toBeUndefined();
    expect(vi.mocked(resolve.sync)).not.toHaveBeenCalled();
  });
});

describe('ImportResolverManager with Absolute Paths', () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
  });

  it('should return both relative and absolute paths when includeAbsolutePath is true', () => {
    const manager = ImportResolverManager.getInstance();
    manager.initialize({
      enabled: true,
      extensions: {
        javascript: ['.js', '.json']
      }
    });

    // Mock the resolveImport function
    vi.mocked(resolve.sync).mockReturnValue('/path/to/project/src/utils/helper.js');

    const result = manager.resolveImport(
      '../utils/helper',
      '/path/to/project/src/components/Button.js',
      'javascript',
      '/path/to/project',
      true // Include absolute path
    );

    expect(result).toHaveProperty('resolvedPath');
    expect(result).toHaveProperty('absolutePath');
    expect(result.resolvedPath).toBeDefined();
    expect(result.absolutePath).toBeDefined();
  });

  it('should return only relative path when includeAbsolutePath is not specified', () => {
    const manager = ImportResolverManager.getInstance();
    manager.initialize({
      enabled: true,
      extensions: {
        javascript: ['.js', '.json']
      }
    });

    // Mock the resolveImport function
    vi.mocked(resolve.sync).mockReturnValue('/path/to/project/src/utils/helper.js');

    const result = manager.resolveImport(
      '../utils/helper',
      '/path/to/project/src/components/Button.js',
      'javascript',
      '/path/to/project'
    );

    expect(typeof result).toBe('string');
  });
});
