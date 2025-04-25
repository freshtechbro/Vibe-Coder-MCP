import { CategoryTemplate } from './category-templates.js';

/**
 * Creates a custom category template from user specifications
 */
export function createCustomTemplate(
  id: string,
  name: string,
  description: string,
  sections: Array<{
    title: string;
    description: string;
    ruleTypes: string[];
    required?: boolean;
  }>,
  defaultRules?: string[],
  validationRules?: string[]
): CategoryTemplate {
  return {
    id,
    name,
    description,
    sections: sections.map((section) => ({
      title: section.title,
      description: section.description,
      ruleTypes: section.ruleTypes,
      required: section.required ?? false,
    })),
    defaultRules: defaultRules || [],
    validationRules: validationRules || [],
  };
}

/**
 * Enhances rule generation with user-specific requirements
 */
export function enhanceWithUserRequirements(
  template: CategoryTemplate,
  requirements: {
    specificPatterns?: string[];
    additionalValidation?: string[];
    priorityAreas?: string[];
    constraints?: Record<string, unknown>;
  }
): CategoryTemplate {
  return {
    ...template,
    sections: [
      ...template.sections,
      ...(requirements.priorityAreas?.map((area) => ({
        title: area,
        description: `User-specified priority area: ${area}`,
        required: true,
        ruleTypes: ['user-specified', area.toLowerCase()],
      })) || []),
    ],
    validationRules: [
      ...template.validationRules,
      ...(requirements.additionalValidation || []),
    ],
    defaultRules: [
      ...template.defaultRules,
      ...(requirements.specificPatterns?.map(
        (pattern) => `enforce-${pattern.toLowerCase().replace(/\s+/g, '-')}`
      ) || []),
    ],
  };
}
