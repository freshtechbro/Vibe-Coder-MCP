import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { mockOpenRouterConfig } from '../../../test-utils/mock-configs.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import * as llmHelper from '../../../utils/llmHelper.js';
import * as researchHelper from '../../../utils/researchHelper.js';
import { generateRules } from '../index.js';

// Mock dependencies
vi.mock('../../../utils/researchHelper.js');
vi.mock('../../../utils/llmHelper.js');
vi.mock('../../../logger.js');

describe('Rules Generator Tool', () => {
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

  it('should generate rules successfully', async () => {
    const mockResearchResult = 'Mock research data about best practices';
    const mockRules = '# Product Rules\n1. Rule one\n2. Rule two';
    vi.mocked(researchHelper.performResearchQuery).mockResolvedValue(
      mockResearchResult
    );
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue(mockRules);

    const result = await generateRules(
      { productDescription: 'Test Product' },
      mockConfig,
      mockContext
    );

    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toBe(mockRules);
    expect(researchHelper.performResearchQuery).toHaveBeenCalledWith(
      expect.stringContaining('Test Product'),
      mockConfig,
      mockContext
    );
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledWith(
      expect.stringContaining(mockResearchResult),
      expect.any(String),
      mockConfig,
      'rules_generation',
      0.3,
      mockContext
    );
  });

  it('should handle empty research results', async () => {
    // Use empty string instead of null to satisfy type constraints
    vi.mocked(researchHelper.performResearchQuery).mockResolvedValue('');

    const result = await generateRules(
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
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue('');

    const result = await generateRules(
      { productDescription: 'Test Product' },
      mockConfig,
      mockContext
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Rules generation failed');
    const errorDetails = result.errorDetails as McpError;
    expect(errorDetails?.message).toContain('Rules generation failed');
  });

  it('should handle research query errors', async () => {
    vi.mocked(researchHelper.performResearchQuery).mockRejectedValue(
      new Error('Research failed')
    );

    const result = await generateRules(
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

    const result = await generateRules(
      { productDescription: 'Test Product' },
      mockConfig,
      mockContext
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('LLM failed');
    const errorDetails = result.errorDetails as McpError;
    expect(errorDetails?.message).toContain('LLM failed');
  });
});
