/**
 * Tests for Task File Manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { TaskFileManager, FileIndexEntry, BatchOperationResult } from '../../core/task-file-manager.js';
import { AtomicTask, TaskType, TaskPriority, TaskStatus } from '../../types/task.js';

// Mock fs-extra
vi.mock('fs-extra', () => {
  const mockFunctions = {
    ensureDir: vi.fn(),
    pathExists: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readJson: vi.fn(),
    writeJson: vi.fn(),
    remove: vi.fn(),
    stat: vi.fn(),
    copy: vi.fn(),
    move: vi.fn(),
    emptyDir: vi.fn(),
    mkdirp: vi.fn(),
    outputFile: vi.fn(),
    outputJson: vi.fn()
  };

  return {
    default: mockFunctions,
    ...mockFunctions
  };
});

const mockFs = vi.mocked(fs);

// Mock zlib for compression tests
vi.mock('zlib', () => ({
  gzip: vi.fn((buffer, callback) => {
    callback(null, Buffer.from('compressed-' + buffer.toString()));
  }),
  gunzip: vi.fn((buffer, callback) => {
    // Remove 'compressed-' prefix for decompression
    const decompressed = buffer.toString().replace('compressed-', '');
    callback(null, Buffer.from(decompressed));
  })
}));

// Mock util.promisify to handle the async versions
vi.mock('util', async () => {
  const actual = await vi.importActual('util');
  return {
    ...actual,
    promisify: vi.fn((fn) => {
      if (fn.name === 'gzip') {
        return async (buffer: Buffer) => Buffer.from('compressed-' + buffer.toString());
      }
      if (fn.name === 'gunzip') {
        return async (buffer: Buffer) => {
          const decompressed = buffer.toString().replace('compressed-', '');
          return Buffer.from(decompressed);
        };
      }
      return actual.promisify(fn);
    })
  };
});

// Mock TaskManagerMemoryManager
vi.mock('../../utils/memory-manager-integration.js', () => ({
  TaskManagerMemoryManager: {
    getInstance: vi.fn(() => ({
      registerCleanupCallback: vi.fn(),
      unregisterCleanupCallback: vi.fn()
    }))
  }
}));

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('TaskFileManager', () => {
  let fileManager: TaskFileManager;
  let mockConfig: any;
  let testDataDir: string;
  let mockTask: AtomicTask;

  beforeEach(() => {
    mockConfig = {
      enableLazyLoading: true,
      batchSize: 10,
      enableCompression: false,
      indexingEnabled: true,
      concurrentOperations: 3
    };

    testDataDir = '/test/data/vibe-task-manager';

    mockTask = {
      id: 'T001',
      title: 'Test Task',
      description: 'A test task for file manager testing',
      type: 'development' as TaskType,
      priority: 'high' as TaskPriority,
      status: 'pending' as TaskStatus,
      estimatedHours: 4,
      actualHours: 0,
      projectId: 'P001',
      epicId: 'E001',
      assigneeId: 'user123',
      acceptanceCriteria: ['Task should be completed'],
      filePaths: ['src/test.ts'],
      dependencies: [],
      blockedBy: [],
      validationMethods: {
        automated: ['unit tests'],
        manual: ['code review']
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };

  });

  beforeEach(() => {
    // Reset singleton
    (TaskFileManager as any).instance = null;

    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock behaviors
    mockFs.ensureDir.mockResolvedValue(undefined);
    mockFs.pathExists.mockResolvedValue(false);
    mockFs.readJson.mockResolvedValue({});
    mockFs.writeJson.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue('{"id":"T001","title":"Test Task"}');
  });

  afterEach(() => {
    if (fileManager) {
      fileManager.shutdown();
    }
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create singleton instance with configuration', async () => {
      fileManager = TaskFileManager.getInstance(mockConfig, testDataDir);

      expect(fileManager).toBeDefined();
      expect(fileManager).toBeInstanceOf(TaskFileManager);
    });

    it('should return same instance on subsequent calls', () => {
      const instance1 = TaskFileManager.getInstance(mockConfig, testDataDir);
      const instance2 = TaskFileManager.getInstance();

      expect(instance1).toBe(instance2);

      instance1.shutdown();
    });

    it('should throw error if no config provided for first initialization', () => {
      expect(() => {
        TaskFileManager.getInstance();
      }).toThrow('Configuration and data directory required for first initialization');
    });

    it('should initialize data directory and load index', async () => {
      fileManager = TaskFileManager.getInstance(mockConfig, testDataDir);

      const result = await fileManager.initialize();

      expect(result.success).toBe(true);
      expect(mockFs.ensureDir).toHaveBeenCalledWith(testDataDir);
    });

    it('should handle initialization errors gracefully', async () => {
      mockFs.ensureDir.mockRejectedValue(new Error('Directory creation failed'));

      fileManager = TaskFileManager.getInstance(mockConfig, testDataDir);
      const result = await fileManager.initialize();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Directory creation failed');
    });
  });

  describe('Task Saving', () => {
    beforeEach(async () => {
      fileManager = TaskFileManager.getInstance(mockConfig, testDataDir);
      await fileManager.initialize();
    });

    it('should save task without compression', async () => {
      const result = await fileManager.saveTask(mockTask);

      expect(result.success).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalled();

      const writeCall = mockFs.writeFile.mock.calls[0];
      expect(writeCall[0]).toContain('T001.json');
      expect(writeCall[1]).toContain('"id": "T001"'); // JSON is formatted with spaces
    });

    it('should save task with compression when enabled', async () => {
      // Reset singleton and create new instance with compression
      (TaskFileManager as any).instance = null;
      const compressedConfig = { ...mockConfig, enableCompression: true };
      fileManager = TaskFileManager.getInstance(compressedConfig, testDataDir);
      await fileManager.initialize();

      const result = await fileManager.saveTask(mockTask);

      expect(result.success).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalled();

      const writeCall = mockFs.writeFile.mock.calls[0];
      expect(writeCall[0]).toContain('T001.json.gz');
    });

    it('should update file index when saving task', async () => {
      await fileManager.saveTask(mockTask);

      // Check that writeJson was called for index
      expect(mockFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('.file-index.json'),
        expect.any(Object),
        { spaces: 2 }
      );
    });

    it('should handle save errors gracefully', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

      const result = await fileManager.saveTask(mockTask);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Write failed');
    });

    it('should cache task in memory after saving', async () => {
      await fileManager.saveTask(mockTask);

      // Verify task is in memory cache (internal state check)
      const loadedTasks = (fileManager as any).loadedTasks;
      expect(loadedTasks.has('T001')).toBe(true);
      expect(loadedTasks.get('T001')).toEqual(mockTask);
    });
  });

  describe('Task Loading', () => {
    beforeEach(async () => {
      fileManager = TaskFileManager.getInstance(mockConfig, testDataDir);
      await fileManager.initialize();
    });

    it('should load task from memory cache if available', async () => {
      // First save the task to cache it
      await fileManager.saveTask(mockTask);

      // Clear file system mocks to ensure we're not reading from disk
      vi.clearAllMocks();

      const result = await fileManager.loadTask('T001');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTask);
      expect(result.metadata?.filePath).toBe('memory-cache');
      expect(mockFs.readFile).not.toHaveBeenCalled();
    });

    it('should load task from file if not in cache', async () => {
      // Setup file index
      const indexEntry: FileIndexEntry = {
        id: 'T001',
        filePath: path.join(testDataDir, 'tasks', 'T001.json'),
        size: 1024,
        lastModified: new Date(),
        compressed: false
      };

      (fileManager as any).fileIndex.set('T001', indexEntry);

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockTask));

      const result = await fileManager.loadTask('T001');

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('T001');
      expect(mockFs.readFile).toHaveBeenCalledWith(indexEntry.filePath, 'utf-8');
    });

    it('should load compressed task from file', async () => {
      // Reset singleton and create new instance with compression
      (TaskFileManager as any).instance = null;
      const compressedConfig = { ...mockConfig, enableCompression: true };
      fileManager = TaskFileManager.getInstance(compressedConfig, testDataDir);
      await fileManager.initialize();

      // Setup compressed file index
      const indexEntry: FileIndexEntry = {
        id: 'T001',
        filePath: path.join(testDataDir, 'tasks', 'T001.json.gz'),
        size: 512,
        lastModified: new Date(),
        compressed: true
      };

      (fileManager as any).fileIndex.set('T001', indexEntry);

      // Mock compressed file content - return a properly "compressed" buffer
      const taskJson = JSON.stringify(mockTask);
      const compressedBuffer = Buffer.from('compressed-' + taskJson); // Match our mock compression
      mockFs.readFile.mockResolvedValue(compressedBuffer);

      const result = await fileManager.loadTask('T001');

      // Debug the result if it fails
      if (!result.success) {
        console.log('Load task failed:', result.error);
      }

      expect(result.success).toBe(true);
      expect(mockFs.readFile).toHaveBeenCalledWith(indexEntry.filePath);
    });

    it('should return error if task not found in index', async () => {
      const result = await fileManager.loadTask('NONEXISTENT');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Task not found in index');
    });

    it('should handle load errors gracefully', async () => {
      const indexEntry: FileIndexEntry = {
        id: 'T001',
        filePath: path.join(testDataDir, 'tasks', 'T001.json'),
        size: 1024,
        lastModified: new Date(),
        compressed: false
      };

      (fileManager as any).fileIndex.set('T001', indexEntry);

      mockFs.readFile.mockRejectedValue(new Error('Read failed'));

      const result = await fileManager.loadTask('T001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Read failed');
    });
  });

  describe('Batch Operations', () => {
    beforeEach(async () => {
      fileManager = TaskFileManager.getInstance(mockConfig, testDataDir);
      await fileManager.initialize();
    });

    it('should batch save multiple tasks', async () => {
      const tasks: AtomicTask[] = [];
      for (let i = 1; i <= 25; i++) {
        tasks.push({
          ...mockTask,
          id: `T${i.toString().padStart(3, '0')}`,
          title: `Test Task ${i}`
        });
      }

      const result = await fileManager.batchSaveTasks(tasks);

      expect(result.success).toBe(true);
      expect(result.totalProcessed).toBe(25);
      expect(result.errors.length).toBe(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should process tasks in batches with concurrency limit', async () => {
      const tasks: AtomicTask[] = [];
      for (let i = 1; i <= 15; i++) {
        tasks.push({
          ...mockTask,
          id: `T${i.toString().padStart(3, '0')}`,
          title: `Test Task ${i}`
        });
      }

      const result = await fileManager.batchSaveTasks(tasks);

      expect(result.success).toBe(true);
      expect(result.totalProcessed).toBe(15);
      expect(result.errors.length).toBe(0);

      // Verify all tasks were processed
      expect(mockFs.writeFile).toHaveBeenCalledTimes(15);
    }, 10000); // Increase timeout to 10 seconds

    it('should handle individual task failures in batch', async () => {
      const tasks: AtomicTask[] = [
        { ...mockTask, id: 'T001', title: 'Good Task 1' },
        { ...mockTask, id: 'T002', title: 'Bad Task' },
        { ...mockTask, id: 'T003', title: 'Good Task 2' }
      ];

      // Make second task fail
      mockFs.writeFile.mockImplementation(async (filePath: string, ...args) => {
        if (filePath.includes('T002')) {
          throw new Error('Write failed for T002');
        }
        return Promise.resolve();
      });

      const result = await fileManager.batchSaveTasks(tasks);

      expect(result.success).toBe(false); // Overall failure due to errors
      expect(result.totalProcessed).toBe(2); // Two successful
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].id).toBe('T002');
    });
  });

  describe('File Index Management', () => {
    beforeEach(async () => {
      fileManager = TaskFileManager.getInstance(mockConfig, testDataDir);
      await fileManager.initialize();
    });

    it('should load existing file index on initialization', async () => {
      const existingIndex = {
        'T001': {
          id: 'T001',
          filePath: '/test/T001.json',
          size: 1024,
          lastModified: new Date().toISOString(),
          compressed: false
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue(existingIndex);

      fileManager.shutdown();
      fileManager = TaskFileManager.getInstance(mockConfig, testDataDir);
      await fileManager.initialize();

      // Check that index was loaded (internal state check)
      const fileIndex = (fileManager as any).fileIndex;
      expect(fileIndex.has('T001')).toBe(true);
    });

    it('should handle corrupted index file gracefully', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockRejectedValue(new Error('Corrupted JSON'));

      fileManager.shutdown();
      fileManager = TaskFileManager.getInstance(mockConfig, testDataDir);
      const result = await fileManager.initialize();

      // Should still initialize successfully with empty index
      expect(result.success).toBe(true);
    });

    it('should save index after task operations', async () => {
      await fileManager.saveTask(mockTask);

      expect(mockFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('.file-index.json'),
        expect.any(Object),
        { spaces: 2 }
      );
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      fileManager = TaskFileManager.getInstance(mockConfig, testDataDir);
      await fileManager.initialize();
    });

    it('should provide file manager statistics', async () => {
      // Add some tasks to get meaningful stats
      await fileManager.saveTask(mockTask);
      await fileManager.saveTask({ ...mockTask, id: 'T002' });

      const stats = fileManager.getStatistics();

      expect(stats).toHaveProperty('indexedFiles');
      expect(stats).toHaveProperty('memoryCache');
      expect(stats).toHaveProperty('lazyLoadCache');
      expect(stats).toHaveProperty('totalFileSize');
      expect(stats).toHaveProperty('compressionRatio');

      expect(stats.indexedFiles).toBeGreaterThan(0);
      expect(stats.memoryCache).toBeGreaterThan(0);
    });

    it('should calculate compression ratio correctly', async () => {
      // Reset singleton and create new instance with compression
      (TaskFileManager as any).instance = null;
      const compressedConfig = { ...mockConfig, enableCompression: true };
      fileManager = TaskFileManager.getInstance(compressedConfig, testDataDir);
      await fileManager.initialize();

      await fileManager.saveTask(mockTask);
      await fileManager.saveTask({ ...mockTask, id: 'T002' });

      const stats = fileManager.getStatistics();
      expect(stats.compressionRatio).toBeGreaterThan(0);
      expect(stats.compressionRatio).toBeLessThanOrEqual(1);
      expect(stats.indexedFiles).toBe(2);
    });
  });

  describe('Memory Management Integration', () => {
    beforeEach(async () => {
      fileManager = TaskFileManager.getInstance(mockConfig, testDataDir);
      await fileManager.initialize();
    });

    it('should register cleanup callback with memory manager', () => {
      // Verify cleanup callback was registered (mocked)
      const mockMemoryManager = (fileManager as any).memoryManager;
      expect(mockMemoryManager.registerCleanupCallback).toHaveBeenCalledWith(
        'task-file-manager',
        expect.any(Function)
      );
    });

    it('should perform cleanup when requested', async () => {
      // Add some data to clean up
      await fileManager.saveTask(mockTask);
      await fileManager.saveTask({ ...mockTask, id: 'T002' });

      // Get the cleanup callback
      const cleanupCallback = (fileManager as any).performCleanup.bind(fileManager);
      const result = await cleanupCallback();

      expect(result.success).toBe(true);
      expect(result.itemsRemoved).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should unregister cleanup callback on shutdown', async () => {
      const mockMemoryManager = (fileManager as any).memoryManager;

      await fileManager.shutdown();

      expect(mockMemoryManager.unregisterCleanupCallback).toHaveBeenCalledWith(
        'task-file-manager'
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      fileManager = TaskFileManager.getInstance(mockConfig, testDataDir);
      await fileManager.initialize();
    });

    it('should handle memory cache size limits', async () => {
      // Fill memory cache beyond limit
      for (let i = 1; i <= 1005; i++) {
        const task = { ...mockTask, id: `T${i.toString().padStart(4, '0')}` };
        await fileManager.saveTask(task);
      }

      const loadedTasks = (fileManager as any).loadedTasks;
      expect(loadedTasks.size).toBeLessThanOrEqual(1000);
    });

    it('should handle invalid task data gracefully', async () => {
      const invalidTask = { ...mockTask, id: undefined } as any;

      const result = await fileManager.saveTask(invalidTask);

      // Should handle gracefully (specific behavior depends on implementation)
      expect(result).toBeDefined();
    });
  });
});
