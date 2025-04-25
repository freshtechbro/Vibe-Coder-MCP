import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { mockOpenRouterConfig } from '../../../test-utils/mock-configs.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import * as llmHelper from '../../../utils/llmHelper.js';
import * as researchHelper from '../../../utils/researchHelper.js';
import { generateUserStories } from '../index.js';

// Mock dependencies
vi.mock('../../../utils/researchHelper.js');
vi.mock('../../../utils/llmHelper.js');
vi.mock('../../../logger.js');

describe('User Stories Generator Tool', () => {
  // Use standardized mock configuration
  const mockConfig = mockOpenRouterConfig;

  // Mock execution context
  const mockContext = {
    sessionId: 'test-session-id',
    userId: 'test-user-id',
    jobId: 'test-job-id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate user stories successfully', async () => {
    const mockResearchResult = 'Mock research data about user needs';
    const mockUserStories =
      '# User Stories\n1. As a user, I want to...\n2. As a user, I want to...';
    vi.mocked(researchHelper.performResearchQuery).mockResolvedValue(
      mockResearchResult
    );
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue(
      mockUserStories
    );

    const result = await generateUserStories(
      { productDescription: 'Test Product' },
      mockConfig,
      mockContext
    );

    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toBe(mockUserStories);
    expect(researchHelper.performResearchQuery).toHaveBeenCalledWith(
      expect.stringContaining('Test Product'),
      mockConfig,
      mockContext
    );
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledWith(
      expect.stringContaining(mockResearchResult),
      expect.stringContaining(
        'As a [user type], I want to [action] so that [benefit]'
      ),
      mockConfig,
      'user_stories_generation',
      0.3,
      mockContext
    );
  });

  it('should respect maxStories parameter', async () => {
    const mockResearchResult = 'Mock research data';
    const mockUserStories =
      '# User Stories\n1. As a user, I want to...\n2. As a user, I want to...';
    vi.mocked(researchHelper.performResearchQuery).mockResolvedValue(
      mockResearchResult
    );
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue(
      mockUserStories
    );

    const maxStories = 5;
    await generateUserStories(
      { productDescription: 'Test Product', maxStories },
      mockConfig,
      mockContext
    );

    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledWith(
      expect.stringContaining(`up to ${maxStories} stories`),
      expect.stringContaining(
        'As a [user type], I want to [action] so that [benefit]'
      ),
      mockConfig,
      'user_stories_generation',
      0.3,
      mockContext
    );
  });

  it('should handle empty research results', async () => {
    // Use empty string instead of null to satisfy type constraints
    vi.mocked(researchHelper.performResearchQuery).mockResolvedValue('');

    const result = await generateUserStories(
      { productDescription: 'Test Product' },
      mockConfig,
      mockContext
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      'Research query returned no results'
    );
    const errorDetails = result.errorDetails as McpError;
    expect(errorDetails?.message).toContain(
      'Research query returned no results'
    );
  });

  it('should handle LLM generation failure', async () => {
    const mockResearchResult = 'Mock research data';
    vi.mocked(researchHelper.performResearchQuery).mockResolvedValue(
      mockResearchResult
    );
    // Use empty string instead of null to satisfy type constraints
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue('');

    const result = await generateUserStories(
      { productDescription: 'Test Product' },
      mockConfig,
      mockContext
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('User stories generation failed');
    const errorDetails = result.errorDetails as McpError;
    expect(errorDetails?.message).toContain('User stories generation failed');
  });

  it('should handle research query errors', async () => {
    vi.mocked(researchHelper.performResearchQuery).mockRejectedValue(
      new Error('Research failed')
    );

    const result = await generateUserStories(
      { productDescription: 'Test Product' },
      mockConfig,
      mockContext
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Research failed');
    const errorDetails = result.errorDetails as McpError;
    expect(errorDetails?.message).toContain('Research failed');
  });

  it('should handle LLM call errors', async () => {
    const mockResearchResult = 'Mock research data';
    vi.mocked(researchHelper.performResearchQuery).mockResolvedValue(
      mockResearchResult
    );
    vi.mocked(llmHelper.performDirectLlmCall).mockRejectedValue(
      new Error('LLM failed')
    );

    const result = await generateUserStories(
      { productDescription: 'Test Product' },
      mockConfig,
      mockContext
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('LLM failed');
    const errorDetails = result.errorDetails as McpError;
    expect(errorDetails?.message).toContain('LLM failed');
  });

  it('returns async job message with wait instruction', async () => {
    const params = { productDescription: 'Test Product', async: true };
    const result = await generateUserStories(params, {}, mockContext);
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Your request has been received and is being processed as an async job.');
    expect(result.content[0].text).toContain('Job ID:');
    expect(result.content[0].text).toContain('Please wait a moment for the task to complete before attempting to retrieve the job result.');
    expect(result.content[0].text).toContain('To check the status or result of this job, send the following prompt:');
    expect(result.content[0].text).toContain('user-stories-job-result');
  });
});
