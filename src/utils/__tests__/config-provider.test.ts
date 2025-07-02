/**
 * Comprehensive tests for CI-aware configuration provider
 * Tests the configuration factory pattern and environment detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createConfigProvider,
  getConfigProvider,
  setConfigProvider,
  resetConfigProvider,
  getOpenRouterConfig,
  getModelForTask,
  ProductionConfigProvider,
  TestConfigProvider,
  ConfigurationProvider
} from '../config-provider.js';

describe('Configuration Provider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment and configuration
    resetConfigProvider();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('Environment Detection', () => {
    it('should detect CI environment when CI=true', () => {
      process.env.CI = 'true';
      const provider = createConfigProvider();
      expect(provider).toBeInstanceOf(TestConfigProvider);
    });

    it('should detect CI environment when GITHUB_ACTIONS=true', () => {
      process.env.GITHUB_ACTIONS = 'true';
      const provider = createConfigProvider();
      expect(provider).toBeInstanceOf(TestConfigProvider);
    });

    it('should detect test environment when NODE_ENV=test', () => {
      process.env.NODE_ENV = 'test';
      const provider = createConfigProvider();
      expect(provider).toBeInstanceOf(TestConfigProvider);
    });

    it('should detect test environment when VITEST=true', () => {
      process.env.VITEST = 'true';
      const provider = createConfigProvider();
      expect(provider).toBeInstanceOf(TestConfigProvider);
    });

    it('should use production provider when FORCE_REAL_LLM_CONFIG=true', () => {
      process.env.CI = 'true';
      process.env.FORCE_REAL_LLM_CONFIG = 'true';
      const provider = createConfigProvider();
      expect(provider).toBeInstanceOf(ProductionConfigProvider);
    });

    it('should use production provider in normal environments', () => {
      // Clear all CI/test indicators
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.NODE_ENV;
      delete process.env.VITEST;
      delete process.env.CI_SAFE_MODE;
      
      const provider = createConfigProvider();
      expect(provider).toBeInstanceOf(ProductionConfigProvider);
    });
  });

  describe('TestConfigProvider', () => {
    let provider: TestConfigProvider;

    beforeEach(() => {
      provider = new TestConfigProvider();
    });

    it('should provide safe default configuration', async () => {
      const config = await provider.getOpenRouterConfig();
      
      expect(config).toMatchObject({
        baseUrl: 'https://test.openrouter.ai/api/v1',
        apiKey: 'ci-test-key-safe-provider',
        geminiModel: 'google/gemini-2.5-flash-preview-05-20',
        perplexityModel: 'perplexity/llama-3.1-sonar-small-128k-online'
      });
      
      expect(config.llm_mapping).toBeDefined();
      expect(config.llm_mapping?.default_generation).toBe('google/gemini-2.5-flash-preview-05-20');
    });

    it('should return model for known task', () => {
      const model = provider.getModelForTask('task_decomposition');
      expect(model).toBe('google/gemini-2.5-flash-preview-05-20');
    });

    it('should return fallback model for unknown task', () => {
      const model = provider.getModelForTask('unknown_task');
      expect(model).toBe('google/gemini-2.5-flash-preview-05-20');
    });

    it('should validate configuration as valid', () => {
      const result = provider.validateConfiguration();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toContain('Using test configuration provider');
    });

    it('should correctly identify test environment', () => {
      expect(provider.isTestEnvironment()).toBe(true);
      expect(provider.isCIEnvironment()).toBe(true);
    });

    it('should allow updating mock configuration', () => {
      provider.updateMockConfig({
        apiKey: 'updated-test-key',
        geminiModel: 'google/gemini-updated'
      });

      const model = provider.getModelForTask('any_task');
      expect(model).toBe('google/gemini-updated');
    });

    it('should reset mock configuration', async () => {
      provider.updateMockConfig({ apiKey: 'changed' });
      provider.resetMockConfig();
      
      const config = await provider.getOpenRouterConfig();
      expect(config.apiKey).toBe('ci-test-key-safe-provider');
    });

    it('should return deep copy of configuration', async () => {
      const config1 = await provider.getOpenRouterConfig();
      const config2 = await provider.getOpenRouterConfig();
      
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
      
      // Modify one should not affect the other
      config1.apiKey = 'modified';
      expect(config2.apiKey).toBe('ci-test-key-safe-provider');
    });
  });

  describe('ProductionConfigProvider', () => {
    let provider: ProductionConfigProvider;

    beforeEach(() => {
      provider = new ProductionConfigProvider();
    });

    it('should detect test environment correctly', () => {
      process.env.NODE_ENV = 'test';
      expect(provider.isTestEnvironment()).toBe(true);
    });

    it('should detect CI environment correctly', () => {
      process.env.CI = 'true';
      expect(provider.isCIEnvironment()).toBe(true);
      
      delete process.env.CI;
      process.env.GITHUB_ACTIONS = 'true';
      expect(provider.isCIEnvironment()).toBe(true);
    });
  });

  describe('Global Configuration Provider', () => {
    it('should create provider instance on first call', () => {
      resetConfigProvider();
      const provider1 = getConfigProvider();
      const provider2 = getConfigProvider();
      
      expect(provider1).toBe(provider2);
    });

    it('should allow overriding provider', () => {
      const customProvider: ConfigurationProvider = {
        async getOpenRouterConfig() {
          return {
            baseUrl: 'custom-url',
            apiKey: 'custom-key',
            geminiModel: 'custom-model',
            perplexityModel: 'custom-perplexity'
          };
        },
        getModelForTask() {
          return 'custom-model';
        },
        validateConfiguration() {
          return { valid: true, errors: [], warnings: [], suggestions: [] };
        },
        isTestEnvironment() {
          return false;
        },
        isCIEnvironment() {
          return false;
        }
      };

      setConfigProvider(customProvider);
      const provider = getConfigProvider();
      
      expect(provider).toBe(customProvider);
    });

    it('should reset provider correctly', () => {
      const customProvider = new TestConfigProvider();
      setConfigProvider(customProvider);
      
      resetConfigProvider();
      
      // Should create new provider based on environment
      process.env.CI = 'true';
      const newProvider = getConfigProvider();
      
      expect(newProvider).not.toBe(customProvider);
      expect(newProvider).toBeInstanceOf(TestConfigProvider);
    });
  });

  describe('Convenience Functions', () => {
    beforeEach(() => {
      process.env.CI = 'true'; // Use test provider
    });

    it('should get OpenRouter config using global provider', async () => {
      const config = await getOpenRouterConfig();
      
      expect(config).toMatchObject({
        baseUrl: 'https://test.openrouter.ai/api/v1',
        apiKey: 'ci-test-key-safe-provider'
      });
    });

    it('should get model for task using global provider', () => {
      const model = getModelForTask('task_decomposition');
      expect(model).toBe('google/gemini-2.5-flash-preview-05-20');
    });
  });

  describe('CI Environment Simulation', () => {
    it('should work correctly in simulated GitHub Actions environment', async () => {
      // Simulate GitHub Actions environment
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';
      process.env.NODE_ENV = 'test';
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_BASE_URL;
      
      const provider = createConfigProvider();
      expect(provider).toBeInstanceOf(TestConfigProvider);
      
      const config = await provider.getOpenRouterConfig();
      expect(config.apiKey).toBe('ci-test-key-safe-provider');
      expect(config.baseUrl).toBe('https://test.openrouter.ai/api/v1');
      
      const validation = provider.validateConfiguration();
      expect(validation.valid).toBe(true);
    });

    it('should handle missing environment variables gracefully', async () => {
      process.env.CI = 'true';
      
      // Remove all OpenRouter environment variables
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_BASE_URL;
      delete process.env.GEMINI_MODEL;
      delete process.env.PERPLEXITY_MODEL;
      
      const provider = createConfigProvider();
      const config = await provider.getOpenRouterConfig();
      
      // Should still work with safe defaults
      expect(config.apiKey).toBeTruthy();
      expect(config.baseUrl).toBeTruthy();
      expect(config.geminiModel).toBeTruthy();
      expect(config.perplexityModel).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined llm_mapping gracefully', () => {
      const provider = new TestConfigProvider();
      provider.updateMockConfig({ llm_mapping: undefined as unknown as Record<string, string> });
      
      const model = provider.getModelForTask('any_task');
      expect(model).toBe('google/gemini-2.5-flash-preview-05-20');
    });

    it('should handle concurrent configuration requests', async () => {
      process.env.CI = 'true';
      
      const provider = getConfigProvider();
      
      // Make multiple concurrent requests
      const promises = Array(10).fill(null).map(() => 
        provider.getOpenRouterConfig()
      );
      
      const results = await Promise.all(promises);
      
      // All should return valid configurations
      results.forEach(config => {
        expect(config.apiKey).toBe('ci-test-key-safe-provider');
      });
    });
  });
});