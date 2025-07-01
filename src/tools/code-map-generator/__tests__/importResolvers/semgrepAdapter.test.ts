/**
 * Tests for the SemgrepAdapter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SemgrepAdapter } from '../../importResolvers/semgrepAdapter.js';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

// Type definition for mock promise with child property
interface MockExecPromise extends Promise<{ stdout: string; stderr: string }> {
  child: {
    on: () => void;
    stdout: { on: () => void };
    stderr: { on: () => void };
  };
}

// Mock the util.promisify function
vi.mock('util', () => ({
  promisify: vi.fn((fn) => {
    if (fn.name === 'exec') {
      return vi.fn().mockImplementation(() => {
        const promise = Promise.resolve({
          stdout: '{"results":[],"errors":[]}',
          stderr: ''
        });
        // Add child property to the promise
        (promise as MockExecPromise).child = {
          on: vi.fn(),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() }
        };
        return promise;
      });
    }
    return fn;
  })
}));

// Mock the child_process.exec function
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

// Mock the fs.promises.writeFile and fs.promises.unlink functions
vi.mock('fs', () => ({
  promises: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('SemgrepAdapter', () => {
  const allowedDir = '/test/allowed';
  const outputDir = '/test/output';
  let adapter: SemgrepAdapter;

  beforeEach(() => {
    adapter = new SemgrepAdapter(allowedDir, outputDir);

    // Reset mocks
    vi.mocked(exec).mockClear();
    vi.mocked(promisify(exec)).mockClear();
    vi.mocked(fs.promises.writeFile).mockReset();
    vi.mocked(fs.promises.unlink).mockReset();
  });

  it('should validate file paths against the security boundary', async () => {
    // Test with a file outside the allowed directory
    const result = await adapter.analyzeImports('/outside/allowed/dir/file.js', {});

    // Should return an empty array for files outside the allowed directory
    expect(result).toEqual([]);

    // The exec function should not have been called
    expect(exec).not.toHaveBeenCalled();
  });

  it('should analyze JavaScript imports correctly', async () => {
    const filePath = path.join(allowedDir, 'test.js');

    // Mock the exec function to return a valid Semgrep result
    const mockResult = {
      results: [
        {
          check_id: 'js-import-default',
          path: filePath,
          start: { line: 1, col: 1 },
          end: { line: 1, col: 30 },
          extra: {
            lines: 'import React from "react"',
            message: 'Found JavaScript/TypeScript default import',
            metadata: {
              importType: 'default',
              isDefault: true
            }
          }
        },
        {
          check_id: 'js-import-named',
          path: filePath,
          start: { line: 2, col: 1 },
          end: { line: 2, col: 40 },
          extra: {
            lines: 'import { useState } from "react"',
            message: 'Found JavaScript/TypeScript named import',
            metadata: {
              importType: 'named'
            }
          }
        }
      ],
      errors: []
    };

    // Mock the execAsync function to return the mock result
    vi.mocked(promisify(exec)).mockImplementation(() => {
      const promise = Promise.resolve({
        stdout: JSON.stringify(mockResult),
        stderr: ''
      });
      // Add child property to the promise
      (promise as MockExecPromise).child = {
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() }
      };
      return promise;
    });

    // Test with a file inside the allowed directory
    const result = await adapter.analyzeImports(filePath, {});

    // Should return the expected imports
    expect(result).toHaveLength(1); // Both imports are from 'react'

    // Check the import
    expect(result[0].path).toBe('react');
    expect(result[0].importedItems).toHaveLength(2);
    expect(result[0].importedItems?.[0].name).toBe('React');
    expect(result[0].importedItems?.[0].isDefault).toBe(true);
    expect(result[0].importedItems?.[1].name).toBe('useState');

    // The exec function should have been called
    expect(exec).toHaveBeenCalled();

    // The writeFile function should have been called to create the rules file
    expect(fs.promises.writeFile).toHaveBeenCalled();

    // The unlink function should have been called to clean up the temporary file
    expect(fs.promises.unlink).toHaveBeenCalled();
  });

  it('should analyze Python imports correctly', async () => {
    const filePath = path.join(allowedDir, 'test.py');

    // Mock the exec function to return a valid Semgrep result
    const mockResult = {
      results: [
        {
          check_id: 'python-import',
          path: filePath,
          start: { line: 1, col: 1 },
          end: { line: 1, col: 10 },
          extra: {
            lines: 'import os',
            message: 'Found Python import',
            metadata: {
              importType: 'module'
            }
          }
        },
        {
          check_id: 'python-from-import',
          path: filePath,
          start: { line: 2, col: 1 },
          end: { line: 2, col: 30 },
          extra: {
            lines: 'from django.db import models',
            message: 'Found Python from-import',
            metadata: {
              importType: 'from'
            }
          }
        }
      ],
      errors: []
    };

    // Mock the execAsync function to return the mock result
    vi.mocked(promisify(exec)).mockImplementation(() => {
      const promise = Promise.resolve({
        stdout: JSON.stringify(mockResult),
        stderr: ''
      });
      // Add child property to the promise
      (promise as MockExecPromise).child = {
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() }
      };
      return promise;
    });

    // Test with a file inside the allowed directory
    const result = await adapter.analyzeImports(filePath, {});

    // Should return the expected imports
    expect(result).toHaveLength(2);

    // Check the first import (os)
    expect(result[0].path).toBe('os');
    expect(result[0].isCore).toBe(true);
    expect(result[0].importedItems?.[0].name).toBe('os');

    // Check the second import (django.db)
    expect(result[1].path).toBe('django.db');
    expect(result[1].isCore).toBe(false);
    expect(result[1].importedItems?.[0].name).toBe('models');

    // The exec function should have been called
    expect(exec).toHaveBeenCalled();
  });

  it('should handle Semgrep errors gracefully', async () => {
    const filePath = path.join(allowedDir, 'test.js');

    // Mock the exec function to throw an error
    vi.mocked(promisify(exec)).mockImplementation(() => {
      const promise = Promise.reject(new Error('Semgrep failed'));
      // Add child property to the promise
      (promise as MockExecPromise).child = {
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() }
      };
      return promise;
    });

    // Test with a file inside the allowed directory
    const result = await adapter.analyzeImports(filePath, {});

    // Should return an empty array on error
    expect(result).toEqual([]);

    // The exec function should have been called
    expect(exec).toHaveBeenCalled();
  });

  it('should use cache for repeated calls with the same parameters', async () => {
    const filePath = path.join(allowedDir, 'test.js');

    // Mock the exec function to return a valid Semgrep result
    const mockResult = {
      results: [
        {
          check_id: 'js-import-default',
          path: filePath,
          start: { line: 1, col: 1 },
          end: { line: 1, col: 30 },
          extra: {
            lines: 'import React from "react"',
            message: 'Found JavaScript/TypeScript default import',
            metadata: {
              importType: 'default',
              isDefault: true
            }
          }
        }
      ],
      errors: []
    };

    // Mock the execAsync function to return the mock result
    vi.mocked(promisify(exec)).mockImplementation(() => {
      const promise = Promise.resolve({
        stdout: JSON.stringify(mockResult),
        stderr: ''
      });
      // Add child property to the promise
      (promise as MockExecPromise).child = {
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() }
      };
      return promise;
    });

    // First call
    await adapter.analyzeImports(filePath, {});

    // Reset mocks
    vi.mocked(exec).mockClear();
    vi.mocked(promisify(exec)).mockClear();
    vi.mocked(fs.promises.writeFile).mockClear();
    vi.mocked(fs.promises.unlink).mockClear();

    // Second call with the same parameters
    await adapter.analyzeImports(filePath, {});

    // The exec function should not have been called again
    expect(exec).not.toHaveBeenCalled();

    // The writeFile function should not have been called again
    expect(fs.promises.writeFile).not.toHaveBeenCalled();

    // The unlink function should not have been called again
    expect(fs.promises.unlink).not.toHaveBeenCalled();
  });
});
