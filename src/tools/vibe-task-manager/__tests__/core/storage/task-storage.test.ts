import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskStorage } from '../../../core/storage/task-storage.js';
import { AtomicTask, TaskStatus, TaskPriority, TaskType } from '../../../types/task.js';

// Mock FileUtils module
vi.mock('../../../utils/file-utils.js', () => ({
  FileUtils: {
    ensureDirectory: vi.fn().mockResolvedValue({ success: true }),
    fileExists: vi.fn().mockResolvedValue(false),
    readFile: vi.fn().mockResolvedValue({ success: true, data: '{}' }),
    writeFile: vi.fn().mockResolvedValue({ success: true }),
    readJsonFile: vi.fn().mockResolvedValue({ success: true, data: {} }),
    writeJsonFile: vi.fn().mockResolvedValue({ success: true }),
    readYamlFile: vi.fn().mockResolvedValue({ success: true, data: {} }),
    writeYamlFile: vi.fn().mockResolvedValue({ success: true }),
    deleteFile: vi.fn().mockResolvedValue({ success: true }),
    validateFilePath: vi.fn().mockResolvedValue({ valid: true })
  }
}));

// Mock logger
vi.mock('../../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn()
  }
}));

describe('TaskStorage', () => {
  let taskStorage: TaskStorage;
  let mockFileUtils: any;
  const testDataDir = '/test/data';

  // Test task data
  const testTask: AtomicTask = {
    id: 'T001',
    title: 'Test Task',
    description: 'A test task for unit testing',
    type: 'development',
    status: 'pending',
    priority: 'medium',
    projectId: 'P001',
    epicId: 'E001',
    estimatedHours: 2,
    acceptanceCriteria: ['Task should be completed'],
    dependencies: [],
    dependents: [],
    filePaths: [],
    testingRequirements: {
      unitTests: [],
      integrationTests: [],
      performanceTests: [],
      coverageTarget: 90
    },
    performanceCriteria: {},
    qualityCriteria: {
      codeQuality: [],
      documentation: [],
      typeScript: true,
      eslint: true
    },
    integrationCriteria: {
      compatibility: [],
      patterns: []
    },
    validationMethods: {
      automated: [],
      manual: []
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
    tags: ['test'],
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test-user',
      tags: ['test']
    }
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mocked FileUtils
    const fileUtilsModule = await import('../../../utils/file-utils.js');
    mockFileUtils = fileUtilsModule.FileUtils;

    taskStorage = new TaskStorage(testDataDir);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize storage directories and index files', async () => {
      mockFileUtils.ensureDirectory.mockResolvedValue({ success: true });
      mockFileUtils.fileExists.mockResolvedValue(false);
      mockFileUtils.writeJsonFile.mockResolvedValue({ success: true });

      const result = await taskStorage.initialize();

      expect(result.success).toBe(true);
      expect(mockFileUtils.ensureDirectory).toHaveBeenCalledWith(`${testDataDir}/tasks`);
      expect(mockFileUtils.ensureDirectory).toHaveBeenCalledWith(`${testDataDir}/epics`);
      expect(mockFileUtils.writeJsonFile).toHaveBeenCalledTimes(2); // tasks and epics index
    });

    it('should handle directory creation failure', async () => {
      mockFileUtils.ensureDirectory.mockResolvedValue({
        success: false,
        error: 'Permission denied'
      });

      const result = await taskStorage.initialize();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('should skip index creation if files already exist', async () => {
      mockFileUtils.ensureDirectory.mockResolvedValue({ success: true });
      mockFileUtils.fileExists.mockResolvedValue(true);

      const result = await taskStorage.initialize();

      expect(result.success).toBe(true);
      expect(mockFileUtils.writeJsonFile).not.toHaveBeenCalled();
    });
  });

  describe('createTask', () => {
    it('should create a new task successfully', async () => {
      const task = { ...testTask };

      mockFileUtils.fileExists
        .mockResolvedValueOnce(false) // task doesn't exist
        .mockResolvedValueOnce(false) // tasks index doesn't exist
        .mockResolvedValueOnce(false); // epics index doesn't exist

      mockFileUtils.readJsonFile.mockResolvedValue({
        success: true,
        data: { tasks: [], lastUpdated: new Date().toISOString(), version: '1.0.0' }
      });
      mockFileUtils.writeYamlFile.mockResolvedValue({ success: true });
      mockFileUtils.writeJsonFile.mockResolvedValue({ success: true });

      const result = await taskStorage.createTask(task);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe(task.id);
      expect(mockFileUtils.writeYamlFile).toHaveBeenCalled(); // task file
      expect(mockFileUtils.writeJsonFile).toHaveBeenCalled(); // index update
    });

    it('should reject invalid task data', async () => {
      const invalidTask = { ...testTask, title: '' };

      const result = await taskStorage.createTask(invalidTask);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should reject duplicate task ID', async () => {
      const task = { ...testTask };

      mockFileUtils.fileExists.mockResolvedValue(true); // task already exists

      const result = await taskStorage.createTask(task);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });
  });

  describe('getTask', () => {
    it('should retrieve an existing task', async () => {
      const task = { ...testTask };

      mockFileUtils.fileExists.mockResolvedValue(true);
      mockFileUtils.readYamlFile.mockResolvedValue({
        success: true,
        data: task
      });

      const result = await taskStorage.getTask(task.id);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(task);
      expect(mockFileUtils.readYamlFile).toHaveBeenCalledWith(
        `${testDataDir}/tasks/${task.id}.yaml`
      );
    });

    it('should handle non-existent task', async () => {
      mockFileUtils.fileExists.mockResolvedValue(false);

      const result = await taskStorage.getTask('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('updateTask', () => {
    it('should update an existing task', async () => {
      const task = { ...testTask };
      const updates = { title: 'Updated Task Title' };

      mockFileUtils.fileExists.mockResolvedValue(true);
      mockFileUtils.readYamlFile.mockResolvedValue({
        success: true,
        data: task
      });
      mockFileUtils.writeYamlFile.mockResolvedValue({ success: true });

      const result = await taskStorage.updateTask(task.id, updates);

      expect(result.success).toBe(true);
      expect(mockFileUtils.writeYamlFile).toHaveBeenCalled();
    });

    it('should handle non-existent task', async () => {
      mockFileUtils.fileExists.mockResolvedValue(false);

      const result = await taskStorage.updateTask('non-existent', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('deleteTask', () => {
    it('should delete an existing task', async () => {
      mockFileUtils.fileExists
        .mockResolvedValueOnce(true) // task exists
        .mockResolvedValueOnce(true); // index exists
      mockFileUtils.deleteFile.mockResolvedValue({ success: true });
      mockFileUtils.readJsonFile.mockResolvedValue({
        success: true,
        data: {
          tasks: [{ id: 'T001', title: 'Test Task' }],
          lastUpdated: new Date().toISOString(),
          version: '1.0.0'
        }
      });
      mockFileUtils.writeJsonFile.mockResolvedValue({ success: true });

      const result = await taskStorage.deleteTask('T001');

      expect(result.success).toBe(true);
      expect(mockFileUtils.deleteFile).toHaveBeenCalledWith(`${testDataDir}/tasks/T001.yaml`);
    });

    it('should handle non-existent task', async () => {
      mockFileUtils.fileExists.mockResolvedValue(false);

      const result = await taskStorage.deleteTask('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('listTasks', () => {
    it('should list all tasks', async () => {
      const tasksIndex = {
        tasks: [
          { id: 'T001', title: 'Task 1' },
          { id: 'T002', title: 'Task 2' }
        ],
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      };

      const task1 = { ...testTask, id: 'T001', title: 'Task 1' };
      const task2 = { ...testTask, id: 'T002', title: 'Task 2' };

      mockFileUtils.fileExists.mockResolvedValue(true);
      mockFileUtils.readJsonFile.mockResolvedValue({
        success: true,
        data: tasksIndex
      });
      mockFileUtils.readYamlFile
        .mockResolvedValueOnce({ success: true, data: task1 })
        .mockResolvedValueOnce({ success: true, data: task2 });

      const result = await taskStorage.listTasks();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should handle empty task list', async () => {
      const emptyIndex = {
        tasks: [],
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      };

      mockFileUtils.fileExists.mockResolvedValue(true);
      mockFileUtils.readJsonFile.mockResolvedValue({
        success: true,
        data: emptyIndex
      });

      const result = await taskStorage.listTasks();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('taskExists', () => {
    it('should return true for existing task', async () => {
      mockFileUtils.fileExists.mockResolvedValue(true);

      const exists = await taskStorage.taskExists('T001');

      expect(exists).toBe(true);
      expect(mockFileUtils.fileExists).toHaveBeenCalledWith(`${testDataDir}/tasks/T001.yaml`);
    });

    it('should return false for non-existent task', async () => {
      mockFileUtils.fileExists.mockResolvedValue(false);

      const exists = await taskStorage.taskExists('non-existent');

      expect(exists).toBe(false);
    });
  });
});
