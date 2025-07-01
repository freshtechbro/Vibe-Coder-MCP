/**
 * Incremental Processor for the Code-Map Generator tool.
 * This file contains the IncrementalProcessor class for managing incremental processing.
 */

import fs from 'fs/promises';
import path from 'path';
import logger from '../../../logger.js';
import { FileChangeDetector } from './fileChangeDetector.js';
import { FileContentManager } from './fileContentManager.js';
import { CodeMapGeneratorConfig, IncrementalProcessingConfig } from '../types.js';
import { getCacheDirectory } from '../directoryUtils.js';

/**
 * Interface for incremental processing result.
 */
export interface IncrementalProcessingResult {
  /**
   * The files that have changed and need to be processed.
   */
  changedFiles: string[];

  /**
   * The files that have not changed and can be skipped.
   */
  unchangedFiles: string[];

  /**
   * The total number of files.
   */
  totalFiles: number;

  /**
   * The percentage of files that have changed.
   */
  changePercentage: number;
}

/**
 * Manages incremental processing of files.
 */
export class IncrementalProcessor {
  private fileChangeDetector: FileChangeDetector;
  private config: Required<IncrementalProcessingConfig>;
  private baseDir: string;
  private previousFilesListPath: string;

  /**
   * Default options for incremental processing.
   */
  private static readonly DEFAULT_CONFIG: Required<IncrementalProcessingConfig> = {
    useFileHashes: true,
    useFileMetadata: true,
    maxCachedHashes: 10000,
    maxHashAge: 24 * 60 * 60 * 1000, // 24 hours
    previousFilesListPath: '',
    saveProcessedFilesList: true
  };

  /**
   * Creates a new IncrementalProcessor instance.
   * @param fileContentManager The file content manager to use
   * @param config The code map generator configuration
   */
  constructor(fileContentManager: FileContentManager, config: CodeMapGeneratorConfig) {
    // Apply default config
    this.config = {
      ...IncrementalProcessor.DEFAULT_CONFIG,
      ...config.processing?.incrementalConfig
    };

    // Create file change detector
    this.fileChangeDetector = new FileChangeDetector(fileContentManager, {
      useFileHashes: this.config.useFileHashes,
      useFileMetadata: this.config.useFileMetadata,
      maxCachedHashes: this.config.maxCachedHashes,
      maxHashAge: this.config.maxHashAge
    });

    // Set base directory
    this.baseDir = config.allowedMappingDirectory;

    // Set previous files list path
    if (this.config.previousFilesListPath) {
      this.previousFilesListPath = this.config.previousFilesListPath;
    } else {
      const cacheDir = getCacheDirectory(config);
      this.previousFilesListPath = path.join(cacheDir, 'processed-files.json');
    }

    logger.debug(`IncrementalProcessor created with config: ${JSON.stringify(this.config)}`);
  }

  /**
   * Processes files incrementally.
   * @param filePaths The file paths to process
   * @returns A promise that resolves to an incremental processing result
   */
  public async processIncrementally(filePaths: string[]): Promise<IncrementalProcessingResult> {
    // Load previously processed files
    const previousFiles = await this.loadPreviousFiles();
    
    // If there are no previous files, process all files
    if (previousFiles.length === 0) {
      logger.info('No previously processed files found, processing all files');
      
      // Save the current files for the next run
      if (this.config.saveProcessedFilesList) {
        await this.savePreviousFiles(filePaths);
      }
      
      return {
        changedFiles: filePaths,
        unchangedFiles: [],
        totalFiles: filePaths.length,
        changePercentage: 100
      };
    }
    
    // Set the previously processed files in the file change detector
    this.fileChangeDetector.setProcessedFiles(previousFiles);
    
    // Check which files have changed
    const changedFiles: string[] = [];
    const unchangedFiles: string[] = [];
    
    for (const filePath of filePaths) {
      // Check if the file was processed in the previous run
      const wasProcessed = this.fileChangeDetector.wasFileProcessed(filePath);
      
      if (!wasProcessed) {
        // If the file wasn't processed before, it's a new file
        changedFiles.push(filePath);
        continue;
      }
      
      // Check if the file has changed
      const result = await this.fileChangeDetector.detectChange(filePath, this.baseDir);
      
      if (result.changed) {
        changedFiles.push(filePath);
      } else {
        unchangedFiles.push(filePath);
      }
    }
    
    // Calculate change percentage
    const totalFiles = filePaths.length;
    const changePercentage = totalFiles > 0 ? (changedFiles.length / totalFiles) * 100 : 0;
    
    logger.info(`Incremental processing: ${changedFiles.length} changed files, ${unchangedFiles.length} unchanged files (${changePercentage.toFixed(2)}% changed)`);
    
    // Save the current files for the next run
    if (this.config.saveProcessedFilesList) {
      await this.savePreviousFiles(filePaths);
    }
    
    return {
      changedFiles,
      unchangedFiles,
      totalFiles,
      changePercentage
    };
  }

  /**
   * Loads the list of previously processed files.
   * @returns A promise that resolves to an array of file paths
   */
  private async loadPreviousFiles(): Promise<string[]> {
    try {
      // Check if the file exists
      try {
        await fs.access(this.previousFilesListPath);
      } catch {
        // File doesn't exist
        return [];
      }
      
      // Read the file
      const content = await fs.readFile(this.previousFilesListPath, 'utf-8');
      
      // Parse the JSON
      const data = JSON.parse(content);
      
      if (Array.isArray(data)) {
        logger.debug(`Loaded ${data.length} previously processed files`);
        return data;
      }
      
      logger.warn('Invalid format for previously processed files list');
      return [];
    } catch (error) {
      logger.error({ err: error }, 'Error loading previously processed files');
      return [];
    }
  }

  /**
   * Saves the list of processed files for the next run.
   * @param filePaths The file paths to save
   * @returns A promise that resolves when the file is saved
   */
  private async savePreviousFiles(filePaths: string[]): Promise<void> {
    try {
      // Create the directory if it doesn't exist
      const dir = path.dirname(this.previousFilesListPath);
      await fs.mkdir(dir, { recursive: true });
      
      // Write the file
      await fs.writeFile(this.previousFilesListPath, JSON.stringify(filePaths), 'utf-8');
      
      logger.debug(`Saved ${filePaths.length} processed files for the next run`);
    } catch (error) {
      logger.error({ err: error }, 'Error saving processed files list');
    }
  }

  /**
   * Gets the file change detector.
   * @returns The file change detector
   */
  public getFileChangeDetector(): FileChangeDetector {
    return this.fileChangeDetector;
  }

  /**
   * Clears the file change detector cache.
   */
  public clearCache(): void {
    this.fileChangeDetector.clearCache();
  }
}
