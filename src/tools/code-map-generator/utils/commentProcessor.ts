/**
 * Centralized comment processing with semantic preservation
 * Provides intelligent comment compression that respects maxContentLength
 * while preserving semantic meaning
 */

import { EnhancementConfig, EnhancementConfigManager } from '../config/enhancementConfig.js';
import { selectBestKeywords, CommentContext } from './semanticExtractor.js';


/**
 * Centralized comment processor that handles all comment processing
 * with semantic-aware compression
 */
export class CommentProcessor {
  constructor(private config: EnhancementConfig) {}

  /**
   * Process comment with semantic-aware compression
   * @param comment - The original comment text
   * @param context - Context information for semantic processing
   * @returns Processed comment respecting maxContentLength
   */
  processComment(comment: string | undefined, context?: CommentContext): string {
    if (!comment) {
      return '';
    }

    // Check if content density processing is enabled
    if (!this.config.contentDensity.enabled) {
      return comment;
    }

    const maxLength = this.config.contentDensity.maxContentLength;
    
    // If maxContentLength is 0, disable comments entirely
    if (maxLength === 0) {
      return '';
    }

    // If comment is already within limits, return as-is
    if (comment.length <= maxLength) {
      return comment;
    }

    // Apply semantic-aware compression
    return this.compressWithSemanticPreservation(comment, maxLength, context);
  }

  /**
   * Process multiple comments (for batch processing)
   */
  processComments(comments: Array<{ comment?: string; context?: CommentContext }>): string[] {
    return comments.map(item => this.processComment(item.comment, item.context));
  }

  /**
   * Check if comment processing is enabled
   */
  isEnabled(): boolean {
    return this.config.contentDensity.enabled;
  }

  /**
   * Get the configured maximum content length
   */
  getMaxContentLength(): number {
    return this.config.contentDensity.maxContentLength;
  }

  /**
   * Intelligent compression that preserves semantic meaning using pure keyword extraction
   */
  private compressWithSemanticPreservation(
    comment: string,
    maxLength: number,
    context?: CommentContext
  ): string {
    // Clean up the comment first
    const cleaned = this.cleanComment(comment);

    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    // Use pure semantic keyword selection (no truncation)
    return selectBestKeywords(cleaned, maxLength, context);
  }

  /**
   * Clean and normalize comment text
   */
  private cleanComment(comment: string): string {
    return comment
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/^\s*[/*#]*\s*/, '') // Remove comment markers at start
      .replace(/\s*[/*#]*\s*$/, '') // Remove comment markers at end
      .trim();
  }
}

/**
 * Factory function to create CommentProcessor with current configuration
 */
export function createCommentProcessor(): CommentProcessor {
  const config = EnhancementConfigManager.getInstance().getConfig();
  return new CommentProcessor(config);
}

/**
 * Utility function for processing a single comment with default configuration
 */
export function processComment(comment: string | undefined, context?: CommentContext): string {
  const processor = createCommentProcessor();
  return processor.processComment(comment, context);
}

// Re-export types for convenience
export type { CommentContext } from './semanticExtractor.js';
