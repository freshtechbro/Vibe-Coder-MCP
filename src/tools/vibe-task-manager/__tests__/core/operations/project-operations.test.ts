import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectOperations, CreateProjectParams, UpdateProjectParams } from '../../../core/operations/project-operations.js';
import { setupCommonMocks, cleanupMocks, testData } from '../../utils/test-setup.js';
import { getStorageManager } from '../../../core/storage/storage-manager.js';
import { getVibeTaskManagerConfig } from '../../../utils/config-loader.js';
import { getIdGenerator } from '../../../utils/id-generator.js';

// Mock storage manager
vi.mock('../../../core/storage/storage-manager.js', () => ({
  getStorageManager: vi.fn()
}));

// Mock config loader
vi.mock('../../../utils/config-loader.js', () => ({
  getVibeTaskManagerConfig: vi.fn().mockResolvedValue({
    taskManager: {
      maxConcurrentTasks: 10,
      defaultTaskTemplate: 'standard',
      agentSettings: {
        maxAgents: 5,
        defaultAgent: 'general'
      },
      performanceTargets: {
        maxResponseTime: 1000,
        maxMemoryUsage: 500,
        minTestCoverage: 90
      }
    }
  })
}));

// Mock ID generator
vi.mock('../../../utils/id-generator.js', () => ({
  getIdGenerator: vi.fn().mockReturnValue({
    generateProjectId: vi.fn().mockResolvedValue({
      success: true,
      id: 'PID-TEST-PROJECT-001'
    })
  })
}));

describe('ProjectOperations', () => {
  let projectOperations: ProjectOperations;
  let mockStorageManager: unknown;

  beforeEach(async () => {
    setupCommonMocks();
    vi.clearAllMocks();

    // Create mock storage manager object
    mockStorageManager = {
      createProject: vi.fn(),
      getProject: vi.fn(),
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      listProjects: vi.fn(),
      projectExists: vi.fn(),
      getProjectsByStatus: vi.fn(),
      searchProjects: vi.fn()
    };

    // Setup the mock to return our mock storage manager
    vi.mocked(getStorageManager).mockResolvedValue(mockStorageManager);

    // Re-setup config mock after clearAllMocks
    vi.mocked(getVibeTaskManagerConfig).mockResolvedValue({
      taskManager: {
        maxConcurrentTasks: 10,
        defaultTaskTemplate: 'standard',
        agentSettings: {
          maxAgents: 5,
          defaultAgent: 'general'
        },
        performanceTargets: {
          maxResponseTime: 1000,
          maxMemoryUsage: 500,
          minTestCoverage: 90
        }
      }
    });

    // Re-setup ID generator mock after clearAllMocks
    // Create a mock that actually calls the storage manager
    const mockIdGenerator = {
      generateProjectId: vi.fn().mockImplementation(async (projectName: string) => {
        // This will call the mocked storage manager's projectExists method
        const storageManager = await getStorageManager();

        // Create base ID from project name (simplified version)
        const baseId = `PID-${projectName.toUpperCase().replace(/[^A-Z0-9]/g, '-')}`;

        // Try first ID
        const firstId = `${baseId}-001`;
        const firstExists = await storageManager.projectExists(firstId);
        if (!firstExists) {
          return { success: true, id: firstId, attempts: 1 };
        }

        // Try second ID
        const secondId = `${baseId}-002`;
        const secondExists = await storageManager.projectExists(secondId);
        if (!secondExists) {
          return { success: true, id: secondId, attempts: 2 };
        }

        return { success: false, error: 'Failed to generate unique ID' };
      })
    };

    vi.mocked(getIdGenerator).mockReturnValue(mockIdGenerator as unknown);

    projectOperations = ProjectOperations.getInstance();
  });

  afterEach(() => {
    cleanupMocks();
  });

  describe('createProject', () => {
    const validCreateParams: CreateProjectParams = {
      name: 'Test Project',
      description: 'A test project for unit testing',
      rootPath: '/test/project',
      techStack: {
        languages: ['TypeScript'],
        frameworks: ['Node.js'],
        tools: ['Jest']
      },
      tags: ['test', 'development']
    };

    it('should create a project successfully', async () => {
      const expectedProject = { ...testData.project };

      mockStorageManager.projectExists.mockResolvedValue(false);
      mockStorageManager.createProject.mockResolvedValue({
        success: true,
        data: expectedProject,
        metadata: { filePath: 'test', operation: 'create', timestamp: new Date() }
      });

      const result = await projectOperations.createProject(validCreateParams, 'test-user');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(mockStorageManager.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: validCreateParams.name,
          description: validCreateParams.description,
          status: 'pending'
        })
      );
    });

    it('should reject invalid project name', async () => {
      const invalidParams = { ...validCreateParams, name: '' };

      const result = await projectOperations.createProject(invalidParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
      expect(mockStorageManager.createProject).not.toHaveBeenCalled();
    });

    it('should reject project name that is too long', async () => {
      const invalidParams = { ...validCreateParams, name: 'a'.repeat(101) };

      const result = await projectOperations.createProject(invalidParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('100 characters or less');
    });

    it('should reject empty description', async () => {
      const invalidParams = { ...validCreateParams, description: '' };

      const result = await projectOperations.createProject(invalidParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should handle storage creation failure', async () => {
      mockStorageManager.projectExists.mockResolvedValue(false);
      mockStorageManager.createProject.mockResolvedValue({
        success: false,
        error: 'Storage error',
        metadata: { filePath: 'test', operation: 'create', timestamp: new Date() }
      });

      const result = await projectOperations.createProject(validCreateParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Storage error');
    });

    it('should generate unique project IDs', async () => {
      mockStorageManager.projectExists
        .mockResolvedValueOnce(true)  // First ID exists
        .mockResolvedValueOnce(false); // Second ID is unique

      mockStorageManager.createProject.mockResolvedValue({
        success: true,
        data: testData.project,
        metadata: { filePath: 'test', operation: 'create', timestamp: new Date() }
      });

      const result = await projectOperations.createProject(validCreateParams);

      expect(result.success).toBe(true);
      expect(mockStorageManager.projectExists).toHaveBeenCalledTimes(2);
    });

    it('should apply default configuration', async () => {
      mockStorageManager.projectExists.mockResolvedValue(false);
      mockStorageManager.createProject.mockResolvedValue({
        success: true,
        data: testData.project,
        metadata: { filePath: 'test', operation: 'create', timestamp: new Date() }
      });

      const result = await projectOperations.createProject(validCreateParams);

      expect(result.success).toBe(true);
      expect(mockStorageManager.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            maxConcurrentTasks: 10,
            defaultTaskTemplate: 'standard'
          })
        })
      );
    });
  });

  describe('getProject', () => {
    it('should retrieve an existing project', async () => {
      const expectedProject = { ...testData.project };

      mockStorageManager.getProject.mockResolvedValue({
        success: true,
        data: expectedProject,
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      const result = await projectOperations.getProject('PID-TEST-001');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expectedProject);
      expect(mockStorageManager.getProject).toHaveBeenCalledWith('PID-TEST-001');
    });

    it('should handle non-existent project', async () => {
      mockStorageManager.getProject.mockResolvedValue({
        success: false,
        error: 'Project not found',
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      const result = await projectOperations.getProject('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Project not found');
    });
  });

  describe('updateProject', () => {
    const validUpdateParams: UpdateProjectParams = {
      name: 'Updated Project Name',
      status: 'in_progress',
      tags: ['updated', 'test']
    };

    it('should update a project successfully', async () => {
      const updatedProject = { ...testData.project, ...validUpdateParams };

      // Mock getProject call that happens first in updateProject
      mockStorageManager.getProject.mockResolvedValue({
        success: true,
        data: testData.project,
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      mockStorageManager.updateProject.mockResolvedValue({
        success: true,
        data: updatedProject,
        metadata: { filePath: 'test', operation: 'update', timestamp: new Date() }
      });

      const result = await projectOperations.updateProject('PID-TEST-001', validUpdateParams, 'test-user');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(mockStorageManager.updateProject).toHaveBeenCalledWith(
        'PID-TEST-001',
        expect.objectContaining({
          name: validUpdateParams.name,
          status: validUpdateParams.status,
          metadata: expect.objectContaining({
            updatedAt: expect.any(Date)
          })
        })
      );
    });

    it('should reject invalid status', async () => {
      const invalidParams = { ...validUpdateParams, status: 'invalid_status' as unknown };

      const result = await projectOperations.updateProject('PID-TEST-001', invalidParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
      expect(mockStorageManager.updateProject).not.toHaveBeenCalled();
    });

    it('should handle storage update failure', async () => {
      // Mock getProject call that happens first in updateProject
      mockStorageManager.getProject.mockResolvedValue({
        success: true,
        data: testData.project,
        metadata: { filePath: 'test', operation: 'get', timestamp: new Date() }
      });

      mockStorageManager.updateProject.mockResolvedValue({
        success: false,
        error: 'Update failed',
        metadata: { filePath: 'test', operation: 'update', timestamp: new Date() }
      });

      const result = await projectOperations.updateProject('PID-TEST-001', validUpdateParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Update failed');
    });
  });

  describe('deleteProject', () => {
    it('should delete a project successfully', async () => {
      mockStorageManager.projectExists.mockResolvedValue(true);
      mockStorageManager.deleteProject.mockResolvedValue({
        success: true,
        metadata: { filePath: 'test', operation: 'delete', timestamp: new Date() }
      });

      const result = await projectOperations.deleteProject('PID-TEST-001', 'test-user');

      expect(result.success).toBe(true);
      expect(mockStorageManager.projectExists).toHaveBeenCalledWith('PID-TEST-001');
      expect(mockStorageManager.deleteProject).toHaveBeenCalledWith('PID-TEST-001');
    });

    it('should handle non-existent project', async () => {
      mockStorageManager.projectExists.mockResolvedValue(false);

      const result = await projectOperations.deleteProject('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(mockStorageManager.deleteProject).not.toHaveBeenCalled();
    });

    it('should handle storage deletion failure', async () => {
      mockStorageManager.projectExists.mockResolvedValue(true);
      mockStorageManager.deleteProject.mockResolvedValue({
        success: false,
        error: 'Deletion failed',
        metadata: { filePath: 'test', operation: 'delete', timestamp: new Date() }
      });

      const result = await projectOperations.deleteProject('PID-TEST-001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Deletion failed');
    });
  });

  describe('listProjects', () => {
    it('should list all projects', async () => {
      const projects = [testData.project];

      mockStorageManager.listProjects.mockResolvedValue({
        success: true,
        data: projects,
        metadata: { filePath: 'test', operation: 'list', timestamp: new Date() }
      });

      const result = await projectOperations.listProjects();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(projects);
      expect(mockStorageManager.listProjects).toHaveBeenCalled();
    });

    it('should filter projects by status', async () => {
      const projects = [testData.project];

      mockStorageManager.getProjectsByStatus.mockResolvedValue({
        success: true,
        data: projects,
        metadata: { filePath: 'test', operation: 'list', timestamp: new Date() }
      });

      const result = await projectOperations.listProjects({ status: 'pending' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(projects);
      expect(mockStorageManager.getProjectsByStatus).toHaveBeenCalledWith('pending');
    });

    it('should apply tag filters', async () => {
      const projects = [
        { ...testData.project, metadata: { ...testData.project.metadata, tags: ['test', 'development'] } },
        { ...testData.project, id: 'PID-002', metadata: { ...testData.project.metadata, tags: ['production'] } }
      ];

      mockStorageManager.listProjects.mockResolvedValue({
        success: true,
        data: projects,
        metadata: { filePath: 'test', operation: 'list', timestamp: new Date() }
      });

      const result = await projectOperations.listProjects({ tags: ['test'] });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].id).toBe('PID-TEST-001');
    });

    it('should apply pagination', async () => {
      const projects = Array.from({ length: 10 }, (_, i) => ({
        ...testData.project,
        id: `PID-${i.toString().padStart(3, '0')}`
      }));

      mockStorageManager.listProjects.mockResolvedValue({
        success: true,
        data: projects,
        metadata: { filePath: 'test', operation: 'list', timestamp: new Date() }
      });

      const result = await projectOperations.listProjects({ limit: 5, offset: 2 });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(5);
      expect(result.data![0].id).toBe('PID-002');
    });

    it('should handle storage list failure', async () => {
      mockStorageManager.listProjects.mockResolvedValue({
        success: false,
        error: 'List failed',
        metadata: { filePath: 'test', operation: 'list', timestamp: new Date() }
      });

      const result = await projectOperations.listProjects();

      expect(result.success).toBe(false);
      expect(result.error).toContain('List failed');
    });
  });

  describe('searchProjects', () => {
    it('should search projects successfully', async () => {
      const projects = [testData.project];

      mockStorageManager.searchProjects.mockResolvedValue({
        success: true,
        data: projects,
        metadata: { filePath: 'test', operation: 'search', timestamp: new Date() }
      });

      const result = await projectOperations.searchProjects('test');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(projects);
      expect(mockStorageManager.searchProjects).toHaveBeenCalledWith('test');
    });

    it('should apply additional filters to search results', async () => {
      const projects = [
        { ...testData.project, metadata: { ...testData.project.metadata, tags: ['test'] } },
        { ...testData.project, id: 'PID-002', metadata: { ...testData.project.metadata, tags: ['production'] } }
      ];

      mockStorageManager.searchProjects.mockResolvedValue({
        success: true,
        data: projects,
        metadata: { filePath: 'test', operation: 'search', timestamp: new Date() }
      });

      const result = await projectOperations.searchProjects('project', { tags: ['test'] });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].id).toBe('PID-TEST-001');
    });

    it('should handle search failure', async () => {
      mockStorageManager.searchProjects.mockResolvedValue({
        success: false,
        error: 'Search failed',
        metadata: { filePath: 'test', operation: 'search', timestamp: new Date() }
      });

      const result = await projectOperations.searchProjects('test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Search failed');
    });
  });
});
