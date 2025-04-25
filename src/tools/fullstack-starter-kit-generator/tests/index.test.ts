import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { OpenRouterConfig } from '../../../types/workflow.js';
import * as llmHelper from '../../../utils/llmHelper.js';
import { generateStarterKit } from '../index.js';

// Mock dependencies
vi.mock('../../../utils/llmHelper.js');
vi.mock('../../../logger.js');

describe('Fullstack Starter Kit Generator Tool', () => {
  const mockConfig: OpenRouterConfig = {
    baseUrl: 'mock-url',
    apiKey: 'test-api-key',
    geminiModel: 'google/gemini-2.5-pro-exp-03-25:free',
    perplexityModel: 'perplexity/sonar-deep-research',
    defaultModel: 'gpt-4-turbo',
    temperature: 0.7,
    maxTokens: 2048,
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
      mockConfig,
      { sessionId: 'test-session' }
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
      mockConfig,
      { sessionId: 'test-session' }
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Project name cannot be empty');
    const errorDetails = result.errorDetails as McpError;
    expect(errorDetails?.message).toContain('Project name cannot be empty');
  });

  it('should handle LLM generation failure', async () => {
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue('');

    const result = await generateStarterKit(
      {
        projectName: 'test-project',
        description: 'A test project',
        features: ['typescript'],
      },
      mockConfig,
      { sessionId: 'test-session' }
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Starter kit generation failed');
    const errorDetails = result.errorDetails as McpError;
    expect(errorDetails?.message).toContain('Starter kit generation failed');
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
      mockConfig,
      { sessionId: 'test-session' }
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('LLM failed');
    const errorDetails = result.errorDetails as McpError;
    expect(errorDetails?.message).toContain('LLM failed');
  });

  it('returns async job message with wait instruction', async () => {
    const params = {
      projectName: 'test-project',
      description: 'A test project',
      features: ['typescript'],
      async: true,
    };
    const result = await generateStarterKit(params, mockConfig, {
      sessionId: 'test-session',
    });
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain(
      'Your request has been received and is being processed as an async job.'
    );
    expect(result.content[0].text).toContain('Job ID:');
    expect(result.content[0].text).toContain(
      'Please wait a moment for the task to complete before attempting to retrieve the job result.'
    );
    expect(result.content[0].text).toContain(
      'To check the status or result of this job, send the following prompt:'
    );
    expect(result.content[0].text).toContain('fullstack-starter-kit-job-result');
  });
});
