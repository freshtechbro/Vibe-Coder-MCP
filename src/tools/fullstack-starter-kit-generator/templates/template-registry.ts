import fs from 'fs/promises';
import path from 'path';

import { z } from 'zod';

import logger from '../../../logger.js';
import { ValidationError } from '../../../utils/errors.js';

export interface Template {
  name: string;
  version: string;
  description: string;
  files: Array<{
    path: string;
    content: string;
    isTemplate?: boolean;
  }>;
  metadata?: Record<string, unknown>;
  content?: string; // Added for test compatibility
  partials?: Record<string, string>; // Added for test compatibility
}

export interface TemplateFile {
  path: string;
  content: string;
  isTemplate?: boolean;
}

// Template validation schema
const templateSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  files: z
    .array(
      z.object({
        path: z.string(),
        content: z.string(),
        isTemplate: z.boolean().optional(),
      })
    )
    .optional()
    .default([]),
  metadata: z.record(z.unknown()).optional().default({}),
});

// The registry stores loaded templates
export const templates = new Map<string, Template>();

export function registerTemplate(template: Template): void {
  templates.set(template.name, template);
}

export function getTemplate(name: string): Template | undefined {
  return templates.get(name);
}

export function getAllTemplates(): Template[] {
  return Array.from(templates.values());
}

/**
 * TemplateRegistry class for managing templates
 */
export class TemplateRegistry {
  private static instance: TemplateRegistry;
  private templatesDir: string;
  private templates: Map<string, Template> = new Map();

  private constructor(templatesDir: string) {
    this.templatesDir = templatesDir;
  }

  /**
   * Get singleton instance of TemplateRegistry
   */
  public static getInstance(templatesDir: string): TemplateRegistry {
    if (!TemplateRegistry.instance) {
      TemplateRegistry.instance = new TemplateRegistry(templatesDir);
    }
    return TemplateRegistry.instance;
  }

  /**
   * Load all templates from the templates directory
   */
  public async loadTemplates(): Promise<void> {
    try {
      const templateDirs = await fs.readdir(this.templatesDir);

      for (const dir of templateDirs) {
        const templatePath = path.join(this.templatesDir, dir);
        const stat = await fs.stat(templatePath);

        if (!stat.isDirectory()) {
          continue;
        }

        try {
          // Load and parse template.json
          const templateJsonPath = path.join(templatePath, 'template.json');
          const templateData = await fs.readFile(templateJsonPath, 'utf-8');
          const templateJson = JSON.parse(templateData);

          // Validate template data
          const validatedTemplate = templateSchema.safeParse(templateJson);
          if (!validatedTemplate.success) {
            logger.warn(
              `Invalid template.json in ${dir}: ${validatedTemplate.error.message}`
            );
            continue;
          }

          // Load template files
          const template = validatedTemplate.data as Template;
          const files = await this.loadTemplateFiles(templatePath);
          template.files = files;

          // Register template
          this.templates.set(template.name, template);
        } catch (error) {
          logger.error(
            { err: error, templateDir: dir },
            'Error loading template'
          );
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Error loading templates');
    }
  }

  /**
   * Load files from template directory
   */
  private async loadTemplateFiles(
    templatePath: string
  ): Promise<TemplateFile[]> {
    const files: TemplateFile[] = [];
    try {
      const entries = await fs.readdir(path.join(templatePath, 'files'));

      for (const entry of entries) {
        const filePath = path.join(templatePath, 'files', entry);
        const stat = await fs.stat(filePath);

        if (stat.isFile()) {
          const content = await fs.readFile(filePath, 'utf-8');
          files.push({
            path: entry,
            content,
            isTemplate: entry.endsWith('.hbs'),
          });
        }
      }
    } catch (error) {
      // Directory might not exist
      logger.debug(
        { err: error, templatePath },
        'Error loading template files'
      );
    }

    return files;
  }

  /**
   * Get list of available template names
   */
  public getAvailableTemplates(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Get a specific template by name
   */
  public async getTemplate(name: string): Promise<Template> {
    const template = this.templates.get(name);
    if (!template) {
      throw new ValidationError(`Template '${name}' not found`);
    }
    return template;
  }

  /**
   * Validate template data against template schema
   */
  public validateTemplate(
    templateName: string,
    data: Record<string, unknown>
  ): {
    isValid: boolean;
    errors: string[];
  } {
    const template = this.templates.get(templateName);
    if (!template) {
      return {
        isValid: false,
        errors: [`Template '${templateName}' not found`],
      };
    }

    // Implement validation logic against template schema
    // For this implementation, just checking if required fields exist
    const errors: string[] = [];
    const requiredFields = ['projectName', 'version']; // Example

    for (const field of requiredFields) {
      if (!data[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
