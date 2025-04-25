// src/utils/fileReader.ts
import path from 'path';

import fs from 'fs-extra';

import logger from '@/logger.js';
import { AppError } from '@/utils/errors.js';

// Define a base directory for security - defaults to current working directory
// IMPORTANT: In a real deployment, this should be configured more securely!
const BASE_WORKING_DIR = process.cwd();

/**
 * Reads the content of a file safely.
 * Performs basic path validation to restrict access relative to the project directory.
 *
 * @param relativeFilePath Path to the file relative to the project root.
 * @returns The content of the file as a string.
 * @throws {AppError} If the file path is invalid, not found, or cannot be read.
 */
export async function readFileContent(
  relativeFilePath: string
): Promise<string> {
  // Basic path sanitization / normalization
  const normalizedRelativePath = path.normalize(relativeFilePath);

  // Security Check 1: Prevent absolute paths
  if (path.isAbsolute(normalizedRelativePath)) {
    logger.error(`Attempted to read absolute path: ${normalizedRelativePath}`);
    throw new AppError(`Invalid path: Absolute paths are not allowed.`);
  }

  // Resolve the absolute path based on the base working directory
  const absolutePath = path.resolve(BASE_WORKING_DIR, normalizedRelativePath);

  // Security Check 2: Ensure the resolved path is still within the base directory
  const relativeCheck = path.relative(BASE_WORKING_DIR, absolutePath);
  // Check if the relative path starts with '..' or is an absolute path itself (which can happen on Windows if it resolves to a different drive)
  if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
    logger.error(
      `Attempted directory traversal: ${normalizedRelativePath} resolved outside base directory (${BASE_WORKING_DIR}). Resolved to: ${absolutePath}`
    );
    throw new AppError(`Invalid path: Directory traversal is not allowed.`);
  }

  logger.debug(`Attempting to read file: ${absolutePath}`);

  try {
    // Check if the path actually exists and is a file
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      throw new AppError(`Invalid path: Not a file ('${relativeFilePath}').`);
    }

    // Read the file content
    const content = await fs.readFile(absolutePath, 'utf-8');
    logger.info(`Successfully read file: ${relativeFilePath}`);
    return content;
  } catch (error: unknown) {
    let errorMessage = `Failed to read file: '${relativeFilePath}'.`;

    // Type narrowing for errors with code property (like node fs errors)
    if (error && typeof error === 'object' && 'code' in error) {
      const fsError = error as { code: string; message?: string };

      if (fsError.code === 'ENOENT') {
        logger.warn(`File not found: ${absolutePath}`);
        errorMessage = `File not found: '${relativeFilePath}'.`;
      } else if (fsError.code === 'EACCES') {
        logger.error(`Permission denied for file: ${absolutePath}`);
        errorMessage = `Permission denied for file: '${relativeFilePath}'.`;
      }
    } else if (error instanceof AppError) {
      // Re-throw our own validation errors
      throw error;
    } else {
      // For other errors, log with the best information we have
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        { err: error },
        `Unexpected error reading file: ${absolutePath}`
      );
      errorMessage = `Could not read file '${relativeFilePath}'. Reason: ${errMsg || 'Unknown error'}`;
    }

    // Wrap other errors
    throw new AppError(
      errorMessage,
      { filePath: relativeFilePath },
      error instanceof Error ? error : undefined
    );
  }
}
