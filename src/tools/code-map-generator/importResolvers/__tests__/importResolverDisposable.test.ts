/**
 * Tests for the disposable pattern in import resolvers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DependencyCruiserAdapter } from '../dependencyCruiserAdapter';
import { ExtendedPythonImportResolver } from '../extendedPythonImportResolver';
import { ImportResolverFactory } from '../importResolverFactory';
import * as fs from 'fs';

// Mock fs
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      promises: {
        unlink: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
      },
      existsSync: vi.fn().mockReturnValue(true),
      unlinkSync: vi.fn(),
    },
    promises: {
      unlink: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue('{}'),
    },
    existsSync: vi.fn().mockReturnValue(true),
    unlinkSync: vi.fn(),
  };
});

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock exec
vi.mock('util', () => ({
  promisify: vi.fn().mockImplementation(() => vi.fn().mockResolvedValue({ stdout: '{}' })),
}));

// Helper function to access private properties in tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const accessPrivate = (obj: unknown): unknown => obj;

describe('Import Resolver Disposable Pattern', () => {
  const allowedDir = '/test/allowed';
  const outputDir = '/test/output';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DependencyCruiserAdapter', () => {
    it('should dispose resources properly', async () => {
      // Create adapter
      const adapter = new DependencyCruiserAdapter(allowedDir, outputDir);

      // Create a temp file to track
      accessPrivate(adapter).tempFiles = ['/test/output/temp1.json', '/test/output/temp2.json'];

      // Mock fs.existsSync to return true for our temp files
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return filePath === '/test/output/temp1.json' || filePath === '/test/output/temp2.json';
      });

      // Reset mock before testing dispose
      vi.mocked(fs.unlinkSync).mockClear();

      // Call dispose
      adapter.dispose();

      // Verify cache is cleared
      expect(accessPrivate(adapter).cache.size).toBe(0);

      // Verify temp files are deleted
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(fs.unlinkSync).toHaveBeenCalledWith('/test/output/temp1.json');
      expect(fs.unlinkSync).toHaveBeenCalledWith('/test/output/temp2.json');
    });
  });

  describe('ExtendedPythonImportResolver', () => {
    it('should dispose resources properly', async () => {
      // Create resolver
      const resolver = new ExtendedPythonImportResolver(allowedDir, outputDir);

      // Create a temp file to track
      accessPrivate(resolver).tempFiles = ['/test/output/temp1.py', '/test/output/temp2.py'];

      // Mock fs.existsSync to return true for our temp files
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return filePath === '/test/output/temp1.py' || filePath === '/test/output/temp2.py';
      });

      // Reset mock before testing dispose
      vi.mocked(fs.unlinkSync).mockClear();

      // Call dispose
      resolver.dispose();

      // Verify cache is cleared
      expect(accessPrivate(resolver).cache.size).toBe(0);

      // Verify temp files are deleted
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(fs.unlinkSync).toHaveBeenCalledWith('/test/output/temp1.py');
      expect(fs.unlinkSync).toHaveBeenCalledWith('/test/output/temp2.py');

      // Verify environment variables are reset
      expect(accessPrivate(resolver).sitePackagesPath).toBeNull();
      expect(accessPrivate(resolver).pythonPath).toBeNull();
    });
  });

  describe('ImportResolverFactory', () => {
    it('should dispose all adapters', async () => {
      // Create factory
      const factory = new ImportResolverFactory({
        allowedDir,
        outputDir,
        maxDepth: 3
      });

      // Mock adapters
      const mockDependencyCruiserAdapter = { dispose: vi.fn() };
      const mockPythonImportResolver = { dispose: vi.fn() };
      const mockClangdAdapter = { dispose: vi.fn() };
      const mockSemgrepAdapter = { dispose: vi.fn() };

      // Set mock adapters
      accessPrivate(factory).dependencyCruiserAdapter = mockDependencyCruiserAdapter;
      accessPrivate(factory).pythonImportResolver = mockPythonImportResolver;
      accessPrivate(factory).clangdAdapter = mockClangdAdapter;
      accessPrivate(factory).semgrepAdapter = mockSemgrepAdapter;

      // Call dispose
      factory.dispose();

      // Verify all adapters are disposed
      expect(mockDependencyCruiserAdapter.dispose).toHaveBeenCalled();
      expect(mockPythonImportResolver.dispose).toHaveBeenCalled();
      expect(mockClangdAdapter.dispose).toHaveBeenCalled();
      expect(mockSemgrepAdapter.dispose).toHaveBeenCalled();

      // Verify all adapters are set to null
      expect(accessPrivate(factory).dependencyCruiserAdapter).toBeNull();
      expect(accessPrivate(factory).pythonImportResolver).toBeNull();
      expect(accessPrivate(factory).clangdAdapter).toBeNull();
      expect(accessPrivate(factory).semgrepAdapter).toBeNull();
    });

    it('should clean up unused adapters after timeout', async () => {
      vi.useFakeTimers();

      // Create factory
      const factory = new ImportResolverFactory({
        allowedDir,
        outputDir,
        maxDepth: 3
      });

      // Mock adapters
      const mockDependencyCruiserAdapter = { dispose: vi.fn() };
      const mockPythonImportResolver = { dispose: vi.fn() };

      // Set mock adapters
      accessPrivate(factory).dependencyCruiserAdapter = mockDependencyCruiserAdapter;
      accessPrivate(factory).pythonImportResolver = mockPythonImportResolver;

      // Set last used timestamps (one recent, one old)
      const now = Date.now();
      accessPrivate(factory).adapterLastUsed.set('dependencyCruiser', now);
      accessPrivate(factory).adapterLastUsed.set('pythonImportResolver', now - 20 * 60 * 1000); // 20 minutes ago

      // Set TTL to 15 minutes
      accessPrivate(factory).ADAPTER_TTL = 15 * 60 * 1000;

      // Call cleanupUnusedAdapters
      accessPrivate(factory).cleanupUnusedAdapters();

      // Verify only old adapter is disposed
      expect(mockDependencyCruiserAdapter.dispose).not.toHaveBeenCalled();
      expect(mockPythonImportResolver.dispose).toHaveBeenCalled();

      // Verify only old adapter is set to null
      expect(accessPrivate(factory).dependencyCruiserAdapter).not.toBeNull();
      expect(accessPrivate(factory).pythonImportResolver).toBeNull();

      vi.useRealTimers();
    });
  });
});
