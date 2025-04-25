import { RuleTemplate, RuleCategory } from '../types.js';

/**
 * Development rules template
 */
export const developmentTemplate: RuleTemplate = {
  name: 'development',
  description: 'Rules for development practices and standards',
  format: 'markdown',
  sections: [
    {
      title: 'Code Style',
      description: 'Standards for code formatting and style',
      required: true,
      subsections: [
        {
          title: 'Formatting',
          description: 'Code formatting rules',
          required: true,
        },
        {
          title: 'Naming Conventions',
          description: 'Rules for naming variables, functions, etc.',
          required: true,
        },
      ],
    },
    {
      title: 'Architecture',
      description: 'Architectural principles and patterns',
      required: true,
    },
    {
      title: 'Testing',
      description: 'Testing requirements and practices',
      required: true,
    },
    {
      title: 'Security',
      description: 'Security practices and requirements',
      required: true,
    },
    {
      title: 'Performance',
      description: 'Performance optimization rules',
      required: true,
    },
  ],
  variables: [
    {
      name: 'language',
      description: 'Primary programming language',
      type: 'string',
      required: true,
    },
    {
      name: 'framework',
      description: 'Primary framework used',
      type: 'string',
      required: false,
    },
  ],
};

/**
 * Documentation rules template
 */
export const documentationTemplate: RuleTemplate = {
  name: 'documentation',
  description: 'Rules for documentation standards',
  format: 'markdown',
  sections: [
    {
      title: 'API Documentation',
      description: 'Standards for API documentation',
      required: true,
    },
    {
      title: 'Code Comments',
      description: 'Rules for code commenting',
      required: true,
    },
    {
      title: 'Project Documentation',
      description: 'Requirements for project documentation',
      required: true,
    },
  ],
  variables: [
    {
      name: 'docStyle',
      description: 'Documentation style guide to follow',
      type: 'string',
      required: false,
      default: 'JSDoc',
    },
  ],
};

/**
 * Process rules template
 */
export const processTemplate: RuleTemplate = {
  name: 'process',
  description: 'Rules for development processes',
  format: 'markdown',
  sections: [
    {
      title: 'Git Workflow',
      description: 'Git branching and commit standards',
      required: true,
    },
    {
      title: 'Code Review',
      description: 'Code review process and requirements',
      required: true,
    },
    {
      title: 'CI/CD',
      description: 'Continuous integration and deployment rules',
      required: true,
    },
    {
      title: 'Release Management',
      description: 'Release process and versioning rules',
      required: true,
    },
  ],
  variables: [
    {
      name: 'branchingStrategy',
      description: 'Git branching strategy',
      type: 'string',
      required: false,
      default: 'GitFlow',
    },
  ],
};

/**
 * Template registry for managing rule templates
 */
export class TemplateRegistry {
  private static instance: TemplateRegistry;
  private templates: Map<string, RuleTemplate>;

  private constructor() {
    this.templates = new Map();
    this.registerDefaultTemplates();
  }

  public static getInstance(): TemplateRegistry {
    if (!TemplateRegistry.instance) {
      TemplateRegistry.instance = new TemplateRegistry();
    }
    return TemplateRegistry.instance;
  }

  private registerDefaultTemplates() {
    this.templates.set(RuleCategory.Development, developmentTemplate);
    this.templates.set(RuleCategory.Documentation, documentationTemplate);
    this.templates.set(RuleCategory.Process, processTemplate);
  }

  public getTemplate(category: string): RuleTemplate | undefined {
    return this.templates.get(category);
  }

  public registerTemplate(category: string, template: RuleTemplate): void {
    this.templates.set(category, template);
  }

  public getAllTemplates(): Map<string, RuleTemplate> {
    return new Map(this.templates);
  }
}
