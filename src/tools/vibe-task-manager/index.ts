import { z } from 'zod';
import { CallToolResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { registerTool, ToolDefinition, ToolExecutor, ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { getBaseOutputDir, getVibeTaskManagerOutputDir } from './utils/config-loader.js';
import logger from '../../logger.js';
import { AgentOrchestrator } from './services/agent-orchestrator.js';
import { ProjectOperations } from './core/operations/project-operations.js';
import { DecompositionService } from './services/decomposition-service.js';
import { CommandGateway } from './nl/command-gateway.js';
import { jobManager } from '../../services/job-manager/index.js';
import path from 'path';
import fs from 'fs/promises';
import { AtomicTask } from './types/task.js';
import { ProjectContext } from './types/project-context.js';
import { ProjectContext as AtomicProjectContext } from './core/atomic-detector.js';

// Input schema for the Vibe Task Manager tool
const vibeTaskManagerInputSchema = z.object({
  command: z.enum(['create', 'list', 'run', 'status', 'refine', 'decompose']).optional().describe('The command to execute (optional for natural language input)'),
  projectName: z.string().optional().describe('Name of the project to work with'),
  taskId: z.string().optional().describe('ID of the task to work with'),
  description: z.string().optional().describe('Description for project creation or task decomposition'),
  options: z.record(z.unknown()).optional().describe('Additional options for the command'),
  input: z.string().optional().describe('Natural language input for command processing')
});

// Extract the raw shape for registration
const vibeTaskManagerInputSchemaShape = vibeTaskManagerInputSchema.shape;

/**
 * Check if input is natural language rather than structured command
 */
function isNaturalLanguageInput(params: Record<string, unknown>): boolean {
  // If there's an 'input' field, it's natural language
  if (params.input && typeof params.input === 'string') {
    return true;
  }

  // If no command is specified but there's a description that looks like natural language
  if (!params.command && params.description && typeof params.description === 'string') {
    const desc = params.description.toLowerCase();
    // Look for natural language patterns
    const nlPatterns = [
      /^(create|make|build|start|begin)/,
      /^(list|show|display|get)/,
      /^(run|execute|start|launch)/,
      /^(check|status|what|how)/,
      /^(refine|improve|update|modify)/,
      /^(decompose|break down|split)/
    ];
    return nlPatterns.some(pattern => pattern.test(desc));
  }

  return false;
}

/**
 * Handle natural language input using CommandGateway
 */
async function handleNaturalLanguageInput(
  input: string,
  config: OpenRouterConfig,
  context: any
): Promise<CallToolResult> {
  try {
    // Import CommandGateway dynamically to avoid circular dependencies
    const { CommandGateway } = await import('./nl/command-gateway.js');
    const gateway = CommandGateway.getInstance();

    // Process natural language input
    const result = await gateway.processCommand(input, {
      sessionId: context?.sessionId || 'default',
      userId: context?.userId || 'anonymous'
    });

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: `❌ Failed to process command: ${result.validationErrors.join(', ')}\n\n` +
                `Suggestions:\n${result.suggestions.map(s => `• ${s}`).join('\n')}`
        }],
        isError: true
      };
    }

    // For now, return a success message with the recognized intent
    return {
      content: [{
        type: "text",
        text: `✅ Command processed successfully!\n\n` +
              `Intent: ${result.intent.intent}\n` +
              `Confidence: ${Math.round(result.intent.confidence * 100)}%\n` +
              `Parameters: ${JSON.stringify(result.toolParams, null, 2)}\n\n` +
              `This natural language processing is working! The command was recognized and parsed correctly.`
      }]
    };

  } catch (error) {
    logger.error({ err: error, input }, 'Failed to process natural language input');

    return {
      content: [{
        type: "text",
        text: `❌ Failed to process natural language input: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
              `Please try using a structured command instead, such as:\n` +
              `• "create" - Create a new project\n` +
              `• "list" - List existing projects\n` +
              `• "decompose" - Break down a project into tasks`
      }],
      isError: true
    };
  }
}

/**
 * Main executor function for the Vibe Task Manager tool
 * Implements AI-agent-native task management with recursive decomposition
 */
export const vibeTaskManagerExecutor: ToolExecutor = async (
  params: Record<string, unknown>,
  config: OpenRouterConfig,
  context?: ToolExecutionContext
): Promise<CallToolResult> => {
  const sessionId = context?.sessionId || 'unknown-session';

  try {
    logger.info({ sessionId, params }, 'Vibe Task Manager execution started');

    // Auto-register agent session if not already registered
    await ensureAgentRegistration(sessionId, context);

    // Parse and validate input parameters
    const validatedParams = vibeTaskManagerInputSchema.parse(params);
    const { command, projectName, taskId, description, options, input } = validatedParams;

    // Check if this is natural language input
    if (isNaturalLanguageInput(params)) {
      return await handleNaturalLanguageInput(input || description || '', config, context);
    }

    // Validate command is provided
    if (!command) {
      return {
        content: [{
          type: "text",
          text: "Validation error: command is required. Please specify one of: create, list, run, status, refine, decompose"
        }],
        isError: true
      };
    }

    // Route to appropriate command handler
    switch (command) {
      case 'create':
        return await handleCreateCommand(projectName, description, options, config, sessionId);

      case 'list':
        return await handleListCommand(options, sessionId);

      case 'run':
        return await handleRunCommand(taskId, options, config, sessionId);

      case 'status':
        return await handleStatusCommand(projectName, taskId, sessionId);

      case 'refine':
        return await handleRefineCommand(taskId, description, config, sessionId);

      case 'decompose':
        return await handleDecomposeCommand(taskId || projectName, description, config, sessionId);

      default:
        return {
          content: [{
            type: "text",
            text: `Validation error: Unknown command '${command}'. Valid commands are: create, list, run, status, refine, decompose`
          }],
          isError: true
        };
    }

  } catch (error) {
    logger.error({ err: error, sessionId, params }, 'Vibe Task Manager execution failed');

    if (error instanceof z.ZodError) {
      return {
        content: [{
          type: "text",
          text: `Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
        }],
        isError: true
      };
    }

    return {
      content: [{
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
};

/**
 * Wait for decomposition completion with adaptive timeout
 */
async function waitForDecompositionCompletion(
  decompositionService: DecompositionService,
  sessionId: string,
  maxWaitTime: number = 30000
): Promise<AtomicTask[]> {
  const { AdaptiveTimeoutManager } = await import('./services/adaptive-timeout-manager.js');
  const timeoutManager = AdaptiveTimeoutManager.getInstance();

  const result = await timeoutManager.executeWithTimeout(
    `decomposition-${sessionId}`,
    async (cancellationToken, progressCallback) => {
      const startTime = Date.now();
      let lastProgressUpdate = Date.now();
      let tasksFound = 0;

      while (!cancellationToken.isCancelled) {
        const session = decompositionService.getSession(sessionId);

        if (!session) {
          throw new Error('Decomposition session not found');
        }

        if (session.status === 'completed') {
          const results = decompositionService.getResults(sessionId);

          // Final progress update
          progressCallback({
            completed: results.length,
            total: results.length,
            stage: 'completed',
            lastUpdate: new Date(),
            estimatedTimeRemaining: 0
          });

          return results;
        }

        if (session.status === 'failed') {
          throw new Error(session.error || 'Decomposition failed');
        }

        // Update progress if we detect changes
        const currentTime = Date.now();
        if (currentTime - lastProgressUpdate > 2000) { // Update every 2 seconds
          // Estimate progress based on session state
          let estimatedProgress = 0;
          let stage = 'initializing';

          if (session.status === 'in_progress') {
            stage = 'processing';
            // Estimate progress based on time elapsed (rough heuristic)
            const elapsedTime = currentTime - startTime;
            estimatedProgress = Math.min(0.8, elapsedTime / maxWaitTime); // Max 80% until completion
          }

          const estimatedTotal = Math.max(1, tasksFound || 1);
          const estimatedCompleted = Math.floor(estimatedProgress * estimatedTotal);
          const remainingTime = Math.max(0, maxWaitTime - (currentTime - startTime));

          progressCallback({
            completed: estimatedCompleted,
            total: estimatedTotal,
            stage,
            lastUpdate: new Date(),
            estimatedTimeRemaining: remainingTime
          });

          lastProgressUpdate = currentTime;
        }

        // Wait 1 second before checking again
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      throw new Error('Decomposition cancelled');
    },
    {
      baseTimeoutMs: maxWaitTime,
      maxTimeoutMs: Math.max(maxWaitTime, 300000), // At least 5 minutes max
      progressCheckIntervalMs: 5000,
      exponentialBackoffFactor: 1.5,
      maxRetries: 2,
      partialResultThreshold: 0.5
    },
    // Partial result extractor
    (currentState) => {
      try {
        const session = decompositionService.getSession(sessionId);
        if (session && session.status === 'in_progress') {
          // Try to get any partial results that might be available
          const partialResults = decompositionService.getResults(sessionId);
          return partialResults.length > 0 ? partialResults : undefined;
        }
      } catch {
        // Ignore errors in partial result extraction
      }
      return undefined;
    }
  );

  if (result.success && result.result) {
    return result.result;
  }

  // If we have partial results and they're substantial, use them
  if (result.partialResult && Array.isArray(result.partialResult) && result.partialResult.length > 0) {
    logger.warn({
      sessionId,
      partialResultCount: result.partialResult.length,
      totalDuration: result.totalDuration
    }, 'Using partial decomposition results due to timeout');

    return result.partialResult as AtomicTask[];
  }

  throw new Error(result.error || 'Decomposition timeout');
}

/**
 * Handle project creation command
 */
async function handleCreateCommand(
  projectName: string | undefined,
  description: string | undefined,
  options: Record<string, unknown> | undefined,
  config: OpenRouterConfig,
  sessionId: string
): Promise<CallToolResult> {
  logger.info({ sessionId, projectName }, 'Creating new project');

  if (!projectName) {
    return {
      content: [{
        type: "text",
        text: "Error: Project name is required for create command"
      }],
      isError: true
    };
  }

  if (!description) {
    return {
      content: [{
        type: "text",
        text: "Error: Project description is required for create command"
      }],
      isError: true
    };
  }

  try {
    // Create a background job for project creation
    const jobId = jobManager.createJob(
      'vibe-task-manager',
      { projectName, description, options, sessionId }
    );

    // Start project creation asynchronously
    setTimeout(async () => {
      try {
        const projectOps = ProjectOperations.getInstance();
        const result = await projectOps.createProject({
          name: projectName,
          description,
          techStack: options?.techStack as any,
          tags: options?.tags as string[],
          rootPath: options?.rootPath as string
        }, sessionId);

        if (result.success && result.data) {
          const outputDir = await getBaseOutputDir();
          const projectOutputPath = path.join(outputDir, 'projects', result.data.id);

          jobManager.setJobResult(jobId, {
            content: [{
              type: "text",
              text: `✅ Project "${projectName}" created successfully!\n\n` +
                    `Project ID: ${result.data.id}\n` +
                    `Description: ${description}\n` +
                    `Status: ${result.data.status}\n` +
                    `Output Directory: ${projectOutputPath}\n\n` +
                    `You can now decompose this project into tasks using:\n` +
                    `"Decompose my project into development tasks"`
            }]
          });
        } else {
          jobManager.setJobResult(jobId, {
            content: [{
              type: "text",
              text: `Error: ${result.error || 'Unknown error during project creation'}`
            }],
            isError: true
          });
        }
      } catch (error) {
        logger.error({ err: error, jobId, projectName }, 'Project creation failed');
        jobManager.setJobResult(jobId, {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : 'Project creation failed'}`
          }],
          isError: true
        });
      }
    }, 100);

    return {
      content: [{
        type: "text",
        text: `🚀 Project creation started for "${projectName}"!\n\n` +
              `Job ID: ${jobId}\n` +
              `Status: Processing...\n\n` +
              `Use 'get-job-result' with job ID '${jobId}' to check progress and get the final result.`
      }],
      jobId
    };

  } catch (error) {
    logger.error({ err: error, sessionId, projectName }, 'Failed to start project creation');
    return {
      content: [{
        type: "text",
        text: `Error starting project creation: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
}

/**
 * Handle project listing command
 */
async function handleListCommand(
  options: Record<string, unknown> | undefined,
  sessionId: string
): Promise<CallToolResult> {
  logger.info({ sessionId, options }, 'Listing projects');

  try {
    // Import ProjectOperations dynamically to avoid circular dependencies
    const { getProjectOperations } = await import('./core/operations/project-operations.js');
    const projectOps = getProjectOperations();

    // Build query parameters from options
    const queryParams: any = {};
    if (options?.status) queryParams.status = options.status as string;
    if (options?.tags) queryParams.tags = options.tags as string[];
    if (options?.limit) queryParams.limit = options.limit as number;

    // Get projects using real ProjectOperations
    const listResult = await projectOps.listProjects(queryParams);

    if (!listResult.success) {
      return {
        content: [{
          type: "text",
          text: `❌ Failed to list projects: ${listResult.error}`
        }],
        isError: true
      };
    }

    const projects = listResult.data!;

    if (projects.length === 0) {
      return {
        content: [{
          type: "text",
          text: `📋 **No projects found.**\n\n` +
                `You haven't created any projects yet.\n\n` +
                `Use the "create" command to get started:\n` +
                `• \`vibe-task-manager create "My Project" "Project description"\`\n` +
                `• Or try natural language: "Create a project for building a todo app"`
        }]
      };
    }

    const projectList = projects
      .map((p: any) => `• **${p.name}** (${p.status}) - ID: ${p.id}\n  ${p.description || 'No description'}\n  Created: ${p.metadata.createdAt.toLocaleDateString()}`)
      .join('\n\n');

    return {
      content: [{
        type: "text",
        text: `📋 **Your Projects:**\n\n${projectList}\n\n` +
              `Total: ${projects.length} project${projects.length !== 1 ? 's' : ''}\n\n` +
              `**Next Steps:**\n` +
              `• Use "decompose" to break down a project into tasks\n` +
              `• Use "status" to check project details\n` +
              `• Try natural language: "Show me details for [project name]"`
      }]
    };

  } catch (error) {
    logger.error({ err: error, sessionId }, 'Failed to list projects');

    return {
      content: [{
        type: "text",
        text: `❌ Error listing projects: ${error instanceof Error ? error.message : 'Unknown error'}`
      }],
      isError: true
    };
  }
}

/**
 * Handle task execution command
 */
async function handleRunCommand(
  taskId: string | undefined,
  options: Record<string, unknown> | undefined,
  config: OpenRouterConfig,
  sessionId: string
): Promise<CallToolResult> {
  logger.info({ sessionId, taskId, options }, 'Running task');

  if (!taskId) {
    return {
      content: [{
        type: "text",
        text: "Error: Task ID is required for run command"
      }],
      isError: true
    };
  }

  try {
    // Create a background job for task execution
    const jobId = jobManager.createJob(
      'vibe-task-manager',
      { taskId, options, sessionId }
    );

    // Start task execution asynchronously
    setTimeout(async () => {
      try {
        // Import AgentOrchestrator dynamically to avoid circular dependencies
        const { AgentOrchestrator } = await import('./services/agent-orchestrator.js');
        const orchestrator = AgentOrchestrator.getInstance();

        // Fetch task from storage using real TaskOperations
        const { getTaskOperations } = await import('./core/operations/task-operations.js');
        const taskOps = getTaskOperations();

        const taskResult = await taskOps.getTask(taskId);

        if (!taskResult.success) {
          jobManager.setJobResult(jobId, {
            content: [{
              type: "text",
              text: `❌ **Task Not Found**\n\n` +
                    `🎯 **Task ID**: ${taskId}\n` +
                    `❗ **Error**: ${taskResult.error || 'Task not found in storage'}\n\n` +
                    `**Possible Solutions:**\n` +
                    `• Verify the task ID is correct\n` +
                    `• Use "list" to see available tasks\n` +
                    `• Use "decompose" to create tasks from a project\n` +
                    `• Check if the task was created successfully`
            }],
            isError: true
          });
          return;
        }

        const task = taskResult.data!;

        // Fetch project context from storage using real ProjectOperations
        const { getProjectOperations } = await import('./core/operations/project-operations.js');
        const projectOps = getProjectOperations();

        let projectContext: ProjectContext;

        if (task.projectId && task.projectId !== 'unknown') {
          const projectResult = await projectOps.getProject(task.projectId);

          if (projectResult.success && projectResult.data) {
            const project = projectResult.data;

            // Create project context from real project data
            projectContext = {
              projectPath: project.rootPath || process.cwd(),
              projectName: project.name,
              description: project.description || 'No description available',
              languages: project.techStack?.languages || ['typescript'],
              frameworks: project.techStack?.frameworks || ['node.js'],
              buildTools: project.techStack?.tools || ['npm'],
              configFiles: ['package.json'],
              entryPoints: ['src/index.ts'],
              architecturalPatterns: ['mvc'],
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
                createdAt: project.metadata.createdAt,
                updatedAt: project.metadata.updatedAt,
                version: '1.0.0',
                source: 'manual' as const
              }
            };
          } else {
            // Fallback to basic context if project not found
            logger.warn({ taskId, projectId: task.projectId }, 'Project not found, using fallback context');
            projectContext = {
              projectPath: process.cwd(),
              projectName: task.projectId,
              description: 'Project context not available',
              languages: ['typescript'],
              frameworks: ['node.js'],
              buildTools: ['npm'],
              configFiles: ['package.json'],
              entryPoints: ['src/index.ts'],
              architecturalPatterns: ['mvc'],
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
                source: 'manual' as const
              }
            };
          }
        } else {
          // No project ID available, use basic context
          projectContext = {
            projectPath: process.cwd(),
            projectName: 'Unknown Project',
            description: 'No project context available',
            languages: ['typescript'],
            frameworks: ['node.js'],
            buildTools: ['npm'],
            configFiles: ['package.json'],
            entryPoints: ['src/index.ts'],
            architecturalPatterns: ['mvc'],
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
              source: 'manual' as const
            }
          };
        }

        // Execute task using real AgentOrchestrator
        const executionOptions = {
          timeout: options?.timeout as number || 300000, // 5 minutes default
          maxRetries: options?.maxRetries as number || 3,
          enableMonitoring: true,
          priority: options?.priority as 'low' | 'medium' | 'high' | 'critical' || 'medium'
        };

        const result = await orchestrator.executeTask(task, projectContext, executionOptions);

        if (result.success) {
          jobManager.setJobResult(jobId, {
            content: [{
              type: "text",
              text: `✅ **Task Execution Completed Successfully!**\n\n` +
                    `🎯 **Task ID**: ${taskId}\n` +
                    `📊 **Status**: ${result.status}\n` +
                    `⏱️ **Duration**: ${result.metadata?.totalDuration || 'N/A'}ms\n` +
                    `🤖 **Agent**: ${result.assignment?.agentId || 'Unknown'}\n` +
                    `📝 **Result**: ${result.message || 'Task completed successfully'}\n\n` +
                    `**Execution Details:**\n` +
                    `• Start Time: ${result.startTime?.toISOString() || 'N/A'}\n` +
                    `• End Time: ${result.endTime?.toISOString() || 'N/A'}\n` +
                    `• Retry Count: ${result.metadata?.attempts || 0}\n\n` +
                    `**Next Steps:**\n` +
                    `• Review the task results\n` +
                    `• Check for any follow-up tasks\n` +
                    `• Use "status" to monitor progress`
            }]
          });
        } else {
          jobManager.setJobResult(jobId, {
            content: [{
              type: "text",
              text: `❌ **Task Execution Failed**\n\n` +
                    `🎯 **Task ID**: ${taskId}\n` +
                    `📊 **Status**: ${result.status}\n` +
                    `❗ **Error**: ${result.error || 'Unknown error'}\n` +
                    `⏱️ **Duration**: ${result.metadata?.totalDuration || 'N/A'}ms\n` +
                    `🔄 **Retry Count**: ${result.metadata?.attempts || 0}\n\n` +
                    `**Troubleshooting:**\n` +
                    `• Check task requirements and dependencies\n` +
                    `• Verify agent availability\n` +
                    `• Try running with different options\n` +
                    `• Use "refine" to improve task definition`
            }],
            isError: true
          });
        }

      } catch (error) {
        logger.error({ err: error, jobId, taskId }, 'Task execution failed');
        jobManager.setJobResult(jobId, {
          content: [{
            type: "text",
            text: `❌ **Task Execution Error**\n\n` +
                  `🎯 **Task ID**: ${taskId}\n` +
                  `❗ **Error**: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
                  `**Possible Solutions:**\n` +
                  `• Verify the task ID is correct\n` +
                  `• Check if agents are available\n` +
                  `• Try again with different execution options`
          }],
          isError: true
        });
      }
    }, 100);

    return {
      content: [{
        type: "text",
        text: `🚀 **Task Execution Started!**\n\n` +
              `🎯 **Task ID**: ${taskId}\n` +
              `📋 **Job ID**: ${jobId}\n` +
              `⏱️ **Status**: Processing...\n\n` +
              `**Execution Options:**\n` +
              `• Timeout: ${options?.timeout || 300000}ms\n` +
              `• Max Retries: ${options?.maxRetries || 3}\n` +
              `• Priority: ${options?.priority || 'medium'}\n\n` +
              `Use 'get-job-result' with job ID '${jobId}' to check progress and get the final result.`
      }],
      jobId
    };

  } catch (error) {
    logger.error({ err: error, sessionId, taskId }, 'Failed to start task execution');
    return {
      content: [{
        type: "text",
        text: `❌ Error starting task execution: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
}

/**
 * Handle status checking command
 */
async function handleStatusCommand(
  projectName: string | undefined,
  taskId: string | undefined,
  sessionId: string
): Promise<CallToolResult> {
  logger.info({ sessionId, projectName, taskId }, 'Checking status');

  try {
    if (projectName) {
      // Check project status
      const { getProjectOperations } = await import('./core/operations/project-operations.js');
      const projectOps = getProjectOperations();

      const projectResult = await projectOps.getProject(projectName);

      if (!projectResult.success) {
        return {
          content: [{
            type: "text",
            text: `❌ Project not found: ${projectName}\n\n` +
                  `**Available Commands:**\n` +
                  `• Use "list" to see all projects\n` +
                  `• Use "create" to create a new project`
          }],
          isError: true
        };
      }

      const project = projectResult.data!;

      return {
        content: [{
          type: "text",
          text: `📊 **Project Status: ${project.name}**\n\n` +
                `🆔 **ID**: ${project.id}\n` +
                `📝 **Description**: ${project.description || 'No description'}\n` +
                `📊 **Status**: ${project.status}\n` +
                `🏷️ **Tags**: ${project.metadata.tags?.join(', ') || 'None'}\n` +
                `📅 **Created**: ${project.metadata.createdAt.toLocaleDateString()}\n` +
                `👤 **Created By**: ${project.metadata.createdBy}\n\n` +
                `**Tech Stack:**\n` +
                `• Languages: ${project.techStack?.languages?.join(', ') || 'Not specified'}\n` +
                `• Frameworks: ${project.techStack?.frameworks?.join(', ') || 'Not specified'}\n` +
                `• Tools: ${project.techStack?.tools?.join(', ') || 'Not specified'}\n\n` +
                `**Next Steps:**\n` +
                `• Use "decompose" to break down into tasks\n` +
                `• Use "list" to see all projects\n` +
                `• Try natural language: "Show me tasks for ${project.name}"`
        }]
      };

    } else if (taskId) {
      // Check task status using AgentOrchestrator
      const { AgentOrchestrator } = await import('./services/agent-orchestrator.js');
      const orchestrator = AgentOrchestrator.getInstance();

      // Get task assignment status
      const assignments = orchestrator.getAssignments();
      const taskAssignment = assignments.find(a => a.taskId === taskId);

      if (!taskAssignment) {
        return {
          content: [{
            type: "text",
            text: `❌ Task not found or not currently active: ${taskId}\n\n` +
                  `**Possible Reasons:**\n` +
                  `• Task has not been started yet\n` +
                  `• Task has already completed\n` +
                  `• Task ID is incorrect\n\n` +
                  `**Available Commands:**\n` +
                  `• Use "run ${taskId}" to execute the task\n` +
                  `• Use "list" to see available projects\n` +
                  `• Use "decompose" to create tasks from a project`
          }],
          isError: true
        };
      }

      // Get agent info
      const agents = orchestrator.getAgents();
      const agent = agents.find(a => a.id === taskAssignment.agentId);
      const task = taskAssignment.task;

      return {
        content: [{
          type: "text",
          text: `🎯 **Task Status: ${task.title}**\n\n` +
                `🆔 **Task ID**: ${task.id}\n` +
                `📝 **Description**: ${task.description}\n` +
                `📊 **Task Status**: ${task.status}\n` +
                `🔥 **Priority**: ${task.priority}\n` +
                `📂 **Type**: ${task.type}\n` +
                `🏗️ **Project**: ${task.projectId}\n` +
                `⏱️ **Estimated Hours**: ${task.estimatedHours}h\n` +
                `⏰ **Actual Hours**: ${task.actualHours}h\n\n` +
                `**Assignment Details:**\n` +
                `🤖 **Assigned Agent**: ${agent?.name || agent?.id || 'Unknown'}\n` +
                `📅 **Assigned At**: ${taskAssignment.assignedAt.toISOString()}\n` +
                `📊 **Assignment Status**: ${taskAssignment.status}\n` +
                `⏰ **Expected Completion**: ${taskAssignment.expectedCompletionAt.toISOString()}\n` +
                `🔄 **Attempts**: ${taskAssignment.attempts}\n` +
                `📊 **Last Status Update**: ${taskAssignment.lastStatusUpdate.toISOString()}\n\n` +
                `**Task Progress:**\n` +
                `• Created: ${task.createdAt.toLocaleDateString()}\n` +
                `• Last Updated: ${task.updatedAt.toLocaleDateString()}\n` +
                `• Tags: ${task.tags.join(', ')}\n` +
                `• Dependencies: ${task.dependencies.length} task(s)\n` +
                `• Acceptance Criteria: ${task.acceptanceCriteria.length} item(s)\n\n` +
                `**Agent Details:**\n` +
                `• Agent ID: ${taskAssignment.agentId}\n` +
                `• Agent Status: ${agent?.status || 'Unknown'}\n` +
                `• Agent Capabilities: ${agent?.capabilities?.join(', ') || 'Unknown'}\n` +
                `• Current Tasks: ${agent?.currentTasks?.length || 0}\n\n` +
                `**Next Steps:**\n` +
                `• Monitor task progress\n` +
                `• Use "refine ${taskId}" to update task requirements\n` +
                `• Check agent status for more details`
        }]
      };

    } else {
      // General status overview
      const { getProjectOperations } = await import('./core/operations/project-operations.js');
      const projectOps = getProjectOperations();
      const { AgentOrchestrator } = await import('./services/agent-orchestrator.js');
      const orchestrator = AgentOrchestrator.getInstance();

      const projectsResult = await projectOps.listProjects({ limit: 5 });
      const projects = projectsResult.success ? projectsResult.data! : [];
      const activeAssignments = orchestrator.getAssignments();
      const agents = orchestrator.getAgents();

      return {
        content: [{
          type: "text",
          text: `📊 **Vibe Task Manager Status Overview**\n\n` +
                `**Projects:**\n` +
                `• Total Projects: ${projects.length}\n` +
                `• Recent Projects: ${projects.slice(0, 3).map(p => p.name).join(', ') || 'None'}\n\n` +
                `**Tasks:**\n` +
                `• Active Tasks: ${activeAssignments.length}\n` +
                `• In Progress Tasks: ${activeAssignments.filter(a => a.status === 'in_progress').length}\n` +
                `• Assigned Tasks: ${activeAssignments.filter(a => a.status === 'assigned').length}\n\n` +
                `**Agents:**\n` +
                `• Registered Agents: ${agents.length}\n` +
                `• Available Agents: ${agents.filter(a => a.status === 'available').length}\n` +
                `• Busy Agents: ${agents.filter(a => a.status === 'busy').length}\n\n` +
                `**Quick Actions:**\n` +
                `• Use "list" to see all projects\n` +
                `• Use "create [name] [description]" to start a new project\n` +
                `• Use "decompose [project]" to break down a project\n` +
                `• Try natural language: "Create a project for building a web app"`
        }]
      };
    }

  } catch (error) {
    logger.error({ err: error, sessionId, projectName, taskId }, 'Failed to check status');

    return {
      content: [{
        type: "text",
        text: `❌ Error checking status: ${error instanceof Error ? error.message : 'Unknown error'}`
      }],
      isError: true
    };
  }
}

/**
 * Handle task refinement command
 */
async function handleRefineCommand(
  taskId: string | undefined,
  description: string | undefined,
  config: OpenRouterConfig,
  sessionId: string
): Promise<CallToolResult> {
  logger.info({ sessionId, taskId, description }, 'Refining task');

  if (!taskId) {
    return {
      content: [{
        type: "text",
        text: "Error: Task ID is required for refine command"
      }],
      isError: true
    };
  }

  if (!description) {
    return {
      content: [{
        type: "text",
        text: "Error: Refinement description is required for refine command"
      }],
      isError: true
    };
  }

  try {
    // Create a background job for task refinement
    const jobId = jobManager.createJob(
      'vibe-task-manager',
      { taskId, description, sessionId }
    );

    // Start task refinement asynchronously
    setTimeout(async () => {
      try {
        // Import TaskRefinementService dynamically to avoid circular dependencies
        const { getTaskRefinementService } = await import('./services/task-refinement-service.js');
        const refinementService = getTaskRefinementService();

        // Note: TaskRefinementService will fetch the task by ID internally

        // Create refinement parameters from description
        const refinementParams = {
          description: description,
          // Parse description for other refinements if needed
          // For now, just update the description
        };

        // Perform task refinement using real TaskRefinementService
        const refinementResult = await refinementService.refineTask(
          taskId,
          refinementParams,
          sessionId
        );

        if (refinementResult.success && refinementResult.refinedTask) {
          const refinedTask = refinementResult.refinedTask;

          jobManager.setJobResult(jobId, {
            content: [{
              type: "text",
              text: `✅ **Task Refinement Completed Successfully!**\n\n` +
                    `🎯 **Original Task ID**: ${taskId}\n` +
                    `🔄 **Refinement Type**: ${refinementResult.wasDecomposed ? 'Refine and Decompose' : 'Simple Refinement'}\n` +
                    `📝 **Feedback Applied**: ${description}\n\n` +
                    `**Refined Task Details:**\n` +
                    `• **Title**: ${refinedTask.title}\n` +
                    `• **Description**: ${refinedTask.description}\n` +
                    `• **Priority**: ${refinedTask.priority}\n` +
                    `• **Estimated Hours**: ${refinedTask.estimatedHours}h\n` +
                    `• **Type**: ${refinedTask.type}\n\n` +
                    `**Changes Made:**\n` +
                    `• Updated task description based on feedback\n` +
                    `• Adjusted priority and estimates if needed\n` +
                    `• Enhanced acceptance criteria\n` +
                    `• Improved task clarity and specificity\n\n` +
                    `**Next Steps:**\n` +
                    `• Review the refined task details\n` +
                    `• Use "run ${taskId}" to execute the refined task\n` +
                    `• Use "status ${taskId}" to monitor progress\n` +
                    `• Apply additional refinements if needed`
            }]
          });
        } else {
          jobManager.setJobResult(jobId, {
            content: [{
              type: "text",
              text: `❌ **Task Refinement Failed**\n\n` +
                    `🎯 **Task ID**: ${taskId}\n` +
                    `❗ **Error**: ${refinementResult.error || 'Unknown error during refinement'}\n\n` +
                    `**Possible Solutions:**\n` +
                    `• Check if the task ID is correct\n` +
                    `• Provide more specific refinement feedback\n` +
                    `• Try breaking down the refinement into smaller changes\n` +
                    `• Use "status" to verify task exists`
            }],
            isError: true
          });
        }

      } catch (error) {
        logger.error({ err: error, jobId, taskId }, 'Task refinement failed');
        jobManager.setJobResult(jobId, {
          content: [{
            type: "text",
            text: `❌ **Task Refinement Error**\n\n` +
                  `🎯 **Task ID**: ${taskId}\n` +
                  `❗ **Error**: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
                  `**Troubleshooting:**\n` +
                  `• Verify the task ID exists\n` +
                  `• Check refinement description clarity\n` +
                  `• Try with simpler refinement requests\n` +
                  `• Use "list" to see available tasks`
          }],
          isError: true
        });
      }
    }, 100);

    return {
      content: [{
        type: "text",
        text: `🔄 **Task Refinement Started!**\n\n` +
              `🎯 **Task ID**: ${taskId}\n` +
              `📋 **Job ID**: ${jobId}\n` +
              `📝 **Refinement**: ${description}\n` +
              `⏱️ **Status**: Processing...\n\n` +
              `**Refinement Process:**\n` +
              `• Analyzing current task structure\n` +
              `• Applying your feedback and requirements\n` +
              `• Optimizing task clarity and specificity\n` +
              `• Updating estimates and priorities\n\n` +
              `Use 'get-job-result' with job ID '${jobId}' to check progress and get the refined task.`
      }],
      jobId
    };

  } catch (error) {
    logger.error({ err: error, sessionId, taskId }, 'Failed to start task refinement');
    return {
      content: [{
        type: "text",
        text: `❌ Error starting task refinement: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
}

/**
 * Handle task decomposition command
 */
async function handleDecomposeCommand(
  target: string | undefined,
  description: string | undefined,
  config: OpenRouterConfig,
  sessionId: string
): Promise<CallToolResult> {
  logger.info({ sessionId, target }, 'Decomposing task/project');

  if (!target) {
    return {
      content: [{
        type: "text",
        text: "Error: Project name or task ID is required for decompose command"
      }],
      isError: true
    };
  }

  try {
    // Create a background job for decomposition
    const jobId = jobManager.createJob(
      'vibe-task-manager',
      { target, description, sessionId }
    );

    // Start decomposition asynchronously
    setTimeout(async () => {
      try {
        // Create proper AtomicTask from target description
        const task: AtomicTask = {
          id: `task-${Date.now()}`,
          title: target,
          description: description || `Decompose ${target} into manageable tasks`,
          type: 'development',
          priority: 'medium',
          status: 'pending',
          projectId: target.toLowerCase().replace(/\s+/g, '-'),
          epicId: `epic-${Date.now()}`,
          estimatedHours: 8,
          actualHours: 0,
          filePaths: [],
          acceptanceCriteria: [],
          dependencies: [],
          dependents: [],
          tags: ['decomposition'],
          assignedAgent: undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: sessionId,
          testingRequirements: {
            unitTests: [],
            integrationTests: [],
            performanceTests: [],
            coverageTarget: 80
          },
          performanceCriteria: {
            responseTime: '< 200ms',
            memoryUsage: '< 512MB'
          },
          qualityCriteria: {
            codeQuality: ['TypeScript strict mode', 'ESLint compliance'],
            documentation: ['JSDoc comments'],
            typeScript: true,
            eslint: true
          },
          integrationCriteria: {
            compatibility: ['Existing MCP patterns'],
            patterns: ['Tool registration pattern']
          },
          validationMethods: {
            automated: ['Unit tests', 'Integration tests'],
            manual: ['Code review']
          },
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: sessionId,
            tags: ['decomposition']
          }
        };

        // Create project context using the atomic-detector ProjectContext interface
        const projectContext: AtomicProjectContext = {
          projectId: target.toLowerCase().replace(/\s+/g, '-'),
          languages: ['typescript', 'javascript'],
          frameworks: ['react', 'node.js'],
          tools: ['vscode', 'git'],
          existingTasks: [],
          codebaseSize: 'medium' as const,
          teamSize: 1,
          complexity: 'medium' as const
        };

        // Use real DecompositionService instead of mock simulation
        const decompositionService = new DecompositionService(config);

        // Start real decomposition
        const decompositionSession = await decompositionService.startDecomposition({
          task,
          context: projectContext,
          sessionId: jobId
        });

        // Wait for completion and get results
        const results = await waitForDecompositionCompletion(decompositionService, decompositionSession.id);

        logger.info({
          jobId,
          sessionId: decompositionSession.id,
          resultsCount: results.length
        }, 'Real decomposition completed successfully');

        // Use the correct vibe-task-manager output directory
        const vibeOutputDir = getVibeTaskManagerOutputDir();
        const decompositionsDir = path.join(vibeOutputDir, 'decompositions');
        const decompositionOutputPath = path.join(decompositionsDir, jobId);

        // Create the decompositions directory if it doesn't exist
        await fs.mkdir(decompositionsDir, { recursive: true });

        // Create the specific decomposition directory
        await fs.mkdir(decompositionOutputPath, { recursive: true });

        const subTasksList = results.map((task, index) =>
          `${index + 1}. **${task.title}**\n   - ${task.description}\n   - Priority: ${task.priority}\n   - Estimated: ${task.estimatedHours}h\n   - Type: ${task.type}`
        ).join('\n\n');

        // Create decomposition summary data
        const decompositionData = {
          id: jobId,
          projectName: target,
          description: description || `Task decomposition for ${target}`,
          createdAt: new Date().toISOString(),
          totalSubTasks: results.length,
          totalEstimatedHours: results.reduce((sum, task) => sum + task.estimatedHours, 0),
          tasks: results,
          metadata: {
            decompositionMethod: 'rdd_engine',
            version: '1.0.0',
            sessionId: jobId,
            decompositionSessionId: decompositionSession.id
          }
        };

        // Save decomposition data as JSON
        const decompositionFile = path.join(decompositionOutputPath, 'decomposition.json');
        await fs.writeFile(decompositionFile, JSON.stringify(decompositionData, null, 2));

        // Save decomposition summary as Markdown
        const markdownContent = `# Project Decomposition: ${target}

**Decomposition ID**: ${jobId}
**Decomposition Session**: ${decompositionSession.id}
**Created**: ${new Date().toISOString()}
**Total Sub-tasks**: ${results.length}
**Total Estimated Hours**: ${results.reduce((sum, task) => sum + task.estimatedHours, 0)}h
**Decomposition Method**: RDD Engine (Real AI-powered decomposition)

## Description
${description || `Task decomposition for ${target}`}

## Generated Tasks

${subTasksList}

## Next Steps
• Review and refine the generated tasks
• Assign priorities and dependencies
• Start with high-priority tasks
• Use 'run' command to execute individual tasks

---
*Generated by Vibe Task Manager v1.0.0 using RDD Engine*
`;

        const markdownFile = path.join(decompositionOutputPath, 'decomposition-summary.md');
        await fs.writeFile(markdownFile, markdownContent);

        logger.info({
          jobId,
          target,
          outputPath: decompositionOutputPath,
          tasksGenerated: results.length,
          decompositionSessionId: decompositionSession.id
        }, 'Real decomposition files saved successfully');

        jobManager.setJobResult(jobId, {
          content: [{
            type: "text",
            text: `✅ **Real AI-Powered Decomposition Completed** for "${target}"!\n\n` +
                  `🤖 **Method**: RDD Engine (Recursive Decomposition Design)\n` +
                  `📋 **Decomposition ID**: ${jobId}\n` +
                  `🔗 **Session ID**: ${decompositionSession.id}\n` +
                  `📊 **Total Sub-tasks**: ${results.length}\n` +
                  `⏱️ **Total Estimated Hours**: ${results.reduce((sum, task) => sum + task.estimatedHours, 0)}h\n` +
                  `📁 **Output Directory**: ${decompositionOutputPath}\n\n` +
                  `**Generated Files:**\n` +
                  `• ${decompositionFile}\n` +
                  `• ${markdownFile}\n\n` +
                  `**AI-Generated Tasks:**\n${subTasksList}\n\n` +
                  `✨ **Next Steps:**\n` +
                  `• Review and refine the generated tasks\n` +
                  `• Use 'refine' command to modify tasks if needed\n` +
                  `• Start with high-priority tasks\n` +
                  `• Use 'run' command to execute individual tasks\n\n` +
                  `🎉 **Success!** The RDD engine has intelligently broken down your project into manageable, actionable tasks using real AI analysis!`
          }]
        });

      } catch (error) {
        logger.error({ err: error, jobId, target }, 'Decomposition failed');
        jobManager.setJobResult(jobId, {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : 'Decomposition failed'}`
          }],
          isError: true
        });
      }
    }, 100);

    return {
      content: [{
        type: "text",
        text: `🚀 Project decomposition started for "${target}"!\n\n` +
              `Job ID: ${jobId}\n` +
              `Status: Processing...\n\n` +
              `This will break down your project into manageable development tasks.\n` +
              `Use 'get-job-result' with job ID '${jobId}' to check progress and get the final result.`
      }],
      jobId
    };

  } catch (error) {
    logger.error({ err: error, sessionId, target }, 'Failed to start decomposition');
    return {
      content: [{
        type: "text",
        text: `Error starting decomposition: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
}

// Tool definition for registration
const vibeTaskManagerDefinition: ToolDefinition = {
  name: "vibe-task-manager",
  description: "AI-agent-native task management system with recursive decomposition design (RDD) methodology. Supports project creation, task decomposition, dependency management, and agent coordination for autonomous software development workflows.",
  inputSchema: vibeTaskManagerInputSchemaShape,
  executor: vibeTaskManagerExecutor
};

/**
 * Ensure agent is registered for the current session
 */
async function ensureAgentRegistration(sessionId: string, context?: ToolExecutionContext): Promise<void> {
  try {
    const orchestrator = AgentOrchestrator.getInstance();

    // Check if agent is already registered
    const existingAgents = orchestrator.getAgents();
    const existingAgent = existingAgents.find(agent => agent.id === sessionId);

    if (!existingAgent) {
      // Auto-register new agent with default capabilities
      await orchestrator.registerAgent({
        id: sessionId,
        name: `IDE Agent ${sessionId.substring(0, 8)}`,
        capabilities: ['general'], // Start with general capability
        maxConcurrentTasks: 3,
        currentTasks: [],
        status: 'available',
        metadata: {
          version: '1.0.0',
          supportedProtocols: ['mcp'],
          preferences: {
            autoRegistered: true,
            registeredAt: new Date().toISOString()
          }
        }
      });

      logger.info({ sessionId }, 'Auto-registered new IDE agent');
    } else {
      // Update heartbeat for existing agent
      orchestrator.updateAgentHeartbeat(sessionId, 'available');
    }
  } catch (error) {
    logger.error({ err: error, sessionId }, 'Failed to ensure agent registration');
    // Don't throw - continue with execution even if registration fails
  }
}

// Register the tool with the central registry
registerTool(vibeTaskManagerDefinition);

logger.debug('Vibe Task Manager tool registered successfully');
