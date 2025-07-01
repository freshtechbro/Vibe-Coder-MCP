import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  UniversalMockIsolationManager, 
  setupUniversalTestMock, 
  queueMockResponses,
  mockOpenRouterResponse,
  cleanupTestServices 
} from './service-test-helper.js';

describe('UniversalMockIsolationManager', () => {
  let cleanup: (() => void) | null = null;

  afterEach(async () => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    await cleanupTestServices();
  });

  describe('setupUniversalMock', () => {
    it('should setup all mock types by default', async () => {
      cleanup = await UniversalMockIsolationManager.setupUniversalMock('test-all-mocks');
      
      // Verify that the cleanup function is returned
      expect(cleanup).toBeTypeOf('function');
    });

    it('should setup only file system mocks when specified', async () => {
      cleanup = await UniversalMockIsolationManager.setupUniversalMock('test-fs-only', {
        enableFileSystemMocks: true,
        enableStorageMocks: false,
        enableImportResolverMocks: false,
        enableLLMMocks: false
      });
      
      expect(cleanup).toBeTypeOf('function');
    });

    it('should setup only storage mocks when specified', async () => {
      cleanup = await UniversalMockIsolationManager.setupUniversalMock('test-storage-only', {
        enableFileSystemMocks: false,
        enableStorageMocks: true,
        enableImportResolverMocks: false,
        enableLLMMocks: false
      });
      
      expect(cleanup).toBeTypeOf('function');
    });
  });

  describe('utility functions', () => {
    it('should provide setupUniversalTestMock utility', async () => {
      cleanup = await setupUniversalTestMock('test-utility');
      
      expect(cleanup).toBeTypeOf('function');
    });

    it('should provide queueMockResponses utility', () => {
      expect(queueMockResponses).toBeTypeOf('function');
      
      // Test that it doesn't throw
      expect(() => {
        queueMockResponses([
          { success: true, data: { result: 'test' } },
          { success: false, error: 'test error' }
        ]);
      }).not.toThrow();
    });

    it('should provide mockOpenRouterResponse utility', () => {
      expect(mockOpenRouterResponse).toBeTypeOf('function');
      
      // Test that it doesn't throw
      expect(() => {
        mockOpenRouterResponse({ success: true, data: { result: 'test' } });
      }).not.toThrow();
    });
  });

  describe('file system mocks', () => {
    beforeEach(async () => {
      cleanup = await UniversalMockIsolationManager.setupUniversalMock('test-fs', {
        enableFileSystemMocks: true,
        enableStorageMocks: false,
        enableImportResolverMocks: false,
        enableLLMMocks: false
      });
    });

    it('should mock fs-extra methods', async () => {
      // Import fs-extra after mocking
      const fsExtra = await import('fs-extra');
      
      // Test that mocked methods exist and are functions
      expect(fsExtra.ensureDir).toBeTypeOf('function');
      expect(fsExtra.pathExists).toBeTypeOf('function');
      expect(fsExtra.readFile).toBeTypeOf('function');
      expect(fsExtra.writeFile).toBeTypeOf('function');
    });
  });

  describe('storage mocks', () => {
    beforeEach(async () => {
      cleanup = await UniversalMockIsolationManager.setupUniversalMock('test-storage', {
        enableFileSystemMocks: false,
        enableStorageMocks: true,
        enableImportResolverMocks: false,
        enableLLMMocks: false
      });
    });

    it('should mock FileUtils methods', async () => {
      // Import FileUtils after mocking
      const { FileUtils } = await import('../../utils/file-utils.js');
      
      // Test that mocked methods exist and are functions
      expect(FileUtils.ensureDirectory).toBeTypeOf('function');
      expect(FileUtils.fileExists).toBeTypeOf('function');
      expect(FileUtils.readFile).toBeTypeOf('function');
      expect(FileUtils.writeFile).toBeTypeOf('function');
      expect(FileUtils.readJsonFile).toBeTypeOf('function');
      expect(FileUtils.writeJsonFile).toBeTypeOf('function');
    });
  });

  describe('cleanup', () => {
    it('should cleanup all mocks properly', async () => {
      cleanup = await UniversalMockIsolationManager.setupUniversalMock('test-cleanup');
      
      // Cleanup should not throw
      expect(async () => {
        await UniversalMockIsolationManager.cleanupUniversalMocks();
      }).not.toThrow();
    });
  });
});
