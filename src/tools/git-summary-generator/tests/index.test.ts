import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ToolExecutionContext } from '../../../services/routing/toolRegistry.js';
import { AppError } from '../../../utils/errors.js';
import { gitHelper } from '../../../utils/gitHelper.js';
import { gitSummaryGenerator } from '../index.js';

vi.mock('../../../utils/gitHelper.js');

vi.mock('../../../logger.js', () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock('../../../services/routing/toolRegistry.js', () => ({
  toolRegistry: {
    registerTool: vi.fn(),
  },
}));

const mockConfig = {};
const mockContext: ToolExecutionContext = {
  sessionId: 'test-git-summary-session',
};

describe('gitSummaryGenerator Tool', () => {
  const execute = gitSummaryGenerator.execute;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call gitHelper.getCommits with repository and optional params', async () => {
    const params = {
      repository: '/path/to/repo',
      since: '2023-01-01',
      until: '2023-12-31',
    };
    const mockCommits = ['feat: new feature', 'fix: bug #123'];
    vi.mocked(gitHelper.getCommits).mockResolvedValue(mockCommits);

    await execute(params, mockConfig, mockContext);

    expect(gitHelper.getCommits).toHaveBeenCalledTimes(1);
    expect(gitHelper.getCommits).toHaveBeenCalledWith(
      params.repository,
      params.since,
      params.until
    );
  });

  it('should call gitHelper.getCommits with only repository if others are omitted', async () => {
    const params = { repository: '/another/repo' };
    const mockCommits = ['refactor: improve code'];
    vi.mocked(gitHelper.getCommits).mockResolvedValue(mockCommits);

    await execute(params, mockConfig, mockContext);

    expect(gitHelper.getCommits).toHaveBeenCalledTimes(1);
    expect(gitHelper.getCommits).toHaveBeenCalledWith(
      params.repository,
      undefined,
      undefined
    );
  });

  it('should return ToolResult with joined commits on success', async () => {
    const params = { repository: '/path/to/repo' };
    const mockCommits = ['feat: new feature', 'fix: bug #123'];
    const expectedText = mockCommits.join('\n');
    vi.mocked(gitHelper.getCommits).mockResolvedValue(mockCommits);

    const result = await execute(params, mockConfig, mockContext);

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: expectedText,
        },
      ],
    });
  });

  it('should return ToolResult with empty text if no commits found', async () => {
    const params = { repository: '/empty/repo' };
    const mockCommits: string[] = [];
    vi.mocked(gitHelper.getCommits).mockResolvedValue(mockCommits);

    const result = await execute(params, mockConfig, mockContext);

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: '', // Empty string when joined
        },
      ],
    });
  });

  it('should re-throw error if gitHelper.getCommits throws', async () => {
    const params = { repository: '/error/repo' };
    const error = new AppError('Git command failed');
    vi.mocked(gitHelper.getCommits).mockRejectedValue(error);

    await expect(execute(params, mockConfig, mockContext)).rejects.toThrow(
      error
    );

    expect(gitHelper.getCommits).toHaveBeenCalledTimes(1);
    expect(gitHelper.getCommits).toHaveBeenCalledWith(
      params.repository,
      undefined,
      undefined
    );
  });
});
