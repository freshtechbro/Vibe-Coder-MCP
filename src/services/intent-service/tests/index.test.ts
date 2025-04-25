// src/services/intent-service/tests/index.test.ts
import { describe, it, expect, vi } from 'vitest'; // Removed beforeEach
// import fs from 'fs'; // Removed unused import
// import path from 'path'; // Removed unused import

// Mock fs.readFileSync before importing the module being tested
vi.mock('fs', () => {
  return {
    readFileSync: vi.fn(() =>
      JSON.stringify({
        tools: {
          'research-manager': {
            description: 'Performs research about technical topics',
            use_cases: ['research', 'comparison'],
            input_patterns: ['research {topic}'],
          },
          'rules-generator': {
            description: 'Creates project guidelines and coding standards',
            use_cases: ['coding standards', 'project guidelines'],
            input_patterns: ['setup rules for {project}'],
          },
        },
      })
    ),
  };
});

// Import after mocking
import { detectIntent, extractContextParameters } from '../index.js';
// import { ToolsConfig } from '../../../types/tools.js'; // Removed unused import

/* // Removed unused variable
const mockToolConfig: ToolsConfig = {
  tools: {
    'research-manager': {
      description: 'Performs research about technical topics',
      use_cases: ['research', 'comparison'],
      input_patterns: ['research {topic}']
    },
    'rules-generator': {
      description: 'Creates project guidelines and coding standards',
      use_cases: ['coding standards', 'project guidelines'],
      input_patterns: ['setup rules for {project}']
    }
  }
};
*/

describe('detectIntent', () => {
  it('should detect intent based on strong description keywords', () => {
    const result = detectIntent('tell me about technical standards');
    // Confidence might vary based on scoring logic, adjust as needed
    expect(result?.toolName).toBe('rules-generator');
    expect(result?.confidence).toBeGreaterThan(0.3);
    expect(result?.matchedPattern).toBe('intent_matching');
  });

  it('should detect intent based on use cases (higher weight)', () => {
    const result = detectIntent('i need to do some research');
    expect(result?.toolName).toBe('research-manager');
    expect(result?.confidence).toBeGreaterThanOrEqual(0.5); // Allow 0.5
    expect(result?.matchedPattern).toBe('intent_matching');
  });

  it('should return null if confidence is too low', () => {
    const result = detectIntent('what is the weather today');
    expect(result).toBeNull();
  });

  // Add more tests for edge cases, overlapping keywords, etc.
});

describe('extractContextParameters', () => {
  it('should extract "for" target', () => {
    const params = extractContextParameters(
      'create rules for my react project'
    );
    expect(params).toHaveProperty('target', 'my react project');
  });

  it('should extract "about" topic', () => {
    const params = extractContextParameters(
      'do research about javascript frameworks'
    );
    expect(params).toHaveProperty('topic', 'javascript frameworks');
  });

  it('should extract simple proper noun entity', () => {
    const params = extractContextParameters('generate stories about React');
    expect(params).toHaveProperty('entity', 'React');
  });

  it('should extract multi-word proper noun entity', () => {
    const params = extractContextParameters('plan tasks for Project Phoenix');
    expect(params).toHaveProperty('entity', 'Project Phoenix');
  });

  it('should handle requests with no clear parameters', () => {
    const params = extractContextParameters('generate a task list');
    expect(params).toEqual({});
  });

  // Add tests for mixed cases, punctuation, etc.
});
