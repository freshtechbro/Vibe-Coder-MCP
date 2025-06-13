/**
 * File system API routes for Repotools Lightweight Server
 * 
 * Provides REST endpoints for file operations, directory listing,
 * search, and archive management.
 */

import { Router, Request, Response } from 'express';
import { createReadStream } from 'fs';
import Joi from 'joi';
import multer from 'multer';
import { join } from 'path';
import { asyncHandler } from '@/middleware/errorHandler.js';
import { uploadRateLimiter } from '@/middleware/rateLimiter.js';
import { logger } from '@/utils/logger.js';
import { FileSystemService } from '@/services/fileSystem.js';
import { config } from '@/config/index.js';

// Validation schemas
const filePathSchema = Joi.object({
  path: Joi.string().required().max(1000),
});

const writeFileSchema = Joi.object({
  path: Joi.string().required().max(1000),
  content: Joi.string().required(),
  encoding: Joi.string().valid('utf8', 'binary').default('utf8'),
  createDirs: Joi.boolean().default(true),
});

const copyMoveSchema = Joi.object({
  sourcePath: Joi.string().required().max(1000),
  destPath: Joi.string().required().max(1000),
});

const searchSchema = Joi.object({
  pattern: Joi.string().required().min(1).max(200),
  extensions: Joi.array().items(Joi.string()).optional(),
  maxResults: Joi.number().integer().min(1).max(1000).default(100),
  includeContent: Joi.boolean().default(false),
  caseSensitive: Joi.boolean().default(false),
});

const archiveSchema = Joi.object({
  sourcePath: Joi.string().required().max(1000),
  archivePath: Joi.string().required().max(1000),
});

// Configure multer for file uploads
const upload = multer({
  dest: join(config.WORKSPACE_ROOT, 'uploads'),
  limits: {
    fileSize: config.MAX_FILE_SIZE,
    files: 10, // Max 10 files per upload
  },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (ext && config.ALLOWED_EXTENSIONS.includes(`.${ext}`)) {
      cb(null, true);
    } else {
      cb(new Error(`File extension not allowed: .${ext}`));
    }
  },
});

/**
 * Create file system routes
 */
export function createFileRoutes(fileSystemService: FileSystemService): Router {
  const router = Router();

  /**
   * GET /api/v1/files/info
   * Get file or directory information
   */
  router.get('/info', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = filePathSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { path } = value;

    try {
      const fileInfo = await fileSystemService.getFileInfo(path);

      res.json({
        success: true,
        data: { fileInfo },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Get file info failed', { path });
      throw error;
    }
  }));

  /**
   * GET /api/v1/files/read
   * Read file content
   */
  router.get('/read', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = Joi.object({
      path: Joi.string().required().max(1000),
      encoding: Joi.string().valid('utf8', 'binary').default('utf8'),
    }).validate(req.query);

    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { path, encoding } = value;

    try {
      const fileContent = await fileSystemService.readFile(path, encoding);

      res.json({
        success: true,
        data: { fileContent },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'File read failed', { path });
      throw error;
    }
  }));

  /**
   * POST /api/v1/files/write
   * Write file content
   */
  router.post('/write', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = writeFileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { path, content, encoding, createDirs } = value;

    try {
      await fileSystemService.writeFile(path, content, { encoding, createDirs });

      logger.info(`File written: ${path}`, {
        size: Buffer.byteLength(content, encoding),
        encoding,
      });

      res.json({
        success: true,
        message: 'File written successfully',
        data: { path },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'File write failed', { path });
      throw error;
    }
  }));

  /**
   * DELETE /api/v1/files/delete
   * Delete file or directory
   */
  router.delete('/delete', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = filePathSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { path } = value;

    try {
      await fileSystemService.deleteFile(path);

      logger.info(`File deleted: ${path}`);

      res.json({
        success: true,
        message: 'File deleted successfully',
        data: { path },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'File delete failed', { path });
      throw error;
    }
  }));

  /**
   * POST /api/v1/files/copy
   * Copy file or directory
   */
  router.post('/copy', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = copyMoveSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { sourcePath, destPath } = value;

    try {
      await fileSystemService.copyFile(sourcePath, destPath);

      logger.info(`File copied: ${sourcePath} -> ${destPath}`);

      res.json({
        success: true,
        message: 'File copied successfully',
        data: { sourcePath, destPath },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'File copy failed', {
        sourcePath,
        destPath,
      });
      throw error;
    }
  }));

  /**
   * POST /api/v1/files/move
   * Move file or directory
   */
  router.post('/move', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = copyMoveSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { sourcePath, destPath } = value;

    try {
      await fileSystemService.moveFile(sourcePath, destPath);

      logger.info(`File moved: ${sourcePath} -> ${destPath}`);

      res.json({
        success: true,
        message: 'File moved successfully',
        data: { sourcePath, destPath },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'File move failed', {
        sourcePath,
        destPath,
      });
      throw error;
    }
  }));

  /**
   * GET /api/v1/files/list
   * List directory contents
   */
  router.get('/list', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = filePathSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { path } = value;

    try {
      const directoryListing = await fileSystemService.listDirectory(path);

      res.json({
        success: true,
        data: { directoryListing },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Directory listing failed', { path });
      throw error;
    }
  }));

  /**
   * POST /api/v1/files/mkdir
   * Create directory
   */
  router.post('/mkdir', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = filePathSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { path } = value;

    try {
      await fileSystemService.createDirectory(path);

      logger.info(`Directory created: ${path}`);

      res.json({
        success: true,
        message: 'Directory created successfully',
        data: { path },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Directory creation failed', { path });
      throw error;
    }
  }));

  /**
   * POST /api/v1/files/search
   * Search files by pattern
   */
  router.post('/search', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = searchSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    try {
      const searchResults = await fileSystemService.searchFiles(value);

      logger.info(`File search completed: ${searchResults.length} results`, {
        pattern: value.pattern,
        includeContent: value.includeContent,
      });

      res.json({
        success: true,
        data: {
          results: searchResults,
          query: value,
          resultCount: searchResults.length,
        },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'File search failed', {
        pattern: value.pattern,
      });
      throw error;
    }
  }));

  /**
   * POST /api/v1/files/upload
   * Upload files
   */
  router.post('/upload', uploadRateLimiter, upload.array('files'), asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];
    const targetDir = req.body.targetDir || 'uploads';

    if (!files || files.length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'No files uploaded',
      });
    }

    try {
      const uploadedFiles = [];

      for (const file of files) {
        const targetPath = join(targetDir, file.originalname);
        await fileSystemService.moveFile(file.path, targetPath);

        uploadedFiles.push({
          originalName: file.originalname,
          path: targetPath,
          size: file.size,
          mimeType: file.mimetype,
        });
      }

      logger.info(`Files uploaded: ${uploadedFiles.length} files`, {
        targetDir,
        totalSize: uploadedFiles.reduce((sum, file) => sum + file.size, 0),
      });

      res.json({
        success: true,
        message: `${uploadedFiles.length} files uploaded successfully`,
        data: { uploadedFiles },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'File upload failed');
      throw error;
    }
  }));

  /**
   * GET /api/v1/files/download
   * Download file
   */
  router.get('/download', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = filePathSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { path } = value;

    try {
      const fileInfo = await fileSystemService.getFileInfo(path);
      
      if (fileInfo.type === 'directory') {
        return res.status(400).json({
          error: 'Invalid Request',
          message: 'Cannot download directory directly. Use archive endpoint.',
        });
      }

      const fullPath = join(fileSystemService.getWorkspaceRoot(), path);
      const stream = createReadStream(fullPath);

      res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.name}"`);
      res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', fileInfo.size);

      stream.pipe(res);

      logger.info(`File downloaded: ${path}`, {
        size: fileInfo.size,
        mimeType: fileInfo.mimeType,
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'File download failed', { path });
      throw error;
    }
  }));

  /**
   * POST /api/v1/files/archive
   * Create archive from directory or files
   */
  router.post('/archive', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = archiveSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { sourcePath, archivePath } = value;

    try {
      await fileSystemService.createArchive(sourcePath, archivePath);

      logger.info(`Archive created: ${sourcePath} -> ${archivePath}`);

      res.json({
        success: true,
        message: 'Archive created successfully',
        data: { sourcePath, archivePath },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Archive creation failed', {
        sourcePath,
        archivePath,
      });
      throw error;
    }
  }));

  /**
   * POST /api/v1/files/extract
   * Extract archive
   */
  router.post('/extract', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = archiveSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { sourcePath: archivePath, destPath } = value;

    try {
      await fileSystemService.extractArchive(archivePath, destPath);

      logger.info(`Archive extracted: ${archivePath} -> ${destPath}`);

      res.json({
        success: true,
        message: 'Archive extracted successfully',
        data: { archivePath, destPath },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Archive extraction failed', {
        archivePath,
        destPath,
      });
      throw error;
    }
  }));

  /**
   * GET /api/v1/files/workspace
   * Get workspace information
   */
  router.get('/workspace', asyncHandler(async (_req: Request, res: Response) => {
    try {
      const workspaceRoot = fileSystemService.getWorkspaceRoot();
      const workspaceInfo = await fileSystemService.listDirectory('.');

      res.json({
        success: true,
        data: {
          workspaceRoot,
          workspaceInfo,
          allowedExtensions: config.ALLOWED_EXTENSIONS,
          maxFileSize: config.MAX_FILE_SIZE,
        },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Workspace info retrieval failed');
      throw error;
    }
  }));

  return router;
}
