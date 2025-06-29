/**
 * Universal Cross-Platform Path Validation Utilities
 * 
 * This module provides centralized path validation and comparison utilities
 * that work correctly across Windows, Unix, and Mac systems.
 * 
 * Key features:
 * - Windows case-insensitive path comparison
 * - Unix/Mac case-sensitive path comparison  
 * - Consistent path separator normalization
 * - Security validation for path traversal attacks
 */

import path from 'path';

export interface PathValidationResult {
  valid: boolean;
  error?: string;
  normalizedPath?: string;
}

/**
 * Normalizes a path for cross-platform comparison
 * - Resolves to absolute path
 * - Converts backslashes to forward slashes
 * - Does NOT change case (use comparePaths for case-sensitive comparison)
 */
export function normalizePath(inputPath: string): string {
  return path.resolve(inputPath).replace(/\\/g, '/');
}

/**
 * Compares two paths with proper cross-platform case sensitivity
 * - Windows: case-insensitive comparison
 * - Unix/Mac: case-sensitive comparison
 */
export function comparePaths(path1: string, path2: string): boolean {
  const normalized1 = normalizePath(path1);
  const normalized2 = normalizePath(path2);

  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    return normalized1.toLowerCase() === normalized2.toLowerCase();
  } else {
    return normalized1 === normalized2;
  }
}

/**
 * Checks if a child path is within a parent path (or equal to it)
 * Uses proper cross-platform case sensitivity
 */
export function isPathWithin(childPath: string, parentPath: string): boolean {
  const normalizedChild = normalizePath(childPath);
  const normalizedParent = normalizePath(parentPath);

  const isWindows = process.platform === 'win32';
  const childToCheck = isWindows ? normalizedChild.toLowerCase() : normalizedChild;
  const parentToCheck = isWindows ? normalizedParent.toLowerCase() : normalizedParent;

  // Check for exact match first
  if (childToCheck === parentToCheck) {
    return true;
  }

  // Check if child starts with parent + separator
  const parentWithSep = parentToCheck.endsWith('/') ? parentToCheck : parentToCheck + '/';
  return childToCheck.startsWith(parentWithSep);
}

/**
 * Validates a file path for security against path traversal attacks
 * and ensures it's within the allowed directory boundary
 */
export function validatePathSecurity(
  inputPath: string, 
  allowedDirectory: string = process.cwd()
): PathValidationResult {
  try {
    // Check for path traversal attempts
    if (inputPath.includes('..') || inputPath.includes('~')) {
      return { 
        valid: false, 
        error: 'Path traversal not allowed' 
      };
    }

    // Normalize paths
    const normalizedPath = normalizePath(inputPath);
    const normalizedAllowed = normalizePath(allowedDirectory);

    // Check if path is within allowed directory
    if (!isPathWithin(normalizedPath, normalizedAllowed)) {
      return {
        valid: false,
        error: `Absolute paths outside project directory not allowed. Path: ${normalizedPath}, Project: ${normalizedAllowed}`
      };
    }

    return {
      valid: true,
      normalizedPath
    };

  } catch (error) {
    return {
      valid: false,
      error: `Path validation error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Creates a secure path within the allowed boundary
 * Throws an error if the path is not valid
 */
export function createSecurePath(
  inputPath: string,
  allowedDirectory: string = process.cwd()
): string {
  const validation = validatePathSecurity(inputPath, allowedDirectory);
  
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  return validation.normalizedPath!;
}

/**
 * Validates file extension against allowed list
 */
export function validateFileExtension(
  filePath: string,
  allowedExtensions: string[]
): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return !ext || allowedExtensions.includes(ext);
}

/**
 * Complete file path validation combining security and extension checks
 */
export function validateFilePath(
  filePath: string,
  allowedDirectory: string = process.cwd(),
  allowedExtensions: string[] = ['.json', '.yaml', '.yml', '.md', '.txt']
): PathValidationResult {
  // Security validation
  const securityResult = validatePathSecurity(filePath, allowedDirectory);
  if (!securityResult.valid) {
    return securityResult;
  }

  // Extension validation
  if (!validateFileExtension(filePath, allowedExtensions)) {
    const ext = path.extname(filePath).toLowerCase();
    return {
      valid: false,
      error: `File extension ${ext} not allowed`
    };
  }

  return {
    valid: true,
    normalizedPath: securityResult.normalizedPath
  };
}
