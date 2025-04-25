// fileWriter.test.mjs (ESM + Vitest compatible)
import { describe, it, beforeEach, vi, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { writeFileSafe } from './fileWriter.js';

vi.mock('fs/promises');
vi.mock('chalk', () => ({
  yellow: { bold: vi.fn((msg) => `[YELLOW BOLD]${msg}`) },
}));

describe('writeFileSafe', () => {
  const __dirname = path.dirname(
    new URL(import.meta.url).pathname.substring(1)
  ); // Correctly get __dirname in ESM
  const tempDir = path.join(__dirname, 'temp'); // Define a temp directory relative to the test file
  const testFile = path.join(tempDir, 'test-output.txt'); // Target file within the temp directory
  const testContent = 'Hello, world!';

  beforeEach(async () => {
    vi.clearAllMocks();
    // Ensure the temp directory exists before each test
    await fs.mkdir(tempDir, { recursive: true });
    // Mock fs.access to simulate file not existing initially
    vi.mocked(fs.access).mockRejectedValue(new Error('File does not exist'));
  });

  it('should write file when dryRun is false', async () => {
    await writeFileSafe(testFile, testContent, { dryRun: false });
    expect(fs.writeFile).toHaveBeenCalledWith(testFile, testContent); // Default encoding is utf8
    expect(chalk.yellow.bold).not.toHaveBeenCalled();
  });

  it('should not write file and should log dry-run message when dryRun is true', async () => {
    await writeFileSafe(testFile, testContent, { dryRun: true });
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(chalk.yellow.bold).toHaveBeenCalledWith(
      `DRY RUN: Would write file: ${path.relative(process.cwd(), testFile)}`
    );
  });
});
