import Handlebars from 'handlebars';
import { z } from 'zod';

import logger from '../../../logger.js';
import { ValidationError } from '../../../utils/errors.js';

// Register custom helpers
Handlebars.registerHelper('json', function (context) {
  return new Handlebars.SafeString(JSON.stringify(context, null, 2));
});

Handlebars.registerHelper('kebabCase', function (str: string) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
});

Handlebars.registerHelper('camelCase', function (str: string) {
  return str.replace(/[-_\s]+(.)?/g, (_match: string, c?: string) =>
    c ? c.toUpperCase() : ''
  );
});

Handlebars.registerHelper('pascalCase', function (str: string) {
  const camel = Handlebars.helpers.camelCase(str) as string;
  return camel.charAt(0).toUpperCase() + camel.slice(1);
});

/**
 * Generates content from a template using Handlebars
 */
export function generateTemplateContent(
  template: string,
  data: Record<string, unknown>
): string {
  try {
    // Compile template
    const compiled = Handlebars.compile(template);

    // Execute template with data
    return compiled(data);
  } catch (error) {
    logger.error({ err: error, template }, 'Template generation failed');
    throw new ValidationError('Template generation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Validates that a template can be compiled
 */
export function validateTemplate(template: string): boolean {
  // Handlebars doesn't always throw for invalid templates, so we need to check manually
  if (template.includes('{{#if') && !template.includes('{{/if}}')) {
    return false;
  }
  if (template.includes('{{#each') && !template.includes('{{/each}}')) {
    return false;
  }
  if (template.includes('{{#with') && !template.includes('{{/with}}')) {
    return false;
  }

  try {
    // Try to compile the template
    Handlebars.compile(template);
    return true;
  } catch (error) {
    return false;
  }
}

export interface TemplateOptions {
  name: string;
  description: string;
  features: string[];
}

const configSchema = z.object({
  name: z.string(),
  description: z.string(),
  features: z.array(z.string()),
});

function toCamelCase(str: string): string {
  return str.replace(/[-_\s]+(.)?/g, (_match: string, char?: string) =>
    char ? char.toUpperCase() : ''
  );
}

// This function is used in the test file
export function generateTemplate(
  template: string,
  data: Record<string, unknown>
): string {
  return generateTemplateContent(template, data);
}

// This function is used for template generation
export async function generateTemplateFiles(
  options: TemplateOptions
): Promise<Array<{ path: string; content: string }>> {
  try {
    const validatedOptions = configSchema.parse(options);
    const files: Array<{ path: string; content: string }> = [];

    // Add base files
    files.push({
      path: 'package.json',
      content: JSON.stringify(
        {
          name: validatedOptions.name,
          description: validatedOptions.description,
          version: '0.1.0',
          private: true,
          scripts: {
            build: 'tsc',
            test: 'vitest',
            lint: 'eslint .',
          },
        },
        null,
        2
      ),
    });

    return files;
  } catch (error) {
    throw new Error(`Template generation failed: ${error}`);
  }
}
