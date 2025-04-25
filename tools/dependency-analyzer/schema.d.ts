import { z } from 'zod';
export declare const dependencyAnalysisInputSchema: z.ZodObject<
  {
    filePath: z.ZodString;
  },
  'strip',
  z.ZodTypeAny,
  {
    filePath: string;
  },
  {
    filePath: string;
  }
>;
export type DependencyAnalysisInput = z.infer<
  typeof dependencyAnalysisInputSchema
>;
