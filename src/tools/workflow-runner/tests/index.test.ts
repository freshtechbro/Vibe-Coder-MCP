import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { jobManager } from '../../../services/job-manager/index.js';
import { mockOpenRouterConfig } from '../../../test-utils/mock-configs.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import * as llmHelper from '../../../utils/llmHelper.js';
import { runWorkflow } from '../index.js';

// Mock dependencies
vi.mock('../../../utils/llmHelper.js');
vi.mock('../../../services/job-manager/index.js');
vi.mock('../../../services/sse-notifier/index.js');
vi.mock('../../../logger.js');

describe('Workflow Runner Tool', () => {
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

  it('should execute workflow steps successfully', async () => {
    const mockWorkflowResult = 'Workflow execution completed successfully';
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue(
      mockWorkflowResult
    );
    vi.mocked(jobManager.createJob).mockReturnValue('mock-job-id');

    const result = await runWorkflow(
      {
        workflowName: 'test-workflow',
        input: { key: 'value' },
      },
      mockConfig,
      mockContext
    );

    expect(result.content[0]?.text).toContain('Workflow execution started');
    expect(result.metadata?.jobId).toBe('mock-job-id');
    expect(jobManager.createJob).toHaveBeenCalledWith(
      'test-workflow',
      expect.any(Object),
      'test-session-id'
    );
  });

  it('should handle workflow execution errors', async () => {
    vi.mocked(llmHelper.performDirectLlmCall).mockRejectedValue(
      new Error('Workflow failed')
    );
    vi.mocked(jobManager.createJob).mockReturnValue('mock-job-id');

    const result = await runWorkflow(
      {
        workflowName: 'test-workflow',
        input: { key: 'value' },
      },
      mockConfig,
      mockContext
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Workflow failed');
    const errorDetails = result.errorDetails as McpError;
    expect(errorDetails?.message).toContain('Workflow failed');
  });

  it('should validate workflow inputs', async () => {
    const result = await runWorkflow(
      {
        workflowName: '',
        input: {},
      },
      mockConfig,
      mockContext
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Invalid workflow name');
  });

  it('returns async job message with wait instruction', async () => {
    const params = { workflowName: 'test-workflow', input: { key: 'value' }, async: true };
    const result = await runWorkflow(params, mockConfig, mockContext);
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Your request has been received and is being processed as an async job.');
    expect(result.content[0].text).toContain('Job ID:');
    expect(result.content[0].text).toContain('Please wait a moment for the task to complete before attempting to retrieve the job result.');
    expect(result.content[0].text).toContain('To check the status or result of this job, send the following prompt:');
    expect(result.content[0].text).toContain('workflow-runner-job-result');
  });
});
