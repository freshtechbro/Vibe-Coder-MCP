import { z } from 'zod';

import logger from '../../logger.js';
import { jobManager } from '../../services/job-manager/index.js';
import { toolRegistry } from '../../services/routing/toolRegistry.js';
import { executeWorkflow } from '../../services/workflows/workflowExecutor.js';
import { generateAsyncJobMessage } from '@/utils/jobMessages.js';

const workflowInputSchema = {
  workflowName: z.string(),
  input: z.record(z.unknown()),
};

async function runWorkflow(
  params: Record<string, unknown>,
  config: Record<string, unknown>,
  context: Record<string, unknown>
) {
  try {
    logger.info({ params }, 'Running workflow');

    const { workflowName, input } = z.object(workflowInputSchema).parse(params);

    if (
      !workflowName ||
      typeof workflowName !== 'string' ||
      workflowName.trim() === ''
    ) {
      return {
        content: [
          {
            type: 'text',
            text: 'Invalid workflow name. Please provide a valid workflow name.',
          },
        ],
        isError: true,
        errorDetails: {
          code: 'INVALID_WORKFLOW_NAME',
          message: 'Workflow name is required',
        },
      };
    }

    // Create a job ID first
    const jobId = jobManager.createJob();

    // --- Use shared utility for async job message ---
    const message = generateAsyncJobMessage({
      jobId,
      toolName: 'workflow-runner',
    });

    // Execute the workflow with the session ID
    const result = await executeWorkflow(
      workflowName,
      input,
      config,
      context.sessionId as string
    );

    return {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
      isError: false,
      metadata: {
        jobId,
        workflowName,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Workflow execution failed');

    return {
      content: [
        {
          type: 'text',
          text: `Workflow failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
      errorDetails: error instanceof Error ? error : { message: String(error) },
    };
  }
}

// Export the function for testing
export { runWorkflow };

toolRegistry.registerTool({
  name: 'workflow-runner',
  description:
    'Runs a sequence of automated tasks (workflow) (runs in background).',
  inputSchema: workflowInputSchema,
  execute: runWorkflow,
});
