// src/tools/workflow-runner/index.ts
// import { z } from 'zod'; // Removed unused import
import logger from '../../logger.js'; // Import logger
import { registerTool } from '../../services/routing/toolRegistry.js'; // Import registry functions and types (Added ToolExecutionContext)
import { executeWorkflow } from '../../services/workflows/workflowExecutor.js'; // Import the core workflow execution function
import { AppError } from '../../utils/errors.js'; // Import base error type

import { workflowRunnerInputSchema } from './schema.js'; // Import schema and type from sibling file
/**
 * Formats the result of a workflow execution into a user-friendly Markdown string.
 * @param result The WorkflowResult object returned by executeWorkflow.
 * @returns A formatted string summarizing the workflow outcome.
 */
function formatWorkflowResult(result) {
  let output = `## Workflow Execution: ${result.success ? 'Completed' : 'Failed'}\n\n`;
  // Use the message from the result as the primary status indicator
  output += `**Status:** ${result.message}\n\n`;
  // Include successfully resolved outputs if the workflow succeeded overall
  if (
    result.success &&
    result.outputs &&
    Object.keys(result.outputs).length > 0
  ) {
    output += `**Workflow Output Summary:**\n`;
    // Iterate through the defined outputs in the result
    for (const [key, value] of Object.entries(result.outputs)) {
      // Format the output value cleanly
      let formattedValue = '(Not available)';
      if (value !== undefined && value !== null) {
        // Limit length of displayed output values to avoid overly long messages
        const valueString =
          typeof value === 'string' ? value : JSON.stringify(value);
        formattedValue =
          valueString.length > 200
            ? valueString.substring(0, 200) + '...'
            : valueString;
      }
      output += `- ${key}: ${formattedValue}\n`;
    }
    output += `\n`;
  }
  // Include error details if the workflow failed
  if (result.error) {
    output += `**Error Details:**\n`;
    output += `- Step ID: ${result.error.stepId || 'N/A'}\n`;
    output += `- Tool: ${result.error.toolName || 'N/A'}\n`;
    // Ensure error message is included clearly
    output += `- Message: ${result.error.message || 'No specific error message provided.'}\n`;
    // Optionally include more details if present
    if (result.error.details) {
      try {
        output += `- Context: ${JSON.stringify(result.error.details, null, 2)}\n`; // Pretty print context object
      } catch {
        output += `- Context: (Could not serialize error details)\n`;
      }
    }
    output += `\n`;
  }
  // Add a concluding note about logs or history
  output += `\n*Note: Detailed step results might be available in server logs or session history for debugging.*`;
  return output;
}
// Main executor function for the run-workflow tool
export const runWorkflowTool = async (
  params, // Received validated params as unknown
  config,
  context // Accept optional context
) => {
  // Log the config received by the executor
  logger.debug(
    {
      configReceived: true,
      hasLlmMapping: Boolean(config.llm_mapping),
      mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : [],
    },
    'runWorkflowTool executor received config'
  );
  // Cast to the specific input type after validation (which happens in executeTool)
  const validatedParams = params;
  const { workflowName, workflowInput } = validatedParams;
  // Extract potential sessionId from context - Placeholder implementation
  // TODO: Replace with actual sessionId extraction once available from MCP SDK 'extra' parameter
  const sessionId =
    context?.sessionId ||
    `temp-session-${Math.random().toString(36).substring(2)}`; // Placeholder ID
  if (sessionId.startsWith('temp-session')) {
    logger.debug(`Workflow runner using temporary session ID for context.`);
  }
  logger.info(
    { workflowName, sessionId },
    `Executing workflow tool request for: ${workflowName}`
  );
  try {
    // Execute the workflow using the central workflow executor service
    const workflowResult = await executeWorkflow(
      workflowName,
      workflowInput || {}, // Pass empty object if workflowInput is null/undefined
      config,
      sessionId // Pass sessionId for potential logging within executeWorkflow
    );
    // Format the result for the MCP response
    const formattedText = formatWorkflowResult(workflowResult);
    // Return the result, setting isError based on workflow success
    return {
      content: [{ type: 'text', text: formattedText }],
      isError: !workflowResult.success, // Set MCP error flag if workflow failed
      // Pass through structured error details if the workflow failed
      errorDetails: workflowResult.error,
    };
  } catch (error) {
    // Catch unexpected errors *from* executeWorkflow itself (e.g., if it throws unexpectedly)
    logger.error(
      { err: error, tool: 'run-workflow', workflowName },
      `Unexpected error running workflow tool.`
    );
    const message =
      error instanceof Error
        ? error.message
        : `Unknown error running workflow tool '${workflowName}'.`;
    return {
      content: [{ type: 'text', text: `Workflow Runner Error: ${message}` }],
      isError: true,
      // Provide error details based on the caught error
      errorDetails: {
        type: error instanceof AppError ? error.name : 'WorkflowRunnerError',
        message: message,
      },
    };
  }
};
// Tool Definition - specifies metadata and implementation details
const workflowRunnerToolDefinition = {
  name: 'run-workflow', // The name used to call the tool
  description:
    'Runs a predefined sequence of tool calls (a workflow) based on a workflow name and input parameters defined in workflows.json.', // Tool description
  inputSchema: workflowRunnerInputSchema.shape, // Pass the raw Zod shape for registration
  executor: runWorkflowTool, // Reference the executor function implemented above
};
// Register the tool definition with the central registry
registerTool(workflowRunnerToolDefinition);
