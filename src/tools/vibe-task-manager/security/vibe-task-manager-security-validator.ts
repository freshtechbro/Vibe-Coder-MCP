/**
 * Vibe Task Manager Security Boundary Validator
 * Follows the SecurityBoundaryValidator pattern from code-map-generator
 * Provides createSecureReadPath() and createSecureWritePath() methods for consistent security boundary enforcement
 */

import * as path from 'path';
import logger from '../../../logger.js';
import { getPathResolver } from '../utils/path-resolver.js';

/**
 * Security validation result
 */
export interface SecurityValidationResult {
  isValid: boolean;
  securePath?: string;
  error?: string;
  violationType?: 'path_traversal' | 'outside_boundary' | 'invalid_path';
}

/**
 * Vibe Task Manager Security Boundary Validator
 * Follows the same pattern as code-map-generator's SecurityBoundaryValidator
 */
export class VibeTaskManagerSecurityValidator {
  private static instance: VibeTaskManagerSecurityValidator;
  private normalizedReadDir: string;
  private normalizedWriteDir: string;

  /**
   * Creates a new security boundary validator.
   * @param readDir The allowed directory for reading files (defaults to VIBE_TASK_MANAGER_READ_DIR)
   * @param writeDir The allowed directory for writing files (defaults to VIBE_CODER_OUTPUT_DIR)
   */
  constructor(readDir?: string, writeDir?: string) {
    const pathResolver = getPathResolver();
    
    // Use provided directories or fall back to path resolver defaults
    const allowedReadDir = readDir || pathResolver.getReadDirectory();
    const allowedWriteDir = writeDir || pathResolver.getOutputDirectory();
    
    this.normalizedReadDir = path.resolve(allowedReadDir);
    this.normalizedWriteDir = path.resolve(allowedWriteDir);

    logger.debug({
      readDir: this.normalizedReadDir,
      writeDir: this.normalizedWriteDir
    }, 'VibeTaskManagerSecurityValidator initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(readDir?: string, writeDir?: string): VibeTaskManagerSecurityValidator {
    if (!VibeTaskManagerSecurityValidator.instance) {
      VibeTaskManagerSecurityValidator.instance = new VibeTaskManagerSecurityValidator(readDir, writeDir);
    }
    return VibeTaskManagerSecurityValidator.instance;
  }

  /**
   * Checks if a path is within the allowed read directory.
   * @param filePath The path to check
   * @returns Whether the path is within the allowed read directory
   */
  public isPathWithinReadDirectory(filePath: string): boolean {
    try {
      const normalizedPath = path.resolve(filePath);
      return this.isPathWithin(normalizedPath, this.normalizedReadDir);
    } catch (error) {
      logger.error({ err: error, filePath }, 'Error checking if path is within read directory');
      return false;
    }
  }

  /**
   * Checks if a path is within the allowed write directory.
   * @param filePath The path to check
   * @returns Whether the path is within the allowed write directory
   */
  public isPathWithinWriteDirectory(filePath: string): boolean {
    try {
      const normalizedPath = path.resolve(filePath);
      return this.isPathWithin(normalizedPath, this.normalizedWriteDir);
    } catch (error) {
      logger.error({ err: error, filePath }, 'Error checking if path is within write directory');
      return false;
    }
  }

  /**
   * Creates a secure path within the read directory.
   * @param filePath The path to secure
   * @returns The secure path if valid, throws an error otherwise
   */
  public createSecureReadPath(filePath: string): string {
    if (!this.isPathWithinReadDirectory(filePath)) {
      const error = `Security violation: Path '${filePath}' is outside the allowed read directory '${this.normalizedReadDir}'`;
      logger.error({ filePath, readDir: this.normalizedReadDir }, error);
      throw new Error(error);
    }
    return path.resolve(filePath);
  }

  /**
   * Creates a secure path within the write directory.
   * @param filePath The path to secure
   * @returns The secure path if valid, throws an error otherwise
   */
  public createSecureWritePath(filePath: string): string {
    if (!this.isPathWithinWriteDirectory(filePath)) {
      const error = `Security violation: Path '${filePath}' is outside the allowed write directory '${this.normalizedWriteDir}'`;
      logger.error({ filePath, writeDir: this.normalizedWriteDir }, error);
      throw new Error(error);
    }
    return path.resolve(filePath);
  }

  /**
   * Validates a path for read operations
   * @param filePath The path to validate
   * @returns Security validation result
   */
  public validateReadPath(filePath: string): SecurityValidationResult {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return {
          isValid: false,
          error: 'Invalid path: path must be a non-empty string',
          violationType: 'invalid_path'
        };
      }

      // Check for path traversal attempts
      if (filePath.includes('..')) {
        return {
          isValid: false,
          error: 'Path traversal detected in read path',
          violationType: 'path_traversal'
        };
      }

      if (!this.isPathWithinReadDirectory(filePath)) {
        return {
          isValid: false,
          error: `Path is outside allowed read directory: ${this.normalizedReadDir}`,
          violationType: 'outside_boundary'
        };
      }

      return {
        isValid: true,
        securePath: path.resolve(filePath)
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Path validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        violationType: 'invalid_path'
      };
    }
  }

  /**
   * Validates a path for write operations
   * @param filePath The path to validate
   * @returns Security validation result
   */
  public validateWritePath(filePath: string): SecurityValidationResult {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return {
          isValid: false,
          error: 'Invalid path: path must be a non-empty string',
          violationType: 'invalid_path'
        };
      }

      // Check for path traversal attempts
      if (filePath.includes('..')) {
        return {
          isValid: false,
          error: 'Path traversal detected in write path',
          violationType: 'path_traversal'
        };
      }

      if (!this.isPathWithinWriteDirectory(filePath)) {
        return {
          isValid: false,
          error: `Path is outside allowed write directory: ${this.normalizedWriteDir}`,
          violationType: 'outside_boundary'
        };
      }

      return {
        isValid: true,
        securePath: path.resolve(filePath)
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Path validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        violationType: 'invalid_path'
      };
    }
  }

  /**
   * Get the normalized read directory
   */
  public getReadDirectory(): string {
    return this.normalizedReadDir;
  }

  /**
   * Get the normalized write directory
   */
  public getWriteDirectory(): string {
    return this.normalizedWriteDir;
  }

  /**
   * Checks if a path is within another path.
   * @param childPath The child path
   * @param parentPath The parent path
   * @returns Whether the child path is within the parent path
   */
  private isPathWithin(childPath: string, parentPath: string): boolean {
    // Normalize paths to ensure consistent comparison
    const normalizedChild = path.normalize(childPath);
    const normalizedParent = path.normalize(parentPath);

    // Check if the child path starts with the parent path
    // and ensure it's a proper subdirectory by checking for path separator
    return normalizedChild === normalizedParent || 
           (normalizedChild.startsWith(normalizedParent) && 
            normalizedChild.substring(normalizedParent.length, normalizedParent.length + 1) === path.sep);
  }
}

/**
 * Convenience function to get the singleton VibeTaskManagerSecurityValidator instance
 */
export function getVibeTaskManagerSecurityValidator(readDir?: string, writeDir?: string): VibeTaskManagerSecurityValidator {
  return VibeTaskManagerSecurityValidator.getInstance(readDir, writeDir);
}

/**
 * Convenience function to create a secure read path
 */
export function createSecureReadPath(filePath: string): string {
  const validator = getVibeTaskManagerSecurityValidator();
  return validator.createSecureReadPath(filePath);
}

/**
 * Convenience function to create a secure write path
 */
export function createSecureWritePath(filePath: string): string {
  const validator = getVibeTaskManagerSecurityValidator();
  return validator.createSecureWritePath(filePath);
}
