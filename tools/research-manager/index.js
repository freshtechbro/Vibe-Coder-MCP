import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import logger from '../../logger.js';
import { registerTool } from '../../services/routing/toolRegistry.js';
import { ToolExecutionError } from '../../utils/errors.js';
import { performDirectLlmCall } from '../../utils/llmHelper.js';

// Define Input Type based on Schema
const researchInputSchemaShape = {
  query: z
    .string()
    .min(10, { message: 'Query must be at least 10 characters.' })
    .describe('The research query'),
  maxResults: z
    .number()
    .optional()
    .describe('Maximum number of research results (default: 5)'),
};

/**
 * Perform research based on a query.
 * @param {object} params - The validated tool parameters.
 * @param {object} config - OpenRouter configuration.
 * @returns {Promise<object>} A Promise resolving to a CallToolResult object.
 */
export const performResearch = async (params, config) => {
  const { query, maxResults = 5 } = params;

  try {
    logger.info({ query }, 'Starting research...');

    const researchPrompt = `Research the following topic:\n\nQuery: ${query}\n\nProvide up to ${maxResults} relevant findings.`;

    const findings = await performDirectLlmCall(
      researchPrompt,
      'You are a research assistant. Find relevant information and summarize key findings. Focus on accuracy and relevance.',
      config,
      'research',
      0.3
    );

    if (!findings) {
      throw new ToolExecutionError('Research failed.');
    }

    return {
      content: [{ type: 'text', text: findings }],
      isError: false,
    };
  } catch (error) {
    logger.error({ err: error, query }, 'Research error');
    const mcpError = new McpError(
      ErrorCode.InternalError,
      `Research failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      content: [{ type: 'text', text: mcpError.message }],
      isError: true,
      errorDetails: mcpError,
    };
  }
};

// Register the tool
const researchToolDefinition = {
  name: 'research-manager',
  description: 'Performs research based on a query.',
  inputSchema: researchInputSchemaShape,
  executor: performResearch,
};

registerTool(researchToolDefinition);
