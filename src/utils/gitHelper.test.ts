// src/utils/gitHelper.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

import logger from '@/logger.js';
import { AppError } from '@/utils/errors.js';
import { getGitDiffSummary } from '@/utils/gitHelper.js';

// Mock the simple-git library
// Declare mocks *inside* the factory to avoid hoisting issues
vi.mock('simple-git', () => {
  const mockDiff = vi.fn();
  const mockCheckIsRepo = vi.fn();
  return {
    // Expose mocks for test manipulation if needed (optional)
    _mockDiff: mockDiff,
    _mockCheckIsRepo: mockCheckIsRepo,
    // The actual mock implementation
    simpleGit: vi.fn(() => ({
      checkIsRepo: mockCheckIsRepo,
      diff: mockDiff,
    })),
  };
});

// Mock logger
vi.spyOn(logger, 'info').mockImplementation(() => {});
vi.spyOn(logger, 'debug').mockImplementation(() => {});
vi.spyOn(logger, 'warn').mockImplementation(() => {});
vi.spyOn(logger, 'error').mockImplementation(() => {});

// Import the mocks if they were exposed (adjust based on actual exposure)
// We might need to adjust how tests access these mocks now
// For now, let's assume tests can access them or we adjust setup later.
// import { _mockDiff, _mockCheckIsRepo } from 'simple-git'; // This won't work directly, need adjustment

describe('getGitDiffSummary', () => {
  // Need to access the mocks defined inside the factory.
  // One way is to re-import the mocked module or use a helper.
  // Let's try accessing them via the mocked module structure if exposed.
  let mockCheckIsRepo: ReturnType<typeof vi.fn>;
  let mockDiff: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Dynamically import the mocked module to get access to the inner mocks
    // This ensures we get the *mocked* version.
    const gitMock = await import('simple-git');
    // @ts-expect-error - Accessing internal mock properties for testing
    mockCheckIsRepo = gitMock._mockCheckIsRepo;
    // @ts-expect-error - Accessing internal mock properties for testing
    mockDiff = gitMock._mockDiff;

    vi.clearAllMocks(); // Clear calls between tests
    // Reset mock implementations if needed (vi.clearAllMocks doesn't reset implementations)
    mockCheckIsRepo.mockReset();
    mockDiff.mockReset();

    // Default mocks for success
    mockCheckIsRepo.mockResolvedValue(true);
    mockDiff.mockResolvedValue('mock diff output');
  });

  it('should call checkIsRepo', async () => {
    await getGitDiffSummary('/test/repo/path');
    expect(mockCheckIsRepo).toHaveBeenCalledTimes(1);
  });

  it('should throw AppError if not a git repo', async () => {
    mockCheckIsRepo.mockResolvedValue(false);
    // Using await expect().rejects pattern for async errors
    await expect(getGitDiffSummary('/test/repo/path')).rejects.toThrow(
      new AppError('Not a Git repository or git command not found.')
    );
  });

  it('should call git.diff with default options (empty array) for unstaged changes', async () => {
    await getGitDiffSummary('/test/repo/path');
    expect(mockDiff).toHaveBeenCalledTimes(1);
    // simple-git diff takes an array of string options. Empty array means default (unstaged).
    expect(mockDiff).toHaveBeenCalledWith([]);
  });

  it('should call git.diff with --staged option if specified', async () => {
    await getGitDiffSummary('/test/repo/path', ['--staged']);
    expect(mockDiff).toHaveBeenCalledTimes(1);
    expect(mockDiff).toHaveBeenCalledWith(['--staged']);
  });

  it('should return diff output on success', async () => {
    const result = await getGitDiffSummary('/test/repo/path');
    expect(result).toBe('mock diff output');
  });

  it('should return appropriate message for no unstaged changes', async () => {
    mockDiff.mockResolvedValue(''); // Simulate no changes
    const result = await getGitDiffSummary('/test/repo/path'); // Unstaged by default
    expect(result).toBe('No unstaged changes found.');
  });

  it('should return appropriate message for no staged changes', async () => {
    mockDiff.mockResolvedValue(''); // Simulate no changes
    const result = await getGitDiffSummary('/test/repo/path', ['--staged']);
    expect(result).toBe('No staged changes found.');
  });

  it('should throw AppError if git.diff fails', async () => {
    const gitError = new Error('git command failed');
    mockDiff.mockRejectedValue(gitError);
    // Check the error message specifically, not the whole instance
    await expect(getGitDiffSummary('/test/repo/path')).rejects.toHaveProperty(
      'message',
      `Failed to get Git diff. Reason: ${gitError.message}`
    );
    // Optionally, also check the instance type
    await expect(getGitDiffSummary('/test/repo/path')).rejects.toBeInstanceOf(
      AppError
    );
  });

  it('should throw original AppError if checkIsRepo throws AppError', async () => {
    const checkError = new AppError('Specific check error');
    mockCheckIsRepo.mockRejectedValue(checkError);
    await expect(getGitDiffSummary('/test/repo/path')).rejects.toThrow(
      checkError
    );
  });
});
