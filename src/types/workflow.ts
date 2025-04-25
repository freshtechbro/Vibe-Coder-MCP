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
  [key: string]: unknown;
}

export interface WorkflowStep {
  id: string;
  name: string;
  tool: string;
  params: Record<string, unknown>;
  next?: string[];
  onError?: string[];
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  startAt: string;
}

export interface WorkflowExecutionContext {
  workflowId: string;
  stepId: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
}
