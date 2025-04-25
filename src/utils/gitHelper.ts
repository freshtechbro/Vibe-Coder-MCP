import { exec } from 'child_process';
import { promisify } from 'util';

import { simpleGit } from 'simple-git';

import logger from '@/logger.js';

const execAsync = promisify(exec);

/**
 * Get a summary of the git diff
 * @param repositoryPath Path to the git repository
 * @param args Additional arguments for the git diff command
 * @returns A string with the diff summary
 */
async function getGitDiffSummary(
  repositoryPath: string,
  args: string[] = []
): Promise<string> {
  try {
    const git = simpleGit(repositoryPath);
    const isRepo = await git.checkIsRepo();

    if (!isRepo) {
      logger.error(`Path is not a git repository: ${repositoryPath}`);
      throw new Error(`Path is not a git repository: ${repositoryPath}`);
    }

    const diffResult = await git.diff(args);
    return diffResult;
  } catch (error) {
    logger.error({ err: error }, 'Failed to get git diff summary');
    throw error;
  }
}

class GitHelper {
  async getCommits(
    repository: string,
    since?: string,
    until?: string
  ): Promise<string[]> {
    try {
      const dateRange = [
        since ? `--since="${since}"` : '',
        until ? `--until="${until}"` : '',
      ]
        .filter(Boolean)
        .join(' ');

      const { stdout } = await execAsync(
        `git -C ${repository} log --pretty=format:"%h - %s (%an)" ${dateRange}`
      );

      return stdout.split('\n').filter(Boolean);
    } catch (error) {
      logger.error({ err: error }, 'Failed to get git commits');
      throw error;
    }
  }
}

export const gitHelper = new GitHelper();
export { getGitDiffSummary };
