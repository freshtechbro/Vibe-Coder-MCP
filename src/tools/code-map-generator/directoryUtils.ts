/**
 * Directory utilities for the Code-Map Generator tool.
 * This file contains functions for directory operations.
 */

import fs from 'fs/promises';
import path from 'path';
import logger from '../../logger.js';
import { DirectoryStructure, CodeMapGeneratorConfig } from './types.js';

/**
 * Gets the base output directory using the project's standard pattern.
 * @returns The base output directory path
 */
export function getBaseOutputDir(): string {
  return process.env.VIBE_CODER_OUTPUT_DIR
    ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
    : path.join(process.cwd(), 'VibeCoderOutput');
}

/**
 * Creates a directory if it doesn't exist.
 * @param dirPath The directory path to create
 * @returns A promise that resolves when the directory is created
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    logger.debug(`Ensured directory exists: ${dirPath}`);
  } catch (error) {
    logger.error({ err: error, path: dirPath }, `Failed to create directory: ${dirPath}`);
    throw error;
  }
}

/**
 * Validates that a directory is writable.
 * @param dirPath The directory path to validate
 * @returns A promise that resolves when the directory is validated
 */
export async function validateDirectoryIsWritable(dirPath: string): Promise<void> {
  try {
    // Ensure the directory exists
    await ensureDirectoryExists(dirPath);

    // Create a temporary file to test write access
    const testFilePath = path.join(dirPath, `.write-test-${Date.now()}.tmp`);
    await fs.writeFile(testFilePath, 'test');

    // Clean up the test file
    await fs.unlink(testFilePath);

    logger.debug(`Validated directory is writable: ${dirPath}`);
  } catch (error) {
    logger.error({ err: error, path: dirPath }, `Directory is not writable: ${dirPath}`);
    throw new Error(`Directory is not writable: ${dirPath}`);
  }
}

/**
 * Gets the output directory path based on configuration.
 * @param config The Code-Map Generator configuration
 * @returns The output directory path
 */
export function getOutputDirectory(_config?: CodeMapGeneratorConfig): string {
  // Always use the base output directory from environment variable
  const baseOutputDir = getBaseOutputDir();

  // Always use the standard subdirectory for code-map-generator output
  const outputDir = path.join(baseOutputDir, 'code-map-generator');

  logger.debug(`Using output directory: ${outputDir}`);
  return outputDir;
}

/**
 * Gets the cache directory path based on configuration.
 * @param config The Code-Map Generator configuration
 * @returns The cache directory path
 */
export function getCacheDirectory(config?: CodeMapGeneratorConfig): string {
  // Always use a subdirectory of the output directory for cache
  const outputDir = getOutputDirectory(config);
  const cacheDir = path.join(outputDir, '.cache');

  logger.debug(`Using cache directory: ${cacheDir}`);
  return cacheDir;
}

/**
 * Gets the file info cache directory path.
 * @param cacheDir The base cache directory path
 * @returns The file info cache directory path
 */
export function getFileInfoCacheDirectory(cacheDir: string): string {
  return path.join(cacheDir, 'file-info');
}

/**
 * Gets the metadata cache directory path.
 * @param cacheDir The base cache directory path
 * @returns The metadata cache directory path
 */
export function getMetadataCacheDirectory(cacheDir: string): string {
  return path.join(cacheDir, 'metadata');
}

/**
 * Gets the temporary directory path.
 * @param cacheDir The base cache directory path
 * @returns The temporary directory path
 */
export function getTempDirectory(cacheDir: string): string {
  return path.join(cacheDir, 'temp');
}

/**
 * Gets a temporary directory for the current job.
 * @param tempDir The base temporary directory path
 * @param jobId The job ID
 * @returns The job-specific temporary directory path
 */
export function getJobTempDirectory(tempDir: string, jobId: string): string {
  return path.join(tempDir, jobId);
}

/**
 * Generates a filename with timestamp and sanitized name.
 * @param name The base name for the file
 * @param extension The file extension (without the dot)
 * @returns The generated filename
 */
export function generateTimestampFileName(name: string, extension: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
  return `${timestamp}-${sanitizedName}.${extension}`;
}

/**
 * Creates the directory structure for the Code-Map Generator.
 * @param config The Code-Map Generator configuration
 * @param jobId The job ID
 * @returns A promise that resolves to the directory structure
 */
export async function createDirectoryStructure(
  config: CodeMapGeneratorConfig,
  jobId: string
): Promise<DirectoryStructure> {
  // Get directory paths
  const baseOutputDir = getBaseOutputDir();
  const outputDir = getOutputDirectory(config);
  const cacheDir = getCacheDirectory(config);
  const fileInfoCacheDir = getFileInfoCacheDirectory(cacheDir);
  const metadataCacheDir = getMetadataCacheDirectory(cacheDir);
  const tempDir = getTempDirectory(cacheDir);
  const jobTempDir = getJobTempDirectory(tempDir, jobId);

  // Create directories
  await ensureDirectoryExists(baseOutputDir);
  await ensureDirectoryExists(outputDir);

  // Only create cache directories if caching is enabled
  if (config.cache?.enabled !== false) {
    await ensureDirectoryExists(cacheDir);
    await ensureDirectoryExists(fileInfoCacheDir);
    await ensureDirectoryExists(metadataCacheDir);
    await ensureDirectoryExists(tempDir);
    await ensureDirectoryExists(jobTempDir);
  }

  // Return the directory structure
  const directoryStructure: DirectoryStructure = {
    baseOutputDir,
    outputDir,
    cacheDir,
    fileInfoCacheDir,
    metadataCacheDir,
    tempDir,
    jobTempDir,
  };

  logger.debug({ directoryStructure }, 'Created directory structure for Code-Map Generator');

  return directoryStructure;
}
