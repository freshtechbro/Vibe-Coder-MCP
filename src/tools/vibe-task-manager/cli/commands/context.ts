/**
 * Context CLI Commands
 *
 * Implements CLI commands for context enrichment and analysis using the
 * existing ContextEnrichmentService infrastructure.
 */

import { Command } from 'commander';
import { ContextEnrichmentService } from '../../services/context-enrichment-service.js';
import { getTaskOperations } from '../../core/operations/task-operations.js';
import { getProjectOperations } from '../../core/operations/project-operations.js';
import { CLIUtils } from './index.js';
import { ValidationError } from '../../../../utils/errors.js';
import logger from '../../../../logger.js';
import path from 'path';

/**
 * Create context command group
 */
export function createContextCommand(): Command {
  const contextCmd = new Command('context');

  contextCmd
    .description('Gather and analyze context for tasks and projects')
    .configureOutput({
      writeOut: (str) => process.stdout.write(str),
      writeErr: (str) => process.stderr.write(str)
    });

  // Add subcommands
  contextCmd.addCommand(createEnrichCommand());
  contextCmd.addCommand(createAnalyzeCommand());
  contextCmd.addCommand(createGatherCommand());

  return contextCmd;
}

/**
 * Enrich task context
 */
function createEnrichCommand(): Command {
  return new Command('enrich')
    .description('Enrich context for a specific task')
    .argument('<taskId>', 'Task ID to enrich context for')
    .option('-p, --path <path>', 'Project path to search in', process.cwd())
    .option('-m, --max-files <number>', 'Maximum files to include', '20')
    .option('-s, --max-size <size>', 'Maximum content size in KB', '500')
    .option('-k, --keywords <keywords>', 'Additional keywords (comma-separated)')
    .option('-t, --types <types>', 'File types to prioritize (comma-separated)')
    .option('-f, --format <format>', 'Output format (table|json|yaml)', 'table')
    .action(async (taskId, options) => {
      try {
        logger.info({ command: 'context enrich', taskId, options }, 'Starting context enrichment');

        // Validate task exists
        const taskOperations = getTaskOperations();
        const taskResult = await taskOperations.getTask(taskId);

        if (!taskResult.success) {
          CLIUtils.error(`Task not found: ${taskResult.error}`);
          return;
        }

        const task = taskResult.data!;
        CLIUtils.info(`Enriching context for task: ${task.title}`);

        // Initialize context enrichment service
        const contextService = ContextEnrichmentService.getInstance();

        // Parse options
        const projectPath = path.resolve(options.path);
        const maxFiles = parseInt(options.maxFiles, 10);
        const maxContentSize = parseInt(options.maxSize, 10) * 1024; // Convert KB to bytes
        const additionalKeywords = options.keywords ? options.keywords.split(',').map((k: string) => k.trim()) : [];
        const priorityFileTypes = options.types ? options.types.split(',').map((t: string) => t.trim()) : [];

        // Create context request
        const contextRequest = {
          taskDescription: task.description || task.title,
          projectPath,
          maxFiles,
          maxContentSize,
          searchPatterns: [...(task.tags || []), ...additionalKeywords],
          priorityFileTypes: priorityFileTypes.length > 0 ? priorityFileTypes : ['.ts', '.js', '.tsx', '.jsx'],
          excludeDirs: ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'],
          contentKeywords: [
            ...additionalKeywords,
            ...(task.title.split(' ').filter(word => word.length > 3)),
            ...(task.description?.split(' ').filter(word => word.length > 3) || [])
          ]
        };

        CLIUtils.info('Gathering relevant context files...');

        // Gather context
        const contextResult = await contextService.gatherContext(contextRequest);

        if (contextResult.contextFiles.length === 0) {
          CLIUtils.warning('No relevant context files found');
          return;
        }

        CLIUtils.success(`Found ${contextResult.contextFiles.length} relevant files`);

        // Format results for display
        const displayData = contextResult.contextFiles.map((file, index) => ({
          '#': index + 1,
          'File': CLIUtils.truncate(path.relative(projectPath, file.filePath), 50),
          'Relevance': file.relevance.overallScore.toFixed(3),
          'Size': CLIUtils.formatBytes(file.charCount),
          'Type': file.extension,
          'Keywords': 'N/A' // Keywords not available in RelevanceFactors
        }));

        console.log('\n' + CLIUtils.formatOutput(displayData, options.format));

        // Show context summary
        console.log('\nContext Summary:');
        const summary = contextResult.summary;
        CLIUtils.info(`Total files: ${summary.totalFiles}`);
        CLIUtils.info(`Total size: ${CLIUtils.formatBytes(summary.totalSize)}`);
        CLIUtils.info(`Average relevance: ${summary.averageRelevance.toFixed(3)}`);
        CLIUtils.info(`File types: ${summary.topFileTypes.join(', ')}`);

        // Show metrics
        const metrics = contextResult.metrics;
        CLIUtils.info(`Context gathering completed in ${metrics.totalTime}ms`);

      } catch (error) {
        logger.error({ err: error, taskId, options }, 'Context enrichment failed');

        if (error instanceof ValidationError) {
          CLIUtils.error(error.message);
        } else {
          CLIUtils.error('Failed to enrich context. Check logs for details.');
        }
      }
    });
}

/**
 * Analyze project context
 */
function createAnalyzeCommand(): Command {
  return new Command('analyze')
    .description('Analyze context for a project or directory')
    .argument('<target>', 'Project ID or directory path to analyze')
    .option('-d, --description <description>', 'Analysis focus description')
    .option('-m, --max-files <number>', 'Maximum files to analyze', '50')
    .option('-t, --types <types>', 'File types to include (comma-separated)')
    .option('-x, --exclude <patterns>', 'Patterns to exclude (comma-separated)')
    .option('-f, --format <format>', 'Output format (table|json|yaml)', 'table')
    .action(async (target, options) => {
      try {
        logger.info({ command: 'context analyze', target, options }, 'Starting context analysis');

        let projectPath: string;
        let analysisDescription: string;

        // Determine if target is a project ID or path
        if (target.startsWith('PID-') || target.length < 10) {
          // Assume it's a project ID
          const projectOperations = getProjectOperations();
          const projectResult = await projectOperations.getProject(target);

          if (!projectResult.success) {
            CLIUtils.error(`Project not found: ${projectResult.error}`);
            return;
          }

          const project = projectResult.data!;
          projectPath = project.rootPath;
          analysisDescription = options.description || `Analysis of ${project.name}`;
          CLIUtils.info(`Analyzing project: ${project.name}`);
        } else {
          // Assume it's a directory path
          projectPath = path.resolve(target);
          analysisDescription = options.description || `Analysis of ${path.basename(projectPath)}`;
          CLIUtils.info(`Analyzing directory: ${projectPath}`);
        }

        // Initialize context enrichment service
        const contextService = ContextEnrichmentService.getInstance();

        // Parse options
        const maxFiles = parseInt(options.maxFiles, 10);
        const fileTypes = options.types ? options.types.split(',').map((t: string) => t.trim()) : [];
        const excludePatterns = options.exclude ? options.exclude.split(',').map((p: string) => p.trim()) : [];

        // Create context request for analysis
        const contextRequest = {
          taskDescription: analysisDescription,
          projectPath,
          maxFiles,
          maxContentSize: 1024 * 1024, // 1MB
          searchPatterns: ['*'], // Include all files
          priorityFileTypes: fileTypes.length > 0 ? fileTypes : ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cpp'],
          excludeDirs: ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', ...excludePatterns],
          contentKeywords: analysisDescription.split(' ').filter(word => word.length > 3)
        };

        CLIUtils.info('Analyzing project structure and content...');

        // Gather context for analysis
        const contextResult = await contextService.gatherContext(contextRequest);

        if (contextResult.contextFiles.length === 0) {
          CLIUtils.warning('No files found for analysis');
          return;
        }

        CLIUtils.success(`Analyzed ${contextResult.contextFiles.length} files`);

        // Create analysis summary
        const filesByType = contextResult.contextFiles.reduce((acc, file) => {
          const ext = file.extension || 'no-ext';
          acc[ext] = (acc[ext] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const sizeByType = contextResult.contextFiles.reduce((acc, file) => {
          const ext = file.extension || 'no-ext';
          acc[ext] = (acc[ext] || 0) + file.charCount;
          return acc;
        }, {} as Record<string, number>);

        // Format analysis results
        const analysisData = Object.entries(filesByType).map(([type, count]) => ({
          'File Type': type,
          'Count': count,
          'Total Size': CLIUtils.formatBytes(sizeByType[type]),
          'Avg Size': CLIUtils.formatBytes(Math.round(sizeByType[type] / count)),
          'Percentage': `${((count / contextResult.contextFiles.length) * 100).toFixed(1)}%`
        }));

        console.log('\nProject Analysis:');
        console.log(CLIUtils.formatOutput(analysisData, options.format));

        // Show overall statistics
        console.log('\nOverall Statistics:');
        const summary = contextResult.summary;
        CLIUtils.info(`Total files analyzed: ${summary.totalFiles}`);
        CLIUtils.info(`Total codebase size: ${CLIUtils.formatBytes(summary.totalSize)}`);
        CLIUtils.info(`Average file size: ${CLIUtils.formatBytes(Math.round(summary.totalSize / summary.totalFiles))}`);
        CLIUtils.info(`Largest file: ${CLIUtils.formatBytes(Math.max(...contextResult.contextFiles.map(f => f.charCount)))}`);

        // Show complexity indicators
        const complexityIndicators = {
          'High complexity files (>10KB)': contextResult.contextFiles.filter(f => f.charCount > 10240).length,
          'Medium complexity files (2-10KB)': contextResult.contextFiles.filter(f => f.charCount >= 2048 && f.charCount <= 10240).length,
          'Simple files (<2KB)': contextResult.contextFiles.filter(f => f.charCount < 2048).length
        };

        console.log('\nComplexity Distribution:');
        Object.entries(complexityIndicators).forEach(([category, count]) => {
          CLIUtils.info(`${category}: ${count}`);
        });

        // Show metrics
        const metrics = contextResult.metrics;
        CLIUtils.info(`Analysis completed in ${metrics.totalTime}ms`);

      } catch (error) {
        logger.error({ err: error, target, options }, 'Context analysis failed');

        if (error instanceof ValidationError) {
          CLIUtils.error(error.message);
        } else {
          CLIUtils.error('Failed to analyze context. Check logs for details.');
        }
      }
    });
}

/**
 * Gather context for custom description
 */
function createGatherCommand(): Command {
  return new Command('gather')
    .description('Gather context for a custom description or query')
    .argument('<description>', 'Description of what context to gather')
    .option('-p, --path <path>', 'Project path to search in', process.cwd())
    .option('-m, --max-files <number>', 'Maximum files to include', '15')
    .option('-k, --keywords <keywords>', 'Specific keywords (comma-separated)')
    .option('-t, --types <types>', 'File types to prioritize (comma-separated)')
    .option('-f, --format <format>', 'Output format (table|json|yaml)', 'table')
    .action(async (description, options) => {
      try {
        logger.info({ command: 'context gather', description, options }, 'Starting context gathering');

        // Initialize context enrichment service
        const contextService = ContextEnrichmentService.getInstance();

        // Parse options
        const projectPath = path.resolve(options.path);
        const maxFiles = parseInt(options.maxFiles, 10);
        const keywords = options.keywords ? options.keywords.split(',').map((k: string) => k.trim()) : [];
        const priorityFileTypes = options.types ? options.types.split(',').map((t: string) => t.trim()) : [];

        CLIUtils.info(`Gathering context for: "${description}"`);

        // Create context request
        const contextRequest = {
          taskDescription: description,
          projectPath,
          maxFiles,
          maxContentSize: 512 * 1024, // 512KB
          searchPatterns: [...keywords, ...description.split(' ').filter((word: string) => word.length > 3)],
          priorityFileTypes: priorityFileTypes.length > 0 ? priorityFileTypes : ['.ts', '.js', '.tsx', '.jsx'],
          excludeDirs: ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'],
          contentKeywords: [...keywords, ...description.split(' ').filter((word: string) => word.length > 3)]
        };

        // Gather context
        const contextResult = await contextService.gatherContext(contextRequest);

        if (contextResult.contextFiles.length === 0) {
          CLIUtils.warning('No relevant context found for the given description');
          return;
        }

        CLIUtils.success(`Found ${contextResult.contextFiles.length} relevant files`);

        // Format results
        const displayData = contextResult.contextFiles.map((file, index) => ({
          '#': index + 1,
          'File': CLIUtils.truncate(path.relative(projectPath, file.filePath), 45),
          'Relevance': file.relevance.overallScore.toFixed(3),
          'Size': CLIUtils.formatBytes(file.charCount),
          'Matches': 'N/A', // Keyword matches not available in RelevanceFactors
          'Type': file.extension
        }));

        console.log('\n' + CLIUtils.formatOutput(displayData, options.format));

        // Create and show context summary
        const contextSummary = await contextService.createContextSummary(contextResult);

        console.log('\nContext Summary:');
        console.log(contextSummary);

        // Show gathering metrics
        const metrics = contextResult.metrics;
        CLIUtils.info(`Context gathering completed in ${metrics.totalTime}ms`);

      } catch (error) {
        logger.error({ err: error, description, options }, 'Context gathering failed');

        if (error instanceof ValidationError) {
          CLIUtils.error(error.message);
        } else {
          CLIUtils.error('Failed to gather context. Check logs for details.');
        }
      }
    });
}

// Export the main command
export const contextCommand = createContextCommand();

// Add help examples
contextCommand.addHelpText('after', `
Examples:
  $ vibe-tasks context enrich T001 --max-files 25 --keywords auth,login
  $ vibe-tasks context analyze PID-WEBAPP-001 --types ts,tsx --max-files 100
  $ vibe-tasks context gather "React component testing" --keywords test,component
  $ vibe-tasks context analyze ./src --exclude test,spec --types js,ts
`);
