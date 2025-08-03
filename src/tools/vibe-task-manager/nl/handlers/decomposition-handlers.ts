/**
 * Decomposition NLP Handlers
 *
 * Implements natural language handlers for task and project decomposition
 * using the existing DecompositionService infrastructure.
 */

import { Intent, RecognizedIntent } from '../../types/nl.js';
import { CommandHandler, CommandExecutionContext, CommandExecutionResult } from '../command-handlers.js';
import { DecompositionService } from '../../services/decomposition-service.js';
import { getTaskOperations } from '../../core/operations/task-operations.js';
import { getProjectOperations } from '../../core/operations/project-operations.js';
import { getEpicService } from '../../services/epic-service.js';
import type { AtomicTask } from '../../types/task.js';
import { ProjectAnalyzer } from '../../utils/project-analyzer.js';
import { getPathResolver } from '../../utils/path-resolver.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import logger from '../../../../logger.js';

/**
 * Epic decomposition options interface
 * Provides type-safe configuration for epic decomposition operations
 */
interface EpicDecompositionOptions {
  maxDepth: number;
  maxSubTasks: number;
  minConfidence: number;
  enableParallelDecomposition: boolean;
  epicTimeLimit: number;
  minHours: number;
  maxHours: number;
  force: boolean;
  timeouts: {
    readonly taskDecomposition: number;
    readonly recursiveTaskDecomposition: number;
    readonly llmRequest: number;
  };
  retryPolicy: {
    readonly maxRetries: number;
    readonly backoffMultiplier: number;
    readonly initialDelayMs: number;
    readonly maxDelayMs: number;
    readonly enableExponentialBackoff: boolean;
  };
}

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
    functionalArea: partialTask.functionalArea || 'data-management',
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
 * Decompose Task Handler
 * Handles natural language requests to decompose tasks
 */
export class DecomposeTaskHandler implements CommandHandler {
  intent: Intent = 'decompose_task';

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
    try {
      logger.info({
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Processing task decomposition request');

      // Extract parameters from natural language
      const taskId = this.extractTaskId(recognizedIntent, toolParams);
      const additionalContext = this.extractAdditionalContext(recognizedIntent, toolParams);
      const options = this.extractDecompositionOptions(recognizedIntent, toolParams);

      if (!taskId) {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: "❌ Please specify a task ID to decompose. For example: 'decompose task T001' or 'break down the authentication task'"
            }],
            isError: true
          }
        };
      }

      // Validate task exists
      const taskOperations = getTaskOperations();
      const taskResult = await taskOperations.getTask(taskId);

      if (!taskResult.success) {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: `❌ Task ${taskId} not found. Please check the task ID and try again.`
            }],
            isError: true
          }
        };
      }

      const task = taskResult.data!;

      // Initialize decomposition service
      const decompositionService = new DecompositionService(context.config);

      // Get project analyzer for dynamic detection
      const projectAnalyzer = ProjectAnalyzer.getInstance();
      const projectPath = this.resolveProjectPath(context); // Use proper path resolution

      // Detect project characteristics dynamically
      let languages: string[];
      let frameworks: string[];
      let tools: string[];

      try {
        languages = await projectAnalyzer.detectProjectLanguages(projectPath);
      } catch (error) {
        logger.warn({ error, projectPath }, 'Language detection failed, using fallback');
        languages = ['javascript']; // fallback
      }

      try {
        frameworks = await projectAnalyzer.detectProjectFrameworks(projectPath);
      } catch (error) {
        logger.warn({ error, projectPath }, 'Framework detection failed, using fallback');
        frameworks = ['node.js']; // fallback
      }

      try {
        tools = await projectAnalyzer.detectProjectTools(projectPath);
      } catch (error) {
        logger.warn({ error, projectPath }, 'Tools detection failed, using fallback');
        tools = ['git', 'npm']; // fallback
      }

      // Create decomposition request
      const decompositionRequest = {
        task: await createCompleteAtomicTask({
          id: task.id,
          title: task.title,
          description: additionalContext || task.description,
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
          description: `Task decomposition context for ${task.title}`,
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
            contextSummary: `Task decomposition context for ${task.title}`,
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
        sessionId: `nl-decompose-${context.sessionId}`,
        options: {
          maxDepth: options.maxDepth || 3,
          minHours: options.minHours || 0.5,
          maxHours: options.maxHours || 8,
          forceDecomposition: options.force || false
        }
      };

      // Start decomposition
      const session = await decompositionService.startDecomposition(decompositionRequest);

      // Wait for decomposition to complete (with timeout)
      const timeout = 30000; // 30 seconds
      const startTime = Date.now();

      while ((session.status === 'pending' || session.status === 'in_progress') && (Date.now() - startTime) < timeout) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Refresh session status
        const updatedSession = decompositionService.getSession(session.id);
        if (updatedSession) {
          Object.assign(session, updatedSession);
        }
      }

      if (session.status === 'pending' || session.status === 'in_progress') {
        return {
          success: true,
          result: {
            content: [{
              type: "text",
              text: `⏳ Task decomposition is in progress for "${task.title}". This may take a few moments. Session ID: ${session.id}`
            }]
          }
        };
      }

      if (session.status === 'failed') {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: `❌ Task decomposition failed: ${session.error || 'Unknown error'}`
            }],
            isError: true
          }
        };
      }

      // Format successful decomposition results
      if (session.results && session.results.length > 0 && session.results[0].subTasks.length > 0) {
        const decomposedTasks = session.results[0].subTasks;
        const totalHours = decomposedTasks.reduce((sum, task) => sum + task.estimatedHours, 0);

        let responseText = `✅ Successfully decomposed "${task.title}" into ${decomposedTasks.length} atomic tasks:\n\n`;

        decomposedTasks.forEach((atomicTask, index) => {
          responseText += `${index + 1}. **${atomicTask.title}** (${atomicTask.estimatedHours}h)\n`;
          responseText += `   - Type: ${atomicTask.type}, Priority: ${atomicTask.priority}\n`;
          responseText += `   - ID: ${atomicTask.id}\n`;
          if (atomicTask.filePaths && atomicTask.filePaths.length > 0) {
            responseText += `   - Files: ${atomicTask.filePaths.slice(0, 3).join(', ')}${atomicTask.filePaths.length > 3 ? '...' : ''}\n`;
          }
          responseText += '\n';
        });

        responseText += `📊 **Summary:**\n`;
        responseText += `- Total estimated hours: ${totalHours}\n`;
        responseText += `- Average task size: ${(totalHours / decomposedTasks.length).toFixed(1)} hours\n`;

        return {
          success: true,
          result: {
            content: [{
              type: "text",
              text: responseText
            }]
          },
          followUpSuggestions: [
            `List all tasks for project ${task.projectId}`,
            `Show details for task ${decomposedTasks[0]?.id}`,
            'Create a new task'
          ]
        };
      } else {
        return {
          success: true,
          result: {
            content: [{
              type: "text",
              text: `ℹ️ Task "${task.title}" is already atomic and doesn't need further decomposition.`
            }]
          }
        };
      }

    } catch (error) {
      logger.error({
        err: error,
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Task decomposition failed');

      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `❌ Failed to decompose task: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        }
      };
    }
  }

  /**
   * Extract task ID from natural language input
   */
  private extractTaskId(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>): string | null {
    // Check tool params first
    if (toolParams.taskId) {
      return toolParams.taskId as string;
    }

    // Extract from entities
    const taskEntity = recognizedIntent.entities.find(e => e.type === 'taskId');
    if (taskEntity) {
      return taskEntity.value;
    }

    // Pattern matching from original input
    const input = recognizedIntent.originalInput.toLowerCase();

    // Look for task ID patterns (T001, TASK-123, etc.)
    const taskIdMatch = input.match(/\b(t\d+|task[-_]?\d+|[a-z]+-\d+)\b/i);
    if (taskIdMatch) {
      return taskIdMatch[1].toUpperCase();
    }

    // Look for "the X task" patterns
    const taskNameMatch = input.match(/(?:the\s+)?(\w+)\s+task/i);
    if (taskNameMatch) {
      return taskNameMatch[1]; // Return the task name, might need lookup
    }

    return null;
  }

  /**
   * Extract additional context from natural language input
   */
  private extractAdditionalContext(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>): string | null {
    // Check tool params
    if (toolParams.description || toolParams.context) {
      return (toolParams.description || toolParams.context) as string;
    }

    // Look for context phrases in the input
    const input = recognizedIntent.originalInput;
    const contextPhrases = [
      /with\s+focus\s+on\s+(.+)/i,
      /considering\s+(.+)/i,
      /taking\s+into\s+account\s+(.+)/i,
      /for\s+(.+)/i
    ];

    for (const phrase of contextPhrases) {
      const match = input.match(phrase);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract decomposition options from natural language input
   */
  private extractDecompositionOptions(recognizedIntent: RecognizedIntent, _toolParams: Record<string, unknown>): Record<string, unknown> {
    const options: Record<string, unknown> = {};

    // Check for force decomposition
    if (recognizedIntent.originalInput.toLowerCase().includes('force') ||
        recognizedIntent.originalInput.toLowerCase().includes('anyway')) {
      options.force = true;
    }

    // Check for size preferences
    const input = recognizedIntent.originalInput.toLowerCase();
    if (input.includes('small') || input.includes('tiny')) {
      options.maxHours = 4;
    } else if (input.includes('large') || input.includes('big')) {
      options.maxHours = 12;
    }

    // Extract numeric values
    const hoursMatch = input.match(/(\d+)\s*hours?/);
    if (hoursMatch) {
      options.maxHours = parseInt(hoursMatch[1], 10);
    }

    return options;
  }
}

/**
 * Decompose Epic Handler
 * Handles natural language requests to decompose epics into tasks
 */
export class DecomposeEpicHandler implements CommandHandler {
  intent: Intent = 'decompose_epic';

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
    try {
      logger.info({
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Processing epic decomposition request');

      // Extract parameters from natural language
      const epicId = this.extractEpicId(recognizedIntent, toolParams);
      const additionalContext = this.extractAdditionalContext(recognizedIntent, toolParams);
      const options = await this.extractDecompositionOptions(recognizedIntent, toolParams);

      if (!epicId) {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: "❌ Please specify an epic ID to decompose. For example: 'decompose epic E001' or 'break down the authentication epic'"
            }],
            isError: true
          }
        };
      }

      // Validate epic exists
      const epicService = getEpicService();
      const epicResult = await epicService.getEpic(epicId);

      if (!epicResult.success) {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: `❌ Epic ${epicId} not found. Please check the epic ID and try again.`
            }],
            isError: true
          }
        };
      }

      const epic = epicResult.data!;

      // Initialize decomposition service
      const decompositionService = new DecompositionService(context.config);

      // Get project analyzer for dynamic detection
      const projectAnalyzer = ProjectAnalyzer.getInstance();
      const projectPath = this.resolveProjectPath(context);

      // Detect project characteristics dynamically
      let languages: string[];
      let frameworks: string[];
      let tools: string[];

      try {
        languages = await projectAnalyzer.detectProjectLanguages(projectPath);
      } catch (error) {
        logger.warn({ error, projectPath }, 'Language detection failed, using fallback');
        languages = ['javascript'];
      }

      try {
        frameworks = await projectAnalyzer.detectProjectFrameworks(projectPath);
      } catch (error) {
        logger.warn({ error, projectPath }, 'Framework detection failed, using fallback');
        frameworks = ['node.js'];
      }

      try {
        tools = await projectAnalyzer.detectProjectTools(projectPath);
      } catch (error) {
        logger.warn({ error, projectPath }, 'Tools detection failed, using fallback');
        tools = ['git', 'npm'];
      }

      // Create a synthetic task from epic for decomposition workflow
      const epicAsTask = await createCompleteAtomicTask({
        id: `epic-decomp-${epic.id}`,
        title: `Decompose Epic: ${epic.title}`,
        description: additionalContext || epic.description || `Decompose epic ${epic.title} into actionable tasks`,
        type: 'development' as const,
        priority: epic.priority || 'medium',
        estimatedHours: epic.estimatedHours || 8,
        acceptanceCriteria: [`Epic ${epic.title} is fully decomposed into actionable tasks`],
        tags: [...(epic.metadata?.tags || []), 'epic-decomposition'],
        filePaths: [],
        projectId: epic.projectId,
        epicId: epic.id,
        status: 'pending' as const,
        createdBy: context.sessionId,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Create decomposition request
      const decompositionRequest = {
        task: epicAsTask,
        context: {
          projectId: epic.projectId,
          projectPath: process.cwd(),
          projectName: epic.projectId,
          description: `Epic decomposition context for ${epic.title}`,
          languages,
          frameworks,
          buildTools: [],
          tools,
          configFiles: [],
          entryPoints: [],
          architecturalPatterns: [],
          existingTasks: [],
          codebaseSize: 'medium' as const,
          teamSize: 1,
          complexity: 'medium' as const,
          codebaseContext: {
            relevantFiles: [],
            contextSummary: `Epic decomposition context for ${epic.title}`,
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
        sessionId: `nl-epic-decompose-${context.sessionId}`,
        options: {
          maxDepth: options.maxDepth || 2, // Epics to tasks should be shallow
          minHours: options.minHours || 0.1,
          maxHours: options.maxHours || 4,
          forceDecomposition: options.force || true // Always decompose epics
        }
      };

      // Start decomposition
      const session = await decompositionService.startDecomposition(decompositionRequest);

      // Wait for decomposition to complete (with timeout)
      const timeout = 30000; // 30 seconds
      const startTime = Date.now();

      while ((session.status === 'pending' || session.status === 'in_progress') && (Date.now() - startTime) < timeout) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Refresh session status
        const updatedSession = decompositionService.getSession(session.id);
        if (updatedSession) {
          Object.assign(session, updatedSession);
        }
      }

      if (session.status === 'pending' || session.status === 'in_progress') {
        return {
          success: true,
          result: {
            content: [{
              type: "text",
              text: `⏳ Epic decomposition is in progress for "${epic.title}". This may take a few moments. Session ID: ${session.id}`
            }]
          }
        };
      }

      if (session.status === 'failed') {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: `❌ Epic decomposition failed for "${epic.title}". Error: ${session.error || 'Unknown error'}`
            }],
            isError: true
          }
        };
      }

      // Success - return decomposed tasks
      const taskCount = session.persistedTasks?.length || 0;
      const successMessage = `✅ Successfully decomposed epic "${epic.title}" into ${taskCount} actionable tasks.`;

      const tasksList = session.persistedTasks?.map(task => `  • ${task.title} (${task.id})`).join('\n') || '';

      return {
        success: true,
        result: {
          content: [{
            type: "text",
            text: `${successMessage}\n\nGenerated Tasks:\n${tasksList}\n\nSession ID: ${session.id}`
          }]
        }
      };

    } catch (error) {
      logger.error({ err: error }, 'Epic decomposition failed');
      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `❌ Epic decomposition failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        }
      };
    }
  }

  /**
   * Extract epic ID from natural language input
   */
  private extractEpicId(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>): string | null {
    // Check tool params first
    if (toolParams.epicId) {
      return toolParams.epicId as string;
    }

    // Extract from entities
    const epicEntity = recognizedIntent.entities.find(e => e.type === 'epicId');
    if (epicEntity) {
      return epicEntity.value;
    }

    // Pattern matching from original input
    const input = recognizedIntent.originalInput.toLowerCase();

    // Look for epic ID patterns (E001, EPIC-123, etc.)
    const epicIdMatch = input.match(/\b(e\d+|epic[-_]?\d+|[a-z]+-\d+)\b/i);
    if (epicIdMatch) {
      return epicIdMatch[1].toUpperCase();
    }

    // Look for "the X epic" patterns
    const epicNameMatch = input.match(/(?:the\s+)?(\w+)\s+epic/i);
    if (epicNameMatch) {
      return epicNameMatch[1]; // Return the epic name, might need lookup
    }

    return null;
  }

  /**
   * Extract additional context from natural language input
   */
  private extractAdditionalContext(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>): string | null {
    // Check tool params
    if (toolParams.description || toolParams.context) {
      return (toolParams.description || toolParams.context) as string;
    }

    // Look for context phrases in the input
    const input = recognizedIntent.originalInput;
    const contextPhrases = [
      /with\s+focus\s+on\s+(.+)/i,
      /considering\s+(.+)/i,
      /taking\s+into\s+account\s+(.+)/i,
      /for\s+(.+)/i
    ];

    for (const phrase of contextPhrases) {
      const match = input.match(phrase);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract decomposition options from natural language input using centralized configuration
   */
  private async extractDecompositionOptions(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>): Promise<EpicDecompositionOptions> {
    // Get centralized configuration
    const config = await getVibeTaskManagerConfig();
    const rddConfig = config?.taskManager?.rddConfig;
    const timeouts = config?.taskManager?.timeouts;
    const retryPolicy = config?.taskManager?.retryPolicy;

    // Use centralized configuration without hardcoded fallbacks
    if (!config) {
      throw new Error('Centralized configuration not available for epic decomposition');
    }

    const options: EpicDecompositionOptions = {
      maxDepth: rddConfig?.maxDepth ?? config.taskManager.rddConfig.maxDepth,
      maxSubTasks: rddConfig?.maxSubTasks ?? config.taskManager.rddConfig.maxSubTasks,
      minConfidence: rddConfig?.minConfidence ?? config.taskManager.rddConfig.minConfidence,
      enableParallelDecomposition: rddConfig?.enableParallelDecomposition ?? config.taskManager.rddConfig.enableParallelDecomposition,
      epicTimeLimit: rddConfig?.epicTimeLimit ?? config.taskManager.rddConfig.epicTimeLimit,
      minHours: 0.1, // Will be configurable in future updates
      maxHours: Math.floor((rddConfig?.epicTimeLimit ?? config.taskManager.rddConfig.epicTimeLimit) / 8), // Divide epic time limit by reasonable task chunks
      force: true, // Epic decomposition is mandatory
      timeouts: {
        taskDecomposition: timeouts?.taskDecomposition ?? config.taskManager.timeouts.taskDecomposition,
        recursiveTaskDecomposition: timeouts?.recursiveTaskDecomposition ?? config.taskManager.timeouts.recursiveTaskDecomposition,
        llmRequest: timeouts?.llmRequest ?? config.taskManager.timeouts.llmRequest
      },
      retryPolicy: {
        maxRetries: retryPolicy?.maxRetries ?? config.taskManager.retryPolicy.maxRetries,
        backoffMultiplier: retryPolicy?.backoffMultiplier ?? config.taskManager.retryPolicy.backoffMultiplier,
        initialDelayMs: retryPolicy?.initialDelayMs ?? config.taskManager.retryPolicy.initialDelayMs,
        maxDelayMs: retryPolicy?.maxDelayMs ?? config.taskManager.retryPolicy.maxDelayMs,
        enableExponentialBackoff: retryPolicy?.enableExponentialBackoff ?? config.taskManager.retryPolicy.enableExponentialBackoff
      }
    };

    // Override with tool params if provided
    if (toolParams.options && typeof toolParams.options === 'object') {
      const toolOptions = toolParams.options as Partial<EpicDecompositionOptions>;
      Object.assign(options, toolOptions);
    }

    const input = recognizedIntent.originalInput.toLowerCase();

    // Extract depth preference from natural language
    const depthMatch = input.match(/(\d+)\s*levels?/);
    if (depthMatch) {
      const extractedDepth = parseInt(depthMatch[1], 10);
      if (extractedDepth > 0 && extractedDepth <= 5) { // Reasonable bounds
        options.maxDepth = extractedDepth;
      }
    }

    // Extract parallel processing preference
    if (input.includes('parallel') || input.includes('concurrent') || input.includes('simultaneously')) {
      options.enableParallelDecomposition = true;
    } else if (input.includes('sequential') || input.includes('one by one') || input.includes('step by step')) {
      options.enableParallelDecomposition = false;
    }

    return options;
  }
}

/**
 * Decompose Project Handler
 * Handles natural language requests to decompose projects
 */
export class DecomposeProjectHandler implements CommandHandler {
  intent: Intent = 'decompose_project';

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
    try {
      logger.info({
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Processing project decomposition request');

      // Extract project identifier
      const projectId = this.extractProjectId(recognizedIntent, toolParams);
      const additionalContext = this.extractAdditionalContext(recognizedIntent, toolParams);

      if (!projectId) {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: "❌ Please specify a project ID or name to decompose. For example: 'decompose project PID-WEBAPP-001' or 'break down the web app project'"
            }],
            isError: true
          }
        };
      }

      // Validate project exists
      const projectOperations = getProjectOperations();
      const projectResult = await projectOperations.getProject(projectId);

      if (!projectResult.success) {
        return {
          success: false,
          result: {
            content: [{
              type: "text",
              text: `❌ Project ${projectId} not found. Please check the project ID and try again.`
            }],
            isError: true
          }
        };
      }

      const project = projectResult.data!;

      // Initialize decomposition service
      const decompositionService = new DecompositionService(context.config);

      // Create high-level project task for decomposition
      const projectTask = await createCompleteAtomicTask({
        id: `project-${project.id}`,
        title: `Complete ${project.name}`,
        description: additionalContext || project.description,
        type: 'development' as const,
        priority: 'high' as const,
        estimatedHours: 120, // Default project estimate
        acceptanceCriteria: [`Project ${project.name} should be fully implemented and tested`],
        tags: ['project-decomposition', ...project.metadata.tags],
        filePaths: [],
        projectId: project.id,
        epicId: await resolveEpicIdForProject(project.id, project.name),
        createdBy: 'system'
      });

      // Get project analyzer for dynamic detection
      const projectAnalyzer = ProjectAnalyzer.getInstance();
      const projectPath = this.resolveProjectPath(context); // Use proper path resolution

      // Detect project characteristics dynamically with fallbacks
      let languages: string[];
      let frameworks: string[];
      let tools: string[];

      try {
        languages = project.techStack.languages?.length
          ? project.techStack.languages
          : await projectAnalyzer.detectProjectLanguages(projectPath);
      } catch (error) {
        logger.warn({ error, projectPath }, 'Language detection failed for project, using fallback');
        languages = ['typescript']; // fallback
      }

      try {
        frameworks = project.techStack.frameworks?.length
          ? project.techStack.frameworks
          : await projectAnalyzer.detectProjectFrameworks(projectPath);
      } catch (error) {
        logger.warn({ error, projectPath }, 'Framework detection failed for project, using fallback');
        frameworks = ['node.js']; // fallback
      }

      try {
        tools = project.techStack.tools?.length
          ? project.techStack.tools
          : await projectAnalyzer.detectProjectTools(projectPath);
      } catch (error) {
        logger.warn({ error, projectPath }, 'Tools detection failed for project, using fallback');
        tools = ['vscode', 'git']; // fallback
      }

      const decompositionRequest = {
        task: projectTask,
        context: {
          projectId: project.id,
          projectPath: this.resolveProjectPath(context),
          projectName: project.name,
          description: additionalContext || project.description,
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
            contextSummary: additionalContext || project.description,
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
        sessionId: `nl-project-decompose-${context.sessionId}`,
        options: {
          maxDepth: 2, // Project -> Epic -> Task
          minHours: 1,
          maxHours: 8,
          forceDecomposition: true
        }
      };

      // Start decomposition
      const session = await decompositionService.startDecomposition(decompositionRequest);

      return {
        success: true,
        result: {
          content: [{
            type: "text",
            text: `🚀 Started decomposition of project "${project.name}". This will break down the project into manageable epics and tasks. Session ID: ${session.id}\n\nThis process may take a few moments as we analyze the project scope and create a comprehensive breakdown.`
          }]
        },
        followUpSuggestions: [
          `Check decomposition status for session ${session.id}`,
          `List all projects`,
          `Show project details for ${project.id}`
        ]
      };

    } catch (error) {
      logger.error({
        err: error,
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Project decomposition failed');

      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `❌ Failed to decompose project: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        }
      };
    }
  }

  /**
   * Extract project ID from natural language input
   */
  private extractProjectId(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>): string | null {
    // Check tool params first
    if (toolParams.projectId || toolParams.projectName) {
      return (toolParams.projectId || toolParams.projectName) as string;
    }

    // Extract from entities
    const projectEntity = recognizedIntent.entities.find(e => e.type === 'projectId' || e.type === 'projectName');
    if (projectEntity) {
      return projectEntity.value;
    }

    // Pattern matching from original input
    const input = recognizedIntent.originalInput;

    // Look for project ID patterns (PID-XXX-001, etc.)
    const projectIdMatch = input.match(/\b(pid[-_]?\w+[-_]?\d+)\b/i);
    if (projectIdMatch) {
      return projectIdMatch[1].toUpperCase();
    }

    // Look for "the X project" patterns
    const projectNameMatch = input.match(/(?:the\s+)?(.+?)\s+project/i);
    if (projectNameMatch) {
      return projectNameMatch[1].trim();
    }

    return null;
  }

  /**
   * Extract additional context from natural language input
   */
  private extractAdditionalContext(recognizedIntent: RecognizedIntent, toolParams: Record<string, unknown>): string | null {
    // Check tool params
    if (toolParams.description || toolParams.context) {
      return (toolParams.description || toolParams.context) as string;
    }

    // Look for context phrases in the input
    const input = recognizedIntent.originalInput;
    const contextPhrases = [
      /with\s+focus\s+on\s+(.+)/i,
      /considering\s+(.+)/i,
      /for\s+(.+)/i,
      /including\s+(.+)/i
    ];

    for (const phrase of contextPhrases) {
      const match = input.match(phrase);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }
}
