import path from 'path';

import * as fs from 'fs-extra';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ToolResult } from '../../../types/tools.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { toolRegistry } from '../../routing/toolRegistry.js';
import { executeWorkflow } from '../workflowExecutor.js';

// Mock fs operations
vi.mock('fs-extra', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('../../routing/toolRegistry.js', () => ({
  toolRegistry: {
    executeTool: vi.fn(),
  },
}));

vi.mock('../../../logger.js');

describe('Fullstack Project Workflow', () => {
  const mockConfig: OpenRouterConfig = {
    baseUrl: 'test-url',
    apiKey: 'test-key',
    defaultModel: 'test-default-model',
    temperature: 0.7,
    maxTokens: 1000,
    geminiModel: 'test-model',
    perplexityModel: 'test-model',
  };

  const mockSessionId = 'test-session';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        workflows: {
          'create-fullstack-project': {
            description: 'Creates a new fullstack project',
            steps: [
              {
                id: 'validate-input',
                tool: 'validate-project-input',
                params: {
                  projectName: '{workflow.input.projectName}',
                  description: '{workflow.input.description}',
                  features: '{workflow.input.features}',
                },
              },
              {
                id: 'generate-project',
                tool: 'generate-fullstack-project',
                params: {
                  projectName: '{workflow.input.projectName}',
                  description: '{workflow.input.description}',
                  features: '{workflow.input.features}',
                },
              },
            ],
          },
        },
      })
    );
  });

  it('should execute the fullstack project workflow successfully', async () => {
    const mockValidateResult: ToolResult = {
      content: [{ type: 'text', text: 'Validation successful' }],
      isError: false,
    };

    const mockGenerateResult: ToolResult = {
      content: [{ type: 'text', text: 'Project generated' }],
      isError: false,
      metadata: {
        outputDir: '/test/path',
        template: { name: 'test-template', version: '1.0.0' },
      },
    };

    const executeToolMock = vi.mocked(toolRegistry.executeTool);
    executeToolMock
      .mockResolvedValueOnce(mockValidateResult)
      .mockResolvedValueOnce(mockGenerateResult);

    const workflowInput = {
      projectName: 'test-project',
      description: 'Test project',
      features: ['typescript', 'react'],
    };

    const result = await executeWorkflow(
      'create-fullstack-project',
      workflowInput,
      mockConfig,
      mockSessionId
    );

    expect(result.success).toBe(true);
    expect(result.stepResults?.get('validate-input')).toBe(mockValidateResult);
    expect(result.stepResults?.get('generate-project')).toBe(
      mockGenerateResult
    );
    expect(executeToolMock).toHaveBeenCalledTimes(2);
  });

  it('should handle validation failure', async () => {
    const mockValidateResult: ToolResult = {
      content: [{ type: 'text', text: 'Invalid project name' }],
      isError: true,
      errorDetails: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid project name',
      },
    };

    vi.mocked(toolRegistry.executeTool).mockResolvedValueOnce(
      mockValidateResult
    );

    const workflowInput = {
      projectName: '', // Invalid
      description: 'Test project',
      features: ['typescript'],
    };

    const result = await executeWorkflow(
      'create-fullstack-project',
      workflowInput,
      mockConfig,
      mockSessionId
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid project name');
    expect(result.stepResults?.get('validate-input')).toBe(mockValidateResult);
    expect(toolRegistry.executeTool).toHaveBeenCalledTimes(1);
  });

  it('should handle missing workflow definition', async () => {
    const result = await executeWorkflow(
      'non-existent-workflow',
      {},
      mockConfig,
      mockSessionId
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
    expect(toolRegistry.executeTool).not.toHaveBeenCalled();
  });
});
