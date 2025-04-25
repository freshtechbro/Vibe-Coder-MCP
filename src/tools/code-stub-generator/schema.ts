// src/tools/code-stub-generator/schema.ts
import { z } from 'zod';

// Define specific parameter/property structures
const paramSchema = z
  .object({
    name: z.string(),
    type: z.string().optional(),
    description: z.string().optional(),
  })
  .describe('Represents a function parameter or class property');

const methodSchema = z
  .object({
    name: z.string(),
    // Could add params/return type here too if needed for more detail
    description: z.string().optional(),
  })
  .describe('Represents a class method signature');

export const codeStubInputSchema = z.object({
  language: z
    .string()
    .min(1)
    .describe(
      "The programming language for the stub (e.g., 'typescript', 'python', 'javascript')"
    ),
  stubType: z
    .enum(['function', 'class', 'interface', 'method', 'module'])
    .describe('The type of code structure to generate (function, class, etc.)'),
  name: z
    .string()
    .min(1)
    .describe('The name of the function, class, interface, etc.'),
  description: z
    .string()
    .min(1)
    .describe(
      'Detailed description of what the stub should do, including its purpose, parameters, return values, or properties.'
    ),

  // Optional fields for more detailed stub generation
  parameters: z
    .array(paramSchema)
    .optional()
    .describe(
      'For functions/methods: list of parameters with names, optional types, and descriptions.'
    ),
  returnType: z
    .string()
    .optional()
    .describe('For functions/methods: the expected return type string.'),
  classProperties: z
    .array(paramSchema)
    .optional()
    .describe(
      'For classes: list of properties with names, optional types, and descriptions.'
    ),
  methods: z
    .array(methodSchema)
    .optional()
    .describe(
      'For classes/interfaces: list of method signatures with names and descriptions.'
    ),
  contextFilePath: z
    .string()
    .optional()
    .describe(
      'Optional relative path to a file whose content should be used as additional context.'
    ),
  outputFilePath: z
    .string()
    .optional()
    .describe('Optional path to save the generated code stub to a file.'),
  // Consider adding: 'extends', 'implements' for classes/interfaces? Keep simple for now.
});

export type CodeStubInput = z.infer<typeof codeStubInputSchema>;
