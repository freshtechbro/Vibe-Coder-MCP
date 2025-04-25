import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as llmHelper from '../../../utils/llmHelper.js';
import { generateStarterKit } from '../index.js';

// Mock dependencies
vi.mock('../../../utils/llmHelper.js');
vi.mock('../../../logger.js');

describe('Fullstack Starter Kit Generator Tool', () => {
  const mockConfig = {
    baseUrl: 'mock-url',
    apiKey: 'test-api-key',
    geminiModel: 'google/gemini-2.5-pro-exp-03-25:free',
    perplexityModel: 'perplexity/sonar-deep-research',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate starter kit successfully', async () => {
    const mockGenerationResult = 'Starter kit generated successfully';
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue(
      mockGenerationResult
    );

    const result = await generateStarterKit(
      {
        projectName: 'test-project',
        description: 'A test project',
        features: ['typescript', 'react', 'next.js'],
      },
      mockConfig
    );

    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toBe(mockGenerationResult);
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledWith(
      expect.stringContaining('test-project'),
      expect.stringMatching(/generate.*starter kit/i),
      mockConfig,
      'starter_kit_generation',
      0.3
    );
  });

  it('should handle empty project name', async () => {
    const result = await generateStarterKit(
      {
        projectName: '',
        description: 'A test project',
        features: ['typescript'],
      },
      mockConfig
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Project name cannot be empty');
    expect(result.errorDetails?.message).toContain(
      'Project name cannot be empty'
    );
  });

  it('should handle LLM generation failure', async () => {
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue(null);

    const result = await generateStarterKit(
      {
        projectName: 'test-project',
        description: 'A test project',
        features: ['typescript'],
      },
      mockConfig
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Starter kit generation failed');
    expect(result.errorDetails?.message).toContain(
      'Starter kit generation failed'
    );
  });

  it('should handle LLM call errors', async () => {
    vi.mocked(llmHelper.performDirectLlmCall).mockRejectedValue(
      new Error('LLM failed')
    );

    const result = await generateStarterKit(
      {
        projectName: 'test-project',
        description: 'A test project',
        features: ['typescript'],
      },
      mockConfig
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('LLM failed');
    expect(result.errorDetails?.message).toContain('LLM failed');
  });
});
