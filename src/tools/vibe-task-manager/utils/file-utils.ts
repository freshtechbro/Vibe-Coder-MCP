import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';
import logger from '../../../logger.js';
import { AppError, ValidationError } from '../../../utils/errors.js';
import { validateSecurePath } from './path-security-validator.js';

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
      // Validate file path with security checks
      const validationResult = await this.validateFilePath(filePath);
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
   * Safely write a file with validation and atomic operations
   */
  static async writeFile(filePath: string, content: string): Promise<FileOperationResult<void>> {
    try {
      // Validate file path with security checks for write operation
      const validationResult = await this.validateFilePath(filePath, 'write');
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

      // Use atomic write operation to prevent corruption
      const tempFilePath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;

      try {
        // Write to temporary file first
        await fs.writeFile(tempFilePath, content, 'utf-8');

        // Atomically rename temporary file to target file
        await fs.rename(tempFilePath, filePath);

      } catch (writeError) {
        // Clean up temporary file if it exists
        try {
          await fs.remove(tempFilePath);
        } catch {
          // Ignore cleanup errors
        }
        throw writeError;
      }

      const stats = await fs.stat(filePath);

      logger.debug({ filePath, size: stats.size }, 'File written successfully (atomic)');

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
   * Validate file path for security using centralized security validator
   */
  private static async validateFilePath(filePath: string, operation: 'read' | 'write' = 'read'): Promise<{ valid: boolean; error?: string }> {
    try {
      // For write operations, we need to validate the directory path and allow non-existent files
      if (operation === 'write') {
        const dirPath = path.dirname(filePath);
        const fileName = path.basename(filePath);

        // Validate directory path exists and is accessible
        const dirValidationResult = await validateSecurePath(dirPath);
        if (!dirValidationResult.isValid) {
          // If directory validation fails, try to validate the full path with relaxed mode
          const pathValidator = new (await import('./path-security-validator.js')).PathSecurityValidator({
            strictMode: false // Allow non-existent files for write operations
          });
          const relaxedResult = await pathValidator.validatePath(filePath);

          if (!relaxedResult.isValid) {
            return {
              valid: false,
              error: relaxedResult.error
            };
          }
        }

        // Validate filename doesn't contain dangerous characters
        if (/[<>"|?*\x00-\x1f]/.test(fileName)) {
          return {
            valid: false,
            error: 'Filename contains dangerous characters'
          };
        }
      } else {
        // For read operations, use standard validation
        const validationResult = await validateSecurePath(filePath);
        if (!validationResult.isValid) {
          return {
            valid: false,
            error: validationResult.error
          };
        }
      }

      // Additional file extension check for FileUtils
      const ext = path.extname(filePath).toLowerCase();
      if (ext && !this.ALLOWED_EXTENSIONS.includes(ext)) {
        return {
          valid: false,
          error: `File extension ${ext} not allowed. Allowed extensions: ${this.ALLOWED_EXTENSIONS.join(', ')}`
        };
      }

      return { valid: true };
    } catch (error) {
      logger.error({ err: error, filePath, operation }, 'File path validation failed with exception');
      return {
        valid: false,
        error: `Path validation error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
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
      // Validate file path with security checks for read operation (file must exist to delete)
      const validationResult = await this.validateFilePath(filePath, 'read');
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
