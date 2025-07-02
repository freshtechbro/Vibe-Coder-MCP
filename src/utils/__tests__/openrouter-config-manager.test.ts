/**
 * Focused test suite for OpenRouterConfigManager
 * Tests core functionality without complex validation scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenRouterConfigManager } from '../openrouter-config-manager.js';
import { readFile } from 'fs/promises';

// Interface for OpenRouterConfigManager with private instance property
interface OpenRouterConfigManagerStatic {
  instance: OpenRouterConfigManager | null;
}

// Mock fs/promises since that's what the config manager actually uses
vi.mock('fs/promises', () => ({
  readFile: vi.fn()
}));

const mockReadFile = vi.mocked(readFile);

// Mock logger
vi.mock('../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('OpenRouterConfigManager', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Reset singleton instance
    (OpenRouterConfigManager as unknown as OpenRouterConfigManagerStatic).instance = null;

    // Save original environment
    originalEnv = { ...process.env };

    // Set up test environment variables with valid values
    // Note: In CI-aware mode, these may be overridden by safe defaults
    process.env.NODE_ENV = 'test';
    process.env.OPENROUTER_API_KEY = 'test-api-key';
    process.env.OPENROUTER_BASE_URL = 'https://test.openrouter.ai/api/v1';
    process.env.GEMINI_MODEL = 'google/gemini-2.5-flash-preview-05-20'; // CI-safe default
    process.env.PERPLEXITY_MODEL = 'perplexity/llama-3.1-sonar-small-128k-online'; // CI-safe default

    // Reset mocks
    vi.clearAllMocks();

    // Set default mock response that can be overridden in individual tests
    mockReadFile.mockResolvedValue(JSON.stringify({
      llm_mapping: {
        'default_generation': 'google/gemini-2.5-flash-preview-05-20',
        'task_decomposition': 'google/gemini-2.5-flash-preview-05-20',
        'intent_recognition': 'google/gemini-2.5-flash-preview-05-20'
      }
    }));
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = OpenRouterConfigManager.getInstance();
      const instance2 = OpenRouterConfigManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should create only one instance', () => {
      const instance1 = OpenRouterConfigManager.getInstance();
      const instance2 = OpenRouterConfigManager.getInstance();
      const instance3 = OpenRouterConfigManager.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid environment variables', async () => {
      // Make sure we have a fresh instance with good mock data
      (OpenRouterConfigManager as unknown as OpenRouterConfigManagerStatic).instance = null;
      mockReadFile.mockResolvedValue(JSON.stringify({
        llm_mapping: {
          'default_generation': 'google/gemini-2.5-flash-preview-05-20',
          'task_decomposition': 'google/gemini-2.5-flash-preview-05-20',
          'intent_recognition': 'google/gemini-2.5-flash-preview-05-20'
        }
      }));

      const configManager = OpenRouterConfigManager.getInstance();
      await expect(configManager.initialize()).resolves.not.toThrow();
    });

    it('should use default values when environment variables are missing', async () => {
      // Create a fresh instance for this test
      (OpenRouterConfigManager as unknown as OpenRouterConfigManagerStatic).instance = null;
      
      // Set up good mock data first
      mockReadFile.mockResolvedValue(JSON.stringify({
        llm_mapping: {
          'default_generation': 'google/gemini-test'
        }
      }));
      
      // Clear environment variables that have defaults
      delete process.env.OPENROUTER_BASE_URL;
      delete process.env.GEMINI_MODEL;
      delete process.env.PERPLEXITY_MODEL;

      const configManager = OpenRouterConfigManager.getInstance();
      await configManager.initialize();
      const config = await configManager.getOpenRouterConfig();

      expect(config.baseUrl).toBe('https://test.openrouter.ai/api/v1'); // CI-aware default in test environment
      expect(config.geminiModel).toBe('google/gemini-2.5-flash-preview-05-20');
      expect(config.perplexityModel).toBe('perplexity/llama-3.1-sonar-small-128k-online');
    });

    it('should handle LLM config file not found', async () => {
      (OpenRouterConfigManager as unknown as OpenRouterConfigManagerStatic).instance = null;

      // Override the default mock for this specific test
      // Mock readFile to throw ENOENT error (file not found)
      const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockReadFile.mockRejectedValue(error);

      const configManager = OpenRouterConfigManager.getInstance();
      await expect(configManager.initialize()).resolves.not.toThrow();

      const config = await configManager.getOpenRouterConfig();
      // In test environment, CI-aware configuration provides safe defaults even when file not found
      expect(config.llm_mapping).toBeDefined();
      expect(typeof config.llm_mapping).toBe('object');
    });

    it('should handle invalid JSON in LLM config file gracefully', async () => {
      (OpenRouterConfigManager as unknown as OpenRouterConfigManagerStatic).instance = null;
      mockReadFile.mockResolvedValue('invalid json');

      const configManager = OpenRouterConfigManager.getInstance();
      // Should not throw, should use empty mapping as fallback
      await expect(configManager.initialize()).resolves.not.toThrow();
    });
  });

  describe('Configuration Retrieval', () => {
    it('should return complete OpenRouter configuration', async () => {
      const configManager = OpenRouterConfigManager.getInstance();
      await configManager.initialize();
      const config = await configManager.getOpenRouterConfig();

      expect(config).toHaveProperty('baseUrl');
      expect(config).toHaveProperty('apiKey');
      expect(config).toHaveProperty('geminiModel');
      expect(config).toHaveProperty('perplexityModel');
      expect(config).toHaveProperty('llm_mapping');
    });

    it('should return a deep copy of configuration', async () => {
      const configManager = OpenRouterConfigManager.getInstance();
      await configManager.initialize();
      const config1 = await configManager.getOpenRouterConfig();
      const config2 = await configManager.getOpenRouterConfig();

      expect(config1).not.toBe(config2);
      expect(config1.llm_mapping).not.toBe(config2.llm_mapping);
      expect(config1).toEqual(config2);
    });

    it('should initialize automatically if not initialized', async () => {
      (OpenRouterConfigManager as unknown as OpenRouterConfigManagerStatic).instance = null;
      const configManager = OpenRouterConfigManager.getInstance();
      // Don't call initialize manually

      const config = await configManager.getOpenRouterConfig();
      expect(config).toBeDefined();
    });

    it('should handle file read errors gracefully', async () => {
      (OpenRouterConfigManager as unknown as OpenRouterConfigManagerStatic).instance = null;
      mockReadFile.mockRejectedValue(new Error('File read error'));

      const configManager = OpenRouterConfigManager.getInstance();
      // Should not throw, should use empty mapping as fallback
      await expect(configManager.getOpenRouterConfig()).resolves.toBeDefined();
    });
  });

  describe('Model Selection', () => {
    it('should return mapped model for known task', async () => {
      const configManager = OpenRouterConfigManager.getInstance();
      await configManager.initialize();
      const model = configManager.getModelForTask('task_decomposition');
      expect(model).toBe('google/gemini-2.5-flash-preview-05-20');
    });

    it('should return default model for unknown task', async () => {
      const configManager = OpenRouterConfigManager.getInstance();
      await configManager.initialize();
      const model = configManager.getModelForTask('unknown_task');
      expect(model).toBe('google/gemini-2.5-flash-preview-05-20'); // default_generation value
    });

    it('should return fallback model when no mapping exists', async () => {
      (OpenRouterConfigManager as unknown as OpenRouterConfigManagerStatic).instance = null;
      mockReadFile.mockResolvedValue(JSON.stringify({ llm_mapping: {} }));

      const configManager = OpenRouterConfigManager.getInstance();
      await configManager.initialize();

      const model = configManager.getModelForTask('any_task');
      expect(model).toBe('google/gemini-2.5-flash-preview-05-20'); // from environment
    });

    it('should handle missing default_generation mapping', async () => {
      (OpenRouterConfigManager as unknown as OpenRouterConfigManagerStatic).instance = null;
      mockReadFile.mockResolvedValue(JSON.stringify({
        llm_mapping: {
          'task_decomposition': 'google/gemini-2.5-flash-preview-05-20'
        }
      }));

      const configManager = OpenRouterConfigManager.getInstance();
      await configManager.initialize();

      const model = configManager.getModelForTask('unknown_task');
      expect(model).toBe('google/gemini-2.5-flash-preview-05-20'); // from environment fallback
    });
  });

  describe('Configuration Validation', () => {
    it('should validate complete configuration successfully', async () => {
      const configManager = OpenRouterConfigManager.getInstance();
      await configManager.initialize();
      const validation = configManager.validateConfiguration();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should handle empty LLM mappings gracefully', async () => {
      // This test demonstrates that CI-aware configuration provides robust fallbacks
      // even when trying to force empty mappings, the system uses safe defaults
      (OpenRouterConfigManager as unknown as OpenRouterConfigManagerStatic).instance = null;
      
      mockReadFile.mockResolvedValue(JSON.stringify({ llm_mapping: {} }));

      const configManager = OpenRouterConfigManager.getInstance();
      await configManager.initialize();

      const validation = configManager.validateConfiguration();
      // In CI-aware mode, the system provides fallbacks so validation should still pass
      expect(validation.valid).toBe(true);
      
      const config = await configManager.getOpenRouterConfig();
      expect(config.llm_mapping).toBeDefined();
    });

    it('should not warn when LLM mappings exist', async () => {
      const configManager = OpenRouterConfigManager.getInstance();
      await configManager.initialize();

      const validation = configManager.validateConfiguration();
      // Should not warn about missing mappings when they exist
      expect(validation.warnings.some(warning => warning.includes('No LLM mappings'))).toBe(false);
    });
  });
});
