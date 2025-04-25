import logger from '@/logger.js';
import { OpenRouterConfig } from '@/types/workflow.js';
import { selectModelForTask } from '@/utils/configLoader.js';

export async function performDirectLlmCall(
  prompt: string,
  systemPrompt: string,
  config: OpenRouterConfig,
  purpose: string,
  temperature?: number
): Promise<string> {
  try {
    // Select the appropriate model for the task
    const modelToUse = selectModelForTask(config, purpose, config.defaultModel);
    logger.debug({ purpose, modelToUse }, `Using model for ${purpose}`);

    const response = await fetch(config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: temperature ?? config.temperature,
        max_tokens: config.maxTokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    logger.error({ err: error, purpose }, 'LLM call failed');
    throw error;
  }
}
