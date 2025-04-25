import { z } from 'zod';
// Define reusable schemas for nested parts
const techStackItemSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  rationale: z.string(),
});
const fileStructureItemSchema = z.lazy(() =>
  // Use z.lazy for recursive types
  z
    .object({
      path: z.string(),
      type: z.enum(['file', 'directory']),
      content: z.string().nullable(), // Allow null for generationPrompt
      generationPrompt: z.string().nullable().optional(), // Allow null for content
      children: z.array(fileStructureItemSchema).optional(), // Recursive part
    })
    .refine(
      (data) => data.type === 'directory' || data.children === undefined,
      {
        message: 'Files cannot have children',
        path: ['children'],
      }
    )
    .refine(
      (data) => {
        // If content is provided, generationPrompt should not be provided (or be null)
        if (data.content !== null && data.content !== undefined) {
          return (
            data.generationPrompt === null ||
            data.generationPrompt === undefined
          );
        }
        return true;
      },
      {
        message: 'Cannot have both content and generationPrompt',
        path: ['content'],
      }
    )
);
// Export the recursive schema type as well
export { fileStructureItemSchema };
// Define the main schema
export const starterKitDefinitionSchema = z.object({
  projectName: z.string().min(1),
  description: z.string(),
  techStack: z.record(techStackItemSchema), // Allows arbitrary keys like 'frontend', 'backend'
  directoryStructure: z.array(fileStructureItemSchema),
  dependencies: z.object({
    // Making npm optional, add others like yarn if needed
    npm: z
      .object({
        root: z
          .object({
            dependencies: z.record(z.string()).optional(),
            devDependencies: z.record(z.string()).optional(),
          })
          .optional(),
        // Allow arbitrary keys for sub-directories like 'client'
      })
      .catchall(
        z.object({
          dependencies: z.record(z.string()).optional(),
          devDependencies: z.record(z.string()).optional(),
        })
      )
      .optional(),
  }),
  setupCommands: z.array(z.string()),
  nextSteps: z.array(z.string()),
});
