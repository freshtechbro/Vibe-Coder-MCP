// src/types/sequentialThought.ts
import { z } from 'zod';

/**
 * Zod schema for validating the structure of a SequentialThought object.
 * This ensures the JSON output from the sequential thinking LLM adheres
 * to the expected format. (Simplified Version)
 */
export const sequentialThoughtSchema = z.object({
  thought: z.string({
    required_error: "The 'thought' field is required.",
    invalid_type_error: "'thought' must be a string.",
  }),
  next_thought_needed: z.boolean({
    required_error: "The 'next_thought_needed' field is required.",
    invalid_type_error: "'next_thought_needed' must be a boolean.",
  }),
  thought_number: z
    .number({
      required_error: "The 'thought_number' field is required.",
      invalid_type_error: "'thought_number' must be a number.",
    })
    .int({ message: "'thought_number' must be an integer." })
    .positive({ message: "'thought_number' must be a positive number." }),
  total_thoughts: z
    .number({
      required_error: "The 'total_thoughts' field is required.",
      invalid_type_error: "'total_thoughts' must be a number.",
    })
    .int({ message: "'total_thoughts' must be an integer." })
    .positive({ message: "'total_thoughts' must be a positive number." }),
});

// Export the inferred TypeScript type for convenience
// NOTE: The structure has changed, but we keep the name for now.
export type SequentialThought = z.infer<typeof sequentialThoughtSchema>;
