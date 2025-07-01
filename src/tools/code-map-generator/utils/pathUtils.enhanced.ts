/**
 * Enhanced path utilities for the Code-Map Generator tool.
 * This file contains utilities for resolving paths relative to the project root.
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../../logger.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine the project root directory (3 levels up from this file)
const PROJECT_ROOT = path.resolve(__dirname, '../../../..');

/**
 * Gets the project root directory.
 * @returns The absolute path to the project root directory
 */
export function getProjectRoot(): string {
  return PROJECT_ROOT;
}

/**
 * Resolves a path relative to the project root.
 * @param relativePath The path to resolve, relative to the project root
 * @returns The absolute path
 */
export function resolveProjectPath(relativePath: string): string {
  return path.join(PROJECT_ROOT, relativePath);
}

/**
 * Normalizes a path by resolving it against the project root if it's relative.
 * @param inputPath The path to normalize
 * @returns The normalized absolute path
 */
export function normalizePath(inputPath: string): string {
  // If the path is already absolute, return it as is
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }

  // Otherwise, resolve it against the project root
  return resolveProjectPath(inputPath);
}

/**
 * Validates that a path is within the allowed directory.
 * @param inputPath The path to validate
 * @param allowedDirectory The allowed directory boundary
 * @returns An object with validation result and normalized path
 */
export function validatePathSecurity(
  inputPath: string,
  allowedDirectory: string
): { isValid: boolean; normalizedPath?: string; error?: string } {
  try {
    // Normalize the allowed directory to an absolute path
    const normalizedAllowedDir = path.resolve(allowedDirectory);

    // Normalize the input path
    const normalizedPath = path.resolve(inputPath);

    // Check if the normalized path is within the allowed directory
    if (!isPathWithin(normalizedPath, normalizedAllowedDir)) {
      return {
        isValid: false,
        error: `Path '${inputPath}' is outside the allowed directory '${allowedDirectory}'`
      };
    }

    return {
      isValid: true,
      normalizedPath
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Error validating path security: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Checks if a path is within another path.
 * @param childPath The path to check
 * @param parentPath The parent path
 * @returns Whether the child path is within the parent path
 */
export function isPathWithin(childPath: string, parentPath: string): boolean {
  // Normalize both paths to absolute paths with consistent separators
  const normalizedChild = path.resolve(childPath).replace(/\\/g, '/');
  const normalizedParent = path.resolve(parentPath).replace(/\\/g, '/');

  // Check if the child path starts with the parent path
  // We add a trailing slash to the parent path to ensure we're checking for a directory boundary
  return normalizedChild.startsWith(normalizedParent + '/') || normalizedChild === normalizedParent;
}

/**
 * Creates a secure path within the allowed boundary.
 * @param inputPath The path to secure
 * @param allowedDirectory The allowed directory boundary
 * @returns The secure path if valid, throws an error otherwise
 */
export function createSecurePath(
  inputPath: string,
  allowedDirectory: string
): string {
  const validationResult = validatePathSecurity(inputPath, allowedDirectory);

  if (!validationResult.isValid) {
    logger.error({ 
      inputPath, 
      allowedDirectory, 
      error: validationResult.error 
    }, 'Security violation: Attempted to access path outside allowed directory');
    
    throw new Error(validationResult.error);
  }

  return validationResult.normalizedPath as string;
}
