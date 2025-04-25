// src/services/routing/toolRegistry.integration.test.ts
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

import logger from '../../logger.js';
import { mockOpenRouterConfig } from '../../test-utils/mock-configs.js';
import { OpenRouterConfig } from '../../types/workflow.js';

import {
  toolRegistry,
  clearRegistryForTesting,
  ToolDefinition,
} from './toolRegistry.js';

// --- Mock Dependencies ---
// Mock logger globally for the suite
vi.mock('../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// --- Test Setup ---
// Use the pre-configured mock that satisfies the OpenRouterConfig interface
const mockConfig = mockOpenRouterConfig;

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
  execute: mockSuccessExecutor,
};

const errorToolDef: ToolDefinition = {
  name: 'errorTool',
  description: 'A tool that returns an error result',
  inputSchema: errorToolSchemaShape,
  execute: mockErrorExecutor,
};

const throwingToolDef: ToolDefinition = {
  name: 'throwingTool',
  description: 'A tool executor that throws',
  inputSchema: throwingToolSchemaShape,
  execute: mockThrowingExecutor,
};

describe('Tool Registry Integration', () => {
  // Use the actual registry, clearing it before each test
  beforeEach(() => {
    // Ensure NODE_ENV is set for clearRegistryForTesting guardrail
    process.env.NODE_ENV = 'test';
    clearRegistryForTesting();

    // Reset mock implementations and call counts
    mockSuccessExecutor.mockReset().mockResolvedValue({
      content: [{ type: 'text', text: 'Success!' }],
      isError: false,
    } as CallToolResult);
    mockErrorExecutor.mockReset().mockResolvedValue({
      content: [{ type: 'text', text: 'Executor failed' }],
      isError: true,
      errorDetails: { type: 'MockExecutorError', message: 'Executor failed' },
    } as CallToolResult);
    mockThrowingExecutor
      .mockReset()
      .mockRejectedValue(new Error('Unexpected throw'));

    // Clear logger mocks
    vi.mocked(logger.info).mockClear();
    vi.mocked(logger.debug).mockClear();
    vi.mocked(logger.warn).mockClear();
    vi.mocked(logger.error).mockClear();

    // Register tools into the actual registry
    toolRegistry.registerTool(successToolDef);
    toolRegistry.registerTool(errorToolDef);
    toolRegistry.registerTool(throwingToolDef);
  });

  afterEach(() => {
    // Clean up the registry after each test
    clearRegistryForTesting();
  });

  it('should execute a registered tool successfully with valid params', async () => {
    const params = { message: 'hello' };
    const context = { sessionId: 'test-session' };

    const result = await toolRegistry.executeTool(
      'successTool',
      params,
      mockConfig,
      context
    );

    expect(result.isError).toBe(false);
    expect(result.content?.[0]?.text).toBe('Success!');
    expect(mockSuccessExecutor).toHaveBeenCalledTimes(1);
    expect(mockSuccessExecutor).toHaveBeenCalledWith(
      params,
      mockConfig,
      context
    );
    expect(vi.mocked(logger.error)).not.toHaveBeenCalled();
  });

  it('should return error result if executor returns isError: true', async () => {
    const params = { id: 123 };
    const context = { sessionId: 'test-session' };

    const result = await toolRegistry.executeTool(
      'errorTool',
      params,
      mockConfig,
      context
    );

    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toBe('Executor failed');
    expect(result.errorDetails).toBeDefined();
    expect((result.errorDetails as { type: string })?.type).toBe(
      'MockExecutorError'
    );
    expect(mockErrorExecutor).toHaveBeenCalledTimes(1);
    expect(mockErrorExecutor).toHaveBeenCalledWith(params, mockConfig, context);
    expect(vi.mocked(logger.error)).not.toHaveBeenCalled();
  });

  it('should throw error if executor throws an error', async () => {
    const params = {};
    const context = { sessionId: 'test-session' };

    await expect(
      toolRegistry.executeTool('throwingTool', params, mockConfig, context)
    ).rejects.toThrow('Unexpected throw');

    expect(mockThrowingExecutor).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        toolName: 'throwingTool',
      }),
      'Tool execution failed'
    );
  });

  it('should throw error for unregistered tool', async () => {
    const context = { sessionId: 'test-session' };

    await expect(
      toolRegistry.executeTool('nonExistentTool', {}, mockConfig, context)
    ).rejects.toThrow('Tool not found: nonExistentTool');
  });
});
