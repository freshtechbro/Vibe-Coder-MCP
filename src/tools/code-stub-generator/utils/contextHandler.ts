import { promises as fs } from 'fs';
import path from 'path';
import logger from '../../../logger.js';

/**
 * Reads the content of a context file with basic path validation.
 * @param filePath The path to the context file.
 * @returns The file content as a string, or null if validation fails or an error occurs.
 */
export async function readContextFile(
  filePath: string
): Promise<string | null> {
  const projectRoot = path.resolve('.'); // Assuming workspace root is project root for now

  try {
    const absolutePath = path.resolve(filePath);

    // Basic path validation to prevent traversal
    if (!absolutePath.startsWith(projectRoot) || filePath.includes('..')) {
      logger.error({ filePath }, 'Attempted path traversal');
      console.error(`Attempted path traversal for filePath: ${filePath}`);
      return null;
    }

    const content = await fs.readFile(absolutePath, 'utf-8');
    return content;
  } catch (error) {
    // Handle errors like file not found (ENOENT) or permission denied (EACCES)
    logger.error({ err: error }, 'Error reading context file');
    console.error(`Error reading context file: ${error}`);
    return null;
  }
}
