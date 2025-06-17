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
      logger.warn({ err: error, projectId: params.projectId }, 'Epic context resolution failed, using fallback');
      
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
}

/**
 * Get singleton instance of Epic Context Resolver
 */
export function getEpicContextResolver(): EpicContextResolver {
  return EpicContextResolver.getInstance();
}
