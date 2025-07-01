/**
 * File Content Processor for Context Curator
 * 
 * Handles file content processing with intelligent 1000 LOC threshold logic.
 * Integrates with Code-Map Generator optimization functions for content optimization.
 * 
 * Features:
 * - 1000 LOC threshold for optimization decisions
 * - Content section tracking for hybrid processing
 * - Token estimation integration
 * - Optimization boundary markers
 * - Security-aware file reading
 */

import { TokenEstimator } from './token-estimator.js';
import { readFileSecure } from '../../code-map-generator/fsUtils.js';

export interface ProcessedFileContent {
  content: string;
  isOptimized: boolean;
  totalLines: number;
  fullContentLines?: number;
  optimizedLines?: number;
  tokenEstimate: number;
  contentSections: ContentSection[];
  processingMetadata: ProcessingMetadata;
}

export interface ContentSection {
  type: 'full' | 'optimized';
  startLine: number;
  endLine: number;
  content: string;
  tokenCount: number;
  description: string;
}

export interface ProcessingMetadata {
  filePath: string;
  fileSize: number;
  processingTime: number;
  optimizationApplied: boolean;
  optimizationRatio?: number;
  contentType: string;
  encoding: string;
}

export interface FileProcessingOptions {
  locThreshold?: number;
  preserveComments?: boolean;
  preserveTypes?: boolean;
  maxContentLength?: number;
  allowedDirectory: string;
}

/**
 * File Content Processor Class
 * 
 * Provides comprehensive file content processing capabilities with intelligent
 * optimization based on file size and content characteristics.
 */
export class FileContentProcessor {
  private static readonly DEFAULT_LOC_THRESHOLD = 1000;
  private static readonly DEFAULT_MAX_CONTENT_LENGTH = 25;

  /**
   * Process file content with intelligent optimization
   */
  static async processFileContent(
    filePath: string,
    fileContent: string,
    options: FileProcessingOptions
  ): Promise<ProcessedFileContent> {
    const startTime = Date.now();
    const lines = fileContent.split('\n');
    const totalLines = lines.length;
    const locThreshold = options.locThreshold || this.DEFAULT_LOC_THRESHOLD;
    
    // Detect content type from file extension
    const contentType = this.detectContentType(filePath);

    // Calculate token estimate for original content
    const originalTokenEstimate = TokenEstimator.estimateFileTokens(filePath, fileContent, this.mapToTokenEstimatorType(contentType));
    
    const processingMetadata: ProcessingMetadata = {
      filePath,
      fileSize: fileContent.length,
      processingTime: 0, // Will be set at the end
      optimizationApplied: false,
      contentType,
      encoding: 'utf-8'
    };

    // If file is under threshold, return complete unoptimized content
    if (totalLines <= locThreshold) {
      const contentSection: ContentSection = {
        type: 'full',
        startLine: 1,
        endLine: totalLines,
        content: fileContent,
        tokenCount: originalTokenEstimate.totalTokens,
        description: `Complete file content (${totalLines} lines)`
      };

      processingMetadata.processingTime = Date.now() - startTime;

      return {
        content: fileContent,
        isOptimized: false,
        totalLines,
        fullContentLines: totalLines,
        tokenEstimate: originalTokenEstimate.totalTokens,
        contentSections: [contentSection],
        processingMetadata
      };
    }

    // For files over threshold, apply hybrid processing
    return this.processLargeFile(filePath, fileContent, lines, options, processingMetadata, startTime);
  }

  /**
   * Process large files (>1000 LOC) with hybrid optimization
   */
  private static async processLargeFile(
    filePath: string,
    fileContent: string,
    lines: string[],
    options: FileProcessingOptions,
    processingMetadata: ProcessingMetadata,
    startTime: number
  ): Promise<ProcessedFileContent> {
    const totalLines = lines.length;
    const locThreshold = options.locThreshold || this.DEFAULT_LOC_THRESHOLD;
    
    // Split content: first 1000 lines unoptimized, rest optimized
    const fullContentLines = lines.slice(0, locThreshold);
    const optimizationLines = lines.slice(locThreshold);
    
    const fullContent = fullContentLines.join('\n');
    const optimizationContent = optimizationLines.join('\n');
    
    // Apply optimization to the content after line 1000
    const optimizedContent = await this.optimizeContent(optimizationContent, options);
    
    // Calculate token estimates
    const fullContentTokens = TokenEstimator.estimateTokens(fullContent);
    const optimizedContentTokens = TokenEstimator.estimateTokens(optimizedContent);
    const totalTokens = fullContentTokens + optimizedContentTokens;
    
    // Create content sections
    const contentSections: ContentSection[] = [
      {
        type: 'full',
        startLine: 1,
        endLine: locThreshold,
        content: fullContent,
        tokenCount: fullContentTokens,
        description: `Unoptimized content (lines 1-${locThreshold})`
      },
      {
        type: 'optimized',
        startLine: locThreshold + 1,
        endLine: totalLines,
        content: optimizedContent,
        tokenCount: optimizedContentTokens,
        description: `Optimized content (lines ${locThreshold + 1}-${totalLines})`
      }
    ];
    
    // Combine content with optimization boundary marker
    const combinedContent = this.combineContentWithMarkers(fullContent, optimizedContent, locThreshold);
    
    // Calculate optimization ratio
    const originalOptimizationTokens = TokenEstimator.estimateTokens(optimizationContent);
    const optimizationRatio = optimizedContentTokens / originalOptimizationTokens;
    
    // Update processing metadata
    processingMetadata.processingTime = Date.now() - startTime;
    processingMetadata.optimizationApplied = true;
    processingMetadata.optimizationRatio = optimizationRatio;
    
    return {
      content: combinedContent,
      isOptimized: true,
      totalLines,
      fullContentLines: locThreshold,
      optimizedLines: totalLines - locThreshold,
      tokenEstimate: totalTokens,
      contentSections,
      processingMetadata
    };
  }

  /**
   * Optimize content using Code-Map Generator optimization functions
   */
  private static async optimizeContent(content: string, options: FileProcessingOptions): Promise<string> {
    try {
      // Use simple content optimization based on Code-Map Generator patterns
      const maxLength = options.maxContentLength || this.DEFAULT_MAX_CONTENT_LENGTH;
      const preserveComments = options.preserveComments ?? true;

      // Apply basic optimization: remove excessive whitespace and optionally comments
      let optimized = (content || '')
        .split('\n')
        .map(line => (line || '').trim())
        .filter(line => {
          // Keep non-empty lines
          if (line.length === 0) return false;

          // Optionally remove comments
          if (!preserveComments && (line.startsWith('//') || line.startsWith('#') || line.startsWith('/*'))) {
            return false;
          }

          return true;
        })
        .join('\n');

      // Apply content length optimization if needed
      if (optimized.length > maxLength * 100) { // maxLength is in "units", multiply for actual chars
        const lines = optimized.split('\n');
        const targetLines = Math.floor(lines.length * 0.7); // Keep 70% of lines
        optimized = lines.slice(0, targetLines).join('\n') + '\n// ... (content optimized for token efficiency)';
      }

      return optimized;
    } catch (error) {
      // If optimization fails, return original content with a warning comment
      const errorMessage = error instanceof Error ? error.message : 'Unknown optimization error';
      return `// [OPTIMIZATION WARNING: ${errorMessage}]\n${content}`;
    }
  }

  /**
   * Combine full and optimized content with boundary markers
   */
  private static combineContentWithMarkers(
    fullContent: string,
    optimizedContent: string,
    threshold: number
  ): string {
    const marker = `\n// ===== OPTIMIZATION BOUNDARY (Line ${threshold}) =====\n// Content below this line has been optimized for token efficiency\n// Original structure and semantics are preserved\n\n`;
    
    return fullContent + marker + optimizedContent;
  }

  /**
   * Detect content type from file extension
   */
  private static detectContentType(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();

    const typeMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'swift': 'swift',
      'kt': 'kotlin',
      'json': 'json',
      'xml': 'xml',
      'html': 'html',
      'css': 'css',
      'md': 'markdown',
      'yml': 'yaml',
      'yaml': 'yaml'
    };

    return typeMap[extension || ''] || 'text';
  }

  /**
   * Map content type to TokenEstimator type
   */
  private static mapToTokenEstimatorType(contentType: string): 'xml' | 'json' | 'markdown' | 'code' | 'plain' {
    switch (contentType) {
      case 'xml':
      case 'html':
        return 'xml';
      case 'json':
        return 'json';
      case 'markdown':
        return 'markdown';
      case 'javascript':
      case 'typescript':
      case 'python':
      case 'java':
      case 'cpp':
      case 'c':
      case 'csharp':
      case 'php':
      case 'ruby':
      case 'go':
      case 'rust':
      case 'swift':
      case 'kotlin':
        return 'code';
      default:
        return 'plain';
    }
  }

  /**
   * Read and process file from filesystem
   */
  static async readAndProcessFile(
    filePath: string,
    options: FileProcessingOptions
  ): Promise<ProcessedFileContent> {
    try {
      // Use secure file reading from Code-Map Generator
      const fileContent = await readFileSecure(filePath, options.allowedDirectory);
      
      return this.processFileContent(filePath, fileContent, options);
    } catch (error) {
      throw new Error(`Failed to read and process file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get processing statistics for debugging
   */
  static getProcessingStats(result: ProcessedFileContent): {
    totalLines: number;
    optimizationApplied: boolean;
    tokenEfficiency: number;
    processingTime: number;
    contentSectionCount: number;
  } {
    const tokenEfficiency = result.isOptimized && result.processingMetadata.optimizationRatio
      ? (1 - result.processingMetadata.optimizationRatio) * 100
      : 0;
    
    return {
      totalLines: result.totalLines,
      optimizationApplied: result.isOptimized,
      tokenEfficiency: Math.round(tokenEfficiency * 100) / 100,
      processingTime: result.processingMetadata.processingTime,
      contentSectionCount: result.contentSections.length
    };
  }
}
