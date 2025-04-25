// src/services/workflows/workflowExecutor.test.ts
import fs from 'fs-extra';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import logger from '../../logger.js';
import { ToolResult } from '../../types/tools.js';
import {
  ConfigurationError,
  ToolExecutionError,
  AppError,
} from '../../utils/errors.js';
import * as toolRegistry from '../routing/toolRegistry.js';

import * as workflowExecutor from './workflowExecutor.js';

// Mock dependencies
vi.mock('fs-extra', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Updated mock for toolRegistry
vi.mock('../routing/toolRegistry.js', () => ({
  toolRegistry: {
    executeTool: vi.fn<
      [
        string,
        Record<string, unknown>,
        Record<string, unknown>,
        toolRegistry.ToolExecutionContext,
      ],
      Promise<ToolResult>
    >(),
  },
}));

// Mock logger
vi.mock('../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockGenericConfig = { someKey: 'someValue' };
const mockSessionId = 'test-session-123';

const mockWorkflowFileContent = JSON.stringify({
  workflows: {
    testFlow: {
      description: 'Test workflow',
      inputSchema: { inputParam: 'string' },
      steps: [
        {
          id: 'step1',
          toolName: 'toolA',
          params: { p1: '{workflow.input.inputParam}' },
        },
        {
          id: 'step2',
          toolName: 'toolB',
          params: { p2: '{steps.step1.output.content[0].text}' },
        },
      ],
      output: {
        finalMessage: 'Step 2 output was: {steps.step2.output.content[0].text}',
      },
    },
    failingFlow: {
      description: 'Test workflow that fails',
      steps: [{ id: 'failStep', toolName: 'toolFail', params: {} }],
    },
  },
});
const mockEmptyWorkflowFileContent = JSON.stringify({ workflows: {} });
const mockInvalidWorkflowFileContent = '{ invalid json';

describe('Workflow Executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(mockEmptyWorkflowFileContent);
    workflowExecutor.loadWorkflowDefinitions('dummyPath');
    vi.mocked(toolRegistry.toolRegistry.executeTool).mockClear();
  });

  describe('loadWorkflowDefinitions', () => {
    it('should load workflows from a valid file', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(mockWorkflowFileContent);
      workflowExecutor.loadWorkflowDefinitions('validPath');
      expect(logger.info).toHaveBeenCalledWith(
        'Successfully loaded 2 workflow definitions.'
      );
    });

    it('should handle missing workflow file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      workflowExecutor.loadWorkflowDefinitions('missingPath');
      expect(logger.warn).toHaveBeenCalledWith(
        'Workflow definition file not found at: missingPath'
      );
    });

    it('should handle invalid JSON', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        mockInvalidWorkflowFileContent
      );
      workflowExecutor.loadWorkflowDefinitions('invalidJsonPath');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(SyntaxError) }),
        'Failed to parse workflow definitions file'
      );
    });

    it('should handle invalid structure (missing workflows key)', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ not_workflows: {} })
      );
      workflowExecutor.loadWorkflowDefinitions('invalidStructPath');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(ConfigurationError),
        }),
        'Invalid workflow definitions file structure'
      );
    });
  });

  describe('executeWorkflow', () => {
    beforeEach(() => {
      vi.mocked(fs.readFileSync).mockReturnValue(mockWorkflowFileContent);
      workflowExecutor.loadWorkflowDefinitions('validPath');

      vi.mocked(toolRegistry.toolRegistry.executeTool).mockImplementation(
        async (toolName, params, config, context) => {
          logger.debug(
            { toolName, params, config, context },
            'Mock executeTool called'
          );
          if (toolName === 'toolA') {
            return { content: [{ type: 'text', text: 'Step 1 Output' }] };
          }
          if (toolName === 'toolB') {
            return { content: [{ type: 'text', text: 'Step 2 Output' }] };
          }
          if (toolName === 'toolFail') {
            throw new ToolExecutionError('Tool Failed Intentional Error', {
              toolName,
            });
          }
          throw new Error(
            `Mock executeTool received unknown tool: ${toolName}`
          );
        }
      );
    });

    it('should execute a workflow successfully', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(mockWorkflowFileContent);
      workflowExecutor.loadWorkflowDefinitions('validPath');

      const workflowInput = { inputParam: 'Start Value' };
      const result = await workflowExecutor.executeWorkflow(
        'testFlow',
        workflowInput,
        mockGenericConfig,
        mockSessionId
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe(
        'Workflow "testFlow" completed successfully.'
      );
      expect(result.outputs?.finalMessage).toBe(
        'Step 2 output was: Step 2 Output'
      );
      expect(toolRegistry.toolRegistry.executeTool).toHaveBeenCalledTimes(2);

      const expectedContextStep1: toolRegistry.ToolExecutionContext = {
        sessionId: mockSessionId,
        workflowId: 'testFlow',
        stepId: 'step1',
      };
      const expectedContextStep2: toolRegistry.ToolExecutionContext = {
        sessionId: mockSessionId,
        workflowId: 'testFlow',
        stepId: 'step2',
      };

      expect(toolRegistry.toolRegistry.executeTool).toHaveBeenNthCalledWith(
        1,
        'toolA',
        { p1: 'Start Value' },
        mockGenericConfig,
        expectedContextStep1
      );

      expect(toolRegistry.toolRegistry.executeTool).toHaveBeenNthCalledWith(
        2,
        'toolB',
        { p2: 'Step 1 Output' },
        mockGenericConfig,
        expectedContextStep2
      );
    });

    it('should stop and return error if a step fails', async () => {
      const result = await workflowExecutor.executeWorkflow(
        'failingFlow',
        {},
        mockGenericConfig,
        mockSessionId
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain(
        'Workflow "failingFlow" failed at step 1 (toolFail): Tool Failed Intentional Error'
      );
      expect(result.error?.stepId).toBe('failStep');
      expect(result.error?.toolName).toBe('toolFail');
      expect(result.error?.type).toBe('ToolExecutionError');
      expect(result.error?.message).toBe('Tool Failed Intentional Error');
      expect(toolRegistry.toolRegistry.executeTool).toHaveBeenCalledTimes(1);
      expect(toolRegistry.toolRegistry.executeTool).toHaveBeenCalledWith(
        'toolFail',
        {},
        mockGenericConfig,
        {
          sessionId: mockSessionId,
          workflowId: 'failingFlow',
          stepId: 'failStep',
        }
      );
    });

    it('should return error if parameter resolution fails', async () => {
      const brokenWorkflowContent = JSON.stringify({
        workflows: {
          brokenFlow: {
            description: 'Broken',
            steps: [
              {
                id: 's2',
                toolName: 'tB',
                params: { p: '{steps.s1.output.content[0].text}' },
              },
            ],
          },
        },
      });
      vi.mocked(fs.readFileSync).mockReturnValue(brokenWorkflowContent);
      workflowExecutor.loadWorkflowDefinitions('brokenPath');

      const result = await workflowExecutor.executeWorkflow(
        'brokenFlow',
        {},
        mockGenericConfig,
        mockSessionId
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('failed at step 1 (tB)');
      expect(result.message).toContain(
        'Failed to resolve parameter: Path "steps.s1.output.content[0].text" resolution failed: Part "s1" not found.'
      );
      expect(result.error?.stepId).toBe('s2');
      expect(result.error?.toolName).toBe('tB');
      expect(result.error?.type).toBe('ParameterResolutionError');
      expect(toolRegistry.toolRegistry.executeTool).not.toHaveBeenCalled();
    });

    it('should return error if workflow definition not found', async () => {
      const result = await workflowExecutor.executeWorkflow(
        'nonExistentFlow',
        {},
        mockGenericConfig,
        mockSessionId
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Workflow "nonExistentFlow" not found.');
      expect(result.error?.message).toBe(
        'Workflow "nonExistentFlow" not found.'
      );
      expect(result.error?.type).toBe('WorkflowNotFound');
      expect(toolRegistry.toolRegistry.executeTool).not.toHaveBeenCalled();
    });

    it('should handle resolving undefined paths gracefully in output', async () => {
      const undefinedPathWorkflow = JSON.stringify({
        workflows: {
          undefinedPathFlow: {
            description: 'Output path test',
            steps: [{ id: 's1', toolName: 'toolA', params: {} }],
            output: { finalMessage: '{nonexistent.step.output}' },
          },
        },
      });
      vi.mocked(fs.readFileSync).mockReturnValue(undefinedPathWorkflow);
      workflowExecutor.loadWorkflowDefinitions('undefinedPath');

      const result = await workflowExecutor.executeWorkflow(
        'undefinedPathFlow',
        {},
        mockGenericConfig,
        mockSessionId
      );

      expect(result.success).toBe(true); // Workflow itself succeeds, but output resolution fails
      expect(result.message).toBe(
        'Workflow "undefinedPathFlow" completed successfully.'
      );
      expect(result.outputs).toHaveProperty('finalMessage');
      expect(result.outputs?.finalMessage).toContain(
        'Error: Failed to resolve output template: Failed to resolve parameter: Path "nonexistent.step.output" resolution failed: Part "nonexistent" not found.'
      );
      expect(toolRegistry.toolRegistry.executeTool).toHaveBeenCalledTimes(1);
    });

    it('should return error if workflow name is not found', async () => {
      const result = await workflowExecutor.executeWorkflow(
        'nonexistentFlow',
        {},
        mockGenericConfig,
        mockSessionId
      );
      expect(result.success).toBe(false);
      expect(result.message).toBe('Workflow "nonexistentFlow" not found.');
      expect(result.error?.type).toBe('WorkflowNotFound');
    });
  });
});
