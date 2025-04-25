import { z } from 'zod';

import logger from '../../../../../logger.js';
import { OpenRouterConfig } from '../../../../../types/mcp.js';
import { performDirectLlmCall } from '../../../../../utils/llmHelper.js';

export interface ConfigGeneratorOptions {
  features: string[];
  environment: 'development' | 'production' | 'test';
  database: 'postgresql' | 'mysql';
  auth: 'jwt' | 'oauth2';
}

const configSchema = z.object({
  features: z.array(z.string()),
  environment: z.enum(['development', 'production', 'test']),
  database: z.enum(['postgresql', 'mysql']),
  auth: z.enum(['jwt', 'oauth2']),
});

export async function generateConfig(
  options: ConfigGeneratorOptions,
  config: OpenRouterConfig
): Promise<Array<{ path: string; content: string }>> {
  try {
    const validatedOptions = configSchema.parse(options);

    const prompt = `
    Generate configuration files for:
    - Features: ${validatedOptions.features.join(', ')}
    - Environment: ${validatedOptions.environment}
    - Database: ${validatedOptions.database}
    - Auth: ${validatedOptions.auth}

    Include:
    1. Environment variables
    2. Database connection
    3. Auth settings
    4. Feature flags
    5. Logging configuration
    `;

    const response = await performDirectLlmCall(
      prompt,
      'You are a configuration expert.',
      config,
      'config_generation',
      0.2
    );

    const configs = JSON.parse(response) as Array<{
      path: string;
      content: string;
    }>;
    return configs;
  } catch (error) {
    logger.error({ err: error }, 'Config generation failed');
    return [];
  }
}
