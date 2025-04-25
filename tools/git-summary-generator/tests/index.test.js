// src/tools/git-summary-generator/tests/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

import logger from '../../../logger.js'; // Adjust path if necessary
import { AppError } from '../../../utils/errors.js'; // Adjust path if necessary
import * as gitHelper from '../../../utils/gitHelper.js'; // Module to mock
import { generateGitSummary } from '../index.js'; // Import the actual executor
// Mock gitHelper
const getDiffMock = vi.spyOn(gitHelper, 'getGitDiffSummary');
// Mock logger
vi.spyOn(logger, 'info').mockImplementation(() => {});
vi.spyOn(logger, 'error').mockImplementation(() => {});
const mockConfig = {
  baseUrl: '',
  apiKey: '',
  geminiModel: '',
  perplexityModel: '',
}; // Not used by this tool
describe('generateGitSummary Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('should call getGitDiffSummary with staged: false by default', async () => {
    getDiffMock.mockResolvedValue('Unstaged diff');
    await generateGitSummary({}, mockConfig); // Empty params
    expect(getDiffMock).toHaveBeenCalledTimes(1);
    // Check the options object passed - default should be undefined if not provided
    expect(getDiffMock).toHaveBeenCalledWith(
      expect.objectContaining({ staged: undefined })
    );
  });
  it('should call getGitDiffSummary with staged: true if specified', async () => {
    getDiffMock.mockResolvedValue('Staged diff');
    await generateGitSummary({ staged: true }, mockConfig);
    expect(getDiffMock).toHaveBeenCalledTimes(1);
    expect(getDiffMock).toHaveBeenCalledWith(
      expect.objectContaining({ staged: true })
    );
  });
  it('should return diff content on success', async () => {
    const mockDiff =
      'Index: file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ ... @@\n+added';
    getDiffMock.mockResolvedValue(mockDiff);
    const result = await generateGitSummary({}, mockConfig);
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe(mockDiff);
  });
  it('should return error result if getGitDiffSummary throws', async () => {
    const error = new AppError('Not a repo');
    getDiffMock.mockRejectedValue(error);
    const result = await generateGitSummary({}, mockConfig);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      `Error getting Git summary: ${error.message}`
    );
    expect(result.errorDetails?.type).toBe(error.name);
  });
  // Test that the tool correctly returns the message from the helper
  it('should return specific message if diff helper returns "No unstaged changes found."', async () => {
    const noChangesMsg = 'No unstaged changes found.';
    getDiffMock.mockResolvedValue(noChangesMsg); // Helper returns specific string
    const result = await generateGitSummary({ staged: false }, mockConfig);
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe(noChangesMsg); // Tool should return the helper's message directly
  });
  // Test that the tool correctly returns the message from the helper
  it('should return specific message if diff helper returns "No staged changes found."', async () => {
    const noChangesMsg = 'No staged changes found.';
    getDiffMock.mockResolvedValue(noChangesMsg); // Helper returns specific string
    const result = await generateGitSummary({ staged: true }, mockConfig);
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe(noChangesMsg); // Tool should return the helper's message directly
  });
});
