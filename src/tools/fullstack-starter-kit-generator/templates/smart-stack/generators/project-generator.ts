import { z } from 'zod';

import logger from '../../../../../logger.js';
import { OpenRouterConfig } from '../../../../../types/workflow.js';
import { performDirectLlmCall } from '../../../../../utils/llmHelper.js';
import { analyzeRequirements } from '../analyzer/requirements-analyzer.js';
import { selectStack } from '../analyzer/stack-selector.js';

export interface ProjectGeneratorOptions {
  name: string;
  description: string;
  requirements: string[];
  features: string[];
}

const configSchema = z.object({
  name: z.string(),
  description: z.string(),
  requirements: z.array(z.string()),
  features: z.array(z.string()),
});

export async function generateProject(
  options: ProjectGeneratorOptions,
  config: OpenRouterConfig
): Promise<Array<{ path: string; content: string }>> {
  try {
    const validatedOptions = configSchema.parse(options);

    // Analyze requirements
    const analyzedRequirements = await analyzeRequirements(
      {
        requirements: validatedOptions.requirements,
      },
      config
    );

    // Select stack
    const selectedStack = await selectStack(
      {
        requirements: analyzedRequirements,
        features: validatedOptions.features,
      },
      config
    );

    // Generate project files
    const prompt = `
    Generate project files for:
    - Name: ${validatedOptions.name}
    - Description: ${validatedOptions.description}
    - Stack: ${selectedStack}
    - Features: ${validatedOptions.features.join(', ')}
    `;

    const response = await performDirectLlmCall(
      prompt,
      'You are a project generation expert.',
      config,
      'project_generation',
      0.2
    );

    return JSON.parse(response) as Array<{ path: string; content: string }>;
  } catch (error) {
    logger.error({ err: error }, 'Project generation failed');
    return [];
  }
}
