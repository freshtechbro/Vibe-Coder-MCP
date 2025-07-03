/**
 * Tests for the expanded security boundary feature in the import resolver.
 */

import { resolveImport, clearImportCache } from '../importResolver.js';
import * as path from 'path';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Import the modules to mock
import resolve from 'resolve';
import logger from '../../../../logger.js';
import * as fs from 'fs';

// Mock the modules
vi.mock('resolve', () => ({
  __esModule: true,
  default: {
    sync: vi.fn()
  },
  sync: vi.fn()
}));

vi.mock('fs', () => ({
  __esModule: true,
  existsSync: vi.fn()
}));

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof path>('path');
  return {
    ...actual,
    resolve: vi.fn().mockImplementation(actual.resolve)
  };
});

vi.mock('../../../../logger.js', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

describe('Import Resolver with Expanded Security Boundary', () => {
  beforeEach(() => {
    // Clear the cache before each test
    clearImportCache();

    // Clear all mocks
    vi.clearAllMocks();
    
    // Reset specific mocks to default state
    vi.mocked(fs.existsSync).mockReturnValue(false);
    resolve.sync = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should use expanded boundary when expandSecurityBoundary is true', () => {
    // Mock the resolve.sync function to return different paths based on input
    resolve.sync = vi.fn().mockImplementation((importPath) => {
      if (importPath === '../outside/allowed/dir/module') {
        return '/path/outside/allowed/dir/module.js';
      }
      throw new Error('Module not found');
    });

    const options = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/file.js',
      language: 'javascript',
      expandSecurityBoundary: true
    };

    const result = resolveImport('../outside/allowed/dir/module', options);

    expect(result).toBe('/path/outside/allowed/dir/module.js');
    expect(resolve.sync).toHaveBeenCalledWith('../outside/allowed/dir/module', {
      basedir: path.dirname(options.fromFile),
      extensions: ['.js', '.json', '.node', '.mjs', '.cjs'],
      preserveSymlinks: false
    });
    expect(logger.debug).toHaveBeenCalled();
  });

  it('should not use expanded boundary when expandSecurityBoundary is false', () => {
    // Mock the resolve.sync function to throw an error for paths outside the boundary
    resolve.sync = vi.fn().mockImplementation((importPath) => {
      if (importPath === '../outside/allowed/dir/module') {
        throw new Error('Module not found - Security boundary violation');
      }
      return '/path/to/project/src/module.js';
    });

    // Mock fs.existsSync to return false (simulating file doesn't exist)
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const options = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/file.js',
      language: 'javascript',
      expandSecurityBoundary: false
    };

    // This should fail and return the original path
    const result = resolveImport('../outside/allowed/dir/module', options);

    expect(result).toBe('../outside/allowed/dir/module');
    expect(resolve.sync).toHaveBeenCalledWith('../outside/allowed/dir/module', {
      basedir: path.dirname(options.fromFile),
      extensions: ['.js', '.json', '.node', '.mjs', '.cjs'],
      preserveSymlinks: false
    });
    expect(logger.debug).toHaveBeenCalled();
  });

  it('should log security-related information when using expanded boundary', () => {
    // Mock the resolve.sync function
    resolve.sync = vi.fn().mockReturnValue('/path/outside/allowed/dir/module.js');

    const options = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/file.js',
      language: 'javascript',
      expandSecurityBoundary: true
    };

    resolveImport('../outside/allowed/dir/module', options);

    // Check that security-related information is logged
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        securityExpanded: true
      }),
      expect.any(String)
    );
  });

  it('should handle errors gracefully when expanded boundary resolution fails', () => {
    // Mock the resolve.sync function to throw an error
    resolve.sync = vi.fn().mockImplementation(() => {
      throw new Error('Module not found');
    });

    // Mock fs.existsSync to return false (simulating file doesn't exist)
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const options = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/file.js',
      language: 'javascript',
      expandSecurityBoundary: true
    };

    const result = resolveImport('../outside/allowed/dir/module', options);

    // Should return the original path when resolution fails
    expect(result).toBe('../outside/allowed/dir/module');
    expect(logger.debug).toHaveBeenCalled();
  });
});
