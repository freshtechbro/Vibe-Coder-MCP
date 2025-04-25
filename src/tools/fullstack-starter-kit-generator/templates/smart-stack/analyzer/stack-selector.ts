import { z } from 'zod';

import logger from '../../../../../logger.js';
import { OpenRouterConfig } from '../../../../../types/workflow.js';
import { performDirectLlmCall } from '../../../../../utils/llmHelper.js';

export interface StackSelectorOptions {
  requirements: string[];
  features: string[];
}

const configSchema = z.object({
  requirements: z.array(z.string()),
  features: z.array(z.string()),
});

export async function selectStack(
  options: StackSelectorOptions,
  config: OpenRouterConfig
): Promise<string> {
  try {
    const validatedOptions = configSchema.parse(options);

    const prompt = `
    Select a stack based on:
    Requirements:
    ${validatedOptions.requirements.join('\n')}
    Features:
    ${validatedOptions.features.join('\n')}
    `;

    const response = await performDirectLlmCall(
      prompt,
      'You are a stack selection expert.',
      config,
      'stack_selection',
      0.2
    );

    return response;
  } catch (error) {
    logger.error({ err: error }, 'Stack selection failed');
    throw error;
  }
}
