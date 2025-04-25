import { z } from 'zod';

import logger from '../../../../../logger.js';
import { OpenRouterConfig } from '../../../../../types/workflow.js';
import { performDirectLlmCall } from '../../../../../utils/llmHelper.js';
import { FeatureTemplate } from '../analyzer/feature-matcher.js';

export interface TemplateComposerOptions {
  features: FeatureTemplate[];
  dependencies: string[];
}

const configSchema = z.object({
  features: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      dependencies: z.array(z.string()),
      files: z.array(
        z.object({
          path: z.string(),
          content: z.string(),
        })
      ),
    })
  ),
  dependencies: z.array(z.string()),
});

export async function composeTemplate(
  options: TemplateComposerOptions,
  config: OpenRouterConfig
): Promise<Array<{ path: string; content: string }>> {
  try {
    const validatedOptions = configSchema.parse(options);
    const depFeatures: FeatureTemplate[] = [];

    // Collect dependent features
    for (const feature of validatedOptions.features) {
      for (const dep of feature.dependencies) {
        const depFeature = validatedOptions.features.find(
          (f) => f.name === dep
        );
        if (depFeature && !depFeatures.includes(depFeature)) {
          depFeatures.push(depFeature);
        }
      }
    }

    // Combine all features
    const allFeatures = [...depFeatures, ...validatedOptions.features];

    // Generate files
    const files = allFeatures.flatMap((feature) => feature.files);

    return files;
  } catch (error) {
    logger.error({ err: error }, 'Template composition failed');
    return [];
  }
}
