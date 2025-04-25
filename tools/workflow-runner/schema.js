// src/tools/workflow-runner/schema.ts
import { z } from 'zod';
// Define the schema for the input parameters of the run-workflow tool
export const workflowRunnerInputSchema = z.object({
  // Workflow name is required, must be a non-empty string
  workflowName: z
    .string()
    .min(1)
    .describe(
      'The exact name of the predefined workflow to run (must match a key in workflows.json).'
    ),
  // Workflow input is optional, can be any object (record)
  workflowInput: z
    .record(z.any())
    .optional()
    .describe(
      'An object containing input parameters required by the specified workflow (if any).'
    ),
  // Optional: sessionId could be passed here if needed for state, but better handled internally if possible
});
