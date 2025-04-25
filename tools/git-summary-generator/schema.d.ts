import { z } from 'zod';
export declare const gitSummaryInputSchema: z.ZodObject<
  {
    staged: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  },
  'strip',
  z.ZodTypeAny,
  {
    staged: boolean;
  },
  {
    staged?: boolean | undefined;
  }
>;
export type GitSummaryInput = z.infer<typeof gitSummaryInputSchema>;
