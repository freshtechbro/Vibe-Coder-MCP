import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { FileSearchService } from '../file-search-engine.js';
import { FileSearchOptions } from '../search-strategies.js';

// Mock fs module
vi.mock('fs/promises');
const mockFs = vi.mocked(fs);

// Mock logger
vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Create mock filesystem security instance
const mockFilesystemSecurity = {
  checkPathSecurity: vi.fn().mockResolvedValue({ allowed: true }),
  statSecure: vi.fn().mockResolvedValue({
    isDirectory: () => true,
    size: 1024,
    mtime: new Date()
  }),
  readDirSecure: vi.fn().mockResolvedValue([
    { name: 'file1.ts', isDirectory: () => false, isFile: () => true },
    { name: 'file2.js', isDirectory: () => false, isFile: () => true },
    { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
    { name: 'subdir', isDirectory: () => true, isFile: () => false }
  ])
};

// Mock FilesystemSecurity
vi.mock('../../tools/vibe-task-manager/security/filesystem-security.js', () => ({
  FilesystemSecurity: {
    getInstance: vi.fn(() => mockFilesystemSecurity)
  }
}));

describe('FileSearchService', () => {
  let fileSearchService: FileSearchService;
  // Use a path within the allowed directory for testing
  const testProjectPath = process.cwd() + '/test/project';

  beforeEach(() => {
    fileSearchService = FileSearchService.getInstance();
    vi.clearAllMocks();

    // Reset filesystem security mocks
    mockFilesystemSecurity.checkPathSecurity.mockResolvedValue({ allowed: true });
    mockFilesystemSecurity.statSecure.mockResolvedValue({
      isDirectory: () => true,
      size: 1024,
      mtime: new Date()
    });
    mockFilesystemSecurity.readDirSecure.mockResolvedValue([
      { name: 'file1.ts', isDirectory: () => false, isFile: () => true },
      { name: 'file2.js', isDirectory: () => false, isFile: () => true },
      { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      { name: 'subdir', isDirectory: () => true, isFile: () => false }
    ]);
  });

  afterEach(async () => {
    await fileSearchService.clearCache();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = FileSearchService.getInstance();
      const instance2 = FileSearchService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('searchFiles', () => {
    beforeEach(() => {
      // Mock fs.stat for project path validation
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
        size: 0,
        mtime: new Date()
      } as import('fs').Stats);

      // Mock fs.readdir for directory scanning
      mockFs.readdir.mockResolvedValue([
        { name: 'file1.ts', isDirectory: () => false, isFile: () => true },
        { name: 'file2.js', isDirectory: () => false, isFile: () => true },
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
        { name: 'subdir', isDirectory: () => true, isFile: () => false }
      ] as import('fs').Dirent[]);
    });

    it('should perform fuzzy search by default', async () => {
      const options: FileSearchOptions = {
        pattern: 'file',
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(mockFs.stat).toHaveBeenCalledWith(testProjectPath);
    });

    it('should filter by file types', async () => {
      const options: FileSearchOptions = {
        pattern: 'file',
        fileTypes: ['.ts'],
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results).toBeDefined();
      // Results should only include .ts files
      results.forEach(result => {
        expect(path.extname(result.filePath)).toBe('.ts');
      });
    });

    it('should limit results when maxResults is specified', async () => {
      const options: FileSearchOptions = {
        pattern: 'file',
        maxResults: 1,
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should handle invalid project path', async () => {
      mockFs.stat.mockRejectedValue(new Error('Path not found'));

      await expect(
        fileSearchService.searchFiles('/invalid/path', { pattern: 'test' })
      ).rejects.toThrow('Invalid or inaccessible project path');
    });
  });

  describe('search strategies', () => {
    beforeEach(() => {
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
        size: 1024,
        mtime: new Date()
      } as import('fs').Stats);

      mockFs.readdir.mockResolvedValue([
        { name: 'component.tsx', isDirectory: () => false, isFile: () => true },
        { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true }
      ] as import('fs').Dirent[]);
    });

    it('should perform exact search', async () => {
      const options: FileSearchOptions = {
        pattern: 'component',
        searchStrategy: 'exact',
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results).toBeDefined();
      results.forEach(result => {
        expect(result.matchType).toBe('exact');
      });
    });

    it('should perform glob search', async () => {
      const options: FileSearchOptions = {
        glob: '*.ts',
        searchStrategy: 'glob',
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results).toBeDefined();
      results.forEach(result => {
        expect(result.matchType).toBe('glob');
      });
    });

    it('should perform regex search', async () => {
      const options: FileSearchOptions = {
        pattern: '.*\\.ts$',
        searchStrategy: 'regex',
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results).toBeDefined();
      results.forEach(result => {
        expect(result.matchType).toBe('name');
      });
    });

    it('should perform content search', async () => {
      // Mock file reading for content search
      mockFs.readFile.mockResolvedValue('function test() { return "hello"; }');

      const options: FileSearchOptions = {
        content: 'function',
        searchStrategy: 'content',
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results).toBeDefined();
      results.forEach(result => {
        expect(result.matchType).toBe('content');
        expect(result.lineNumbers).toBeDefined();
      });
    });
  });

  describe('caching', () => {
    beforeEach(() => {
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
        size: 1024,
        mtime: new Date()
      } as import('fs').Stats);

      mockFs.readdir.mockResolvedValue([
        { name: 'file1.ts', isDirectory: () => false, isFile: () => true }
      ] as import('fs').Dirent[]);
    });

    it('should cache results when enabled', async () => {
      const options: FileSearchOptions = {
        pattern: 'file',
        cacheResults: true
      };

      // First search
      const results1 = await fileSearchService.searchFiles(testProjectPath, options);

      // Second search should use cache
      const results2 = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results1).toEqual(results2);

      // fs.readdir should only be called once (for first search)
      expect(mockFs.readdir).toHaveBeenCalledTimes(1);
    });

    it('should not cache when disabled', async () => {
      const options: FileSearchOptions = {
        pattern: 'file',
        cacheResults: false
      };

      // First search
      await fileSearchService.searchFiles(testProjectPath, options);

      // Second search
      await fileSearchService.searchFiles(testProjectPath, options);

      // fs.readdir should be called twice
      expect(mockFs.readdir).toHaveBeenCalledTimes(2);
    });

    it('should clear cache', async () => {
      const options: FileSearchOptions = {
        pattern: 'file',
        cacheResults: true
      };

      // Search and cache
      await fileSearchService.searchFiles(testProjectPath, options);

      // Clear cache
      await fileSearchService.clearCache();

      // Search again should not use cache
      await fileSearchService.searchFiles(testProjectPath, options);

      expect(mockFs.readdir).toHaveBeenCalledTimes(2);
    });
  });

  describe('performance metrics', () => {
    it('should provide performance metrics', async () => {
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
        size: 1024,
        mtime: new Date()
      } as import('fs').Stats);

      mockFs.readdir.mockResolvedValue([
        { name: 'file1.ts', isDirectory: () => false, isFile: () => true }
      ] as import('fs').Dirent[]);

      await fileSearchService.searchFiles(testProjectPath, {
        pattern: 'file',
        cacheResults: false
      });

      const metrics = fileSearchService.getPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.searchTime).toBeGreaterThanOrEqual(0);
      expect(metrics.filesScanned).toBeGreaterThanOrEqual(0);
      expect(metrics.resultsFound).toBeGreaterThanOrEqual(0);
      expect(metrics.strategy).toBe('fuzzy');
    });

    it('should provide cache statistics', () => {
      const stats = fileSearchService.getCacheStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalEntries).toBe('number');
      expect(typeof stats.hitRate).toBe('number');
      expect(typeof stats.memoryUsage).toBe('number');
    });
  });
});
