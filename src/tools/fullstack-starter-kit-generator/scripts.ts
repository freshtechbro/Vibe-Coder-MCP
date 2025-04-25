import { z } from 'zod';

import logger from '../../logger.js';
import { toolRegistry } from '../../services/routing/toolRegistry.js';
import { ToolResult, ToolDefinition } from '../../types/tools.js';

export interface PackageConfig {
  name: string;
  version: string;
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function generateSetupScripts(
  params: Record<string, unknown>,
  config: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const { name, scripts } = z
      .object({
        name: z.string(),
        scripts: z.record(z.string()),
      })
      .parse(params);

    logger.info({ name }, 'Generating setup scripts');

    return {
      isError: false,
      content: [
        {
          type: 'success',
          text: `Generated setup scripts for ${name}`,
        },
      ],
      metadata: {
        scripts,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to generate setup scripts');
    return {
      isError: true,
      content: [
        {
          type: 'error',
          text: `Failed to generate setup scripts: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      errorDetails: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

// Register the scripts generator tool
toolRegistry.registerTool({
  name: 'setup-scripts-generator',
  description: 'Generates setup scripts for packages',
  inputSchema: {
    name: z.string(),
    scripts: z.record(z.string()),
  },
  execute: generateSetupScripts,
});
