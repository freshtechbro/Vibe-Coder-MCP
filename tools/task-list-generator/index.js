import path from 'path';

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs-extra';
import { z } from 'zod';

import logger from '../../logger.js';
import { registerTool } from '../../services/routing/toolRegistry.js';
import { ToolExecutionError } from '../../utils/errors.js';
import { performDirectLlmCall } from '../../utils/llmHelper.js';
import { performResearchQuery } from '../../utils/researchHelper.js';

// Define Input Type based on Schema
const taskListInputSchemaShape = {
  productDescription: z
    .string()
    .min(10, { message: 'Product description must be at least 10 characters.' })
    .describe('Description of the product to generate tasks for'),
  maxTasks: z
    .number()
    .optional()
    .describe('Maximum number of tasks to generate (default: 10)'),
};

/**
 * Generate task list for a product based on its description.
 * @param {object} params - The validated tool parameters.
 * @param {object} config - OpenRouter configuration.
 * @returns {Promise<object>} A Promise resolving to a CallToolResult object.
 */
export const generateTaskList = async (params, config) => {
  const { productDescription, maxTasks = 10 } = params;

  try {
    logger.info(
      { inputs: { productDescription: productDescription.substring(0, 50) } },
      'Task List Generator: Starting task list generation...'
    );

    logger.info(
      { inputs: { productDescription: productDescription.substring(0, 50) } },
      'Task List Generator: Starting research...'
    );
    const taskPrompt = `Based on the following product description, what are the key development tasks, subtasks, dependencies, and effort estimates that should be included in a detailed task list? Consider frontend, backend, infrastructure, testing, and deployment aspects.\n\nProduct Description: ${productDescription}`;

    // Perform research using the configured research model
    const researchResult = await performResearchQuery(taskPrompt, config);

    // Process research result
    let researchContext = '## Research Context (From LLM Research):\n\n';
    if (researchResult) {
      researchContext += researchResult;
      logger.info('Task List Generator: Research completed successfully.');
    } else {
      logger.warn('Task List Generator: Research returned empty result.');
      researchContext += '*No research data available.*\n\n';
    }

    const taskListPrompt = `Based on the following research and product description, generate a task list with up to ${maxTasks} tasks:\n\nProduct Description:\n${productDescription}\n\nResearch Context:\n${researchContext}`;

    const taskList = await performDirectLlmCall(
      taskListPrompt,
      'You are a technical project manager. Generate clear, actionable development tasks. Focus on concrete implementation steps.',
      config,
      'task_list_generation',
      0.3
    );

    if (!taskList) {
      throw new ToolExecutionError('Task list generation failed.');
    }

    return {
      content: [{ type: 'text', text: taskList }],
      isError: false,
    };
  } catch (error) {
    logger.error(
      { err: error, productDescription },
      'Task list generator error'
    );
    const mcpError = new McpError(
      ErrorCode.InternalError,
      `Task list generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      content: [{ type: 'text', text: mcpError.message }],
      isError: true,
      errorDetails: mcpError,
    };
  }
};

// Register the tool
const taskListToolDefinition = {
  name: 'task-list-generator',
  description: 'Generates a task list for a product based on its description.',
  inputSchema: taskListInputSchemaShape,
  executor: generateTaskList,
};

registerTool(taskListToolDefinition);
