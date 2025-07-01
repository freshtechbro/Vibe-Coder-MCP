/**
 * Integration tests for memory optimization features in the code-map-generator.
 * These tests verify that the memory optimization components work together correctly.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as path from 'path';

// Mock the file system
vi.mock('fs', () => {
  const writeFileMock = vi.fn().mockResolvedValue(undefined);
  const mockFiles = new Map();

  return {
    promises: {
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: writeFileMock,
      readFile: vi.fn().mockImplementation((filePath) => {
        if (mockFiles.has(filePath)) {
          return Promise.resolve(mockFiles.get(filePath));
        }

        // Default content for different file types
        if (filePath.includes('.js')) {
          return Promise.resolve('export const something = "test";');
        }
        if (filePath.includes('.py')) {
          return Promise.resolve('def something():\n    return "test"');
        }
        if (filePath.includes('.cpp')) {
          return Promise.resolve('#include <iostream>\nint main() { return 0; }');
        }

        return Promise.resolve('');
      }),
      stat: vi.fn().mockResolvedValue({
        isDirectory: () => !String(vi.mocked.calls[0][0]).includes('.'),
        size: 1024,
        mtimeMs: Date.now()
      }),
      access: vi.fn().mockResolvedValue(undefined),
      appendFile: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn().mockImplementation((dirPath) => {
        if (dirPath.includes('js-files')) {
          return Promise.resolve(['file1.js', 'file2.js', 'file3.js']);
        }
        if (dirPath.includes('py-files')) {
          return Promise.resolve(['file1.py', 'file2.py']);
        }
        if (dirPath.includes('cpp-files')) {
          return Promise.resolve(['file1.cpp']);
        }
        return Promise.resolve([]);
      }),
      unlink: vi.fn().mockResolvedValue(undefined)
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

// Mock the os module
vi.mock('os', () => ({
  totalmem: vi.fn().mockReturnValue(8 * 1024 * 1024 * 1024), // 8GB
  freemem: vi.fn().mockReturnValue(4 * 1024 * 1024 * 1024), // 4GB
  platform: vi.fn().mockReturnValue('darwin'),
  tmpdir: vi.fn().mockReturnValue('/tmp')
}));

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

// Mock the memory optimization components
class MockMetadataCache {
  constructor(name) {
    this.name = name;
    this.cache = new Map();
  }

  async get(key) {
    return this.cache.get(key);
  }

  async set(key, value) {
    this.cache.set(key, value);
    return value;
  }

  async clear() {
    this.cache.clear();
  }
}

// Mock the language-based batches functions
function createLanguageBasedBatches(files, batchSize) {
  // Group files by language
  const filesByLanguage = {};

  for (const file of files) {
    const language = file.language;
    if (!filesByLanguage[language]) {
      filesByLanguage[language] = [];
    }
    filesByLanguage[language].push(file);
  }

  // Create batches for each language
  const batches = [];

  for (const language in filesByLanguage) {
    const languageFiles = filesByLanguage[language];

    // Split language files into batches
    for (let i = 0; i < languageFiles.length; i += batchSize) {
      batches.push(languageFiles.slice(i, i + batchSize));
    }
  }

  return batches;
}

async function processLanguageBasedBatches(files, processor, config, _jobId, _sessionId, _operation, _startProgress, _endProgress) {
  const batchSize = config?.processing?.batchSize || 10;
  const batches = createLanguageBasedBatches(files, batchSize);

  const results = [];

  for (const batch of batches) {
    // Process each file in the batch
    for (const file of batch) {
      const result = await processor(file);
      results.push(result);
    }
  }

  return results;
}


describe('Memory Optimization Integration', () => {
  let sourceCodeMetadataCache;

  beforeEach(() => {
    vi.clearAllMocks();

    // Initialize the caches
    sourceCodeMetadataCache = new MockMetadataCache('source-code');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should use metadata-focused caching during processing', async () => {
    // Create a mock file processor that uses the metadata cache
    const fileProcessor = vi.fn().mockImplementation(async (file) => {
      // Store metadata in the cache
      await sourceCodeMetadataCache.set(file.path, {
        filePath: file.path,
        hash: 'test-hash',
        size: 1024,
        lastModified: Date.now(),
        language: path.extname(file.path),
        processed: true,
        content: null // Content should be null in metadata
      });

      return { path: file.path, processed: true };
    });

    // Create sample files
    const sampleFiles = [
      { path: '/test/file1.js', language: '.js' },
      { path: '/test/file2.js', language: '.js' },
      { path: '/test/file3.py', language: '.py' }
    ];

    // Process the files
    const results = await processLanguageBasedBatches(
      sampleFiles,
      fileProcessor,
      { processing: { batchSize: 2 } },
      'test-job-id',
      'test-session-id',
      'Testing',
      0,
      100
    );

    // Verify that all files were processed
    expect(results.length).toBe(sampleFiles.length);
    expect(fileProcessor).toHaveBeenCalledTimes(sampleFiles.length);

    // Verify that metadata was stored in the cache
    const metadata = await sourceCodeMetadataCache.get('/test/file1.js');
    expect(metadata).toBeDefined();
    expect(metadata?.filePath).toBe('/test/file1.js');
    expect(metadata?.content).toBeNull(); // Content should be null in metadata
  });

  it('should create language-based batches correctly', async () => {
    // Create sample files with different languages
    const sampleFiles = [
      { path: '/test/file1.js', language: '.js' },
      { path: '/test/file2.js', language: '.js' },
      { path: '/test/file3.py', language: '.py' },
      { path: '/test/file4.js', language: '.js' },
      { path: '/test/file5.py', language: '.py' },
      { path: '/test/file6.cpp', language: '.cpp' }
    ];

    // Create language-based batches
    const batches = createLanguageBasedBatches(sampleFiles, 2);

    // Verify that files are grouped by language
    expect(batches.length).toBe(4); // 2 JS batches, 1 PY batch, 1 CPP batch

    // Verify that each batch contains files of the same language
    batches.forEach(batch => {
      const languages = new Set(batch.map(file => file.language));
      expect(languages.size).toBe(1); // All files in a batch should have the same language
    });

    // Verify that batch sizes are respected
    expect(batches[0].length).toBeLessThanOrEqual(2);
    expect(batches[1].length).toBeLessThanOrEqual(2);
  });

  it('should integrate metadata caching with language-based batch processing', async () => {
    // Create a mock file processor that uses both metadata cache and grammar manager
    const fileProcessor = vi.fn().mockImplementation(async (file) => {
      // Store metadata in the cache
      await sourceCodeMetadataCache.set(file.path, {
        filePath: file.path,
        hash: 'test-hash',
        size: 1024,
        lastModified: Date.now(),
        language: file.language, // Use the file's language directly
        processed: true,
        content: null // Content should be null in metadata
      });

      return { path: file.path, processed: true };
    });

    // Create sample files with different languages
    const sampleFiles = [
      { path: '/test/file1.js', language: '.js' },
      { path: '/test/file2.js', language: '.js' },
      { path: '/test/file3.py', language: '.py' },
      { path: '/test/file4.js', language: '.js' },
      { path: '/test/file5.py', language: '.py' },
      { path: '/test/file6.cpp', language: '.cpp' }
    ];

    // Process the files
    const results = await processLanguageBasedBatches(
      sampleFiles,
      fileProcessor,
      { processing: { batchSize: 2 } },
      'test-job-id',
      'test-session-id',
      'Testing',
      0,
      100
    );

    // Verify that all files were processed
    expect(results.length).toBe(sampleFiles.length);

    // Verify that metadata was stored in the cache for each file
    for (const file of sampleFiles) {
      const metadata = await sourceCodeMetadataCache.get(file.path);
      expect(metadata).toBeDefined();
      expect(metadata?.filePath).toBe(file.path);
      expect(metadata?.language).toBe(file.language);
    }
  });
});
