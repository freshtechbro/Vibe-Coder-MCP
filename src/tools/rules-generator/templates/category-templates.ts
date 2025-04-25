import { RuleCategory } from '../formats/index.js';

/**
 * Base template for a rule category
 */
export interface CategoryTemplate {
  id: string;
  name: string;
  description: string;
  sections: CategorySection[];
  defaultRules: string[];
  validationRules: string[];
}

/**
 * Section within a category template
 */
interface CategorySection {
  title: string;
  description: string;
  required: boolean;
  ruleTypes: string[];
}

/**
 * Development category template
 */
export const developmentTemplate: CategoryTemplate = {
  id: 'development',
  name: 'Development',
  description: 'Core development practices and standards',
  sections: [
    {
      title: 'Code Style',
      description: 'Coding standards and formatting rules',
      required: true,
      ruleTypes: ['naming', 'formatting', 'organization'],
    },
    {
      title: 'Architecture',
      description: 'Architectural patterns and principles',
      required: true,
      ruleTypes: ['patterns', 'structure', 'dependencies'],
    },
    {
      title: 'Testing',
      description: 'Testing practices and requirements',
      required: true,
      ruleTypes: ['unit', 'integration', 'e2e'],
    },
  ],
  defaultRules: [
    'consistent-naming',
    'code-formatting',
    'error-handling',
    'dependency-management',
  ],
  validationRules: [
    'must-have-tests',
    'must-follow-architecture',
    'must-handle-errors',
  ],
};

/**
 * Security category template
 */
export const securityTemplate: CategoryTemplate = {
  id: 'security',
  name: 'Security',
  description: 'Security practices and requirements',
  sections: [
    {
      title: 'Authentication',
      description: 'User authentication and session management',
      required: true,
      ruleTypes: ['auth-flow', 'session-management', 'token-handling'],
    },
    {
      title: 'Data Protection',
      description: 'Data encryption and protection measures',
      required: true,
      ruleTypes: ['encryption', 'storage', 'transmission'],
    },
    {
      title: 'Access Control',
      description: 'Authorization and access management',
      required: true,
      ruleTypes: ['rbac', 'permissions', 'validation'],
    },
  ],
  defaultRules: [
    'secure-authentication',
    'data-encryption',
    'input-validation',
    'access-control',
  ],
  validationRules: [
    'must-encrypt-sensitive-data',
    'must-validate-input',
    'must-implement-auth',
  ],
};

/**
 * Performance category template
 */
export const performanceTemplate: CategoryTemplate = {
  id: 'performance',
  name: 'Performance',
  description: 'Performance optimization rules',
  sections: [
    {
      title: 'Resource Management',
      description: 'CPU and memory optimization',
      required: true,
      ruleTypes: ['memory', 'cpu', 'battery'],
    },
    {
      title: 'Network',
      description: 'Network performance optimization',
      required: true,
      ruleTypes: ['caching', 'compression', 'offline'],
    },
    {
      title: 'UI Performance',
      description: 'UI rendering and interaction optimization',
      required: true,
      ruleTypes: ['rendering', 'animation', 'interaction'],
    },
  ],
  defaultRules: [
    'optimize-resources',
    'implement-caching',
    'lazy-loading',
    'compression',
  ],
  validationRules: [
    'must-implement-caching',
    'must-optimize-images',
    'must-handle-offline',
  ],
};

/**
 * Template registry for managing category templates
 */
export class CategoryTemplateRegistry {
  private static instance: CategoryTemplateRegistry;
  private templates: Map<string, CategoryTemplate>;

  private constructor() {
    this.templates = new Map();
    this.registerDefaultTemplates();
  }

  public static getInstance(): CategoryTemplateRegistry {
    if (!CategoryTemplateRegistry.instance) {
      CategoryTemplateRegistry.instance = new CategoryTemplateRegistry();
    }
    return CategoryTemplateRegistry.instance;
  }

  private registerDefaultTemplates(): void {
    this.templates.set('development', developmentTemplate);
    this.templates.set('security', securityTemplate);
    this.templates.set('performance', performanceTemplate);
  }

  public getTemplate(category: string): CategoryTemplate | undefined {
    return this.templates.get(category.toLowerCase());
  }

  public registerTemplate(template: CategoryTemplate): void {
    this.templates.set(template.id.toLowerCase(), template);
  }

  public getAllTemplates(): CategoryTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Creates a category instance from a template
   */
  public createCategory(
    templateId: string,
    customization?: Partial<RuleCategory>
  ): RuleCategory {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Create a category with the required fields from the RuleCategory interface
    const category: RuleCategory = {
      name: template.name,
      description: template.description,
      rules: [],
    };

    // Add any custom fields
    return { ...category, ...customization };
  }

  /**
   * Validates if a category follows its template
   */
  public validateAgainstTemplate(
    category: RuleCategory,
    templateId: string
  ): string[] {
    const template = this.getTemplate(templateId);
    if (!template) {
      return ['Template not found for category'];
    }

    const errors: string[] = [];

    // Check required sections
    template.sections
      .filter((section) => section.required)
      .forEach((section) => {
        const hasSection = category.rules.some(
          (rule) =>
            rule.name.toLowerCase().includes(section.title.toLowerCase()) ||
            rule.metadata.tags.some((tag) =>
              section.ruleTypes.includes(tag.toLowerCase())
            )
        );
        if (!hasSection) {
          errors.push(`Missing required section: ${section.title}`);
        }
      });

    // Check required rules
    template.defaultRules.forEach((ruleId) => {
      const hasRule = category.rules.some((rule) =>
        rule.name.toLowerCase().includes(ruleId.toLowerCase())
      );
      if (!hasRule) {
        errors.push(`Missing default rule: ${ruleId}`);
      }
    });

    return errors;
  }
}

export function validateCategory(
  category: RuleCategory,
  section: string
): boolean {
  // Check if any rule in the category has the specified section
  const hasSection = category.rules.some(
    (rule) => rule.metadata.section === section
  );

  // Check if any rule has a tag matching the section
  const hasTag = category.rules.some((rule) =>
    rule.metadata.tags.some((tag) => tag === section)
  );

  return hasSection || hasTag;
}

export function validateRule(
  category: RuleCategory,
  ruleName: string
): boolean {
  // Check if the category has a rule with the specified name
  const hasRule = category.rules.some((rule) => rule.name === ruleName);

  return hasRule;
}
