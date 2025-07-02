import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import { FileReaderService } from '../file-reader-service.js';
import { FileReadOptions } from '../file-reader-service.js';

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

// Create a mock search function
const mockSearchFiles = vi.fn();

// Mock FileSearchService
vi.mock('../file-search-engine.js', () => ({
  FileSearchService: {
    getInstance: vi.fn(() => ({
      searchFiles: mockSearchFiles
    }))
  }
}));

describe('FileReaderService', () => {
  let fileReaderService: FileReaderService;

  beforeEach(() => {
    fileReaderService = FileReaderService.getInstance();
    // Clear only fs mocks, not the FileSearchService mock
    mockFs.stat.mockClear();
    mockFs.readFile.mockClear();
    mockSearchFiles.mockClear();
  });

  afterEach(() => {
    fileReaderService.clearCache();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = FileReaderService.getInstance();
      const instance2 = FileReaderService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('readFiles', () => {
    beforeEach(() => {
      // Mock file stats
      mockFs.stat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2023-01-01'),
        isFile: () => true,
        isDirectory: () => false
      } as import('fs').Stats);

      // Mock file reading
      mockFs.readFile.mockResolvedValue(Buffer.from('test content'));
    });

    it('should read multiple files successfully', async () => {
      const filePaths = ['/test/file1.ts', '/test/file2.js'];
      const options: FileReadOptions = {
        maxFileSize: 10000,
        cacheContent: false
      };

      const result = await fileReaderService.readFiles(filePaths, options);

      expect(result.files).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.metrics.successCount).toBe(2);
      expect(result.metrics.errorCount).toBe(0);
      expect(result.metrics.totalFiles).toBe(2);
    });

    it('should handle file reading errors', async () => {
      const filePaths = ['/test/file1.ts', '/test/nonexistent.js'];

      // Mock first file success, second file failure
      mockFs.stat
        .mockResolvedValueOnce({
          size: 1024,
          mtime: new Date('2023-01-01')
        } as import('fs').Stats)
        .mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

      const result = await fileReaderService.readFiles(filePaths, {
        cacheContent: false
      });

      expect(result.files).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reason).toBe('not-found');
      expect(result.metrics.successCount).toBe(1);
      expect(result.metrics.errorCount).toBe(1);
    });

    it('should respect file size limits', async () => {
      const filePaths = ['/test/large-file.ts'];

      // Mock large file
      mockFs.stat.mockResolvedValue({
        size: 20 * 1024 * 1024, // 20MB
        mtime: new Date('2023-01-01')
      } as import('fs').Stats);

      const result = await fileReaderService.readFiles(filePaths, {
        maxFileSize: 10 * 1024 * 1024, // 10MB limit
        cacheContent: false
      });

      expect(result.files).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reason).toBe('too-large');
    });

    it('should handle binary files correctly', async () => {
      const filePaths = ['/test/image.png'];

      mockFs.readFile.mockResolvedValue(Buffer.from('binary data'));

      const result = await fileReaderService.readFiles(filePaths, {
        includeBinary: true,
        cacheContent: false
      });

      expect(result.files).toHaveLength(1);
      expect(result.files[0].contentType).toBe('image');
      expect(result.files[0].encoding).toBe('base64');
    });

    it('should exclude binary files by default', async () => {
      const filePaths = ['/test/image.png'];

      const result = await fileReaderService.readFiles(filePaths, {
        includeBinary: false,
        cacheContent: false
      });

      expect(result.files).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reason).toBe('binary');
    });

    it('should apply line range limits', async () => {
      const content = 'line1\nline2\nline3\nline4\nline5';
      mockFs.readFile.mockResolvedValue(Buffer.from(content));

      const result = await fileReaderService.readFiles(['/test/file.txt'], {
        lineRange: [2, 4],
        cacheContent: false
      });

      expect(result.files).toHaveLength(1);
      expect(result.files[0].content).toBe('line2\nline3\nline4');
      expect(result.files[0].lineCount).toBe(3);
    });

    it('should apply max lines limit', async () => {
      const content = 'line1\nline2\nline3\nline4\nline5';
      mockFs.readFile.mockResolvedValue(Buffer.from(content));

      const result = await fileReaderService.readFiles(['/test/file.txt'], {
        maxLines: 3,
        cacheContent: false
      });

      expect(result.files).toHaveLength(1);
      expect(result.files[0].content).toBe('line1\nline2\nline3');
      expect(result.files[0].lineCount).toBe(3);
    });
  });

  describe('readFilesByPattern', () => {
    beforeEach(() => {
      // Set up the mock for this test
      mockSearchFiles.mockResolvedValue([
        { filePath: '/test/component.ts', score: 0.9 },
        { filePath: '/test/component.test.ts', score: 0.8 }
      ]);
    });

    it('should use file search service to find files', async () => {
      // Mock is already set in beforeEach

      mockFs.stat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2023-01-01')
      } as import('fs').Stats);

      mockFs.readFile.mockResolvedValue(Buffer.from('test content'));

      const result = await fileReaderService.readFilesByPattern(
        '/test/project',
        'component',
        { cacheContent: false }
      );

      expect(mockSearchFiles).toHaveBeenCalledWith('/test/project', {
        pattern: 'component',
        searchStrategy: 'fuzzy',
        maxResults: 100,
        cacheResults: true
      });

      expect(result.files).toHaveLength(2);
    });
  });

  describe('readFilesByGlob', () => {
    beforeEach(() => {
      // Set up the mock for this test
      mockSearchFiles.mockResolvedValue([
        { filePath: '/test/file1.ts', score: 1.0 },
        { filePath: '/test/file2.ts', score: 1.0 }
      ]);
    });

    it('should use glob search strategy', async () => {
      // Mock is already set in beforeEach

      mockFs.stat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2023-01-01')
      } as import('fs').Stats);

      mockFs.readFile.mockResolvedValue(Buffer.from('test content'));

      const result = await fileReaderService.readFilesByGlob(
        '/test/project',
        '**/*.ts',
        { cacheContent: false }
      );

      expect(mockSearchFiles).toHaveBeenCalledWith('/test/project', {
        glob: '**/*.ts',
        searchStrategy: 'glob',
        maxResults: 200,
        cacheResults: true
      });

      expect(result.files).toHaveLength(2);
    });
  });

  describe('caching', () => {
    it('should cache file content when enabled', async () => {
      const filePath = '/test/file.ts';
      const content = 'test content';

      mockFs.stat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2023-01-01')
      } as import('fs').Stats);

      mockFs.readFile.mockResolvedValue(Buffer.from(content));

      // First read
      await fileReaderService.readFiles([filePath], { cacheContent: true });

      // Second read should use cache
      await fileReaderService.readFiles([filePath], { cacheContent: true });

      // fs.readFile should only be called once
      expect(mockFs.readFile).toHaveBeenCalledTimes(1);
    });

    it('should not cache when disabled', async () => {
      const filePath = '/test/file.ts';

      mockFs.stat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2023-01-01')
      } as import('fs').Stats);

      mockFs.readFile.mockResolvedValue(Buffer.from('test content'));

      // Two reads with caching disabled
      await fileReaderService.readFiles([filePath], { cacheContent: false });
      await fileReaderService.readFiles([filePath], { cacheContent: false });

      // fs.readFile should be called twice
      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache when file is modified', async () => {
      const filePath = '/test/file.ts';

      // First read
      mockFs.stat.mockResolvedValueOnce({
        size: 1024,
        mtime: new Date('2023-01-01')
      } as import('fs').Stats);

      mockFs.readFile.mockResolvedValue(Buffer.from('original content'));

      await fileReaderService.readFiles([filePath], { cacheContent: true });

      // Second read with modified file
      mockFs.stat.mockResolvedValueOnce({
        size: 1024,
        mtime: new Date('2023-01-02') // Different modification time
      } as import('fs').Stats);

      mockFs.readFile.mockResolvedValue(Buffer.from('modified content'));

      const result = await fileReaderService.readFiles([filePath], { cacheContent: true });

      // fs.readFile should be called twice (cache invalidated)
      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
      expect(result.files[0].content).toBe('modified content');
    });

    it('should provide cache statistics', () => {
      const stats = fileReaderService.getCacheStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalEntries).toBe('number');
      expect(typeof stats.memoryUsage).toBe('number');
      expect(typeof stats.averageFileSize).toBe('number');
    });

    it('should clear cache', async () => {
      const filePath = '/test/file.ts';

      mockFs.stat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2023-01-01')
      } as import('fs').Stats);

      mockFs.readFile.mockResolvedValue(Buffer.from('test content'));

      // Read and cache
      await fileReaderService.readFiles([filePath], { cacheContent: true });

      // Clear cache
      fileReaderService.clearCache();

      // Read again should not use cache
      await fileReaderService.readFiles([filePath], { cacheContent: true });

      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('content type detection', () => {
    it('should detect text files correctly', async () => {
      const textFiles = [
        '/test/file.ts',
        '/test/file.js',
        '/test/file.json',
        '/test/file.md',
        '/test/file.txt'
      ];

      mockFs.stat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2023-01-01')
      } as import('fs').Stats);

      mockFs.readFile.mockResolvedValue(Buffer.from('text content'));

      const result = await fileReaderService.readFiles(textFiles, {
        cacheContent: false
      });

      result.files.forEach(file => {
        expect(file.contentType).toBe('text');
        expect(file.encoding).toBe('utf-8');
      });
    });

    it('should detect image files correctly', async () => {
      const imageFiles = ['/test/image.png', '/test/photo.jpg'];

      mockFs.stat.mockResolvedValue({
        size: 1024,
        mtime: new Date('2023-01-01')
      } as import('fs').Stats);

      mockFs.readFile.mockResolvedValue(Buffer.from('image data'));

      const result = await fileReaderService.readFiles(imageFiles, {
        includeBinary: true,
        cacheContent: false
      });

      result.files.forEach(file => {
        expect(file.contentType).toBe('image');
        expect(file.encoding).toBe('base64');
      });
    });
  });
});
