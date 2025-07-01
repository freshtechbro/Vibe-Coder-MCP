import { Command } from 'commander';
import { getProjectOperations } from '../../core/operations/project-operations.js';
import { getTaskOperations } from '../../core/operations/task-operations.js';
import { getDependencyOperations } from '../../core/operations/dependency-operations.js';
import { CLIUtils } from './index.js';
import logger from '../../../../logger.js';

/**
 * Open command for viewing detailed information about projects, epics, and tasks
 */
export const openCommand = new Command('open')
  .description('Open and view detailed information about projects, epics, or tasks')
  .configureHelp({
    sortSubcommands: true
  });

/**
 * Open project subcommand
 */
const openProjectCommand = new Command('project')
  .description('View detailed project information')
  .argument('<projectId>', 'Project ID to open')
  .option('--format <format>', 'Output format (table|json|yaml)', 'table')
  .option('--show-tasks', 'Include task summary')
  .option('--show-dependencies', 'Include dependency graph summary')
  .action(async (projectId: string, options) => {
    try {
      logger.info({ projectId, options }, 'Opening project via CLI');

      // Get project details
      const projectOperations = getProjectOperations();
      const projectResult = await projectOperations.getProject(projectId);

      if (!projectResult.success) {
        CLIUtils.error(`Failed to get project: ${projectResult.error}`);
      }

      const project = projectResult.data!;

      // Display project information
      console.log(`Project: ${project.name}\n`);

      if (options.format === 'table') {
        // Basic project information
        const basicInfo = {
          'ID': project.id,
          'Name': project.name,
          'Description': project.description,
          'Status': project.status,
          'Root Path': project.rootPath,
          'Created At': CLIUtils.formatDate(project.metadata.createdAt),
          'Updated At': CLIUtils.formatDate(project.metadata.updatedAt),
          'Created By': project.metadata.createdBy || 'Unknown',
          'Tags': project.metadata.tags.join(', ') || 'None'
        };

        console.log('Basic Information:');
        console.log(CLIUtils.formatOutput(basicInfo, 'table'));

        // Tech stack information
        if (project.techStack.languages.length > 0 || 
            project.techStack.frameworks.length > 0 || 
            project.techStack.tools.length > 0) {
          console.log('\nTech Stack:');
          const techStackInfo = {
            'Languages': project.techStack.languages.join(', ') || 'None',
            'Frameworks': project.techStack.frameworks.join(', ') || 'None',
            'Tools': project.techStack.tools.join(', ') || 'None'
          };
          console.log(CLIUtils.formatOutput(techStackInfo, 'table'));
        }

        // Configuration information
        console.log('\nConfiguration:');
        const configInfo = {
          'Max Concurrent Tasks': project.config.maxConcurrentTasks,
          'Default Task Template': project.config.defaultTaskTemplate,
          'Max Agents': project.config.agentConfig.maxAgents,
          'Default Agent': project.config.agentConfig.defaultAgent,
          'Max Response Time': `${project.config.performanceTargets.maxResponseTime}ms`,
          'Max Memory Usage': `${project.config.performanceTargets.maxMemoryUsage}MB`,
          'Min Test Coverage': `${project.config.performanceTargets.minTestCoverage}%`
        };
        console.log(CLIUtils.formatOutput(configInfo, 'table'));

      } else {
        console.log(CLIUtils.formatOutput(project, options.format));
      }

      // Show task summary if requested
      if (options.showTasks) {
        try {
          const taskOperations = getTaskOperations();
          const tasksResult = await taskOperations.listTasks({ projectId });

          if (tasksResult.success) {
            const tasks = tasksResult.data!;
            console.log(`\nTask Summary (${tasks.length} tasks):`);

            if (tasks.length > 0) {
              const taskSummary = tasks.reduce((acc, task) => {
                acc[task.status] = (acc[task.status] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);

              console.log(CLIUtils.formatOutput(taskSummary, 'table'));

              // Show recent tasks
              const recentTasks = tasks
                .sort((a, b) => new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime())
                .slice(0, 5);

              if (recentTasks.length > 0) {
                console.log('\nRecent Tasks:');
                const recentTasksData = recentTasks.map(task => ({
                  ID: task.id,
                  Title: CLIUtils.truncate(task.title, 40),
                  Status: task.status,
                  Priority: task.priority,
                  'Created': CLIUtils.formatDate(task.metadata.createdAt).split(' ')[0]
                }));
                console.log(CLIUtils.formatOutput(recentTasksData, 'table'));
              }
            } else {
              CLIUtils.info('No tasks found for this project.');
            }
          }
        } catch {
          CLIUtils.warning('Failed to load task summary');
        }
      }

      // Show dependency graph summary if requested
      if (options.showDependencies) {
        try {
          const dependencyOperations = getDependencyOperations();
          const graphResult = await dependencyOperations.loadDependencyGraph(projectId);

          if (graphResult.success) {
            const graph = graphResult.data!;
            console.log('\nDependency Graph Summary:');
            
            const graphSummary = {
              'Total Tasks': graph.nodes.size,
              'Total Dependencies': graph.edges.length,
              'Execution Order Length': graph.executionOrder.length,
              'Critical Path Length': graph.criticalPath.length,
              'Generated At': CLIUtils.formatDate(graph.metadata.generatedAt)
            };
            console.log(CLIUtils.formatOutput(graphSummary, 'table'));

            if (graph.criticalPath.length > 0) {
              console.log('\nCritical Path:');
              graph.criticalPath.forEach((taskId, index) => {
                const node = graph.nodes.get(taskId);
                if (node) {
                  console.log(`  ${index + 1}. ${taskId}: ${CLIUtils.truncate(node.title, 50)}`);
                }
              });
            }
          } else {
            CLIUtils.info('No dependency graph found. Generate one with dependency analysis.');
          }
        } catch {
          CLIUtils.warning('Failed to load dependency graph summary');
        }
      }

      logger.info({ projectId }, 'Opened project successfully via CLI');

    } catch (error) {
      logger.error({ err: error, projectId }, 'Failed to open project via CLI');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

/**
 * Open task subcommand
 */
const openTaskCommand = new Command('task')
  .description('View detailed task information')
  .argument('<taskId>', 'Task ID to open')
  .option('--format <format>', 'Output format (table|json|yaml)', 'table')
  .option('--show-dependencies', 'Include task dependencies')
  .action(async (taskId: string, options) => {
    try {
      logger.info({ taskId, options }, 'Opening task via CLI');

      // Get task details
      const taskOperations = getTaskOperations();
      const taskResult = await taskOperations.getTask(taskId);

      if (!taskResult.success) {
        CLIUtils.error(`Failed to get task: ${taskResult.error}`);
      }

      const task = taskResult.data!;

      // Display task information
      console.log(`Task: ${task.title}\n`);

      if (options.format === 'table') {
        // Basic task information
        const basicInfo = {
          'ID': task.id,
          'Title': task.title,
          'Description': task.description,
          'Status': task.status,
          'Priority': task.priority,
          'Type': task.type,
          'Project ID': task.projectId,
          'Epic ID': task.epicId,
          'Estimated Hours': task.estimatedHours,
          'Assigned Agent': task.assignedAgent || 'None',
          'Created At': CLIUtils.formatDate(task.metadata.createdAt),
          'Updated At': CLIUtils.formatDate(task.metadata.updatedAt),
          'Created By': task.metadata.createdBy || 'Unknown',
          'Tags': task.metadata.tags.join(', ') || 'None'
        };

        console.log('Basic Information:');
        console.log(CLIUtils.formatOutput(basicInfo, 'table'));

        // File paths
        if (task.filePaths.length > 0) {
          console.log('\nFile Paths:');
          task.filePaths.forEach((filePath, index) => {
            console.log(`  ${index + 1}. ${filePath}`);
          });
        }

        // Acceptance criteria
        if (task.acceptanceCriteria.length > 0) {
          console.log('\nAcceptance Criteria:');
          task.acceptanceCriteria.forEach((criteria, index) => {
            console.log(`  ${index + 1}. ${criteria}`);
          });
        }

        // Testing requirements
        console.log('\nTesting Requirements:');
        const testingInfo = {
          'Coverage Target': `${task.testingRequirements.coverageTarget}%`,
          'Unit Tests': task.testingRequirements.unitTests.length || 'None defined',
          'Integration Tests': task.testingRequirements.integrationTests.length || 'None defined',
          'Performance Tests': task.testingRequirements.performanceTests.length || 'None defined'
        };
        console.log(CLIUtils.formatOutput(testingInfo, 'table'));

        // Quality criteria
        console.log('\nQuality Criteria:');
        const qualityInfo = {
          'TypeScript': task.qualityCriteria.typeScript ? 'Required' : 'Not required',
          'ESLint': task.qualityCriteria.eslint ? 'Required' : 'Not required',
          'Code Quality': task.qualityCriteria.codeQuality.join(', ') || 'None',
          'Documentation': task.qualityCriteria.documentation.join(', ') || 'None'
        };
        console.log(CLIUtils.formatOutput(qualityInfo, 'table'));

      } else {
        console.log(CLIUtils.formatOutput(task, options.format));
      }

      // Show dependencies if requested
      if (options.showDependencies) {
        try {
          const dependencyOperations = getDependencyOperations();
          
          // Get dependencies (tasks this task depends on)
          const depsResult = await dependencyOperations.getDependenciesForTask(taskId);
          if (depsResult.success && depsResult.data!.length > 0) {
            console.log('\nDependencies (this task depends on):');
            depsResult.data!.forEach((dep, index) => {
              console.log(`  ${index + 1}. ${dep.toTaskId} (${dep.type}) - ${dep.description}`);
            });
          }

          // Get dependents (tasks that depend on this task)
          const dependentsResult = await dependencyOperations.getDependentsForTask(taskId);
          if (dependentsResult.success && dependentsResult.data!.length > 0) {
            console.log('\nDependents (tasks that depend on this):');
            dependentsResult.data!.forEach((dep, index) => {
              console.log(`  ${index + 1}. ${dep.fromTaskId} (${dep.type}) - ${dep.description}`);
            });
          }

          if ((!depsResult.success || depsResult.data!.length === 0) &&
              (!dependentsResult.success || dependentsResult.data!.length === 0)) {
            CLIUtils.info('No dependencies found for this task.');
          }
        } catch {
          CLIUtils.warning('Failed to load task dependencies');
        }
      }

      logger.info({ taskId }, 'Opened task successfully via CLI');

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to open task via CLI');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

/**
 * Open epic subcommand (placeholder for future implementation)
 */
const openEpicCommand = new Command('epic')
  .description('View detailed epic information')
  .argument('<epicId>', 'Epic ID to open')
  .option('--format <format>', 'Output format (table|json|yaml)', 'table')
  .action(async (epicId: string, options) => {
    try {
      logger.info({ epicId, options }, 'Opening epic via CLI');

      CLIUtils.warning('Epic viewing is not yet implemented.');
      CLIUtils.info('This feature will be available in a future release.');
      CLIUtils.info(`Would open epic: ${epicId}`);

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to open epic via CLI');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

// Add subcommands to open command
openCommand.addCommand(openProjectCommand);
openCommand.addCommand(openTaskCommand);
openCommand.addCommand(openEpicCommand);

// Add help examples
openCommand.addHelpText('after', `
Examples:
  $ vibe-tasks open project PID-WEBAPP-001 --show-tasks --show-dependencies
  $ vibe-tasks open task T0001 --show-dependencies --format json
  $ vibe-tasks open epic E001
`);
