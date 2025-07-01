/**
 * Package Compressor Service for Context Curator
 * 
 * Provides compression capabilities for context packages to reduce storage
 * and transmission overhead while maintaining data integrity.
 */

import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import { createHash } from 'crypto';
import logger from '../../../logger.js';
import type { ContextPackage } from '../types/context-curator.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface CompressionMetadata {
  /** Original size in bytes */
  originalSize: number;
  /** Compressed size in bytes */
  compressedSize: number;
  /** Compression ratio (compressed/original) */
  compressionRatio: number;
  /** Compression algorithm used */
  algorithm: 'gzip' | 'brotli' | 'deflate';
  /** Compression level (1-9 for gzip) */
  compressionLevel: number;
  /** Time taken to compress in milliseconds */
  compressionTimeMs: number;
  /** Checksum for integrity verification */
  checksum: string;
}

export interface CompressedPackage {
  /** Compressed data buffer */
  compressedData: Buffer;
  /** Compression metadata */
  metadata: CompressionMetadata;
}

export class PackageCompressor {
  private static readonly DEFAULT_COMPRESSION_LEVEL = 6;
  private static readonly MAX_COMPRESSION_SIZE = 50 * 1024 * 1024; // 50MB

  /**
   * Compress a context package
   */
  static async compressPackage(
    contextPackage: ContextPackage,
    compressionLevel: number = this.DEFAULT_COMPRESSION_LEVEL
  ): Promise<CompressedPackage> {
    const startTime = Date.now();

    try {
      logger.info({ 
        packageId: contextPackage.id,
        compressionLevel 
      }, 'Starting package compression');

      // Serialize package to JSON
      const jsonString = JSON.stringify(contextPackage);
      const originalSize = Buffer.byteLength(jsonString, 'utf8');

      // Check size limits
      if (originalSize > this.MAX_COMPRESSION_SIZE) {
        throw new Error(`Package too large for compression: ${originalSize} bytes > ${this.MAX_COMPRESSION_SIZE} bytes`);
      }

      // Compress using gzip
      const compressedData = await gzipAsync(jsonString, {
        level: compressionLevel,
        memLevel: 8
      });

      const compressedSize = compressedData.length;
      const compressionRatio = compressedSize / originalSize;
      const compressionTimeMs = Date.now() - startTime;

      // Calculate checksum for integrity
      const checksum = this.calculateChecksum(compressedData);

      const metadata: CompressionMetadata = {
        originalSize,
        compressedSize,
        compressionRatio,
        algorithm: 'gzip',
        compressionLevel,
        compressionTimeMs,
        checksum
      };

      logger.info({
        packageId: contextPackage.id,
        originalSize,
        compressedSize,
        compressionRatio: (compressionRatio * 100).toFixed(1) + '%',
        compressionTimeMs
      }, 'Package compression completed');

      return {
        compressedData,
        metadata
      };

    } catch (error) {
      logger.error({
        packageId: contextPackage.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        compressionTimeMs: Date.now() - startTime
      }, 'Package compression failed');
      throw error;
    }
  }

  /**
   * Decompress a compressed package
   */
  static async decompressPackage(
    compressedPackage: CompressedPackage
  ): Promise<ContextPackage> {
    const startTime = Date.now();

    try {
      logger.info({
        algorithm: compressedPackage.metadata.algorithm,
        compressedSize: compressedPackage.metadata.compressedSize
      }, 'Starting package decompression');

      // Verify checksum
      const calculatedChecksum = this.calculateChecksum(compressedPackage.compressedData);
      if (calculatedChecksum !== compressedPackage.metadata.checksum) {
        throw new Error('Checksum mismatch - compressed data may be corrupted');
      }

      // Decompress based on algorithm
      let decompressedBuffer: Buffer;
      
      switch (compressedPackage.metadata.algorithm) {
        case 'gzip':
          decompressedBuffer = await gunzipAsync(compressedPackage.compressedData);
          break;
        default:
          throw new Error(`Unsupported compression algorithm: ${compressedPackage.metadata.algorithm}`);
      }

      // Convert to string and parse JSON
      const jsonString = decompressedBuffer.toString('utf8');
      const contextPackage: ContextPackage = JSON.parse(jsonString);

      const decompressionTimeMs = Date.now() - startTime;

      logger.info({
        packageId: contextPackage.id,
        originalSize: compressedPackage.metadata.originalSize,
        decompressionTimeMs
      }, 'Package decompression completed');

      return contextPackage;

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        decompressionTimeMs: Date.now() - startTime
      }, 'Package decompression failed');
      throw error;
    }
  }

  /**
   * Estimate compression ratio for a package without actually compressing
   */
  static estimateCompressionRatio(contextPackage: ContextPackage): number {
    try {
      const jsonString = JSON.stringify(contextPackage);

      // Estimate based on content characteristics
      let estimatedRatio = 0.3; // Base estimate for JSON compression

      // Adjust based on content type
      const hasLargeTextContent = contextPackage.files.some(file => 
        file.file.content && file.file.content.length > 10000
      );

      if (hasLargeTextContent) {
        estimatedRatio = 0.2; // Better compression for large text
      }

      // Adjust based on repetitive content
      const hasRepetitiveContent = this.hasRepetitiveContent(jsonString);
      if (hasRepetitiveContent) {
        estimatedRatio *= 0.8; // Better compression for repetitive content
      }

      return Math.max(0.1, Math.min(0.9, estimatedRatio));

    } catch (error) {
      logger.warn({
        packageId: contextPackage.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to estimate compression ratio');
      return 0.5; // Default estimate
    }
  }

  /**
   * Get compression statistics for a package
   */
  static getCompressionStats(metadata: CompressionMetadata): {
    spaceSavedBytes: number;
    spaceSavedPercentage: number;
    compressionEfficiency: 'excellent' | 'good' | 'fair' | 'poor';
  } {
    const spaceSavedBytes = metadata.originalSize - metadata.compressedSize;
    const spaceSavedPercentage = (spaceSavedBytes / metadata.originalSize) * 100;

    let compressionEfficiency: 'excellent' | 'good' | 'fair' | 'poor';
    
    if (metadata.compressionRatio <= 0.3) {
      compressionEfficiency = 'excellent';
    } else if (metadata.compressionRatio <= 0.5) {
      compressionEfficiency = 'good';
    } else if (metadata.compressionRatio <= 0.7) {
      compressionEfficiency = 'fair';
    } else {
      compressionEfficiency = 'poor';
    }

    return {
      spaceSavedBytes,
      spaceSavedPercentage,
      compressionEfficiency
    };
  }

  /**
   * Optimize package for compression by removing redundant data
   */
  static optimizeForCompression(contextPackage: ContextPackage): ContextPackage {
    try {
      logger.info({ packageId: contextPackage.id }, 'Optimizing package for compression');

      // Create a deep copy to avoid modifying the original
      const optimized = JSON.parse(JSON.stringify(contextPackage));

      // Remove null/undefined values
      this.removeNullValues(optimized);

      // Deduplicate similar content
      this.deduplicateContent(optimized);

      // Compress repetitive strings
      this.compressRepetitiveStrings(optimized);

      logger.info({ packageId: contextPackage.id }, 'Package optimization for compression completed');

      return optimized;

    } catch (error) {
      logger.warn({
        packageId: contextPackage.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to optimize package for compression, using original');
      return contextPackage;
    }
  }

  /**
   * Calculate checksum for data integrity
   */
  private static calculateChecksum(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Check if content has repetitive patterns
   */
  private static hasRepetitiveContent(content: string): boolean {
    // Simple heuristic: check for repeated substrings
    const sampleSize = Math.min(1000, content.length);
    const sample = content.substring(0, sampleSize);
    
    // Look for repeated patterns of 10+ characters
    const patterns = new Set<string>();
    for (let i = 0; i < sample.length - 10; i++) {
      const pattern = sample.substring(i, i + 10);
      if (patterns.has(pattern)) {
        return true;
      }
      patterns.add(pattern);
    }
    
    return false;
  }

  /**
   * Remove null and undefined values from object
   */
  private static removeNullValues(obj: Record<string, unknown> | unknown[]): void {
    if (Array.isArray(obj)) {
      obj.forEach(item => {
        if (typeof item === 'object' && item !== null) {
          this.removeNullValues(item as Record<string, unknown>);
        }
      });
    } else if (obj && typeof obj === 'object') {
      const objRecord = obj as Record<string, unknown>;
      Object.keys(objRecord).forEach(key => {
        if (objRecord[key] === null || objRecord[key] === undefined) {
          delete objRecord[key];
        } else if (typeof objRecord[key] === 'object' && objRecord[key] !== null) {
          this.removeNullValues(objRecord[key] as Record<string, unknown>);
        }
      });
    }
  }

  /**
   * Deduplicate similar content in the package
   */
  private static deduplicateContent(contextPackage: Record<string, unknown>): void {
    // Deduplicate similar file contents
    if (contextPackage.files && Array.isArray(contextPackage.files)) {
      const contentMap = new Map<string, string>();
      
      contextPackage.files.forEach((file: Record<string, unknown>) => {
        const fileRecord = file as { file?: { content?: string; contentRef?: string } };
        if (fileRecord.file && typeof fileRecord.file.content === 'string') {
          const contentHash = createHash('md5')
            .update(fileRecord.file.content)
            .digest('hex');

          if (contentMap.has(contentHash)) {
            // Replace with reference to avoid duplication
            fileRecord.file.contentRef = contentHash;
            delete fileRecord.file.content;
          } else {
            contentMap.set(contentHash, fileRecord.file.content);
          }
        }
      });
    }
  }

  /**
   * Compress repetitive strings in the package
   */
  private static compressRepetitiveStrings(obj: Record<string, unknown> | unknown[] | string): void {
    // This is a placeholder for more sophisticated string compression
    // In a real implementation, you might use techniques like:
    // - Dictionary compression for common terms
    // - Run-length encoding for repeated characters
    // - Reference compression for repeated substrings
    
    if (typeof obj === 'string' && obj.length > 100) {
      // Simple example: compress repeated whitespace
      obj = obj.replace(/\s+/g, ' ');
    } else if (Array.isArray(obj)) {
      obj.forEach(item => {
        if (typeof item === 'string' || Array.isArray(item) || (item && typeof item === 'object')) {
          this.compressRepetitiveStrings(item as Record<string, unknown> | unknown[] | string);
        }
      });
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(value => {
        if (typeof value === 'string' || Array.isArray(value) || (value && typeof value === 'object')) {
          this.compressRepetitiveStrings(value as Record<string, unknown> | unknown[] | string);
        }
      });
    }
  }
}
