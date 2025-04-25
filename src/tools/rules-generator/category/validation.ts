import logger from '../../../logger.js';
import { Rule, RuleCategory } from '../types.js';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

interface ValidationContext {
  category: RuleCategory;
  rule: Rule;
}

export function validateCategory(
  category: RuleCategory,
  rule: Rule
): ValidationResult {
  const errors: string[] = [];
  const context: ValidationContext = { category, rule };

  try {
    switch (category) {
      case RuleCategory.Development:
        validateDevelopmentRule(rule, errors);
        break;
      case RuleCategory.Documentation:
        validateDocumentationRule(rule, errors);
        break;
      case RuleCategory.Process:
        validateProcessRule(rule, errors);
        break;
      case RuleCategory.Custom:
        validateCustomRule(rule, errors);
        break;
      default:
        errors.push(`Unknown category: ${category}`);
    }
  } catch (error) {
    logger.error({ err: error, context }, 'Category validation failed');
    errors.push(
      `Validation error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function validateDevelopmentRule(rule: Rule, errors: string[]): void {
  if (!rule.filePatterns?.length) {
    errors.push('Development rules must specify file patterns');
  }
  if (!rule.examples?.length) {
    errors.push('Development rules must include examples');
  }
}

function validateDocumentationRule(rule: Rule, errors: string[]): void {
  if (!rule.rationale) {
    errors.push('Documentation rules must include rationale');
  }
}

function validateProcessRule(rule: Rule, errors: string[]): void {
  if (!rule.applicability) {
    errors.push('Process rules must specify applicability');
  }
}

function validateCustomRule(rule: Rule, errors: string[]): void {
  if (!rule.semantics.context) {
    errors.push('Custom rules must provide context');
  }
}
