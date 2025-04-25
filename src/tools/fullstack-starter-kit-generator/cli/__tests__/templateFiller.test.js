import fs from 'fs/promises';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { ValidationError } from '../../../../utils/errors.js';
import {
  fillTemplate,
  registerPartial,
  TemplateError,
} from '../templateFiller.js';

vi.mock('fs/promises');

describe('templateFiller', () => {
  const mockTemplateContent = `{
    "name": "{{name}}",
    "version": "{{version}}",
    {{#if dependencies}}
    "dependencies": {{{json dependencies}}}
    {{/if}}
  }`;

  const mockPartialContent = `"author": "{{author}}"`;

  beforeEach(() => {
    // Reset all mocks
    vi.resetAllMocks();

    // Mock fs.readFile for templates
    fs.readFile.mockImplementation((path) => {
      if (path.includes('package.json.hbs')) {
        return Promise.resolve(mockTemplateContent);
      }
      if (path.includes('author.hbs')) {
        return Promise.resolve(mockPartialContent);
      }
      return Promise.reject(new Error('File not found'));
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fillTemplate', () => {
    it('should successfully fill a template with valid data', async () => {
      const templatePath = '/templates/package.json.hbs';
      const data = {
        name: 'test-project',
        version: '1.0.0',
      };

      const result = await fillTemplate(templatePath, data);
      expect(result).toContain('"name": "test-project"');
      expect(result).toContain('"version": "1.0.0"');
    });

    it('should handle conditional blocks correctly', async () => {
      const templatePath = '/templates/package.json.hbs';
      const data = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          express: '^4.17.1',
        },
      };

      const result = await fillTemplate(templatePath, data);
      expect(result).toContain('"dependencies":');
      expect(result).toContain('"express": "^4.17.1"');
    });

    it('should throw ValidationError for missing required fields in strict mode', async () => {
      const templatePath = '/templates/package.json.hbs';
      const data = { name: 'test-project' }; // Missing version

      await expect(fillTemplate(templatePath, data)).rejects.toThrow(
        ValidationError
      );
    });

    it('should allow missing fields in non-strict mode', async () => {
      const templatePath = '/templates/package.json.hbs';
      const data = { name: 'test-project' }; // Missing version

      const result = await fillTemplate(templatePath, data, { strict: false });
      expect(result).toContain('"name": "test-project"');
      expect(result).toContain('"version": ""');
    });

    it('should throw TemplateError for invalid template syntax', async () => {
      fs.readFile.mockResolvedValueOnce('{{invalid{{syntax}}');
      const templatePath = '/templates/invalid.hbs';
      const data = { test: 'value' };

      await expect(fillTemplate(templatePath, data)).rejects.toThrow(
        TemplateError
      );
    });
  });

  describe('Handlebars Helpers', () => {
    it('should handle json helper correctly', async () => {
      const templatePath = '/templates/package.json.hbs';
      const data = {
        name: 'test',
        version: '1.0.0',
        dependencies: { express: '^4.17.1' },
      };

      const result = await fillTemplate(templatePath, data);
      expect(result).toContain('"express": "^4.17.1"');
    });

    it('should handle kebabCase helper correctly', async () => {
      fs.readFile.mockResolvedValueOnce('{{kebabCase text}}');
      const templatePath = '/templates/test.hbs';
      const data = { text: 'TestProject Name' };

      const result = await fillTemplate(templatePath, data, { strict: false });
      expect(result).toBe('test-project-name');
    });

    it('should handle ifEquals helper correctly', async () => {
      fs.readFile.mockResolvedValueOnce(
        '{{#ifEquals type "npm"}}NPM{{else}}Other{{/ifEquals}}'
      );
      const templatePath = '/templates/test.hbs';

      const result1 = await fillTemplate(
        templatePath,
        { type: 'npm' },
        { strict: false }
      );
      expect(result1).toBe('NPM');

      const result2 = await fillTemplate(
        templatePath,
        { type: 'yarn' },
        { strict: false }
      );
      expect(result2).toBe('Other');
    });
  });

  describe('registerPartial', () => {
    it('should successfully register a partial template', async () => {
      const partialPath = '/templates/author.hbs';
      await expect(
        registerPartial('author', partialPath)
      ).resolves.not.toThrow();
    });

    it('should throw TemplateError when partial file is not found', async () => {
      fs.readFile.mockRejectedValueOnce(new Error('File not found'));
      const partialPath = '/templates/nonexistent.hbs';

      await expect(registerPartial('test', partialPath)).rejects.toThrow(
        TemplateError
      );
    });
  });
});
