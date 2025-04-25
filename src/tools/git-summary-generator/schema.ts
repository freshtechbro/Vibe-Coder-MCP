// src/tools/git-summary-generator/schema.ts
import { z } from 'zod';

export const gitSummaryInputSchema = z.object({
  staged: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'If true, get the summary for staged changes only. Defaults to false (unstaged changes).'
    ),
  // Future options like target branch could be added here
});

export type GitSummaryInput = z.infer<typeof gitSummaryInputSchema>;
