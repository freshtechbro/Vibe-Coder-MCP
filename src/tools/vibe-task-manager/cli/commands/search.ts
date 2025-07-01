/**
 * Search CLI Commands
 *
 * Implements CLI commands for file and content search using the
 * existing FileSearchService infrastructure.
 */

import { Command } from 'commander';
import { FileSearchService } from '../../../../services/file-search-service/index.js';
import { CLIUtils } from './index.js';
import { ValidationError } from '../../../../utils/errors.js';
import logger from '../../../../logger.js';
import path from 'path';

/**
 * Create search command group
 */
export function createSearchCommand(): Command {
  const searchCmd = new Command('search');

  searchCmd
    .description('Search for files and content in the project')
    .configureOutput({
      writeOut: (str) => process.stdout.write(str),
      writeErr: (str) => process.stderr.write(str)
    });

  // Add subcommands
  searchCmd.addCommand(createFilesSearchCommand());
  searchCmd.addCommand(createContentSearchCommand());
  searchCmd.addCommand(createGlobSearchCommand());

  return searchCmd;
}

/**
 * Search files by name/pattern
 */
function createFilesSearchCommand(): Command {
  return new Command('files')
    .description('Search for files by name or pattern')
    .argument('<pattern>', 'File name pattern to search for')
    .option('-p, --path <path>', 'Project path to search in', process.cwd())
    .option('-e, --extensions <extensions>', 'File extensions to include (comma-separated)')
    .option('-x, --exclude <patterns>', 'Patterns to exclude (comma-separated)')
    .option('-l, --limit <number>', 'Maximum number of results', '50')
    .option('-s, --strategy <strategy>', 'Search strategy (fuzzy|exact|regex)', 'fuzzy')
    .option('-f, --format <format>', 'Output format (table|json|yaml)', 'table')
    .option('--no-cache', 'Disable result caching')
    .action(async (pattern, options) => {
      try {
        logger.info({ command: 'search files', pattern, options }, 'Starting file search');

        // Validate project path
        const projectPath = path.resolve(options.path);
        CLIUtils.info(`Searching for files matching "${pattern}" in ${projectPath}`);

        // Initialize file search service
        const fileSearchService = FileSearchService.getInstance();

        // Parse options
        const fileTypes = options.extensions ? options.extensions.split(',').map((ext: string) => ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`) : undefined;
        const excludeDirs = options.exclude ? options.exclude.split(',').map((pattern: string) => pattern.trim()) : undefined;
        const limit = parseInt(options.limit, 10);

        // Perform search
        const searchOptions = {
          pattern,
          searchStrategy: options.strategy as 'fuzzy' | 'exact' | 'regex',
          fileTypes,
          excludeDirs,
          maxResults: limit,
          cacheResults: !options.noCache
        };

        const results = await fileSearchService.searchFiles(projectPath, searchOptions);

        if (results.length === 0) {
          CLIUtils.warning(`No files found matching pattern "${pattern}"`);
          return;
        }

        CLIUtils.success(`Found ${results.length} files matching "${pattern}"`);

        // Format results for display
        const displayData = results.map((result, index) => ({
          '#': index + 1,
          'File': path.relative(projectPath, result.filePath),
          'Score': result.score?.toFixed(3) || 'N/A',
          'Size': result.metadata?.size ? CLIUtils.formatBytes(result.metadata.size) : 'N/A',
          'Modified': result.metadata?.lastModified ? CLIUtils.formatDate(result.metadata.lastModified) : 'N/A'
        }));

        console.log('\n' + CLIUtils.formatOutput(displayData, options.format));

        // Show search metrics
        const metrics = fileSearchService.getPerformanceMetrics();
        CLIUtils.info(`Search completed in ${metrics.searchTime}ms (${metrics.filesScanned} files scanned)`);

      } catch (error) {
        logger.error({ err: error, pattern, options }, 'File search failed');

        if (error instanceof ValidationError) {
          CLIUtils.error(error.message);
        } else {
          CLIUtils.error('Failed to search files. Check logs for details.');
        }
      }
    });
}

/**
 * Search file content
 */
function createContentSearchCommand(): Command {
  return new Command('content')
    .description('Search for content within files')
    .argument('<query>', 'Content to search for')
    .option('-p, --path <path>', 'Project path to search in', process.cwd())
    .option('-e, --extensions <extensions>', 'File extensions to search (comma-separated)')
    .option('-x, --exclude <patterns>', 'File patterns to exclude (comma-separated)')
    .option('-l, --limit <number>', 'Maximum number of results', '25')
    .option('-c, --context <lines>', 'Lines of context around matches', '2')
    .option('--case-sensitive', 'Case-sensitive search')
    .option('--regex', 'Treat query as regular expression')
    .option('-f, --format <format>', 'Output format (table|json|yaml)', 'table')
    .option('--no-cache', 'Disable result caching')
    .action(async (query, options) => {
      try {
        logger.info({ command: 'search content', query, options }, 'Starting content search');

        // Validate project path
        const projectPath = path.resolve(options.path);
        CLIUtils.info(`Searching for content "${query}" in ${projectPath}`);

        // Initialize file search service
        const fileSearchService = FileSearchService.getInstance();

        // Parse options
        const fileTypes = options.extensions ? options.extensions.split(',').map((ext: string) => ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`) : undefined;
        const excludeDirs = options.exclude ? options.exclude.split(',').map((pattern: string) => pattern.trim()) : ['node_modules', '.git', 'dist', 'build'];
        const limit = parseInt(options.limit, 10);

        // Perform content search
        const searchOptions = {
          content: query,
          searchStrategy: 'content' as const,
          fileTypes,
          excludeDirs,
          maxResults: limit,
          caseSensitive: options.caseSensitive,
          cacheResults: !options.noCache
        };

        const results = await fileSearchService.searchFiles(projectPath, searchOptions);

        if (results.length === 0) {
          CLIUtils.warning(`No content found matching "${query}"`);
          return;
        }

        CLIUtils.success(`Found ${results.length} files containing "${query}"`);

        // Format results for display
        const displayData = results.map((result, index) => {
          const relativePath = path.relative(projectPath, result.filePath);
          const matchInfo = result.lineNumbers ? `${result.lineNumbers.length} matches` : 'N/A';

          return {
            '#': index + 1,
            'File': CLIUtils.truncate(relativePath, 50),
            'Matches': matchInfo,
            'Score': result.score?.toFixed(3) || 'N/A',
            'Size': result.metadata?.size ? CLIUtils.formatBytes(result.metadata.size) : 'N/A'
          };
        });

        console.log('\n' + CLIUtils.formatOutput(displayData, options.format));

        // Show detailed matches for first few results
        if (options.format === 'table' && results.some(r => r.preview)) {
          console.log('\nMatch Details:');
          results.slice(0, 5).forEach((result, index) => {
            const relativePath = path.relative(projectPath, result.filePath);
            console.log(`\n${index + 1}. ${relativePath}`);

            if (result.preview) {
              const lines = result.preview.split('\n').slice(0, 3);
              lines.forEach((line, _lineIndex) => {
                console.log(`   ${line.trim()}`);
              });

              if (result.lineNumbers && result.lineNumbers.length > 3) {
                console.log(`   ... and ${result.lineNumbers.length - 3} more matches`);
              }
            }
          });
        }

        // Show search metrics
        const metrics = fileSearchService.getPerformanceMetrics();
        CLIUtils.info(`Content search completed in ${metrics.searchTime}ms (${metrics.filesScanned} files scanned)`);

      } catch (error) {
        logger.error({ err: error, query, options }, 'Content search failed');

        if (error instanceof ValidationError) {
          CLIUtils.error(error.message);
        } else {
          CLIUtils.error('Failed to search content. Check logs for details.');
        }
      }
    });
}

/**
 * Search using glob patterns
 */
function createGlobSearchCommand(): Command {
  return new Command('glob')
    .description('Search files using glob patterns')
    .argument('<pattern>', 'Glob pattern to search with')
    .option('-p, --path <path>', 'Project path to search in', process.cwd())
    .option('-l, --limit <number>', 'Maximum number of results', '100')
    .option('-f, --format <format>', 'Output format (table|json|yaml)', 'table')
    .option('--no-cache', 'Disable result caching')
    .action(async (pattern, options) => {
      try {
        logger.info({ command: 'search glob', pattern, options }, 'Starting glob search');

        // Validate project path
        const projectPath = path.resolve(options.path);
        CLIUtils.info(`Searching with glob pattern "${pattern}" in ${projectPath}`);

        // Initialize file search service
        const fileSearchService = FileSearchService.getInstance();

        // Parse options
        const limit = parseInt(options.limit, 10);

        // Perform glob search
        const searchOptions = {
          glob: pattern,
          searchStrategy: 'glob' as const,
          maxResults: limit,
          cacheResults: !options.noCache
        };

        const results = await fileSearchService.searchFiles(projectPath, searchOptions);

        if (results.length === 0) {
          CLIUtils.warning(`No files found matching glob pattern "${pattern}"`);
          return;
        }

        CLIUtils.success(`Found ${results.length} files matching glob pattern "${pattern}"`);

        // Format results for display
        const displayData = results.map((result, index) => ({
          '#': index + 1,
          'File': path.relative(projectPath, result.filePath),
          'Size': result.metadata?.size ? CLIUtils.formatBytes(result.metadata.size) : 'N/A',
          'Modified': result.metadata?.lastModified ? CLIUtils.formatDate(result.metadata.lastModified) : 'N/A',
          'Type': path.extname(result.filePath) || 'No ext'
        }));

        console.log('\n' + CLIUtils.formatOutput(displayData, options.format));

        // Show search metrics
        const metrics = fileSearchService.getPerformanceMetrics();
        CLIUtils.info(`Glob search completed in ${metrics.searchTime}ms (${metrics.filesScanned} files scanned)`);

      } catch (error) {
        logger.error({ err: error, pattern, options }, 'Glob search failed');

        if (error instanceof ValidationError) {
          CLIUtils.error(error.message);
        } else {
          CLIUtils.error('Failed to perform glob search. Check logs for details.');
        }
      }
    });
}

// Export the main command
export const searchCommand = createSearchCommand();

// Add help examples
searchCommand.addHelpText('after', `
Examples:
  $ vibe-tasks search files "auth" --extensions ts,js --limit 20
  $ vibe-tasks search content "useState" --extensions tsx,jsx --context 3
  $ vibe-tasks search glob "**/*.test.ts" --path ./src
  $ vibe-tasks search files "component" --strategy fuzzy --exclude node_modules,dist
`);
