export interface CallToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  metadata?: Record<string, unknown>;
  isError?: boolean;
  errorDetails?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Configuration options for using OpenRouter API
 */
export interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  llm_mapping?: Record<string, string>;
  api_config?: {
    provider?: string;
    base_url?: string;
    timeout?: number;
    max_retries?: number;
    retry_delay?: number;
    web_search?: {
      enabled: boolean;
      max_results?: number;
      search_prompt?: string;
    };
  };
  [key: string]: unknown; // Add index signature for compatibility with workflow.ts version
}
