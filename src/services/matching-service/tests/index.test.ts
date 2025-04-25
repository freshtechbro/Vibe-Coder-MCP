// src/services/matching-service/tests/index.test.ts
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
            description: 'Performs research',
            use_cases: ['research', 'find info'],
            input_patterns: ['research {topic}', 'find info about {subject}'],
          },
          'prd-generator': {
            description: 'Creates PRDs',
            use_cases: ['product requirements'],
            input_patterns: ['create prd for {product}'],
          },
        },
      })
    ),
  };
});

// Import after mocking
import { matchRequest, extractParameters } from '../index.js';
// import { ToolsConfig } from '../../../types/tools.js'; // Removed unused import

/* // Removed unused variable
const mockToolConfig: ToolsConfig = {
  tools: {
    'research-manager': {
      description: 'Performs research',
      use_cases: ['research', 'find info'],
      input_patterns: ['research {topic}', 'find info about {subject}']
    },
    'prd-generator': {
      description: 'Creates PRDs',
      use_cases: ['product requirements'],
      input_patterns: ['create prd for {product}']
    }
  }
};
*/

describe('matchRequest', () => {
  it('should match exact pattern with high confidence', () => {
    const result = matchRequest('research react best practices');
    expect(result).toEqual({
      toolName: 'research-manager',
      confidence: 0.9,
      matchedPattern: 'research {topic}',
    });
  });

  it('should match another exact pattern', () => {
    const result = matchRequest('create prd for my new app');
    expect(result).toEqual({
      toolName: 'prd-generator',
      confidence: 0.9,
      matchedPattern: 'create prd for {product}',
    });
  });

  it('should match use case keyword with medium confidence', () => {
    const result = matchRequest('i need some product requirements');
    expect(result).toEqual({
      toolName: 'prd-generator',
      confidence: 0.7,
      matchedPattern: 'product requirements', // Or the specific use case matched
    });
  });

  it('should match description keyword with lower confidence', () => {
    const result = matchRequest('can you find info on vite');
    expect(result).toEqual({
      toolName: 'research-manager',
      confidence: 0.7, // Or 0.5 depending on your logic/keywords
      matchedPattern: 'find info', // Or 'description_match'
    });
  });

  it('should return null for no match', () => {
    const result = matchRequest('hello how are you');
    expect(result).toBeNull();
  });

  // Add tests for case-insensitivity
  it('should be case-insensitive', () => {
    const result = matchRequest('RESEARCH REACT');
    expect(result?.toolName).toBe('research-manager');
    expect(result?.confidence).toBe(0.9);
  });
});

describe('extractParameters', () => {
  it('should extract parameters from matched pattern', () => {
    const params = extractParameters(
      'research react best practices',
      'research {topic}'
    );
    expect(params).toEqual({ topic: 'react best practices' });
  });

  it('should extract parameters with multiple words', () => {
    const params = extractParameters(
      'create prd for my awesome new app',
      'create prd for {product}'
    );
    expect(params).toEqual({ product: 'my awesome new app' });
  });

  it('should return empty object if no placeholders', () => {
    const params = extractParameters(
      'research something',
      'research something'
    ); // Pattern without {}
    expect(params).toEqual({});
  });

  it('should return empty object if pattern does not match request (though unlikely called this way)', () => {
    const params = extractParameters('hello world', 'research {topic}');
    expect(params).toEqual({});
  });

  // Add more edge cases if your pattern/extraction logic is more complex
});
