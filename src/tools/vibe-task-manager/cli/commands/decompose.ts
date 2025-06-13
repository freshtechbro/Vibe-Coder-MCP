/**
 * Decompose CLI Commands
 *
 * Implements CLI commands for task and project decomposition using the
 * existing DecompositionService infrastructure.
 */

import { Command } from 'commander';
import { DecompositionService } from '../../services/decomposition-service.js';
import { getTaskOperations } from '../../core/operations/task-operations.js';
import { getProjectOperations } from '../../core/operations/project-operations.js';
import { CLIUtils } from './index.js';
import { AppError, ValidationError } from '../../../../utils/errors.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import { AtomicTask } from '../../types/task.js';
import logger from '../../../../logger.js';

/**
 * Helper function to create a complete AtomicTask from partial data
 */
function createCompleteAtomicTask(partialTask: Partial<AtomicTask> & { id: string; title: string; description: string }): AtomicTask {
  const now = new Date();

  return {
    id: partialTask.id,
    title: partialTask.title,
    description: partialTask.description,
    status: partialTask.status || 'pending',
    priority: partialTask.priority || 'medium',
    type: partialTask.type || 'development',
    estimatedHours: partialTask.estimatedHours || 4,
    actualHours: partialTask.actualHours,
    epicId: partialTask.epicId || `epic-${Date.now()}`,
    projectId: partialTask.projectId || `project-${Date.now()}`,
    dependencies: partialTask.dependencies || [],
    dependents: partialTask.dependents || [],
    filePaths: partialTask.filePaths || [],
    acceptanceCriteria: partialTask.acceptanceCriteria || [],
    testingRequirements: partialTask.testingRequirements || {
      unitTests: [],
      integrationTests: [],
      performanceTests: [],
      coverageTarget: 80
    },
    performanceCriteria: partialTask.performanceCriteria || {},
    qualityCriteria: partialTask.qualityCriteria || {
      codeQuality: [],
      documentation: [],
      typeScript: true,
      eslint: true
    },
    integrationCriteria: partialTask.integrationCriteria || {
      compatibility: [],
      patterns: []
    },
    validationMethods: partialTask.validationMethods || {
      automated: [],
      manual: []
    },
    assignedAgent: partialTask.assignedAgent,
    executionContext: partialTask.executionContext,
    createdAt: partialTask.createdAt || now,
    updatedAt: partialTask.updatedAt || now,
    startedAt: partialTask.startedAt,
    completedAt: partialTask.completedAt,
    createdBy: partialTask.createdBy || 'system',
    tags: partialTask.tags || [],
    metadata: partialTask.metadata || {
      createdAt: now,
      updatedAt: now,
      createdBy: 'system',
      tags: []
    }
  };
}

/**
 * Create decompose command group
 */
export function createDecomposeCommand(): Command {
  const decomposeCmd = new Command('decompose');

  decomposeCmd
    .description('Decompose tasks or projects into atomic components')
    .configureOutput({
      writeOut: (str) => process.stdout.write(str),
      writeErr: (str) => process.stderr.write(str)
    });

  // Add subcommands
  decomposeCmd.addCommand(createTaskDecomposeCommand());
  decomposeCmd.addCommand(createProjectDecomposeCommand());

  return decomposeCmd;
}

/**
 * Decompose task subcommand
 */
function createTaskDecomposeCommand(): Command {
  return new Command('task')
    .description('Decompose a task into atomic subtasks')
    .argument('<taskId>', 'Task ID to decompose')
    .option('-d, --description <description>', 'Additional context for decomposition')
    .option('-f, --force', 'Force decomposition even if task appears atomic')
    .option('--max-depth <depth>', 'Maximum decomposition depth', '3')
    .option('--min-hours <hours>', 'Minimum hours for atomic tasks', '0.5')
    .option('--max-hours <hours>', 'Maximum hours for atomic tasks', '8')
    .option('--format <format>', 'Output format (table|json|yaml)', 'table')
    .action(async (taskId, options) => {
      try {
        logger.info({ command: 'decompose task', taskId, options }, 'Starting task decomposition');

        // Validate task exists
        const taskOperations = getTaskOperations();
        const taskResult = await taskOperations.getTask(taskId);

        if (!taskResult.success) {
          CLIUtils.error(`Task not found: ${taskResult.error}`);
          return;
        }

        const task = taskResult.data!;
        CLIUtils.info(`Decomposing task: ${task.title}`);

        // Get configuration
        const config = await getVibeTaskManagerConfig();
        if (!config) {
          CLIUtils.error('Failed to load task manager configuration');
          return;
        }

        // Convert LLMConfig to OpenRouterConfig format
        const openRouterConfig = {
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: process.env.OPENROUTER_API_KEY || '',
          model: 'anthropic/claude-3-sonnet',
          geminiModel: 'gemini-pro',
          perplexityModel: 'llama-3.1-sonar-small-128k-online'
        };

        const decompositionService = new DecompositionService(openRouterConfig);

        // Create decomposition request
        const decompositionRequest = {
          task: createCompleteAtomicTask({
            id: task.id,
            title: task.title,
            description: options.description || task.description,
            type: task.type,
            priority: task.priority,
            estimatedHours: task.estimatedHours,
            acceptanceCriteria: task.acceptanceCriteria,
            tags: task.tags,
            filePaths: task.filePaths || [],
            projectId: task.projectId,
            epicId: task.epicId,
            status: task.status,
            createdBy: task.createdBy,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt
          }),
          context: {
            projectId: task.projectId,
            languages: ['typescript', 'javascript'], // Default languages - could be enhanced with project detection
            frameworks: ['node.js'], // Default frameworks - could be enhanced with project detection
            tools: ['vscode', 'git'],
            existingTasks: [],
            codebaseSize: 'medium' as const,
            teamSize: 1,
            complexity: 'medium' as const
          },
          sessionId: `cli-decompose-${Date.now()}`,
          options: {
            maxDepth: parseInt(options.maxDepth, 10),
            minHours: parseFloat(options.minHours),
            maxHours: parseFloat(options.maxHours),
            forceDecomposition: options.force
          }
        };

        // Start decomposition
        const session = await decompositionService.startDecomposition(decompositionRequest);

        CLIUtils.info(`Decomposition session started: ${session.id}`);
        CLIUtils.info('Analyzing task complexity and gathering context...');

        // Wait for decomposition to complete (with timeout)
        const timeout = 30000; // 30 seconds
        const startTime = Date.now();

        while ((session.status === 'pending' || session.status === 'in_progress') && (Date.now() - startTime) < timeout) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          CLIUtils.info('Decomposition in progress...');

          // Refresh session status
          const updatedSession = decompositionService.getSession(session.id);
          if (updatedSession) {
            Object.assign(session, updatedSession);
          }
        }

        if (session.status === 'pending' || session.status === 'in_progress') {
          CLIUtils.warning('Decomposition is taking longer than expected. Check logs for progress.');
          return;
        }

        if (session.status === 'failed') {
          CLIUtils.error(`Decomposition failed: ${session.error || 'Unknown error'}`);
          return;
        }

        // Display results
        if (session.results && session.results.length > 0 && session.results[0].subTasks.length > 0) {
          CLIUtils.success(`Task decomposed into ${session.results[0].subTasks.length} atomic tasks`);

          const displayData = session.results[0].subTasks.map((atomicTask, index) => ({
            '#': index + 1,
            'Task ID': atomicTask.id,
            'Title': CLIUtils.truncate(atomicTask.title, 40),
            'Type': atomicTask.type,
            'Priority': atomicTask.priority,
            'Hours': atomicTask.estimatedHours,
            'Files': atomicTask.filePaths?.length || 0
          }));

          console.log('\n' + CLIUtils.formatOutput(displayData, options.format));

          // Show summary
          const totalHours = session.results[0].subTasks.reduce((sum, task) => sum + task.estimatedHours, 0);
          CLIUtils.info(`Total estimated hours: ${totalHours}`);
          CLIUtils.info(`Average task size: ${(totalHours / session.results[0].subTasks.length).toFixed(1)} hours`);

        } else {
          CLIUtils.info('Task is already atomic - no decomposition needed');
        }

      } catch (error) {
        logger.error({ err: error, taskId, options }, 'Task decomposition failed');

        if (error instanceof ValidationError) {
          CLIUtils.error(error.message);
        } else {
          CLIUtils.error('Failed to decompose task. Check logs for details.');
        }
      }
    });
}

/**
 * Decompose project subcommand
 */
function createProjectDecomposeCommand(): Command {
  return new Command('project')
    .description('Decompose a project into epics and tasks')
    .argument('<projectId>', 'Project ID or name to decompose')
    .option('-d, --description <description>', 'Additional project context')
    .option('--scope <scope>', 'Decomposition scope (full|incremental)', 'full')
    .option('--epic-size <hours>', 'Target epic size in hours', '40')
    .option('--task-size <hours>', 'Target task size in hours', '4')
    .option('--format <format>', 'Output format (table|json|yaml)', 'table')
    .action(async (projectId, options) => {
      try {
        logger.info({ command: 'decompose project', projectId, options }, 'Starting project decomposition');

        // Validate project exists
        const projectOperations = getProjectOperations();
        const projectResult = await projectOperations.getProject(projectId);

        if (!projectResult.success) {
          CLIUtils.error(`Project not found: ${projectResult.error}`);
          return;
        }

        const project = projectResult.data!;
        CLIUtils.info(`Decomposing project: ${project.name}`);

        // Get configuration
        const config = await getVibeTaskManagerConfig();
        if (!config) {
          CLIUtils.error('Failed to load task manager configuration');
          return;
        }

        // Convert LLMConfig to OpenRouterConfig format
        const openRouterConfig = {
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: process.env.OPENROUTER_API_KEY || '',
          model: 'anthropic/claude-3-sonnet',
          geminiModel: 'gemini-pro',
          perplexityModel: 'llama-3.1-sonar-small-128k-online'
        };

        const decompositionService = new DecompositionService(openRouterConfig);

        // Create high-level project task for decomposition
        const projectTask = createCompleteAtomicTask({
          id: `project-${project.id}`,
          title: `Complete ${project.name}`,
          description: options.description || project.description,
          type: 'development' as const,
          priority: 'high' as const,
          estimatedHours: parseFloat(options.epicSize) * 3, // Rough estimate
          acceptanceCriteria: [`Project ${project.name} should be fully implemented and tested`],
          tags: ['project-decomposition', ...project.metadata.tags],
          filePaths: [],
          projectId: project.id,
          epicId: `epic-${project.id}`,
          createdBy: 'system'
        });

        const decompositionRequest = {
          task: projectTask,
          context: {
            projectId: project.id,
            languages: project.techStack.languages || ['typescript'],
            frameworks: project.techStack.frameworks || [],
            tools: project.techStack.tools || ['vscode', 'git'],
            existingTasks: [],
            codebaseSize: 'large' as const,
            teamSize: 1,
            complexity: 'high' as const
          },
          sessionId: `cli-project-decompose-${Date.now()}`,
          options: {
            maxDepth: 2, // Project -> Epic -> Task
            minHours: 1,
            maxHours: parseFloat(options.taskSize),
            forceDecomposition: true
          }
        };

        // Start decomposition
        const session = await decompositionService.startDecomposition(decompositionRequest);

        CLIUtils.info(`Project decomposition session started: ${session.id}`);
        CLIUtils.info('Analyzing project scope and creating breakdown...');

        // Wait for decomposition to complete (longer timeout for projects)
        const timeout = 60000; // 60 seconds
        const startTime = Date.now();

        while ((session.status === 'pending' || session.status === 'in_progress') && (Date.now() - startTime) < timeout) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          CLIUtils.info('Project decomposition in progress...');

          // Refresh session status
          const updatedSession = decompositionService.getSession(session.id);
          if (updatedSession) {
            Object.assign(session, updatedSession);
          }
        }

        if (session.status === 'pending' || session.status === 'in_progress') {
          CLIUtils.warning('Project decomposition is taking longer than expected. Check logs for progress.');
          return;
        }

        if (session.status === 'failed') {
          CLIUtils.error(`Project decomposition failed: ${session.error || 'Unknown error'}`);
          return;
        }

        // Display results
        if (session.results && session.results.length > 0 && session.results[0].subTasks.length > 0) {
          CLIUtils.success(`Project decomposed into ${session.results[0].subTasks.length} tasks`);

          const displayData = session.results[0].subTasks.map((task, index) => ({
            '#': index + 1,
            'Task ID': task.id,
            'Title': CLIUtils.truncate(task.title, 50),
            'Type': task.type,
            'Priority': task.priority,
            'Hours': task.estimatedHours,
            'Epic': task.tags.find(tag => tag.startsWith('epic:')) || 'General'
          }));

          console.log('\n' + CLIUtils.formatOutput(displayData, options.format));

          // Show project summary
          const totalHours = session.results[0].subTasks.reduce((sum, task) => sum + task.estimatedHours, 0);
          const tasksByType = session.results[0].subTasks.reduce((acc, task) => {
            acc[task.type] = (acc[task.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          CLIUtils.info(`Total estimated hours: ${totalHours}`);
          CLIUtils.info(`Task breakdown: ${Object.entries(tasksByType).map(([type, count]) => `${type}: ${count}`).join(', ')}`);

        } else {
          CLIUtils.warning('No tasks generated from project decomposition');
        }

      } catch (error) {
        logger.error({ err: error, projectId, options }, 'Project decomposition failed');

        if (error instanceof ValidationError) {
          CLIUtils.error(error.message);
        } else {
          CLIUtils.error('Failed to decompose project. Check logs for details.');
        }
      }
    });
}

// Export the main command
export const decomposeCommand = createDecomposeCommand();

// Add help examples
decomposeCommand.addHelpText('after', `
Examples:
  $ vibe-tasks decompose task T001 --description "Focus on authentication flow"
  $ vibe-tasks decompose task T001 --force --max-hours 6
  $ vibe-tasks decompose project PID-WEBAPP-001 --scope incremental
  $ vibe-tasks decompose project "My Web App" --epic-size 60 --task-size 8
`);
