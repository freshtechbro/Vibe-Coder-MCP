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
import { ProjectAnalyzer } from '../../utils/project-analyzer.js';
import { CLIUtils } from './index.js';
import { AppError, ValidationError } from '../../../../utils/errors.js';
import { OpenRouterConfigManager } from '../../../../utils/openrouter-config-manager.js';
import { AtomicTask } from '../../types/task.js';
import logger from '../../../../logger.js';

/**
 * Resolve epic ID for a task using epic context resolver
 */
async function resolveEpicIdForTask(partialTask: Partial<AtomicTask>): Promise<string> {
  try {
    if (partialTask.epicId && partialTask.epicId !== 'default-epic') {
      return partialTask.epicId;
    }

    const { getEpicContextResolver } = await import('../../services/epic-context-resolver.js');
    const contextResolver = getEpicContextResolver();

    const taskContext = partialTask.title && partialTask.description ? {
      title: partialTask.title,
      description: partialTask.description,
      type: partialTask.type || 'development',
      tags: partialTask.tags || []
    } : undefined;

    const resolverParams = {
      projectId: partialTask.projectId || 'default-project',
      taskContext
    };

    const contextResult = await contextResolver.resolveEpicContext(resolverParams);
    return contextResult.epicId;

  } catch (error) {
    logger.warn({ err: error, partialTask }, 'Failed to resolve epic ID for task, using fallback');
    return `${partialTask.projectId || 'default-project'}-main-epic`;
  }
}

/**
 * Resolve epic ID for a project using epic context resolver
 */
async function resolveEpicIdForProject(projectId: string, projectName: string): Promise<string> {
  try {
    const { getEpicContextResolver } = await import('../../services/epic-context-resolver.js');
    const contextResolver = getEpicContextResolver();

    const taskContext = {
      title: `Complete ${projectName}`,
      description: `Project implementation for ${projectName}`,
      type: 'development' as const,
      tags: ['project-decomposition']
    };

    const resolverParams = {
      projectId,
      taskContext
    };

    const contextResult = await contextResolver.resolveEpicContext(resolverParams);
    return contextResult.epicId;

  } catch (error) {
    logger.warn({ err: error, projectId, projectName }, 'Failed to resolve epic ID for project, using fallback');
    return `${projectId}-main-epic`;
  }
}

/**
 * Helper function to create a complete AtomicTask from partial data
 */
async function createCompleteAtomicTask(partialTask: Partial<AtomicTask> & { id: string; title: string; description: string }): Promise<AtomicTask> {
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
    epicId: await resolveEpicIdForTask(partialTask),
    projectId: partialTask.projectId || 'default-project',
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
        const configManager = OpenRouterConfigManager.getInstance();
        await configManager.initialize();
        const openRouterConfig = await configManager.getOpenRouterConfig();

        const decompositionService = new DecompositionService(openRouterConfig);

        // Get project analyzer for dynamic detection
        const projectAnalyzer = ProjectAnalyzer.getInstance();
        const projectPath = process.cwd(); // Default to current working directory

        // Detect project characteristics dynamically
        let languages: string[];
        let frameworks: string[];
        let tools: string[];

        try {
          languages = await projectAnalyzer.detectProjectLanguages(projectPath);
        } catch (error) {
          logger.warn({ error, projectPath }, 'Language detection failed in CLI, using fallback');
          languages = ['typescript', 'javascript']; // fallback
        }

        try {
          frameworks = await projectAnalyzer.detectProjectFrameworks(projectPath);
        } catch (error) {
          logger.warn({ error, projectPath }, 'Framework detection failed in CLI, using fallback');
          frameworks = ['node.js']; // fallback
        }

        try {
          tools = await projectAnalyzer.detectProjectTools(projectPath);
        } catch (error) {
          logger.warn({ error, projectPath }, 'Tools detection failed in CLI, using fallback');
          tools = ['vscode', 'git']; // fallback
        }

        // Create decomposition request
        const decompositionRequest = {
          task: await createCompleteAtomicTask({
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
            projectPath: process.cwd(),
            projectName: task.projectId,
            description: `CLI task decomposition for ${task.title}`,
            languages, // Dynamic detection using existing 35+ language infrastructure
            frameworks, // Dynamic detection using existing language handler methods
            buildTools: [],
            tools, // Dynamic detection using Context Curator patterns
            configFiles: [],
            entryPoints: [],
            architecturalPatterns: [],
            existingTasks: [],
            codebaseSize: 'medium' as const,
            teamSize: 1,
            complexity: 'medium' as const,
            codebaseContext: {
              relevantFiles: [],
              contextSummary: `CLI task decomposition context for ${task.title}`,
              gatheringMetrics: {
                searchTime: 0,
                readTime: 0,
                scoringTime: 0,
                totalTime: 0,
                cacheHitRate: 0
              },
              totalContextSize: 0,
              averageRelevance: 0
            },
            structure: {
              sourceDirectories: ['src'],
              testDirectories: ['test', 'tests', '__tests__'],
              docDirectories: ['docs', 'documentation'],
              buildDirectories: ['dist', 'build', 'lib']
            },
            dependencies: {
              production: [],
              development: [],
              external: []
            },
            metadata: {
              createdAt: new Date(),
              updatedAt: new Date(),
              version: '1.0.0',
              source: 'manual' as const
            }
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
        const configManager = OpenRouterConfigManager.getInstance();
        await configManager.initialize();
        const openRouterConfig = await configManager.getOpenRouterConfig();

        const decompositionService = new DecompositionService(openRouterConfig);

        // Create high-level project task for decomposition
        const projectTask = await createCompleteAtomicTask({
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
          epicId: await resolveEpicIdForProject(project.id, project.name),
          createdBy: 'system'
        });

        // Get project analyzer for dynamic detection
        const projectAnalyzer = ProjectAnalyzer.getInstance();
        const projectPath = process.cwd(); // Default to current working directory

        // Detect project characteristics dynamically with project preference
        let languages: string[];
        let frameworks: string[];
        let tools: string[];

        try {
          languages = project.techStack.languages?.length
            ? project.techStack.languages
            : await projectAnalyzer.detectProjectLanguages(projectPath);
        } catch (error) {
          logger.warn({ error, projectPath }, 'Language detection failed for CLI project, using fallback');
          languages = ['typescript']; // fallback
        }

        try {
          frameworks = project.techStack.frameworks?.length
            ? project.techStack.frameworks
            : await projectAnalyzer.detectProjectFrameworks(projectPath);
        } catch (error) {
          logger.warn({ error, projectPath }, 'Framework detection failed for CLI project, using fallback');
          frameworks = ['node.js']; // fallback
        }

        try {
          tools = project.techStack.tools?.length
            ? project.techStack.tools
            : await projectAnalyzer.detectProjectTools(projectPath);
        } catch (error) {
          logger.warn({ error, projectPath }, 'Tools detection failed for CLI project, using fallback');
          tools = ['vscode', 'git']; // fallback
        }

        const decompositionRequest = {
          task: projectTask,
          context: {
            projectId: project.id,
            projectPath: process.cwd(),
            projectName: project.name,
            description: options.description || project.description,
            languages, // Dynamic detection with project techStack preference
            frameworks, // Dynamic detection with project techStack preference
            buildTools: [],
            tools, // Dynamic detection with project techStack preference
            configFiles: [],
            entryPoints: [],
            architecturalPatterns: [],
            existingTasks: [],
            codebaseSize: 'large' as const,
            teamSize: 1,
            complexity: 'high' as const,
            codebaseContext: {
              relevantFiles: [],
              contextSummary: options.description || project.description,
              gatheringMetrics: {
                searchTime: 0,
                readTime: 0,
                scoringTime: 0,
                totalTime: 0,
                cacheHitRate: 0
              },
              totalContextSize: 0,
              averageRelevance: 0
            },
            structure: {
              sourceDirectories: ['src'],
              testDirectories: ['test', 'tests', '__tests__'],
              docDirectories: ['docs', 'documentation'],
              buildDirectories: ['dist', 'build', 'lib']
            },
            dependencies: {
              production: [],
              development: [],
              external: []
            },
            metadata: {
              createdAt: new Date(),
              updatedAt: new Date(),
              version: '1.0.0',
              source: 'manual' as const
            }
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
