import fs from 'fs/promises';
import path from 'path';

import logger from '../../../logger.js';
import { ValidationError } from '../../../utils/errors.js';

import { Template } from './template-registry.js';

// Cache for loaded templates
const templateCache = new Map<string, Template>();

/**
 * Load a template from the given path.
 *
 * @param templatePath The path to the template directory.
 * @returns The loaded template.
 */
export async function loadTemplate(templatePath: string): Promise<Template> {
  // Check cache first
  if (templateCache.has(templatePath)) {
    return templateCache.get(templatePath)!;
  }

  let content: string | undefined;
  try {
    content = await fs.readFile(
      path.join(templatePath, 'template.json'),
      'utf-8'
    );
    const template = JSON.parse(content) as Template;

    // Load all template files
    const files = await loadTemplateFiles(templatePath);
    template.files = files;

    // Cache the template
    templateCache.set(templatePath, template);

    return template;
  } catch (error) {
    logger.error({ err: error, templatePath }, 'Failed to load template');
    if (error instanceof SyntaxError && content !== undefined) {
      throw new ValidationError(
        `Invalid JSON in template metadata file (${path.join(templatePath, 'template.json')}): ${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Clear the template cache.
 */
export function clearTemplateCache(): void {
  templateCache.clear();
}

/**
 * Load all template files from the given template path.
 *
 * @param templatePath The path to the template directory.
 * @returns An array of template files.
 */
async function loadTemplateFiles(
  templatePath: string
): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];

  async function scanDirectory(
    dirPath: string,
    basePath: string = ''
  ): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.join(basePath, entry.name);

      if (entry.isFile() && !entry.name.endsWith('.gitkeep')) {
        const content = await fs.readFile(fullPath, 'utf-8');
        files.push({ path: relativePath, content });
      } else if (entry.isDirectory()) {
        await scanDirectory(fullPath, relativePath);
      }
    }
  }

  await scanDirectory(path.join(templatePath, 'files'));
  return files;
}

/**
 * Get all available templates from the given directory.
 *
 * @param templatesDir The directory containing the templates.
 * @returns An array of available templates.
 */
export async function getAvailableTemplates(
  templatesDir: string
): Promise<Template[]> {
  try {
    const templates: Template[] = [];
    const entries = await fs.readdir(templatesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const templatePath = path.join(templatesDir, entry.name);
          const template = await loadTemplate(templatePath);
          templates.push(template);
        } catch (error) {
          logger.warn(
            { err: error, template: entry.name },
            'Failed to load template, skipping'
          );
        }
      }
    }

    return templates;
  } catch (error) {
    logger.error(
      { err: error, templatesDir },
      'Failed to get available templates'
    );
    throw error;
  }
}
