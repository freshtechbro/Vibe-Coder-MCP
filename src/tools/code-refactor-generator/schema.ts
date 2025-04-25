// src/tools/code-refactor-generator/schema.ts
import { z } from 'zod';

export const codeRefactorInputSchema = z.object({
  language: z
    .string()
    .min(1, { message: 'Language cannot be empty' })
    .describe(
      "The programming language of the code snippet (e.g., 'typescript', 'python', 'javascript')"
    ),
  codeContent: z
    .string()
    .min(1, { message: 'Code snippet cannot be empty' })
    .describe('The actual code snippet to be refactored.'),
  refactoringInstructions: z
    .string()
    .min(1, { message: 'Refactoring instructions cannot be empty' })
    .describe(
      "Specific instructions on how the code should be refactored (e.g., 'extract the loop into a separate function', 'improve variable names', 'add error handling', 'convert promises to async/await')."
    ),
  contextFilePath: z
    .string()
    .optional()
    .describe(
      'Optional relative path to a file whose content provides broader context for the refactoring task.'
    ),
  outputFilePath: z
    .string()
    .optional()
    .describe('Optional file path to write the refactored code output.'),
  async: z
    .boolean()
    .optional()
    .describe(
      `If true, the refactor will be performed asynchronously via the job queue.`
    ),
});

export type CodeRefactorInput = z.infer<typeof codeRefactorInputSchema>;
