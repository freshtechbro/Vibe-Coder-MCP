import { z } from 'zod';

import logger from '../../logger.js';
import { FileGenerator } from '../../tools/fullstack-starter-kit-generator/services/file-generator.js';
import { ToolExecutionContext, ToolResult } from '../../types/tools.js';
import { ValidationError } from '../../utils/errors.js';

import { BaseHandler } from './base-handler.js';

const configSchema = z.object({
  name: z.string(),
  description: z.string(),
  template: z.string(),
  features: z.array(z.string()),
  packages: z.array(z.string()),
});

export class FullstackStarterKitHandler extends BaseHandler {
  constructor() {
    super({
      name: 'fullstack-starter-kit',
      description: 'Generates a fullstack starter kit',
      inputSchema: configSchema.shape,
    });
  }

  async execute(
    params: Record<string, unknown>,
    _config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    try {
      const validatedParams = configSchema.parse(params);

      logger.info('Generating files...');
      const fileGenerator = new FileGenerator(
        { outputDir: process.cwd() },
        () => {}
      );
      await fileGenerator.generateFiles(
        {
          name: validatedParams.name,
          version: '0.1.0',
          description: validatedParams.description,
          files: [
            {
              path: 'package.json',
              content: JSON.stringify(
                {
                  name: validatedParams.name,
                  description: validatedParams.description,
                  version: '0.1.0',
                  private: true,
                },
                null,
                2
              ),
              isTemplate: false,
            },
          ],
          metadata: {},
        },
        validatedParams
      );
      logger.info('Files generated successfully');
      return {
        isError: false,
        content: [{ type: 'text', text: 'Generated files successfully' }],
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate starter kit');
      throw new ValidationError('Failed to generate starter kit', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
