/**
 * Focused test suite for default_generation fallback functionality
 * Tests core fallback behavior using selectModelForTask function
 */

import { describe, it, expect, vi } from 'vitest';
import { selectModelForTask } from '../configLoader.js';

// Mock logger
vi.mock('../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('LLM Default Generation Fallback Integration', () => {
  describe('selectModelForTask Function Tests', () => {
    it('should use provided fallback when mapping is empty', () => {
      const config = {
        baseUrl: 'https://test.openrouter.ai/api/v1',
        apiKey: 'test-key',
        geminiModel: 'google/gemini-test',
        perplexityModel: 'perplexity/test-model',
        llm_mapping: {}
      };

      const model = selectModelForTask(config, 'unknown_task', 'fallback-model');
      expect(model).toBe('fallback-model');
    });

    it('should use specific mapping when available', () => {
      const config = {
        baseUrl: 'https://test.openrouter.ai/api/v1',
        apiKey: 'test-key',
        geminiModel: 'google/gemini-test',
        perplexityModel: 'perplexity/test-model',
        llm_mapping: {
          'task_decomposition': 'google/gemini-decomposition'
        }
      };

      const model = selectModelForTask(config, 'task_decomposition', 'fallback-model');
      expect(model).toBe('google/gemini-decomposition');
    });

    it('should use default_generation mapping for unknown tasks', () => {
      const config = {
        baseUrl: 'https://test.openrouter.ai/api/v1',
        apiKey: 'test-key',
        geminiModel: 'google/gemini-test',
        perplexityModel: 'perplexity/test-model',
        llm_mapping: {
          'default_generation': 'google/gemini-configured',
          'task_decomposition': 'google/gemini-decomposition'
        }
      };

      const model = selectModelForTask(config, 'unknown_task', 'fallback-model');
      expect(model).toBe('google/gemini-configured');
    });

    it('should respect provided default model when no config available', () => {
      const emptyConfig = {
        baseUrl: 'https://test.openrouter.ai/api/v1',
        apiKey: 'test-key',
        geminiModel: '',
        perplexityModel: '',
        llm_mapping: {}
      };

      const model = selectModelForTask(emptyConfig, 'unknown_task', 'custom-fallback');
      expect(model).toBe('custom-fallback');
    });

    it('should handle empty llm_mapping gracefully', () => {
      const config = {
        baseUrl: 'https://test.openrouter.ai/api/v1',
        apiKey: 'test-key',
        geminiModel: 'google/gemini-test',
        perplexityModel: 'perplexity/test-model',
        llm_mapping: {}
      };

      const model = selectModelForTask(config, 'any_task', 'fallback-model');
      expect(model).toBe('fallback-model');
    });
  });

  describe('Fallback Priority Tests', () => {
    it('should prioritize specific task mapping over default_generation', () => {
      const config = {
        baseUrl: 'https://test.openrouter.ai/api/v1',
        apiKey: 'test-key',
        geminiModel: 'google/gemini-test',
        perplexityModel: 'perplexity/test-model',
        llm_mapping: {
          'default_generation': 'google/gemini-default',
          'task_decomposition': 'google/gemini-specific'
        }
      };

      const model = selectModelForTask(config, 'task_decomposition', 'fallback-model');
      expect(model).toBe('google/gemini-specific');
    });

    it('should prioritize default_generation over geminiModel', () => {
      const config = {
        baseUrl: 'https://test.openrouter.ai/api/v1',
        apiKey: 'test-key',
        geminiModel: 'google/gemini-test',
        perplexityModel: 'perplexity/test-model',
        llm_mapping: {
          'default_generation': 'google/gemini-default'
        }
      };

      const model = selectModelForTask(config, 'unknown_task', 'fallback-model');
      expect(model).toBe('google/gemini-default');
    });

    it('should use provided fallback when mapping is empty', () => {
      const config = {
        baseUrl: 'https://test.openrouter.ai/api/v1',
        apiKey: 'test-key',
        geminiModel: 'google/gemini-test',
        perplexityModel: 'perplexity/test-model',
        llm_mapping: {}
      };

      const model = selectModelForTask(config, 'unknown_task', 'fallback-model');
      expect(model).toBe('fallback-model');
    });
  });
});
