import { z } from 'zod';

import logger from '../../../../../logger.js';
import { OpenRouterConfig } from '../../../../../types/workflow.js';
import { performDirectLlmCall } from '../../../../../utils/llmHelper.js';

export interface RequirementsAnalyzerOptions {
  requirements: string[];
}

const configSchema = z.object({
  requirements: z.array(z.string()),
});

export async function analyzeRequirements(
  options: RequirementsAnalyzerOptions,
  config: OpenRouterConfig
): Promise<string[]> {
  try {
    const validatedOptions = configSchema.parse(options);

    const prompt = `
    Analyze these requirements:
    ${validatedOptions.requirements.join('\n')}
    `;

    const response = await performDirectLlmCall(
      prompt,
      'You are a requirements analysis expert.',
      config,
      'requirements_analysis',
      0.2
    );

    return JSON.parse(response) as string[];
  } catch (error) {
    logger.error({ err: error }, 'Requirements analysis failed');
    throw error;
  }
}
