import fs from 'fs/promises';
import path from 'path';

import { z } from 'zod';

import logger from '../../../../logger.js';
import { ValidationError } from '../../../../utils/errors.js';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class ValidationSystem {
  private static instance: ValidationSystem;
  private validators: Map<string, z.ZodSchema>;

  private constructor() {
    this.validators = new Map();
    this.initializeValidators();
  }

  public static getInstance(): ValidationSystem {
    if (!ValidationSystem.instance) {
      ValidationSystem.instance = new ValidationSystem();
    }
    return ValidationSystem.instance;
  }

  private initializeValidators(): void {
    // Add default validators
    this.validators.set(
      'workspace',
      z.object({
        name: z.string(),
        version: z.string(),
        pnpmVersion: z.string(),
        workspaceGlobs: z.array(z.string()),
        turboRepo: z
          .object({
            enabled: z.boolean(),
            config: z.record(z.unknown()).optional(),
          })
          .optional(),
      })
    );

    this.validators.set(
      'package',
      z.object({
        name: z.string(),
        type: z.enum(['frontend', 'backend', 'library']),
        path: z.string(),
        dependencies: z.record(z.string()).optional(),
        devDependencies: z.record(z.string()).optional(),
      })
    );
  }

  public async validateConfigs(
    configs: Record<string, unknown>
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    for (const [key, value] of Object.entries(configs)) {
      const validator = this.validators.get(key);
      if (!validator) {
        logger.warn({ key }, 'No validator found for config type');
        continue;
      }

      try {
        validator.parse(value);
      } catch (error) {
        if (error instanceof z.ZodError) {
          errors.push(...error.errors.map((e) => `${key}: ${e.message}`));
        } else {
          errors.push(`${key}: Unknown validation error`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  public registerValidator(name: string, schema: z.ZodSchema): void {
    this.validators.set(name, schema);
  }
}

/**
 * Validates directory structure exists
 */
export async function validateDirectoryStructure(
  rootDir: string,
  directories: string[]
): Promise<void> {
  try {
    for (const dir of directories) {
      const dirPath = path.join(rootDir, dir);
      await fs.access(dirPath);
    }
  } catch (error) {
    throw new ValidationError('Directory structure validation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Validates workspace configuration
 */
export async function validateWorkspaceConfig(
  rootDir: string,
  packages: string[]
): Promise<void> {
  try {
    await validateDirectoryStructure(rootDir, packages);
  } catch (error) {
    throw new ValidationError('Workspace validation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Validates dependencies in package.json
 */
export async function validateDependencies(
  rootDir: string,
  requiredDeps: Record<string, string>
): Promise<void> {
  try {
    const packageJsonPath = path.join(rootDir, 'package.json');
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);

    const allDeps = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
    };

    const missingDeps = Object.keys(requiredDeps).filter(
      (dep) => !allDeps[dep]
    );

    if (missingDeps.length > 0) {
      throw new ValidationError('Missing required dependencies', {
        dependencies: missingDeps,
      });
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Dependency validation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Validates config files exist
 */
export async function validateConfigFiles(
  rootDir: string,
  configFiles: string[]
): Promise<void> {
  try {
    for (const file of configFiles) {
      const filePath = path.join(rootDir, file);
      await fs.access(filePath);
    }
  } catch (error) {
    throw new ValidationError('Config files validation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
