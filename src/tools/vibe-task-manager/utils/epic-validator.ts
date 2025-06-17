import { Epic, AtomicTask } from '../types/task.js';
import { getStorageManager } from '../core/storage/storage-manager.js';
import { getEpicContextResolver, EpicCreationParams } from '../services/epic-context-resolver.js';
import { FileOperationResult } from './file-utils.js';
import logger from '../../../logger.js';

/**
 * Epic validation result
 */
export interface EpicValidationResult {
  valid: boolean;
  epicId: string;
  exists: boolean;
  created: boolean;
  error?: string;
}

/**
 * Epic validation and creation utilities
 */
export class EpicValidator {
  private static instance: EpicValidator;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): EpicValidator {
    if (!EpicValidator.instance) {
      EpicValidator.instance = new EpicValidator();
    }
    return EpicValidator.instance;
  }

  /**
   * Validate epic existence and create if missing
   */
  async validateAndEnsureEpic(
    epicId: string,
    projectId: string,
    taskContext?: {
      title: string;
      description: string;
      type: string;
      tags: string[];
    }
  ): Promise<EpicValidationResult> {
    try {
      logger.debug({ epicId, projectId }, 'Validating epic existence');

      // Check if epic exists
      const storageManager = await getStorageManager();
      const epicExists = await storageManager.epicExists(epicId);

      if (epicExists) {
        return {
          valid: true,
          epicId,
          exists: true,
          created: false
        };
      }

      // Epic doesn't exist, try to create it
      logger.info({ epicId, projectId }, 'Epic does not exist, attempting to create');

      const creationResult = await this.createMissingEpic(epicId, projectId, taskContext);
      
      if (creationResult.valid) {
        return creationResult;
      }

      // If creation failed, try to resolve using context resolver
      const contextResolver = getEpicContextResolver();
      const resolverParams: EpicCreationParams = {
        projectId,
        taskContext
      };

      const contextResult = await contextResolver.resolveEpicContext(resolverParams);
      
      return {
        valid: true,
        epicId: contextResult.epicId,
        exists: contextResult.source === 'existing',
        created: contextResult.created || false
      };

    } catch (error) {
      logger.error({ err: error, epicId, projectId }, 'Epic validation failed');
      
      return {
        valid: false,
        epicId,
        exists: false,
        created: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate epic for task creation
   */
  async validateEpicForTask(task: Partial<AtomicTask>): Promise<EpicValidationResult> {
    if (!task.epicId || !task.projectId) {
      return {
        valid: false,
        epicId: task.epicId || 'unknown',
        exists: false,
        created: false,
        error: 'Missing epic ID or project ID'
      };
    }

    const taskContext = task.title && task.description ? {
      title: task.title,
      description: task.description,
      type: task.type || 'development',
      tags: task.tags || []
    } : undefined;

    return this.validateAndEnsureEpic(task.epicId, task.projectId, taskContext);
  }

  /**
   * Batch validate epics for multiple tasks
   */
  async batchValidateEpics(tasks: Partial<AtomicTask>[]): Promise<Map<string, EpicValidationResult>> {
    const results = new Map<string, EpicValidationResult>();
    const uniqueEpics = new Map<string, { epicId: string; projectId: string; taskContext?: any }>();

    // Collect unique epic-project combinations
    for (const task of tasks) {
      if (task.epicId && task.projectId) {
        const key = `${task.projectId}:${task.epicId}`;
        if (!uniqueEpics.has(key)) {
          const taskContext = task.title && task.description ? {
            title: task.title,
            description: task.description,
            type: task.type || 'development',
            tags: task.tags || []
          } : undefined;

          uniqueEpics.set(key, {
            epicId: task.epicId,
            projectId: task.projectId,
            taskContext
          });
        }
      }
    }

    // Validate each unique epic
    for (const [key, epicInfo] of uniqueEpics) {
      try {
        const result = await this.validateAndEnsureEpic(
          epicInfo.epicId,
          epicInfo.projectId,
          epicInfo.taskContext
        );
        results.set(key, result);
      } catch (error) {
        logger.error({ err: error, key, epicInfo }, 'Batch epic validation failed');
        results.set(key, {
          valid: false,
          epicId: epicInfo.epicId,
          exists: false,
          created: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  /**
   * Create missing epic based on epic ID pattern
   */
  private async createMissingEpic(
    epicId: string,
    projectId: string,
    taskContext?: {
      title: string;
      description: string;
      type: string;
      tags: string[];
    }
  ): Promise<EpicValidationResult> {
    try {
      // Try to extract functional area from epic ID
      const functionalArea = this.extractFunctionalAreaFromEpicId(epicId);
      
      if (functionalArea) {
        const contextResolver = getEpicContextResolver();
        const resolverParams: EpicCreationParams = {
          projectId,
          functionalArea,
          taskContext
        };

        const contextResult = await contextResolver.resolveEpicContext(resolverParams);
        
        return {
          valid: true,
          epicId: contextResult.epicId,
          exists: false,
          created: contextResult.created || false
        };
      }

      // If no functional area detected, use context resolver with task context
      const contextResolver = getEpicContextResolver();
      const resolverParams: EpicCreationParams = {
        projectId,
        taskContext
      };

      const contextResult = await contextResolver.resolveEpicContext(resolverParams);
      
      return {
        valid: true,
        epicId: contextResult.epicId,
        exists: contextResult.source === 'existing',
        created: contextResult.created || false
      };

    } catch (error) {
      logger.warn({ err: error, epicId, projectId }, 'Failed to create missing epic');
      
      return {
        valid: false,
        epicId,
        exists: false,
        created: false,
        error: error instanceof Error ? error.message : 'Epic creation failed'
      };
    }
  }

  /**
   * Extract functional area from epic ID pattern
   */
  private extractFunctionalAreaFromEpicId(epicId: string): string | null {
    // Pattern: projectId-functionalArea-epic
    const match = epicId.match(/^.+-(.+)-epic$/);
    if (match && match[1]) {
      const functionalArea = match[1].toLowerCase();
      
      // Validate against known functional areas
      const knownAreas = [
        'auth', 'video', 'api', 'docs', 'ui', 'database', 
        'test', 'config', 'security', 'multilingual', 
        'accessibility', 'interactive', 'main'
      ];
      
      if (knownAreas.includes(functionalArea)) {
        return functionalArea;
      }
    }

    return null;
  }

  /**
   * Check if epic ID follows expected naming convention
   */
  isValidEpicIdFormat(epicId: string): boolean {
    // Accept both generated IDs (E001, E002) and descriptive IDs (project-area-epic)
    return /^E\d{3}$/.test(epicId) || /^.+-\w+-epic$/.test(epicId);
  }

  /**
   * Suggest epic ID based on task context
   */
  suggestEpicId(projectId: string, taskContext?: {
    title: string;
    description: string;
    type: string;
    tags: string[];
  }): string {
    if (!taskContext) {
      return `${projectId}-main-epic`;
    }

    const contextResolver = getEpicContextResolver();
    const functionalArea = contextResolver.extractFunctionalArea(taskContext);
    
    if (functionalArea) {
      return `${projectId}-${functionalArea}-epic`;
    }

    return `${projectId}-main-epic`;
  }
}

/**
 * Get singleton instance of Epic Validator
 */
export function getEpicValidator(): EpicValidator {
  return EpicValidator.getInstance();
}

/**
 * Convenience function to validate and ensure epic exists
 */
export async function validateAndEnsureEpic(
  epicId: string,
  projectId: string,
  taskContext?: {
    title: string;
    description: string;
    type: string;
    tags: string[];
  }
): Promise<EpicValidationResult> {
  const validator = getEpicValidator();
  return validator.validateAndEnsureEpic(epicId, projectId, taskContext);
}

/**
 * Convenience function to validate epic for task
 */
export async function validateEpicForTask(task: Partial<AtomicTask>): Promise<EpicValidationResult> {
  const validator = getEpicValidator();
  return validator.validateEpicForTask(task);
}
