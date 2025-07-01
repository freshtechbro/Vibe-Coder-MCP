import { Command } from 'commander';
import { getEpicService, CreateEpicParams, UpdateEpicParams, EpicQueryParams } from '../../services/epic-service.js';
import { CLIUtils } from './index.js';
import { TaskPriority, TaskStatus } from '../../types/task.js';
import logger from '../../../../logger.js';

/**
 * Epic management command
 */
export const epicCommand = new Command('epic')
  .description('Manage epics (collections of related tasks)')
  .configureOutput({
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => process.stderr.write(str)
  });

/**
 * Create epic subcommand
 */
const createEpicCommand = new Command('create')
  .description('Create a new epic')
  .requiredOption('-t, --title <title>', 'Epic title')
  .requiredOption('-d, --description <description>', 'Epic description')
  .requiredOption('-p, --project <projectId>', 'Project ID')
  .option('--priority <priority>', 'Epic priority (low, medium, high, critical)', 'medium')
  .option('--hours <hours>', 'Estimated hours', '40')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--dependencies <deps>', 'Comma-separated dependency IDs')
  .option('-f, --format <format>', 'Output format (table, json, yaml)', 'table')
  .action(async (options) => {
    try {
      logger.info({ command: 'epic create', options }, 'Creating epic');

      // Validate priority
      const validPriorities: TaskPriority[] = ['low', 'medium', 'high', 'critical'];
      if (!validPriorities.includes(options.priority as TaskPriority)) {
        CLIUtils.error(`Invalid priority: ${options.priority}. Must be one of: ${validPriorities.join(', ')}`);
      }

      // Parse numeric values
      const estimatedHours = parseFloat(options.hours);
      if (isNaN(estimatedHours) || estimatedHours < 0) {
        CLIUtils.error('Estimated hours must be a non-negative number');
      }

      // Prepare create parameters
      const createParams: CreateEpicParams = {
        title: options.title,
        description: options.description,
        projectId: options.project,
        priority: options.priority as TaskPriority,
        estimatedHours,
        tags: CLIUtils.parseTags(options.tags),
        dependencies: CLIUtils.parseTags(options.dependencies)
      };

      // Create epic
      const epicService = getEpicService();
      const result = await epicService.createEpic(createParams, 'cli-user');

      if (!result.success) {
        CLIUtils.error(`Failed to create epic: ${result.error}`);
      }

      CLIUtils.success(`Epic created: ${result.data!.id}`);

      // Display epic details
      const displayData = {
        ID: result.data!.id,
        Title: result.data!.title,
        Project: result.data!.projectId,
        Priority: result.data!.priority,
        Status: result.data!.status,
        'Estimated Hours': result.data!.estimatedHours,
        'Created At': CLIUtils.formatDate(result.data!.metadata.createdAt),
        Tags: result.data!.metadata.tags.join(', ') || 'None'
      };

      console.log('\n' + CLIUtils.formatOutput(displayData, options.format as 'table' | 'json' | 'yaml'));

    } catch (error) {
      logger.error({ err: error }, 'Failed to create epic');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

/**
 * List epics subcommand
 */
const listEpicsCommand = new Command('list')
  .description('List epics')
  .option('-p, --project <projectId>', 'Filter by project ID')
  .option('--status <status>', 'Filter by status (pending, in_progress, completed, blocked, cancelled)')
  .option('--priority <priority>', 'Filter by priority (low, medium, high, critical)')
  .option('--tags <tags>', 'Filter by tags (comma-separated)')
  .option('--limit <limit>', 'Maximum number of epics to return', '20')
  .option('--offset <offset>', 'Number of epics to skip', '0')
  .option('-f, --format <format>', 'Output format (table, json, yaml)', 'table')
  .action(async (options) => {
    try {
      logger.info({ command: 'epic list', options }, 'Listing epics');

      // Parse numeric values
      const limit = parseInt(options.limit);
      const offset = parseInt(options.offset);

      if (isNaN(limit) || limit < 1) {
        CLIUtils.error('Limit must be a positive number');
      }

      if (isNaN(offset) || offset < 0) {
        CLIUtils.error('Offset must be a non-negative number');
      }

      // Prepare query parameters
      const queryParams: EpicQueryParams = {
        projectId: options.project,
        status: options.status as TaskStatus,
        priority: options.priority as TaskPriority,
        tags: CLIUtils.parseTags(options.tags),
        limit,
        offset
      };

      // List epics
      const epicService = getEpicService();
      const result = await epicService.listEpics(queryParams);

      if (!result.success) {
        CLIUtils.error(`Failed to list epics: ${result.error}`);
      }

      const epics = result.data!;

      if (epics.length === 0) {
        CLIUtils.info('No epics found matching the criteria');
        return;
      }

      // Format for display
      const displayData = epics.map(epic => ({
        ID: epic.id,
        Title: CLIUtils.truncate(epic.title, 40),
        Project: epic.projectId,
        Status: epic.status,
        Priority: epic.priority,
        Tasks: epic.taskIds.length,
        'Est. Hours': epic.estimatedHours,
        'Created': CLIUtils.formatDate(epic.metadata.createdAt).split(' ')[0], // Date only
        Tags: epic.metadata.tags.slice(0, 2).join(', ') + (epic.metadata.tags.length > 2 ? '...' : '')
      }));

      console.log(CLIUtils.formatOutput(displayData, options.format as 'table' | 'json' | 'yaml'));
      console.log(`\nShowing ${epics.length} epic(s)`);

    } catch (error) {
      logger.error({ err: error }, 'Failed to list epics');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

/**
 * Show epic details subcommand
 */
const showEpicCommand = new Command('show')
  .description('Show epic details')
  .argument('<epicId>', 'Epic ID to show')
  .option('--progress', 'Show progress information')
  .option('-f, --format <format>', 'Output format (table, json, yaml)', 'table')
  .action(async (epicId, options) => {
    try {
      logger.info({ command: 'epic show', epicId, options }, 'Showing epic details');

      const epicService = getEpicService();

      // Get epic details
      const epicResult = await epicService.getEpic(epicId);
      if (!epicResult.success) {
        CLIUtils.error(`Failed to get epic: ${epicResult.error}`);
      }

      const epic = epicResult.data!;

      // Basic epic information
      const displayData: Record<string, unknown> = {
        ID: epic.id,
        Title: epic.title,
        Description: epic.description,
        Project: epic.projectId,
        Status: epic.status,
        Priority: epic.priority,
        'Estimated Hours': epic.estimatedHours,
        'Task Count': epic.taskIds.length,
        'Created At': CLIUtils.formatDate(epic.metadata.createdAt),
        'Updated At': CLIUtils.formatDate(epic.metadata.updatedAt),
        'Created By': epic.metadata.createdBy,
        Tags: epic.metadata.tags.join(', ') || 'None',
        Dependencies: epic.dependencies.join(', ') || 'None',
        'Task IDs': epic.taskIds.join(', ') || 'None'
      };

      console.log(CLIUtils.formatOutput(displayData, options.format as 'table' | 'json' | 'yaml'));

      // Show progress if requested
      if (options.progress) {
        const progressResult = await epicService.getEpicProgress(epicId);
        if (progressResult.success) {
          const progress = progressResult.data!;
          
          console.log('\n--- Progress Information ---');
          const progressData = {
            'Total Tasks': progress.totalTasks,
            'Completed': progress.completedTasks,
            'In Progress': progress.inProgressTasks,
            'Pending': progress.pendingTasks,
            'Blocked': progress.blockedTasks,
            'Progress %': `${progress.progressPercentage}%`,
            'Estimated Hours': progress.estimatedHours,
            'Actual Hours': progress.actualHours,
            'Remaining Hours': progress.remainingHours
          };

          console.log(CLIUtils.formatOutput(progressData, options.format as 'table' | 'json' | 'yaml'));
        } else {
          CLIUtils.warning(`Could not get progress information: ${progressResult.error}`);
        }
      }

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to show epic');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

/**
 * Update epic subcommand
 */
const updateEpicCommand = new Command('update')
  .description('Update an epic')
  .argument('<epicId>', 'Epic ID to update')
  .option('-t, --title <title>', 'New epic title')
  .option('-d, --description <description>', 'New epic description')
  .option('--status <status>', 'New status (pending, in_progress, completed, blocked, cancelled)')
  .option('--priority <priority>', 'New priority (low, medium, high, critical)')
  .option('--hours <hours>', 'New estimated hours')
  .option('--tags <tags>', 'New tags (comma-separated)')
  .option('--dependencies <deps>', 'New dependencies (comma-separated)')
  .option('-f, --format <format>', 'Output format (table, json, yaml)', 'table')
  .action(async (epicId, options) => {
    try {
      logger.info({ command: 'epic update', epicId, options }, 'Updating epic');

      // Prepare update parameters
      const updateParams: UpdateEpicParams = {};

      if (options.title) updateParams.title = options.title;
      if (options.description) updateParams.description = options.description;
      if (options.status) updateParams.status = options.status as TaskStatus;
      if (options.priority) updateParams.priority = options.priority as TaskPriority;
      if (options.tags) updateParams.tags = CLIUtils.parseTags(options.tags);
      if (options.dependencies) updateParams.dependencies = CLIUtils.parseTags(options.dependencies);

      if (options.hours) {
        const estimatedHours = parseFloat(options.hours);
        if (isNaN(estimatedHours) || estimatedHours < 0) {
          CLIUtils.error('Estimated hours must be a non-negative number');
        }
        updateParams.estimatedHours = estimatedHours;
      }

      // Check if any updates provided
      if (Object.keys(updateParams).length === 0) {
        CLIUtils.error('No update parameters provided');
      }

      // Update epic
      const epicService = getEpicService();
      const result = await epicService.updateEpic(epicId, updateParams, 'cli-user');

      if (!result.success) {
        CLIUtils.error(`Failed to update epic: ${result.error}`);
      }

      CLIUtils.success(`Epic updated: ${epicId}`);

      // Display updated epic details
      const displayData = {
        ID: result.data!.id,
        Title: result.data!.title,
        Status: result.data!.status,
        Priority: result.data!.priority,
        'Estimated Hours': result.data!.estimatedHours,
        'Updated At': CLIUtils.formatDate(result.data!.metadata.updatedAt),
        Tags: result.data!.metadata.tags.join(', ') || 'None'
      };

      console.log('\n' + CLIUtils.formatOutput(displayData, options.format as 'table' | 'json' | 'yaml'));

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to update epic');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

/**
 * Delete epic subcommand
 */
const deleteEpicCommand = new Command('delete')
  .description('Delete an epic')
  .argument('<epicId>', 'Epic ID to delete')
  .option('--force', 'Skip confirmation prompt')
  .action(async (epicId, options) => {
    try {
      logger.info({ command: 'epic delete', epicId, options }, 'Deleting epic');

      // Confirmation prompt unless forced
      if (!options.force) {
        const confirmed = await CLIUtils.confirm(`Are you sure you want to delete epic ${epicId}?`, false);
        if (!confirmed) {
          CLIUtils.info('Epic deletion cancelled');
          return;
        }
      }

      // Delete epic
      const epicService = getEpicService();
      const result = await epicService.deleteEpic(epicId, 'cli-user');

      if (!result.success) {
        CLIUtils.error(`Failed to delete epic: ${result.error}`);
      }

      CLIUtils.success(`Epic deleted: ${epicId}`);

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to delete epic');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

// Add subcommands to epic command
epicCommand.addCommand(createEpicCommand);
epicCommand.addCommand(listEpicsCommand);
epicCommand.addCommand(showEpicCommand);
epicCommand.addCommand(updateEpicCommand);
epicCommand.addCommand(deleteEpicCommand);
