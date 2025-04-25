// src/tools/dependency-analyzer/tests/index.test.ts
import path from 'path'; // Import path for resolving

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

import logger from '@/logger.js'; // Use specific path alias

import { ToolExecutionContext } from '../../../services/routing/toolRegistry.js';
import { readFileContent } from '../../../utils/fileReader.js'; // Import the function to be mocked
import { dependencyAnalyzerTool } from '../index.js'; // Import the ToolDefinition

// Mock the module containing readFileContent
vi.mock('../../../utils/fileReader.js');

// Mock logger - keep these as they are likely correct
vi.spyOn(logger, 'info').mockImplementation(() => {});
vi.spyOn(logger, 'error').mockImplementation(() => {});

// Cast the imported function to Mock type for controlling its behavior
const mockReadFileContent = readFileContent as Mock<[string], Promise<string>>;

const mockConfig = {
  baseUrl: '',
  apiKey: '',
  geminiModel: '',
  perplexityModel: '',
  defaultModel: 'gpt-4-turbo',
  temperature: 0.7,
  maxTokens: 2048,
};

describe('dependencyAnalyzerTool Tool', () => {
  const mockContext: ToolExecutionContext = {
    sessionId: 'test-session-123',
    workflowId: 'test-workflow', // Add dummy workflowId
    stepId: 'test-step', // Add dummy stepId
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-assign mock implementation before each test if needed, or rely on per-test setups
  });

  it('should return error for invalid input parameters', async () => {
    const invalidParams = { projectPath: 123 }; // Invalid type for projectPath
    const result = await dependencyAnalyzerTool.execute(
      invalidParams,
      mockConfig,
      mockContext
    ); // Use execute method

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid input parameters');
  });

  it('should return error for unsupported file types', async () => {
    const params = {
      projectPath: '.',
      filePath: 'requirements.txt',
    };
    // No need to mock readFileContent here as error happens before file read

    const result = await dependencyAnalyzerTool.execute(
      params,
      mockConfig,
      mockContext
    ); // Use execute method

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      "Unsupported file type 'requirements.txt'"
    );
  });

  it('should return error if JSON parsing fails', async () => {
    const params = {
      projectPath: '.',
      filePath: 'package.json',
    };
    mockReadFileContent.mockResolvedValue('{ invalid json'); // Invalid JSON content

    const result = await dependencyAnalyzerTool.execute(
      params,
      mockConfig,
      mockContext
    ); // Use execute method

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'Invalid JSON in file: package.json'
    );
  });

  it('should analyze package.json successfully', async () => {
    const params = {
      projectPath: '.',
      filePath: 'package.json',
    };
    const packageJsonContent = JSON.stringify({
      name: 'test-package',
      version: '1.0.0',
      dependencies: { express: '^4.18.0' },
      devDependencies: { jest: '^29.0.0' },
    });
    mockReadFileContent.mockResolvedValue(packageJsonContent);

    const result = await dependencyAnalyzerTool.execute(
      params,
      mockConfig,
      mockContext
    ); // Use execute method

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain(
      '## Dependency Analysis for: package.json'
    );
    expect(result.content[0].text).toContain('### Dependencies (1):');
    expect(result.content[0].text).toContain('- express: ^4.18.0');
    expect(result.content[0].text).toContain('### Dev Dependencies (1):');
    expect(result.content[0].text).toContain('- jest: ^29.0.0');
  });

  it('should handle package.json with missing devDependencies', async () => {
    const params = {
      projectPath: '.',
      filePath: 'package.json',
    };
    const mockPackageJsonNoDevDeps = JSON.stringify({
      name: 'test-package',
      version: '1.0.0',
      dependencies: { axios: '1.0.0' },
    });
    mockReadFileContent.mockResolvedValue(mockPackageJsonNoDevDeps);

    const result = await dependencyAnalyzerTool.execute(
      params,
      mockConfig,
      mockContext
    ); // Use execute method

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('### Dependencies (1):');
    expect(result.content[0].text).toContain('- axios: 1.0.0');
    expect(result.content[0].text).toContain(
      '### Dev Dependencies:\n - None found.'
    );
  });

  it('should handle package.json with missing dependencies', async () => {
    const params = {
      projectPath: '.',
      filePath: 'package.json',
    };
    const mockPackageJsonNoDeps = JSON.stringify({
      name: 'test-package',
      version: '1.0.0',
      devDependencies: { vitest: '^3.0.0' },
    });
    mockReadFileContent.mockResolvedValue(mockPackageJsonNoDeps);

    const result = await dependencyAnalyzerTool.execute(
      params,
      mockConfig,
      mockContext
    ); // Use execute method

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain(
      '### Dependencies:\n - None found.'
    );
    expect(result.content[0].text).toContain('### Dev Dependencies (1):');
    expect(result.content[0].text).toContain('- vitest: ^3.0.0');
  });

  it('should return error if file reading fails', async () => {
    const params = {
      projectPath: '.',
      filePath: 'nonexistent.json',
    };
    const readError = new Error('File not found');
    mockReadFileContent.mockRejectedValue(readError);

    const result = await dependencyAnalyzerTool.execute(
      params,
      mockConfig,
      mockContext
    ); // Use execute method

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      `Error analyzing dependencies: ${readError.message}`
    );
  });
});
