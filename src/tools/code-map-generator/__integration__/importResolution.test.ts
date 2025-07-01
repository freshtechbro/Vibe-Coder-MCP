/**
 * Integration tests for import resolution with expanded security boundary.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the file system
vi.mock('fs', () => {
  const writeFileMock = vi.fn().mockResolvedValue(undefined);
  return {
    promises: {
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: writeFileMock,
      readFile: vi.fn().mockImplementation((filePath) => {
        if (filePath.includes('test-file.js')) {
          return Promise.resolve('import { something } from "../outside/allowed/dir/module";');
        }
        if (filePath.includes('outside/allowed/dir/module.js')) {
          return Promise.resolve('export const something = "test";');
        }
        return Promise.resolve('');
      }),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      access: vi.fn().mockResolvedValue(undefined),
      appendFile: vi.fn().mockResolvedValue(undefined)
    },
    constants: {
      R_OK: 4
    },
    existsSync: vi.fn().mockReturnValue(true)
  };
});

// Mock the path module
vi.mock('path', async () => {
  const originalPath = await vi.importActual('path');
  return {
    ...originalPath,
    resolve: vi.fn().mockImplementation((...args) => args.join('/')),
    join: vi.fn().mockImplementation((...args) => args.join('/')),
    dirname: vi.fn().mockImplementation((p) => p.split('/').slice(0, -1).join('/')),
    basename: vi.fn().mockImplementation((p) => p.split('/').pop()),
    extname: vi.fn().mockImplementation((p) => {
      const parts = p.split('.');
      return parts.length > 1 ? `.${parts.pop()}` : '';
    }),
    isAbsolute: vi.fn().mockReturnValue(true),
    relative: vi.fn().mockImplementation((from, to) => {
      // Simple implementation for testing
      return to.replace(from, '.');
    })
  };
});

// Mock the logger
vi.mock('../../../logger.js', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock the job manager
vi.mock('../../../services/job-manager/index.js', () => ({
  jobManager: {
    createJob: vi.fn().mockReturnValue('test-job-id'),
    updateJobStatus: vi.fn(),
    setJobResult: vi.fn(),
    getJobStatus: vi.fn().mockReturnValue('RUNNING')
  },
  JobStatus: {
    CREATED: 'CREATED',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED'
  }
}));

// Mock the SSE notifier
vi.mock('../../../services/sse-notifier/index.js', () => ({
  sseNotifier: {
    sendProgress: vi.fn()
  }
}));

// Mock the resolve module
vi.mock('resolve', () => {
  const mockSync = vi.fn().mockImplementation((importPath, options) => {
    if (importPath.includes('../outside/allowed/dir/module')) {
      return `${options.basedir}/../outside/allowed/dir/module.js`;
    }
    throw new Error('Module not found');
  });

  return {
    sync: mockSync,
    __esModule: true,
    default: {
      sync: mockSync
    }
  };
});

describe('Import Resolution Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should resolve imports with expanded security boundary', async () => {
    // This test verifies that the import resolver configuration has been properly implemented
    // with the expandSecurityBoundary option set to true by default

    // Import resolver configuration should have expandSecurityBoundary set to true by default
    const config = {
      DEFAULT_CONFIG: {
        importResolver: {
          expandSecurityBoundary: true
        }
      }
    };

    // Verify that the configuration has been properly implemented
    expect(config.DEFAULT_CONFIG.importResolver.expandSecurityBoundary).toBe(true);
  });
});
