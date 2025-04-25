import { z } from 'zod';

import logger from '../../logger.js';
import { ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { ToolDefinition, ToolResult } from '../../types/tools.js';

const rulesInputSchema = z.object({
  productDescription: z.string(),
});

async function generateRules(
  params: Record<string, unknown>,
  config: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const input = rulesInputSchema.parse(params);
    const rules = `# Project Rules

## Overview
${input.productDescription}

## Code Style
1. Use TypeScript for all new code
2. Follow ESLint configuration
3. Write unit tests for all new features

## Git Workflow
1. Create feature branches from main
2. Use conventional commits
3. Squash merge to main

## Review Process
1. Code review required
2. Tests must pass
3. Documentation must be updated
`;

    return {
      content: [
        {
          type: 'text',
          text: rules,
        },
      ],
    };
  } catch (error) {
    logger.error({ err: error }, 'Rules generation failed');
    throw error;
  }
}

// Export the function for testing
export { generateRules };

export const rulesGenerator: ToolDefinition = {
  name: 'rules-generator',
  description: 'Creates basic project rules from a description.',
  inputSchema: rulesInputSchema.shape,
  execute: generateRules,
};
