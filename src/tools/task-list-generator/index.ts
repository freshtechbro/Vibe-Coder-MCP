import { z } from 'zod';

import logger from '../../logger.js';
import {
  ToolExecutionContext,
  toolRegistry,
} from '../../services/routing/toolRegistry.js';
import { OpenRouterConfig } from '../../types/mcp.js';
import { StructuredTaskList } from '../../types/taskList.js';
import { ToolDefinition, ToolResult } from '../../types/tools.js';
import { performDirectLlmCall } from '../../utils/llmHelper.js';
import { generateAsyncJobMessage } from '../../utils/jobMessages.js';
import { jobManager } from '../../services/job-manager/index.js';

import { parseTaskListOutput } from './parser.js';
import { hyperDecompositionTemplate } from './templates/index.js';

const taskListInputSchema = z
  .object({
    prd: z
      .string()
      .describe(
        'The Product Requirements Document (PRD) or detailed description of the feature/project.'
      ),
    async: z.boolean().optional(),
  })
  .strict();

interface TaskListGeneratorConfig {
  openRouterConfig: OpenRouterConfig;
}

async function generateTaskList(
  params: Record<string, unknown>,
  config: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const input = taskListInputSchema.parse(params);
    const prdContent = input.prd;

    if (input.async === true) {
      const jobId = jobManager.createJob();
      // --- Use shared utility for async job message ---
      const message = generateAsyncJobMessage({
        jobId,
        toolName: 'task-list-generator',
      });
      return {
        isError: false,
        content: [{ type: 'text', text: message }],
        metadata: { jobId },
      };
    }

    if (
      !config ||
      typeof config !== 'object' ||
      !config.openRouterConfig ||
      typeof config.openRouterConfig !== 'object'
    ) {
      throw new Error(
        "Missing or invalid 'openRouterConfig' in tool configuration."
      );
    }
    const llmConfig = config.openRouterConfig as OpenRouterConfig;

    const modelAlias = 'research_execution';
    if (!llmConfig?.llm_mapping?.[modelAlias]) {
      throw new Error(`Missing '${modelAlias}' mapping in llm_mapping.`);
    }

    const systemPrompt = `You are an expert Project Manager AI. Your goal is to analyze the provided Product Requirements Document (PRD) and generate a detailed, hyper-decomposed task list.

Follow these instructions precisely:
1.  Analyze the PRD thoroughly.
2.  Use your web search capabilities to ensure accuracy and gather necessary details for the tasks.
3.  Generate the task list strictly following the structure and format provided in the template below.
4.  Decompose tasks into General Tasks, Sub-tasks, and Sub-sub-tasks where appropriate.
5.  Fill in all fields: [Product/Feature Name], Overall Goal, Task Titles, Descriptions, Sub-task/Sub-sub-task Goals, Objectives (as a bulleted list), Impact, and Acceptance Criteria (as a bulleted list). Use clear, specific, actionable language.
6.  The output MUST be valid Markdown.
7.  Output *only* the completed markdown task list, starting exactly with '# Task List for:'. Do not include any other text, preamble, explanation, or introductory/closing remarks.

Template:
---
${hyperDecompositionTemplate}
---
`;

    const llmResponse = await performDirectLlmCall(
      systemPrompt,
      prdContent,
      llmConfig,
      modelAlias,
      0.5
    );

    const generatedTasks = llmResponse;

    if (!generatedTasks) {
      throw new Error('LLM failed to generate a task list response.');
    }

    const structuredTasks: StructuredTaskList =
      parseTaskListOutput(generatedTasks);

    if (!structuredTasks || structuredTasks.length === 0) {
      logger.warn(
        { llmResponse: generatedTasks },
        'Parser did not return any structured tasks from the LLM response.'
      );
    }

    return {
      isError: false,
      content: [
        {
          type: 'json',
          text: JSON.stringify(structuredTasks, null, 2),
        },
      ],
      metadata: {
        generatedAt: new Date().toISOString(),
        modelUsed: llmConfig?.llm_mapping?.[modelAlias],
        promptTemplateUsed: 'hyperDecompositionTemplate',
        parsingStatus:
          structuredTasks.length > 0 ? 'Success' : 'PartialOrEmpty',
      },
    };
  } catch (error) {
    logger.error({ err: error, params, config }, 'Error generating task list');
    return {
      isError: true,
      errorDetails: {
        message:
          error instanceof Error
            ? error.message
            : 'Unknown error generating task list',
      },
      content: [],
      metadata: { failedAt: new Date().toISOString() },
    };
  }
}

export { generateTaskList };

toolRegistry.registerTool({
  name: 'task-list-generator',
  description: 'Breaks down requirements (PRD) into a detailed task list.',
  inputSchema: taskListInputSchema.shape,
  execute: generateTaskList,
});
