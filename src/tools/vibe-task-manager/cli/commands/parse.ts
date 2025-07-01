import { Command } from 'commander';
import { PRDIntegrationService } from '../../integrations/prd-integration.js';
import { TaskListIntegrationService } from '../../integrations/task-list-integration.js';
import { getProjectOperations } from '../../core/operations/project-operations.js';
import { CLIUtils } from './index.js';
import logger from '../../../../logger.js';

/**
 * Parse command for PRDs and task lists
 */
export const parseCommand = new Command('parse')
  .description('Parse existing PRDs and task lists from generators')
  .configureHelp({
    sortSubcommands: true
  });

/**
 * Parse PRD subcommand
 */
const parsePRDCommand = new Command('prd')
  .description('Parse an existing PRD from prd-generator')
  .option('-p, --project <name>', 'Project name to filter PRDs')
  .option('-f, --file <path>', 'Specific PRD file path')
  .option('--format <format>', 'Output format (table|json|yaml)', 'table')
  .option('--create-project', 'Create project from PRD after parsing', false)
  .action(async (options) => {
    try {
      logger.info({ options }, 'Parsing PRD via CLI');

      // Get PRD integration service
      const prdService = PRDIntegrationService.getInstance();

      // Detect or parse PRD
      let prdInfo;
      if (options.file) {
        // Use specific file path
        CLIUtils.info(`Parsing PRD from: ${options.file}`);
        const result = await prdService.parsePRD(options.file);
        if (!result.success) {
          CLIUtils.error(`Failed to parse PRD: ${result.error}`);
        }
        prdInfo = result.prdData!;
      } else {
        // Auto-detect PRD
        CLIUtils.info(`Detecting existing PRD${options.project ? ` for project "${options.project}"` : ''}...`);
        const detectedPRD = await prdService.detectExistingPRD(options.project);
        if (!detectedPRD) {
          CLIUtils.error(`No PRD found${options.project ? ` for project "${options.project}"` : ''}. Please ensure a PRD exists in the VibeCoderOutput/prd-generator/ directory.`);
        }

        CLIUtils.info(`Found PRD: ${detectedPRD.fileName}`);
        const result = await prdService.parsePRD(detectedPRD.filePath);
        if (!result.success) {
          CLIUtils.error(`Failed to parse PRD: ${result.error}`);
        }
        prdInfo = result.prdData!;
      }

      // Display PRD information
      CLIUtils.success('PRD parsed successfully!');
      
      const displayData = {
        'Project Name': prdInfo.metadata.projectName,
        'File Path': prdInfo.metadata.filePath,
        'File Size': `${(prdInfo.metadata.fileSize / 1024).toFixed(1)} KB`,
        'Created At': CLIUtils.formatDate(prdInfo.metadata.createdAt),
        'Features Count': prdInfo.features.length,
        'Tech Stack': prdInfo.technical.techStack.slice(0, 3).join(', ') + (prdInfo.technical.techStack.length > 3 ? '...' : ''),
        'Business Goals': prdInfo.overview.businessGoals.length,
        'Product Goals': prdInfo.overview.productGoals.length
      };

      console.log('\nPRD Details:');
      console.log(CLIUtils.formatOutput(displayData, options.format));

      // Show features
      if (prdInfo.features.length > 0) {
        console.log('\nFeatures:');
        prdInfo.features.slice(0, 10).forEach((feature, index) => {
          console.log(`  ${index + 1}. ${feature.title} (${feature.priority})`);
        });
        if (prdInfo.features.length > 10) {
          console.log(`  ... and ${prdInfo.features.length - 10} more features`);
        }
      }

      // Create project if requested
      if (options.createProject) {
        CLIUtils.info('Creating project from PRD...');
        const projectOperations = getProjectOperations();
        const projectResult = await projectOperations.createProjectFromPRD(prdInfo as unknown as Record<string, unknown>, 'cli-user');

        if (!projectResult.success) {
          CLIUtils.error(`Failed to create project from PRD: ${projectResult.error}`);
        }

        const project = projectResult.data!;
        CLIUtils.success(`Project created: ${project.id} - ${project.name}`);
      }

      logger.info({ projectName: prdInfo.metadata.projectName }, 'PRD parsed successfully via CLI');

    } catch (error) {
      logger.error({ err: error, options }, 'Failed to parse PRD via CLI');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

/**
 * Parse task list subcommand
 */
const parseTasksCommand = new Command('tasks')
  .description('Parse an existing task list from task-list-generator')
  .option('-p, --project <name>', 'Project name to filter task lists')
  .option('-f, --file <path>', 'Specific task list file path')
  .option('--format <format>', 'Output format (table|json|yaml)', 'table')
  .option('--create-project', 'Create project from task list after parsing', false)
  .action(async (options) => {
    try {
      logger.info({ options }, 'Parsing task list via CLI');

      // Get task list integration service
      const taskListService = TaskListIntegrationService.getInstance();

      // Detect or parse task list
      let taskListInfo;
      if (options.file) {
        // Use specific file path
        CLIUtils.info(`Parsing task list from: ${options.file}`);
        const result = await taskListService.parseTaskList(options.file);
        if (!result.success) {
          CLIUtils.error(`Failed to parse task list: ${result.error}`);
        }
        taskListInfo = result.taskListData!;
      } else {
        // Auto-detect task list
        CLIUtils.info(`Detecting existing task list${options.project ? ` for project "${options.project}"` : ''}...`);
        const detectedTaskList = await taskListService.detectExistingTaskList(options.project);
        if (!detectedTaskList) {
          CLIUtils.error(`No task list found${options.project ? ` for project "${options.project}"` : ''}. Please ensure a task list exists in the VibeCoderOutput/generated_task_lists/ directory.`);
        }

        CLIUtils.info(`Found task list: ${detectedTaskList.fileName}`);
        const result = await taskListService.parseTaskList(detectedTaskList.filePath);
        if (!result.success) {
          CLIUtils.error(`Failed to parse task list: ${result.error}`);
        }
        taskListInfo = result.taskListData!;
      }

      // Display task list information
      CLIUtils.success('Task list parsed successfully!');
      
      const displayData = {
        'Project Name': taskListInfo.metadata.projectName,
        'File Path': taskListInfo.metadata.filePath,
        'File Size': `${(taskListInfo.metadata.fileSize / 1024).toFixed(1)} KB`,
        'Created At': CLIUtils.formatDate(taskListInfo.metadata.createdAt),
        'Total Tasks': taskListInfo.metadata.totalTasks,
        'Phases': taskListInfo.metadata.phaseCount,
        'Estimated Hours': taskListInfo.statistics.totalEstimatedHours,
        'List Type': taskListInfo.metadata.listType
      };

      console.log('\nTask List Details:');
      console.log(CLIUtils.formatOutput(displayData, options.format));

      // Show phases
      if (taskListInfo.phases.length > 0) {
        console.log('\nPhases:');
        taskListInfo.phases.forEach((phase, index) => {
          console.log(`  ${index + 1}. ${phase.name} (${phase.tasks.length} tasks)`);
        });
      }

      // Create project if requested
      if (options.createProject) {
        CLIUtils.info('Creating project from task list...');
        const projectOperations = getProjectOperations();
        const projectResult = await projectOperations.createProjectFromTaskList(taskListInfo as unknown as Record<string, unknown>, 'cli-user');

        if (!projectResult.success) {
          CLIUtils.error(`Failed to create project from task list: ${projectResult.error}`);
        }

        const project = projectResult.data!;
        CLIUtils.success(`Project created: ${project.id} - ${project.name}`);

        // Convert to atomic tasks
        const atomicTasks = await taskListService.convertToAtomicTasks(
          taskListInfo,
          project.id,
          'default-epic',
          'cli-user'
        );
        CLIUtils.info(`Created ${atomicTasks.length} atomic tasks`);
      }

      logger.info({ projectName: taskListInfo.metadata.projectName }, 'Task list parsed successfully via CLI');

    } catch (error) {
      logger.error({ err: error, options }, 'Failed to parse task list via CLI');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

// Add subcommands to parse command
parseCommand.addCommand(parsePRDCommand);
parseCommand.addCommand(parseTasksCommand);

// Add help examples
parseCommand.addHelpText('after', `
Examples:
  # Parse PRD files
  $ vibe-tasks parse prd --project "E-commerce Platform" --create-project
  $ vibe-tasks parse prd --file "/path/to/ecommerce-prd.md"
  $ vibe-tasks parse prd --project "My Web App" --format json

  # Parse task list files
  $ vibe-tasks parse tasks --project "Mobile App" --create-project
  $ vibe-tasks parse tasks --file "/path/to/mobile-task-list-detailed.md"
  $ vibe-tasks parse tasks --project "E-commerce Platform" --format yaml

  # Auto-discovery (searches VibeCoderOutput directories)
  $ vibe-tasks parse prd --project "My Project"
  $ vibe-tasks parse tasks --project "My Project"

  # Import with specific file paths
  $ vibe-tasks parse prd --file "VibeCoderOutput/prd-generator/ecommerce-prd.md"
  $ vibe-tasks parse tasks --file "VibeCoderOutput/generated_task_lists/mobile-task-list-detailed.md"
`);
