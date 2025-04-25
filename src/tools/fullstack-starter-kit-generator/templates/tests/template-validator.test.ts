import { describe, it, expect } from 'vitest';

import { TemplateValidator } from '../template-validator.js';

describe('TemplateValidator', () => {
  describe('validateMetadata', () => {
    it('should validate correct metadata', () => {
      const metadata = {
        name: 'test-template',
        version: '1.0.0',
        description: 'Test template',
        type: 'monorepo',
        features: ['typescript', 'react'],
        structure: [
          {
            path: 'src',
            children: [{ path: 'index.ts', content: 'console.log("Hello");' }],
          },
        ],
      };

      const result = TemplateValidator.validateMetadata(metadata);
      expect(result.isValid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject invalid metadata', () => {
      const metadata = {
        name: '', // Invalid: empty name
        version: 'invalid', // Invalid: wrong format
        description: 'Test',
      };

      const result = TemplateValidator.validateMetadata(metadata);
      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });
  });

  describe('validateTemplateData', () => {
    it('should validate correct template data', () => {
      const data = {
        projectName: 'test-project',
        description: 'Test project',
        author: 'Test Author',
        license: 'MIT',
        features: ['typescript', 'react'],
        dependencies: {},
        devDependencies: {},
      };

      const metadata = {
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        type: 'monorepo',
        features: ['typescript'],
        structure: [],
      };

      const result = TemplateValidator.validateTemplateData(data, metadata);
      expect(result.isValid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject data missing required features', () => {
      const data = {
        projectName: 'test-project',
        description: 'Test project',
        author: 'Test Author',
        license: 'MIT',
        features: ['react'],
        dependencies: {},
        devDependencies: {},
      };

      const metadata = {
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        type: 'monorepo',
        features: ['typescript', 'react'],
        structure: [],
      };

      const result = TemplateValidator.validateTemplateData(data, metadata);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required features: typescript');
    });
  });

  describe('validateTemplateSyntax', () => {
    it('should validate correct template syntax', () => {
      const template = `
        {{#if name}}
          Hello {{name}}!
        {{/if}}
        {{#each items}}
          {{this}}
        {{/each}}
      `;

      const result = TemplateValidator.validateTemplateSyntax(template);
      expect(result.isValid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject mismatched handlebars expressions', () => {
      const template = `
        {{#if name}}
          Hello {{name}}!
        {{/if}
      `;

      const result = TemplateValidator.validateTemplateSyntax(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should reject unknown helpers', () => {
      const template = `
        {{#unknownHelper}}
          Content
        {{/unknownHelper}}
      `;

      const result = TemplateValidator.validateTemplateSyntax(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unknown helper: unknownHelper');
    });
  });
});
