import { z } from 'zod';

import logger from '../../../../../logger.js';
import { OpenRouterConfig } from '../../../../../types/workflow.js';
import { performDirectLlmCall } from '../../../../../utils/llmHelper.js';

export interface FeatureTemplate {
  name: string;
  description: string;
  dependencies: string[];
  files: Array<{
    path: string;
    content: string;
  }>;
}

export interface FeatureMatcherOptions {
  features: string[];
  templates: FeatureTemplate[];
}

export function matchFeatures(
  options: FeatureMatcherOptions
): FeatureTemplate[] {
  const { features, templates } = options;
  const matchedTemplates: FeatureTemplate[] = [];

  for (const feature of features) {
    const template = templates.find(
      (t) => t.name.toLowerCase() === feature.toLowerCase()
    );
    if (template) {
      matchedTemplates.push(template);
    }
  }

  return matchedTemplates;
}
