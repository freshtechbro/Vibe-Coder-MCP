import path from 'path';
import { FileUtils, FileOperationResult } from '../../utils/file-utils.js';
import { Project } from '../../types/task.js';
import { getVibeTaskManagerOutputDir } from '../../utils/config-loader.js';
import { DisposableService } from '../../utils/disposable-patterns.js';
import { initializeStorage } from '../../utils/storage-initialization.js';
import logger from '../../../../logger.js';

/**
 * Project index structure
 */
interface ProjectIndex {
  projects: Array<{
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  lastUpdated: string;
  version: string;
}

/**
 * Type guard for project index
 */
function isProjectIndex(data: unknown): data is ProjectIndex {
  if (!data || typeof data !== 'object') return false;
  const index = data as Record<string, unknown>;
  return Array.isArray(index.projects) && 
         typeof index.lastUpdated === 'string' && 
         typeof index.version === 'string';
}

/**
 * Project storage interface
 */
export interface ProjectStorageOperations {
  createProject(project: Project): Promise<FileOperationResult<Project>>;
  getProject(projectId: string): Promise<FileOperationResult<Project>>;
  updateProject(projectId: string, updates: Partial<Project>): Promise<FileOperationResult<Project>>;
  deleteProject(projectId: string): Promise<FileOperationResult<void>>;
  listProjects(): Promise<FileOperationResult<Project[]>>;
  projectExists(projectId: string): Promise<boolean>;
  getProjectsByStatus(status: string): Promise<FileOperationResult<Project[]>>;
  searchProjects(query: string): Promise<FileOperationResult<Project[]>>;
}

/**
 * File-based project storage implementation with disposable pattern
 */
export class ProjectStorage extends DisposableService implements ProjectStorageOperations {
  private dataDirectory: string;
  private projectsDirectory: string;
  private indexFile: string;
  private indexUpdateLock: Promise<FileOperationResult<void>> = Promise.resolve({ success: true, metadata: { filePath: '', operation: 'init', timestamp: new Date() } });

  constructor(dataDirectory?: string) {
    super(); // Initialize DisposableService
    this.dataDirectory = dataDirectory || getVibeTaskManagerOutputDir();
    this.projectsDirectory = path.join(this.dataDirectory, 'projects');
    this.indexFile = path.join(this.dataDirectory, 'projects-index.json');
  }

  /**
   * Initialize storage directories using standardized utility
   */
  async initialize(): Promise<FileOperationResult<void>> {
    try {
      logger.debug({ dataDirectory: this.dataDirectory }, 'Initializing project storage');

      // Use standardized storage initialization with error recovery
      const result = await initializeStorage('project', this.dataDirectory, true);

      if (result.success) {
        logger.debug({
          dataDirectory: this.dataDirectory,
          directoriesCreated: result.metadata.directoriesCreated.length,
          indexFilesCreated: result.metadata.indexFilesCreated.length
        }, 'Project storage initialized successfully');

        return {
          success: true,
          metadata: {
            filePath: this.dataDirectory,
            operation: 'initialize',
            timestamp: new Date()
          }
        };
      } else {
        logger.error({
          err: result.error,
          dataDirectory: this.dataDirectory
        }, 'Failed to initialize project storage');

        return {
          success: false,
          error: result.error || 'Unknown initialization error',
          metadata: {
            filePath: this.dataDirectory,
            operation: 'initialize',
            timestamp: new Date()
          }
        };
      }

    } catch (error) {
      logger.error({ err: error, dataDirectory: this.dataDirectory }, 'Failed to initialize project storage');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.dataDirectory,
          operation: 'initialize',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Create a new project
   */
  async createProject(project: Project): Promise<FileOperationResult<Project>> {
    try {
      logger.info({ projectId: project.id, projectName: project.name }, 'Creating project');

      // Validate project data
      const validationResult = this.validateProject(project);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Project validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: this.getProjectFilePath(project.id),
            operation: 'create_project',
            timestamp: new Date()
          }
        };
      }

      // Check if project already exists
      if (await this.projectExists(project.id)) {
        return {
          success: false,
          error: `Project with ID ${project.id} already exists`,
          metadata: {
            filePath: this.getProjectFilePath(project.id),
            operation: 'create_project',
            timestamp: new Date()
          }
        };
      }

      // Ensure storage is initialized
      const initResult = await this.initialize();
      if (!initResult.success) {
        return {
          success: false,
          error: `Failed to initialize storage: ${initResult.error}`,
          metadata: initResult.metadata
        };
      }

      // Set creation timestamp
      const projectToSave = {
        ...project,
        metadata: {
          ...project.metadata,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      };

      // Save project file
      const projectFilePath = this.getProjectFilePath(project.id);
      const saveResult = await FileUtils.writeYamlFile(projectFilePath, projectToSave);
      if (!saveResult.success) {
        return {
          success: false,
          error: `Failed to save project: ${saveResult.error}`,
          metadata: saveResult.metadata
        };
      }

      // Update index
      const indexUpdateResult = await this.updateIndex('add', project.id, {
        id: project.id,
        name: project.name,
        createdAt: projectToSave.metadata.createdAt,
        updatedAt: projectToSave.metadata.updatedAt
      });

      if (!indexUpdateResult.success) {
        // Try to clean up the project file if index update failed
        await FileUtils.deleteFile(projectFilePath);
        return {
          success: false,
          error: `Failed to update index: ${indexUpdateResult.error}`,
          metadata: indexUpdateResult.metadata
        };
      }

      logger.info({ projectId: project.id }, 'Project created successfully');

      return {
        success: true,
        data: projectToSave,
        metadata: {
          filePath: projectFilePath,
          operation: 'create_project',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, projectId: project.id }, 'Failed to create project');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getProjectFilePath(project.id),
          operation: 'create_project',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get a project by ID
   */
  async getProject(projectId: string): Promise<FileOperationResult<Project>> {
    try {
      logger.debug({ projectId }, 'Getting project');

      const projectFilePath = this.getProjectFilePath(projectId);

      if (!await FileUtils.fileExists(projectFilePath)) {
        return {
          success: false,
          error: `Project ${projectId} not found`,
          metadata: {
            filePath: projectFilePath,
            operation: 'get_project',
            timestamp: new Date()
          }
        };
      }

      const loadResult = await FileUtils.readYamlFile<Project>(projectFilePath);
      if (!loadResult.success) {
        return {
          success: false,
          error: `Failed to load project: ${loadResult.error}`,
          metadata: loadResult.metadata
        };
      }

      return {
        success: true,
        data: loadResult.data!,
        metadata: {
          filePath: projectFilePath,
          operation: 'get_project',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, projectId }, 'Failed to get project');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getProjectFilePath(projectId),
          operation: 'get_project',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Update a project
   */
  async updateProject(projectId: string, updates: Partial<Project>): Promise<FileOperationResult<Project>> {
    try {
      logger.info({ projectId, updates: Object.keys(updates) }, 'Updating project');

      // Get existing project
      const getResult = await this.getProject(projectId);
      if (!getResult.success) {
        return getResult;
      }

      const existingProject = getResult.data!;

      // Merge updates
      const updatedProject: Project = {
        ...existingProject,
        ...updates,
        id: projectId, // Ensure ID cannot be changed
        metadata: {
          ...existingProject.metadata,
          ...updates.metadata,
          createdAt: existingProject.metadata.createdAt, // Preserve creation time
          updatedAt: new Date()
        }
      };

      // Validate updated project
      const validationResult = this.validateProject(updatedProject);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Project validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: this.getProjectFilePath(projectId),
            operation: 'update_project',
            timestamp: new Date()
          }
        };
      }

      // Save updated project
      const projectFilePath = this.getProjectFilePath(projectId);
      const saveResult = await FileUtils.writeYamlFile(projectFilePath, updatedProject);
      if (!saveResult.success) {
        return {
          success: false,
          error: `Failed to save updated project: ${saveResult.error}`,
          metadata: saveResult.metadata
        };
      }

      // Update index
      const indexUpdateResult = await this.updateIndex('update', projectId, {
        id: updatedProject.id,
        name: updatedProject.name,
        createdAt: updatedProject.metadata.createdAt,
        updatedAt: updatedProject.metadata.updatedAt
      });

      if (!indexUpdateResult.success) {
        logger.warn({ projectId, error: indexUpdateResult.error }, 'Failed to update index, but project was saved');
      }

      logger.info({ projectId }, 'Project updated successfully');

      return {
        success: true,
        data: updatedProject,
        metadata: {
          filePath: projectFilePath,
          operation: 'update_project',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, projectId }, 'Failed to update project');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getProjectFilePath(projectId),
          operation: 'update_project',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId: string): Promise<FileOperationResult<void>> {
    try {
      logger.info({ projectId }, 'Deleting project');

      // Check if project exists
      if (!await this.projectExists(projectId)) {
        return {
          success: false,
          error: `Project ${projectId} not found`,
          metadata: {
            filePath: this.getProjectFilePath(projectId),
            operation: 'delete_project',
            timestamp: new Date()
          }
        };
      }

      // Delete project file
      const projectFilePath = this.getProjectFilePath(projectId);
      const deleteResult = await FileUtils.deleteFile(projectFilePath);
      if (!deleteResult.success) {
        return {
          success: false,
          error: `Failed to delete project file: ${deleteResult.error}`,
          metadata: deleteResult.metadata
        };
      }

      // Update index
      const indexUpdateResult = await this.updateIndex('remove', projectId);
      if (!indexUpdateResult.success) {
        logger.warn({ projectId, error: indexUpdateResult.error }, 'Failed to update index, but project file was deleted');
      }

      logger.info({ projectId }, 'Project deleted successfully');

      return {
        success: true,
        metadata: {
          filePath: projectFilePath,
          operation: 'delete_project',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, projectId }, 'Failed to delete project');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.getProjectFilePath(projectId),
          operation: 'delete_project',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * List all projects
   */
  async listProjects(): Promise<FileOperationResult<Project[]>> {
    try {
      logger.debug('Listing all projects');

      // Load index
      const indexResult = await this.loadIndex();
      if (!indexResult.success) {
        return {
          success: false,
          error: `Failed to load project index: ${indexResult.error}`,
          metadata: indexResult.metadata
        };
      }

      const index = indexResult.data!;
      const projects: Project[] = [];

      // Load each project
      for (const projectInfo of index.projects) {
        const projectResult = await this.getProject(projectInfo.id);
        if (projectResult.success) {
          projects.push(projectResult.data!);
        } else {
          logger.warn({ projectId: projectInfo.id, error: projectResult.error }, 'Failed to load project from index');
        }
      }

      return {
        success: true,
        data: projects,
        metadata: {
          filePath: this.indexFile,
          operation: 'list_projects',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to list projects');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: this.indexFile,
          operation: 'list_projects',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Check if project exists
   */
  async projectExists(projectId: string): Promise<boolean> {
    const projectFilePath = this.getProjectFilePath(projectId);
    return await FileUtils.fileExists(projectFilePath);
  }

  /**
   * Get projects by status
   */
  async getProjectsByStatus(status: string): Promise<FileOperationResult<Project[]>> {
    const listResult = await this.listProjects();
    if (!listResult.success) {
      return listResult;
    }

    const filteredProjects = listResult.data!.filter(project => project.status === status);

    return {
      success: true,
      data: filteredProjects,
      metadata: {
        filePath: this.indexFile,
        operation: 'get_projects_by_status',
        timestamp: new Date()
      }
    };
  }

  /**
   * Search projects by name or description
   */
  async searchProjects(query: string): Promise<FileOperationResult<Project[]>> {
    const listResult = await this.listProjects();
    if (!listResult.success) {
      return listResult;
    }

    const searchTerm = query.toLowerCase();
    const filteredProjects = listResult.data!.filter(project =>
      project.name.toLowerCase().includes(searchTerm) ||
      project.description.toLowerCase().includes(searchTerm) ||
      project.metadata.tags.some(tag => tag.toLowerCase().includes(searchTerm))
    );

    return {
      success: true,
      data: filteredProjects,
      metadata: {
        filePath: this.indexFile,
        operation: 'search_projects',
        timestamp: new Date()
      }
    };
  }

  /**
   * Get project file path
   */
  private getProjectFilePath(projectId: string): string {
    return path.join(this.projectsDirectory, `${projectId}.yaml`);
  }

  /**
   * Validate project data
   */
  private validateProject(project: Project): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!project.id || typeof project.id !== 'string') {
      errors.push('Project ID is required and must be a string');
    }

    if (!project.name || typeof project.name !== 'string') {
      errors.push('Project name is required and must be a string');
    }

    if (!project.description || typeof project.description !== 'string') {
      errors.push('Project description is required and must be a string');
    }

    if (!['pending', 'in_progress', 'completed', 'blocked', 'cancelled'].includes(project.status)) {
      errors.push('Project status must be one of: pending, in_progress, completed, blocked, cancelled');
    }

    if (!project.rootPath || typeof project.rootPath !== 'string') {
      errors.push('Project root path is required and must be a string');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Load project index
   */
  private async loadIndex(): Promise<FileOperationResult<ProjectIndex>> {
    if (!await FileUtils.fileExists(this.indexFile)) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        return initResult as FileOperationResult<ProjectIndex>;
      }
    }

    const result = await FileUtils.readJsonFile(this.indexFile);
    if (!result.success) {
      return result as FileOperationResult<ProjectIndex>;
    }

    // Validate the loaded data
    if (!isProjectIndex(result.data)) {
      return {
        success: false,
        error: 'Invalid project index format',
        metadata: result.metadata
      };
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    };
  }

  /**
   * Update project index with mutex lock to prevent concurrent modifications
   */
  private async updateIndex(operation: 'add' | 'update' | 'remove', projectId: string, projectInfo?: ProjectIndex['projects'][0]): Promise<FileOperationResult<void>> {
    // Wait for any existing index update to complete and acquire lock
    this.indexUpdateLock = this.indexUpdateLock.then(async (): Promise<FileOperationResult<void>> => {
      try {
        logger.debug({ operation, projectId }, 'Acquiring index update lock');

        const indexResult = await this.loadIndex();
        if (!indexResult.success) {
          return indexResult as FileOperationResult<void>;
        }

        const index = indexResult.data!;

        switch (operation) {
          case 'add':
            if (!index.projects.find(p => p.id === projectId) && projectInfo) {
              index.projects.push(projectInfo);
            }
            break;

          case 'update': {
            const updateIndex = index.projects.findIndex(p => p.id === projectId);
            if (updateIndex !== -1 && projectInfo) {
              index.projects[updateIndex] = projectInfo;
            }
            break;
          }

          case 'remove':
            index.projects = index.projects.filter(p => p.id !== projectId);
            break;
        }

        (index as ProjectIndex).lastUpdated = new Date().toISOString();

        const writeResult = await FileUtils.writeJsonFile(this.indexFile, index);
        logger.debug({ operation, projectId, success: writeResult.success }, 'Index update completed');

        return writeResult;

      } catch (error) {
        logger.error({ err: error, operation, projectId }, 'Index update failed');
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          metadata: {
            filePath: this.indexFile,
            operation: 'update_index',
            timestamp: new Date()
          }
        };
      }
    });

    return await this.indexUpdateLock;
  }

  /**
   * Custom disposal logic for ProjectStorage
   */
  protected async onDispose(): Promise<void> {
    // Wait for any pending index updates to complete
    try {
      await this.indexUpdateLock;
      logger.debug('ProjectStorage: Index update lock resolved during disposal');
    } catch (error) {
      logger.warn('ProjectStorage: Error waiting for index update lock during disposal', { error });
    }

    // Clear any cached data (if we had caches)
    // Note: This storage implementation doesn't currently use caches,
    // but this is where we would clear them

    logger.debug({ dataDirectory: this.dataDirectory }, 'ProjectStorage disposed');
  }
}
