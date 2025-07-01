/**
 * Tests for the DependencyCruiserAdapter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DependencyCruiserAdapter } from '../../importResolvers/dependencyCruiserAdapter.js';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';

// Mock the child_process.exec function
vi.mock('child_process', () => ({
  exec: vi.fn((command, callback) => {
    if (callback) {
      callback(null, { stdout: '', stderr: '' });
    }
    return { stdout: '', stderr: '' };
  })
}));

// Mock the fs.promises.readFile and fs.promises.unlink functions
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    unlink: vi.fn()
  }
}));

describe('DependencyCruiserAdapter', () => {
  const allowedDir = '/test/allowed';
  const outputDir = '/test/output';
  let adapter: DependencyCruiserAdapter;

  beforeEach(() => {
    adapter = new DependencyCruiserAdapter(allowedDir, outputDir);

    // Reset mocks
    vi.mocked(exec).mockClear();
    vi.mocked(fs.promises.readFile).mockReset();
    vi.mocked(fs.promises.unlink).mockReset();
  });

  it('should validate file paths against the security boundary', async () => {
    // Mock the readFile function to return a valid JSON result
    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify({
      modules: [],
      summary: { violations: [], error: 0, warn: 0, info: 0 }
    }));

    // Test with a file outside the allowed directory
    const result = await adapter.analyzeImports('/outside/allowed/dir/file.js', {
      baseDir: '/outside/allowed/dir'
    });

    // Should return an empty array for files outside the allowed directory
    expect(result).toEqual([]);

    // The exec function should not have been called
    expect(exec).not.toHaveBeenCalled();
  });

  it('should analyze JavaScript imports correctly', async () => {
    const filePath = path.join(allowedDir, 'test.js');
    const mockResult = {
      modules: [
        {
          source: filePath,
          dependencies: [
            {
              resolved: 'node_modules/react/index.js',
              coreModule: false,
              followable: true,
              dynamic: false,
              module: 'react',
              moduleSystem: 'es6',
              exoticallyRequired: false,
              dependencyTypes: ['npm']
            },
            {
              resolved: 'path',
              coreModule: true,
              followable: false,
              dynamic: false,
              module: 'path',
              moduleSystem: 'es6',
              exoticallyRequired: false,
              dependencyTypes: ['core']
            }
          ]
        }
      ],
      summary: { violations: [], error: 0, warn: 0, info: 0 }
    };

    // Mock the readFile function to return a valid JSON result
    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockResult));

    // Test with a file inside the allowed directory
    const result = await adapter.analyzeImports(filePath, {
      baseDir: path.dirname(filePath)
    });

    // Should return the expected imports
    expect(result).toHaveLength(2);

    // Check the first import (react)
    expect(result[0].path).toBe('node_modules/react/index.js');
    expect(result[0].isCore).toBe(false);
    expect(result[0].isDynamic).toBe(false);
    expect(result[0].moduleSystem).toBe('es6');
    expect(result[0].importedItems?.[0].name).toBe('react');

    // Check the second import (path)
    expect(result[1].path).toBe('path');
    expect(result[1].isCore).toBe(true);
    expect(result[1].isDynamic).toBe(false);
    expect(result[1].moduleSystem).toBe('es6');
    expect(result[1].importedItems?.[0].name).toBe('path');

    // The exec function should have been called
    expect(exec).toHaveBeenCalled();

    // The unlink function should have been called to clean up the temporary file
    expect(fs.promises.unlink).toHaveBeenCalled();
  });
});
