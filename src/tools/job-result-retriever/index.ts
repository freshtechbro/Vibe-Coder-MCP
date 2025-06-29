// src/tools/job-result-retriever/index.ts
import { z } from 'zod';
import { CallToolResult, McpError, ErrorCode, TextContent } from '@modelcontextprotocol/sdk/types.js'; // Import TextContent
import { OpenRouterConfig } from '../../types/workflow.js'; // Although not used directly, keep for ToolExecutor signature
import logger from '../../logger.js';
import { registerTool, ToolDefinition, ToolExecutor, ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { jobManager, JobStatus } from '../../services/job-manager/index.js'; // Import JobManager and types
import { createJobStatusMessage } from '../../services/job-manager/jobStatusMessage.js'; // Import standard message format

// --- Zod Schema ---
const getJobResultInputSchemaShape = {
  jobId: z.string().uuid({ message: "Invalid Job ID format. Must be a UUID." }).describe("The unique identifier of the job to retrieve."),
  includeDetails: z.boolean().default(true).optional().describe("Whether to include detailed diagnostic information in the response. Defaults to true.")
};

// --- Tool Executor ---

/**
 * Retrieves the status and result of a background job.
 */
export const getJobResult: ToolExecutor = async (
  params: Record<string, unknown>,
  _config: OpenRouterConfig, // Config might not be needed here, but keep for signature
  context?: ToolExecutionContext // Context might be needed for transport type
): Promise<CallToolResult> => {
  const { jobId, includeDetails = true } = params as { jobId: string; includeDetails?: boolean };
  const sessionId = context?.sessionId || 'unknown-session';
  const transportType = context?.transportType || 'unknown';

  try {
    logger.info({ jobId, sessionId, transportType }, `Attempting to retrieve result for job.`);

    // Use the new rate-limited job retrieval
    const { job, waitTime, shouldWait } = jobManager.getJobWithRateLimit(jobId);

    if (!job) {
      logger.warn({ jobId }, `Job not found.`);
      // Return a specific error for not found job
      const notFoundError = new McpError(ErrorCode.InvalidParams, `Job with ID '${jobId}' not found.`);
      return {
        content: [{ type: 'text', text: notFoundError.message }],
        isError: true,
        errorDetails: notFoundError
      };
    }

    // If rate limited, return a message with the wait time
    if (shouldWait) {
      logger.info({ jobId, waitTime }, `Rate limited job status request.`);

      // Create a standardized job status message
      const statusMessage = createJobStatusMessage(
        jobId,
        job.toolName,
        job.status,
        `Rate limited: Please wait ${Math.ceil(waitTime / 1000)} seconds before checking again.`,
        undefined,
        job.createdAt,
        job.updatedAt,
        includeDetails ? job.details : undefined
      );

      return {
        content: [{
          type: 'text',
          text: `Job '${jobId}' (${job.toolName}) status is being checked too frequently. Please wait ${Math.ceil(waitTime / 1000)} seconds before checking again. Current status: ${job.status}, last updated at: ${new Date(job.updatedAt).toISOString()}.`
        }],
        isError: false,
        pollInterval: waitTime,
        jobStatus: statusMessage
      };
    }

    // Prepare the response based on job status
    let responseText = '';
    let finalResult: CallToolResult | undefined = undefined;

    switch (job.status) {
      case JobStatus.PENDING:
        responseText = `Job '${jobId}' (${job.toolName}) is pending. Created at: ${new Date(job.createdAt).toISOString()}.`;
        break;
      case JobStatus.RUNNING:
        responseText = `Job '${jobId}' (${job.toolName}) is running. Status updated at: ${new Date(job.updatedAt).toISOString()}.`;

        // NEW: Add enhanced progress information if available
        if (job.progressMessage) {
          responseText += `\n\n📊 **Progress**: ${job.progressMessage}`;
        }

        if (job.progressPercentage !== undefined) {
          responseText += `\n⏱️ **Completion**: ${job.progressPercentage}%`;
        }

        // Add estimated completion time if available
        if (job.details?.metadata?.estimatedCompletion && 
            (typeof job.details.metadata.estimatedCompletion === 'string' || 
             typeof job.details.metadata.estimatedCompletion === 'number' ||
             job.details.metadata.estimatedCompletion instanceof Date)) {
          responseText += `\n🕒 **Estimated Completion**: ${new Date(job.details.metadata.estimatedCompletion).toISOString()}`;
        }

        responseText += `\n\n💡 **Tip**: Continue polling for updates. This job will provide detailed results when complete.`;
        break;
      case JobStatus.COMPLETED:
        responseText = `Job '${jobId}' (${job.toolName}) completed successfully at: ${new Date(job.updatedAt).toISOString()}.`;
        // If the result exists, we might want to return it directly
        if (job.result) {
            // Make a deep copy to avoid modifying the stored result
            finalResult = JSON.parse(JSON.stringify(job.result));
            // Check if finalResult is defined before accessing content
            if (finalResult) {
                // NEW: Enhance response with rich content if available
                if (finalResult.taskData && Array.isArray(finalResult.taskData) && finalResult.taskData.length > 0) {
                  const taskSummary = `\n\n📊 **Task Summary:**\n` +
                    `• Total Tasks: ${finalResult.taskData.length}\n` +
                    `• Total Hours: ${finalResult.taskData.reduce((sum: number, task: any) => sum + (task.estimatedHours || 0), 0)}h\n` +
                    `• Files Created: ${Array.isArray(finalResult.fileReferences) ? finalResult.fileReferences.length : 0}\n`;

                  const completionNote: TextContent = {
                    type: 'text',
                    text: taskSummary + `\n---\nJob Status: COMPLETED (${new Date(job.updatedAt).toISOString()})`
                  };

                  finalResult.content = [...(finalResult.content || []), completionNote];
                } else {
                  // Standard completion note for jobs without rich content
                  const completionNote: TextContent = {
                    type: 'text',
                    text: `\n---\nJob Status: COMPLETED (${new Date(job.updatedAt).toISOString()})`
                  };
                  finalResult.content = [...(finalResult.content || []), completionNote];
                }
            } else {
                 // Log if deep copy failed unexpectedly
                 logger.error({ jobId }, "Deep copy of job result failed unexpectedly for COMPLETED job.");
                 responseText += ' Failed to process final result.';
            }
        } else {
            // Should not happen if status is COMPLETED, but handle defensively
            responseText += ' However, the final result is missing.';
            logger.error({ jobId }, "Job status is COMPLETED but result is missing.");
        }
        break;
      case JobStatus.FAILED:
        responseText = `Job '${jobId}' (${job.toolName}) failed at: ${new Date(job.updatedAt).toISOString()}. Reason: ${job.progressMessage || 'No failure message available.'}`;
         // If the error result exists, return it directly
        if (job.result && job.result.isError) {
            // Make a deep copy to avoid modifying the stored result
            finalResult = JSON.parse(JSON.stringify(job.result));
             // Check if finalResult is defined before accessing content
            if (finalResult) {
                 // Optionally add a note about failure to the result content
                const failureNote: TextContent = { type: 'text', text: `\n---\nJob Status: FAILED (${new Date(job.updatedAt).toISOString()})` };
                // Ensure content array exists before pushing
                finalResult.content = [...(finalResult.content || []), failureNote];
            } else {
                 // Log if deep copy failed unexpectedly
                 logger.error({ jobId }, "Deep copy of job result failed unexpectedly for FAILED job.");
                 responseText += ' Failed to process error result.';
            }
        } else {
             responseText += ' Error details are missing.';
             logger.error({ jobId }, "Job status is FAILED but error result is missing or not marked as error.");
             // Construct a generic error result if specific one is missing
             finalResult = {
                 content: [{ type: 'text', text: responseText }],
                 isError: true,
                 errorDetails: new McpError(ErrorCode.InternalError, "Job failed but error details are missing.", { jobId })
             };
        }
        break;
      default:
        // Should not happen
        logger.error({ jobId, status: job.status }, `Job has unknown status.`);
        responseText = `Job '${jobId}' has an unknown status: ${job.status}.`;
        break;
    }

    // If we have a final result (from COMPLETED or FAILED job with result stored), return it
    if (finalResult) {
        logger.info({ jobId, status: job.status }, `Returning final stored result for job.`);
        return finalResult;
    }

    // For PENDING or RUNNING jobs, create a standardized status message
    const statusMessage = createJobStatusMessage(
      jobId,
      job.toolName,
      job.status,
      job.progressMessage,
      job.progressPercentage,
      job.createdAt,
      job.updatedAt,
      includeDetails ? job.details : undefined
    );

    // Add polling recommendation to the response
    if (statusMessage.pollingRecommendation) {
      responseText += `\n\nRecommended polling interval: ${statusMessage.pollingRecommendation.interval / 1000} seconds.`;
    }

    // Add detailed information to response text if requested and available
    if (includeDetails && statusMessage.details) {
      responseText += '\n\n--- Detailed Information ---';

      if (statusMessage.details.currentStage) {
        responseText += `\nCurrent Stage: ${statusMessage.details.currentStage}`;
      }

      if (statusMessage.details.subProgress !== undefined) {
        responseText += `\nSub-progress: ${statusMessage.details.subProgress}%`;
      }

      if (statusMessage.details.diagnostics && statusMessage.details.diagnostics.length > 0) {
        responseText += '\nDiagnostics:';
        statusMessage.details.diagnostics.forEach((diagnostic, index) => {
          responseText += `\n  ${index + 1}. ${diagnostic}`;
        });
      }

      if (statusMessage.details.metadata && Object.keys(statusMessage.details.metadata).length > 0) {
        responseText += '\nMetadata:';
        Object.entries(statusMessage.details.metadata).forEach(([key, value]) => {
          responseText += `\n  ${key}: ${JSON.stringify(value)}`;
        });
      }
    }

    // Return the status message
    logger.info({ jobId, status: job.status }, `Returning current status for job.`);
    return {
      content: [{ type: "text", text: responseText }],
      isError: false, // It's not an error to report pending/running status
      jobStatus: statusMessage,
      pollingRecommendation: statusMessage.pollingRecommendation
    };

  } catch (error) {
    logger.error({ err: error, jobId }, 'Error retrieving job result.');
    const execError = new McpError(ErrorCode.InternalError, `An unexpected error occurred while retrieving job '${jobId}'.`, { originalError: String(error) });
    return {
      content: [{ type: 'text', text: execError.message }],
      isError: true,
      errorDetails: execError
    };
  }
};

// --- Tool Registration ---
const getJobResultToolDefinition: ToolDefinition = {
  name: "get-job-result",
  description: "Retrieves the current status and, if available, the final result of a background job. Supports enhanced diagnostic information for debugging and troubleshooting.",
  inputSchema: getJobResultInputSchemaShape,
  executor: getJobResult
};

registerTool(getJobResultToolDefinition);

logger.info("Registered tool: get-job-result");
