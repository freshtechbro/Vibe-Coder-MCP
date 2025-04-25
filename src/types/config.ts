// src/types/config.ts

/**
 * Configuration type for tools, includes environment variables and LLM settings.
 */
export interface McpConfig {
  /** Environment variables for LLM access and other settings */
  env: {
    /** OpenRouter API key */
    OPENROUTER_API_KEY: string;
    /** OpenRouter base URL */
    OPENROUTER_BASE_URL: string;
  };
  /** LLM-specific defaults and override settings */
  llm?: {
    /** Default model name to use for LLM calls */
    defaultModel?: string;
    /** Default temperature for LLM calls */
    defaultTemperature?: number;
    /** Maximum tokens for LLM responses */
    maxTokens?: number;
    /** Additional provider-specific API configuration */
    api_config?: Record<string, unknown>;
  };
}
