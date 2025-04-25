import { promises as fs } from 'fs';
import path from 'path';

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  vi,
  MockInstance,
} from 'vitest';
import { readContextFile } from '../utils/contextHandler.js';

const tempDir = path.join(__dirname, 'temp_context_files');
const validFilePath = path.join(tempDir, 'valid_context.txt');
const emptyFilePath = path.join(tempDir, 'empty_context.txt');
const nonExistentFilePath = path.join(tempDir, 'non_existent.txt');
const traversalPath = path.join(tempDir, '../outside_file.txt'); // Attempting traversal outside tempDir

const validFileContent = 'This is some valid context content.';

describe('readContextFile', () => {
  let consoleErrorSpy: MockInstance<unknown[], void>;

  beforeAll(async () => {
    // Create temporary directory
    await fs.mkdir(tempDir, { recursive: true });

    // Create temporary files
    await fs.writeFile(validFilePath, validFileContent);
    await fs.writeFile(emptyFilePath, '');

    // Spy on console.error
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(async () => {
    // Clean up temporary directory and files
    await fs.rm(tempDir, { recursive: true, force: true });

    // Restore console.error spy
    consoleErrorSpy.mockRestore();
  });

  it('should read content from a valid file', async () => {
    const content = await readContextFile(validFilePath);
    expect(content).toBe(validFileContent);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return an empty string for an empty file', async () => {
    const content = await readContextFile(emptyFilePath);
    expect(content).toBe('');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return null and log an error for a non-existent file', async () => {
    const content = await readContextFile(nonExistentFilePath);
    expect(content).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should return null and log an error for a path traversal attempt', async () => {
    const content = await readContextFile(traversalPath);
    expect(content).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
