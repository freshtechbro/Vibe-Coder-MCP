import { Project, ProjectConfig, TaskStatus } from '../../types/task.js';
import { getStorageManager } from '../storage/storage-manager.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import { getIdGenerator } from '../../utils/id-generator.js';
import { FileOperationResult } from '../../utils/file-utils.js';
import logger from '../../../../logger.js';

/**
 * Project creation parameters
 */
export interface CreateProjectParams {
  name: string;
  description: string;
  rootPath?: string;
  techStack?: {
    languages: string[];
    frameworks: string[];
    tools: string[];
  };
  config?: Partial<ProjectConfig>;
  tags?: string[];
}

/**
 * Project update parameters
 */
export interface UpdateProjectParams {
  name?: string;
  description?: string;
  status?: TaskStatus;
  rootPath?: string;
  techStack?: {
    languages: string[];
    frameworks: string[];
    tools: string[];
  };
  config?: Partial<ProjectConfig>;
  tags?: string[];
}

/**
 * Project query parameters
 */
export interface ProjectQueryParams {
  status?: TaskStatus;
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Project operations service
 */
export class ProjectOperations {
  private static instance: ProjectOperations;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): ProjectOperations {
    if (!ProjectOperations.instance) {
      ProjectOperations.instance = new ProjectOperations();
    }
    return ProjectOperations.instance;
  }

  /**
   * Resolve project root path following existing patterns
   */
  private resolveProjectRootPath(providedPath?: string): string {
    // 1. Use provided path if valid
    if (providedPath && providedPath !== '/' && providedPath.length > 1) {
      return providedPath;
    }

    // 2. Use environment variable (following existing security patterns)
    const envProjectPath = process.env.VIBE_TASK_MANAGER_READ_DIR;
    if (envProjectPath && envProjectPath !== '/' && envProjectPath.length > 1) {
      return envProjectPath;
    }

    // 3. Fallback to current working directory
    const cwd = process.cwd();
    logger.debug({ providedPath, envProjectPath, cwd }, 'Project root path resolution completed');
    return cwd;
  }

  /**
   * Create a new project with validation and default configuration
   */
  async createProject(params: CreateProjectParams, createdBy: string = 'system'): Promise<FileOperationResult<Project>> {
    try {
      logger.info({ projectName: params.name, createdBy }, 'Creating new project');

      // Validate input parameters
      const validationResult = this.validateCreateParams(params);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Project creation validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: 'project-operations',
            operation: 'create_project',
            timestamp: new Date()
          }
        };
      }

      // Load configuration
      const config = await getVibeTaskManagerConfig();
      if (!config) {
        return {
          success: false,
          error: 'Failed to load task manager configuration',
          metadata: {
            filePath: 'project-operations',
            operation: 'create_project',
            timestamp: new Date()
          }
        };
      }

      // Generate unique project ID
      const idGenerator = getIdGenerator();
      const idResult = await idGenerator.generateProjectId(params.name);

      if (!idResult.success) {
        return {
          success: false,
          error: `Failed to generate project ID: ${idResult.error}`,
          metadata: {
            filePath: 'project-operations',
            operation: 'create_project',
            timestamp: new Date()
          }
        };
      }

      const projectId = idResult.id!;

      // Determine optimal agent configuration based on project characteristics
      const agentConfig = await this.determineOptimalAgentConfig(params, config);

      // Create default project configuration
      const defaultConfig: ProjectConfig = {
        maxConcurrentTasks: config.taskManager.maxConcurrentTasks,
        defaultTaskTemplate: config.taskManager.defaultTaskTemplate,
        agentConfig,
        performanceTargets: {
          maxResponseTime: config.taskManager.performanceTargets.maxResponseTime,
          maxMemoryUsage: config.taskManager.performanceTargets.maxMemoryUsage,
          minTestCoverage: config.taskManager.performanceTargets.minTestCoverage
        },
        integrationSettings: {
          codeMapEnabled: true,
          researchEnabled: true,
          notificationsEnabled: true
        },
        fileSystemSettings: {
          cacheSize: 100,
          cacheTTL: 3600,
          backupEnabled: true
        }
      };

      // Merge with provided configuration
      const projectConfig: ProjectConfig = {
        ...defaultConfig,
        ...params.config,
        agentConfig: {
          ...defaultConfig.agentConfig,
          ...params.config?.agentConfig
        },
        performanceTargets: {
          ...defaultConfig.performanceTargets,
          ...params.config?.performanceTargets
        },
        integrationSettings: {
          ...defaultConfig.integrationSettings,
          ...params.config?.integrationSettings
        },
        fileSystemSettings: {
          ...defaultConfig.fileSystemSettings,
          ...params.config?.fileSystemSettings
        }
      };

      // Create project object with proper path resolution
      const project: Project = {
        id: projectId,
        name: params.name,
        description: params.description,
        status: 'pending',
        config: projectConfig,
        epicIds: [],
        rootPath: this.resolveProjectRootPath(params.rootPath),
        techStack: params.techStack || {
          languages: [],
          frameworks: [],
          tools: []
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy,
          tags: params.tags || [],
          version: '1.0.0'
        }
      };

      // Save project to storage
      const storageManager = await getStorageManager();
      const createResult = await storageManager.createProject(project);

      if (!createResult.success) {
        return {
          success: false,
          error: `Failed to save project: ${createResult.error}`,
          metadata: createResult.metadata
        };
      }

      logger.info({ projectId, projectName: params.name }, 'Project created successfully');

      return {
        success: true,
        data: createResult.data!,
        metadata: {
          filePath: 'project-operations',
          operation: 'create_project',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, projectName: params.name }, 'Failed to create project');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'project-operations',
          operation: 'create_project',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get project by ID
   */
  async getProject(projectId: string): Promise<FileOperationResult<Project>> {
    try {
      logger.debug({ projectId }, 'Getting project');

      const storageManager = await getStorageManager();
      return await storageManager.getProject(projectId);

    } catch (error) {
      logger.error({ err: error, projectId }, 'Failed to get project');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'project-operations',
          operation: 'get_project',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Update project
   */
  async updateProject(projectId: string, params: UpdateProjectParams, updatedBy: string = 'system'): Promise<FileOperationResult<Project>> {
    try {
      logger.info({ projectId, updates: Object.keys(params), updatedBy }, 'Updating project');

      // Validate update parameters
      const validationResult = this.validateUpdateParams(params);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Project update validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: 'project-operations',
            operation: 'update_project',
            timestamp: new Date()
          }
        };
      }

      // Get existing project to preserve metadata
      const storageManager = await getStorageManager();
      const existingResult = await storageManager.getProject(projectId);
      if (!existingResult.success) {
        return {
          success: false,
          error: `Project not found: ${existingResult.error}`,
          metadata: existingResult.metadata
        };
      }

      const existingProject = existingResult.data!;

      // Prepare update object with proper typing
      const updates: any = {
        ...params,
        metadata: {
          ...existingProject.metadata,
          updatedAt: new Date(),
          ...(params.tags && { tags: params.tags })
        }
      };

      // Update project in storage
      const updateResult = await storageManager.updateProject(projectId, updates);

      if (!updateResult.success) {
        return {
          success: false,
          error: `Failed to update project: ${updateResult.error}`,
          metadata: updateResult.metadata
        };
      }

      logger.info({ projectId }, 'Project updated successfully');

      return {
        success: true,
        data: updateResult.data!,
        metadata: {
          filePath: 'project-operations',
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
          filePath: 'project-operations',
          operation: 'update_project',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Create a project from PRD data
   */
  async createProjectFromPRD(prdData: any, createdBy: string = 'system'): Promise<FileOperationResult<Project>> {
    try {
      logger.info({ projectName: prdData.metadata?.projectName, createdBy }, 'Creating project from PRD');

      // Extract initial tech stack from PRD
      let languages = prdData.technical?.techStack || [];
      let frameworks = prdData.technical?.architecturalPatterns || [];
      let tools: string[] = [];

      // Use ProjectAnalyzer as fallback if PRD tech stack is insufficient
      if (languages.length === 0 || frameworks.length === 0) {
        logger.info({
          prdLanguages: languages.length,
          prdFrameworks: frameworks.length
        }, 'PRD tech stack insufficient, using ProjectAnalyzer for detection');

        try {
          const { ProjectAnalyzer } = await import('../../utils/project-analyzer.js');
          const projectAnalyzer = ProjectAnalyzer.getInstance();
          const projectPath = this.resolveProjectRootPath(); // Use proper project path resolution

          // Detect missing tech stack components
          if (languages.length === 0) {
            languages = await projectAnalyzer.detectProjectLanguages(projectPath);
            logger.debug({ detectedLanguages: languages }, 'Languages detected by ProjectAnalyzer');
          }

          if (frameworks.length === 0) {
            frameworks = await projectAnalyzer.detectProjectFrameworks(projectPath);
            logger.debug({ detectedFrameworks: frameworks }, 'Frameworks detected by ProjectAnalyzer');
          }

          // Always detect tools since PRD rarely includes them
          tools = await projectAnalyzer.detectProjectTools(projectPath);
          logger.debug({ detectedTools: tools }, 'Tools detected by ProjectAnalyzer');

        } catch (analyzerError) {
          logger.warn({
            err: analyzerError,
            projectName: prdData.metadata?.projectName
          }, 'ProjectAnalyzer detection failed, using fallback values');

          // Fallback to sensible defaults
          if (languages.length === 0) languages = ['typescript', 'javascript'];
          if (frameworks.length === 0) frameworks = ['node.js'];
          if (tools.length === 0) tools = ['git', 'npm'];
        }
      }

      // Extract project information from PRD with enhanced tech stack
      const projectParams: CreateProjectParams = {
        name: prdData.metadata?.projectName || 'Untitled Project',
        description: prdData.overview?.description || 'Project created from PRD',
        tags: ['prd-generated'],
        techStack: {
          languages,
          frameworks,
          tools
        }
      };

      logger.info({
        projectName: projectParams.name,
        techStack: projectParams.techStack,
        source: 'PRD + ProjectAnalyzer'
      }, 'Enhanced project tech stack for PRD project creation');

      // Create the project using the standard method
      return await this.createProject(projectParams, createdBy);

    } catch (error) {
      logger.error({ err: error, prdData }, 'Failed to create project from PRD');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'project-operations',
          operation: 'create_project_from_prd',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Create a project from task list data
   */
  async createProjectFromTaskList(taskListData: any, createdBy: string = 'system'): Promise<FileOperationResult<Project>> {
    try {
      logger.info({ projectName: taskListData.metadata?.projectName, createdBy }, 'Creating project from task list');

      // Extract project information from task list
      const projectParams: CreateProjectParams = {
        name: taskListData.metadata?.projectName || 'Untitled Project',
        description: taskListData.metadata?.description || 'Project created from task list',
        tags: ['task-list-generated'],
        techStack: {
          languages: taskListData.metadata?.techStack?.languages || [],
          frameworks: taskListData.metadata?.techStack?.frameworks || [],
          tools: taskListData.metadata?.techStack?.tools || []
        }
      };

      // Create the project using the standard method
      return await this.createProject(projectParams, createdBy);

    } catch (error) {
      logger.error({ err: error, taskListData }, 'Failed to create project from task list');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'project-operations',
          operation: 'create_project_from_task_list',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Delete project
   */
  async deleteProject(projectId: string, deletedBy: string = 'system'): Promise<FileOperationResult<void>> {
    try {
      logger.info({ projectId, deletedBy }, 'Deleting project');

      // Check if project exists
      const storageManager = await getStorageManager();
      const projectExists = await storageManager.projectExists(projectId);

      if (!projectExists) {
        return {
          success: false,
          error: `Project ${projectId} not found`,
          metadata: {
            filePath: 'project-operations',
            operation: 'delete_project',
            timestamp: new Date()
          }
        };
      }

      // Delete project (this will cascade to tasks and dependencies)
      const deleteResult = await storageManager.deleteProject(projectId);

      if (!deleteResult.success) {
        return {
          success: false,
          error: `Failed to delete project: ${deleteResult.error}`,
          metadata: deleteResult.metadata
        };
      }

      logger.info({ projectId }, 'Project deleted successfully');

      return {
        success: true,
        metadata: {
          filePath: 'project-operations',
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
          filePath: 'project-operations',
          operation: 'delete_project',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * List projects with optional filtering
   */
  async listProjects(query?: ProjectQueryParams): Promise<FileOperationResult<Project[]>> {
    try {
      logger.debug({ query }, 'Listing projects');

      const storageManager = await getStorageManager();
      let result: FileOperationResult<Project[]>;

      // Apply filtering based on query parameters
      if (query?.status) {
        result = await storageManager.getProjectsByStatus(query.status);
      } else {
        result = await storageManager.listProjects();
      }

      if (!result.success) {
        return result;
      }

      let projects = result.data!;

      // Apply additional filters
      if (query) {
        projects = this.applyProjectFilters(projects, query);
      }

      return {
        success: true,
        data: projects,
        metadata: {
          filePath: 'project-operations',
          operation: 'list_projects',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, query }, 'Failed to list projects');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'project-operations',
          operation: 'list_projects',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Search projects by query string
   */
  async searchProjects(searchQuery: string, query?: ProjectQueryParams): Promise<FileOperationResult<Project[]>> {
    try {
      logger.debug({ searchQuery, query }, 'Searching projects');

      const storageManager = await getStorageManager();
      const searchResult = await storageManager.searchProjects(searchQuery);

      if (!searchResult.success) {
        return searchResult;
      }

      let projects = searchResult.data!;

      // Apply additional filters
      if (query) {
        projects = this.applyProjectFilters(projects, query);
      }

      return {
        success: true,
        data: projects,
        metadata: {
          filePath: 'project-operations',
          operation: 'search_projects',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, searchQuery }, 'Failed to search projects');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'project-operations',
          operation: 'search_projects',
          timestamp: new Date()
        }
      };
    }
  }



  /**
   * Determine optimal agent configuration based on project characteristics
   */
  private async determineOptimalAgentConfig(
    params: CreateProjectParams,
    config: any
  ): Promise<{ maxAgents: number; defaultAgent: string; agentCapabilities: Record<string, any> }> {
    try {
      logger.debug({
        projectName: params.name,
        techStack: params.techStack
      }, 'Determining optimal agent configuration');

      // Use ProjectAnalyzer if tech stack is insufficient
      let languages = params.techStack?.languages || [];
      let frameworks = params.techStack?.frameworks || [];
      let tools = params.techStack?.tools || [];

      if (languages.length === 0 || frameworks.length === 0) {
        try {
          const { ProjectAnalyzer } = await import('../../utils/project-analyzer.js');
          const projectAnalyzer = ProjectAnalyzer.getInstance();
          const projectPath = this.resolveProjectRootPath(params.rootPath);

          if (languages.length === 0) {
            languages = await projectAnalyzer.detectProjectLanguages(projectPath);
          }
          if (frameworks.length === 0) {
            frameworks = await projectAnalyzer.detectProjectFrameworks(projectPath);
          }
          if (tools.length === 0) {
            tools = await projectAnalyzer.detectProjectTools(projectPath);
          }

          logger.debug({
            detectedLanguages: languages,
            detectedFrameworks: frameworks,
            detectedTools: tools
          }, 'ProjectAnalyzer enhanced tech stack for agent configuration');

        } catch (analyzerError) {
          logger.warn({
            err: analyzerError,
            projectName: params.name
          }, 'ProjectAnalyzer failed for agent configuration, using defaults');
        }
      }

      // Determine optimal agent based on project characteristics
      const optimalAgent = this.selectOptimalAgent(languages, frameworks, tools);

      // Determine agent capabilities based on tech stack
      const agentCapabilities = this.buildAgentCapabilities(languages, frameworks, tools);

      // Determine optimal number of agents based on project complexity
      const maxAgents = this.calculateOptimalAgentCount(languages, frameworks, tools, config);

      logger.info({
        projectName: params.name,
        selectedAgent: optimalAgent,
        maxAgents,
        agentCapabilities: Object.keys(agentCapabilities),
        techStackBasis: { languages, frameworks, tools }
      }, 'Optimal agent configuration determined');

      return {
        maxAgents,
        defaultAgent: optimalAgent,
        agentCapabilities
      };

    } catch (error) {
      logger.warn({
        err: error,
        projectName: params.name
      }, 'Failed to determine optimal agent configuration, using defaults');

      // Fallback to default configuration
      return {
        maxAgents: config.taskManager.agentSettings.maxAgents,
        defaultAgent: config.taskManager.agentSettings.defaultAgent,
        agentCapabilities: {}
      };
    }
  }

  /**
   * Select optimal agent based on project tech stack
   */
  private selectOptimalAgent(languages: string[], frameworks: string[], tools: string[]): string {
    // Agent specialization mapping
    const agentSpecializations = {
      'frontend-specialist': {
        languages: ['javascript', 'typescript', 'html', 'css'],
        frameworks: ['react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt.js'],
        tools: ['webpack', 'vite', 'rollup', 'tailwind'],
        score: 0
      },
      'backend-specialist': {
        languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'go'],
        frameworks: ['node.js', 'express', 'fastapi', 'django', 'spring', 'dotnet'],
        tools: ['docker', 'kubernetes', 'nginx'],
        score: 0
      },
      'fullstack-developer': {
        languages: ['javascript', 'typescript', 'python'],
        frameworks: ['react', 'node.js', 'next.js', 'django', 'fastapi'],
        tools: ['docker', 'git', 'npm', 'yarn'],
        score: 0
      },
      'mobile-specialist': {
        languages: ['javascript', 'typescript', 'swift', 'kotlin', 'dart'],
        frameworks: ['react-native', 'flutter', 'ionic'],
        tools: ['xcode', 'android-studio'],
        score: 0
      },
      'devops-specialist': {
        languages: ['bash', 'python', 'yaml'],
        frameworks: ['terraform', 'ansible'],
        tools: ['docker', 'kubernetes', 'jenkins', 'github-actions'],
        score: 0
      },
      'data-specialist': {
        languages: ['python', 'r', 'sql'],
        frameworks: ['pandas', 'tensorflow', 'pytorch'],
        tools: ['jupyter', 'docker'],
        score: 0
      }
    };

    // Calculate scores for each agent specialization
    for (const [agentType, spec] of Object.entries(agentSpecializations)) {
      // Language match score (40% weight)
      const languageMatches = languages.filter(lang =>
        spec.languages.some(specLang => lang.toLowerCase().includes(specLang))
      ).length;
      const languageScore = (languageMatches / Math.max(languages.length, 1)) * 0.4;

      // Framework match score (35% weight)
      const frameworkMatches = frameworks.filter(fw =>
        spec.frameworks.some(specFw => fw.toLowerCase().includes(specFw))
      ).length;
      const frameworkScore = (frameworkMatches / Math.max(frameworks.length, 1)) * 0.35;

      // Tools match score (25% weight)
      const toolMatches = tools.filter(tool =>
        spec.tools.some(specTool => tool.toLowerCase().includes(specTool))
      ).length;
      const toolScore = (toolMatches / Math.max(tools.length, 1)) * 0.25;

      spec.score = languageScore + frameworkScore + toolScore;
    }

    // Find the best matching agent
    const bestAgent = Object.entries(agentSpecializations)
      .sort(([, a], [, b]) => b.score - a.score)[0];

    // Use specialized agent if score is above threshold, otherwise use fullstack
    const selectedAgent = bestAgent[1].score > 0.3 ? bestAgent[0] : 'fullstack-developer';

    logger.debug({
      agentScores: Object.fromEntries(
        Object.entries(agentSpecializations).map(([name, spec]) => [name, spec.score])
      ),
      selectedAgent,
      threshold: 0.3
    }, 'Agent selection analysis completed');

    return selectedAgent;
  }

  /**
   * Build agent capabilities based on tech stack
   */
  private buildAgentCapabilities(languages: string[], frameworks: string[], tools: string[]): Record<string, any> {
    const capabilities: Record<string, any> = {};

    // Language capabilities
    if (languages.length > 0) {
      capabilities.languages = languages;
      capabilities.primaryLanguage = languages[0];
    }

    // Framework capabilities
    if (frameworks.length > 0) {
      capabilities.frameworks = frameworks;
      capabilities.primaryFramework = frameworks[0];
    }

    // Tool capabilities
    if (tools.length > 0) {
      capabilities.tools = tools;
      capabilities.buildTools = tools.filter(tool =>
        ['npm', 'yarn', 'pnpm', 'webpack', 'vite', 'rollup'].includes(tool)
      );
      capabilities.deploymentTools = tools.filter(tool =>
        ['docker', 'kubernetes', 'jenkins'].includes(tool)
      );
    }

    // Derived capabilities
    capabilities.isFullStack = languages.includes('javascript') || languages.includes('typescript');
    capabilities.isMobile = frameworks.some(fw => ['react-native', 'flutter', 'ionic'].includes(fw));
    capabilities.isBackend = frameworks.some(fw => ['node.js', 'express', 'django', 'fastapi', 'spring'].includes(fw));
    capabilities.isFrontend = frameworks.some(fw => ['react', 'vue', 'angular', 'svelte'].includes(fw));

    return capabilities;
  }

  /**
   * Calculate optimal agent count based on project complexity
   */
  private calculateOptimalAgentCount(
    languages: string[],
    frameworks: string[],
    tools: string[],
    config: any
  ): number {
    const baseAgents = config.taskManager.agentSettings.maxAgents;

    // Complexity factors
    let complexityScore = 0;

    // Language diversity (more languages = more complexity)
    complexityScore += Math.min(languages.length * 0.5, 2);

    // Framework diversity
    complexityScore += Math.min(frameworks.length * 0.3, 1.5);

    // Tool sophistication
    const sophisticatedTools = tools.filter(tool =>
      ['docker', 'kubernetes', 'webpack', 'vite', 'jenkins', 'terraform'].includes(tool)
    );
    complexityScore += Math.min(sophisticatedTools.length * 0.2, 1);

    // Calculate optimal agent count (between 1 and maxAgents)
    const optimalCount = Math.max(1, Math.min(
      Math.ceil(baseAgents * (0.5 + complexityScore * 0.1)),
      baseAgents
    ));

    logger.debug({
      complexityScore,
      languageCount: languages.length,
      frameworkCount: frameworks.length,
      sophisticatedToolCount: sophisticatedTools.length,
      baseAgents,
      optimalCount
    }, 'Agent count calculation completed');

    return optimalCount;
  }

  /**
   * Validate project creation parameters
   */
  private validateCreateParams(params: CreateProjectParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!params.name || typeof params.name !== 'string' || params.name.trim().length === 0) {
      errors.push('Project name is required and must be a non-empty string');
    }

    if (params.name && params.name.length > 100) {
      errors.push('Project name must be 100 characters or less');
    }

    if (!params.description || typeof params.description !== 'string' || params.description.trim().length === 0) {
      errors.push('Project description is required and must be a non-empty string');
    }

    if (params.description && params.description.length > 1000) {
      errors.push('Project description must be 1000 characters or less');
    }

    if (params.rootPath && typeof params.rootPath !== 'string') {
      errors.push('Root path must be a string');
    }

    if (params.tags && !Array.isArray(params.tags)) {
      errors.push('Tags must be an array of strings');
    }

    if (params.tags && params.tags.some(tag => typeof tag !== 'string')) {
      errors.push('All tags must be strings');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate project update parameters
   */
  private validateUpdateParams(params: UpdateProjectParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (params.name !== undefined) {
      if (typeof params.name !== 'string' || params.name.trim().length === 0) {
        errors.push('Project name must be a non-empty string');
      }
      if (params.name.length > 100) {
        errors.push('Project name must be 100 characters or less');
      }
    }

    if (params.description !== undefined) {
      if (typeof params.description !== 'string' || params.description.trim().length === 0) {
        errors.push('Project description must be a non-empty string');
      }
      if (params.description.length > 1000) {
        errors.push('Project description must be 1000 characters or less');
      }
    }

    if (params.status !== undefined) {
      if (!['pending', 'in_progress', 'completed', 'blocked', 'cancelled'].includes(params.status)) {
        errors.push('Status must be one of: pending, in_progress, completed, blocked, cancelled');
      }
    }

    if (params.rootPath !== undefined && typeof params.rootPath !== 'string') {
      errors.push('Root path must be a string');
    }

    if (params.tags !== undefined) {
      if (!Array.isArray(params.tags)) {
        errors.push('Tags must be an array of strings');
      } else if (params.tags.some(tag => typeof tag !== 'string')) {
        errors.push('All tags must be strings');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Apply filters to project list
   */
  private applyProjectFilters(projects: Project[], query: ProjectQueryParams): Project[] {
    let filtered = projects;

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      filtered = filtered.filter(project =>
        query.tags!.some(tag => project.metadata.tags.includes(tag))
      );
    }

    // Filter by creation date range
    if (query.createdAfter) {
      filtered = filtered.filter(project =>
        project.metadata.createdAt >= query.createdAfter!
      );
    }

    if (query.createdBefore) {
      filtered = filtered.filter(project =>
        project.metadata.createdAt <= query.createdBefore!
      );
    }

    // Apply pagination
    if (query.offset) {
      filtered = filtered.slice(query.offset);
    }

    if (query.limit) {
      filtered = filtered.slice(0, query.limit);
    }

    return filtered;
  }
}

/**
 * Convenience function to get project operations instance
 */
export function getProjectOperations(): ProjectOperations {
  return ProjectOperations.getInstance();
}
