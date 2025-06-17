import { getStorageManager } from '../core/storage/storage-manager.js';
import logger from '../../../logger.js';

/**
 * ID generation configuration
 */
export interface IdGeneratorConfig {
  projectPrefix: string;
  epicPrefix: string;
  taskPrefix: string;
  projectIdLength: number;
  epicIdLength: number;
  taskIdLength: number;
  maxRetries: number;
}

/**
 * Default ID generation configuration
 */
const DEFAULT_CONFIG: IdGeneratorConfig = {
  projectPrefix: 'PID',
  epicPrefix: 'E',
  taskPrefix: 'T',
  projectIdLength: 3,
  epicIdLength: 3,
  taskIdLength: 4,
  maxRetries: 100
};

/**
 * ID generation result
 */
export interface IdGenerationResult {
  success: boolean;
  id?: string;
  error?: string;
  attempts?: number;
}

/**
 * Hierarchical ID generation system
 * Generates unique IDs in the format:
 * - Projects: PID-NAME-001
 * - Epics: E001 (within project context)
 * - Tasks: T0001 (within epic context)
 */
export class IdGenerator {
  private static instance: IdGenerator;
  private config: IdGeneratorConfig;

  private constructor(config?: Partial<IdGeneratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<IdGeneratorConfig>): IdGenerator {
    if (!IdGenerator.instance) {
      IdGenerator.instance = new IdGenerator(config);
    }
    return IdGenerator.instance;
  }

  /**
   * Generate unique project ID
   * Format: PID-PROJECTNAME-001
   */
  async generateProjectId(projectName: string): Promise<IdGenerationResult> {
    try {
      logger.debug({ projectName }, 'Generating project ID');

      // Validate project name
      const nameValidation = this.validateProjectName(projectName);
      if (!nameValidation.valid) {
        return {
          success: false,
          error: `Invalid project name: ${nameValidation.errors.join(', ')}`
        };
      }

      // Create base ID from project name
      const baseId = this.createProjectBaseId(projectName);
      const storageManager = await getStorageManager();

      // Find unique ID with counter
      for (let counter = 1; counter <= this.config.maxRetries; counter++) {
        const projectId = `${baseId}-${counter.toString().padStart(this.config.projectIdLength, '0')}`;

        const exists = await storageManager.projectExists(projectId);
        if (!exists) {
          logger.debug({ projectId, attempts: counter }, 'Generated unique project ID');
          return {
            success: true,
            id: projectId,
            attempts: counter
          };
        }
      }

      return {
        success: false,
        error: `Failed to generate unique project ID after ${this.config.maxRetries} attempts`,
        attempts: this.config.maxRetries
      };

    } catch (error) {
      logger.error({ err: error, projectName }, 'Failed to generate project ID');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Generate unique epic ID within project context
   * Format: E001
   */
  async generateEpicId(projectId: string): Promise<IdGenerationResult> {
    try {
      logger.debug({ projectId }, 'Generating epic ID');

      // Validate project exists
      const storageManager = await getStorageManager();
      const projectExists = await storageManager.projectExists(projectId);
      if (!projectExists) {
        return {
          success: false,
          error: `Project ${projectId} not found`
        };
      }

      // Find unique epic ID within project (project-specific to prevent conflicts)
      for (let counter = 1; counter <= this.config.maxRetries; counter++) {
        const epicId = `${projectId}-${this.config.epicPrefix}${counter.toString().padStart(this.config.epicIdLength, '0')}`;

        const exists = await storageManager.epicExists(epicId);
        if (!exists) {
          logger.debug({ epicId, projectId, attempts: counter }, 'Generated unique project-specific epic ID');
          return {
            success: true,
            id: epicId,
            attempts: counter
          };
        }
      }

      return {
        success: false,
        error: `Failed to generate unique epic ID after ${this.config.maxRetries} attempts`,
        attempts: this.config.maxRetries
      };

    } catch (error) {
      logger.error({ err: error, projectId }, 'Failed to generate epic ID');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Generate unique task ID within epic context
   * Format: T0001
   */
  async generateTaskId(projectId: string, epicId: string): Promise<IdGenerationResult> {
    try {
      logger.debug({ projectId, epicId }, 'Generating task ID');

      // Validate project and epic exist
      const storageManager = await getStorageManager();

      const projectExists = await storageManager.projectExists(projectId);
      if (!projectExists) {
        return {
          success: false,
          error: `Project ${projectId} not found`
        };
      }

      const epicExists = await storageManager.epicExists(epicId);
      if (!epicExists) {
        return {
          success: false,
          error: `Epic ${epicId} not found`
        };
      }

      // Find unique task ID within epic
      for (let counter = 1; counter <= this.config.maxRetries; counter++) {
        const taskId = `${this.config.taskPrefix}${counter.toString().padStart(this.config.taskIdLength, '0')}`;

        const exists = await storageManager.taskExists(taskId);
        if (!exists) {
          logger.debug({ taskId, epicId, projectId, attempts: counter }, 'Generated unique task ID');
          return {
            success: true,
            id: taskId,
            attempts: counter
          };
        }
      }

      return {
        success: false,
        error: `Failed to generate unique task ID after ${this.config.maxRetries} attempts`,
        attempts: this.config.maxRetries
      };

    } catch (error) {
      logger.error({ err: error, projectId, epicId }, 'Failed to generate task ID');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Generate dependency ID
   * Format: DEP-{fromTaskId}-{toTaskId}-001
   */
  async generateDependencyId(fromTaskId: string, toTaskId: string): Promise<IdGenerationResult> {
    try {
      logger.debug({ fromTaskId, toTaskId }, 'Generating dependency ID');

      // Validate task IDs
      if (!this.isValidTaskId(fromTaskId)) {
        return {
          success: false,
          error: `Invalid from task ID format: ${fromTaskId}`
        };
      }

      if (!this.isValidTaskId(toTaskId)) {
        return {
          success: false,
          error: `Invalid to task ID format: ${toTaskId}`
        };
      }

      const baseId = `DEP-${fromTaskId}-${toTaskId}`;
      const storageManager = await getStorageManager();

      // Find unique dependency ID
      for (let counter = 1; counter <= this.config.maxRetries; counter++) {
        const dependencyId = `${baseId}-${counter.toString().padStart(3, '0')}`;

        const exists = await storageManager.dependencyExists(dependencyId);
        if (!exists) {
          logger.debug({ dependencyId, fromTaskId, toTaskId, attempts: counter }, 'Generated unique dependency ID');
          return {
            success: true,
            id: dependencyId,
            attempts: counter
          };
        }
      }

      return {
        success: false,
        error: `Failed to generate unique dependency ID after ${this.config.maxRetries} attempts`,
        attempts: this.config.maxRetries
      };

    } catch (error) {
      logger.error({ err: error, fromTaskId, toTaskId }, 'Failed to generate dependency ID');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Validate ID format
   */
  validateId(id: string, type: 'project' | 'epic' | 'task' | 'dependency'): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!id || typeof id !== 'string') {
      errors.push('ID must be a non-empty string');
      return { valid: false, errors };
    }

    switch (type) {
      case 'project':
        if (!this.isValidProjectId(id)) {
          errors.push('Invalid project ID format');
        }
        break;

      case 'epic':
        if (!this.isValidEpicId(id)) {
          errors.push('Invalid epic ID format');
        }
        break;

      case 'task':
        if (!this.isValidTaskId(id)) {
          errors.push('Invalid task ID format');
        }
        break;

      case 'dependency':
        if (!this.isValidDependencyId(id)) {
          errors.push('Invalid dependency ID format');
        }
        break;

      default:
        errors.push(`Unknown ID type: ${type}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Parse hierarchical ID to extract components
   */
  parseId(id: string): { type: string; components: Record<string, string> } | null {
    // Project ID: PID-NAME-001
    const projectMatch = id.match(/^(PID)-([A-Z0-9-]+)-(\d{3})$/);
    if (projectMatch) {
      return {
        type: 'project',
        components: {
          prefix: projectMatch[1],
          name: projectMatch[2],
          counter: projectMatch[3]
        }
      };
    }

    // Epic ID: E001
    const epicMatch = id.match(/^(E)(\d{3})$/);
    if (epicMatch) {
      return {
        type: 'epic',
        components: {
          prefix: epicMatch[1],
          counter: epicMatch[2]
        }
      };
    }

    // Task ID: T0001
    const taskMatch = id.match(/^(T)(\d{4})$/);
    if (taskMatch) {
      return {
        type: 'task',
        components: {
          prefix: taskMatch[1],
          counter: taskMatch[2]
        }
      };
    }

    // Dependency ID: DEP-T0001-T0002-001
    const depMatch = id.match(/^(DEP)-(T\d{4})-(T\d{4})-(\d{3})$/);
    if (depMatch) {
      return {
        type: 'dependency',
        components: {
          prefix: depMatch[1],
          fromTask: depMatch[2],
          toTask: depMatch[3],
          counter: depMatch[4]
        }
      };
    }

    return null;
  }

  /**
   * Create project base ID from name
   */
  private createProjectBaseId(projectName: string): string {
    return `${this.config.projectPrefix}-${projectName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 20)}`;
  }

  /**
   * Validate project name
   */
  private validateProjectName(projectName: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!projectName || typeof projectName !== 'string') {
      errors.push('Project name must be a non-empty string');
    } else {
      if (projectName.length < 2) {
        errors.push('Project name must be at least 2 characters long');
      }
      if (projectName.length > 50) {
        errors.push('Project name must be 50 characters or less');
      }
      if (!/^[a-zA-Z0-9\s\-_]+$/.test(projectName)) {
        errors.push('Project name can only contain letters, numbers, spaces, hyphens, and underscores');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate project ID format
   */
  private isValidProjectId(id: string): boolean {
    return /^PID-[A-Z0-9-]+-\d{3}$/.test(id);
  }

  /**
   * Validate epic ID format
   */
  private isValidEpicId(id: string): boolean {
    return new RegExp(`^${this.config.epicPrefix}\\d{${this.config.epicIdLength}}$`).test(id);
  }

  /**
   * Validate task ID format
   */
  private isValidTaskId(id: string): boolean {
    return new RegExp(`^${this.config.taskPrefix}\\d{${this.config.taskIdLength}}$`).test(id);
  }

  /**
   * Validate dependency ID format
   */
  private isValidDependencyId(id: string): boolean {
    return /^DEP-T\d{4}-T\d{4}-\d{3}$/.test(id);
  }
}

/**
 * Convenience function to get ID generator instance
 */
export function getIdGenerator(config?: Partial<IdGeneratorConfig>): IdGenerator {
  return IdGenerator.getInstance(config);
}
