import {
  CallToolResult,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import logger from '../../logger.js';
import { toolRegistry } from '../../services/routing/toolRegistry.js';
import { ToolDefinition, ToolResult } from '../../types/tools.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { ToolExecutionError } from '../../utils/errors.js';
import { performDirectLlmCall } from '../../utils/llmHelper.js';
import { performResearchQuery } from '../../utils/researchHelper.js';
import { generateAsyncJobMessage } from '@/utils/jobMessages.js';

// Define Input Type based on Schema
const userStoriesInputSchemaShape = {
  productDescription: z
    .string()
    .min(10, { message: 'Product description must be at least 10 characters.' })
    .describe('Description of the product to generate user stories for'),
  maxStories: z
    .number()
    .optional()
    .describe('Maximum number of user stories to generate (default: 10)'),
};

/**
 * Generate user stories for a product based on its description.
 * @param params The validated tool parameters.
 * @param config OpenRouter configuration.
 * @returns A Promise resolving to a CallToolResult object.
 */
// This function will be wrapped to convert its return type
export const generateUserStoriesInternal = async (
  params: Record<string, unknown>,
  config: Record<string, unknown>,
  context: Record<string, unknown>
): Promise<CallToolResult> => {
  // Cast config to unknown first to avoid TypeScript error
  const openRouterConfig = config as unknown as OpenRouterConfig;
  const { productDescription, maxStories = 10 } = params as {
    productDescription: string;
    maxStories?: number;
  };

  try {
    logger.info({ productDescription }, 'Starting user stories generation...');

    // First, gather research about similar products and user needs
    const researchResult = await performResearchQuery(
      `User needs, behaviors, and scenarios for: ${productDescription}`,
      openRouterConfig
    );

    if (!researchResult) {
      throw new ToolExecutionError('Research query returned no results.');
    }

    const userStoriesPrompt = `Based on the following research and product description, generate a set of user stories with up to ${maxStories} stories:\n\nProduct Description:\n${productDescription}\n\nResearch Context:\n${researchResult}`;

    const userStories = await performDirectLlmCall(
      userStoriesPrompt,
      "You are a product manager. Generate clear, actionable user stories following the format: 'As a [user type], I want to [action] so that [benefit]'. Focus on real user needs and valuable outcomes.",
      openRouterConfig,
      'user_stories_generation',
      0.3
    );

    if (!userStories) {
      throw new ToolExecutionError('User stories generation failed.');
    }

    return {
      content: [{ type: 'text', text: userStories }],
      isError: false,
    };
  } catch (error) {
    logger.error(
      { err: error, productDescription },
      'User stories generator error'
    );
    const mcpError = new McpError(
      ErrorCode.InternalError,
      `User stories generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      content: [{ type: 'text', text: mcpError.message }],
      isError: true,
      errorDetails: mcpError,
    };
  }
};

// Wrapper function to convert CallToolResult to ToolResult
export const generateUserStories = async (
  params: Record<string, unknown>,
  config: Record<string, unknown>,
  context: Record<string, unknown>
): Promise<ToolResult> => {
  const result = await generateUserStoriesInternal(params, config, context);

  // Convert to ToolResult format
  return {
    content: result.content.map((item) => ({
      type: item.type,
      text: item.type === 'text' ? item.text : JSON.stringify(item),
    })),
  };
};

// Register the user stories generator tool
toolRegistry.registerTool({
  name: 'user-stories-generator',
  description: 'Creates user stories based on a product description.',
  inputSchema: userStoriesInputSchemaShape,
  execute: async (params, config, context) => {
    // --- Use shared utility for async job message ---
    if (params.async === true) {
      const jobId = 'jobId'; // Replace with actual job ID creation logic
      const message = generateAsyncJobMessage({
        jobId,
        toolName: 'user-stories-generator',
      });
      return {
        isError: false,
        content: [{ type: 'text', text: message }],
        metadata: { jobId },
      };
    }
    return generateUserStories(params, config, context);
  },
});
