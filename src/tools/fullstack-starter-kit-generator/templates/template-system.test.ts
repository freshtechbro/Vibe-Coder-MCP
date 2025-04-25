import { describe, it, expect, vi } from 'vitest';

import { ValidationError } from '../../../utils/errors.js';

import { generateTemplate, validateTemplate } from './template-system.js';

vi.mock('../../../logger.js');

describe('Template System', () => {
  describe('generateTemplate', () => {
    it('should generate content from a template', () => {
      const template = 'Hello {{name}}!';
      const data = { name: 'World' };

      const result = generateTemplate(template, data);
      expect(result).toBe('Hello World!');
    });

    it('should handle nested data', () => {
      const template = '{{user.name}} is {{user.age}} years old';
      const data = {
        user: {
          name: 'John',
          age: 30,
        },
      };

      const result = generateTemplate(template, data);
      expect(result).toBe('John is 30 years old');
    });

    it('should handle the json helper', () => {
      const template = '{{json data}}';
      const data = {
        data: {
          foo: 'bar',
          num: 42,
        },
      };

      const result = generateTemplate(template, data);
      expect(JSON.parse(result)).toEqual(data.data);
    });

    it('should handle the kebabCase helper', () => {
      const template = '{{kebabCase text}}';
      const data = { text: 'MyProjectName' };

      const result = generateTemplate(template, data);
      expect(result).toBe('my-project-name');
    });

    it('should handle the camelCase helper', () => {
      const template = '{{camelCase text}}';
      const data = { text: 'my-project-name' };

      const result = generateTemplate(template, data);
      expect(result).toBe('myProjectName');
    });

    it('should handle the pascalCase helper', () => {
      const template = '{{pascalCase text}}';
      const data = { text: 'my-project-name' };

      const result = generateTemplate(template, data);
      expect(result).toBe('MyProjectName');
    });

    it('should throw ValidationError for invalid templates', () => {
      const template = '{{#each items}}'; // Unclosed block
      const data = { items: [] };

      expect(() => generateTemplate(template, data)).toThrow(ValidationError);
    });

    it('should throw ValidationError for missing data', () => {
      const template = '{{missingVar}}';
      const data = {};

      const result = generateTemplate(template, data);
      expect(result).toBe(''); // Handlebars silently ignores missing vars
    });
  });

  describe('validateTemplate', () => {
    it('should return true for valid templates', () => {
      const template = '{{#if condition}}Yes{{else}}No{{/if}}';
      expect(validateTemplate(template)).toBe(true);
    });

    it('should return false for invalid templates', () => {
      const template = '{{#if condition}}'; // Unclosed block
      expect(validateTemplate(template)).toBe(false);
    });
  });
});
