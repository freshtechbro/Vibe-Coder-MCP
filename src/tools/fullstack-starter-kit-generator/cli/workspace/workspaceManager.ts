import fs from 'fs/promises';
import path from 'path';

import logger from '../../../../logger.js';
import { ValidationError, AppError } from '../../../../utils/errors.js';
import { writeFilesAtomic } from '../utils/fileWriter.js';
import { ValidationSystem } from '../validation/validator.js';

/**
 * Custom error for workspace operations
 */
export class WorkspaceError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'WorkspaceError';
  }
}

/**
 * Workspace configuration interface
 */
export interface WorkspaceConfig {
  name: string;
  version: string;
  pnpmVersion: string;
  workspaceGlobs: string[];
  turboRepo?: {
    enabled: boolean;
    config?: Record<string, unknown>;
  };
}

/**
 * Package configuration interface
 */
export interface PackageConfig {
  name: string;
  type: 'frontend' | 'backend' | 'library';
  path: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Workspace Manager handles monorepo workspace setup and configuration
 */
export class WorkspaceManager {
  private static instance: WorkspaceManager;
  private validator: ValidationSystem;
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.validator = ValidationSystem.getInstance();
  }

  public static getInstance(): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      WorkspaceManager.instance = new WorkspaceManager(process.cwd());
    }
    return WorkspaceManager.instance;
  }

  /**
   * Initialize a new workspace with package directories
   */
  async initializeWorkspace(
    projectRoot: string,
    options: Record<string, any>
  ): Promise<void> {
    try {
      // Convert string array to workspace config
      const config: WorkspaceConfig = {
        name: options.name || path.basename(projectRoot),
        version: options.version || '0.1.0',
        pnpmVersion: options.pnpmVersion || '8.0.0',
        workspaceGlobs: Array.isArray(options)
          ? options
          : options.packages || ['apps/*', 'packages/*'],
        turboRepo: options.turboRepo ? { enabled: true } : undefined,
      };

      await this.initializeWorkspaceWithConfig(projectRoot, config);
      logger.info('Workspace initialized with configuration');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize workspace');
      throw new WorkspaceError('Failed to initialize workspace', {
        cause: error,
      });
    }
  }

  /**
   * Initialize a new workspace with configuration
   */
  public async initializeWorkspaceWithConfig(
    projectRoot: string,
    config: WorkspaceConfig
  ): Promise<void> {
    try {
      // Validate workspace configuration
      const validationResult = await this.validator.validateConfigs({
        workspace: config,
      });
      if (!validationResult.isValid) {
        throw new ValidationError('Invalid workspace configuration', {
          errors: validationResult.errors,
        });
      }

      // Service calls are now handled directly in main.ts initHandler
      logger.info(
        'Workspace initialization logic handled by services called from CLI handler'
      );
    } catch (error) {
      throw new WorkspaceError(
        'Failed to initialize workspace (CLI logic removed)',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Validate that workspace directories exist
   */
  public async validateWorkspace(packages: string[]): Promise<void> {
    // TODO: This validation might be better placed or called from a service,
    // but for now, keep it as it's not core generation logic.
    try {
      for (const pkg of packages) {
        const dirPath = path.join(this.rootDir, pkg);
        await fs.access(dirPath);
      }
    } catch (error) {
      throw new WorkspaceError('Workspace validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Create workspace directory structure
   */
  private async createWorkspaceDirectories(
    projectRoot: string,
    globs: string[]
  ): Promise<void> {
    // This logic is now handled by FileGenerator service via templates
    logger.debug(
      'createWorkspaceDirectories method is likely obsolete; handled by FileGenerator.'
    );
  }

  /**
   * Initialize pnpm workspace
   */
  private async initializePnpmWorkspace(
    projectRoot: string,
    config: WorkspaceConfig
  ): Promise<void> {
    // This logic is now handled by FileGenerator service via templates
    logger.debug(
      'initializePnpmWorkspace method is likely obsolete; handled by FileGenerator.'
    );
  }

  /**
   * Setup TurboRepo configuration
   */
  private async setupTurboRepo(
    projectRoot: string,
    config?: Record<string, unknown>
  ): Promise<void> {
    // This logic is now handled by FileGenerator service via templates
    logger.debug(
      'setupTurboRepo method is likely obsolete; handled by FileGenerator.'
    );
  }

  /**
   * Add a new package to the workspace
   */
  public async addPackage(
    projectRoot: string,
    config: PackageConfig
  ): Promise<void> {
    try {
      // Validate package configuration
      const validationResult = await this.validator.validateConfigs({
        package: config,
      });
      if (!validationResult.isValid) {
        throw new ValidationError('Invalid package configuration', {
          errors: validationResult.errors,
        });
      }

      // Service calls are now handled directly in main.ts addPackageHandler
      logger.info(
        `Add package logic handled by services called from CLI handler for: ${config.name}`
      );
    } catch (error) {
      throw new WorkspaceError('Failed to add package (CLI logic removed)', {
        error: error instanceof Error ? error.message : String(error),
        package: config.name,
      });
    }
  }

  /**
   * Initialize a new package
   */
  private async initializePackage(
    packagePath: string,
    config: PackageConfig
  ): Promise<void> {
    // This logic is now handled by FileGenerator service via templates
    logger.debug(
      'initializePackage method is likely obsolete; handled by FileGenerator.'
    );
  }
}
