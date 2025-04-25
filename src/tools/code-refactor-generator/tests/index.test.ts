import fs from 'fs/promises';
import path from 'path';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { OpenRouterConfig } from '../../../types/workflow.js';
import * as llmHelper from '../../../utils/llmHelper.js';
import { generateRefactoring, getRefactorJobStatus } from '../index.js';

// Mock dependencies
vi.mock('../../../utils/llmHelper.js');
vi.mock('../../../logger.js');
vi.mock('fs/promises');

// Shared type for async job status polling in tests
interface JobStatus {
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: { content?: string };
  error?: string;
}

describe('Code Refactor Generator Tool', () => {
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

  it('should generate refactoring suggestions successfully', async () => {
    const mockRefactoringSuggestions =
      '# Refactoring Suggestions\n1. Extract method\n2. Rename variable';
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue(
      mockRefactoringSuggestions
    );

    const result = await generateRefactoring(
      {
        language: 'javascript',
        codeContent: "function foo() { console.log('test'); }",
        refactoringInstructions: 'Improve readability',
      },
      mockConfig,
      { sessionId: 'test-session' }
    );

    expect(result.isError).toBe(false);
    expect(result.content?.[0]?.text).toBe(mockRefactoringSuggestions);
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledWith(
      expect.stringContaining('function foo()'),
      expect.stringMatching(/refactor.*improve readability/i),
      mockConfig,
      'code_refactoring',
      0.3
    );
  });

  it('should handle empty code snippet', async () => {
    const result = await generateRefactoring(
      {
        language: 'javascript',
        codeContent: '',
        refactoringInstructions: 'Improve readability',
      },
      mockConfig,
      { sessionId: 'test-session' }
    );

    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain('Code snippet cannot be empty');
    const errorDetails = result.errorDetails as McpError;
    expect(errorDetails?.message).toContain('Code snippet cannot be empty');
  });

  it('should handle LLM generation failure', async () => {
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue('');

    const result = await generateRefactoring(
      {
        language: 'javascript',
        codeContent: 'function foo() {}',
        refactoringInstructions: 'Improve readability',
      },
      mockConfig,
      { sessionId: 'test-session' }
    );

    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain(
      'Refactoring generation failed'
    );
    const errorDetails = result.errorDetails as McpError;
    expect(errorDetails?.message).toContain('Refactoring generation failed');
  });

  it('should handle LLM call errors', async () => {
    vi.mocked(llmHelper.performDirectLlmCall).mockRejectedValue(
      new Error('LLM failed')
    );

    const result = await generateRefactoring(
      {
        language: 'javascript',
        codeContent: 'function foo() {}',
        refactoringInstructions: 'Improve readability',
      },
      mockConfig,
      { sessionId: 'test-session' }
    );

    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain('LLM failed');
    const errorDetails = result.errorDetails as McpError;
    expect(errorDetails?.message).toContain('LLM failed');
  });

  it('should write LLM output to outputFilePath if provided', async () => {
    const mockRefactoringSuggestions = 'Refactored code here';
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue(
      mockRefactoringSuggestions
    );
    const mockWriteFile = vi.mocked(fs.writeFile);
    mockWriteFile.mockResolvedValueOnce();

    const result = await generateRefactoring(
      {
        language: 'typescript',
        codeContent: 'let a = 1;',
        refactoringInstructions: 'Use const',
        outputFilePath: 'mock/path/refactored.ts',
      },
      mockConfig,
      { sessionId: 'test-session' }
    );

    expect(result.isError).toBe(false);
    expect(result.content?.[0]?.text).toBe(mockRefactoringSuggestions);
    const [filePath] = mockWriteFile.mock.calls[0];
    expect(path.basename(filePath as string)).toBe('refactored.ts');
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.any(String),
      mockRefactoringSuggestions,
      'utf-8'
    );
  });

  it('should return error if writing to outputFilePath fails', async () => {
    const mockRefactoringSuggestions = 'Refactored code here';
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue(
      mockRefactoringSuggestions
    );
    const mockWriteFile = vi.mocked(fs.writeFile);
    mockWriteFile.mockRejectedValueOnce(new Error('Disk full'));

    const result = await generateRefactoring(
      {
        language: 'typescript',
        codeContent: 'let a = 1;',
        refactoringInstructions: 'Use const',
        outputFilePath: 'mock/path/refactored.ts',
      },
      mockConfig,
      { sessionId: 'test-session' }
    );

    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain(
      'Failed to write refactored code to outputFilePath'
    );
    const [filePath] = mockWriteFile.mock.calls[0];
    expect(path.basename(filePath as string)).toBe('refactored.ts');
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.any(String),
      mockRefactoringSuggestions,
      'utf-8'
    );
  });

  // --- ASYNC EXECUTION TESTS ---
  it('should submit an async job and complete successfully', async () => {
    const mockRefactoringSuggestions =
      'async refactored code';
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValueOnce(
      mockRefactoringSuggestions
    );

    const result = await generateRefactoring(
      {
        language: 'javascript',
        codeContent: 'function foo() { return 1; }',
        refactoringInstructions: 'Make it async',
        async: true,
      },
      mockConfig,
      { sessionId: 'async-session' }
    );

    expect(result.isError).toBe(false);
    expect(result.jobId).toBeDefined();
    expect(result.content?.[0]?.text).toContain('Your request has been received and is being processed as an async job.');
    expect(result.content?.[0]?.text).toContain('Job ID:');
    expect(result.content?.[0]?.text).toContain('Please wait a moment for the task to complete before attempting to retrieve the job result.');
    expect(result.content?.[0]?.text).toContain('To check the status or result of this job, send the following prompt:');
    expect(result.content?.[0]?.text).toContain('code-refactor-job-result');

    let status: JobStatus | undefined = undefined;
    for (let i = 0; i < 10; i++) {
      status = getRefactorJobStatus(result.jobId!) as JobStatus;
      if (status && status.status === 'completed') break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(status && status.status).toBe('completed');
    expect(status && status.result && status.result.content).toBe(
      mockRefactoringSuggestions
    );
  });

  it('should set job to failed if LLM returns empty in async mode', async () => {
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValueOnce('');
    const result = await generateRefactoring(
      {
        language: 'javascript',
        codeContent: 'function fail() {}',
        refactoringInstructions: 'Do nothing',
        async: true,
      },
      mockConfig,
      { sessionId: 'async-session' }
    );
    expect(result.isError).toBe(false);
    expect(result.jobId).toBeDefined();
    let status: JobStatus | undefined = undefined;
    for (let i = 0; i < 10; i++) {
      status = getRefactorJobStatus(result.jobId!) as JobStatus;
      if (status && status.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(status && status.status).toBe('failed');
    expect(status && status.error).toMatch(/empty or invalid output/i);
  });

  it('should set job to failed if writing to outputFilePath fails in async mode', async () => {
    const mockRefactoringSuggestions =
      'async write fail';
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValueOnce(
      mockRefactoringSuggestions
    );
    vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('disk full'));
    const result = await generateRefactoring(
      {
        language: 'javascript',
        codeContent: 'function writeFail() {}',
        refactoringInstructions: 'Write to disk',
        outputFilePath: './fail.txt',
        async: true,
      },
      mockConfig,
      { sessionId: 'async-session' }
    );
    expect(result.isError).toBe(false);
    expect(result.jobId).toBeDefined();
    let status: JobStatus | undefined = undefined;
    for (let i = 0; i < 10; i++) {
      status = getRefactorJobStatus(result.jobId!) as JobStatus;
      if (status && status.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(status && status.status).toBe('failed');
    expect(status && status.error).toMatch(/failed to write output file/i);
  });
});
