import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';
import logger from '../../../logger.js';
import { AppError, ValidationError } from '../../../utils/errors.js';

/**
 * File operation result
 */
export interface FileOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    filePath: string;
    operation: string;
    timestamp: Date;
    size?: number;
    loadTime?: number;
    fromCache?: boolean;
  };
}

/**
 * File system utilities for the Vibe Task Manager
 */
export class FileUtils {
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly ALLOWED_EXTENSIONS = ['.json', '.yaml', '.yml', '.md', '.txt'];

  /**
   * Safely read a file with validation
   */
  static async readFile(filePath: string): Promise<FileOperationResult<string>> {
    try {
      // Validate file path
      const validationResult = this.validateFilePath(filePath);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Invalid file path: ${validationResult.error}`,
          metadata: {
            filePath,
            operation: 'read',
            timestamp: new Date()
          }
        };
      }

      // Check if file exists
      if (!await fs.pathExists(filePath)) {
        return {
          success: false,
          error: 'File does not exist',
          metadata: {
            filePath,
            operation: 'read',
            timestamp: new Date()
          }
        };
      }

      // Check file size
      const stats = await fs.stat(filePath);
      if (stats.size > this.MAX_FILE_SIZE) {
        return {
          success: false,
          error: `File too large: ${stats.size} bytes (max: ${this.MAX_FILE_SIZE})`,
          metadata: {
            filePath,
            operation: 'read',
            timestamp: new Date(),
            size: stats.size
          }
        };
      }

      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');

      logger.debug({ filePath, size: stats.size }, 'File read successfully');

      return {
        success: true,
        data: content,
        metadata: {
          filePath,
          operation: 'read',
          timestamp: new Date(),
          size: stats.size
        }
      };

    } catch (error) {
      logger.error({ err: error, filePath }, 'Failed to read file');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath,
          operation: 'read',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Safely write a file with validation
   */
  static async writeFile(filePath: string, content: string): Promise<FileOperationResult<void>> {
    try {
      // Validate file path
      const validationResult = this.validateFilePath(filePath);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Invalid file path: ${validationResult.error}`,
          metadata: {
            filePath,
            operation: 'write',
            timestamp: new Date()
          }
        };
      }

      // Ensure directory exists
      const dirPath = path.dirname(filePath);
      await fs.ensureDir(dirPath);

      // Write file content
      await fs.writeFile(filePath, content, 'utf-8');

      const stats = await fs.stat(filePath);

      logger.debug({ filePath, size: stats.size }, 'File written successfully');

      return {
        success: true,
        metadata: {
          filePath,
          operation: 'write',
          timestamp: new Date(),
          size: stats.size
        }
      };

    } catch (error) {
      logger.error({ err: error, filePath }, 'Failed to write file');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath,
          operation: 'write',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Read and parse YAML file with schema validation
   */
  static async readYamlFile<T>(
    filePath: string,
    schema?: z.ZodSchema<T>
  ): Promise<FileOperationResult<T>> {
    try {
      const readResult = await this.readFile(filePath);
      if (!readResult.success) {
        return readResult as FileOperationResult<T>;
      }

      // Parse YAML content
      const parsedData = yaml.load(readResult.data!) as T;

      // Validate with schema if provided
      if (schema) {
        const validationResult = schema.safeParse(parsedData);
        if (!validationResult.success) {
          return {
            success: false,
            error: `YAML validation failed: ${validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
            metadata: {
              filePath,
              operation: 'read_yaml',
              timestamp: new Date()
            }
          };
        }

        return {
          success: true,
          data: validationResult.data,
          metadata: {
            filePath,
            operation: 'read_yaml',
            timestamp: new Date(),
            size: readResult.metadata?.size
          }
        };
      }

      return {
        success: true,
        data: parsedData,
        metadata: {
          filePath,
          operation: 'read_yaml',
          timestamp: new Date(),
          size: readResult.metadata?.size
        }
      };

    } catch (error) {
      logger.error({ err: error, filePath }, 'Failed to read YAML file');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath,
          operation: 'read_yaml',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Write data to YAML file
   */
  static async writeYamlFile<T>(
    filePath: string,
    data: T,
    schema?: z.ZodSchema<T>
  ): Promise<FileOperationResult<void>> {
    try {
      // Validate with schema if provided
      if (schema) {
        const validationResult = schema.safeParse(data);
        if (!validationResult.success) {
          return {
            success: false,
            error: `Data validation failed: ${validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
            metadata: {
              filePath,
              operation: 'write_yaml',
              timestamp: new Date()
            }
          };
        }
      }

      // Convert to YAML
      const yamlContent = yaml.dump(data, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: true
      });

      // Write file
      return await this.writeFile(filePath, yamlContent);

    } catch (error) {
      logger.error({ err: error, filePath }, 'Failed to write YAML file');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath,
          operation: 'write_yaml',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Read and parse JSON file with schema validation
   */
  static async readJsonFile<T>(
    filePath: string,
    schema?: z.ZodSchema<T>
  ): Promise<FileOperationResult<T>> {
    try {
      const readResult = await this.readFile(filePath);
      if (!readResult.success) {
        return readResult as FileOperationResult<T>;
      }

      // Parse JSON content
      const parsedData = JSON.parse(readResult.data!) as T;

      // Validate with schema if provided
      if (schema) {
        const validationResult = schema.safeParse(parsedData);
        if (!validationResult.success) {
          return {
            success: false,
            error: `JSON validation failed: ${validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
            metadata: {
              filePath,
              operation: 'read_json',
              timestamp: new Date()
            }
          };
        }

        return {
          success: true,
          data: validationResult.data,
          metadata: {
            filePath,
            operation: 'read_json',
            timestamp: new Date(),
            size: readResult.metadata?.size
          }
        };
      }

      return {
        success: true,
        data: parsedData,
        metadata: {
          filePath,
          operation: 'read_json',
          timestamp: new Date(),
          size: readResult.metadata?.size
        }
      };

    } catch (error) {
      logger.error({ err: error, filePath }, 'Failed to read JSON file');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath,
          operation: 'read_json',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Write data to JSON file
   */
  static async writeJsonFile<T>(
    filePath: string,
    data: T,
    schema?: z.ZodSchema<T>
  ): Promise<FileOperationResult<void>> {
    try {
      // Validate with schema if provided
      if (schema) {
        const validationResult = schema.safeParse(data);
        if (!validationResult.success) {
          return {
            success: false,
            error: `Data validation failed: ${validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
            metadata: {
              filePath,
              operation: 'write_json',
              timestamp: new Date()
            }
          };
        }
      }

      // Convert to JSON
      const jsonContent = JSON.stringify(data, null, 2);

      // Write file
      return await this.writeFile(filePath, jsonContent);

    } catch (error) {
      logger.error({ err: error, filePath }, 'Failed to write JSON file');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath,
          operation: 'write_json',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Validate file path for security
   */
  private static validateFilePath(filePath: string): { valid: boolean; error?: string } {
    // Check for path traversal attempts
    if (filePath.includes('..') || filePath.includes('~')) {
      return { valid: false, error: 'Path traversal not allowed' };
    }

    // Check for absolute paths outside allowed directories (allow project root and subdirectories)
    if (path.isAbsolute(filePath)) {
      const projectRoot = process.cwd();
      // CRITICAL FIX: Proper Windows path normalization
      const normalizedPath = path.resolve(filePath).replace(/\\/g, '/').toLowerCase();
      const normalizedProject = path.resolve(projectRoot).replace(/\\/g, '/').toLowerCase();
      
      // Allow paths within project root, test directories, or temp directories
      // CRITICAL FIX: Case-insensitive comparison for Windows compatibility
      if (!normalizedPath.startsWith(normalizedProject) &&
          !normalizedPath.startsWith('/test/') &&
          !normalizedPath.startsWith('/tmp/')) {
        return { valid: false, error: `Absolute paths outside project directory not allowed. Path: ${normalizedPath}, Project: ${normalizedProject}` };
      }
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (ext && !this.ALLOWED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: `File extension ${ext} not allowed` };
    }

    return { valid: true };
  }

  /**
   * Ensure directory exists
   */
  static async ensureDirectory(dirPath: string): Promise<FileOperationResult<void>> {
    try {
      await fs.ensureDir(dirPath);

      return {
        success: true,
        metadata: {
          filePath: dirPath,
          operation: 'ensure_directory',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, dirPath }, 'Failed to ensure directory');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: dirPath,
          operation: 'ensure_directory',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Check if file exists
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      return await fs.pathExists(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Delete file safely
   */
  static async deleteFile(filePath: string): Promise<FileOperationResult<void>> {
    try {
      // Validate file path
      const validationResult = this.validateFilePath(filePath);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Invalid file path: ${validationResult.error}`,
          metadata: {
            filePath,
            operation: 'delete',
            timestamp: new Date()
          }
        };
      }

      // Check if file exists
      if (!await fs.pathExists(filePath)) {
        return {
          success: true, // File doesn't exist, consider it deleted
          metadata: {
            filePath,
            operation: 'delete',
            timestamp: new Date()
          }
        };
      }

      // Delete file
      await fs.remove(filePath);

      logger.debug({ filePath }, 'File deleted successfully');

      return {
        success: true,
        metadata: {
          filePath,
          operation: 'delete',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, filePath }, 'Failed to delete file');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath,
          operation: 'delete',
          timestamp: new Date()
        }
      };
    }
  }
}
