/**
 * File system service for Repotools Lightweight Server
 * 
 * Provides secure file system access with validation, sandboxing,
 * and repository management capabilities.
 */

import { promises as fs, existsSync, createReadStream, createWriteStream } from 'fs';
import { join, resolve, relative, extname, basename, dirname } from 'path';
import { pipeline } from 'stream/promises';
import * as fsExtra from 'fs-extra';
import { glob } from 'glob';
import * as mime from 'mime-types';
import archiver from 'archiver';
import unzipper from 'unzipper';
import chokidar from 'chokidar';

import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';
import { ValidationError, NotFoundError, ForbiddenError } from '@/middleware/errorHandler.js';

interface FileInfo {
  path: string;
  name: string;
  size: number;
  type: 'file' | 'directory';
  extension?: string;
  mimeType?: string;
  lastModified: Date;
  isReadable: boolean;
  isWritable: boolean;
}

interface DirectoryListing {
  path: string;
  files: FileInfo[];
  totalSize: number;
  fileCount: number;
  directoryCount: number;
}

interface FileContent {
  path: string;
  content: string | Buffer;
  encoding: 'utf8' | 'binary';
  size: number;
  mimeType?: string;
}

interface SearchOptions {
  pattern: string;
  extensions?: string[];
  maxResults?: number;
  includeContent?: boolean;
  caseSensitive?: boolean;
}

interface SearchResult {
  path: string;
  matches: Array<{
    line: number;
    content: string;
    column?: number;
  }>;
}

class FileSystemService {
  private workspaceRoot: string;
  private watchers: Map<string, chokidar.FSWatcher> = new Map();

  constructor() {
    this.workspaceRoot = resolve(config.WORKSPACE_ROOT);
  }

  public async initializeWorkspace(): Promise<void> {
    logger.info('Initializing file system workspace...', {
      workspaceRoot: this.workspaceRoot,
    });

    try {
      // Ensure workspace directory exists
      await fsExtra.ensureDir(this.workspaceRoot);

      // Create subdirectories
      const subdirs = ['repositories', 'uploads', 'outputs', 'cache', 'temp'];
      for (const subdir of subdirs) {
        await fsExtra.ensureDir(join(this.workspaceRoot, subdir));
      }

      logger.info('File system workspace initialized successfully');
    } catch (error) {
      logger.errorWithContext(error as Error, 'Failed to initialize workspace');
      throw error;
    }
  }

  private validatePath(inputPath: string): string {
    // Resolve and normalize the path
    const resolvedPath = resolve(this.workspaceRoot, inputPath);
    
    // Ensure path is within workspace
    const relativePath = relative(this.workspaceRoot, resolvedPath);
    if (relativePath.startsWith('..') || resolve(relativePath) === relativePath) {
      throw new ForbiddenError(`Access denied: Path outside workspace`);
    }

    return resolvedPath;
  }

  private validateFileExtension(filePath: string): void {
    const ext = extname(filePath).toLowerCase();
    if (ext && !config.ALLOWED_EXTENSIONS.includes(ext)) {
      throw new ValidationError(`File extension not allowed: ${ext}`);
    }
  }

  private async validateFileSize(filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > config.MAX_FILE_SIZE) {
        throw new ValidationError(`File too large: ${stats.size} bytes (max: ${config.MAX_FILE_SIZE})`);
      }
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  // File operations

  public async readFile(filePath: string, encoding: 'utf8' | 'binary' = 'utf8'): Promise<FileContent> {
    const validatedPath = this.validatePath(filePath);
    this.validateFileExtension(validatedPath);

    if (!existsSync(validatedPath)) {
      throw new NotFoundError(`File not found: ${filePath}`);
    }

    await this.validateFileSize(validatedPath);

    try {
      const stats = await fs.stat(validatedPath);
      if (!stats.isFile()) {
        throw new ValidationError(`Path is not a file: ${filePath}`);
      }

      const content = await fs.readFile(validatedPath, encoding);
      const mimeType = mime.lookup(validatedPath) || undefined;

      logger.fileSystem('read', filePath, {
        size: stats.size,
        encoding,
        mimeType,
      });

      return {
        path: filePath,
        content,
        encoding,
        size: stats.size,
        mimeType,
      };
    } catch (error) {
      logger.errorWithContext(error as Error, 'File read failed', { filePath });
      throw error;
    }
  }

  public async writeFile(
    filePath: string, 
    content: string | Buffer, 
    options: { encoding?: 'utf8' | 'binary'; createDirs?: boolean } = {}
  ): Promise<void> {
    const validatedPath = this.validatePath(filePath);
    this.validateFileExtension(validatedPath);

    const { encoding = 'utf8', createDirs = true } = options;

    try {
      // Create parent directories if needed
      if (createDirs) {
        await fsExtra.ensureDir(dirname(validatedPath));
      }

      // Check file size
      const contentSize = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, encoding);
      if (contentSize > config.MAX_FILE_SIZE) {
        throw new ValidationError(`Content too large: ${contentSize} bytes (max: ${config.MAX_FILE_SIZE})`);
      }

      await fs.writeFile(validatedPath, content, encoding);

      logger.fileSystem('write', filePath, {
        size: contentSize,
        encoding,
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'File write failed', { filePath });
      throw error;
    }
  }

  public async deleteFile(filePath: string): Promise<void> {
    const validatedPath = this.validatePath(filePath);

    if (!existsSync(validatedPath)) {
      throw new NotFoundError(`File not found: ${filePath}`);
    }

    try {
      const stats = await fs.stat(validatedPath);
      if (stats.isDirectory()) {
        await fsExtra.remove(validatedPath);
      } else {
        await fs.unlink(validatedPath);
      }

      logger.fileSystem('delete', filePath, {
        type: stats.isDirectory() ? 'directory' : 'file',
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'File delete failed', { filePath });
      throw error;
    }
  }

  public async copyFile(sourcePath: string, destPath: string): Promise<void> {
    const validatedSource = this.validatePath(sourcePath);
    const validatedDest = this.validatePath(destPath);

    this.validateFileExtension(validatedSource);
    this.validateFileExtension(validatedDest);

    if (!existsSync(validatedSource)) {
      throw new NotFoundError(`Source file not found: ${sourcePath}`);
    }

    await this.validateFileSize(validatedSource);

    try {
      await fsExtra.copy(validatedSource, validatedDest);

      logger.fileSystem('copy', sourcePath, {
        destination: destPath,
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'File copy failed', {
        sourcePath,
        destPath,
      });
      throw error;
    }
  }

  public async moveFile(sourcePath: string, destPath: string): Promise<void> {
    const validatedSource = this.validatePath(sourcePath);
    const validatedDest = this.validatePath(destPath);

    this.validateFileExtension(validatedSource);
    this.validateFileExtension(validatedDest);

    if (!existsSync(validatedSource)) {
      throw new NotFoundError(`Source file not found: ${sourcePath}`);
    }

    try {
      await fsExtra.move(validatedSource, validatedDest);

      logger.fileSystem('move', sourcePath, {
        destination: destPath,
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'File move failed', {
        sourcePath,
        destPath,
      });
      throw error;
    }
  }

  // Directory operations

  public async listDirectory(dirPath: string): Promise<DirectoryListing> {
    const validatedPath = this.validatePath(dirPath);

    if (!existsSync(validatedPath)) {
      throw new NotFoundError(`Directory not found: ${dirPath}`);
    }

    try {
      const stats = await fs.stat(validatedPath);
      if (!stats.isDirectory()) {
        throw new ValidationError(`Path is not a directory: ${dirPath}`);
      }

      const entries = await fs.readdir(validatedPath);
      const files: FileInfo[] = [];
      let totalSize = 0;
      let fileCount = 0;
      let directoryCount = 0;

      for (const entry of entries) {
        const entryPath = join(validatedPath, entry);
        const entryStats = await fs.stat(entryPath);
        const isDirectory = entryStats.isDirectory();

        if (isDirectory) {
          directoryCount++;
        } else {
          fileCount++;
          totalSize += entryStats.size;
        }

        const fileInfo: FileInfo = {
          path: join(dirPath, entry),
          name: entry,
          size: entryStats.size,
          type: isDirectory ? 'directory' : 'file',
          lastModified: entryStats.mtime,
          isReadable: true, // Simplified for now
          isWritable: true, // Simplified for now
        };

        if (!isDirectory) {
          const ext = extname(entry);
          fileInfo.extension = ext;
          fileInfo.mimeType = mime.lookup(entry) || undefined;
        }

        files.push(fileInfo);
      }

      logger.fileSystem('list', dirPath, {
        fileCount,
        directoryCount,
        totalSize,
      });

      return {
        path: dirPath,
        files,
        totalSize,
        fileCount,
        directoryCount,
      };
    } catch (error) {
      logger.errorWithContext(error as Error, 'Directory listing failed', { dirPath });
      throw error;
    }
  }

  public async createDirectory(dirPath: string): Promise<void> {
    const validatedPath = this.validatePath(dirPath);

    try {
      await fsExtra.ensureDir(validatedPath);

      logger.fileSystem('createDir', dirPath);
    } catch (error) {
      logger.errorWithContext(error as Error, 'Directory creation failed', { dirPath });
      throw error;
    }
  }

  // Search operations

  public async searchFiles(options: SearchOptions): Promise<SearchResult[]> {
    const {
      pattern,
      extensions = config.ALLOWED_EXTENSIONS,
      maxResults = 100,
      includeContent = false,
      caseSensitive = false,
    } = options;

    try {
      // Build glob pattern
      const extPattern = extensions.length > 0 ? `{${extensions.join(',')}}` : '*';
      const globPattern = join(this.workspaceRoot, '**', `*${extPattern}`);

      const files = await glob(globPattern, {
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
        nodir: true,
      });

      const results: SearchResult[] = [];
      const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');

      for (const file of files.slice(0, maxResults)) {
        const relativePath = relative(this.workspaceRoot, file);

        if (includeContent) {
          try {
            const content = await fs.readFile(file, 'utf8');
            const lines = content.split('\n');
            const matches: SearchResult['matches'] = [];

            lines.forEach((line, index) => {
              const match = line.match(regex);
              if (match) {
                matches.push({
                  line: index + 1,
                  content: line.trim(),
                  column: line.indexOf(match[0]) + 1,
                });
              }
            });

            if (matches.length > 0) {
              results.push({
                path: relativePath,
                matches,
              });
            }
          } catch (error) {
            // Skip files that can't be read as text
            continue;
          }
        } else {
          // Just check filename
          if (regex.test(basename(file))) {
            results.push({
              path: relativePath,
              matches: [{
                line: 0,
                content: basename(file),
              }],
            });
          }
        }
      }

      logger.fileSystem('search', pattern, {
        resultCount: results.length,
        includeContent,
        extensions: extensions.length,
      });

      return results;
    } catch (error) {
      logger.errorWithContext(error as Error, 'File search failed', { pattern });
      throw error;
    }
  }

  // Archive operations

  public async createArchive(sourcePath: string, archivePath: string): Promise<void> {
    const validatedSource = this.validatePath(sourcePath);
    const validatedArchive = this.validatePath(archivePath);

    if (!existsSync(validatedSource)) {
      throw new NotFoundError(`Source path not found: ${sourcePath}`);
    }

    try {
      const output = createWriteStream(validatedArchive);
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.pipe(output);

      const stats = await fs.stat(validatedSource);
      if (stats.isDirectory()) {
        archive.directory(validatedSource, false);
      } else {
        archive.file(validatedSource, { name: basename(validatedSource) });
      }

      await archive.finalize();

      logger.fileSystem('archive', sourcePath, {
        archivePath,
        type: stats.isDirectory() ? 'directory' : 'file',
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Archive creation failed', {
        sourcePath,
        archivePath,
      });
      throw error;
    }
  }

  public async extractArchive(archivePath: string, destPath: string): Promise<void> {
    const validatedArchive = this.validatePath(archivePath);
    const validatedDest = this.validatePath(destPath);

    if (!existsSync(validatedArchive)) {
      throw new NotFoundError(`Archive not found: ${archivePath}`);
    }

    await this.validateFileSize(validatedArchive);

    try {
      await fsExtra.ensureDir(validatedDest);

      await pipeline(
        createReadStream(validatedArchive),
        unzipper.Extract({ path: validatedDest })
      );

      logger.fileSystem('extract', archivePath, {
        destPath,
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Archive extraction failed', {
        archivePath,
        destPath,
      });
      throw error;
    }
  }

  // File watching

  public watchDirectory(dirPath: string, callback: (event: string, path: string) => void): string {
    const validatedPath = this.validatePath(dirPath);
    const watcherId = `watch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const watcher = chokidar.watch(validatedPath, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
    });

    watcher
      .on('add', path => callback('add', relative(this.workspaceRoot, path)))
      .on('change', path => callback('change', relative(this.workspaceRoot, path)))
      .on('unlink', path => callback('unlink', relative(this.workspaceRoot, path)))
      .on('addDir', path => callback('addDir', relative(this.workspaceRoot, path)))
      .on('unlinkDir', path => callback('unlinkDir', relative(this.workspaceRoot, path)));

    this.watchers.set(watcherId, watcher);

    logger.fileSystem('watch', dirPath, { watcherId });

    return watcherId;
  }

  public stopWatching(watcherId: string): boolean {
    const watcher = this.watchers.get(watcherId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(watcherId);
      logger.fileSystem('unwatch', watcherId);
      return true;
    }
    return false;
  }

  // Utility methods

  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  public async getFileInfo(filePath: string): Promise<FileInfo> {
    const validatedPath = this.validatePath(filePath);

    if (!existsSync(validatedPath)) {
      throw new NotFoundError(`File not found: ${filePath}`);
    }

    try {
      const stats = await fs.stat(validatedPath);
      const isDirectory = stats.isDirectory();

      const fileInfo: FileInfo = {
        path: filePath,
        name: basename(filePath),
        size: stats.size,
        type: isDirectory ? 'directory' : 'file',
        lastModified: stats.mtime,
        isReadable: true, // Simplified
        isWritable: true, // Simplified
      };

      if (!isDirectory) {
        const ext = extname(filePath);
        fileInfo.extension = ext;
        fileInfo.mimeType = mime.lookup(filePath) || undefined;
      }

      return fileInfo;
    } catch (error) {
      logger.errorWithContext(error as Error, 'Get file info failed', { filePath });
      throw error;
    }
  }

  public async cleanup(): Promise<void> {
    // Close all watchers
    for (const [_watcherId, watcher] of this.watchers.entries()) {
      watcher.close();
    }
    this.watchers.clear();

    // Clean up temp directory
    const tempDir = join(this.workspaceRoot, 'temp');
    if (existsSync(tempDir)) {
      await fsExtra.emptyDir(tempDir);
    }

    logger.info('File system service cleanup complete');
  }
}

export { FileSystemService, type FileInfo, type DirectoryListing, type FileContent, type SearchOptions, type SearchResult };
