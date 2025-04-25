import { readFileSync } from 'fs';
import path from 'path';

import { z } from 'zod';

import logger from '../../../logger.js';

export class TemplateRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateRegistryError';
  }
}

export const templateMetadataSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string().optional(),
  license: z.string().optional(),
  dependencies: z.record(z.string()).optional(),
  devDependencies: z.record(z.string()).optional(),
  features: z.array(z.string()).optional(),
  techStack: z
    .object({
      frontend: z.string().optional(),
      backend: z.string().optional(),
      database: z.string().optional(),
      testing: z.string().optional(),
      deployment: z.string().optional(),
    })
    .optional(),
});

export type TemplateMetadata = z.infer<typeof templateMetadataSchema>;

interface Template {
  name: string;
  version: string;
  description: string;
  metadata: TemplateMetadata;
  files: Array<{
    path: string;
    content: string;
  }>;
}

export class TemplateRegistry {
  private static instance: TemplateRegistry | null = null;
  private templates: Map<string, Template> = new Map();
  private templatesDir: string = '';

  private constructor() {}

  public static getInstance(): TemplateRegistry {
    if (!TemplateRegistry.instance) {
      TemplateRegistry.instance = new TemplateRegistry();
    }
    return TemplateRegistry.instance;
  }

  async initialize(templatesDir: string): Promise<void> {
    this.templatesDir = templatesDir;
    // Add initialization logic here if needed
  }

  async loadTemplate(templateName: string): Promise<Template> {
    try {
      const templatePath = path.join(this.templatesDir, templateName);
      const templateJson = readFileSync(
        path.join(templatePath, 'template.json'),
        'utf-8'
      );
      const templateData = JSON.parse(templateJson);

      // Validate metadata
      const metadata = templateMetadataSchema.parse(templateData.metadata);

      // Load files
      const files = await Promise.all(
        templateData.files.map(async (file: { path: string }) => ({
          path: file.path,
          content: readFileSync(path.join(templatePath, file.path), 'utf-8'),
        }))
      );

      const template: Template = {
        name: templateData.name,
        version: templateData.version,
        description: templateData.description,
        metadata,
        files,
      };

      this.templates.set(templateName, template);
      return template;
    } catch (error) {
      logger.error({ err: error, templateName }, 'Failed to load template');
      throw error;
    }
  }

  getTemplate(templateName: string): Template | undefined {
    return this.templates.get(templateName);
  }

  getAllTemplates(): Template[] {
    return Array.from(this.templates.values());
  }

  getTemplateMetadata(templateName: string): TemplateMetadata {
    const template = this.getTemplate(templateName);
    if (!template) {
      throw new TemplateRegistryError(`Template ${templateName} not found`);
    }
    return template.metadata;
  }

  getTemplatePath(templateName: string): string {
    if (!this.getTemplate(templateName)) {
      throw new TemplateRegistryError(`Template ${templateName} not found`);
    }
    return path.join(this.templatesDir, templateName);
  }

  listTemplates(): Template[] {
    return this.getAllTemplates();
  }

  validateTemplateData(
    templateName: string,
    data: Record<string, any>
  ): boolean {
    // Implement basic validation logic based on template metadata
    return true;
  }
}
