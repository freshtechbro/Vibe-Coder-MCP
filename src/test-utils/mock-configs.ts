import { OpenRouterConfig } from '../types/workflow.js';
import { loadLlmConfigMapping } from '../utils/configLoader.js';

/**
 * Standard mock config for OpenRouter that satisfies the interface requirements
 * Can be used in test files to avoid TypeScript errors
 */
export const mockOpenRouterConfig: OpenRouterConfig = {
  apiKey: 'test-api-key',
  baseUrl: 'https://test-base-url.com',
  defaultModel: 'google/gemini-2.5-flash-preview',
  temperature: 0.7,
  maxTokens: 1000,
  llm_mapping: {
    // Mock mapping for tests
    starter_kit_generation: 'openai/gpt-4-0125-preview',
    research_execution: 'google/gemini-2.5-flash-preview:online',
    default_generation: 'openai/gpt-3.5-turbo-0125',
    user_stories_generation: 'openai/gpt-4-0125-preview',
    task_list_generation: 'openai/gpt-4-0125-preview',
    rules_generation: 'openai/gpt-4-0125-preview',
    prd_generation: 'openai/gpt-4-0125-preview',
  },
  api_config: {
    provider: 'openrouter',
    base_url: 'https://test-base-url.com',
    web_search: {
      enabled: true,
      max_results: 3,
      search_prompt: 'Test search prompt for research',
    },
  },
};
