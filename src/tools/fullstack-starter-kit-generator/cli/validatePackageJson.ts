import { z } from 'zod';

const packageJsonSchema = z.object({
  name: z.string(),
  version: z.string(),
  scripts: z.record(z.string()).optional(),
  dependencies: z.record(z.string()).optional(),
  devDependencies: z.record(z.string()).optional(),
  peerDependencies: z.record(z.string()).optional(),
  workspaces: z.array(z.string()).optional(),
});

export function validatePackageJson(
  packageJson: Record<string, unknown>
): boolean {
  try {
    packageJsonSchema.parse(packageJson);
    return true;
  } catch (error) {
    return false;
  }
}
