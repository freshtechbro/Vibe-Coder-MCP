import { z } from 'zod';

export interface DirectoryStructure {
  root: Record<string, Record<string, unknown>>;
}

export interface PackageConfig {
  name: string;
  description: string;
  dependencies: string[];
  devDependencies: string[];
  scripts: Record<string, string>;
}

export interface TemplateData {
  name: string;
  description: string;
  features: string[];
  dependencies: string[];
  devDependencies: string[];
  scripts: Record<string, string>;
}

export interface TemplateContext {
  data: TemplateData;
  schema: z.ZodSchema;
  validate: (data: unknown) => TemplateData;
}

export interface TemplateResult {
  content: string;
  path: string;
  type: 'file' | 'directory';
}

export interface GeneratorConfig {
  templates: Record<string, TemplateContext>;
  outputDir: string;
  validate: (data: unknown) => boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface GenerationResult {
  success: boolean;
  files: TemplateResult[];
  errors: string[];
}
