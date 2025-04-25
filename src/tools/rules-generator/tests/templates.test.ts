import { describe, it, expect, beforeEach } from 'vitest';

import { RuleCategory as BaseRuleCategory } from '../formats/index.js';
import {
  CategoryTemplateRegistry,
  CategoryTemplate,
} from '../templates/category-templates.js';
import {
  createCustomTemplate,
  enhanceWithUserRequirements,
} from '../templates/custom-template.js';

// Extended interface for testing purposes to match what CategoryTemplateRegistry.createCategory returns
interface ExtendedRuleCategory extends BaseRuleCategory {
  id?: string;
  metadata?: {
    dependencies?: string[];
    tags?: string[];
  };
  validation?: {
    requiredFields?: string[];
  };
  rules: Array<{
    name: string;
    description: string;
    metadata: {
      tags: string[];
      section?: string;
    };
    // Additional properties used in tests
    title?: string;
    category?: { primary: string };
    semantics?: any;
    patterns?: any;
    implementation?: any;
    validation?: any;
    version?: any;
    changeHistory?: any[];
  }>;
}

describe('Template System', () => {
  let registry: CategoryTemplateRegistry;

  beforeEach(() => {
    // Reset singleton for tests
    // @ts-expect-error - accessing private property for testing
    CategoryTemplateRegistry.instance = undefined;
    registry = CategoryTemplateRegistry.getInstance();
  });

  describe('CategoryTemplateRegistry', () => {
    it('should provide default templates', () => {
      const templates = registry.getAllTemplates();
      expect(templates).toHaveLength(3); // development, security, performance
      // Cast the templates to the CategoryTemplate type which has the id property
      const templateIds = templates.map((t: CategoryTemplate) => t.id);
      expect(templateIds).toContain('development');
      expect(templateIds).toContain('security');
      expect(templateIds).toContain('performance');
    });

    it('should create category from template', () => {
      const category = registry.createCategory(
        'development'
      ) as ExtendedRuleCategory;
      expect(category.id).toBe('category-development');
      expect(category.rules).toHaveLength(0);
      expect(category.metadata?.dependencies).toBeDefined();
      expect(category.validation?.requiredFields).toContain('patterns');
    });

    it('should validate category against template', () => {
      const category: ExtendedRuleCategory = {
        name: 'Development',
        description: 'Test category',
        rules: [
          {
            name: 'Use Consistent Naming',
            title: 'Use Consistent Naming',
            description: 'Test rule',
            category: { primary: 'category-development' },
            semantics: {
              intent: 'test',
              context: 'test',
              impact: 'test',
            },
            patterns: {},
            implementation: { steps: [] },
            validation: { criteria: [] },
            metadata: {
              tags: ['naming'],
              section: 'global',
            },
            version: {
              major: 1,
              minor: 0,
              patch: 0,
              date: '2024-01-01',
              changes: ['Initial version'],
            },
            changeHistory: [],
          },
        ],
      };

      const errors = registry.validateAgainstTemplate(category, 'development');
      expect(errors).toHaveLength(0);
    });

    it('should detect missing required sections', () => {
      const category: ExtendedRuleCategory = {
        name: 'Development',
        description: 'Test category',
        rules: [], // No rules = missing required sections
      };

      const errors = registry.validateAgainstTemplate(category, 'development');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('Missing required section');
    });
  });

  describe('Custom Templates', () => {
    it('should create custom template', () => {
      const template = createCustomTemplate(
        'custom',
        'Custom Category',
        'Custom description',
        [
          {
            title: 'Custom Section',
            description: 'Test section',
            ruleTypes: ['custom-type'],
            required: true,
          },
        ],
        ['custom-rule'],
        ['must-follow-custom']
      );

      expect(template.id).toBe('custom');
      expect(template.sections[0].ruleTypes).toContain('custom-type');
      expect(template.defaultRules).toContain('custom-rule');
      expect(template.validationRules).toContain('must-follow-custom');
    });

    it('should enhance template with user requirements', () => {
      const template = createCustomTemplate(
        'custom',
        'Custom Category',
        'Custom description',
        [{ title: 'Base Section', description: 'Base', ruleTypes: ['base'] }]
      );

      const enhanced = enhanceWithUserRequirements(template, {
        priorityAreas: ['Security'],
        additionalValidation: ['must-be-secure'],
        specificPatterns: ['secure-pattern'],
      });

      expect(enhanced.sections.length).toBe(2); // Base + Security
      expect(enhanced.validationRules).toContain('must-be-secure');
      expect(enhanced.defaultRules).toContain('enforce-secure-pattern');
    });

    it('should register and validate custom template', () => {
      const template = createCustomTemplate(
        'custom',
        'Custom Category',
        'Custom description',
        [
          {
            title: 'Required Section',
            description: 'Must have this',
            ruleTypes: ['required-type'],
            required: true,
          },
        ]
      );

      registry.registerTemplate(template);

      const category = registry.createCategory(
        'custom'
      ) as ExtendedRuleCategory;
      expect(category.id).toBe('category-custom');

      const errors = registry.validateAgainstTemplate(category, 'custom');
      expect(errors).toContain('Missing required section: Required Section');
    });
  });
});
