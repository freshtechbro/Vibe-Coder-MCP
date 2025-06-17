import { performFormatAwareLlmCall } from '../../../utils/llmHelper.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { getLLMModelForOperation } from '../utils/config-loader.js';
import { AtomicTask, TaskType, TaskPriority } from '../types/task.js';
import { AtomicTaskDetector, AtomicityAnalysis, ProjectContext } from './atomic-detector.js';
import { getPrompt } from '../services/prompt-service.js';
import { getTimeoutManager } from '../utils/timeout-manager.js';
import logger from '../../../logger.js';

/**
 * Decomposition result for a single task
 * Note: subTasks field contains the decomposed atomic tasks (not sub-tasks in the traditional sense)
 */
export interface DecompositionResult {
  success: boolean;
  isAtomic: boolean;
  originalTask: AtomicTask;
  /** Decomposed atomic tasks (named subTasks for backward compatibility) */
  subTasks: AtomicTask[];
  analysis: AtomicityAnalysis;
  error?: string;
  depth: number;
}

/**
 * Configuration for RDD engine
 */
export interface RDDConfig {
  maxDepth: number;
  maxSubTasks: number;
  minConfidence: number;
  enableParallelDecomposition: boolean;
}

/**
 * RDD (Recursive Decomposition and Decision-making) Engine
 * Implements the core Split-Solve-Merge logic for task decomposition
 */
export class RDDEngine {
  private config: OpenRouterConfig;
  private atomicDetector: AtomicTaskDetector;
  private rddConfig: RDDConfig;
  private activeOperations: Map<string, { startTime: Date; operation: string; taskId: string }> = new Map();

  constructor(config: OpenRouterConfig, rddConfig?: Partial<RDDConfig>) {
    this.config = config;
    this.atomicDetector = new AtomicTaskDetector(config);
    this.rddConfig = {
      maxDepth: 3, // Reduced from 5 to prevent excessive recursion and improve performance
      maxSubTasks: 48, // Increased to allow for more atomic tasks (8 hours / 10 minutes = 48 max tasks)
      minConfidence: 0.8, // Increased confidence threshold for stricter atomic detection
      enableParallelDecomposition: false,
      ...rddConfig
    };
  }

  /**
   * Decompose a task using RDD methodology
   */
  async decomposeTask(
    task: AtomicTask,
    context: ProjectContext,
    depth: number = 0
  ): Promise<DecompositionResult> {
    const operationId = `decompose-${task.id}-${Date.now()}`;
    this.trackOperation(operationId, 'decomposition', task.id);

    logger.info({ taskId: task.id, depth, operationId }, 'Starting RDD decomposition');

    try {
      // Check depth limit
      if (depth >= this.rddConfig.maxDepth) {
        logger.warn({ taskId: task.id, depth }, 'Maximum decomposition depth reached');
        return {
          success: true,
          isAtomic: true, // Force atomic at max depth
          originalTask: task,
          subTasks: [],
          analysis: await this.atomicDetector.analyzeTask(task, context),
          depth
        };
      }

      // SOLVE: Analyze if task is atomic
      const analysis = await this.atomicDetector.analyzeTask(task, context);

      // If atomic with high confidence, return as-is
      if (analysis.isAtomic && analysis.confidence >= this.rddConfig.minConfidence) {
        logger.info({ taskId: task.id, confidence: analysis.confidence }, 'Task determined to be atomic');
        this.completeOperation(operationId);
        return {
          success: true,
          isAtomic: true,
          originalTask: task,
          subTasks: [],
          analysis,
          depth
        };
      }

      // SPLIT: Decompose into sub-tasks
      const subTasks = await this.splitTask(task, context, analysis);

      if (subTasks.length === 0) {
        logger.warn({ taskId: task.id }, 'No sub-tasks generated, treating as atomic');
        this.completeOperation(operationId);
        return {
          success: true,
          isAtomic: true,
          originalTask: task,
          subTasks: [],
          analysis,
          depth
        };
      }

      // MERGE: Process decomposed tasks recursively if needed
      const processedSubTasks = await this.processDecomposedTasks(subTasks, context, depth + 1);

      logger.info({
        taskId: task.id,
        decomposedTaskCount: processedSubTasks.length,
        depth,
        operationId
      }, 'RDD decomposition completed');

      this.completeOperation(operationId);
      return {
        success: true,
        isAtomic: false,
        originalTask: task,
        subTasks: processedSubTasks,
        analysis,
        depth
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');

      if (isTimeout) {
        logger.error({
          err: error,
          taskId: task.id,
          depth,
          timeout: true,
          operation: 'task_decomposition'
        }, 'RDD decomposition timed out - treating task as atomic');
      } else {
        logger.error({ err: error, taskId: task.id, depth }, 'RDD decomposition failed');
      }

      // Create a fallback analysis with timeout-specific reasoning
      const fallbackAnalysis = {
        isAtomic: true,
        confidence: isTimeout ? 0.8 : 0.5, // Higher confidence for timeout fallback
        reasoning: isTimeout
          ? 'Task treated as atomic due to decomposition timeout - likely complex task requiring manual breakdown'
          : 'Fallback analysis due to decomposition failure',
        estimatedHours: task.estimatedHours,
        complexityFactors: isTimeout ? ['timeout_complexity', 'llm_timeout'] : ['decomposition_error'],
        recommendations: isTimeout
          ? ['Manual task breakdown recommended', 'Consider simplifying task scope', 'Review task complexity']
          : ['Manual review required']
      };

      this.completeOperation(operationId);
      return {
        success: true, // Mark as success to continue workflow, but treat as atomic
        isAtomic: true, // Force atomic to prevent further decomposition attempts
        originalTask: task,
        subTasks: [],
        analysis: fallbackAnalysis,
        error: errorMessage,
        depth
      };
    }
  }

  /**
   * Split a task into sub-tasks using LLM
   */
  private async splitTask(
    task: AtomicTask,
    context: ProjectContext,
    analysis: AtomicityAnalysis
  ): Promise<AtomicTask[]> {
    logger.debug({ taskId: task.id }, 'Splitting task into sub-tasks');

    try {
      const splitPrompt = this.buildSplitPrompt(task, context, analysis);
      const systemPrompt = await getPrompt('decomposition');

      // Perform LLM call with centralized timeout protection
      const timeoutManager = getTimeoutManager();
      const response = await timeoutManager.raceWithTimeout(
        'llmRequest',
        performFormatAwareLlmCall(
          splitPrompt,
          systemPrompt,
          this.config,
          'task_decomposition',
          'json', // Explicitly specify JSON format for task decomposition
          undefined, // Schema will be inferred from task name
          0.2 // Slightly higher temperature for creativity
        )
      );

      const subTasks = this.parseSplitResponse(response, task);

      // Validate and limit decomposed tasks
      const validatedSubTasks = this.validateDecomposedTasks(subTasks, task);

      logger.info({
        taskId: task.id,
        decomposedTaskCount: validatedSubTasks.length
      }, 'Task split completed');

      return validatedSubTasks;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');

      if (isTimeout) {
        logger.error({
          err: error,
          taskId: task.id,
          timeout: true,
          operation: 'task_splitting'
        }, 'Task splitting timed out - LLM call exceeded timeout limit');
      } else {
        logger.error({ err: error, taskId: task.id }, 'Failed to split task');
      }

      // Return empty array to trigger fallback to atomic task handling
      return [];
    }
  }

  /**
   * Process decomposed tasks recursively if they need further decomposition
   */
  private async processDecomposedTasks(
    decomposedTasks: AtomicTask[],
    context: ProjectContext,
    depth: number
  ): Promise<AtomicTask[]> {
    const processedTasks: AtomicTask[] = [];

    for (const task of decomposedTasks) {
      // Quick atomic check for decomposed tasks
      const quickAnalysis = await this.atomicDetector.analyzeTask(task, context);

      if (quickAnalysis.isAtomic && quickAnalysis.confidence >= this.rddConfig.minConfidence) {
        // Task is atomic, add as-is
        processedTasks.push(task);
      } else if (depth < this.rddConfig.maxDepth) {
        // Task needs further decomposition with centralized timeout protection
        try {
          const timeoutManager = getTimeoutManager();
          const decompositionResult = await timeoutManager.raceWithTimeout(
            'recursiveTaskDecomposition',
            this.decomposeTask(task, context, depth)
          );

          if (decompositionResult.success && decompositionResult.subTasks.length > 0) {
            processedTasks.push(...decompositionResult.subTasks);
          } else {
            // Decomposition failed, keep original task
            processedTasks.push(task);
          }
        } catch (error) {
          logger.warn({
            err: error,
            taskId: task.id,
            depth,
            isRecursiveCall: true
          }, 'Recursive task decomposition failed or timed out, keeping task as atomic');
          processedTasks.push(task);
        }
      } else {
        // Max depth reached, keep as-is
        processedTasks.push(task);
      }
    }

    return processedTasks;
  }

  /**
   * Build prompt for task splitting
   */
  private buildSplitPrompt(
    task: AtomicTask,
    context: ProjectContext,
    analysis: AtomicityAnalysis
  ): string {
    return `Decompose the following non-atomic task into smaller, more manageable sub-tasks:

ORIGINAL TASK:
- Title: ${task.title}
- Description: ${task.description}
- Type: ${task.type}
- Priority: ${task.priority}
- Estimated Hours: ${task.estimatedHours}
- File Paths: ${task.filePaths.join(', ')}
- Acceptance Criteria: ${task.acceptanceCriteria.join('; ')}

ATOMICITY ANALYSIS:
- Is Atomic: ${analysis.isAtomic}
- Confidence: ${analysis.confidence}
- Reasoning: ${analysis.reasoning}
- Complexity Factors: ${analysis.complexityFactors.join(', ')}
- Recommendations: ${analysis.recommendations.join('; ')}

PROJECT CONTEXT:
- Languages: ${context.languages.join(', ')}
- Frameworks: ${context.frameworks.join(', ')}
- Tools: ${context.tools.join(', ')}
- Complexity: ${context.complexity}

EPIC CONSTRAINT:
- This task belongs to an epic with a maximum of 8 hours total
- All generated tasks combined should not exceed the original task's estimated hours
- Aim for efficient task breakdown that respects the epic time limit

ATOMIC TASK REQUIREMENTS (MANDATORY):
1. ⏱️ DURATION: Each task must take 5-10 minutes maximum (0.08-0.17 hours)
2. 🎯 SINGLE ACTION: Each task must involve exactly ONE specific action
3. 📋 ONE CRITERIA: Each task must have exactly ONE acceptance criteria
4. 🔍 SINGLE FOCUS: Each task must focus on ONE thing only
5. 🚀 SIMPLICITY: Each task must be simple and straightforward
6. ⚡ IMMEDIATE: Each task can be started and completed immediately
7. 🔧 ACTIONABLE: Each task must be a concrete, specific action

TASK GENERATION REQUIREMENTS:
1. Create 2-${this.rddConfig.maxSubTasks} TRULY ATOMIC tasks
2. Each task MUST be completable in 5-10 minutes (0.08-0.17 hours)
3. Each task MUST have exactly ONE acceptance criteria
4. Each task MUST focus on ONE specific action
5. Tasks should be as independent as possible
6. Maintain clear logical progression
7. Preserve the original task's intent and scope
8. Use specific, actionable titles
9. Provide detailed but focused descriptions
10. Respect the 8-hour epic time constraint

VALIDATION CHECKLIST (Apply to each task):
□ Takes 5-10 minutes maximum?
□ Involves exactly ONE action?
□ Has exactly ONE acceptance criteria?
□ Focuses on ONE thing only?
□ Is simple and straightforward?
□ Can be started immediately?
□ Cannot be broken down into smaller tasks?

Provide your task decomposition in the following JSON format:
{
  "tasks": [
    {
      "title": "Specific, actionable title (verb + object)",
      "description": "Detailed description of the single action to take",
      "type": "development|testing|documentation|research",
      "priority": "low|medium|high|critical",
      "estimatedHours": 0.08-0.17 (5-10 minutes in decimal hours),
      "filePaths": ["specific file to modify"],
      "acceptanceCriteria": ["ONE specific, testable outcome"],
      "tags": ["relevant", "tags"],
      "dependencies": ["T0001"] // Only if absolutely necessary
    }
  ]
}

CRITICAL REMINDER:
- Use "tasks" not "subtasks" in your response
- If any task takes more than 10 minutes, break it down further!
- Ensure total time of all tasks doesn't exceed epic's 8-hour limit`;
  }



  /**
   * Parse the LLM response for task splitting
   */
  private parseSplitResponse(response: string, originalTask: AtomicTask): AtomicTask[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Support both "tasks" and "subTasks" for backward compatibility, but prefer "tasks"
      const tasksArray = parsed.tasks || parsed.subTasks;

      if (!tasksArray || !Array.isArray(tasksArray)) {
        throw new Error('Invalid tasks array in response');
      }

      return tasksArray.map((taskData: any, index: number) => {
        const decomposedTaskId = `${originalTask.id}-${String(index + 1).padStart(2, '0')}`;

        return {
          id: decomposedTaskId,
          title: taskData.title || '',
          description: taskData.description || '',
          type: this.validateTaskType(taskData.type) || originalTask.type,
          priority: this.validateTaskPriority(taskData.priority) || originalTask.priority,
          status: 'pending' as const,
          projectId: originalTask.projectId,
          epicId: originalTask.epicId,
          estimatedHours: taskData.estimatedHours || 0.1, // Preserve original value for validation
          actualHours: 0,
          filePaths: Array.isArray(taskData.filePaths) ? taskData.filePaths : [],
          acceptanceCriteria: Array.isArray(taskData.acceptanceCriteria) ?
            taskData.acceptanceCriteria.slice(0, 1) : // Ensure only one acceptance criteria
            ['Task completion criteria not specified'],
          tags: Array.isArray(taskData.tags) ? taskData.tags : originalTask.tags,
          dependencies: Array.isArray(taskData.dependencies) ? taskData.dependencies : [],
          dependents: [], // Initialize empty dependents array
          testingRequirements: originalTask.testingRequirements || {
            unitTests: [],
            integrationTests: [],
            performanceTests: [],
            coverageTarget: 80
          },
          performanceCriteria: originalTask.performanceCriteria || {},
          qualityCriteria: originalTask.qualityCriteria || {
            codeQuality: [],
            documentation: [],
            typeScript: true,
            eslint: true
          },
          integrationCriteria: originalTask.integrationCriteria || {
            compatibility: [],
            patterns: []
          },
          validationMethods: originalTask.validationMethods || {
            automated: [],
            manual: []
          },
          assignedAgent: undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: originalTask.createdBy,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: originalTask.createdBy,
            tags: Array.isArray(taskData.tags) ? taskData.tags : originalTask.tags
          }
        };
      });

    } catch (error) {
      logger.warn({ err: error, response }, 'Failed to parse split response');
      throw new Error(`Failed to parse decomposition response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate and limit decomposed tasks with atomic constraints
   */
  private validateDecomposedTasks(decomposedTasks: AtomicTask[], originalTask: AtomicTask): AtomicTask[] {
    // Limit number of tasks
    const limitedTasks = decomposedTasks.slice(0, this.rddConfig.maxSubTasks);

    // Calculate total time for epic constraint validation
    const totalEstimatedHours = limitedTasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0);
    const epicTimeLimit = 8; // 8 hours maximum per epic

    // Validate each task with atomic constraints
    const validTasks = limitedTasks.filter(task => {
      if (!task.title || !task.description) {
        logger.warn({ taskId: task.id }, 'Task missing title or description');
        return false;
      }

      // Atomic task duration validation: 5-10 minutes (0.08-0.17 hours)
      if (task.estimatedHours < 0.08 || task.estimatedHours > 0.17) {
        logger.warn({
          taskId: task.id,
          hours: task.estimatedHours
        }, 'Task duration outside 5-10 minute range');
        return false;
      }

      // Single acceptance criteria validation
      if (!task.acceptanceCriteria || task.acceptanceCriteria.length !== 1) {
        logger.warn({
          taskId: task.id,
          criteriaCount: task.acceptanceCriteria?.length
        }, 'Task must have exactly one acceptance criteria');
        return false;
      }

      // Check for "and" operators indicating multiple actions
      const hasAndOperator = task.title.toLowerCase().includes(' and ') ||
                            task.description.toLowerCase().includes(' and ');
      if (hasAndOperator) {
        logger.warn({ taskId: task.id }, 'Task contains "and" operator suggesting multiple actions');
        return false;
      }

      return true;
    });

    // Epic time constraint validation
    const validTasksTotalTime = validTasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0);
    if (validTasksTotalTime > epicTimeLimit) {
      logger.warn({
        totalTime: validTasksTotalTime,
        epicLimit: epicTimeLimit
      }, 'Generated tasks exceed epic time limit');

      // Truncate tasks to fit within epic limit
      let runningTotal = 0;
      return validTasks.filter(task => {
        runningTotal += task.estimatedHours || 0;
        return runningTotal <= epicTimeLimit;
      });
    }

    return validTasks;
  }

  /**
   * Validate task type
   */
  private validateTaskType(type: string): TaskType | null {
    const validTypes: TaskType[] = ['development', 'testing', 'documentation', 'research'];
    return validTypes.includes(type as TaskType) ? type as TaskType : null;
  }

  /**
   * Validate task priority
   */
  private validateTaskPriority(priority: string): TaskPriority | null {
    const validPriorities: TaskPriority[] = ['low', 'medium', 'high', 'critical'];
    return validPriorities.includes(priority as TaskPriority) ? priority as TaskPriority : null;
  }

  /**
   * Track active operation for health monitoring
   */
  private trackOperation(operationId: string, operation: string, taskId: string): void {
    this.activeOperations.set(operationId, {
      startTime: new Date(),
      operation,
      taskId
    });
  }

  /**
   * Complete operation tracking
   */
  private completeOperation(operationId: string): void {
    this.activeOperations.delete(operationId);
  }

  /**
   * Get health status of RDD engine operations
   */
  getHealthStatus(): { healthy: boolean; activeOperations: number; longRunningOperations: Array<{ operationId: string; operation: string; taskId: string; duration: number }> } {
    const now = new Date();
    const longRunningThreshold = 300000; // 5 minutes
    const longRunningOperations: Array<{ operationId: string; operation: string; taskId: string; duration: number }> = [];

    for (const [operationId, info] of this.activeOperations.entries()) {
      const duration = now.getTime() - info.startTime.getTime();
      if (duration > longRunningThreshold) {
        longRunningOperations.push({
          operationId,
          operation: info.operation,
          taskId: info.taskId,
          duration
        });
      }
    }

    return {
      healthy: longRunningOperations.length === 0,
      activeOperations: this.activeOperations.size,
      longRunningOperations
    };
  }

  /**
   * Clean up stale operations (operations that have been running too long)
   */
  cleanupStaleOperations(): number {
    const now = new Date();
    const staleThreshold = 900000; // 15 minutes
    let cleanedCount = 0;

    for (const [operationId, info] of this.activeOperations.entries()) {
      const duration = now.getTime() - info.startTime.getTime();
      if (duration > staleThreshold) {
        logger.warn({
          operationId,
          operation: info.operation,
          taskId: info.taskId,
          duration
        }, 'Cleaning up stale RDD operation');
        this.activeOperations.delete(operationId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}
