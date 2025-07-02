/**
 * Configuration Provider Pattern
 * 
 * Provides testable configuration management with dependency injection support.
 * Follows TypeScript best practices and DRY principles.
 */

import { OpenRouterConfig } from '../types/workflow.js';
import { OpenRouterConfigManager, ConfigValidationResult } from './openrouter-config-manager.js';
import logger from '../logger.js';

/**
 * Configuration provider interface for dependency injection
 */
export interface ConfigurationProvider {
  getOpenRouterConfig(): Promise<OpenRouterConfig>;
  getModelForTask(taskName: string): string;
  validateConfiguration(): ConfigValidationResult;
  isTestEnvironment(): boolean;
  isCIEnvironment(): boolean;
}

/**
 * Production configuration provider using the real OpenRouterConfigManager
 */
export class ProductionConfigProvider implements ConfigurationProvider {
  async getOpenRouterConfig(): Promise<OpenRouterConfig> {
    return OpenRouterConfigManager.getInstance().getOpenRouterConfig();
  }
  
  getModelForTask(taskName: string): string {
    return OpenRouterConfigManager.getInstance().getModelForTask(taskName);
  }
  
  validateConfiguration(): ConfigValidationResult {
    return OpenRouterConfigManager.getInstance().validateConfiguration();
  }
  
  isTestEnvironment(): boolean {
    return process.env.NODE_ENV === 'test';
  }

  isCIEnvironment(): boolean {
    return (
      process.env.CI === 'true' ||
      process.env.GITHUB_ACTIONS === 'true' ||
      process.env.NODE_ENV === 'test' ||
      process.env.VITEST === 'true'
    );
  }
}

/**
 * Test configuration provider with safe defaults for CI/test environments
 */
export class TestConfigProvider implements ConfigurationProvider {
  private mockConfig: OpenRouterConfig = {
    baseUrl: 'https://test.openrouter.ai/api/v1',
    apiKey: 'ci-test-key-safe-provider',
    geminiModel: 'google/gemini-2.5-flash-preview-05-20',
    perplexityModel: 'perplexity/llama-3.1-sonar-small-128k-online',
    llm_mapping: { 
      default_generation: 'google/gemini-2.5-flash-preview-05-20',
      task_decomposition: 'google/gemini-2.5-flash-preview-05-20',
      intent_recognition: 'google/gemini-2.5-flash-preview-05-20'
    }
  };

  async getOpenRouterConfig(): Promise<OpenRouterConfig> {
    // Return a deep copy to prevent external modifications
    return {
      baseUrl: this.mockConfig.baseUrl,
      apiKey: this.mockConfig.apiKey,
      geminiModel: this.mockConfig.geminiModel,
      perplexityModel: this.mockConfig.perplexityModel,
      llm_mapping: this.mockConfig.llm_mapping ? { ...this.mockConfig.llm_mapping } : undefined
    };
  }
  
  getModelForTask(taskName: string): string {
    return this.mockConfig.llm_mapping?.[taskName] ?? this.mockConfig.geminiModel;
  }
  
  validateConfiguration(): ConfigValidationResult {
    return { 
      valid: true, 
      errors: [], 
      warnings: ['Using test configuration provider'], 
      suggestions: [] 
    };
  }
  
  isTestEnvironment(): boolean {
    return true;
  }

  isCIEnvironment(): boolean {
    return true;
  }

  /**
   * Update mock configuration for specific test scenarios
   */
  updateMockConfig(updates: Partial<OpenRouterConfig>): void {
    this.mockConfig = { ...this.mockConfig, ...updates };
    logger.debug({ updates }, 'Updated test configuration provider');
  }

  /**
   * Reset to default mock configuration
   */
  resetMockConfig(): void {
    this.mockConfig = {
      baseUrl: 'https://test.openrouter.ai/api/v1',
      apiKey: 'ci-test-key-safe-provider',
      geminiModel: 'google/gemini-2.5-flash-preview-05-20',
      perplexityModel: 'perplexity/llama-3.1-sonar-small-128k-online',
      llm_mapping: { 
        default_generation: 'google/gemini-2.5-flash-preview-05-20',
        task_decomposition: 'google/gemini-2.5-flash-preview-05-20',
        intent_recognition: 'google/gemini-2.5-flash-preview-05-20'
      }
    };
    logger.debug('Reset test configuration provider to defaults');
  }
}

/**
 * Factory function to create appropriate configuration provider
 * Uses environment detection to determine the right provider
 */
export function createConfigProvider(): ConfigurationProvider {
  const isCIOrTest = (
    process.env.CI === 'true' ||
    process.env.NODE_ENV === 'test' ||
    process.env.VITEST === 'true' ||
    process.env.CI_SAFE_MODE === 'true'
  );
  
  if (isCIOrTest && process.env.FORCE_REAL_LLM_CONFIG !== 'true') {
    logger.debug('Creating test configuration provider for CI/test environment');
    return new TestConfigProvider();
  } else {
    logger.debug('Creating production configuration provider');
    return new ProductionConfigProvider();
  }
}

/**
 * Global configuration provider instance
 * Can be overridden for testing
 */
let globalConfigProvider: ConfigurationProvider | null = null;

/**
 * Get the global configuration provider instance
 */
export function getConfigProvider(): ConfigurationProvider {
  if (!globalConfigProvider) {
    globalConfigProvider = createConfigProvider();
  }
  return globalConfigProvider;
}

/**
 * Override the global configuration provider (for testing)
 */
export function setConfigProvider(provider: ConfigurationProvider): void {
  globalConfigProvider = provider;
  logger.debug('Global configuration provider overridden');
}

/**
 * Reset the global configuration provider to auto-detect
 */
export function resetConfigProvider(): void {
  globalConfigProvider = null;
  logger.debug('Global configuration provider reset');
}

/**
 * Convenience function to get OpenRouter configuration using the global provider
 */
export async function getOpenRouterConfig(): Promise<OpenRouterConfig> {
  const provider = getConfigProvider();
  return await provider.getOpenRouterConfig();
}

/**
 * Convenience function to get model for task using the global provider
 */
export function getModelForTask(taskName: string): string {
  const provider = getConfigProvider();
  return provider.getModelForTask(taskName);
}