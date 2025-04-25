/**
 * Utility for generating interactive job messages for async tools.
 * Ensures consistent, user-friendly messaging across all tools using the job queue.
 */

interface JobMessageOptions {
  jobId: string;
  toolName: string;
  retrievalToolName?: string; // Optional: if different from toolName
  additionalContext?: Record<string, unknown>;
  customInstruction?: string; // Optional extra instruction for the client
}

/**
 * Generates a standard interactive message for async job creation.
 * Includes:
 * - Info that the job is being processed
 * - Job ID
 * - Copy-pasteable prompt for retrieving the job result
 * - Optionally, custom instructions
 */
export function generateAsyncJobMessage({
  jobId,
  toolName,
  retrievalToolName,
  additionalContext = {},
  customInstruction,
}: JobMessageOptions): string {
  const retrievalTool = retrievalToolName || `${toolName}-job-result`;
  const retrievalPrompt = {
    tool_name: retrievalTool,
    arguments: {
      jobId,
      ...additionalContext,
    },
  };
  return [
    `Your request has been received and is being processed as an async job.`,
    `\nJob ID: ${jobId}`,
    `\nPlease wait a moment for the task to complete before attempting to retrieve the job result.`,
    customInstruction
      ? `\n${customInstruction}`
      : `\nTo check the status or result of this job, send the following prompt:`,
    '```json',
    JSON.stringify(retrievalPrompt, null, 2),
    '```',
    `\nYou can use this prompt in the assistant, API, or Studio to retrieve your job's status or result.`
  ].join('\n');
}
