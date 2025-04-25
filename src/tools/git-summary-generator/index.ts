import { z } from 'zod';

import logger from '../../logger.js';
import { ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { ToolDefinition, ToolResult } from '../../types/tools.js';
import { gitHelper } from '../../utils/gitHelper.js';

const gitSummaryInputSchema = z.object({
  repository: z.string(),
  since: z.string().optional(),
  until: z.string().optional(),
});

type GitSummaryInput = z.infer<typeof gitSummaryInputSchema>;

async function generateGitSummary(
  params: Record<string, unknown>,
  config: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const input = gitSummaryInputSchema.parse(params);
    const commits = await gitHelper.getCommits(
      input.repository,
      input.since,
      input.until
    );

    return {
      content: [
        {
          type: 'text',
          text: commits.join('\n'),
        },
      ],
    };
  } catch (error) {
    logger.error({ err: error }, 'Git summary generation failed');
    throw error;
  }
}

export const gitSummaryGenerator: ToolDefinition = {
  name: 'git-summary-generator',
  description: 'Summarizes recent code changes from a git repository.',
  inputSchema: gitSummaryInputSchema.shape,
  execute: generateGitSummary,
};
