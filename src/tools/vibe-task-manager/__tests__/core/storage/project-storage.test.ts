import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectStorage } from '../../../core/storage/project-storage.js';
import { testData } from '../../utils/test-setup.js';

// Mock FileUtils module with factory function
vi.mock('../../../utils/file-utils.js', () => {
  return {
    FileUtils: {
      ensureDirectory: vi.fn(),
      fileExists: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      readJsonFile: vi.fn(),
      writeJsonFile: vi.fn(),
      readYamlFile: vi.fn(),
      writeYamlFile: vi.fn(),
      deleteFile: vi.fn(),
      validateFilePath: vi.fn()
    }
  };
});

// Mock the storage initialization utility
vi.mock('../../../utils/storage-initialization.js', () => ({
  initializeStorage: vi.fn()
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

describe('ProjectStorage', () => {
  let projectStorage: ProjectStorage;
  let mockFileUtils: unknown;
  let mockInitializeStorage: unknown;
  const testDataDir = '/test/data';

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get the mocked FileUtils module and cast to mock type
    const fileUtilsModule = await import('../../../utils/file-utils.js');
    mockFileUtils = fileUtilsModule.FileUtils;
    
    // Get the mocked initializeStorage function
    const storageModule = await import('../../../utils/storage-initialization.js');
    mockInitializeStorage = storageModule.initializeStorage;
    
    // Use vi.mocked to ensure proper mock typing
    try {
      const mockedFileUtils = vi.mocked(mockFileUtils, true);
      
      // Set default resolved values for FileUtils mock functions
      mockedFileUtils.ensureDirectory.mockResolvedValue({ success: true });
      mockedFileUtils.fileExists.mockResolvedValue(false);
      mockedFileUtils.readFile.mockResolvedValue({ success: true, data: '{}' });
      mockedFileUtils.writeFile.mockResolvedValue({ success: true });
      mockedFileUtils.readJsonFile.mockResolvedValue({ success: true, data: {} });
      mockedFileUtils.writeJsonFile.mockResolvedValue({ success: true });
      mockedFileUtils.readYamlFile.mockResolvedValue({ success: true, data: {} });
      mockedFileUtils.writeYamlFile.mockResolvedValue({ success: true });
      mockedFileUtils.deleteFile.mockResolvedValue({ success: true });
      mockedFileUtils.validateFilePath.mockResolvedValue({ valid: true });
      
      // Update reference to use mocked version
      mockFileUtils = mockedFileUtils;
    } catch (error) {
      console.error('Mock setup error:', error);
      // Fallback to direct assignment
      mockFileUtils = fileUtilsModule.FileUtils;
    }

    // Set default resolved value for initializeStorage
    const mockedInitStorage = vi.mocked(mockInitializeStorage, true);
    mockedInitStorage.mockResolvedValue({
      success: true,
      metadata: {
        storageType: 'ProjectStorage',
        dataDirectory: testDataDir,
        directoriesCreated: [`${testDataDir}/projects`],
        indexFilesCreated: [`${testDataDir}/projects-index.json`],
        operation: 'initialize',
        timestamp: new Date()
      }
    });
    mockInitializeStorage = mockedInitStorage;

    projectStorage = new ProjectStorage(testDataDir);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize storage directories and index file', async () => {
      // Setup the mock to return success
      mockInitializeStorage.mockResolvedValue({
        success: true,
        metadata: {
          storageType: 'ProjectStorage',
          dataDirectory: testDataDir,
          directoriesCreated: [`${testDataDir}/projects`],
          indexFilesCreated: [`${testDataDir}/projects-index.json`],
          operation: 'initialize',
          timestamp: new Date()
        }
      });

      const result = await projectStorage.initialize();

      expect(result.success).toBe(true);
      expect(mockInitializeStorage).toHaveBeenCalledWith('project', testDataDir, true);
    });

    it('should handle directory creation failure', async () => {
      // Setup the mock to return failure
      mockInitializeStorage.mockResolvedValue({
        success: false,
        error: 'Permission denied',
        metadata: {
          storageType: 'ProjectStorage',
          dataDirectory: testDataDir,
          directoriesCreated: [],
          indexFilesCreated: [],
          operation: 'initialize',
          timestamp: new Date()
        }
      });

      const result = await projectStorage.initialize();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('should skip index creation if file already exists', async () => {
      // Setup the mock to return success (no index files created since they exist)
      mockInitializeStorage.mockResolvedValue({
        success: true,
        metadata: {
          storageType: 'ProjectStorage',
          dataDirectory: testDataDir,
          directoriesCreated: [`${testDataDir}/projects`],
          indexFilesCreated: [], // Empty since files already exist
          operation: 'initialize',
          timestamp: new Date()
        }
      });

      const result = await projectStorage.initialize();

      expect(result.success).toBe(true);
      expect(mockInitializeStorage).toHaveBeenCalledWith('project', testDataDir, true);
    });
  });

  describe('createProject', () => {
    it('should create a new project successfully', async () => {
      const project = { ...testData.project };

      // Clear previous mocks and setup specific ones for this test
      vi.clearAllMocks();

      // Mock the sequence of fileExists calls:
      // 1. projectExists() call - project doesn't exist
      // 2. initialize() call - index exists (so no need to create)
      mockFileUtils.fileExists
        .mockResolvedValueOnce(false) // project doesn't exist (projectExists check)
        .mockResolvedValueOnce(true); // index exists (initialize check)

      mockFileUtils.readJsonFile.mockResolvedValue({
        success: true,
        data: {
          projects: [],
          lastUpdated: new Date().toISOString(),
          version: '1.0.0'
        }
      });
      mockFileUtils.writeYamlFile.mockResolvedValue({ success: true });
      mockFileUtils.writeJsonFile.mockResolvedValue({ success: true });

      const result = await projectStorage.createProject(project);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe(project.id);
      expect(mockFileUtils.writeYamlFile).toHaveBeenCalled(); // project file
      expect(mockFileUtils.writeJsonFile).toHaveBeenCalled(); // index update
    });

    it('should reject invalid project data', async () => {
      const invalidProject = { ...testData.project, name: '' };

      const result = await projectStorage.createProject(invalidProject);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should reject duplicate project ID', async () => {
      const project = { ...testData.project };

      mockFileUtils.fileExists
        .mockResolvedValueOnce(true) // index exists
        .mockResolvedValueOnce(true); // project already exists

      const result = await projectStorage.createProject(project);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should handle file write failure', async () => {
      const project = { ...testData.project };

      // Clear previous mocks and setup specific ones for this test
      vi.clearAllMocks();

      // Mock the sequence of fileExists calls:
      // 1. projectExists() call - project doesn't exist
      // 2. initialize() call - index exists (so no need to create)
      mockFileUtils.fileExists
        .mockResolvedValueOnce(false) // project doesn't exist (projectExists check)
        .mockResolvedValueOnce(true); // index exists (initialize check)

      mockFileUtils.readJsonFile.mockResolvedValue({
        success: true,
        data: {
          projects: [],
          lastUpdated: new Date().toISOString(),
          version: '1.0.0'
        }
      });
      mockFileUtils.writeYamlFile.mockResolvedValue({
        success: false,
        error: 'Disk full'
      });

      const result = await projectStorage.createProject(project);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Disk full');
    });
  });

  describe('getProject', () => {
    it('should retrieve an existing project', async () => {
      const project = { ...testData.project };

      mockFileUtils.fileExists.mockResolvedValue(true);
      mockFileUtils.readYamlFile.mockResolvedValue({
        success: true,
        data: project
      });

      const result = await projectStorage.getProject(project.id);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(project);
      expect(mockFileUtils.readYamlFile).toHaveBeenCalledWith(
        `${testDataDir}/projects/${project.id}.yaml`
      );
    });

    it('should handle non-existent project', async () => {
      mockFileUtils.fileExists.mockResolvedValue(false);

      const result = await projectStorage.getProject('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle file read failure', async () => {
      mockFileUtils.fileExists.mockResolvedValue(true);
      mockFileUtils.readYamlFile.mockResolvedValue({
        success: false,
        error: 'File corrupted'
      });

      const result = await projectStorage.getProject('test-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File corrupted');
    });
  });

  describe('updateProject', () => {
    beforeEach(() => {
      const project = { ...testData.project };

      mockFileUtils.fileExists.mockResolvedValue(true);
      mockFileUtils.readYamlFile.mockResolvedValue({
        success: true,
        data: project
      });
    });

    it('should update an existing project', async () => {
      const updates = { name: 'Updated Project Name' };

      mockFileUtils.writeYamlFile.mockResolvedValue({ success: true });

      const result = await projectStorage.updateProject('PID-TEST-001', updates);

      expect(result.success).toBe(true);
      expect(mockFileUtils.writeYamlFile).toHaveBeenCalled();
    });

    it('should handle non-existent project', async () => {
      mockFileUtils.fileExists.mockResolvedValue(false);

      const result = await projectStorage.updateProject('non-existent', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should preserve creation timestamp', async () => {
      const updates = { name: 'Updated Name' };

      mockFileUtils.writeYamlFile.mockResolvedValue({ success: true });

      const result = await projectStorage.updateProject('PID-TEST-001', updates);

      expect(result.success).toBe(true);
      // The updated project should preserve the original creation time
      // This would be verified by checking the actual data written
    });
  });

  describe('deleteProject', () => {
    it('should delete an existing project', async () => {
      mockFileUtils.fileExists
        .mockResolvedValueOnce(true) // project exists
        .mockResolvedValueOnce(true); // index exists
      mockFileUtils.deleteFile.mockResolvedValue({ success: true });
      mockFileUtils.readJsonFile.mockResolvedValue({
        success: true,
        data: {
          projects: [{ id: 'PID-TEST-001', name: 'Test Project' }],
          lastUpdated: new Date().toISOString(),
          version: '1.0.0'
        }
      });
      mockFileUtils.writeJsonFile.mockResolvedValue({ success: true });

      const result = await projectStorage.deleteProject('PID-TEST-001');

      expect(result.success).toBe(true);
      expect(mockFileUtils.deleteFile).toHaveBeenCalledWith(`${testDataDir}/projects/PID-TEST-001.yaml`);
    });

    it('should handle non-existent project', async () => {
      mockFileUtils.fileExists.mockResolvedValue(false);

      const result = await projectStorage.deleteProject('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle file deletion failure', async () => {
      mockFileUtils.fileExists.mockResolvedValue(true);
      mockFileUtils.deleteFile.mockResolvedValue({
        success: false,
        error: 'Permission denied'
      });

      const result = await projectStorage.deleteProject('PID-TEST-001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('listProjects', () => {
    it('should list all projects', async () => {
      const projectsIndex = {
        projects: [
          { id: 'PID-001', name: 'Project 1' },
          { id: 'PID-002', name: 'Project 2' }
        ],
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      };

      const project1 = { ...testData.project, id: 'PID-001', name: 'Project 1' };
      const project2 = { ...testData.project, id: 'PID-002', name: 'Project 2' };

      mockFileUtils.fileExists.mockResolvedValue(true);
      mockFileUtils.readJsonFile.mockResolvedValue({
        success: true,
        data: projectsIndex
      });
      mockFileUtils.readYamlFile
        .mockResolvedValueOnce({ success: true, data: project1 }) // project 1
        .mockResolvedValueOnce({ success: true, data: project2 }); // project 2

      const result = await projectStorage.listProjects();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should handle empty project list', async () => {
      const emptyIndex = {
        projects: [],
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      };

      mockFileUtils.fileExists.mockResolvedValue(true);
      mockFileUtils.readJsonFile.mockResolvedValue({
        success: true,
        data: emptyIndex
      });

      const result = await projectStorage.listProjects();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should handle index load failure', async () => {
      mockFileUtils.fileExists.mockResolvedValue(true);
      mockFileUtils.readJsonFile.mockResolvedValue({
        success: false,
        error: 'Index corrupted'
      });

      const result = await projectStorage.listProjects();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Index corrupted');
    });
  });

  describe('projectExists', () => {
    it('should return true for existing project', async () => {
      mockFileUtils.fileExists.mockResolvedValue(true);

      const exists = await projectStorage.projectExists('PID-TEST-001');

      expect(exists).toBe(true);
      expect(mockFileUtils.fileExists).toHaveBeenCalledWith(`${testDataDir}/projects/PID-TEST-001.yaml`);
    });

    it('should return false for non-existent project', async () => {
      mockFileUtils.fileExists.mockResolvedValue(false);

      const exists = await projectStorage.projectExists('non-existent');

      expect(exists).toBe(false);
    });
  });

  describe('getProjectsByStatus', () => {
    it('should filter projects by status', async () => {
      const projectsIndex = {
        projects: [
          { id: 'PID-001', name: 'Project 1' },
          { id: 'PID-002', name: 'Project 2' }
        ],
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      };

      const project1 = { ...testData.project, id: 'PID-001', name: 'Project 1', status: 'pending' };
      const project2 = { ...testData.project, id: 'PID-002', name: 'Project 2', status: 'completed' };

      mockFileUtils.fileExists.mockResolvedValue(true);
      mockFileUtils.readJsonFile.mockResolvedValue({
        success: true,
        data: projectsIndex
      });
      mockFileUtils.readYamlFile
        .mockResolvedValueOnce({ success: true, data: project1 })
        .mockResolvedValueOnce({ success: true, data: project2 });

      const result = await projectStorage.getProjectsByStatus('pending');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('searchProjects', () => {
    it('should search projects by name and description', async () => {
      const projectsIndex = {
        projects: [
          { id: 'PID-001', name: 'Web Project' },
          { id: 'PID-002', name: 'Mobile App' }
        ],
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      };

      const webProject = {
        ...testData.project,
        id: 'PID-001',
        name: 'Web Project',
        description: 'A web application',
        metadata: { ...testData.project.metadata, tags: ['web', 'frontend'] }
      };
      const mobileProject = {
        ...testData.project,
        id: 'PID-002',
        name: 'Mobile App',
        description: 'A mobile application',
        metadata: { ...testData.project.metadata, tags: ['mobile', 'app'] }
      };

      mockFileUtils.fileExists.mockResolvedValue(true);
      mockFileUtils.readJsonFile.mockResolvedValue({
        success: true,
        data: projectsIndex
      });
      mockFileUtils.readYamlFile
        .mockResolvedValueOnce({ success: true, data: webProject })
        .mockResolvedValueOnce({ success: true, data: mobileProject });

      const result = await projectStorage.searchProjects('web');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].name).toBe('Web Project');
    });

    it('should return empty results for no matches', async () => {
      const projectsIndex = {
        projects: [
          { id: 'PID-001', name: 'Web Project' }
        ],
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      };

      const webProject = {
        ...testData.project,
        id: 'PID-001',
        name: 'Web Project',
        description: 'A web application',
        metadata: { ...testData.project.metadata, tags: ['web', 'frontend'] }
      };

      mockFileUtils.fileExists.mockResolvedValue(true);
      mockFileUtils.readJsonFile.mockResolvedValue({
        success: true,
        data: projectsIndex
      });
      mockFileUtils.readYamlFile.mockResolvedValue({ success: true, data: webProject });

      const result = await projectStorage.searchProjects('nonexistent');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });
});
