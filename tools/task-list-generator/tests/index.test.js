// src/tools/task-list-generator/tests/index.test.ts
// Removed @ts-nocheck
import fs from 'fs-extra';
import { describe, it, expect, vi, beforeEach } from 'vitest'; // Keep only one import

import * as llmHelper from '../../../utils/llmHelper.js'; // Import the new helper
import * as researchHelper from '../../../utils/researchHelper.js';
import { generateTaskList } from '../index.js';
// Mock dependencies
vi.mock('../../../utils/researchHelper.js');
vi.mock('../../../utils/llmHelper.js'); // Mock the new helper
vi.mock('fs-extra');
describe('Task List Generator', () => {
  // Mock data and responses
  const mockConfig = {
    baseUrl: 'https://api.example.com',
    apiKey: 'test-api-key',
    geminiModel: 'google/gemini-2.5-pro-exp-03-25:free',
    perplexityModel: 'perplexity/sonar-deep-research',
  };
  const mockProductDescription = 'A project management tool with task tracking';
  const mockUserStories =
    'US-001: As a user, I want to create tasks\nUS-002: As a user, I want to assign tasks';
  const mockResearchResults = [
    'Mock development lifecycle research data',
    'Mock task estimation research data',
    'Mock team structure research data',
  ];
  const mockGeneratedHighLevelTaskList = `
# Task List: Mock Project
## Phase: Setup
- **ID:** T-101
  **Title:** Init Repo
  *(Description):* Setup git.
  *(User Story):* N/A
  *(Priority):* High
  *(Dependencies):* None
  *(Est. Effort):* Small
## Phase: Backend
- **ID:** T-201
  **Title:** Create API
  *(Description):* Build the core API.
  *(User Story):* US-001
  *(Priority):* High
  *(Dependencies):* T-101
  *(Est. Effort):* Medium
`;
  const mockGeneratedSubTasksT101 = `- **Sub-Task ID:** T-101.1\n  **Goal:** Init git repo\n  ...`;
  const mockGeneratedSubTasksT201 = `- **Sub-Task ID:** T-201.1\n  **Goal:** Define routes\n  ...`;
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    // Mock initDirectories to avoid file system operations
    vi.spyOn(fs, 'ensureDir').mockResolvedValue();
    vi.spyOn(fs, 'writeFile').mockResolvedValue();
    // Mock the Promise.allSettled for research results
    vi.spyOn(Promise, 'allSettled').mockResolvedValue([
      { status: 'fulfilled', value: mockResearchResults[0] },
      { status: 'fulfilled', value: mockResearchResults[1] },
      { status: 'fulfilled', value: mockResearchResults[2] },
    ]);
    // Mock the performResearchQuery function
    vi.spyOn(researchHelper, 'performResearchQuery').mockImplementation(
      async (query) => {
        // Return different results based on the query
        if (query.includes('lifecycle')) return mockResearchResults[0];
        if (query.includes('estimation')) return mockResearchResults[1];
        if (query.includes('team structure')) return mockResearchResults[2];
        return 'Default mock research';
      }
    );
    // Mock the performDirectLlmCall function
    vi.spyOn(llmHelper, 'performDirectLlmCall').mockImplementation(
      async (prompt, systemPrompt, config, logicalTaskName) => {
        if (logicalTaskName === 'task_list_initial_generation') {
          return mockGeneratedHighLevelTaskList;
        }
        if (logicalTaskName === 'task_list_decomposition') {
          if (prompt.includes('T-101')) return mockGeneratedSubTasksT101;
          if (prompt.includes('T-201')) return mockGeneratedSubTasksT201;
        }
        return 'Default mock LLM response';
      }
    );
  });
  it('should perform research, initial generation, and decomposition using direct LLM calls', async () => {
    // Call the function under test with params object
    const params = {
      productDescription: mockProductDescription,
      userStories: mockUserStories,
    };
    await generateTaskList(params, mockConfig);
    // Verify Perplexity research was called 3 times (for 3 different queries)
    expect(researchHelper.performResearchQuery).toHaveBeenCalledTimes(3);
    // Verify each research query contains appropriate context and uses the correct config
    const researchCalls = vi.mocked(researchHelper.performResearchQuery).mock
      .calls;
    expect(researchCalls[0][0]).toContain('lifecycle');
    expect(researchCalls[0][1]).toBe(mockConfig); // Should pass full config with perplexityModel
    expect(researchCalls[1][0]).toContain('estimation');
    expect(researchCalls[2][0]).toContain('team structure');
    // Verify direct LLM calls: 1 for initial list + 2 for decomposition (T-101, T-201)
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledTimes(3);
    // Verify initial generation call
    const initialGenCallArgs = vi.mocked(llmHelper.performDirectLlmCall).mock
      .calls[0];
    expect(initialGenCallArgs[3]).toBe('task_list_initial_generation');
    expect(initialGenCallArgs[0]).toContain(mockProductDescription);
    expect(initialGenCallArgs[0]).toContain(mockUserStories);
    expect(initialGenCallArgs[0]).toContain('Pre-Generation Research Context');
    expect(initialGenCallArgs[1]).toContain(
      '# Task List Generator - High-Level Tasks'
    ); // Check system prompt
    expect(initialGenCallArgs[2]).toBe(mockConfig);
    // Verify decomposition calls (check one example)
    const decompCallArgsT201 = vi.mocked(llmHelper.performDirectLlmCall).mock
      .calls[2]; // T-201 is the 3rd call
    expect(decompCallArgsT201[3]).toBe('task_list_decomposition');
    expect(decompCallArgsT201[0]).toContain('Parent Task ID: T-201'); // Check prompt includes parent task ID
    expect(decompCallArgsT201[1]).toContain('# Task Decomposition Specialist'); // Check system prompt
    expect(decompCallArgsT201[2]).toBe(mockConfig);
    // Verify results are written to file
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
  });
  it('should include product description in the research queries', async () => {
    const customProduct = 'E-commerce website';
    const params = {
      productDescription: customProduct,
      userStories: mockUserStories,
    };
    await generateTaskList(params, mockConfig);
    // Verify the first and third research queries include the product description
    const firstQuery = vi.mocked(researchHelper.performResearchQuery).mock
      .calls[0][0];
    const thirdQuery = vi.mocked(researchHelper.performResearchQuery).mock
      .calls[2][0];
    expect(firstQuery).toContain(customProduct);
    expect(thirdQuery).toContain(customProduct);
  });
  it('should handle research failures gracefully', async () => {
    // Mock a failed research query
    vi.mocked(Promise.allSettled).mockResolvedValueOnce([
      { status: 'rejected', reason: new Error('Research failed') },
      { status: 'fulfilled', value: mockResearchResults[1] },
      { status: 'fulfilled', value: mockResearchResults[2] },
    ]);
    const params = {
      productDescription: mockProductDescription,
      userStories: mockUserStories,
    };
    await generateTaskList(params, mockConfig);
    // Verify direct LLM call for initial generation was still made
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledWith(
      expect.any(String), // prompt
      expect.any(String), // system prompt
      mockConfig,
      'task_list_initial_generation' // logical task name
    );
    // Verify the prompt passed to the initial generation call contains the failure message
    const initialGenCallArgs = vi.mocked(llmHelper.performDirectLlmCall).mock
      .calls[0];
    expect(initialGenCallArgs[0]).toContain(
      '### Development Lifecycle & Milestones:\n*Research on this topic failed.*\n\n'
    ); // Check specific failure message
    // Verify results are still written to file
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
  });
  // --- Snapshot Test ---
  it('should generate detailed task list content matching snapshot', async () => {
    const productDescription = 'A project tracking app';
    const userStories = `
US-101: As a user, I want to create task items
US-102: As a user, I want to assign tasks to team members
US-103: As a user, I want to track task progress
`;
    const consistentMockTaskList = `
## Phase: Project Setup
- **ID:** T-101
  **Title:** Initialize project repository
  *(Description):* Set up version control and project structure
  *(User Story):* US-101, US-102, US-103
  *(Priority):* High
  *(Dependencies):* None
  *(Est. Effort):* Small

## Phase: Backend Development
- **ID:** T-201
  **Title:** Create task model
  *(Description):* Define data structure for tasks
  *(User Story):* US-101
  *(Priority):* High
  *(Dependencies):* T-101
  *(Est. Effort):* Medium
`; // Renamed this variable for clarity
    const consistentMockSubTasksT101 = `- **Sub-Task ID:** T-101.1\n  **Goal:** Init git\n  ...`;
    const consistentMockSubTasksT201 = `- **Sub-Task ID:** T-201.1\n  **Goal:** Define models\n  ...`;
    // Variable to capture the file path argument directly
    let capturedFilePath;
    // Reset mocks with consistent values for snapshot stability
    vi.mocked(researchHelper.performResearchQuery).mockResolvedValue(
      'Consistent mock research.'
    );
    vi.mocked(llmHelper.performDirectLlmCall).mockImplementation(
      async (prompt, systemPrompt, config, logicalTaskName) => {
        if (logicalTaskName === 'task_list_initial_generation') {
          return consistentMockTaskList; // Correct variable name used here
        }
        if (logicalTaskName === 'task_list_decomposition') {
          if (prompt.includes('T-101')) return consistentMockSubTasksT101;
          if (prompt.includes('T-201')) return consistentMockSubTasksT201;
        }
        return 'Default mock LLM response';
      }
    );
    // Override writeFile to capture the path directly
    vi.mocked(fs.writeFile).mockImplementation(async (pathArg) => {
      capturedFilePath = pathArg;
    });
    // Call the function under test with params object
    const params = {
      productDescription,
      userStories,
    };
    const result = await generateTaskList(params, mockConfig);
    // Snapshot assertion for the reconstructed content
    const resultText = result.content?.[0]?.text;
    // Ensure resultText is a string before trimming
    const contentToSnapshot =
      typeof resultText === 'string' ? resultText.trim() : '';
    expect(contentToSnapshot).toMatchSnapshot(
      'Detailed Task List Generator Content'
    );
    // Verify file write was called
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    // Verify file path was captured and contains expected components
    expect(capturedFilePath).toBeDefined();
    expect(capturedFilePath).toContain('task-list-generator');
    expect(capturedFilePath).toMatch(/\.md$/); // Ends with .md
  });
});
