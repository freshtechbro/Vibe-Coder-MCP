/**
 * Natural Language Command Handlers
 * Implements handlers for each recognized intent
 */

import { Intent, RecognizedIntent, CommandProcessingResult, NLResponse } from '../types/nl.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { ConfigLoader, VibeTaskManagerConfig } from '../utils/config-loader.js';
import { extractProjectFromContext, extractEpicFromContext } from '../utils/context-extractor.js';
import { DecomposeTaskHandler, DecomposeProjectHandler } from './handlers/decomposition-handlers.js';
import { SearchFilesHandler, SearchContentHandler } from './handlers/search-handlers.js';
import { ParsePRDHandler, ParseTasksHandler, ImportArtifactHandler } from './handlers/artifact-handlers.js';
import { getPathResolver } from '../utils/path-resolver.js';
import logger from '../../../logger.js';

/**
 * Command execution context
 */
export interface CommandExecutionContext {
  sessionId: string;
  userId?: string;
  currentProject?: string;
  currentTask?: string;
  config: OpenRouterConfig;
  taskManagerConfig: VibeTaskManagerConfig;
}

/**
 * Command execution result
 */
export interface CommandExecutionResult {
  success: boolean;
  result: CallToolResult;
  updatedContext?: Partial<CommandExecutionContext>;
  followUpSuggestions?: string[];
}

/**
 * Base command handler interface
 */
export interface CommandHandler {
  intent: Intent;
  handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult>;
}

/**
 * Natural Language Command Handlers
 * Routes commands to appropriate handlers based on intent
 */
export class CommandHandlers {
  private static instance: CommandHandlers;
  private handlers = new Map<Intent, CommandHandler>();

  private constructor() {
    this.initializeHandlers();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CommandHandlers {
    if (!CommandHandlers.instance) {
      CommandHandlers.instance = new CommandHandlers();
    }
    return CommandHandlers.instance;
  }

  /**
   * Initialize command handlers
   */
  private initializeHandlers(): void {
    // Register handlers for each intent
    this.registerHandler(new CreateProjectHandler());
    this.registerHandler(new CreateTaskHandler());
    this.registerHandler(new ListProjectsHandler());
    this.registerHandler(new ListTasksHandler());
    this.registerHandler(new RunTaskHandler());
    this.registerHandler(new CheckStatusHandler());

    // Register new decomposition handlers
    this.registerHandler(new DecomposeTaskHandler());
    this.registerHandler(new DecomposeProjectHandler());

    // Register new search handlers
    this.registerHandler(new SearchFilesHandler());
    this.registerHandler(new SearchContentHandler());

    // Register new artifact handlers
    this.registerHandler(new ParsePRDHandler());
    this.registerHandler(new ParseTasksHandler());
    this.registerHandler(new ImportArtifactHandler());

    logger.info({ handlerCount: this.handlers.size }, 'Command handlers initialized');
  }

  /**
   * Register a command handler
   */
  registerHandler(handler: CommandHandler): void {
    this.handlers.set(handler.intent, handler);
    logger.debug({ intent: handler.intent }, 'Command handler registered');
  }

  /**
   * Execute command using appropriate handler
   */
  async executeCommand(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const handler = this.handlers.get(recognizedIntent.intent);

    if (!handler) {
      logger.error({ intent: recognizedIntent.intent }, 'No handler found for intent');
      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `No handler available for intent: ${recognizedIntent.intent}`
          }],
          isError: true
        }
      };
    }

    try {
      logger.info({
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Executing command with handler');

      return await handler.handle(recognizedIntent, toolParams, context);
    } catch (error) {
      logger.error({
        err: error,
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Command execution failed');

      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `Command execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        }
      };
    }
  }

  /**
   * Get available handlers
   */
  getAvailableIntents(): Intent[] {
    return Array.from(this.handlers.keys());
  }
}

/**
 * Create Project Handler
 */
export class CreateProjectHandler implements CommandHandler {
  intent: Intent = 'create_project';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const projectName = toolParams.projectName as string;
    const description = toolParams.description as string;
    const options = toolParams.options as Record<string, unknown> || {};

    logger.info({
      projectName,
      sessionId: context.sessionId
    }, 'Creating new project via natural language');

    try {
      // Import ProjectOperations dynamically to avoid circular dependencies
      const { getProjectOperations } = await import('../core/operations/project-operations.js');
      const projectOps = getProjectOperations();

      // Create project using real ProjectOperations
      const createResult = await projectOps.createProject({
        name: projectName,
        description: description,
        tags: (options.tags as string[]) || [],
        techStack: {
          languages: (options.languages as string[]) || [],
          frameworks: (options.frameworks as string[]) || [],
          tools: (options.tools as string[]) || []
        }
      });

      if (!createResult.success) {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: `❌ Failed to create project "${projectName}": ${createResult.error}`
            }],
            isError: true
          }
        };
      }

      const project = createResult.data!;
      const result: CallToolResult = {
        content: [{
          type: "text",
          text: `✅ Project "${projectName}" created successfully!\n\n` +
                `ID: ${project.id}\n` +
                `Description: ${description}\n` +
                `Priority: ${options.priority || 'medium'}\n` +
                `Status: ${project.status}\n` +
                `Created: ${project.metadata.createdAt.toISOString()}\n\n` +
                `You can now add tasks to this project or check its status.`
        }]
      };

      return {
        success: true,
        result,
        updatedContext: {
          currentProject: projectName
        },
        followUpSuggestions: [
          `Add a task to ${projectName}`,
          `Check the status of ${projectName}`,
          `List all projects`
        ]
      };

    } catch (error) {
      logger.error({ err: error, projectName, sessionId: context.sessionId }, 'Failed to create project via natural language');

      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `❌ Error creating project "${projectName}": ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        }
      };
    }
  }
}

/**
 * Create Task Handler
 */
export class CreateTaskHandler implements CommandHandler {
  intent: Intent = 'create_task';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const projectName = toolParams.projectName as string;
    const taskTitle = toolParams.description as string;
    const options = toolParams.options as Record<string, unknown> || {};

    logger.info({
      projectName,
      taskTitle,
      sessionId: context.sessionId
    }, 'Creating new task via natural language');

    // Implement actual task creation logic using TaskOperations
    let taskId: string;

    try {
      const { getTaskOperations } = await import('../core/operations/task-operations.js');
      const taskOps = getTaskOperations();

      // Extract project and epic context dynamically
      const projectContext = await extractProjectFromContext(context);
      const epicContext = await extractEpicFromContext(context, projectContext.projectId);

      logger.debug({
        projectContext,
        epicContext,
        sessionId: context.sessionId
      }, 'Extracted context for task creation');

      // Create task using real TaskOperations with dynamic context
      const createResult = await taskOps.createTask({
        title: taskTitle,
        description: `Task created via natural language: "${recognizedIntent.originalInput}"`,
        type: 'development',
        priority: 'medium',
        projectId: projectContext.projectId, // Dynamic extraction from context
        epicId: epicContext.epicId, // Dynamic extraction from context
        estimatedHours: 2, // Default estimation
        acceptanceCriteria: [`Task "${taskTitle}" should be completed successfully`],
        tags: ['natural-language', 'user-created', `source-${projectContext.source}`, `epic-${epicContext.source}`]
      }, context.sessionId);

      if (!createResult.success) {
        logger.error({
          error: createResult.error,
          taskTitle,
          sessionId: context.sessionId
        }, 'Failed to create task via TaskOperations');

        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: `❌ **Task Creation Failed**\n\n` +
                    `**Error**: ${createResult.error}\n\n` +
                    `Please try again or contact support if the issue persists.`
            }],
            isError: true
          }
        };
      }

      taskId = createResult.data!.id;

      logger.info({
        taskId,
        taskTitle,
        sessionId: context.sessionId
      }, 'Task created successfully via natural language');

    } catch (error) {
      logger.error({
        err: error,
        taskTitle,
        sessionId: context.sessionId
      }, 'Error creating task via TaskOperations');

      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `❌ **Task Creation Error**\n\n` +
                  `**Error**: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
                  `Please try again or contact support if the issue persists.`
          }],
          isError: true
        }
      };
    }

    const result: CallToolResult = {
      content: [{
        type: "text",
        text: `✅ Task created successfully!\n\n` +
              `Task ID: ${taskId}\n` +
              `Title: ${taskTitle}\n` +
              `Project: ${projectName}\n` +
              `Priority: ${options.priority || 'medium'}\n` +
              `Type: ${options.type || 'development'}\n` +
              `Assignee: ${options.assignee || 'unassigned'}\n\n` +
              `The task is ready to be executed or refined.`
      }]
    };

    return {
      success: true,
      result,
      updatedContext: {
        currentProject: projectName,
        currentTask: taskId
      },
      followUpSuggestions: [
        `Run task ${taskId}`,
        `Refine task ${taskId}`,
        `Check status of ${projectName}`
      ]
    };
  }
}

/**
 * List Projects Handler
 */
export class ListProjectsHandler implements CommandHandler {
  intent: Intent = 'list_projects';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const options = toolParams.options as Record<string, unknown> || {};

    logger.info({
      options,
      sessionId: context.sessionId
    }, 'Listing projects via natural language');

    try {
      // Import ProjectOperations dynamically to avoid circular dependencies
      const { getProjectOperations } = await import('../core/operations/project-operations.js');
      const projectOps = getProjectOperations();

      // Build query parameters from options
      const queryParams: any = {};
      if (options.status) queryParams.status = options.status as string;
      if (options.tags) queryParams.tags = options.tags as string[];
      if (options.limit) queryParams.limit = options.limit as number;

      // Get projects using real ProjectOperations
      const listResult = await projectOps.listProjects(queryParams);

      if (!listResult.success) {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: `❌ Failed to list projects: ${listResult.error}`
            }],
            isError: true
          }
        };
      }

      const projects = listResult.data!;

      if (projects.length === 0) {
        const result: CallToolResult = {
          content: [{
            type: "text",
            text: `📋 **No projects found.**\n\n` +
                  `You haven't created any projects yet.\n\n` +
                  `Use "create project" to get started!`
          }]
        };

        return {
          success: true,
          result,
          followUpSuggestions: [
            'Create a new project',
            'Help with project creation'
          ]
        };
      }

      const projectList = projects
        .map((p: any) => `• **${p.name}** (${p.status}) - ID: ${p.id}\n  ${p.description || 'No description'}\n  Created: ${p.metadata.createdAt.toLocaleDateString()}`)
        .join('\n\n');

      const result: CallToolResult = {
        content: [{
          type: "text",
          text: `📋 **Your Projects:**\n\n${projectList}\n\n` +
                `Total: ${projects.length} project${projects.length !== 1 ? 's' : ''}\n\n` +
                `Use "create project" to add a new project or "check status of [project]" for details.`
        }]
      };

      return {
        success: true,
        result,
        followUpSuggestions: [
          'Create a new project',
          projects.length > 0 ? `Check status of ${projects[0].name}` : 'Help with project creation',
          'Show project details'
        ]
      };

    } catch (error) {
      logger.error({ err: error, sessionId: context.sessionId }, 'Failed to list projects via natural language');

      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `❌ Error listing projects: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        }
      };
    }
  }
}

/**
 * List Tasks Handler
 */
export class ListTasksHandler implements CommandHandler {
  intent: Intent = 'list_tasks';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const options = toolParams.options as Record<string, unknown> || {};

    logger.info({
      options,
      sessionId: context.sessionId
    }, 'Listing tasks via natural language');

    try {
      // Import TaskOperations dynamically to avoid circular dependencies
      const { getTaskOperations } = await import('../core/operations/task-operations.js');
      const taskOps = getTaskOperations();

      // Build query parameters from options
      const queryParams: any = {};
      if (options.status) queryParams.status = options.status as string;
      if (options.project) queryParams.projectId = options.project as string;
      if (options.priority) queryParams.priority = options.priority as string;
      if (options.limit) queryParams.limit = options.limit as number;

      // Get tasks using real TaskOperations
      const listResult = await taskOps.listTasks(queryParams);

      if (!listResult.success) {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: `❌ Failed to list tasks: ${listResult.error}`
            }],
            isError: true
          }
        };
      }

      const tasks = listResult.data!;

      if (tasks.length === 0) {
        const result: CallToolResult = {
          content: [{
            type: "text",
            text: `📝 **No tasks found.**\n\n` +
                  `${options.status ? `No tasks with status "${options.status}".` : 'You haven\'t created any tasks yet.'}\n\n` +
                  `Use "create task" to get started!`
          }]
        };

        return {
          success: true,
          result,
          followUpSuggestions: [
            'Create a new task',
            'List projects',
            'Help with task creation'
          ]
        };
      }

      // Apply additional client-side filters if needed
      let filteredTasks = tasks;

      // Filter by project name if it's a string search (not exact projectId)
      if (options.project && typeof options.project === 'string' && !queryParams.projectId) {
        const projectSearch = String(options.project).toLowerCase();
        filteredTasks = filteredTasks.filter(t =>
          t.projectId.toLowerCase().includes(projectSearch)
        );
      }

      // Filter by assignee if specified
      if (options.assignee) {
        filteredTasks = filteredTasks.filter(t =>
          t.assignedAgent && t.assignedAgent.toLowerCase().includes(String(options.assignee).toLowerCase())
        );
      }

      // Format task list for display
      const taskList = filteredTasks
        .map(t => {
          const projectDisplay = t.projectId;
          const assigneeDisplay = t.assignedAgent || 'Unassigned';
          return `• **${t.id}**: ${t.title}\n  Project: ${projectDisplay} | Status: ${t.status} | Priority: ${t.priority}\n  Assignee: ${assigneeDisplay}${t.estimatedHours ? ` | Est: ${t.estimatedHours}h` : ''}`;
        })
        .join('\n\n');

      const result: CallToolResult = {
        content: [{
          type: "text",
          text: `📝 **Tasks**${options.status ? ` (${options.status})` : ''}:\n\n${taskList}\n\n` +
                `**Total**: ${filteredTasks.length} task${filteredTasks.length !== 1 ? 's' : ''}`
        }]
      };

      return {
        success: true,
        result,
        followUpSuggestions: [
          'Create a new task',
          'Run a specific task',
          'Check task status',
          'List projects'
        ]
      };

    } catch (error) {
      logger.error({ err: error, sessionId: context.sessionId }, 'Failed to list tasks via natural language');

      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `❌ Error listing tasks: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        }
      };
    }
  }
}

/**
 * Run Task Handler
 */
export class RunTaskHandler implements CommandHandler {
  intent: Intent = 'run_task';

  /**
   * Resolve project path using centralized path resolver
   */
  private resolveProjectPath(context: CommandExecutionContext): string {
    const pathResolver = getPathResolver();
    return pathResolver.resolveProjectPathFromContext(context);
  }

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const taskId = toolParams.taskId as string;
    const options = toolParams.options as Record<string, unknown> || {};

    logger.info({
      taskId,
      sessionId: context.sessionId
    }, 'Running task via natural language');

    try {
      // Import AgentOrchestrator dynamically to avoid circular dependencies
      const { AgentOrchestrator } = await import('../services/agent-orchestrator.js');
      const orchestrator = AgentOrchestrator.getInstance();

      // Check if task exists first
      const { getTaskOperations } = await import('../core/operations/task-operations.js');
      const taskOps = getTaskOperations();
      const taskResult = await taskOps.getTask(taskId);

      if (!taskResult.success) {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: `❌ Task not found: ${taskId}\n\nPlease check the task ID and try again.`
            }],
            isError: true
          }
        };
      }

      const task = taskResult.data!;

      // Create dynamic project context for task execution using ProjectAnalyzer
      const { ProjectAnalyzer } = await import('../utils/project-analyzer.js');
      const projectAnalyzer = ProjectAnalyzer.getInstance();
      const projectPath = this.resolveProjectPath(context);

      // Detect project characteristics dynamically
      let languages: string[];
      let frameworks: string[];
      let tools: string[];

      try {
        languages = await projectAnalyzer.detectProjectLanguages(projectPath);
      } catch (error) {
        logger.warn({ error, taskId }, 'Language detection failed for task execution, using fallback');
        languages = ['typescript']; // fallback
      }

      try {
        frameworks = await projectAnalyzer.detectProjectFrameworks(projectPath);
      } catch (error) {
        logger.warn({ error, taskId }, 'Framework detection failed for task execution, using fallback');
        frameworks = ['node.js']; // fallback
      }

      try {
        tools = await projectAnalyzer.detectProjectTools(projectPath);
      } catch (error) {
        logger.warn({ error, taskId }, 'Tools detection failed for task execution, using fallback');
        tools = ['npm']; // fallback
      }

      // Create dynamic project context for task assignment
      const projectContext = {
        projectId: task.projectId || 'unknown',
        projectPath,
        projectName: task.projectId || 'unknown',
        description: 'Task execution context with dynamic detection',
        languages, // Dynamic detection using existing 35+ language infrastructure
        frameworks, // Dynamic detection using existing language handler methods
        buildTools: tools, // Dynamic detection using Context Curator patterns
        tools: [],
        configFiles: ['package.json'],
        entryPoints: ['src/index.ts'],
        architecturalPatterns: ['mvc'],
        existingTasks: [],
        codebaseSize: 'medium' as const,
        teamSize: 1,
        complexity: 'medium' as const,
        codebaseContext: {
          relevantFiles: [],
          contextSummary: 'Task execution context with dynamic detection',
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
          testDirectories: ['tests'],
          docDirectories: ['docs'],
          buildDirectories: ['dist']
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
          source: 'auto-detected' as const
        }
      };

      // Execute task using AgentOrchestrator with complete execution flow
      const executionResult = await orchestrator.executeTask(task, projectContext, {
        force: options.force as boolean || false,
        priority: (options.priority as 'low' | 'medium' | 'high' | 'critical') || 'medium',
        sessionId: context.sessionId,
        timeout: 300000, // 5 minutes for natural language execution
        enableMonitoring: true
      });

      if (!executionResult.success) {
        if (executionResult.queued) {
          return {
            success: true,
            result: {
              content: [{
                type: "text",
                text: `⏳ Task queued for execution!\n\n` +
                      `Task ID: ${taskId}\n` +
                      `Title: ${task.title}\n` +
                      `Status: ${executionResult.status}\n` +
                      `Message: ${executionResult.message}\n\n` +
                      `The task has been queued and will be executed when an agent becomes available.`
              }]
            },
            followUpSuggestions: [
              `Check status of task ${taskId}`,
              'List all queued tasks',
              'View agent availability'
            ]
          };
        }

        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: `❌ Failed to execute task "${taskId}": ${executionResult.message}\n\n` +
                    `Error: ${executionResult.error || 'Unknown error'}\n` +
                    `Status: ${executionResult.status}`
            }],
            isError: true
          }
        };
      }

      const result: CallToolResult = {
        content: [{
          type: "text",
          text: `🚀 Task execution completed!\n\n` +
                `Task ID: ${taskId}\n` +
                `Title: ${task.title}\n` +
                `Status: ${executionResult.status}\n` +
                `Agent: ${executionResult.metadata?.agentId || 'Auto-assigned'}\n` +
                `Duration: ${executionResult.metadata?.totalDuration ? Math.round(executionResult.metadata.totalDuration / 1000) + 's' : 'N/A'}\n` +
                `Attempts: ${executionResult.metadata?.attempts || 1}\n\n` +
                `${executionResult.message}\n\n` +
                `${executionResult.agentResponse?.completion_details ?
                  `**Completion Details:**\n` +
                  `- Files modified: ${executionResult.agentResponse.completion_details.files_modified?.join(', ') || 'None specified'}\n` +
                  `- Tests passed: ${executionResult.agentResponse.completion_details.tests_passed ? 'Yes' : 'No'}\n` +
                  `- Build successful: ${executionResult.agentResponse.completion_details.build_successful ? 'Yes' : 'No'}\n` +
                  `- Notes: ${executionResult.agentResponse.completion_details.notes || 'None'}`
                  : ''}`
        }]
      };

      return {
        success: true,
        result,
        updatedContext: {
          currentTask: taskId
        },
        followUpSuggestions: [
          `Check status of task ${taskId}`,
          'List all running tasks',
          'View task execution logs'
        ]
      };

    } catch (error) {
      logger.error({ err: error, taskId, sessionId: context.sessionId }, 'Failed to run task via natural language');

      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `❌ Error running task "${taskId}": ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        }
      };
    }
  }
}

/**
 * Check Status Handler
 */
export class CheckStatusHandler implements CommandHandler {
  intent: Intent = 'check_status';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const projectName = toolParams.projectName as string;
    const taskId = toolParams.taskId as string;
    const options = toolParams.options as Record<string, unknown> || {};

    logger.info({
      projectName,
      taskId,
      sessionId: context.sessionId
    }, 'Checking status via natural language');

    try {
      let statusText = '';

      if (taskId) {
        // Task-specific status - get real task data
        const { getTaskOperations } = await import('../core/operations/task-operations.js');
        const taskOps = getTaskOperations();

        const taskResult = await taskOps.getTask(taskId);

        if (!taskResult.success) {
          return {
            success: false,
            result: {
              content: [{
                type: "text",
                text: `❌ Task not found: ${taskId}\n\nPlease check the task ID and try again.`
              }],
              isError: true
            }
          };
        }

        const task = taskResult.data!;

        // Get execution status from ExecutionCoordinator
        const { ExecutionCoordinator } = await import('../services/execution-coordinator.js');
        const coordinator = await ExecutionCoordinator.getInstance();

        // Get execution status for the task
        const executionStatus = await coordinator.getTaskExecutionStatus(taskId);

        const createdDate = task.metadata.createdAt ? new Date(task.metadata.createdAt).toLocaleDateString() : 'Unknown';
        const updatedDate = task.metadata.updatedAt ? new Date(task.metadata.updatedAt).toLocaleDateString() : 'Unknown';

        statusText = `📊 **Task Status**: ${taskId}\n\n` +
                    `**Title**: ${task.title}\n` +
                    `**Project**: ${task.projectId}\n` +
                    `**Status**: ${task.status}\n` +
                    `**Priority**: ${task.priority}\n` +
                    `**Type**: ${task.type}\n` +
                    `**Assignee**: ${task.assignedAgent || 'Unassigned'}\n` +
                    `**Estimated Hours**: ${task.estimatedHours || 'Not specified'}\n` +
                    `**Created**: ${createdDate}\n` +
                    `**Last Updated**: ${updatedDate}\n\n` +
                    `**Description**:\n${task.description}\n\n` +
                    `**Execution Status**: ${executionStatus?.status || 'Not started'}\n` +
                    `${executionStatus?.message ? `**Execution Details**: ${executionStatus.message}\n` : ''}` +
                    `${executionStatus?.executionId ? `**Execution ID**: ${executionStatus.executionId}\n` : ''}` +
                    `${task.acceptanceCriteria && task.acceptanceCriteria.length > 0 ?
                      `\n**Acceptance Criteria**:\n${task.acceptanceCriteria.map(c => `• ${c}`).join('\n')}` : ''}` +
                    `${task.tags && task.tags.length > 0 ?
                      `\n\n**Tags**: ${task.tags.join(', ')}` : ''}`;

      } else if (projectName) {
        // Project-specific status - get real project data
        const { getProjectOperations } = await import('../core/operations/project-operations.js');
        const { getTaskOperations } = await import('../core/operations/task-operations.js');
        const projectOps = getProjectOperations();
        const taskOps = getTaskOperations();

        // Find project by name
        const projectsResult = await projectOps.listProjects();
        if (!projectsResult.success) {
          return {
            success: false,
            result: {
              content: [{
                type: "text",
                text: `❌ Failed to load projects: ${projectsResult.error}`
              }],
              isError: true
            }
          };
        }

        const project = projectsResult.data!.find(p =>
          p.name.toLowerCase() === projectName.toLowerCase() ||
          p.id.toLowerCase().includes(projectName.toLowerCase())
        );

        if (!project) {
          return {
            success: false,
            result: {
              content: [{
                type: "text",
                text: `❌ Project not found: ${projectName}\n\nPlease check the project name and try again.`
              }],
              isError: true
            }
          };
        }

        // Get tasks for this project
        const tasksResult = await taskOps.listTasks({ projectId: project.id });
        const tasks = tasksResult.success ? tasksResult.data! : [];

        // Calculate task statistics
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
        const pendingTasks = tasks.filter(t => t.status === 'pending').length;
        const blockedTasks = tasks.filter(t => t.status === 'blocked').length;

        const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        statusText = `📊 **Project Status**: ${project.name}\n\n` +
                    `**Status**: ${project.status}\n` +
                    `**Description**: ${project.description}\n` +
                    `**Total Tasks**: ${totalTasks}\n` +
                    `**Completed**: ${completedTasks} (${completionPercentage}%)\n` +
                    `**In Progress**: ${inProgressTasks}\n` +
                    `**Pending**: ${pendingTasks}\n` +
                    `**Blocked**: ${blockedTasks}\n\n` +
                    `${inProgressTasks > 0 ?
                      `**Active Tasks**:\n${tasks.filter(t => t.status === 'in_progress')
                        .slice(0, 3)
                        .map(t => `• ${t.id}: ${t.title}`)
                        .join('\n')}\n\n` : ''}` +
                    `${pendingTasks > 0 ?
                      `**Next Up**:\n${tasks.filter(t => t.status === 'pending')
                        .slice(0, 3)
                        .map(t => `• ${t.title}`)
                        .join('\n')}` : ''}`;

      } else {
        // General status - get system-wide statistics
        const { getProjectOperations } = await import('../core/operations/project-operations.js');
        const { getTaskOperations } = await import('../core/operations/task-operations.js');
        const projectOps = getProjectOperations();
        const taskOps = getTaskOperations();

        // Get all projects and tasks
        const projectsResult = await projectOps.listProjects();
        const tasksResult = await taskOps.listTasks();

        const projects = projectsResult.success ? projectsResult.data! : [];
        const tasks = tasksResult.success ? tasksResult.data! : [];

        const activeProjects = projects.filter(p => p.status === 'in_progress').length;
        const totalTasks = tasks.length;
        const completedToday = tasks.filter(t => {
          if (!t.metadata.updatedAt) return false;
          const today = new Date();
          const taskDate = new Date(t.metadata.updatedAt);
          return taskDate.toDateString() === today.toDateString() && t.status === 'completed';
        }).length;
        const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;

        // Get recent completions (last 5)
        const recentCompletions = tasks
          .filter(t => t.status === 'completed')
          .sort((a, b) => new Date(b.metadata.updatedAt).getTime() - new Date(a.metadata.updatedAt).getTime())
          .slice(0, 3);

        statusText = `📊 **General Status**\n\n` +
                    `**Active Projects**: ${activeProjects}\n` +
                    `**Total Tasks**: ${totalTasks}\n` +
                    `**Completed Today**: ${completedToday}\n` +
                    `**In Progress**: ${inProgressTasks}\n\n` +
                    `${recentCompletions.length > 0 ?
                      `**Recent Completions**:\n${recentCompletions
                        .map(t => `• ${t.title} (${t.projectId})`)
                        .join('\n')}\n\n` : ''}` +
                    `${inProgressTasks > 0 ?
                      `**Current Focus**:\n${tasks.filter(t => t.status === 'in_progress')
                        .slice(0, 3)
                        .map(t => `• ${t.title}`)
                        .join('\n')}` : ''}`;
      }

      const result: CallToolResult = {
        content: [{
          type: "text",
          text: statusText
        }]
      };

      const suggestions = [];
      if (taskId) {
        suggestions.push(`Run task ${taskId}`, 'View task details', 'List related tasks');
      } else if (projectName) {
        suggestions.push(`List tasks in ${projectName}`, `Create task for ${projectName}`, 'View project details');
      } else {
        suggestions.push('Check specific project status', 'List all projects', 'Create new project');
      }

      return {
        success: true,
        result,
        followUpSuggestions: suggestions
      };

    } catch (error) {
      logger.error({ err: error, taskId, projectName, sessionId: context.sessionId }, 'Failed to check status via natural language');

      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `❌ Error checking status: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        }
      };
    }
  }
}

/**
 * Convenience function to get command handlers instance
 */
export function getCommandHandlers(): CommandHandlers {
  return CommandHandlers.getInstance();
}
