/**
 * Tests for the ExtendedPythonImportResolver.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExtendedPythonImportResolver } from '../../importResolvers/extendedPythonImportResolver.js';
import * as path from 'path';
import * as fs from 'fs';
import { parseSourceCode } from '../../parser.js';

// Mock the fs module
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
  },
  existsSync: vi.fn(),
  statSync: vi.fn()
}));

// Mock the child_process module
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

// Mock the parseSourceCode function
vi.mock('../../parser.js', () => ({
  parseSourceCode: vi.fn()
}));

describe('ExtendedPythonImportResolver', () => {
  const allowedDir = '/test/allowed';
  const outputDir = '/test/output';
  let resolver: ExtendedPythonImportResolver;

  beforeEach(() => {
    resolver = new ExtendedPythonImportResolver(allowedDir, outputDir);

    // Reset mocks
    vi.mocked(fs.promises.readFile).mockReset();
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(parseSourceCode).mockReset();
  });

  it('should validate file paths against the security boundary', async () => {
    // Mock the readFile function to return a valid Python file
    vi.mocked(fs.promises.readFile).mockResolvedValue('import os\nimport sys');

    // Mock the parseSourceCode function to return an empty AST
    const mockAst = {
      rootNode: {
        descendantsOfType: () => []
      }
    };

    vi.mocked(parseSourceCode).mockResolvedValue({
      ast: mockAst as Record<string, unknown>,
      language: 'python'
    });

    // Test with a file outside the allowed directory
    const result = await resolver.analyzeImports('/outside/allowed/dir/file.py', {});

    // Should return an empty array for files outside the allowed directory
    expect(result).toEqual([]);
  });

  it('should analyze Python imports correctly', async () => {
    const filePath = path.join(allowedDir, 'test.py');
    const fileContent = `
import os
import sys
from datetime import datetime
from collections import defaultdict, Counter
import numpy as np
from . import module1
from .subpackage import module2
`;

    // Mock the readFile function to return the test file content
    vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);

    // Create a mock AST with import nodes
    const mockAst = {
      rootNode: {
        descendantsOfType: (_types: string[]) => {
          // Return mock import nodes based on the file content
          return [
            // import os
            {
              type: 'import_statement',
              childForFieldName: (name: string) => {
                if (name === 'name') {
                  return {
                    startIndex: fileContent.indexOf('os'),
                    endIndex: fileContent.indexOf('os') + 2
                  };
                }
                return null;
              },
              startPosition: { row: 1 },
              endPosition: { row: 1 }
            },
            // import sys
            {
              type: 'import_statement',
              childForFieldName: (name: string) => {
                if (name === 'name') {
                  return {
                    startIndex: fileContent.indexOf('sys'),
                    endIndex: fileContent.indexOf('sys') + 3
                  };
                }
                return null;
              },
              startPosition: { row: 2 },
              endPosition: { row: 2 }
            },
            // from datetime import datetime
            {
              type: 'import_from_statement',
              childForFieldName: (name: string) => {
                if (name === 'module_name') {
                  return {
                    startIndex: fileContent.indexOf('datetime', fileContent.indexOf('from')),
                    endIndex: fileContent.indexOf('datetime', fileContent.indexOf('from')) + 8
                  };
                }
                return null;
              },
              descendantsOfType: (_types: string[]) => {
                if (types.includes('identifier')) {
                  return [
                    {
                      parent: {
                        type: 'import_from_statement',
                        previousSibling: { text: 'import' }
                      },
                      startIndex: fileContent.indexOf('datetime', fileContent.indexOf('import')),
                      endIndex: fileContent.indexOf('datetime', fileContent.indexOf('import')) + 8,
                      text: 'datetime'
                    }
                  ];
                }
                return [];
              },
              startPosition: { row: 3 },
              endPosition: { row: 3 }
            }
          ];
        }
      }
    } as Record<string, unknown>;

    // Mock the parseSourceCode function to return our mock AST
    vi.mocked(parseSourceCode).mockResolvedValue({
      ast: mockAst,
      language: 'python'
    } as Record<string, unknown>);

    // Mock existsSync to simulate file existence checks
    vi.mocked(fs.existsSync).mockImplementation((path: string) => {
      // Return true for standard library modules
      if (path.includes('os.py') || path.includes('sys.py') || path.includes('datetime')) {
        return true;
      }
      return false;
    });

    // Test with a file inside the allowed directory
    const result = await resolver.analyzeImports(filePath, {});

    // Should return the expected imports
    expect(result.length).toBeGreaterThan(0);

    // Check the first import (os)
    const osImport = result.find(imp => imp.path === 'os');
    expect(osImport).toBeDefined();
    expect(osImport?.isCore).toBe(true);
    expect(osImport?.importedItems?.[0].name).toBe('os');

    // Check the second import (sys)
    const sysImport = result.find(imp => imp.path === 'sys');
    expect(sysImport).toBeDefined();
    expect(sysImport?.isCore).toBe(true);
    expect(sysImport?.importedItems?.[0].name).toBe('sys');

    // Check the third import (from datetime import datetime)
    const datetimeImport = result.find(imp => imp.path === 'datetime');
    expect(datetimeImport).toBeDefined();
    expect(datetimeImport?.isCore).toBe(true);
    expect(datetimeImport?.metadata?.isFromImport).toBe(true);
  });

  it('should handle caching of import analysis results', async () => {
    const filePath = path.join(allowedDir, 'test.py');

    // Mock the readFile function to return a valid Python file
    vi.mocked(fs.promises.readFile).mockResolvedValue('import os');

    // Mock the parseSourceCode function to return a simple AST
    const mockAst = {
      rootNode: {
        descendantsOfType: () => [
          {
            type: 'import_statement',
            childForFieldName: (name: string) => {
              if (name === 'name') {
                return {
                  startIndex: 7,
                  endIndex: 9
                };
              }
              return null;
            },
            startPosition: { row: 0 },
            endPosition: { row: 0 }
          }
        ]
      }
    };

    vi.mocked(parseSourceCode).mockResolvedValue({
      ast: mockAst as Record<string, unknown>,
      language: 'python'
    });

    // First call should read the file and parse it
    await resolver.analyzeImports(filePath, {});

    // Reset the mocks to verify they're not called again
    vi.mocked(fs.promises.readFile).mockClear();
    vi.mocked(parseSourceCode).mockClear();

    // Second call with the same parameters should use the cache
    await resolver.analyzeImports(filePath, {});

    // The readFile and parseSourceCode functions should not have been called again
    expect(fs.promises.readFile).not.toHaveBeenCalled();
    expect(parseSourceCode).not.toHaveBeenCalled();
  });
});
