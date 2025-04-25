// src/tools/code-refactor-generator/schema.ts
import { z } from 'zod';
/**
 * Zod schema for validating the input parameters of the code refactoring tool.
 * Defines the expected structure and types for the `language`, `codeContent`,
 * `refactoringInstructions`, and optional `contextFilePath` parameters.
 */
export const codeRefactorInputSchema = z.object({
  /**
   * The programming language of the code snippet (e.g., 'typescript', 'python', 'javascript').
   * Must be a non-empty string.
   */
  language: z
    .string()
    .min(1)
    .describe(
      "The programming language of the code snippet (e.g., 'typescript', 'python', 'javascript')"
    ),
  /**
   * The actual code snippet to be refactored.
   * Must be a non-empty string with a maximum length of 10000 characters.
   */
  codeContent: z
    .string()
    .min(1)
    .max(10000, 'Input code exceeds maximum length of 10000 characters.')
    .describe('The actual code snippet to be refactored.'),
  /**
   * Specific instructions on how the code should be refactored.
   * Must be a non-empty string.
   */
  refactoringInstructions: z
    .string()
    .min(1)
    .describe(
      "Specific instructions on how the code should be refactored (e.g., 'extract the loop into a separate function', 'improve variable names', 'add error handling', 'convert promises to async/await')."
    ),
  /**
   * Optional array of relative paths to files whose content provides broader context for the refactoring task.
   * Each path must not contain directory traversal sequences ('../' or '..\\').
   */
  contextFilePath: z
    .array(
      z
        .string()
        .refine((path) => !path.includes('../') && !path.includes('..\\'), {
          message:
            "Context file path cannot contain directory traversal sequences ('../' or '..\\').",
        })
    )
    .optional()
    .describe(
      'Optional array of relative paths to files whose content provides broader context for the refactoring task.'
    ),
});
