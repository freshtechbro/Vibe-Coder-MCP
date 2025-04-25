import fs from 'fs/promises';
import path from 'path';

import { ValidationError } from '../../../utils/errors.js';

import { FrontendOptions, BackendOptions, PackageOptions } from './types.js';
import { validatePackageJson } from './validatePackageJson.js';

export class TemplateContextBuilder {
  private static instance: TemplateContextBuilder;
  private context: Record<string, any> = {};

  private constructor() {}

  /**
   * Get the singleton instance of TemplateContextBuilder
   */
  public static getInstance(): TemplateContextBuilder {
    if (!TemplateContextBuilder.instance) {
      TemplateContextBuilder.instance = new TemplateContextBuilder();
    }
    return TemplateContextBuilder.instance;
  }

  async build(
    projectPath: string,
    options: Record<string, any> = {}
  ): Promise<Record<string, any>> {
    this.context = {
      ...options,
      projectPath,
      timestamp: new Date().toISOString(),
    };
    return this.context;
  }

  getContext(): Record<string, any> {
    return this.context;
  }

  setValue(key: string, value: any): void {
    this.context[key] = value;
  }

  getValue(key: string): any {
    return this.context[key];
  }

  /**
   * Validates and builds root project context
   */
  async buildRootContext(options: {
    name: string;
    version: string;
    pnpmVersion?: string;
    workspaceGlobs?: string[];
    description?: string;
  }): Promise<Record<string, any>> {
    if (!options.name || !options.version) {
      throw new ValidationError('Root context requires name and version');
    }

    return {
      ...options,
      private: true,
      workspaceGlobs: options.workspaceGlobs || ['packages/*', 'apps/*'],
    };
  }

  /**
   * Validates and builds frontend package context
   */
  async buildFrontendContext(
    options: FrontendOptions
  ): Promise<Record<string, any>> {
    if (
      !options.name ||
      !options.framework?.name ||
      !options.framework?.version
    ) {
      throw new ValidationError(
        'Frontend context requires name and framework configuration'
      );
    }

    return {
      ...options,
    };
  }

  /**
   * Validates and builds backend package context
   */
  async buildBackendContext(
    options: BackendOptions
  ): Promise<Record<string, any>> {
    if (
      !options.name ||
      !options.framework?.name ||
      !options.framework?.version
    ) {
      throw new ValidationError(
        'Backend context requires name and framework configuration'
      );
    }

    return {
      ...options,
    };
  }

  /**
   * Validates and builds package context
   */
  async buildPackageContext(
    options: PackageOptions
  ): Promise<Record<string, any>> {
    if (!options.name || !options.version) {
      throw new ValidationError('Package context requires name and version');
    }

    return {
      ...options,
    };
  }

  /**
   * Validates template data against template metadata requirements
   */
  validateTemplateData(
    data: Record<string, any>,
    requiredFields: string[]
  ): boolean {
    for (const field of requiredFields) {
      if (!data[field]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Gets template metadata (mock implementation for tests)
   */
  getTemplateMetadata(): Record<string, any> {
    return {
      name: 'default-template',
      description: 'Default template',
      requiredFields: ['name', 'version'],
    };
  }
}

export async function validatePackages(pkgPaths: string[]): Promise<boolean> {
  try {
    for (const pkgPath of pkgPaths) {
      const pkgJson = await fs.readFile(
        path.join(process.cwd(), pkgPath),
        'utf-8'
      );
      if (!validatePackageJson(JSON.parse(pkgJson))) {
        return false;
      }
    }
    return true;
  } catch (error) {
    return false;
  }
}
