import fs from 'fs/promises';
import path from 'path';

import logger from '../../../../logger.js';
import { AppError } from '../../../../utils/errors.js';

/**
 * Custom error for file operations
 */
export class FileOperationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'FileOperationError';
  }
}

/**
 * Options for atomic file operations
 */
export interface AtomicWriteOptions {
  force?: boolean;
  dryRun?: boolean;
  mode?: number;
  encoding?: BufferEncoding;
  tmpDir?: string;
}

/**
 * Result of a file write operation
 */
export interface WriteResult {
  success: boolean;
  path: string;
  operation: 'create' | 'update' | 'skip';
  error?: Error;
}

// Aliases for backward compatibility
export type FileWriteOptions = AtomicWriteOptions;
export type FileWriteResult = WriteResult;

/**
 * Options for atomic file operations
 */
export interface AtomicWriteOptions {
  force?: boolean;
  dryRun?: boolean;
  mode?: number;
  encoding?: BufferEncoding;
  tmpDir?: string;
}

/**
 * Result of a file write operation
 */
export interface WriteResult {
  success: boolean;
  path: string;
  operation: 'create' | 'update' | 'skip';
  error?: Error;
}

/**
 * Tracks files written in the current batch for rollback
 */
class RollbackManager {
  private static instance: RollbackManager;
  private writtenFiles: Set<string>;
  private createdDirs: Set<string>;

  private constructor() {
    this.writtenFiles = new Set();
    this.createdDirs = new Set();
  }

  public static getInstance(): RollbackManager {
    if (!RollbackManager.instance) {
      RollbackManager.instance = new RollbackManager();
    }
    return RollbackManager.instance;
  }

  public trackFile(filePath: string): void {
    this.writtenFiles.add(filePath);
  }

  public trackDirectory(dirPath: string): void {
    this.createdDirs.add(dirPath);
  }

  public async rollback(): Promise<void> {
    logger.warn('Rolling back file operations...');

    // Delete files in reverse order
    const files = Array.from(this.writtenFiles).reverse();
    for (const file of files) {
      try {
        await fs.unlink(file);
        logger.debug(`Rolled back file: ${file}`);
      } catch (error) {
        logger.error({ err: error }, `Failed to rollback file: ${file}`);
      }
    }

    // Delete directories in reverse order (deepest first)
    const dirs = Array.from(this.createdDirs).sort(
      (a, b) => b.length - a.length
    ); // Sort by path length descending

    for (const dir of dirs) {
      try {
        await fs.rmdir(dir);
        logger.debug(`Rolled back directory: ${dir}`);
      } catch (error) {
        logger.error({ err: error }, `Failed to rollback directory: ${dir}`);
      }
    }

    // Clear tracking sets
    this.writtenFiles.clear();
    this.createdDirs.clear();
  }

  public clear(): void {
    this.writtenFiles.clear();
    this.createdDirs.clear();
  }
}

/**
 * Writes a file atomically with rollback support
 */
export async function writeFileAtomic(
  filePath: string,
  content: string | Buffer,
  options: AtomicWriteOptions = {}
): Promise<WriteResult> {
  const {
    force = false,
    dryRun = false,
    mode = 0o666,
    encoding = 'utf8',
    tmpDir = path.dirname(filePath),
  } = options;

  const rollbackManager = RollbackManager.getInstance();
  const operation: WriteResult = {
    success: false,
    path: filePath,
    operation: 'create',
  };

  try {
    // Check if file exists
    try {
      await fs.access(filePath);
      if (!force) {
        logger.warn(`File exists and force is false: ${filePath}`);
        return {
          success: true,
          path: filePath,
          operation: 'skip',
        };
      }
      operation.operation = 'update';
    } catch {
      // File doesn't exist, will create
      operation.operation = 'create';
    }

    if (dryRun) {
      logger.info(`DRY RUN: Would ${operation.operation} file: ${filePath}`);
      return {
        success: true,
        path: filePath,
        operation: operation.operation,
      };
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    rollbackManager.trackDirectory(dir);

    // Create temporary file
    const tmpFile = path.join(tmpDir, `${path.basename(filePath)}.tmp`);
    await fs.writeFile(tmpFile, content, { encoding, mode });
    rollbackManager.trackFile(tmpFile);

    // Rename temporary file to target (atomic operation)
    await fs.rename(tmpFile, filePath);
    rollbackManager.trackFile(filePath);

    operation.success = true;
    return operation;
  } catch (error) {
    operation.error = error instanceof Error ? error : new Error(String(error));
    throw new FileOperationError(`Failed to write file: ${filePath}`, {
      error: operation.error.message,
      operation: operation.operation,
    });
  }
}

/**
 * Writes multiple files atomically with rollback on failure
 */
export async function writeFilesAtomic(
  files: { path: string; content: string | Buffer }[],
  options: AtomicWriteOptions = {}
): Promise<WriteResult[]> {
  const rollbackManager = RollbackManager.getInstance();
  const results: WriteResult[] = [];

  try {
    // Clear any previous tracking
    rollbackManager.clear();

    // Write all files
    for (const file of files) {
      const result = await writeFileAtomic(file.path, file.content, options);
      results.push(result);
    }

    return results;
  } catch (error) {
    // If any file fails, rollback all operations
    await rollbackManager.rollback();
    throw error;
  } finally {
    // Clear tracking regardless of outcome
    rollbackManager.clear();
  }
}
