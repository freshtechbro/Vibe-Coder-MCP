import { z } from 'zod';

/**
 * Defines the structure of a rule template
 */
export interface RuleTemplate {
  name: string;
  description: string;
  sections: RuleSection[];
  variables: RuleVariable[];
  format: RuleFormat;
}

/**
 * Defines a section within a rule template
 */
export interface RuleSection {
  title: string;
  description: string;
  required: boolean;
  subsections?: RuleSection[];
}

/**
 * Defines a variable that can be used in templates
 */
export interface RuleVariable {
  name: string;
  description: string;
  type: 'string' | 'boolean' | 'number' | 'array';
  required: boolean;
  default?: unknown;
}

/**
 * Supported output formats
 */
export type RuleFormat = 'markdown' | 'yaml' | 'json' | 'html';

/**
 * Rule type categories
 */
export enum RuleCategory {
  Development = 'development',
  Documentation = 'documentation',
  Process = 'process',
  Custom = 'custom',
}

/**
 * Rule generation input schema
 */
export const ruleGenerationSchema = z.object({
  productDescription: z.string().min(10, {
    message: 'Product description must be at least 10 characters.',
  }),
  ruleTypes: z.array(z.string()).min(1, {
    message: 'At least one rule type must be specified.',
  }),
  format: z.enum(['markdown', 'yaml', 'json', 'html']).default('markdown'),
  customization: z.record(z.unknown()).optional(),
  context: z
    .object({
      repository: z.string().optional(),
      language: z.string().optional(),
      framework: z.string().optional(),
      team: z
        .object({
          size: z.number().optional(),
          experience: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export type RuleGenerationInput = z.infer<typeof ruleGenerationSchema>;

export interface RuleSemantics {
  intent: string;
  context: string;
  impact: string;
}

export interface RuleExample {
  description?: string;
  code?: string;
}

export interface Rule {
  name: string;
  semantics: {
    intent: string;
    context: string;
    impact: string;
  };
  rationale?: string;
  applicability?: string;
  filePatterns?: string[];
  examples?: Array<{
    description?: string;
    code?: string;
  }>;
}
