/**
 * File system utilities for the Code-Map Generator tool.
 * This file contains secure file system operation utilities.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import logger from '../../logger.js';
import { createSecurePath, validatePathSecurity, isPathWithin, normalizePath } from './pathUtils.js';
import { getBaseOutputDir } from './directoryUtils.js';

/**
 * Reads a file securely, validating the path against the allowed directory.
 * @param filePath The path of the file to read
 * @param allowedDirectory The allowed directory boundary for source code
 * @param encoding The encoding to use (default: 'utf-8')
 * @param allowedOutputDirectory Optional allowed directory boundary for output files
 * @returns A promise that resolves to the file content
 * @throws Error if the path is outside both allowed directories or the file cannot be read
 */
export async function readFileSecure(
  filePath: string,
  allowedDirectory: string,
  encoding: BufferEncoding = 'utf-8',
  allowedOutputDirectory?: string
): Promise<string> {
  // Normalize the path
  const normalizedPath = normalizePath(filePath);

  // Check if this is an output path
  const baseOutputDir = getBaseOutputDir();
  const isOutputPath = isPathWithin(normalizedPath, baseOutputDir);

  // Determine which directory to use for validation
  let securePath: string;

  if (isOutputPath && allowedOutputDirectory) {
    // For output files, use the allowedOutputDirectory
    securePath = createSecurePath(filePath, allowedOutputDirectory);
    logger.debug(`Using output directory validation for reading: ${filePath}`);
  } else {
    // For source files, use the allowedDirectory
    securePath = createSecurePath(filePath, allowedDirectory);
  }

  try {
    // Check if the file exists and is readable
    await fs.access(securePath, fsSync.constants.R_OK);

    // Read the file
    const content = await fs.readFile(securePath, { encoding });
    logger.debug(`Successfully read file: ${securePath}`);

    return content;
  } catch (error) {
    // Handle file access errors
    if (error instanceof Error && 'code' in error) {
      const fsError = error as { code: string; message?: string };

      if (fsError.code === 'ENOENT') {
        logger.warn(`File not found: ${securePath}`);
        throw new Error(`File not found: ${filePath}`);
      } else if (fsError.code === 'EACCES') {
        logger.error(`Permission denied for file: ${securePath}`);
        throw new Error(`Permission denied for file: ${filePath}`);
      }
    }

    // For other errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, path: securePath }, `Error reading file: ${errorMessage}`);
    throw new Error(`Could not read file '${filePath}': ${errorMessage}`);
  }
}

/**
 * Writes to a file securely, validating the path against the allowed directory.
 * @param filePath The path of the file to write
 * @param content The content to write
 * @param allowedDirectory The allowed directory boundary for source code
 * @param encoding The encoding to use (default: 'utf-8')
 * @param allowedOutputDirectory Optional allowed directory boundary for output files
 * @returns A promise that resolves when the file is written
 * @throws Error if the path is outside both allowed directories or the file cannot be written
 */
export async function writeFileSecure(
  filePath: string,
  content: string,
  allowedDirectory: string,
  encoding: BufferEncoding = 'utf-8',
  allowedOutputDirectory?: string
): Promise<void> {
  // Normalize the path
  const normalizedPath = normalizePath(filePath);

  // Check if this is an output path
  const baseOutputDir = getBaseOutputDir();
  const isOutputPath = isPathWithin(normalizedPath, baseOutputDir);

  // Determine which directory to use for validation
  let securePath: string;

  if (isOutputPath && allowedOutputDirectory) {
    // For output files, use the allowedOutputDirectory
    securePath = createSecurePath(filePath, allowedOutputDirectory);
    logger.debug(`Using output directory validation for: ${filePath}`);
  } else {
    // For source files, use the allowedDirectory
    securePath = createSecurePath(filePath, allowedDirectory);
  }

  try {
    // Ensure the directory exists
    const dirPath = path.dirname(securePath);
    await fs.mkdir(dirPath, { recursive: true });

    // Write the file
    await fs.writeFile(securePath, content, { encoding });
    logger.debug(`Successfully wrote file: ${securePath}`);
  } catch (error) {
    // Handle file write errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, path: securePath }, `Error writing file: ${errorMessage}`);
    throw new Error(`Could not write file '${filePath}': ${errorMessage}`);
  }
}

/**
 * Appends to a file securely, validating the path against the allowed directory.
 * @param filePath The path of the file to append to
 * @param content The content to append
 * @param allowedDirectory The allowed directory boundary for source code
 * @param encoding The encoding to use (default: 'utf-8')
 * @param allowedOutputDirectory Optional allowed directory boundary for output files
 * @returns A promise that resolves when the content is appended
 * @throws Error if the path is outside both allowed directories or the file cannot be appended to
 */
export async function appendToFileSecure(
  filePath: string,
  content: string,
  allowedDirectory: string,
  encoding: BufferEncoding = 'utf-8',
  allowedOutputDirectory?: string
): Promise<void> {
  // Normalize the path
  const normalizedPath = normalizePath(filePath);

  // Check if this is an output path
  const baseOutputDir = getBaseOutputDir();
  const isOutputPath = isPathWithin(normalizedPath, baseOutputDir);

  // Determine which directory to use for validation
  let securePath: string;

  if (isOutputPath && allowedOutputDirectory) {
    // For output files, use the allowedOutputDirectory
    securePath = createSecurePath(filePath, allowedOutputDirectory);
    logger.debug(`Using output directory validation for: ${filePath}`);
  } else {
    // For source files, use the allowedDirectory
    securePath = createSecurePath(filePath, allowedDirectory);
  }

  try {
    // Ensure the directory exists
    const dirPath = path.dirname(securePath);
    await fs.mkdir(dirPath, { recursive: true });

    // Append to the file
    await fs.appendFile(securePath, content, { encoding });
    logger.debug(`Successfully appended to file: ${securePath}`);
  } catch (error) {
    // Handle file append errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, path: securePath }, `Error appending to file: ${errorMessage}`);
    throw new Error(`Could not append to file '${filePath}': ${errorMessage}`);
  }
}

/**
 * Reads a directory securely, validating the path against the allowed directory.
 * @param dirPath The path of the directory to read
 * @param allowedDirectory The allowed directory boundary
 * @param options Options for reading the directory
 * @returns A promise that resolves to an array of directory entries
 * @throws Error if the path is outside the allowed directory or the directory cannot be read
 */
export async function readDirSecure(
  dirPath: string,
  allowedDirectory: string,
  options?: { withFileTypes?: boolean }
): Promise<fsSync.Dirent[]> {
  // Validate and normalize the path
  const securePath = createSecurePath(dirPath, allowedDirectory);

  try {
    // Check if the directory exists and is readable
    await fs.access(securePath, fsSync.constants.R_OK);

    // Read the directory with withFileTypes ALWAYS true to ensure Dirent objects
    const entries = await fs.readdir(securePath, { withFileTypes: true }) as fsSync.Dirent[];
    logger.debug(`Successfully read directory: ${securePath}`);

    return entries;
  } catch (error) {
    // Handle directory access errors
    if (error instanceof Error && 'code' in error) {
      const fsError = error as { code: string; message?: string };

      if (fsError.code === 'ENOENT') {
        logger.warn(`Directory not found: ${securePath}`);
        throw new Error(`Directory not found: ${dirPath}`);
      } else if (fsError.code === 'EACCES') {
        logger.error(`Permission denied for directory: ${securePath}`);
        throw new Error(`Permission denied for directory: ${dirPath}`);
      }
    }

    // For other errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, path: securePath }, `Error reading directory: ${errorMessage}`);
    throw new Error(`Could not read directory '${dirPath}': ${errorMessage}`);
  }
}

/**
 * Gets file stats securely, validating the path against the allowed directory.
 * @param filePath The path of the file to get stats for
 * @param allowedDirectory The allowed directory boundary
 * @returns A promise that resolves to the file stats
 * @throws Error if the path is outside the allowed directory or the stats cannot be retrieved
 */
export async function statSecure(
  filePath: string,
  allowedDirectory: string
): Promise<fsSync.Stats> {
  // Validate and normalize the path
  const securePath = createSecurePath(filePath, allowedDirectory);

  try {
    // Get the file stats
    const stats = await fs.stat(securePath);
    logger.debug(`Successfully got stats for: ${securePath}`);

    return stats;
  } catch (error) {
    // Handle stat errors
    if (error instanceof Error && 'code' in error) {
      const fsError = error as { code: string; message?: string };

      if (fsError.code === 'ENOENT') {
        logger.warn(`File not found: ${securePath}`);
        throw new Error(`File not found: ${filePath}`);
      } else if (fsError.code === 'EACCES') {
        logger.error(`Permission denied for file: ${securePath}`);
        throw new Error(`Permission denied for file: ${filePath}`);
      }
    }

    // For other errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, path: securePath }, `Error getting stats: ${errorMessage}`);
    throw new Error(`Could not get stats for '${filePath}': ${errorMessage}`);
  }
}
