import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ToolExecutionContext } from '../../../services/routing/toolRegistry.js';
import { mockOpenRouterConfig } from '../../../test-utils/mock-configs.js';
import { StructuredTaskList, TaskLevel } from '../../../types/taskList.js';
import * as llmHelper from '../../../utils/llmHelper.js';
import { generateTaskList } from '../index.js';
import * as parser from '../parser.js';

// Mock dependencies
vi.mock('../../../utils/llmHelper.js');
vi.mock('../parser.js');
vi.mock('../../../logger.js');

describe('Task List Generator Tool', () => {
  const mockConfig = { openRouterConfig: mockOpenRouterConfig };
  const mockContext: ToolExecutionContext = {
    sessionId: 'test-session-id',
    userId: 'test-user-id',
    jobId: 'test-job-id',
  };

  const mockParsedTasks: StructuredTaskList = [
    {
      id: 'task-1',
      title: 'General Task 1',
      description: 'Do the first general thing.',
      level: TaskLevel.GENERAL,
      parentTaskId: null,
    },
    {
      id: 'subtask-1-1',
      title: 'Sub Task 1.1',
      description: 'First sub-task.',
      level: TaskLevel.SUB,
      parentTaskId: 'task-1',
      goal: 'Sub goal 1.1',
      objectives: ['Objective 1', 'Objective 2'],
      impact: 'High',
      acceptanceCriteria: ['AC 1', 'AC 2'],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(llmHelper.performDirectLlmCall).mockReset();
    vi.mocked(parser.parseTaskListOutput).mockReset();
  });

  it('should generate and parse task list successfully', async () => {
    const mockLlmResponse =
      '# Task List for: Test PRD\n## Overall Goal: Test Goal\n## General Task: General Task 1\n*Description:* Do the first general thing.\n### Sub-task: Sub Task 1.1\n*Description:* First sub-task.\n*Goal:* Sub goal 1.1\n*Objectives:*\n- Objective 1\n- Objective 2\n*Impact:* High\n*Acceptance Criteria:*\n- AC 1\n- AC 2\n';
    const mockPrd = 'Test PRD content';

    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue(
      mockLlmResponse
    );
    vi.mocked(parser.parseTaskListOutput).mockReturnValue(mockParsedTasks);

    const result = await generateTaskList(
      { prd: mockPrd },
      mockConfig,
      mockContext
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe('json');
    expect(result.content[0]?.text).toBe(
      JSON.stringify(mockParsedTasks, null, 2)
    );
    expect(result.metadata?.parsingStatus).toBe('Success');

    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledTimes(1);
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledWith(
      expect.stringContaining('You are an expert Project Manager AI.'),
      mockPrd,
      mockConfig.openRouterConfig,
      'research_execution',
      0.5
    );

    expect(parser.parseTaskListOutput).toHaveBeenCalledTimes(1);
    expect(parser.parseTaskListOutput).toHaveBeenCalledWith(mockLlmResponse);
  });

  it('should handle LLM generation failure (empty response)', async () => {
    const mockPrd = 'Test PRD content';
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue('');

    const result = await generateTaskList(
      { prd: mockPrd },
      mockConfig,
      mockContext
    );

    expect(result.isError).toBe(true);
    expect(result.errorDetails).toBeDefined();

    const errorDetails = result.errorDetails;
    if (errorDetails) {
      expect((errorDetails as { message: string }).message).toContain(
        'LLM failed to generate a task list response.'
      );
    } else {
      expect(errorDetails).toBeDefined();
    }
    expect(parser.parseTaskListOutput).not.toHaveBeenCalled();
  });

  it('should handle LLM call throwing an error', async () => {
    const mockPrd = 'Test PRD content';
    const llmError = new Error('LLM API Error');
    vi.mocked(llmHelper.performDirectLlmCall).mockRejectedValue(llmError);

    const result = await generateTaskList(
      { prd: mockPrd },
      mockConfig,
      mockContext
    );

    expect(result.isError).toBe(true);
    expect(result.errorDetails).toBeDefined();

    const errorDetails = result.errorDetails;
    if (errorDetails) {
      expect((errorDetails as { message: string }).message).toBe(
        'LLM API Error'
      );
    } else {
      expect(errorDetails).toBeDefined();
    }
    expect(parser.parseTaskListOutput).not.toHaveBeenCalled();
  });

  it('should handle parser returning an empty list', async () => {
    const mockLlmResponse = 'Some markdown that the parser fails on';
    const mockPrd = 'Test PRD content';

    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue(
      mockLlmResponse
    );
    vi.mocked(parser.parseTaskListOutput).mockReturnValue([]);

    const result = await generateTaskList(
      { prd: mockPrd },
      mockConfig,
      mockContext
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe('json');
    expect(result.content[0]?.text).toBe(JSON.stringify([], null, 2));
    expect(result.metadata?.parsingStatus).toBe('PartialOrEmpty');

    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledTimes(1);
    expect(parser.parseTaskListOutput).toHaveBeenCalledTimes(1);
    expect(parser.parseTaskListOutput).toHaveBeenCalledWith(mockLlmResponse);
  });

  it('should handle invalid configuration (missing openRouterConfig)', async () => {
    const mockPrd = 'Test PRD content';
    const invalidConfig = {};

    const result = await generateTaskList(
      { prd: mockPrd },
      invalidConfig,
      mockContext
    );

    expect(result.isError).toBe(true);
    expect(result.errorDetails).toBeDefined();

    const errorDetails = result.errorDetails;
    if (errorDetails) {
      expect((errorDetails as { message: string }).message).toContain(
        "Missing or invalid 'openRouterConfig'"
      );
    } else {
      expect(errorDetails).toBeDefined();
    }
    expect(llmHelper.performDirectLlmCall).not.toHaveBeenCalled();
    expect(parser.parseTaskListOutput).not.toHaveBeenCalled();
  });

  it('should handle invalid configuration (missing llm_mapping)', async () => {
    const mockPrd = 'Test PRD content';
    const invalidConfig = {
      openRouterConfig: { ...mockOpenRouterConfig, llm_mapping: {} },
    };

    const result = await generateTaskList(
      { prd: mockPrd },
      invalidConfig,
      mockContext
    );

    expect(result.isError).toBe(true);
    expect(result.errorDetails).toBeDefined();

    const errorDetails = result.errorDetails;
    if (errorDetails) {
      expect((errorDetails as { message: string }).message).toContain(
        "Missing 'research_execution' mapping in llm_mapping."
      );
    } else {
      expect(errorDetails).toBeDefined();
    }
    expect(llmHelper.performDirectLlmCall).not.toHaveBeenCalled();
    expect(parser.parseTaskListOutput).not.toHaveBeenCalled();
  });
});
