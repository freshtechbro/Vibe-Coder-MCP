import logger from '../../logger.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { loadLlmConfigMapping } from '../../utils/configLoader.js';
import { performDirectLlmCall } from '../../utils/llmHelper.js';

export async function processRequest(
  request: string,
  config: Record<string, unknown>
): Promise<string> {
  try {
    const openRouterConfig: OpenRouterConfig = {
      apiKey: config.apiKey as string,
      baseUrl: config.baseUrl as string,
      defaultModel: config.defaultModel as string,
      temperature: config.temperature as number,
      maxTokens: config.maxTokens as number,
      llm_mapping: loadLlmConfigMapping(),
    };

    const response = await performDirectLlmCall(
      request,
      'You are a helpful assistant.',
      openRouterConfig,
      'request_processing',
      0.7
    );

    return response;
  } catch (error) {
    logger.error({ err: error }, 'Request processing failed');
    throw error;
  }
}
