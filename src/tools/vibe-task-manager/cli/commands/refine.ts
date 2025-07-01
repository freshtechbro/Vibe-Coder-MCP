import { Command } from 'commander';
import { getTaskRefinementService, TaskRefinementParams, RedecompositionParams } from '../../services/task-refinement-service.js';
import { CLIUtils } from './index.js';
import { TaskPriority, TaskType } from '../../types/task.js';
import logger from '../../../../logger.js';

/**
 * Task refinement command
 */
export const refineCommand = new Command('refine')
  .description('Refine and re-decompose tasks')
  .configureOutput({
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => process.stderr.write(str)
  });

/**
 * Refine task subcommand
 */
const refineTaskCommand = new Command('task')
  .description('Refine a task with new parameters')
  .argument('<taskId>', 'Task ID to refine')
  .option('-t, --title <title>', 'New task title')
  .option('-d, --description <description>', 'New task description')
  .option('--type <type>', 'New task type (development, testing, documentation, research)')
  .option('--priority <priority>', 'New priority (low, medium, high, critical)')
  .option('--hours <hours>', 'New estimated hours')
  .option('--files <files>', 'New file paths (comma-separated)')
  .option('--criteria <criteria>', 'New acceptance criteria (comma-separated)')
  .option('--tags <tags>', 'New tags (comma-separated)')
  .option('--dependencies <deps>', 'New dependencies (comma-separated)')
  .option('-f, --format <format>', 'Output format (table, json, yaml)', 'table')
  .action(async (taskId, options) => {
    try {
      logger.info({ command: 'refine task', taskId, options }, 'Refining task');

      // Prepare refinement parameters
      const refinements: TaskRefinementParams = {};

      if (options.title) refinements.title = options.title;
      if (options.description) refinements.description = options.description;
      if (options.type) {
        const validTypes: TaskType[] = ['development', 'testing', 'documentation', 'research'];
        if (!validTypes.includes(options.type as TaskType)) {
          CLIUtils.error(`Invalid type: ${options.type}. Must be one of: ${validTypes.join(', ')}`);
        }
        refinements.type = options.type as TaskType;
      }
      if (options.priority) {
        const validPriorities: TaskPriority[] = ['low', 'medium', 'high', 'critical'];
        if (!validPriorities.includes(options.priority as TaskPriority)) {
          CLIUtils.error(`Invalid priority: ${options.priority}. Must be one of: ${validPriorities.join(', ')}`);
        }
        refinements.priority = options.priority as TaskPriority;
      }

      if (options.hours) {
        const estimatedHours = parseFloat(options.hours);
        if (isNaN(estimatedHours) || estimatedHours < 0) {
          CLIUtils.error('Estimated hours must be a non-negative number');
        }
        refinements.estimatedHours = estimatedHours;
      }

      if (options.files) refinements.filePaths = CLIUtils.parseTags(options.files);
      if (options.criteria) refinements.acceptanceCriteria = CLIUtils.parseTags(options.criteria);
      if (options.tags) refinements.tags = CLIUtils.parseTags(options.tags);
      if (options.dependencies) refinements.dependencies = CLIUtils.parseTags(options.dependencies);

      // Check if any refinements provided
      if (Object.keys(refinements).length === 0) {
        CLIUtils.error('No refinement parameters provided');
      }

      // Refine task
      const refinementService = getTaskRefinementService();
      const result = await refinementService.refineTask(taskId, refinements, 'cli-user');

      if (!result.success) {
        CLIUtils.error(`Failed to refine task: ${result.error}`);
      }

      CLIUtils.success(`Task refined: ${taskId}`);

      // Display results
      console.log('\n--- Refinement Summary ---');
      const summaryData = {
        'Original Task': result.originalTask.id,
        'Was Decomposed': result.wasDecomposed ? 'Yes' : 'No',
        'Changes Made': result.changes.length,
        'Operation': result.metadata.operation,
        'Refined By': result.metadata.refinedBy,
        'Timestamp': CLIUtils.formatDate(result.metadata.timestamp)
      };

      console.log(CLIUtils.formatOutput(summaryData, options.format as 'table' | 'json' | 'yaml'));

      // Show changes
      if (result.changes.length > 0) {
        console.log('\n--- Changes Made ---');
        result.changes.forEach((change, index) => {
          console.log(`${index + 1}. ${change}`);
        });
      }

      // Show decomposed tasks if any
      if (result.wasDecomposed && result.decomposedTasks) {
        console.log('\n--- Decomposed Tasks ---');
        const decomposedData = result.decomposedTasks.map(task => ({
          ID: task.id,
          Title: CLIUtils.truncate(task.title, 40),
          Type: task.type,
          Priority: task.priority,
          'Est. Hours': task.estimatedHours,
          'Files': task.filePaths.length
        }));

        console.log(CLIUtils.formatOutput(decomposedData, options.format as 'table' | 'json' | 'yaml'));
        CLIUtils.info(`Task was decomposed into ${result.decomposedTasks.length} sub-tasks`);
      } else if (result.refinedTask) {
        console.log('\n--- Refined Task ---');
        const refinedData = {
          ID: result.refinedTask.id,
          Title: result.refinedTask.title,
          Type: result.refinedTask.type,
          Priority: result.refinedTask.priority,
          'Est. Hours': result.refinedTask.estimatedHours,
          'Updated At': CLIUtils.formatDate(result.refinedTask.updatedAt)
        };

        console.log(CLIUtils.formatOutput(refinedData, options.format as 'table' | 'json' | 'yaml'));
      }

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to refine task');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

/**
 * Re-decompose task subcommand
 */
const redecomposeCommand = new Command('decompose')
  .description('Force re-decomposition of a task')
  .argument('<taskId>', 'Task ID to re-decompose')
  .requiredOption('-r, --reason <reason>', 'Reason for re-decomposition')
  .option('--requirements <requirements>', 'New requirements description')
  .option('--changes <changes>', 'Context changes (comma-separated)')
  .option('--force', 'Force decomposition even if task seems atomic')
  .option('-f, --format <format>', 'Output format (table, json, yaml)', 'table')
  .action(async (taskId, options) => {
    try {
      logger.info({ command: 'refine decompose', taskId, options }, 'Re-decomposing task');

      // Prepare re-decomposition parameters
      const params: RedecompositionParams = {
        reason: options.reason,
        newRequirements: options.requirements,
        contextChanges: CLIUtils.parseTags(options.changes),
        forceDecomposition: options.force
      };

      // Re-decompose task
      const refinementService = getTaskRefinementService();
      const result = await refinementService.redecomposeTask(taskId, params, 'cli-user');

      if (!result.success) {
        CLIUtils.error(`Failed to re-decompose task: ${result.error}`);
      }

      CLIUtils.success(`Task re-decomposed: ${taskId}`);

      // Display results
      console.log('\n--- Re-decomposition Summary ---');
      const summaryData = {
        'Original Task': result.originalTask.id,
        'Was Decomposed': result.wasDecomposed ? 'Yes' : 'No',
        'Reason': params.reason,
        'Sub-tasks Created': result.decomposedTasks?.length || 0,
        'Operation': result.metadata.operation,
        'Refined By': result.metadata.refinedBy,
        'Timestamp': CLIUtils.formatDate(result.metadata.timestamp)
      };

      console.log(CLIUtils.formatOutput(summaryData, options.format as 'table' | 'json' | 'yaml'));

      // Show decomposed tasks
      if (result.decomposedTasks && result.decomposedTasks.length > 0) {
        console.log('\n--- Decomposed Tasks ---');
        const decomposedData = result.decomposedTasks.map(task => ({
          ID: task.id,
          Title: CLIUtils.truncate(task.title, 40),
          Type: task.type,
          Priority: task.priority,
          'Est. Hours': task.estimatedHours,
          'Files': task.filePaths.length,
          'Criteria': task.acceptanceCriteria.length
        }));

        console.log(CLIUtils.formatOutput(decomposedData, options.format as 'table' | 'json' | 'yaml'));
        CLIUtils.info(`Created ${result.decomposedTasks.length} atomic sub-tasks`);
      } else {
        CLIUtils.warning('No sub-tasks were created. Task may already be atomic.');
      }

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to re-decompose task');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

/**
 * Analyze task complexity subcommand
 */
const analyzeCommand = new Command('analyze')
  .description('Analyze task complexity and get refinement recommendations')
  .argument('<taskId>', 'Task ID to analyze')
  .option('-f, --format <format>', 'Output format (table, json, yaml)', 'table')
  .action(async (taskId, options) => {
    try {
      logger.info({ command: 'refine analyze', taskId, options }, 'Analyzing task complexity');

      // Analyze task complexity
      const refinementService = getTaskRefinementService();
      const result = await refinementService.analyzeTaskComplexity(taskId);

      if (!result.success) {
        CLIUtils.error(`Failed to analyze task: ${result.error}`);
      }

      const analysis = result.data!;

      // Display analysis results
      console.log('--- Task Complexity Analysis ---');
      const analysisData = {
        'Task ID': taskId,
        'Complexity Level': analysis.complexity.toUpperCase(),
        'Should Decompose': analysis.shouldDecompose ? 'Yes' : 'No',
        'Estimated Sub-tasks': analysis.estimatedSubTasks,
        'Recommendations Count': analysis.recommendations.length
      };

      console.log(CLIUtils.formatOutput(analysisData, options.format as 'table' | 'json' | 'yaml'));

      // Show recommendations
      if (analysis.recommendations.length > 0) {
        console.log('\n--- Recommendations ---');
        analysis.recommendations.forEach((recommendation, index) => {
          console.log(`${index + 1}. ${recommendation}`);
        });
      }

      // Provide action suggestions
      console.log('\n--- Suggested Actions ---');
      if (analysis.shouldDecompose) {
        CLIUtils.warning(`This task has ${analysis.complexity} complexity and should be decomposed.`);
        console.log(`Run: vibe-tasks refine decompose ${taskId} -r "High complexity task"`);
      } else {
        CLIUtils.success(`This task has ${analysis.complexity} complexity and appears to be appropriately sized.`);
      }

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to analyze task');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

/**
 * Bulk refine subcommand
 */
const bulkRefineCommand = new Command('bulk')
  .description('Bulk refine multiple tasks')
  .argument('<taskIds>', 'Comma-separated task IDs to refine')
  .option('-t, --title <title>', 'New task title (applied to all)')
  .option('--type <type>', 'New task type (applied to all)')
  .option('--priority <priority>', 'New priority (applied to all)')
  .option('--tags <tags>', 'New tags (applied to all, comma-separated)')
  .option('-f, --format <format>', 'Output format (table, json, yaml)', 'table')
  .action(async (taskIdsString, options) => {
    try {
      const taskIds = CLIUtils.parseTags(taskIdsString);
      
      if (taskIds.length === 0) {
        CLIUtils.error('No task IDs provided');
      }

      logger.info({ command: 'refine bulk', taskIds, options }, 'Bulk refining tasks');

      // Prepare refinement parameters
      const refinements: TaskRefinementParams = {};

      if (options.title) refinements.title = options.title;
      if (options.type) refinements.type = options.type as TaskType;
      if (options.priority) refinements.priority = options.priority as TaskPriority;
      if (options.tags) refinements.tags = CLIUtils.parseTags(options.tags);

      // Check if any refinements provided
      if (Object.keys(refinements).length === 0) {
        CLIUtils.error('No refinement parameters provided');
      }

      // Confirmation prompt
      const confirmed = await CLIUtils.confirm(
        `Are you sure you want to apply these refinements to ${taskIds.length} tasks?`, 
        false
      );
      
      if (!confirmed) {
        CLIUtils.info('Bulk refinement cancelled');
        return;
      }

      // Bulk refine tasks
      const refinementService = getTaskRefinementService();
      const results = await refinementService.bulkRefineTask(taskIds, refinements, 'cli-user');

      // Display results summary
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;
      const decomposedCount = results.filter(r => r.wasDecomposed).length;

      console.log('\n--- Bulk Refinement Summary ---');
      const summaryData = {
        'Total Tasks': results.length,
        'Successful': successCount,
        'Failed': failureCount,
        'Decomposed': decomposedCount,
        'Success Rate': `${Math.round((successCount / results.length) * 100)}%`
      };

      console.log(CLIUtils.formatOutput(summaryData, options.format as 'table' | 'json' | 'yaml'));

      // Show detailed results
      console.log('\n--- Detailed Results ---');
      const detailedData = results.map(result => ({
        'Task ID': result.originalTask.id || 'Unknown',
        'Status': result.success ? 'Success' : 'Failed',
        'Decomposed': result.wasDecomposed ? 'Yes' : 'No',
        'Changes': result.changes.length,
        'Error': result.error ? CLIUtils.truncate(result.error, 30) : 'None'
      }));

      console.log(CLIUtils.formatOutput(detailedData, options.format as 'table' | 'json' | 'yaml'));

      if (successCount > 0) {
        CLIUtils.success(`Successfully refined ${successCount} task(s)`);
      }
      
      if (failureCount > 0) {
        CLIUtils.warning(`Failed to refine ${failureCount} task(s)`);
      }

    } catch (error) {
      logger.error({ err: error, taskIdsString }, 'Failed to bulk refine tasks');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

// Add subcommands to refine command
refineCommand.addCommand(refineTaskCommand);
refineCommand.addCommand(redecomposeCommand);
refineCommand.addCommand(analyzeCommand);
refineCommand.addCommand(bulkRefineCommand);
