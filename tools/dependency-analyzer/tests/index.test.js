// src/tools/dependency-analyzer/tests/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

import logger from '../../../logger.js'; // Adjust path if necessary
import { AppError } from '../../../utils/errors.js'; // Only import what's used
import * as fileReader from '../../../utils/fileReader.js'; // To mock
import { analyzeDependencies } from '../index.js'; // Executor to test
// Mock fileReader
const readFileMock = vi.spyOn(fileReader, 'readFileContent');
// Mock logger
vi.spyOn(logger, 'info').mockImplementation(() => {});
vi.spyOn(logger, 'warn').mockImplementation(() => {});
vi.spyOn(logger, 'error').mockImplementation(() => {});
const mockConfig = {
  baseUrl: '',
  apiKey: '',
  geminiModel: '',
  perplexityModel: '',
};
describe('analyzeDependencies Tool', () => {
  const mockPackageJsonContent = JSON.stringify({
    name: 'test-package',
    version: '1.0.0',
    dependencies: { express: '^4.18.0' },
    devDependencies: { vitest: '^3.0.0' },
  });
  const mockPackageJsonNoDevDeps = JSON.stringify({
    name: 'test-package-no-dev',
    dependencies: { axios: '1.0.0' },
  });
  const mockPackageJsonNoDeps = JSON.stringify({
    name: 'test-package-no-deps',
    devDependencies: { eslint: '8.0.0' },
  });
  const invalidJsonContent = '{ name: test';
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('should analyze package.json successfully', async () => {
    readFileMock.mockResolvedValue(mockPackageJsonContent);
    const result = await analyzeDependencies(
      { filePath: 'package.json' },
      mockConfig
    );
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain(
      '## Dependency Analysis for: package.json'
    );
    expect(result.content[0].text).toContain('### Dependencies (1):');
    expect(result.content[0].text).toContain('- express: ^4.18.0');
    expect(result.content[0].text).toContain('### Dev Dependencies (1):');
    expect(result.content[0].text).toContain('- vitest: ^3.0.0');
    expect(readFileMock).toHaveBeenCalledWith('package.json');
  });
  it('should handle package.json with missing devDependencies', async () => {
    readFileMock.mockResolvedValue(mockPackageJsonNoDevDeps);
    const result = await analyzeDependencies(
      { filePath: 'package.json' },
      mockConfig
    );
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('### Dependencies (1):');
    expect(result.content[0].text).toContain('- axios: 1.0.0');
    expect(result.content[0].text).toContain(
      '### Dev Dependencies:\n - None found.'
    );
  });
  it('should handle package.json with missing dependencies', async () => {
    readFileMock.mockResolvedValue(mockPackageJsonNoDeps);
    const result = await analyzeDependencies(
      { filePath: 'package.json' },
      mockConfig
    );
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain(
      '### Dependencies:\n - None found.'
    );
    expect(result.content[0].text).toContain('### Dev Dependencies (1):');
    expect(result.content[0].text).toContain('- eslint: 8.0.0');
  });
  it('should return error if file reading fails', async () => {
    const error = new AppError('File not found');
    readFileMock.mockRejectedValue(error);
    const result = await analyzeDependencies(
      { filePath: 'nonexistent.json' },
      mockConfig
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      `Error analyzing dependencies: ${error.message}`
    );
    expect(result.errorDetails?.type).toBe(error.name);
  });
  it('should return error if JSON parsing fails', async () => {
    readFileMock.mockResolvedValue(invalidJsonContent);
    const result = await analyzeDependencies(
      { filePath: 'package.json' },
      mockConfig
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'Error analyzing dependencies: Invalid JSON in file: package.json'
    );
    expect(result.errorDetails?.type).toBe('ParsingError');
  });
  it('should return error for unsupported file types', async () => {
    const filePath = 'requirements.txt';
    readFileMock.mockResolvedValue('flask==2.0'); // Valid content, but type unsupported
    const result = await analyzeDependencies({ filePath }, mockConfig);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      `Error: Unsupported file type 'requirements.txt'. Currently only 'package.json' is supported.`
    );
    expect(result.errorDetails?.type).toBe('UnsupportedFileTypeError');
    expect(readFileMock).toHaveBeenCalledWith(filePath); // Ensure it tried to read
  });
});
