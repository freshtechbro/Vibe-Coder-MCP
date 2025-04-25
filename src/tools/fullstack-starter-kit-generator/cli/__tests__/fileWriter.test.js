import fs from 'fs/promises';
import path from 'path';

import chalk from 'chalk';
import inquirer from 'inquirer';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { writeFileSafe, FileExistsError } from '../utils/fileWriter.js';

// Mock fs and inquirer
vi.mock('fs/promises');
vi.mock('inquirer');

describe('writeFileSafe', () => {
  const filePath = path.join(__dirname, 'testFile.txt');
  const content = 'Hello, World!';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should prompt for confirmation when overwriting a file with force flag', async () => {
    vi.mocked(fs.access).mockResolvedValueOnce(); // Simulate file exists
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ overwrite: true }); // Simulate user confirmation

    await writeFileSafe(filePath, content, { force: true });

    expect(fs.writeFile).toHaveBeenCalledWith(filePath, content);
  });

  it('should skip writing the file if user declines the overwrite', async () => {
    vi.mocked(fs.access).mockResolvedValueOnce(); // Simulate file exists
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ overwrite: false }); // Simulate user decline

    await writeFileSafe(filePath, content, { force: true });

    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      chalk.yellow(
        `⏩ Skipped existing file: ${path.relative(process.cwd(), filePath)}`
      )
    );
  });

  it('should throw FileExistsError if file exists and force is false', async () => {
    vi.mocked(fs.access).mockResolvedValueOnce(); // Simulate file exists

    await expect(writeFileSafe(filePath, content)).rejects.toThrow(
      FileExistsError
    );
  });

  it('should log dry run message if dryRun is true', async () => {
    await writeFileSafe(filePath, content, { dryRun: true });

    expect(console.log).toHaveBeenCalledWith(
      chalk.yellow.bold(
        `DRY RUN: Would write file: ${path.relative(process.cwd(), filePath)}`
      )
    );
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});
