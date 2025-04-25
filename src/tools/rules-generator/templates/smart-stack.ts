import { z } from 'zod';

import { RuleCategory } from '../formats/index.js';

const ruleSchema = z.object({
  name: z.string(),
  description: z.string(),
  metadata: z.object({
    tags: z.array(z.string()),
    section: z.string().optional(),
  }),
});

const categorySchema = z.object({
  name: z.string(),
  description: z.string(),
  rules: z.array(ruleSchema),
});

export function generateSmartStackRules(): RuleCategory[] {
  return [
    {
      name: 'Code Style',
      description: 'Rules for code formatting and style',
      rules: [
        {
          name: 'Use TypeScript',
          description: 'All new code must be written in TypeScript',
          metadata: {
            tags: ['typescript', 'language'],
          },
        },
        {
          name: 'Follow ESLint',
          description: 'Follow ESLint configuration',
          metadata: {
            tags: ['linting', 'style'],
          },
        },
      ],
    },
    {
      name: 'Testing',
      description: 'Rules for testing code',
      rules: [
        {
          name: 'Write Unit Tests',
          description: 'Write unit tests for all new features',
          metadata: {
            tags: ['testing', 'quality'],
          },
        },
        {
          name: 'Test Coverage',
          description: 'Maintain minimum 80% test coverage',
          metadata: {
            tags: ['testing', 'coverage'],
          },
        },
      ],
    },
  ];
}
