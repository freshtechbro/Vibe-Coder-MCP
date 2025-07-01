/**
 * Tests for Intent Recognition Engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IntentRecognitionEngine } from '../../nl/intent-recognizer.js';

describe('IntentRecognitionEngine', () => {
  let recognitionEngine: IntentRecognitionEngine;

  beforeEach(() => {
    recognitionEngine = IntentRecognitionEngine.getInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = IntentRecognitionEngine.getInstance();
      const instance2 = IntentRecognitionEngine.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Pattern-based Recognition', () => {
    it('should recognize create project intent with high confidence', async () => {
      const result = await recognitionEngine.recognizeIntent('Create a new project called "Test App"');

      expect(result).toBeTruthy();
      expect(result!.intent).toBe('create_project');
      expect(result!.strategy).toBe('hybrid');
      expect(result!.confidence).toBeGreaterThan(0.5);
      expect(result!.entities.projectName).toBe('Test App');
    });

    it('should recognize create task intent', async () => {
      const result = await recognitionEngine.recognizeIntent('Add a new task for implementing authentication');

      expect(result).toBeTruthy();
      expect(result!.intent).toBe('create_task');
      expect(result!.strategy).toBe('hybrid');
      expect(result!.confidence).toBeGreaterThan(0.5);
    });

    it('should recognize list projects intent', async () => {
      const result = await recognitionEngine.recognizeIntent('Show me all projects');

      expect(result).toBeTruthy();
      expect(result!.intent).toBe('list_projects');
      expect(result!.strategy).toBe('hybrid');
      expect(result!.confidence).toBeGreaterThan(0.5);
    });

    it('should recognize status check intent', async () => {
      const result = await recognitionEngine.recognizeIntent('What\'s the status of the web project?');

      expect(result).toBeTruthy();
      expect(result!.intent).toBe('check_status');
      expect(result!.strategy).toBe('hybrid');
      expect(result!.confidence).toBeGreaterThan(0.5);
    });

    it('should recognize run task intent', async () => {
      const result = await recognitionEngine.recognizeIntent('Run task 123');

      expect(result).toBeTruthy();
      expect(result!.intent).toBe('run_task');
      expect(result!.strategy).toBe('hybrid');
      expect(result!.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Context Handling', () => {
    it('should handle context information', async () => {
      const context = {
        currentProject: 'web-app',
        userRole: 'developer'
      };

      const result = await recognitionEngine.recognizeIntent('Create a task', context);

      expect(result).toBeTruthy();
      expect(result!.intent).toBe('create_task');
    });
  });

  describe('Confidence Levels', () => {
    it('should assign appropriate confidence levels', async () => {
      const result = await recognitionEngine.recognizeIntent('Create project');

      expect(result).toBeTruthy();
      expect(result!.confidence).toBeGreaterThan(0);
      expect(result!.confidence).toBeLessThanOrEqual(1);
      expect(['very_low', 'low', 'medium', 'high', 'very_high']).toContain(result!.confidenceLevel);
    });
  });

  describe('Alternative Intents', () => {
    it('should provide alternative intents when available', async () => {
      const result = await recognitionEngine.recognizeIntent('Create something new');

      if (result) {
        expect(Array.isArray(result.alternatives)).toBe(true);
      }
    });
  });

  describe('Unrecognized Input', () => {
    it('should return null for completely unrelated input', async () => {
      const result = await recognitionEngine.recognizeIntent('The weather is nice today');

      expect(result).toBeNull();
    });

    it('should return null for empty input', async () => {
      const result = await recognitionEngine.recognizeIntent('');

      expect(result).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should track recognition statistics', async () => {
      // Reset statistics
      recognitionEngine.resetStatistics();

      // Perform some recognitions
      await recognitionEngine.recognizeIntent('Create project');
      await recognitionEngine.recognizeIntent('List tasks');
      await recognitionEngine.recognizeIntent('Random text that should fail');

      const stats = recognitionEngine.getStatistics();

      expect(stats.totalRequests).toBe(3);
      expect(stats.successfulRecognitions).toBeGreaterThan(0);
      expect(stats.successRate).toBeGreaterThan(0);
      expect(stats.successRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Configuration', () => {
    it('should allow configuration updates', () => {
      const newConfig = {
        minConfidence: 0.8,
        useLlmForAmbiguous: false
      };

      recognitionEngine.updateConfig(newConfig);
      const config = recognitionEngine.getConfig();

      expect(config.minConfidence).toBe(0.8);
      expect(config.useLlmForAmbiguous).toBe(false);
    });

    it('should get current configuration', () => {
      const config = recognitionEngine.getConfig();

      expect(config).toHaveProperty('primaryMethod');
      expect(config).toHaveProperty('fallbackMethod');
      expect(config).toHaveProperty('minConfidence');
      expect(config).toHaveProperty('useLlmForAmbiguous');
    });
  });

  describe('Processing Time', () => {
    it('should track processing time', async () => {
      const result = await recognitionEngine.recognizeIntent('Create a new project');

      if (result) {
        expect(result.processingTime).toBeGreaterThanOrEqual(0);
        expect(typeof result.processingTime).toBe('number');
      }
    });
  });

  describe('Metadata', () => {
    it('should include processing metadata', async () => {
      const result = await recognitionEngine.recognizeIntent('Create project');

      if (result) {
        expect(result.metadata).toBeDefined();
        expect(result.metadata.timestamp).toBeInstanceOf(Date);
      }
    });
  });
});
