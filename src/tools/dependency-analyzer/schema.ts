// src/tools/dependency-analyzer/schema.ts
import { z } from 'zod';

export const dependencyAnalysisInputSchema = z.object({
  filePath: z
    .string()
    .min(1)
    .describe(
      "The relative path to the dependency manifest file (e.g., 'package.json', 'client/package.json', 'requirements.txt')."
    ),
  // Optional: Add flags later like 'checkUpdates', 'checkVulnerabilities'
});

export type DependencyAnalysisInput = z.infer<
  typeof dependencyAnalysisInputSchema
>;
