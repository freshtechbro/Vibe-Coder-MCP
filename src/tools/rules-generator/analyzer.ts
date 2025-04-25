import logger from '../../logger.js';

import { Rule, RuleCategory } from './types.js';

interface RuleTemplate {
  name: string;
  description: string;
  semantics: {
    intent: string;
    context: string;
    impact: string;
  };
}

interface RuleRequirements {
  [key: string]: unknown;
}

export function createCustomTemplate(
  name: string,
  description: string
): RuleTemplate {
  return {
    name,
    description,
    semantics: {
      intent: description,
      context: 'Custom rule template',
      impact: 'Project-specific requirements',
    },
  };
}

export function enhanceWithUserRequirements(
  rule: Rule,
  requirements: RuleRequirements
): Rule {
  return {
    ...rule,
    semantics: {
      ...rule.semantics,
      context: `${rule.semantics.context}\nUser requirements: ${JSON.stringify(requirements)}`,
    },
  };
}

export function analyzeRuleCategory(rule: Rule): RuleCategory {
  try {
    // Simple category analysis based on rule content
    const { name, semantics } = rule;
    const content =
      `${name} ${semantics.intent} ${semantics.context} ${semantics.impact}`.toLowerCase();

    if (
      content.includes('test') ||
      content.includes('coverage') ||
      content.includes('quality')
    ) {
      return RuleCategory.Development;
    }
    if (
      content.includes('document') ||
      content.includes('comment') ||
      content.includes('readme')
    ) {
      return RuleCategory.Documentation;
    }
    if (
      content.includes('workflow') ||
      content.includes('process') ||
      content.includes('procedure')
    ) {
      return RuleCategory.Process;
    }

    return RuleCategory.Custom;
  } catch (error) {
    logger.error({ err: error, rule }, 'Failed to analyze rule category');
    return RuleCategory.Custom;
  }
}

export function validateRule(rule: Rule): boolean {
  try {
    // Basic validation
    if (!rule.name || !rule.semantics) {
      return false;
    }

    const { intent, context, impact } = rule.semantics;
    if (!intent || !context || !impact) {
      return false;
    }

    // Validate examples if present
    if (rule.examples?.length) {
      for (const example of rule.examples) {
        if (example.code && !example.description) {
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    logger.error({ err: error, rule }, 'Rule validation failed');
    return false;
  }
}
