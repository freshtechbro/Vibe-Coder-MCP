import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

import { ToolExecutionContext } from '../../../services/routing/toolRegistry.js';
import { generateCodeStub, processJob, CodeStubInput } from '../index.js';
import type { McpConfig } from '../../../types/config.js';
import * as jobStoreModule from '../services/jobStore.js'; // Import the actual module
const { JobStatus } = jobStoreModule; // Extract JobStatus enum

vi.mock('../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../services/jobStore.js', async (importOriginal) => {
  const actual = await importOriginal<typeof jobStoreModule>();
  return {
    ...actual, // Keep actual JobStatus enum
    createJob: vi.fn(() => 'mock-job-id'),
    updateJobStatus: vi.fn(() => true), // Mock updateJobStatus, default to success
    getJobResult: vi.fn(), // Mock getJobResult if needed later
  };
});

vi.mock('../../../utils/llmHelper.js', () => ({
  performDirectLlmCall: vi.fn(),
}));

import { performDirectLlmCall } from '../../../utils/llmHelper.js';
import { updateJobStatus, createJob } from '../services/jobStore.js'; // Import the mocked functions

// --- Tests for generateCodeStub ---
describe('generateCodeStub', () => {
  const mockContext: ToolExecutionContext = {
    sessionId: 'test-session-stub',
  };
  const mockConfig = { env: {} };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a job and return success with jobId', async () => {
    const input = {
      name: 'myFunction',
      description: 'A function that adds two numbers',
      language: 'typescript',
      stubType: 'function' as const,
    };

    const result = await generateCodeStub(input, mockConfig, mockContext);

    expect(result.success).toBe(true);
    expect(result.jobId).toBe('mock-job-id');
    expect(result.message).toBe('Code stub generation job created.');
    expect(result.content).toHaveLength(1);
    expect(result.content?.[0].type).toBe('text');
    expect(result.content?.[0].text).toContain('mock-job-id');
    expect(createJob).toHaveBeenCalledWith(input); // Use the imported mock function
  });

  it('should handle different stub types', async () => {
    const input = {
      name: 'MyClass',
      description: 'A simple class',
      language: 'typescript',
      stubType: 'class' as const,
    };

    const result = await generateCodeStub(input, mockConfig, mockContext);

    expect(result.success).toBe(true);
    expect(result.jobId).toBe('mock-job-id');
    expect(createJob).toHaveBeenCalledWith(input); // Use the imported mock function
  });

  it('should throw a Zod validation error for missing required fields', async () => {
    const invalidInput = {
      language: 'typescript',
      // name and description are missing
      stubType: 'function' as const,
    };

    await expect(
      generateCodeStub(invalidInput, mockConfig, mockContext)
    ).rejects.toThrow(z.ZodError);
  });

  it('should throw a Zod validation error for invalid stub type', async () => {
    const invalidInput = {
      name: 'test',
      description: 'test',
      language: 'typescript',
      stubType: 'invalid-type', // Not in the enum
    };

    await expect(
      generateCodeStub(invalidInput, mockConfig, mockContext)
    ).rejects.toThrow(z.ZodError);
  });

  it('should accept optional parameters', async () => {
    const input = {
      name: 'complexFunction',
      description: 'A function with parameters',
      language: 'typescript',
      stubType: 'function' as const,
      parameters: [
        { name: 'param1', type: 'string', description: 'First parameter' },
      ],
      returnType: 'void',
    };

    const result = await generateCodeStub(input, mockConfig, mockContext);

    expect(result.success).toBe(true);
    expect(result.jobId).toBe('mock-job-id');
    expect(createJob).toHaveBeenCalledWith(input); // Use the imported mock function
  });
});

// --- Tests for processJob ---
describe('processJob', () => {
  const mockJobId = 'test-job-123';
  const mockInput: CodeStubInput = {
    name: 'testFunction',
    description: 'A test function',
    language: 'javascript',
    stubType: 'function',
  };

  const mockMcpConfig: McpConfig = {
    env: {
      OPENROUTER_API_KEY: 'fake-api-key',
      OPENROUTER_BASE_URL: 'https://fake.openrouter.ai/api/v1',
    },
    llm: {
      defaultModel: 'test-model',
      defaultTemperature: 0.5,
      maxTokens: 500,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure mocks return expected values for setup
    vi.mocked(updateJobStatus).mockReturnValue(true);
    // Mock config loader to prevent file system access
    vi.mock('../../../utils/configLoader.js', () => ({
      loadLlmConfigMapping: vi.fn(() => ({})), // Return empty mapping
    }));
    // Mock context handler to prevent file system access in unrelated tests
    vi.mock('../utils/contextHandler.js', () => ({
      readContextFile: vi.fn().mockResolvedValue(null), // Default to no context
    }));
  });

  it('should update status to PROCESSING, call LLM, and update to COMPLETED on success', async () => {
    const mockLlmResult = '/* Mocked successful code stub */';
    vi.mocked(performDirectLlmCall).mockResolvedValue(mockLlmResult);

    await processJob(mockJobId, mockInput, mockMcpConfig);

    // Check status updates
    expect(updateJobStatus).toHaveBeenCalledWith(
      mockJobId,
      JobStatus.PROCESSING
    );
    expect(updateJobStatus).toHaveBeenCalledWith(
      mockJobId,
      JobStatus.COMPLETED,
      mockLlmResult
    );
    expect(updateJobStatus).toHaveBeenCalledTimes(2); // PROCESSING then COMPLETED

    // Check LLM call
    expect(performDirectLlmCall).toHaveBeenCalledTimes(1);
    // Example: More specific check for LLM call arguments
    expect(performDirectLlmCall).toHaveBeenCalledWith(
      expect.any(String), // userPrompt
      expect.any(String), // systemPrompt
      expect.objectContaining({ apiKey: 'fake-api-key' }), // openRouterConfig
      'code-stub-generation' // purpose
    );
  });

  it('should update status to PROCESSING, call LLM, and update to FAILED on LLM error', async () => {
    const mockError = new Error('LLM API Error');
    vi.mocked(performDirectLlmCall).mockRejectedValue(mockError);

    await processJob(mockJobId, mockInput, mockMcpConfig);

    // Check status updates
    expect(updateJobStatus).toHaveBeenCalledWith(
      mockJobId,
      JobStatus.PROCESSING
    );
    expect(updateJobStatus).toHaveBeenCalledWith(
      mockJobId,
      JobStatus.FAILED,
      null, // result should be null on failure
      mockError.message // error message should be passed
    );
    expect(updateJobStatus).toHaveBeenCalledTimes(2); // PROCESSING then FAILED

    // Check LLM call
    expect(performDirectLlmCall).toHaveBeenCalledTimes(1);
  });

  it('should update status to FAILED if initial PROCESSING update fails', async () => {
    // Simulate failure during the first status update
    vi.mocked(updateJobStatus).mockImplementation((_jobId, status) => {
      if (status === JobStatus.PROCESSING) {
        return false; // Simulate failure for the PROCESSING update
      }
      return true; // Allow other updates (though they shouldn't happen)
    });

    await processJob(mockJobId, mockInput, mockMcpConfig);

    // Verify only the PROCESSING update was attempted (and failed)
    expect(updateJobStatus).toHaveBeenCalledTimes(1);
    expect(updateJobStatus).toHaveBeenCalledWith(
      mockJobId,
      JobStatus.PROCESSING
    );

    // Verify LLM call was NOT made
    expect(performDirectLlmCall).not.toHaveBeenCalled();
  });

  it('should update status to FAILED if context file reading fails', async () => {
    const inputWithContext: CodeStubInput = {
      ...mockInput,
      contextFilePath: 'nonexistent/path/to/context.txt',
    };
    const mockReadError = new Error(
      'Failed to read context file: nonexistent/path/to/context.txt'
    );

    // Mock contextHandler specifically for this test to throw an error
    const contextHandler = await import('../utils/contextHandler.js');
    vi.mocked(contextHandler.readContextFile).mockRejectedValue(mockReadError);

    await processJob(mockJobId, inputWithContext, mockMcpConfig);

    // Check status updates
    expect(updateJobStatus).toHaveBeenCalledWith(
      mockJobId,
      JobStatus.PROCESSING
    );
    expect(updateJobStatus).toHaveBeenCalledWith(
      mockJobId,
      JobStatus.FAILED,
      null,
      mockReadError.message // Expect the specific file reading error
    );
    expect(updateJobStatus).toHaveBeenCalledTimes(2); // PROCESSING then FAILED

    // Verify LLM call was NOT made
    expect(performDirectLlmCall).not.toHaveBeenCalled();
  });

  it('should update status to FAILED if required config (API key) is missing', async () => {
    const configWithoutApiKey = {
      ...mockMcpConfig,
      env: {
        // OPENROUTER_API_KEY is missing
        OPENROUTER_BASE_URL: 'https://fake.openrouter.ai/api/v1',
      },
    };
    const expectedErrorMsg =
      'Missing required environment variable: OPENROUTER_API_KEY';

    await processJob(mockJobId, mockInput, configWithoutApiKey as McpConfig);

    // Check status updates
    expect(updateJobStatus).toHaveBeenCalledWith(
      mockJobId,
      JobStatus.PROCESSING
    );
    expect(updateJobStatus).toHaveBeenCalledWith(
      mockJobId,
      JobStatus.FAILED,
      null,
      expectedErrorMsg
    );
    expect(updateJobStatus).toHaveBeenCalledTimes(2); // PROCESSING then FAILED

    // Verify LLM call was NOT made
    expect(performDirectLlmCall).not.toHaveBeenCalled();
  });
});
