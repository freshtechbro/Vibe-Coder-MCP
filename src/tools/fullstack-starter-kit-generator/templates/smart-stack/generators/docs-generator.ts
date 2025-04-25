import { z } from 'zod';

import logger from '../../../../../logger.js';
import { OpenRouterConfig } from '../../../../../types/workflow.js';
import { performDirectLlmCall } from '../../../../../utils/llmHelper.js';

export interface DocsGeneratorOptions {
  name: string;
  description: string;
  features: string[];
  template: string;
}

const configSchema = z.object({
  name: z.string(),
  description: z.string(),
  features: z.array(z.string()),
  template: z.string(),
});

export async function generateDocs(
  options: DocsGeneratorOptions,
  config: OpenRouterConfig
): Promise<Array<{ path: string; content: string }>> {
  try {
    const validatedOptions = configSchema.parse(options);

    const prompt = `
    Generate documentation files for:
    - Project: ${validatedOptions.name}
    - Description: ${validatedOptions.description}
    - Features: ${validatedOptions.features.join(', ')}
    - Template: ${validatedOptions.template}

    Include:
    1. README.md
    2. API documentation
    3. Setup instructions
    4. Contributing guidelines
    5. Architecture overview
    `;

    const response = await performDirectLlmCall(
      prompt,
      'You are a documentation expert.',
      config,
      'docs_generation',
      0.2
    );

    const docs = JSON.parse(response) as Array<{
      path: string;
      content: string;
    }>;
    return docs;
  } catch (error) {
    logger.error({ err: error }, 'Documentation generation failed');
    return [];
  }
}
