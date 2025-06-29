import { Epic, AtomicTask, TaskPriority } from '../types/task.js';
import { getStorageManager } from '../core/storage/storage-manager.js';
import { getProjectOperations } from '../core/operations/project-operations.js';
import { getEpicService } from './epic-service.js';
import { getIdGenerator } from '../utils/id-generator.js';
import { FileOperationResult } from '../utils/file-utils.js';
import logger from '../../../logger.js';

/**
 * Epic context resolution result
 */
export interface EpicContextResult {
  epicId: string;
  epicName: string;
  source: 'existing' | 'created' | 'fallback';
  confidence: number;
  created?: boolean;
}

/**
 * Epic-task relationship management result
 */
export interface EpicTaskRelationshipResult {
  success: boolean;
  epicId: string;
  taskId: string;
  relationshipType: 'added' | 'removed' | 'moved' | 'updated';
  previousEpicId?: string;
  metadata: {
    epicProgress?: number;
    taskCount?: number;
    completedTaskCount?: number;
    conflictsResolved?: number;
  };
}

/**
 * Epic progress tracking data
 */
export interface EpicProgressData {
  epicId: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  progressPercentage: number;
  estimatedCompletionDate?: Date;
  resourceUtilization: {
    filePathConflicts: number;
    dependencyComplexity: number;
    parallelizableTaskGroups: number;
  };
}

/**
 * Epic creation parameters for context resolver
 */
export interface EpicCreationParams {
  projectId: string;
  functionalArea?: string;
  taskContext?: {
    title: string;
    description: string;
    type: string;
    tags: string[];
  };
  priority?: TaskPriority;
  estimatedHours?: number;
}

/**
 * Epic Context Resolver Service
 * Resolves epic context from project and task information with fallback strategies
 */
export class EpicContextResolver {
  private static instance: EpicContextResolver;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): EpicContextResolver {
    if (!EpicContextResolver.instance) {
      EpicContextResolver.instance = new EpicContextResolver();
    }
    return EpicContextResolver.instance;
  }

  /**
   * Resolve epic context for a task
   */
  async resolveEpicContext(params: EpicCreationParams): Promise<EpicContextResult> {
    try {
      const functionalArea = params.functionalArea || this.extractFunctionalArea(params.taskContext);
      logger.debug({
        projectId: params.projectId,
        functionalArea: params.functionalArea,
        extractedFunctionalArea: functionalArea,
        taskTitle: params.taskContext?.title
      }, 'Resolving epic context');

      // Strategy 1: Try to find existing epic in project
      const existingEpic = await this.findExistingEpic(params);
      if (existingEpic) {
        logger.debug({ epicId: existingEpic.epicId, source: existingEpic.source }, 'Found existing epic');
        return existingEpic;
      }

      // Strategy 2: Create new epic based on functional area
      logger.debug({ functionalArea }, 'No existing epic found, attempting to create functional area epic');
      const createdEpic = await this.createFunctionalAreaEpic(params);
      if (createdEpic) {
        logger.debug({ epicId: createdEpic.epicId, functionalArea }, 'Created new functional area epic');
        return createdEpic;
      }

      // Strategy 3: Fallback to main epic
      logger.debug('No functional area epic created, falling back to main epic');
      const fallbackEpic = await this.createMainEpic(params);
      return fallbackEpic;

    } catch (error) {
      logger.warn({ err: error, projectId: params.projectId }, 'Epic context resolution failed, attempting fallback epic creation');
      
      try {
        // Attempt to create a fallback epic with project-specific context
        const fallbackEpic = await this.createProjectSpecificFallbackEpic(params);
        return fallbackEpic;
      } catch (fallbackError) {
        logger.error({ err: fallbackError, projectId: params.projectId }, 'Fallback epic creation also failed');
        
        // Last resort: return a generic epic ID but log the issue
        return {
          epicId: `${params.projectId}-emergency-epic`,
          epicName: 'Emergency Epic',
          source: 'fallback',
          confidence: 0.1,
          created: false
        };
      }
    }
  }

  /**
   * Extract functional area from task context
   */
  extractFunctionalArea(taskContext?: EpicCreationParams['taskContext']): string | null {
    if (!taskContext) return null;

    const text = `${taskContext.title} ${taskContext.description}`.toLowerCase();
    const tags = taskContext.tags?.map(tag => tag.toLowerCase()) || [];

    // Define functional area patterns
    const functionalAreas = {
      'auth': ['auth', 'login', 'register', 'authentication', 'user', 'password', 'session'],
      'video': ['video', 'stream', 'media', 'player', 'content', 'watch'],
      'api': ['api', 'endpoint', 'route', 'controller', 'service', 'backend'],
      'docs': ['doc', 'documentation', 'readme', 'guide', 'manual'],
      'ui': ['ui', 'component', 'frontend', 'interface', 'view', 'page'],
      'database': ['database', 'db', 'model', 'schema', 'migration'],
      'test': ['test', 'testing', 'spec', 'unit', 'integration'],
      'config': ['config', 'configuration', 'setup', 'environment'],
      'security': ['security', 'permission', 'access', 'role', 'authorization'],
      'multilingual': ['multilingual', 'language', 'locale', 'translation', 'i18n'],
      'accessibility': ['accessibility', 'a11y', 'wcag', 'screen reader'],
      'interactive': ['interactive', 'feature', 'engagement', 'user interaction']
    };

    // Check tags first (higher priority)
    for (const tag of tags) {
      for (const [area, keywords] of Object.entries(functionalAreas)) {
        if (keywords.includes(tag)) {
          return area;
        }
      }
    }

    // Check text content
    for (const [area, keywords] of Object.entries(functionalAreas)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          return area;
        }
      }
    }

    return null;
  }

  /**
   * Find existing epic in project
   * ONLY returns an epic if there's an exact functional area match
   */
  private async findExistingEpic(params: EpicCreationParams): Promise<EpicContextResult | null> {
    try {
      // Extract functional area from task context if not provided
      const functionalArea = params.functionalArea || this.extractFunctionalArea(params.taskContext);

      // If no functional area can be determined, don't try to find existing epics
      if (!functionalArea) {
        logger.debug({ taskTitle: params.taskContext?.title }, 'No functional area extracted, skipping existing epic search');
        return null;
      }

      const projectOps = getProjectOperations();
      const projectResult = await projectOps.getProject(params.projectId);

      if (!projectResult.success || !projectResult.data) {
        return null;
      }

      const project = projectResult.data;
      if (!project.epicIds || project.epicIds.length === 0) {
        logger.debug({ functionalArea }, 'No epics exist in project yet');
        return null;
      }

      logger.debug({
        functionalArea,
        projectEpicIds: project.epicIds,
        taskTitle: params.taskContext?.title
      }, 'Searching for existing epic with exact functional area match');

      // Search for exact functional area match
      const storageManager = await getStorageManager();

      for (const epicId of project.epicIds) {
        const epicResult = await storageManager.getEpic(epicId);
        if (epicResult.success && epicResult.data) {
          const epic = epicResult.data;
          logger.debug({
            epicId: epic.id,
            epicTitle: epic.title,
            epicTags: epic.metadata.tags,
            searchingFor: functionalArea
          }, 'Checking epic for exact functional area match');

          // Check if epic tags include the exact functional area
          if (epic.metadata.tags && epic.metadata.tags.includes(functionalArea)) {
            logger.debug({ epicId: epic.id, functionalArea }, 'Found exact functional area match');
            return {
              epicId: epic.id,
              epicName: epic.title,
              source: 'existing',
              confidence: 0.9,
              created: false
            };
          }
        }
      }

      logger.debug({ functionalArea }, 'No exact functional area match found, will create new epic');
      return null;

    } catch (error) {
      logger.debug({ err: error, projectId: params.projectId }, 'Failed to find existing epic');
      return null;
    }
  }

  /**
   * Create functional area epic
   */
  private async createFunctionalAreaEpic(params: EpicCreationParams): Promise<EpicContextResult | null> {
    try {
      const functionalArea = params.functionalArea || this.extractFunctionalArea(params.taskContext);
      if (!functionalArea) {
        return null;
      }

      const epicService = getEpicService();
      const epicTitle = `${functionalArea.charAt(0).toUpperCase() + functionalArea.slice(1)} Epic`;
      const epicDescription = `Epic for ${functionalArea} related tasks and features`;

      const createParams = {
        title: epicTitle,
        description: epicDescription,
        projectId: params.projectId,
        priority: params.priority || 'medium',
        estimatedHours: params.estimatedHours || 40,
        tags: [functionalArea, 'auto-created']
      };

      logger.info({
        functionalArea,
        epicTitle,
        projectId: params.projectId,
        createParams
      }, 'Attempting to create functional area epic');

      const createResult = await epicService.createEpic(createParams, 'epic-context-resolver');

      logger.info({
        createResult: {
          success: createResult.success,
          error: createResult.error,
          dataExists: !!createResult.data,
          epicId: createResult.data?.id
        },
        functionalArea,
        projectId: params.projectId
      }, 'Epic creation result');

      if (createResult.success && createResult.data) {
        // Update project epic association
        await this.updateProjectEpicAssociation(params.projectId, createResult.data.id);

        return {
          epicId: createResult.data.id,
          epicName: epicTitle,
          source: 'created',
          confidence: 0.8,
          created: true
        };
      }

      return null;
    } catch (error) {
      logger.debug({ err: error, projectId: params.projectId }, 'Failed to create functional area epic');
      return null;
    }
  }

  /**
   * Create main epic as fallback
   */
  private async createMainEpic(params: EpicCreationParams): Promise<EpicContextResult> {
    try {
      const epicService = getEpicService();
      const epicTitle = 'Main Epic';
      const epicDescription = 'Main epic for project tasks and features';

      const createResult = await epicService.createEpic({
        title: epicTitle,
        description: epicDescription,
        projectId: params.projectId,
        priority: params.priority || 'medium',
        estimatedHours: params.estimatedHours || 80,
        tags: ['main', 'auto-created']
      }, 'epic-context-resolver');

      if (createResult.success && createResult.data) {
        // Update project epic association
        await this.updateProjectEpicAssociation(params.projectId, createResult.data.id);

        return {
          epicId: createResult.data.id,
          epicName: epicTitle,
          source: 'created',
          confidence: 0.6,
          created: true
        };
      }

      // Ultimate fallback
      return {
        epicId: `${params.projectId}-main-epic`,
        epicName: 'Main Epic',
        source: 'fallback',
        confidence: 0.3,
        created: false
      };

    } catch (error) {
      logger.warn({ err: error, projectId: params.projectId }, 'Failed to create main epic, using fallback');
      
      return {
        epicId: `${params.projectId}-main-epic`,
        epicName: 'Main Epic',
        source: 'fallback',
        confidence: 0.1,
        created: false
      };
    }
  }

  /**
   * Add task to epic with bidirectional relationship management
   */
  async addTaskToEpic(taskId: string, epicId: string, projectId: string): Promise<EpicTaskRelationshipResult> {
    try {
      const storageManager = await getStorageManager();
      
      // Get task and epic
      const [taskResult, epicResult] = await Promise.all([
        storageManager.getTask(taskId),
        storageManager.getEpic(epicId)
      ]);

      if (!taskResult.success || !taskResult.data || !epicResult.success || !epicResult.data) {
        throw new Error('Task or epic not found');
      }

      const task = taskResult.data;
      const epic = epicResult.data;

      // Update task's epic association
      task.epicId = epicId;
      task.metadata.updatedAt = new Date();

      // Update epic's task list
      if (!epic.taskIds.includes(taskId)) {
        epic.taskIds.push(taskId);
        epic.metadata.updatedAt = new Date();
      }

      // Save both updates
      const [taskUpdateResult, epicUpdateResult] = await Promise.all([
        storageManager.updateTask(taskId, task),
        storageManager.updateEpic(epicId, epic)
      ]);

      if (!taskUpdateResult.success || !epicUpdateResult.success) {
        throw new Error('Failed to update task-epic relationship');
      }

      // Calculate updated progress
      const progressData = await this.calculateEpicProgress(epicId);

      logger.debug({ taskId, epicId, progress: progressData.progressPercentage }, 'Added task to epic');

      return {
        success: true,
        epicId,
        taskId,
        relationshipType: 'added',
        metadata: {
          epicProgress: progressData.progressPercentage,
          taskCount: progressData.totalTasks,
          completedTaskCount: progressData.completedTasks,
          conflictsResolved: await this.resolveResourceConflicts(epicId)
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId, epicId }, 'Failed to add task to epic');
      return {
        success: false,
        epicId,
        taskId,
        relationshipType: 'added',
        metadata: {}
      };
    }
  }

  /**
   * Move task between epics with conflict resolution
   */
  async moveTaskBetweenEpics(taskId: string, fromEpicId: string, toEpicId: string, projectId: string): Promise<EpicTaskRelationshipResult> {
    try {
      const storageManager = await getStorageManager();
      
      // Get task and both epics
      const [taskResult, fromEpicResult, toEpicResult] = await Promise.all([
        storageManager.getTask(taskId),
        storageManager.getEpic(fromEpicId),
        storageManager.getEpic(toEpicId)
      ]);

      if (!taskResult.success || !taskResult.data) {
        throw new Error('Task not found');
      }

      const task = taskResult.data;

      // Remove from source epic
      if (fromEpicResult.success && fromEpicResult.data) {
        const fromEpic = fromEpicResult.data;
        fromEpic.taskIds = fromEpic.taskIds.filter((id: string) => id !== taskId);
        fromEpic.metadata.updatedAt = new Date();
        await storageManager.updateEpic(fromEpicId, fromEpic);
      }

      // Add to destination epic
      if (toEpicResult.success && toEpicResult.data) {
        const toEpic = toEpicResult.data;
        if (!toEpic.taskIds.includes(taskId)) {
          toEpic.taskIds.push(taskId);
          toEpic.metadata.updatedAt = new Date();
          await storageManager.updateEpic(toEpicId, toEpic);
        }
      }

      // Update task's epic association
      task.epicId = toEpicId;
      task.metadata.updatedAt = new Date();
      await storageManager.updateTask(taskId, task);

      // Calculate progress for both epics
      const [fromProgress, toProgress] = await Promise.all([
        this.calculateEpicProgress(fromEpicId),
        this.calculateEpicProgress(toEpicId)
      ]);

      // Resolve any resource conflicts in the destination epic
      const conflictsResolved = await this.resolveResourceConflicts(toEpicId);

      logger.info({ 
        taskId, 
        fromEpicId, 
        toEpicId, 
        fromProgress: fromProgress.progressPercentage,
        toProgress: toProgress.progressPercentage,
        conflictsResolved
      }, 'Moved task between epics');

      return {
        success: true,
        epicId: toEpicId,
        taskId,
        relationshipType: 'moved',
        previousEpicId: fromEpicId,
        metadata: {
          epicProgress: toProgress.progressPercentage,
          taskCount: toProgress.totalTasks,
          completedTaskCount: toProgress.completedTasks,
          conflictsResolved
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId, fromEpicId, toEpicId }, 'Failed to move task between epics');
      return {
        success: false,
        epicId: toEpicId,
        taskId,
        relationshipType: 'moved',
        previousEpicId: fromEpicId,
        metadata: {}
      };
    }
  }

  /**
   * Calculate real-time epic progress with comprehensive metrics
   */
  async calculateEpicProgress(epicId: string): Promise<EpicProgressData> {
    try {
      const storageManager = await getStorageManager();
      const epicResult = await storageManager.getEpic(epicId);

      if (!epicResult.success || !epicResult.data) {
        throw new Error('Epic not found');
      }

      const epic = epicResult.data;
      
      // Get all tasks for this epic
      const taskPromises = epic.taskIds.map((taskId: string) => storageManager.getTask(taskId));
      const taskResults = await Promise.all(taskPromises);
      const tasks = taskResults
        .filter(result => result.success && result.data)
        .map(result => result.data!);

      // Calculate progress metrics
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(task => task.status === 'completed').length;
      const inProgressTasks = tasks.filter(task => task.status === 'in_progress').length;
      const blockedTasks = tasks.filter(task => task.status === 'blocked').length;
      const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      // Calculate resource utilization
      const filePathConflicts = this.detectFilePathConflicts(tasks);
      const dependencyComplexity = await this.calculateDependencyComplexity(epic.taskIds);
      const parallelizableTaskGroups = await this.identifyParallelizableGroups(epic.taskIds);

      // Estimate completion date based on remaining work and velocity
      const estimatedCompletionDate = this.estimateCompletionDate(tasks, progressPercentage);

      const progressData: EpicProgressData = {
        epicId,
        totalTasks,
        completedTasks,
        inProgressTasks,
        blockedTasks,
        progressPercentage,
        estimatedCompletionDate,
        resourceUtilization: {
          filePathConflicts,
          dependencyComplexity,
          parallelizableTaskGroups
        }
      };

      logger.debug({ epicId, progressData }, 'Calculated epic progress');
      return progressData;

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to calculate epic progress');
      return {
        epicId,
        totalTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        blockedTasks: 0,
        progressPercentage: 0,
        resourceUtilization: {
          filePathConflicts: 0,
          dependencyComplexity: 0,
          parallelizableTaskGroups: 0
        }
      };
    }
  }

  /**
   * Automatically update epic status based on task completion
   */
  async updateEpicStatusFromTasks(epicId: string): Promise<boolean> {
    try {
      const progressData = await this.calculateEpicProgress(epicId);
      const storageManager = await getStorageManager();
      const epicResult = await storageManager.getEpic(epicId);

      if (!epicResult.success || !epicResult.data) {
        return false;
      }

      const epic = epicResult.data;
      let statusChanged = false;

      // Determine new status based on progress
      let newStatus = epic.status;
      
      if (progressData.totalTasks === 0) {
        newStatus = 'planning';
      } else if (progressData.completedTasks === progressData.totalTasks) {
        newStatus = 'completed';
      } else if (progressData.inProgressTasks > 0 || progressData.completedTasks > 0) {
        newStatus = 'in_progress';
      } else if (progressData.blockedTasks === progressData.totalTasks) {
        newStatus = 'blocked';
      } else {
        newStatus = 'todo';
      }

      if (newStatus !== epic.status) {
        epic.status = newStatus;
        epic.metadata.updatedAt = new Date();
        
        const updateResult = await storageManager.updateEpic(epicId, epic);
        if (updateResult.success) {
          statusChanged = true;
          logger.info({ epicId, oldStatus: epic.status, newStatus, progressData }, 'Updated epic status from task completion');
        }
      }

      return statusChanged;

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to update epic status from tasks');
      return false;
    }
  }

  /**
   * Resolve resource conflicts within an epic
   */
  private async resolveResourceConflicts(epicId: string): Promise<number> {
    try {
      const storageManager = await getStorageManager();
      const epicResult = await storageManager.getEpic(epicId);

      if (!epicResult.success || !epicResult.data) {
        return 0;
      }

      const epic = epicResult.data;
      const taskPromises = epic.taskIds.map((taskId: string) => storageManager.getTask(taskId));
      const taskResults = await Promise.all(taskPromises);
      const tasks = taskResults
        .filter(result => result.success && result.data)
        .map(result => result.data!);

      // Detect and resolve file path conflicts
      const conflicts = this.detectFilePathConflicts(tasks);
      
      // For now, just log the conflicts - future enhancement could automatically suggest task sequencing
      if (conflicts > 0) {
        logger.warn({ epicId, conflicts }, 'Detected file path conflicts in epic tasks');
      }

      return conflicts;

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to resolve resource conflicts');
      return 0;
    }
  }

  /**
   * Detect file path conflicts between tasks
   */
  private detectFilePathConflicts(tasks: AtomicTask[]): number {
    const filePathMap = new Map<string, string[]>();
    
    // Group tasks by file paths
    tasks.forEach(task => {
      task.filePaths.forEach(filePath => {
        if (!filePathMap.has(filePath)) {
          filePathMap.set(filePath, []);
        }
        filePathMap.get(filePath)!.push(task.id);
      });
    });

    // Count conflicts (file paths used by multiple tasks)
    let conflicts = 0;
    filePathMap.forEach((taskIds, filePath) => {
      if (taskIds.length > 1) {
        conflicts++;
      }
    });

    return conflicts;
  }

  /**
   * Calculate dependency complexity for epic tasks
   */
  private async calculateDependencyComplexity(taskIds: string[]): Promise<number> {
    try {
      const storageManager = await getStorageManager();
      
      // Get dependency information for all tasks
      let totalDependencies = 0;
      for (const taskId of taskIds) {
        const dependencies = await storageManager.getDependenciesForTask(taskId);
        if (dependencies.success && dependencies.data) {
          totalDependencies += dependencies.data.length;
        }
      }

      // Normalize complexity (0-10 scale)
      const complexity = Math.min(Math.floor(totalDependencies / taskIds.length), 10);
      return complexity;

    } catch (error) {
      logger.debug({ err: error, taskIds }, 'Failed to calculate dependency complexity');
      return 0;
    }
  }

  /**
   * Identify parallelizable task groups
   */
  private async identifyParallelizableGroups(taskIds: string[]): Promise<number> {
    try {
      const storageManager = await getStorageManager();
      
      // Simple heuristic: tasks without dependencies can be parallelized
      let parallelizable = 0;
      for (const taskId of taskIds) {
        const dependencies = await storageManager.getDependenciesForTask(taskId);
        if (dependencies.success && dependencies.data && dependencies.data.length === 0) {
          parallelizable++;
        }
      }

      return parallelizable;

    } catch (error) {
      logger.debug({ err: error, taskIds }, 'Failed to identify parallelizable groups');
      return 0;
    }
  }

  /**
   * Estimate completion date based on task progress
   */
  private estimateCompletionDate(tasks: AtomicTask[], progressPercentage: number): Date | undefined {
    if (tasks.length === 0 || progressPercentage >= 100) {
      return undefined;
    }

    // Simple estimation based on average task completion time
    const totalEstimatedHours = tasks.reduce((sum, task) => sum + task.estimatedHours, 0);
    const remainingHours = totalEstimatedHours * ((100 - progressPercentage) / 100);
    
    // Assume 8 hours per working day
    const workingDaysRemaining = Math.ceil(remainingHours / 8);
    
    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + workingDaysRemaining);
    
    return estimatedDate;
  }

  /**
   * Update project epic association
   */
  private async updateProjectEpicAssociation(projectId: string, epicId: string): Promise<void> {
    try {
      const storageManager = await getStorageManager();
      const projectResult = await storageManager.getProject(projectId);

      if (projectResult.success && projectResult.data) {
        const project = projectResult.data;
        if (!project.epicIds.includes(epicId)) {
          project.epicIds.push(epicId);
          project.metadata.updatedAt = new Date();

          // Update project directly through storage manager
          const updateResult = await storageManager.updateProject(projectId, project);
          if (updateResult.success) {
            logger.debug({ projectId, epicId }, 'Updated project epic association');
          } else {
            logger.warn({ projectId, epicId, error: updateResult.error }, 'Failed to update project epic association');
          }
        }
      }
    } catch (error) {
      logger.warn({ err: error, projectId, epicId }, 'Failed to update project epic association');
    }
  }

  /**
   * Create project-specific fallback epic with context inference
   */
  private async createProjectSpecificFallbackEpic(params: EpicCreationParams): Promise<EpicContextResult> {
    try {
      const epicService = getEpicService();
      
      // Try to get project context for better epic naming
      let projectName = 'Unknown Project';
      let projectDescription = 'Project tasks and features';
      
      try {
        const storageManager = await getStorageManager();
        const projectResult = await storageManager.getProject(params.projectId);
        if (projectResult.success && projectResult.data) {
          projectName = projectResult.data.name;
          projectDescription = projectResult.data.description || projectDescription;
        }
      } catch (contextError) {
        logger.debug({ err: contextError }, 'Could not fetch project context for epic naming');
      }

      // Infer epic name from project context and task context
      let epicTitle = `${projectName} Development Epic`;
      let epicDescription = `Main development epic for ${projectName}: ${projectDescription}`;
      
      // If we have task context, use it to create a more specific epic
      if (params.taskContext) {
        const taskType = params.taskContext.type;
        const taskTitle = params.taskContext.title;
        
        if (taskType === 'development') {
          epicTitle = `${projectName} Development Tasks`;
          epicDescription = `Development epic for ${projectName} including: ${taskTitle}`;
        } else if (taskType === 'testing') {
          epicTitle = `${projectName} Testing & QA`;
          epicDescription = `Testing and quality assurance epic for ${projectName}`;
        } else if (taskType === 'documentation') {
          epicTitle = `${projectName} Documentation`;
          epicDescription = `Documentation epic for ${projectName}`;
        } else {
          epicTitle = `${projectName} ${taskType.charAt(0).toUpperCase() + taskType.slice(1)} Epic`;
          epicDescription = `${taskType} epic for ${projectName}: ${taskTitle}`;
        }
      }

      const createResult = await epicService.createEpic({
        title: epicTitle,
        description: epicDescription,
        projectId: params.projectId,
        priority: params.priority || 'medium',
        estimatedHours: params.estimatedHours || 40, // More conservative estimate for fallback
        tags: ['auto-created', 'fallback', 'project-specific']
      }, 'epic-context-resolver-fallback');

      if (createResult.success && createResult.data) {
        // Update project epic association
        await this.updateProjectEpicAssociation(params.projectId, createResult.data.id);

        logger.info({
          projectId: params.projectId,
          epicId: createResult.data.id,
          epicTitle,
          source: 'fallback'
        }, 'Created project-specific fallback epic');

        return {
          epicId: createResult.data.id,
          epicName: epicTitle,
          source: 'created',
          confidence: 0.6, // Medium confidence for fallback
          created: true
        };
      }

      throw new Error(`Failed to create fallback epic: ${createResult.error}`);
    } catch (error) {
      logger.error({ err: error, projectId: params.projectId }, 'Failed to create project-specific fallback epic');
      throw error;
    }
  }
}

/**
 * Get singleton instance of Epic Context Resolver
 */
export function getEpicContextResolver(): EpicContextResolver {
  return EpicContextResolver.getInstance();
}
