/**
 * Tests for the ClangdAdapter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClangdAdapter } from '../../importResolvers/clangdAdapter.js';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';

// Mock the child_process.exec function
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

// Mock the fs.promises.readFile, fs.promises.writeFile, and fs.promises.unlink functions
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn()
  },
  readFileSync: vi.fn()
}));

describe('ClangdAdapter', () => {
  const allowedDir = '/test/allowed';
  const outputDir = '/test/output';
  let adapter: ClangdAdapter;

  beforeEach(() => {
    adapter = new ClangdAdapter(allowedDir, outputDir);

    // Reset mocks
    vi.mocked(exec).mockClear();
    vi.mocked(fs.promises.readFile).mockReset();
    vi.mocked(fs.promises.writeFile).mockReset();
    vi.mocked(fs.promises.unlink).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  it('should validate file paths against the security boundary', async () => {
    // Mock the readFile function to return a valid C++ file
    vi.mocked(fs.readFileSync).mockReturnValue('#include <iostream>\n#include "myheader.h"');

    // Test with a file outside the allowed directory
    const result = await adapter.analyzeImports('/outside/allowed/dir/file.cpp', {});

    // Should return an empty array for files outside the allowed directory
    expect(result).toEqual([]);

    // The exec function should not have been called
    expect(exec).not.toHaveBeenCalled();
  });

  it('should analyze C++ imports correctly', async () => {
    const filePath = path.join(allowedDir, 'test.cpp');

    // Mock the exec function to return a valid path for clangd
    vi.mocked(exec).mockImplementation((cmd: string, options: import('child_process').ExecOptions | ((error: import('child_process').ExecException | null, stdout: string, stderr: string) => void), callback?: (error: import('child_process').ExecException | null, stdout: string, stderr: string) => void) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      // Simulate async execution
      setTimeout(() => {
        if (cmd.includes('which clangd')) {
          callback(null, { stdout: '/usr/bin/clangd', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      }, 10);

      return {
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() }
      } as import('child_process').ChildProcess;
    });

    // Mock the readFileSync function to return a valid C++ file
    vi.mocked(fs.readFileSync).mockReturnValue('#include <iostream>\n#include "myheader.h"');

    // Mock the readFile function to return a valid C++ file
    vi.mocked(fs.promises.readFile).mockResolvedValue('#include <iostream>\n#include "myheader.h"');

    // Test with a file inside the allowed directory
    const result = await adapter.analyzeImports(filePath, {});

    // Should return the expected imports
    expect(result).toHaveLength(2);

    // Check the first import (iostream)
    expect(result[0].path).toBe('iostream');
    expect(result[0].isCore).toBe(true);
    expect(result[0].importedItems?.[0].name).toBe('iostream');

    // Check the second import (myheader.h)
    expect(result[1].path).toBe('myheader.h');
    expect(result[1].isCore).toBe(false);
    expect(result[1].importedItems?.[0].name).toBe('myheader');

    // The exec function should have been called
    expect(exec).toHaveBeenCalled();

    // The writeFile function should have been called to create the compilation database
    expect(fs.promises.writeFile).toHaveBeenCalled();

    // The unlink function should have been called to clean up the temporary file
    expect(fs.promises.unlink).toHaveBeenCalled();
  });
});
