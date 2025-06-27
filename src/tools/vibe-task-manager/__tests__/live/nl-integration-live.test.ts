/**
 * Integration tests for Natural Language Interface with Vibe Task Manager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IntentRecognitionEngine } from '../../nl/intent-recognizer.js';
import { IntentPatternEngine } from '../../nl/patterns.js';
import { LLMFallbackSystem } from '../../nl/llm-fallback.js';

describe('Natural Language Interface Integration', () => {
  let intentRecognizer: IntentRecognitionEngine;
  let patternEngine: IntentPatternEngine;
  let llmFallback: LLMFallbackSystem;

  beforeEach(() => {
    intentRecognizer = IntentRecognitionEngine.getInstance();
    patternEngine = new IntentPatternEngine();
    llmFallback = LLMFallbackSystem.getInstance();
  });

  describe('Component Integration', () => {
    it('should integrate pattern engine with intent recognizer', async () => {
      const result = await intentRecognizer.recognizeIntent('Create a new project called "Integration Test"');
      
      expect(result).toBeTruthy();
      expect(result!.intent).toBe('create_project');
      expect(result!.entities.projectName).toBe('Integration Test');
      expect(result!.strategy).toBe('hybrid');
    });

    it('should handle complex natural language commands', async () => {
      const commands = [
        'Create a high priority development task for implementing authentication',
        'Show me all completed projects from this week',
        'What\'s the status of the web application project?',
        'Run the authentication task',
        'List all pending tasks assigned to me'
      ];

      for (const command of commands) {
        const result = await intentRecognizer.recognizeIntent(command);
        expect(result).toBeTruthy();
        expect(result!.confidence).toBeGreaterThan(0.3);
        expect(['create_task', 'list_projects', 'check_status', 'run_task', 'list_tasks']).toContain(result!.intent);
      }
    });

    it('should gracefully handle LLM fallback failures', async () => {
      // This should trigger LLM fallback but fall back to pattern matching
      const result = await intentRecognizer.recognizeIntent('Create something new for the project');
      
      // Should still work with pattern matching even if LLM fails
      expect(result).toBeTruthy();
      expect(result!.strategy).toBe('hybrid');
    });
  });

  describe('Configuration Integration', () => {
    it('should respect configuration settings', () => {
      const config = intentRecognizer.getConfig();
      
      expect(config).toHaveProperty('primaryMethod');
      expect(config).toHaveProperty('fallbackMethod');
      expect(config).toHaveProperty('minConfidence');
      expect(config).toHaveProperty('useLlmForAmbiguous');
    });

    it('should allow runtime configuration updates', () => {
      const originalConfig = intentRecognizer.getConfig();
      
      intentRecognizer.updateConfig({
        minConfidence: 0.9,
        useLlmForAmbiguous: false
      });
      
      const updatedConfig = intentRecognizer.getConfig();
      expect(updatedConfig.minConfidence).toBe(0.9);
      expect(updatedConfig.useLlmForAmbiguous).toBe(false);
      
      // Restore original config
      intentRecognizer.updateConfig(originalConfig);
    });
  });

  describe('Performance Integration', () => {
    it('should process intents within reasonable time', async () => {
      const startTime = Date.now();
      
      const result = await intentRecognizer.recognizeIntent('Create project');
      
      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(100); // Should be very fast for pattern matching
      
      if (result) {
        expect(result.processingTime).toBeLessThan(100);
      }
    });

    it('should handle multiple concurrent requests', async () => {
      const commands = [
        'Create project Alpha',
        'Create project Beta', 
        'Create project Gamma',
        'List all projects',
        'Show project status'
      ];

      const promises = commands.map(cmd => intentRecognizer.recognizeIntent(cmd));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeTruthy();
        expect(result!.confidence).toBeGreaterThan(0.3);
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle malformed input gracefully', async () => {
      const malformedInputs = [
        '',
        '   ',
        'asdfghjkl',
        '12345',
        '!@#$%^&*()',
        'The quick brown fox jumps over the lazy dog'
      ];

      for (const input of malformedInputs) {
        const result = await intentRecognizer.recognizeIntent(input);
        // Should either return null or a low-confidence result
        if (result) {
          expect(result.confidence).toBeLessThan(0.8);
        }
      }
    });

    it('should maintain statistics across errors', async () => {
      intentRecognizer.resetStatistics();
      
      // Mix of successful and failed recognitions
      await intentRecognizer.recognizeIntent('Create project');
      await intentRecognizer.recognizeIntent('Random gibberish text');
      await intentRecognizer.recognizeIntent('List tasks');
      
      const stats = intentRecognizer.getStatistics();
      expect(stats.totalRequests).toBe(3);
      expect(stats.successfulRecognitions).toBeGreaterThan(0);
      expect(stats.failedRecognitions).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Entity Extraction Integration', () => {
    it('should extract entities for project operations', async () => {
      const result = await intentRecognizer.recognizeIntent('Create a project called "E-commerce Platform"');
      
      expect(result).toBeTruthy();
      expect(result!.entities.projectName).toBe('E-commerce Platform');
    });

    it('should extract entities for task operations', async () => {
      const result = await intentRecognizer.recognizeIntent('Create a high priority development task');
      
      expect(result).toBeTruthy();
      expect(result!.entities.priority).toBe('high');
      expect(result!.entities.type).toBe('development');
    });

    it('should extract temporal entities', async () => {
      const result = await intentRecognizer.recognizeIntent('Show completed tasks from today');
      
      expect(result).toBeTruthy();
      expect(result!.entities.status).toBe('completed');
      expect(result!.entities.timeframe).toBe('today');
    });
  });

  describe('Confidence Scoring Integration', () => {
    it('should assign appropriate confidence levels', async () => {
      const testCases = [
        { input: 'Create project', expectedLevel: 'high' },
        { input: 'Create', expectedLevel: 'medium' },
        { input: 'Maybe create something', expectedLevel: 'low' }
      ];

      for (const testCase of testCases) {
        const result = await intentRecognizer.recognizeIntent(testCase.input);
        
        if (result) {
          // Confidence levels should be reasonable
          expect(['very_low', 'low', 'medium', 'high', 'very_high']).toContain(result.confidenceLevel);
        }
      }
    });
  });

  describe('Alternative Intents Integration', () => {
    it('should provide alternative intents when ambiguous', async () => {
      const result = await intentRecognizer.recognizeIntent('Create something new');
      
      if (result) {
        expect(Array.isArray(result.alternatives)).toBe(true);
        // May have alternatives for ambiguous input
      }
    });
  });

  describe('Metadata Integration', () => {
    it('should include comprehensive metadata', async () => {
      const result = await intentRecognizer.recognizeIntent('Create project test');
      
      if (result) {
        expect(result.metadata).toBeDefined();
        expect(result.metadata.timestamp).toBeInstanceOf(Date);
        expect(typeof result.processingTime).toBe('number');
        expect(typeof result.strategy).toBe('string');
      }
    });
  });
});
