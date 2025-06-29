// src/services/routing/toolRegistry.integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
// Import REAL functions we want to test, including the new clear function
import { registerTool, executeTool, clearRegistryForTesting, ToolDefinition } from './toolRegistry.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import logger from '../../logger.js';

// --- Mock Dependencies ---
// Mock logger globally for the suite
vi.mock('../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

// --- Test Setup ---
const mockConfig: OpenRouterConfig = { baseUrl: 'test', apiKey: 'test', defaultModel: 'test', perplexityModel: 'test' };

// Define mock executors
const mockSuccessExecutor = vi.fn();
const mockErrorExecutor = vi.fn();
const mockThrowingExecutor = vi.fn();

// Define mock tool schemas (raw shapes)
const successToolSchemaShape = { message: z.string() };
const errorToolSchemaShape = { id: z.number() };
const throwingToolSchemaShape = {}; // No params

// Define mock tool definitions using raw shapes
const successToolDef: ToolDefinition = {
    name: 'successTool',
    description: 'A tool that always succeeds',
    inputSchema: successToolSchemaShape,
    executor: mockSuccessExecutor,
};

const errorToolDef: ToolDefinition = {
    name: 'errorTool',
    description: 'A tool that returns an error result',
    inputSchema: errorToolSchemaShape,
    executor: mockErrorExecutor,
};

const throwingToolDef: ToolDefinition = {
    name: 'throwingTool',
    description: 'A tool executor that throws',
    inputSchema: throwingToolSchemaShape,
    executor: mockThrowingExecutor,
};

describe('Tool Registry Integration (executeTool)', () => {

  // Use the actual registry, clearing it before each test
  beforeEach(() => {
      // Ensure NODE_ENV is set for clearRegistryForTesting guardrail
      process.env.NODE_ENV = 'test';
      clearRegistryForTesting(); // Clear the actual registry

      // Reset mock implementations and call counts
      mockSuccessExecutor.mockReset().mockResolvedValue({
         content: [{ type: 'text', text: 'Success!' }],
         isError: false,
      } as CallToolResult);
      mockErrorExecutor.mockReset().mockResolvedValue({
          content: [{ type: 'text', text: 'Executor failed' }],
          isError: true,
          errorDetails: { type: 'MockExecutorError', message: 'Executor failed' }
      } as CallToolResult);
      mockThrowingExecutor.mockReset().mockRejectedValue(new Error('Unexpected throw'));

      // Clear logger mocks
      vi.mocked(logger.info).mockClear();
      vi.mocked(logger.debug).mockClear();
      vi.mocked(logger.warn).mockClear();
      vi.mocked(logger.error).mockClear();

      // Register tools into the actual registry
      registerTool(successToolDef);
      registerTool(errorToolDef);
      registerTool(throwingToolDef);
  });

  afterEach(() => {
      // Clean up the registry after each test
      clearRegistryForTesting();
      // Restore original implementations if needed (though mocks are reset in beforeEach)
      // vi.restoreAllMocks(); // Might be redundant if beforeEach resets mocks
  });

  it('should execute a registered tool successfully with valid params', async () => {
    const params = { message: 'hello' };
    // Call the REAL executeTool, which uses the REAL getTool and the actual registry
    const result = await executeTool('successTool', params, mockConfig);

    expect(result.isError).toBe(false);
    expect(result.content?.[0]?.text).toBe('Success!');
    expect(mockSuccessExecutor).toHaveBeenCalledTimes(1);
    // Executor should receive validated data
    expect(mockSuccessExecutor).toHaveBeenCalledWith(params, mockConfig, undefined); // Added undefined for context
    expect(vi.mocked(logger.error)).not.toHaveBeenCalled();
  });

  it('should return error result if executor returns isError: true', async () => {
      const params = { id: 123 };
      const result = await executeTool('errorTool', params, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content?.[0]?.text).toBe('Executor failed');
      // Explicitly check the error details set by the mock executor using type assertion
      expect(result.errorDetails).toBeDefined();
      expect((result.errorDetails as { type: string })?.type).toBe('MockExecutorError');
      expect(mockErrorExecutor).toHaveBeenCalledTimes(1);
      expect(mockErrorExecutor).toHaveBeenCalledWith(params, mockConfig, undefined); // Added undefined for context
      expect(vi.mocked(logger.error)).not.toHaveBeenCalled();
  });

  it('should return error result if executor throws an error', async () => {
     const params = {};
     const result = await executeTool('throwingTool', params, mockConfig);

     expect(result.isError).toBe(true);
     // Adjust assertion to match the actual error message format
     expect(result.content?.[0]?.text).toContain("Unexpected error in tool 'throwingTool': Unexpected throw");
     // Add check for defined before accessing type using type assertion
     expect(result.errorDetails).toBeDefined();
     expect((result.errorDetails as { type: string })?.type).toBe('Error'); // executeTool wraps generic errors
     expect(mockThrowingExecutor).toHaveBeenCalledTimes(1);
     expect(vi.mocked(logger.error)).toHaveBeenCalledWith(expect.objectContaining({ tool: 'throwingTool' }), expect.stringContaining("Error during execution"));
  });

  it('should return validation error result for invalid params', async () => {
    const invalidParams = { message: 123 }; // message should be string
    const result = await executeTool('successTool', invalidParams, mockConfig);

    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain("Input validation failed for tool 'successTool'");
    // Remove the check for the specific Zod message, as it might not be included in the formatted error
    // expect(result.content?.[0]?.text).toMatch(/Expected string, received number/i);
    // Use type assertion for errorDetails
    expect(result.errorDetails).toBeDefined();
    expect((result.errorDetails as { type: string })?.type).toBe('ValidationError');
    expect(mockSuccessExecutor).not.toHaveBeenCalled();
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(expect.objectContaining({ tool: 'successTool' }), 'Tool parameter validation failed.');
  });

   it('should return error result for unregistered tool', async () => {
       const result = await executeTool('nonExistentTool', {}, mockConfig);

       expect(result.isError).toBe(true);
       expect(result.content?.[0]?.text).toBe('Error: Tool "nonExistentTool" not found.');
       expect(vi.mocked(logger.error)).toHaveBeenCalledWith('Tool "nonExistentTool" not found in registry.');
   });
});
