import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import logger from '../logger.js';
import { registerTool } from '../services/routing/toolRegistry.js';
import { ToolExecutionError } from '../utils/errors.js';
import { performDirectLlmCall } from '../utils/llmHelper.js';

// Define Input Type based on Schema
const sequentialThinkingInputSchemaShape = {
  prompt: z
    .string()
    .min(10, { message: 'Prompt must be at least 10 characters.' })
    .describe('The prompt to think about'),
  maxSteps: z
    .number()
    .optional()
    .describe('Maximum number of thinking steps (default: 5)'),
};

/**
 * Generate sequential thinking steps for a given prompt.
 * @param {object} params - The validated tool parameters.
 * @param {object} config - OpenRouter configuration.
 * @returns {Promise<object>} A Promise resolving to a CallToolResult object.
 */
export const generateSequentialThinking = async (params, config) => {
  const { prompt, maxSteps = 5 } = params;

  try {
    logger.info({ prompt }, 'Starting sequential thinking generation...');

    const thinkingPrompt = `Think through this step by step:\n\nPrompt: ${prompt}\n\nGenerate up to ${maxSteps} clear, logical steps.`;

    const thoughts = await performDirectLlmCall(
      thinkingPrompt,
      'You are a logical thinker. Break down complex problems into clear, sequential steps. Focus on clarity and completeness.',
      config,
      'sequential_thinking',
      0.3
    );

    if (!thoughts) {
      throw new ToolExecutionError('Sequential thinking generation failed.');
    }

    return {
      content: [{ type: 'text', text: thoughts }],
      isError: false,
    };
  } catch (error) {
    logger.error({ err: error, prompt }, 'Sequential thinking generator error');
    const mcpError = new McpError(
      ErrorCode.InternalError,
      `Sequential thinking generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      content: [{ type: 'text', text: mcpError.message }],
      isError: true,
      errorDetails: mcpError,
    };
  }
};

// Register the tool
const sequentialThinkingToolDefinition = {
  name: 'sequential-thinking',
  description: 'Generates sequential thinking steps for a given prompt.',
  inputSchema: sequentialThinkingInputSchemaShape,
  executor: generateSequentialThinking,
};

registerTool(sequentialThinkingToolDefinition);
