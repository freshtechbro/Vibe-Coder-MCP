import Handlebars from 'handlebars';
import { z } from 'zod';

import logger from '../../../logger.js';

import { FeatureTemplate } from './smart-stack/analyzer/feature-matcher.js';

export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
}

const templateSchema = z.object({
  name: z.string(),
  description: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      content: z.string(),
    })
  ),
});

const metadataSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'Version must be in format x.y.z'),
  description: z.string().min(1, 'Description is required'),
  type: z.enum(['monorepo', 'standalone']),
  features: z.array(z.string()).min(1, 'At least one feature is required'),
  structure: z
    .array(
      z.object({
        path: z.string(),
        children: z.array(z.any()).optional(),
        content: z.string().optional(),
        template: z.string().optional(),
      })
    )
    .optional(),
});

const templateDataSchema = z.object({
  projectName: z.string().min(1, 'Project name is required'),
  description: z.string(),
  author: z.string().optional(),
  license: z.string().optional(),
  features: z.array(z.string()),
  dependencies: z.record(z.string()).optional(),
  devDependencies: z.record(z.string()).optional(),
});

export class TemplateValidator {
  /**
   * Validates template metadata
   */
  static validateMetadata(metadata: unknown): ValidationResult {
    try {
      metadataSchema.parse(metadata);
      return { isValid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map((e) => e.message),
        };
      }
      return {
        isValid: false,
        errors: ['Unknown validation error'],
      };
    }
  }

  /**
   * Validates template data against metadata requirements
   */
  static validateTemplateData(data: unknown, metadata: any): ValidationResult {
    try {
      // First validate the data structure
      templateDataSchema.parse(data);

      // Then check if all required features are present
      const typedData = data as { features: string[] };
      const typedMetadata = metadata as { features: string[] };

      const missingFeatures = typedMetadata.features.filter(
        (feature) => !typedData.features.includes(feature)
      );

      if (missingFeatures.length > 0) {
        return {
          isValid: false,
          errors: [`Missing required features: ${missingFeatures.join(', ')}`],
        };
      }

      return { isValid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map((e) => e.message),
        };
      }
      return {
        isValid: false,
        errors: ['Unknown validation error'],
      };
    }
  }

  /**
   * Validates Handlebars template syntax
   */
  static validateTemplateSyntax(template: string): ValidationResult {
    try {
      // Try to compile the template
      Handlebars.precompile(template);

      // Check for unknown helpers
      const blockHelperRegex = /\{\{\s*#(\w+)\s*.*?\}\}/g;
      let match;
      const knownHelpers = [
        'if',
        'each',
        'with',
        'unless',
        'json',
        'kebabCase',
        'camelCase',
        'pascalCase',
      ];

      while ((match = blockHelperRegex.exec(template)) !== null) {
        const helperName = match[1];
        if (!knownHelpers.includes(helperName)) {
          return {
            isValid: false,
            errors: [`Unknown helper: ${helperName}`],
          };
        }
      }

      // Check for mismatched blocks
      const openBlocks = (template.match(/\{\{\s*#\w+/g) || []).length;
      const closeBlocks = (template.match(/\{\{\s*\/\w+/g) || []).length;

      if (openBlocks !== closeBlocks) {
        return {
          isValid: false,
          errors: ['Mismatched block expressions'],
        };
      }

      return { isValid: true };
    } catch (error) {
      if (error instanceof Error) {
        // Check for specific error types
        if (error.message.includes('Parse error')) {
          return {
            isValid: false,
            errors: ['Invalid template syntax'],
          };
        }

        return {
          isValid: false,
          errors: [error.message],
        };
      }
      return {
        isValid: false,
        errors: ['Unknown template syntax error'],
      };
    }
  }
}

export function validateTemplateFiles(
  template: FeatureTemplate,
  requiredFiles: string[]
): boolean {
  // Check if all required files are present
  return requiredFiles.every((file) =>
    template.files.some((f) => f.path === file)
  );
}
