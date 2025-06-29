/**
 * Artifact NLP Handlers
 *
 * Implements natural language handlers for PRD and task list parsing
 * using the existing artifact integration services.
 */

import { Intent, RecognizedIntent } from '../../types/nl.js';
import { CommandHandler, CommandExecutionContext, CommandExecutionResult } from '../command-handlers.js';
import { PRDIntegrationService } from '../../integrations/prd-integration.js';
import { TaskListIntegrationService } from '../../integrations/task-list-integration.js';
import { getProjectOperations } from '../../core/operations/project-operations.js';
import { DecompositionService } from '../../services/decomposition-service.js';
import logger from '../../../../logger.js';

/**
 * Parse PRD Handler
 * Handles natural language requests to parse existing PRDs
 */
export class ParsePRDHandler implements CommandHandler {
  intent: Intent = 'parse_prd';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    try {
      logger.info({
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Processing PRD parsing request');

      // Extract parameters from natural language
      const projectName = this.extractProjectName(recognizedIntent, toolParams);
      const filePath = this.extractFilePath(recognizedIntent, toolParams);

      // Get PRD integration service
      const prdService = PRDIntegrationService.getInstance();

      // Detect existing PRD
      let prdInfo;
      if (filePath) {
        // Use specific file path
        const result = await prdService.parsePRD(filePath);
        if (!result.success) {
          return {
            success: false,
            result: {
              content: [{
                type: "text",
                text: `❌ Failed to parse PRD from ${filePath}: ${result.error}`
              }],
              isError: true
            }
          };
        }
        prdInfo = result.prdData!;
      } else {
        // Auto-detect PRD
        const detectedPRD = await prdService.detectExistingPRD(projectName);
        if (!detectedPRD) {
          return {
            success: false,
            result: {
              content: [{
                type: "text",
                text: `❌ No PRD found${projectName ? ` for project "${projectName}"` : ''}. Please ensure a PRD exists in the VibeCoderOutput/prd-generator/ directory.`
              }],
              isError: true
            }
          };
        }

        // Parse the detected PRD
        const result = await prdService.parsePRD(detectedPRD.filePath);
        if (!result.success) {
          return {
            success: false,
            result: {
              content: [{
                type: "text",
                text: `❌ Failed to parse PRD: ${result.error}`
              }],
              isError: true
            }
          };
        }
        prdInfo = result.prdData!;
      }

      // Create project from PRD
      const projectOperations = getProjectOperations();
      const projectResult = await projectOperations.createProjectFromPRD(prdInfo, context.sessionId);

      if (!projectResult.success) {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: `❌ Failed to create project from PRD: ${projectResult.error}`
            }],
            isError: true
          }
        };
      }

      const project = projectResult.data!;

      // Format successful PRD parsing results
      let responseText = `✅ Successfully parsed PRD "${prdInfo.metadata.projectName}" and created project:\n\n`;
      responseText += `📋 **Project Details:**\n`;
      responseText += `- Project ID: ${project.id}\n`;
      responseText += `- Name: ${project.name}\n`;
      responseText += `- Description: ${prdInfo.overview.description.substring(0, 200)}${prdInfo.overview.description.length > 200 ? '...' : ''}\n`;
      responseText += `- Features: ${prdInfo.features.length} features identified\n`;
      responseText += `- Tech Stack: ${prdInfo.technical.techStack.slice(0, 3).join(', ')}${prdInfo.technical.techStack.length > 3 ? '...' : ''}\n\n`;

      responseText += `🎯 **Key Features:**\n`;
      prdInfo.features.slice(0, 5).forEach((feature, index) => {
        responseText += `${index + 1}. ${feature.title} (${feature.priority})\n`;
      });
      if (prdInfo.features.length > 5) {
        responseText += `... and ${prdInfo.features.length - 5} more features\n`;
      }

      responseText += `\n📊 **Next Steps:**\n`;
      responseText += `- Epic generation from PRD features\n`;
      responseText += `- Task decomposition for each epic\n`;
      responseText += `- Agent assignment and execution planning\n`;

      return {
        success: true,
        result: {
          content: [{
            type: "text",
            text: responseText
          }]
        },
        followUpSuggestions: [
          `Generate epics for project ${project.id}`,
          `List all features from the PRD`,
          `Start task decomposition for ${project.name}`
        ]
      };

    } catch (error) {
      logger.error({
        err: error,
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'PRD parsing failed');

      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `❌ Failed to parse PRD: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        }
      };
    }
  }

  /**
   * Extract project name from natural language input
   */
  private extractProjectName(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>): string | undefined {
    // Check tool params first
    if (toolParams.projectName) {
      return toolParams.projectName as string;
    }

    // Extract from entities
    const projectEntity = recognizedIntent.entities.find(e => e.type === 'projectName');
    if (projectEntity) {
      return projectEntity.value;
    }

    // Pattern matching from original input
    const input = recognizedIntent.originalInput;
    const projectMatch = input.match(/(?:for|of)\s+(?:project\s+)?["']?([^"'\s]+)["']?/i);
    if (projectMatch) {
      return projectMatch[1];
    }

    return undefined;
  }

  /**
   * Extract file path from natural language input
   */
  private extractFilePath(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>): string | undefined {
    // Check tool params first
    if (toolParams.filePath) {
      return toolParams.filePath as string;
    }

    // Extract from entities
    const fileEntity = recognizedIntent.entities.find(e => e.type === 'filePath');
    if (fileEntity) {
      return fileEntity.value;
    }

    // Pattern matching for file paths
    const input = recognizedIntent.originalInput;
    const fileMatch = input.match(/(?:from|at)\s+["']?([^"'\s]+\.md)["']?/i);
    if (fileMatch) {
      return fileMatch[1];
    }

    return undefined;
  }
}

/**
 * Parse Tasks Handler
 * Handles natural language requests to parse existing task lists
 */
export class ParseTasksHandler implements CommandHandler {
  intent: Intent = 'parse_tasks';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    try {
      logger.info({
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Processing task list parsing request');

      // Extract parameters from natural language
      const projectName = this.extractProjectName(recognizedIntent, toolParams);
      const filePath = this.extractFilePath(recognizedIntent, toolParams);

      // Get task list integration service
      const taskListService = TaskListIntegrationService.getInstance();

      // Detect existing task list
      let taskListInfo;
      if (filePath) {
        // Use specific file path
        const result = await taskListService.parseTaskList(filePath);
        if (!result.success) {
          return {
            success: false,
            result: {
              content: [{
                type: "text",
                text: `❌ Failed to parse task list from ${filePath}: ${result.error}`
              }],
              isError: true
            }
          };
        }
        taskListInfo = result.taskListData!;
      } else {
        // Auto-detect task list
        const detectedTaskList = await taskListService.detectExistingTaskList(projectName);
        if (!detectedTaskList) {
          return {
            success: false,
            result: {
              content: [{
                type: "text",
                text: `❌ No task list found${projectName ? ` for project "${projectName}"` : ''}. Please ensure a task list exists in the VibeCoderOutput/generated_task_lists/ directory.`
              }],
              isError: true
            }
          };
        }

        // Parse the detected task list
        const result = await taskListService.parseTaskList(detectedTaskList.filePath);
        if (!result.success) {
          return {
            success: false,
            result: {
              content: [{
                type: "text",
                text: `❌ Failed to parse task list: ${result.error}`
              }],
              isError: true
            }
          };
        }
        taskListInfo = result.taskListData!;
      }

      // Create project and tasks from task list
      const projectOperations = getProjectOperations();
      const projectResult = await projectOperations.createProjectFromTaskList(taskListInfo, context.sessionId);

      if (!projectResult.success) {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: `❌ Failed to create project from task list: ${projectResult.error}`
            }],
            isError: true
          }
        };
      }

      const project = projectResult.data!;

      // Convert task list to atomic tasks
      const atomicTasks = await taskListService.convertToAtomicTasks(
        taskListInfo,
        project.id,
        'default-epic',
        'system'
      );

      // Format successful task list parsing results
      let responseText = `✅ Successfully parsed task list "${taskListInfo.metadata.projectName}" and created project:\n\n`;
      responseText += `📋 **Project Details:**\n`;
      responseText += `- Project ID: ${project.id}\n`;
      responseText += `- Name: ${project.name}\n`;
      responseText += `- Description: ${taskListInfo.overview.description.substring(0, 200)}${taskListInfo.overview.description.length > 200 ? '...' : ''}\n`;
      responseText += `- Phases: ${taskListInfo.phases.length} phases identified\n`;
      responseText += `- Total Tasks: ${taskListInfo.metadata.totalTasks}\n`;
      responseText += `- Estimated Hours: ${taskListInfo.statistics.totalEstimatedHours}\n\n`;

      responseText += `📊 **Phase Breakdown:**\n`;
      taskListInfo.phases.slice(0, 5).forEach((phase, index) => {
        responseText += `${index + 1}. ${phase.name} (${phase.tasks.length} tasks)\n`;
      });
      if (taskListInfo.phases.length > 5) {
        responseText += `... and ${taskListInfo.phases.length - 5} more phases\n`;
      }

      responseText += `\n🎯 **Atomic Tasks Created:**\n`;
      responseText += `- ${atomicTasks.length} atomic tasks ready for execution\n`;
      responseText += `- Average task size: ${(taskListInfo.statistics.totalEstimatedHours / atomicTasks.length).toFixed(1)} hours\n`;

      responseText += `\n📊 **Next Steps:**\n`;
      responseText += `- Agent assignment for task execution\n`;
      responseText += `- Dependency resolution and scheduling\n`;
      responseText += `- Progress tracking and monitoring\n`;

      return {
        success: true,
        result: {
          content: [{
            type: "text",
            text: responseText
          }]
        },
        followUpSuggestions: [
          `List all tasks for project ${project.id}`,
          `Start task execution for ${project.name}`,
          `Show task dependencies for ${project.name}`
        ]
      };

    } catch (error) {
      logger.error({
        err: error,
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Task list parsing failed');

      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `❌ Failed to parse task list: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        }
      };
    }
  }

  /**
   * Extract project name from natural language input
   */
  private extractProjectName(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>): string | undefined {
    // Check tool params first
    if (toolParams.projectName) {
      return toolParams.projectName as string;
    }

    // Extract from entities
    const projectEntity = recognizedIntent.entities.find(e => e.type === 'projectName');
    if (projectEntity) {
      return projectEntity.value;
    }

    // Pattern matching from original input
    const input = recognizedIntent.originalInput;
    const projectMatch = input.match(/(?:for|of)\s+(?:project\s+)?["']?([^"'\s]+)["']?/i);
    if (projectMatch) {
      return projectMatch[1];
    }

    return undefined;
  }

  /**
   * Extract file path from natural language input
   */
  private extractFilePath(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>): string | undefined {
    // Check tool params first
    if (toolParams.filePath) {
      return toolParams.filePath as string;
    }

    // Extract from entities
    const fileEntity = recognizedIntent.entities.find(e => e.type === 'filePath');
    if (fileEntity) {
      return fileEntity.value;
    }

    // Pattern matching for file paths
    const input = recognizedIntent.originalInput;
    const fileMatch = input.match(/(?:from|at)\s+["']?([^"'\s]+\.md)["']?/i);
    if (fileMatch) {
      return fileMatch[1];
    }

    return undefined;
  }
}

/**
 * Import Artifact Handler
 * Handles natural language requests to import artifacts with type routing
 */
export class ImportArtifactHandler implements CommandHandler {
  intent: Intent = 'import_artifact';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    try {
      logger.info({
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Processing artifact import request');

      // Extract artifact type from natural language
      const artifactType = this.extractArtifactType(recognizedIntent, toolParams);

      if (!artifactType) {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: "❌ Please specify the artifact type to import. For example: 'import PRD' or 'import task list'"
            }],
            isError: true
          }
        };
      }

      // Route to appropriate handler based on artifact type
      switch (artifactType.toLowerCase()) {
        case 'prd':
        case 'product_requirements_document':
          const prdHandler = new ParsePRDHandler();
          return await prdHandler.handle(recognizedIntent, toolParams, context);

        case 'task_list':
        case 'tasks':
        case 'task-list':
          const taskHandler = new ParseTasksHandler();
          return await taskHandler.handle(recognizedIntent, toolParams, context);

        default:
          return {
            success: false,
            result: {
              content: [{
                type: "text",
                text: `❌ Unsupported artifact type: "${artifactType}". Supported types are: PRD, task list`
              }],
              isError: true
            }
          };
      }

    } catch (error) {
      logger.error({
        err: error,
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Artifact import failed');

      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `❌ Failed to import artifact: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        }
      };
    }
  }

  /**
   * Extract artifact type from natural language input
   */
  private extractArtifactType(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>): string | undefined {
    // Check tool params first
    if (toolParams.artifactType) {
      return toolParams.artifactType as string;
    }

    // Extract from entities
    const artifactEntity = recognizedIntent.entities.find(e => e.type === 'artifactType');
    if (artifactEntity) {
      return artifactEntity.value;
    }

    // Pattern matching from original input
    const input = recognizedIntent.originalInput.toLowerCase();

    // Check for PRD patterns
    if (input.includes('prd') || input.includes('product requirements') || input.includes('requirements document')) {
      return 'prd';
    }

    // Check for task list patterns
    if (input.includes('task list') || input.includes('tasks') || input.includes('task-list')) {
      return 'task_list';
    }

    // Check for generic artifact mention
    if (input.includes('artifact')) {
      // Try to infer from context
      if (input.includes('generator')) {
        if (input.includes('prd-generator')) {
          return 'prd';
        } else if (input.includes('task-list-generator')) {
          return 'task_list';
        }
      }
    }

    return undefined;
  }
}
