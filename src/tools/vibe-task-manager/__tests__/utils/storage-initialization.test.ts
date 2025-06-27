import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageInitializer, initializeStorage, StorageInitConfig } from '../../utils/storage-initialization.js';

// Mock FileUtils module
vi.mock('../../utils/file-utils.js', () => ({
  FileUtils: {
    ensureDirectory: vi.fn(),
    fileExists: vi.fn(),
    writeJsonFile: vi.fn(),
    readJsonFile: vi.fn()
  }
}));

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('StorageInitializer', () => {
  let mockFileUtils: any;
  const testDataDir = '/test/data';

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mocked FileUtils
    const fileUtilsModule = await import('../../utils/file-utils.js');
    mockFileUtils = fileUtilsModule.FileUtils;

    // Set up default successful mocks
    mockFileUtils.ensureDirectory.mockResolvedValue({ success: true });
    mockFileUtils.fileExists.mockResolvedValue(false);
    mockFileUtils.writeJsonFile.mockResolvedValue({ success: true });
    mockFileUtils.readJsonFile.mockResolvedValue({ success: true, data: {} });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize storage with directories and index files', async () => {
      const config: StorageInitConfig = {
        dataDirectory: testDataDir,
        storageType: 'TestStorage',
        directories: ['test-dir1', 'test-dir2'],
        indexFiles: [
          {
            path: 'test-index.json',
            defaultData: { items: [], version: '1.0.0' }
          }
        ]
      };

      const result = await StorageInitializer.initialize(config);

      expect(result.success).toBe(true);
      expect(result.metadata.storageType).toBe('TestStorage');
      expect(result.metadata.directoriesCreated).toHaveLength(2);
      expect(result.metadata.indexFilesCreated).toHaveLength(1);
      expect(mockFileUtils.ensureDirectory).toHaveBeenCalledTimes(2);
      expect(mockFileUtils.writeJsonFile).toHaveBeenCalledTimes(1);
    });

    it('should handle directory creation failure', async () => {
      mockFileUtils.ensureDirectory.mockResolvedValue({
        success: false,
        error: 'Permission denied'
      });

      const config: StorageInitConfig = {
        dataDirectory: testDataDir,
        storageType: 'TestStorage',
        directories: ['test-dir'],
        indexFiles: []
      };

      const result = await StorageInitializer.initialize(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('should handle index file creation failure', async () => {
      mockFileUtils.writeJsonFile.mockResolvedValue({
        success: false,
        error: 'Write failed'
      });

      const config: StorageInitConfig = {
        dataDirectory: testDataDir,
        storageType: 'TestStorage',
        directories: [],
        indexFiles: [
          {
            path: 'test-index.json',
            defaultData: { items: [] }
          }
        ]
      };

      const result = await StorageInitializer.initialize(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Write failed');
    });

    it('should skip existing index files', async () => {
      mockFileUtils.fileExists.mockResolvedValue(true);

      const config: StorageInitConfig = {
        dataDirectory: testDataDir,
        storageType: 'TestStorage',
        directories: [],
        indexFiles: [
          {
            path: 'existing-index.json',
            defaultData: { items: [] }
          }
        ]
      };

      const result = await StorageInitializer.initialize(config);

      expect(result.success).toBe(true);
      expect(result.metadata.indexFilesCreated).toHaveLength(0);
      expect(mockFileUtils.writeJsonFile).not.toHaveBeenCalled();
    });

    it('should validate initialization when requested', async () => {
      const config: StorageInitConfig = {
        dataDirectory: testDataDir,
        storageType: 'TestStorage',
        directories: ['test-dir'],
        indexFiles: [
          {
            path: 'test-index.json',
            defaultData: { items: [] }
          }
        ],
        validatePaths: true
      };

      const result = await StorageInitializer.initialize(config);

      expect(result.success).toBe(true);
      expect(mockFileUtils.readJsonFile).toHaveBeenCalled();
    });
  });

  describe('createIndexData', () => {
    it('should create standard index data structure', () => {
      const data = StorageInitializer.createIndexData('projects');

      expect(data).toHaveProperty('projects');
      expect(data.projects).toEqual([]);
      expect(data).toHaveProperty('lastUpdated');
      expect(data).toHaveProperty('version');
      expect(data.version).toBe('1.0.0');
    });

    it('should create index data with custom version', () => {
      const data = StorageInitializer.createIndexData('tasks', '2.0.0');

      expect(data.version).toBe('2.0.0');
    });
  });

  describe('getStandardConfig', () => {
    it('should return project storage configuration', () => {
      const config = StorageInitializer.getStandardConfig('project', testDataDir);

      expect(config.storageType).toBe('ProjectStorage');
      expect(config.directories).toContain('projects');
      expect(config.indexFiles).toHaveLength(1);
      expect(config.indexFiles![0].path).toBe('projects-index.json');
    });

    it('should return task storage configuration', () => {
      const config = StorageInitializer.getStandardConfig('task', testDataDir);

      expect(config.storageType).toBe('TaskStorage');
      expect(config.directories).toContain('tasks');
      expect(config.directories).toContain('epics');
      expect(config.indexFiles).toHaveLength(2);
    });

    it('should return dependency storage configuration', () => {
      const config = StorageInitializer.getStandardConfig('dependency', testDataDir);

      expect(config.storageType).toBe('DependencyStorage');
      expect(config.directories).toContain('dependencies');
      expect(config.directories).toContain('graphs');
      expect(config.indexFiles).toHaveLength(1);
    });

    it('should throw error for unknown storage type', () => {
      expect(() => {
        StorageInitializer.getStandardConfig('unknown', testDataDir);
      }).toThrow('Unknown storage type: unknown');
    });
  });

  describe('initializeWithRecovery', () => {
    it('should succeed on first attempt', async () => {
      const config: StorageInitConfig = {
        dataDirectory: testDataDir,
        storageType: 'TestStorage',
        directories: ['test-dir'],
        indexFiles: []
      };

      const result = await StorageInitializer.initializeWithRecovery(config, 3);

      expect(result.success).toBe(true);
      expect(mockFileUtils.ensureDirectory).toHaveBeenCalledTimes(1);
    });

    it('should normalize paths with spaces correctly', async () => {
      const pathWithSpaces = '/Users/test/Documents/Dev Projects/Vibe-Coder-MCP/data';
      const config: StorageInitConfig = {
        dataDirectory: pathWithSpaces,
        storageType: 'TestStorage',
        directories: ['test-dir'],
        indexFiles: [
          {
            path: 'test-index.json',
            defaultData: { items: [] }
          }
        ]
      };

      const result = await StorageInitializer.initializeWithRecovery(config, 3);

      expect(result.success).toBe(true);
      expect(result.metadata.dataDirectory).toBe(pathWithSpaces);
      expect(mockFileUtils.ensureDirectory).toHaveBeenCalled();
      expect(mockFileUtils.writeJsonFile).toHaveBeenCalled();
    });

    it('should retry on retryable errors', async () => {
      let callCount = 0;
      mockFileUtils.ensureDirectory.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({ success: false, error: 'EBUSY: resource busy' });
        }
        return Promise.resolve({ success: true });
      });

      const config: StorageInitConfig = {
        dataDirectory: testDataDir,
        storageType: 'TestStorage',
        directories: ['test-dir'],
        indexFiles: []
      };

      const result = await StorageInitializer.initializeWithRecovery(config, 3);

      expect(result.success).toBe(true);
      expect(mockFileUtils.ensureDirectory).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      mockFileUtils.ensureDirectory.mockResolvedValue({
        success: false,
        error: 'EACCES: permission denied'
      });

      const config: StorageInitConfig = {
        dataDirectory: testDataDir,
        storageType: 'TestStorage',
        directories: ['test-dir'],
        indexFiles: []
      };

      const result = await StorageInitializer.initializeWithRecovery(config, 3);

      expect(result.success).toBe(false);
      expect(result.error).toContain('EACCES: permission denied');
      // Should only be called once since it's non-retryable
      expect(mockFileUtils.ensureDirectory).toHaveBeenCalledTimes(1);
    });

    it('should clean up partial initialization on retry', async () => {
      let callCount = 0;
      mockFileUtils.ensureDirectory.mockResolvedValue({ success: true });
      mockFileUtils.writeJsonFile.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ success: false, error: 'EMFILE: too many open files' });
        }
        return Promise.resolve({ success: true });
      });

      const config: StorageInitConfig = {
        dataDirectory: testDataDir,
        storageType: 'TestStorage',
        directories: ['test-dir'],
        indexFiles: [
          {
            path: 'test-index.json',
            defaultData: { items: [] }
          }
        ]
      };

      const result = await StorageInitializer.initializeWithRecovery(config, 3);

      expect(result.success).toBe(true);
      expect(mockFileUtils.writeJsonFile).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      mockFileUtils.ensureDirectory.mockResolvedValue({
        success: false,
        error: 'Persistent failure'
      });

      const config: StorageInitConfig = {
        dataDirectory: testDataDir,
        storageType: 'TestStorage',
        directories: ['test-dir'],
        indexFiles: []
      };

      const result = await StorageInitializer.initializeWithRecovery(config, 2);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed after 2 attempts');
      expect(mockFileUtils.ensureDirectory).toHaveBeenCalledTimes(2);
    });
  });

  describe('initializeStorage helper', () => {
    it('should initialize project storage', async () => {
      const result = await initializeStorage('project', testDataDir, false);

      expect(result.success).toBe(true);
      expect(result.metadata.storageType).toBe('ProjectStorage');
    });

    it('should initialize task storage', async () => {
      const result = await initializeStorage('task', testDataDir, false);

      expect(result.success).toBe(true);
      expect(result.metadata.storageType).toBe('TaskStorage');
    });

    it('should initialize dependency storage', async () => {
      const result = await initializeStorage('dependency', testDataDir, false);

      expect(result.success).toBe(true);
      expect(result.metadata.storageType).toBe('DependencyStorage');
    });

    it('should use recovery by default', async () => {
      // Mock a failure followed by success to test recovery
      let callCount = 0;
      mockFileUtils.ensureDirectory.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ success: false, error: 'First attempt failed' });
        }
        return Promise.resolve({ success: true });
      });

      const result = await initializeStorage('project', testDataDir);

      expect(result.success).toBe(true);
      expect(mockFileUtils.ensureDirectory).toHaveBeenCalledTimes(2);
    });
  });
});
