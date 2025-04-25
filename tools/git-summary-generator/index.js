// src/tools/git-summary-generator/index.ts
import logger from '../../logger.js'; // Adjust path if necessary
import { registerTool } from '../../services/routing/toolRegistry.js'; // Adjust path if necessary
import { AppError } from '../../utils/errors.js'; // Adjust path if necessary
import { getGitDiffSummary } from '../../utils/gitHelper.js'; // Adjust path if necessary

import { gitSummaryInputSchema } from './schema.js';

// Define the executor function
export const generateGitSummary = async (params) => {
  // Validation happens in executeTool, but we cast here for type safety
  const validatedParams = params;
  logger.info(`Generating Git summary (staged: ${validatedParams.staged})`);
  try {
    // Call the helper function
    const diffSummary = await getGitDiffSummary({
      staged: validatedParams.staged,
    });
    // The helper already returns a user-friendly message for no changes
    return {
      content: [{ type: 'text', text: diffSummary }],
      isError: false,
    };
  } catch (error) {
    // Extract error message safely
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      { err: error, tool: 'generate-git-summary', params: validatedParams },
      `Error getting Git summary: ${errorMessage}`
    );
    // Ensure the error is an AppError or wrap it
    const appErr =
      error instanceof AppError
        ? error
        : new AppError(`Unknown error getting Git summary: ${errorMessage}`);
    return {
      content: [
        { type: 'text', text: `Error getting Git summary: ${appErr.message}` },
      ],
      isError: true,
      errorDetails: { type: appErr.name, message: appErr.message },
    };
  }
};
// Define and Register Tool
const gitSummaryToolDefinition = {
  name: 'generate-git-summary',
  description:
    'Retrieves a summary of current Git changes (diff). Can show staged or unstaged changes.',
  inputSchema: gitSummaryInputSchema.shape, // Pass the raw shape
  executor: generateGitSummary,
};
registerTool(gitSummaryToolDefinition);
