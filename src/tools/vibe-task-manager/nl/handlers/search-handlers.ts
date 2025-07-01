/**
 * Search NLP Handlers
 *
 * Implements natural language handlers for file and content search
 * using the existing FileSearchService infrastructure.
 */

import { Intent, RecognizedIntent } from '../../types/nl.js';
import { CommandHandler, CommandExecutionContext, CommandExecutionResult } from '../command-handlers.js';
import { FileSearchService } from '../../../../services/file-search-service/index.js';
import logger from '../../../../logger.js';
import path from 'path';

/**
 * Search Files Handler
 * Handles natural language requests to search for files
 */
export class SearchFilesHandler implements CommandHandler {
  intent: Intent = 'search_files';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    try {
      logger.info({
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Processing file search request');

      // Extract search parameters
      const searchPattern = this.extractSearchPattern(recognizedIntent, toolParams);
      const searchOptions = this.extractSearchOptions(recognizedIntent, toolParams);
      const projectPath = this.extractProjectPath(recognizedIntent, toolParams, context);

      if (!searchPattern) {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: "❌ Please specify what files to search for. For example: 'find auth files' or 'search for component files'"
            }],
            isError: true
          }
        };
      }

      // Initialize file search service
      const fileSearchService = FileSearchService.getInstance();

      // Perform search
      const results = await fileSearchService.searchFiles(projectPath, {
        pattern: searchPattern,
        searchStrategy: (searchOptions.strategy as 'fuzzy' | 'exact' | 'regex' | 'glob' | 'content') || 'fuzzy',
        fileTypes: searchOptions.extensions as string[] | undefined,
        excludeDirs: searchOptions.excludePatterns as string[] | undefined,
        maxResults: (searchOptions.maxResults as number) || 20,
        cacheResults: true
      });

      if (results.length === 0) {
        return {
          success: true,
          result: {
            content: [{
              type: "text",
              text: `🔍 No files found matching "${searchPattern}". Try a different search term or check the project path.`
            }]
          }
        };
      }

      // Format results
      let responseText = `🔍 Found ${results.length} files matching "${searchPattern}":\n\n`;

      results.slice(0, 10).forEach((result, index) => {
        const relativePath = path.relative(projectPath, result.filePath);
        const score = result.score ? ` (${(result.score * 100).toFixed(0)}% match)` : '';
        const size = result.metadata?.size ? ` - ${this.formatBytes(result.metadata.size)}` : '';

        responseText += `${index + 1}. **${relativePath}**${score}${size}\n`;
      });

      if (results.length > 10) {
        responseText += `\n... and ${results.length - 10} more files\n`;
      }

      // Add search metrics
      const metrics = fileSearchService.getPerformanceMetrics();
      responseText += `\n📊 Search completed in ${metrics.searchTime}ms (${metrics.filesScanned} files scanned)`;

      return {
        success: true,
        result: {
          content: [{
            type: "text",
            text: responseText
          }]
        },
        followUpSuggestions: [
          `Search for content in "${searchPattern}" files`,
          'Search for a different file pattern',
          'List all files in the project'
        ]
      };

    } catch (error) {
      logger.error({
        err: error,
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'File search failed');

      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `❌ Failed to search files: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        }
      };
    }
  }

  /**
   * Extract search pattern from natural language input
   */
  private extractSearchPattern(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>): string | null {
    // Check tool params first
    if (toolParams.pattern || toolParams.query) {
      return (toolParams.pattern || toolParams.query) as string;
    }

    // Extract from entities
    const patternEntity = recognizedIntent.entities.find(e => e.type === 'searchPattern' || e.type === 'fileName');
    if (patternEntity) {
      return patternEntity.value;
    }

    // Pattern matching from original input
    // Look for "find X files" or "search for X"
    const patterns = [
      /(?:find|search\s+for|locate)\s+(.+?)\s+files?/i,
      /(?:find|search\s+for|locate)\s+(.+)/i,
      /files?\s+(?:named|called)\s+(.+)/i,
      /(.+?)\s+files?/i
    ];

    for (const pattern of patterns) {
      const match = recognizedIntent.originalInput.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract search options from natural language input
   */
  private extractSearchOptions(recognizedIntent: RecognizedIntent, _toolParams: Record<string, unknown>): Record<string, unknown> {
    const options: Record<string, unknown> = {};
    const input = recognizedIntent.originalInput.toLowerCase();

    // Extract file extensions
    const extMatch = input.match(/\.(\w+)\s+files?|(\w+)\s+files?/);
    if (extMatch) {
      const ext = extMatch[1] || extMatch[2];
      if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'css', 'html'].includes(ext)) {
        options.extensions = [`.${ext}`];
      }
    }

    // Determine search strategy
    if (input.includes('exact') || input.includes('exactly')) {
      options.strategy = 'exact';
    } else if (input.includes('regex') || input.includes('pattern')) {
      options.strategy = 'regex';
    } else {
      options.strategy = 'fuzzy';
    }

    // Extract exclusions
    if (input.includes('exclude') || input.includes('ignore')) {
      options.excludePatterns = ['node_modules', '.git', 'dist', 'build'];
    }

    // Extract result limits
    const limitMatch = input.match(/(?:first|top|limit)\s+(\d+)/);
    if (limitMatch) {
      options.maxResults = parseInt(limitMatch[1], 10);
    }

    return options;
  }

  /**
   * Extract project path from context or input
   */
  private extractProjectPath(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>, context: CommandExecutionContext): string {
    // Check tool params
    if (toolParams.path || toolParams.projectPath) {
      return path.resolve(toolParams.path as string || toolParams.projectPath as string);
    }

    // Use current project context if available
    if (context.currentProject) {
      // TODO: Get project path from project ID
      return process.cwd();
    }

    // Default to current working directory
    return process.cwd();
  }

  /**
   * Format bytes for display
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

/**
 * Search Content Handler
 * Handles natural language requests to search for content within files
 */
export class SearchContentHandler implements CommandHandler {
  intent: Intent = 'search_content';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    try {
      logger.info({
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Processing content search request');

      // Extract search parameters
      const searchQuery = this.extractSearchQuery(recognizedIntent, toolParams);
      const searchOptions = this.extractSearchOptions(recognizedIntent, toolParams);
      const projectPath = this.extractProjectPath(recognizedIntent, toolParams, context);

      if (!searchQuery) {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: "❌ Please specify what content to search for. For example: 'find useState in files' or 'search for authentication code'"
            }],
            isError: true
          }
        };
      }

      // Initialize file search service
      const fileSearchService = FileSearchService.getInstance();

      // Perform content search
      const results = await fileSearchService.searchFiles(projectPath, {
        content: searchQuery,
        searchStrategy: 'content',
        fileTypes: searchOptions.extensions as string[] | undefined,
        excludeDirs: (searchOptions.excludePatterns as string[]) || ['node_modules', '.git', 'dist', 'build'],
        maxResults: (searchOptions.maxResults as number) || 15,
        caseSensitive: (searchOptions.caseSensitive as boolean) || false,
        cacheResults: true
      });

      if (results.length === 0) {
        return {
          success: true,
          result: {
            content: [{
              type: "text",
              text: `🔍 No content found matching "${searchQuery}". Try a different search term or check the file types.`
            }]
          }
        };
      }

      // Format results
      let responseText = `🔍 Found "${searchQuery}" in ${results.length} files:\n\n`;

      results.slice(0, 8).forEach((result, index) => {
        const relativePath = path.relative(projectPath, result.filePath);
        const matchCount = result.lineNumbers ? result.lineNumbers.length : 0;

        responseText += `${index + 1}. **${relativePath}** (${matchCount} matches)\n`;

        // Show preview if available
        if (result.preview) {
          const lines = result.preview.split('\n').slice(0, 2);
          lines.forEach((line, _lineIndex) => {
            const lineText = line.trim();
            responseText += `   \`${lineText.substring(0, 80)}${lineText.length > 80 ? '...' : ''}\`\n`;
          });

          if (result.lineNumbers && result.lineNumbers.length > 2) {
            responseText += `   ... and ${result.lineNumbers.length - 2} more matches\n`;
          }
        }
        responseText += '\n';
      });

      if (results.length > 8) {
        responseText += `... and ${results.length - 8} more files\n\n`;
      }

      // Add search metrics
      const metrics = fileSearchService.getPerformanceMetrics();
      responseText += `📊 Content search completed in ${metrics.searchTime}ms (${metrics.filesScanned} files scanned)`;

      return {
        success: true,
        result: {
          content: [{
            type: "text",
            text: responseText
          }]
        },
        followUpSuggestions: [
          `Search for files containing "${searchQuery}"`,
          'Search for a different content pattern',
          'Show more details for specific files'
        ]
      };

    } catch (error) {
      logger.error({
        err: error,
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Content search failed');

      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `❌ Failed to search content: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        }
      };
    }
  }

  /**
   * Extract search query from natural language input
   */
  private extractSearchQuery(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>): string | null {
    // Check tool params first
    if (toolParams.query || toolParams.content) {
      return (toolParams.query || toolParams.content) as string;
    }

    // Extract from entities
    const queryEntity = recognizedIntent.entities.find(e => e.type === 'searchQuery' || e.type === 'content');
    if (queryEntity) {
      return queryEntity.value;
    }

    // Pattern matching from original input
    const input = recognizedIntent.originalInput;

    // Look for various content search patterns
    const patterns = [
      /(?:find|search\s+for|locate)\s+(.+?)\s+(?:in\s+files?|in\s+code)/i,
      /(?:find|search\s+for|locate)\s+"(.+?)"/i,
      /(?:find|search\s+for|locate)\s+'(.+?)'/i,
      /(?:find|search\s+for|locate)\s+(.+)/i,
      /content\s+(?:containing|with)\s+(.+)/i
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract search options from natural language input
   */
  private extractSearchOptions(recognizedIntent: RecognizedIntent, _toolParams: Record<string, unknown>): Record<string, unknown> {
    const options: Record<string, unknown> = {};
    const input = recognizedIntent.originalInput.toLowerCase();

    // Extract file extensions
    const extMatch = input.match(/in\s+\.(\w+)\s+files?|in\s+(\w+)\s+files?/);
    if (extMatch) {
      const ext = extMatch[1] || extMatch[2];
      if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'css', 'html'].includes(ext)) {
        options.extensions = [`.${ext}`];
      }
    }

    // Check for case sensitivity
    if (input.includes('case sensitive') || input.includes('exact case')) {
      options.caseSensitive = true;
    }

    // Check for regex
    if (input.includes('regex') || input.includes('regular expression')) {
      options.useRegex = true;
    }

    // Extract context lines
    const contextMatch = input.match(/(?:with|show)\s+(\d+)\s+lines?\s+(?:of\s+)?context/);
    if (contextMatch) {
      options.contextLines = parseInt(contextMatch[1], 10);
    }

    // Extract result limits
    const limitMatch = input.match(/(?:first|top|limit)\s+(\d+)/);
    if (limitMatch) {
      options.maxResults = parseInt(limitMatch[1], 10);
    }

    return options;
  }

  /**
   * Extract project path from context or input
   */
  private extractProjectPath(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>, context: CommandExecutionContext): string {
    // Check tool params
    if (toolParams.path || toolParams.projectPath) {
      return path.resolve(toolParams.path as string || toolParams.projectPath as string);
    }

    // Use current project context if available
    if (context.currentProject) {
      // TODO: Get project path from project ID
      return process.cwd();
    }

    // Default to current working directory
    return process.cwd();
  }
}
