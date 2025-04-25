import { z } from 'zod';
export declare const codeRefactorInputSchema: z.ZodObject<
  {
    language: z.ZodString;
    codeContent: z.ZodString;
    refactoringInstructions: z.ZodString;
    contextFilePath: z.ZodOptional<z.ZodString>;
  },
  'strip',
  z.ZodTypeAny,
  {
    language: string;
    codeContent: string;
    refactoringInstructions: string;
    contextFilePath?: string | undefined;
  },
  {
    language: string;
    codeContent: string;
    refactoringInstructions: string;
    contextFilePath?: string | undefined;
  }
>;
export type CodeRefactorInput = z.infer<typeof codeRefactorInputSchema>;
