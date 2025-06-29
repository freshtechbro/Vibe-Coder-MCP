import { performFormatAwareLlmCall } from '../../../utils/llmHelper.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { getLLMModelForOperation } from '../utils/config-loader.js';
import { AtomicTask, TaskType, TaskPriority } from '../types/task.js';
import { AtomicTaskDetector, AtomicityAnalysis } from './atomic-detector.js';
import { ProjectContext } from '../types/project-context.js';
import { getPrompt } from '../services/prompt-service.js';
import { getTimeoutManager } from '../utils/timeout-manager.js';
import logger from '../../../logger.js';

/**
 * Circuit breaker for task decomposition to prevent infinite loops
 */
class DecompositionCircuitBreaker {
  private attempts = new Map<string, number>();
  private failures = new Map<string, number>();
  private lastAttempt = new Map<string, number>();
  private readonly maxAttempts: number;
  private readonly maxFailures: number;
  private readonly cooldownPeriod: number; // milliseconds

  constructor(maxAttempts = 3, maxFailures = 2, cooldownPeriod = 60000) {
    this.maxAttempts = maxAttempts;
    this.maxFailures = maxFailures;
    this.cooldownPeriod = cooldownPeriod;
  }

  canAttempt(taskId: string): boolean {
    const attempts = this.attempts.get(taskId) || 0;
    const failures = this.failures.get(taskId) || 0;
    const lastAttemptTime = this.lastAttempt.get(taskId) || 0;
    const now = Date.now();

    // Check if in cooldown period
    if (lastAttemptTime > 0 && (now - lastAttemptTime) < this.cooldownPeriod) {
      logger.warn({ taskId, cooldownRemaining: this.cooldownPeriod - (now - lastAttemptTime) },
        'Task decomposition in cooldown period');
      return false;
    }

    // Check attempt limits
    if (attempts >= this.maxAttempts) {
      logger.warn({ taskId, attempts, maxAttempts: this.maxAttempts },
        'Task decomposition max attempts reached');
      return false;
    }

    // Check failure limits
    if (failures >= this.maxFailures) {
      logger.warn({ taskId, failures, maxFailures: this.maxFailures },
        'Task decomposition max failures reached');
      return false;
    }

    return true;
  }

  recordAttempt(taskId: string): void {
    const attempts = this.attempts.get(taskId) || 0;
    this.attempts.set(taskId, attempts + 1);
    this.lastAttempt.set(taskId, Date.now());
  }

  recordFailure(taskId: string): void {
    const failures = this.failures.get(taskId) || 0;
    this.failures.set(taskId, failures + 1);
  }

  recordSuccess(taskId: string): void {
    // Reset counters on success
    this.attempts.delete(taskId);
    this.failures.delete(taskId);
    this.lastAttempt.delete(taskId);
  }

  getStats(taskId: string): { attempts: number; failures: number; canAttempt: boolean } {
    return {
      attempts: this.attempts.get(taskId) || 0,
      failures: this.failures.get(taskId) || 0,
      canAttempt: this.canAttempt(taskId)
    };
  }

  reset(taskId?: string): void {
    if (taskId) {
      this.attempts.delete(taskId);
      this.failures.delete(taskId);
      this.lastAttempt.delete(taskId);
    } else {
      this.attempts.clear();
      this.failures.clear();
      this.lastAttempt.clear();
    }
  }
}

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
  private circuitBreaker: DecompositionCircuitBreaker;

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
    this.circuitBreaker = new DecompositionCircuitBreaker(3, 2, 60000); // 3 attempts, 2 failures, 1 minute cooldown
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

    // Check circuit breaker before attempting decomposition
    if (!this.circuitBreaker.canAttempt(task.id)) {
      const stats = this.circuitBreaker.getStats(task.id);
      logger.warn({
        taskId: task.id,
        depth,
        circuitBreakerStats: stats
      }, 'Circuit breaker preventing decomposition attempt');

      this.completeOperation(operationId);
      return {
        success: true,
        isAtomic: true, // Force atomic to prevent further attempts
        originalTask: task,
        subTasks: [],
        analysis: {
          isAtomic: true,
          confidence: 0.9,
          reasoning: 'Task marked as atomic due to circuit breaker protection (too many failed decomposition attempts)',
          estimatedHours: task.estimatedHours,
          complexityFactors: ['circuit_breaker_protection', 'decomposition_failure_limit'],
          recommendations: ['Manual task breakdown recommended', 'Review task complexity']
        },
        error: 'Circuit breaker protection activated',
        depth
      };
    }

    // Record decomposition attempt
    this.circuitBreaker.recordAttempt(task.id);

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
        this.circuitBreaker.recordSuccess(task.id); // Record success for atomic task
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
        this.circuitBreaker.recordFailure(task.id); // Record failure for failed decomposition
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

      this.circuitBreaker.recordSuccess(task.id); // Record success for successful decomposition
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
      this.completeOperation(operationId);
      return this.handleDecompositionFailure(task, error instanceof Error ? error : 'Unknown error', {
        depth,
        isRecursive: false,
        operationId
      });
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

      // Enhanced error context logging
      const errorContext = {
        err: error,
        taskId: task.id,
        operation: 'task_splitting',
        taskTitle: task.title,
        taskType: task.type,
        taskPriority: task.priority,
        estimatedHours: task.estimatedHours,
        projectId: task.projectId,
        epicId: task.epicId,
        contextSize: context ? {
          languagesCount: context.languages?.length || 0,
          frameworksCount: context.frameworks?.length || 0,
          complexity: context.complexity
        } : null,
        stackTrace: error instanceof Error ? error.stack : undefined
      };

      if (isTimeout) {
        logger.error({
          ...errorContext,
          timeout: true,
          timeoutType: 'llm_call'
        }, 'Task splitting timed out - LLM call exceeded timeout limit');
      } else {
        logger.error(errorContext, 'Failed to split task - comprehensive error context captured');
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
      // Check circuit breaker before processing each task
      if (!this.circuitBreaker.canAttempt(task.id)) {
        const stats = this.circuitBreaker.getStats(task.id);
        logger.warn({
          taskId: task.id,
          depth,
          circuitBreakerStats: stats,
          isRecursiveCall: true
        }, 'Circuit breaker preventing recursive decomposition attempt');

        // Force task to be atomic due to circuit breaker
        processedTasks.push(task);
        continue;
      }

      // Quick atomic check for decomposed tasks
      const quickAnalysis = await this.atomicDetector.analyzeTask(task, context);

      if (quickAnalysis.isAtomic && quickAnalysis.confidence >= this.rddConfig.minConfidence) {
        // Task is atomic, add as-is
        this.circuitBreaker.recordSuccess(task.id);
        processedTasks.push(task);
      } else if (depth < this.rddConfig.maxDepth) {
        // Task needs further decomposition with centralized timeout protection
        this.circuitBreaker.recordAttempt(task.id);

        try {
          const timeoutManager = getTimeoutManager();
          const decompositionResult = await timeoutManager.raceWithTimeout(
            'recursiveTaskDecomposition',
            this.decomposeTask(task, context, depth)
          );

          if (decompositionResult.success && decompositionResult.subTasks.length > 0) {
            this.circuitBreaker.recordSuccess(task.id);
            processedTasks.push(...decompositionResult.subTasks);
          } else {
            // Decomposition failed - record failure and keep original task
            this.circuitBreaker.recordFailure(task.id);
            logger.warn({
              taskId: task.id,
              depth,
              isRecursiveCall: true,
              decompositionSuccess: decompositionResult.success,
              subTaskCount: decompositionResult.subTasks?.length || 0
            }, 'Recursive decomposition failed to generate sub-tasks, keeping original task as atomic');
            processedTasks.push(task);
          }
        } catch (error) {
          this.circuitBreaker.recordFailure(task.id);
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
        logger.info({
          taskId: task.id,
          depth,
          maxDepth: this.rddConfig.maxDepth
        }, 'Maximum decomposition depth reached, keeping task as-is');
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
- File Paths: ${(task.filePaths || []).join(', ')}
- Acceptance Criteria: ${(task.acceptanceCriteria || []).join('; ')}

ATOMICITY ANALYSIS:
- Is Atomic: ${analysis.isAtomic}
- Confidence: ${analysis.confidence}
- Reasoning: ${analysis.reasoning}
- Complexity Factors: ${(analysis.complexityFactors || []).join(', ')}
- Recommendations: ${(analysis.recommendations || []).join('; ')}

PROJECT CONTEXT:
- Languages: ${(context.languages && context.languages.length > 0 ? context.languages : ['unknown']).join(', ')}
- Frameworks: ${(context.frameworks && context.frameworks.length > 0 ? context.frameworks : ['unknown']).join(', ')}
- Tools: ${(context.tools || []).join(', ')}
- Complexity: ${context.complexity || 'unknown'}

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
   * Validate the structure of a task object
   */
  private validateTaskStructure(task: any): boolean {
    const requiredFields = ['title', 'description', 'type', 'priority', 'estimatedHours'];
    return requiredFields.every(field => task.hasOwnProperty(field) && task[field] != null);
  }

  /**
   * Validate the response structure before parsing
   */
  private validateResponseStructure(parsed: any): { isValid: boolean; error?: string } {
    // Check if it's a tasks array format
    if (parsed.tasks && Array.isArray(parsed.tasks)) {
      const invalidTasks = parsed.tasks.filter((task: any) => !this.validateTaskStructure(task));
      if (invalidTasks.length > 0) {
        return { isValid: false, error: `Invalid task structure in tasks array: missing required fields` };
      }
      return { isValid: true };
    }

    // Check if it's a subTasks array format (backward compatibility)
    if (parsed.subTasks && Array.isArray(parsed.subTasks)) {
      const invalidTasks = parsed.subTasks.filter((task: any) => !this.validateTaskStructure(task));
      if (invalidTasks.length > 0) {
        return { isValid: false, error: `Invalid task structure in subTasks array: missing required fields` };
      }
      return { isValid: true };
    }

    // Check if it's a single task object
    if (parsed.title && parsed.description) {
      if (!this.validateTaskStructure(parsed)) {
        return { isValid: false, error: `Invalid single task structure: missing required fields` };
      }
      return { isValid: true };
    }

    return { isValid: false, error: `Invalid response format: no tasks array or single task found` };
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

      // Validate response structure first
      const validation = this.validateResponseStructure(parsed);
      if (!validation.isValid) {
        throw new Error(validation.error || 'Invalid response structure');
      }

      // Support both "tasks" and "subTasks" for backward compatibility, but prefer "tasks"
      let tasksArray = parsed.tasks || parsed.subTasks;

      // Handle case where LLM returns a single task object instead of an array
      if (!tasksArray) {
        // Check if the parsed object itself is a single task (has title, description, etc.)
        if (parsed.title && parsed.description) {
          logger.info({ taskId: originalTask.id }, 'LLM returned single task object, converting to array');
          tasksArray = [parsed];
        } else {
          throw new Error('Invalid response format: no tasks array or single task found');
        }
      }

      if (!Array.isArray(tasksArray)) {
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
      logger.warn({ err: error, response, taskId: originalTask.id }, 'Failed to parse split response, falling back to default task generation');
      
      // Fallback: Create a simplified version of the original task
      return this.generateFallbackTasks(originalTask, error instanceof Error ? error.message : 'Unknown parsing error');
    }
  }

  /**
   * Generate fallback tasks when LLM parsing fails
   */
  private generateFallbackTasks(originalTask: AtomicTask, errorMessage: string): AtomicTask[] {
    logger.info({ taskId: originalTask.id, errorMessage }, 'Generating fallback tasks due to parsing failure');
    
    // Create a single simplified task based on the original
    const fallbackTask: AtomicTask = {
      id: `${originalTask.id}-fallback-01`,
      title: `Review and plan: ${originalTask.title}`,
      description: `Review the requirements for "${originalTask.title}" and create a detailed implementation plan. Original description: ${originalTask.description}`,
      type: 'research',
      priority: originalTask.priority,
      status: 'pending',
      projectId: originalTask.projectId,
      epicId: originalTask.epicId,
      estimatedHours: Math.min(originalTask.estimatedHours, 0.5), // Cap at 30 minutes
      actualHours: 0,
      filePaths: [],
      acceptanceCriteria: ['Detailed implementation plan is created'],
      tags: [...(originalTask.tags || []), 'fallback-generated', 'needs-review'],
      dependencies: [],
      dependents: [],
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
        tags: [...(originalTask.tags || []), 'fallback-generated', `error:${errorMessage.slice(0, 50)}`]
      }
    };

    return [fallbackTask];
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

  /**
   * Handle decomposition failure with proper error recovery
   */
  private handleDecompositionFailure(
    task: AtomicTask,
    error: Error | string,
    context: { depth: number; isRecursive?: boolean; operationId?: string }
  ): DecompositionResult {
    const errorMessage = error instanceof Error ? error.message : error;
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');

    // Record failure in circuit breaker
    this.circuitBreaker.recordFailure(task.id);

    // Log appropriate error level based on context
    const logLevel = context.isRecursive ? 'warn' : 'error';
    const logMessage = context.isRecursive
      ? 'Recursive decomposition failed, treating task as atomic'
      : 'Primary decomposition failed, treating task as atomic';

    logger[logLevel]({
      err: error instanceof Error ? error : new Error(errorMessage),
      taskId: task.id,
      depth: context.depth,
      isRecursive: context.isRecursive || false,
      timeout: isTimeout,
      operationId: context.operationId
    }, logMessage);

    // Create appropriate fallback analysis
    const fallbackAnalysis = {
      isAtomic: true,
      confidence: isTimeout ? 0.8 : 0.6,
      reasoning: isTimeout
        ? 'Task treated as atomic due to decomposition timeout - likely requires manual breakdown'
        : context.isRecursive
          ? 'Task treated as atomic after recursive decomposition failure'
          : 'Task treated as atomic due to primary decomposition failure',
      estimatedHours: task.estimatedHours,
      complexityFactors: isTimeout
        ? ['timeout_complexity', 'llm_timeout', 'circuit_breaker_protection']
        : ['decomposition_failure', 'circuit_breaker_protection'],
      recommendations: isTimeout
        ? ['Manual task breakdown recommended', 'Consider simplifying task scope', 'Review task complexity']
        : ['Manual review required', 'Consider alternative decomposition approach']
    };

    return {
      success: true, // Mark as success to continue workflow
      isAtomic: true, // Force atomic to prevent further decomposition attempts
      originalTask: task,
      subTasks: [],
      analysis: fallbackAnalysis,
      error: errorMessage,
      depth: context.depth
    };
  }

  /**
   * Reset circuit breaker for a specific task or all tasks
   */
  resetCircuitBreaker(taskId?: string): void {
    this.circuitBreaker.reset(taskId);
    logger.info({ taskId: taskId || 'all' }, 'Circuit breaker reset');
  }

  /**
   * Get circuit breaker statistics for monitoring
   */
  getCircuitBreakerStats(taskId?: string): any {
    if (taskId) {
      return this.circuitBreaker.getStats(taskId);
    }

    // Return overall stats (this would need to be implemented in the circuit breaker)
    return {
      message: 'Use specific taskId to get detailed stats'
    };
  }

  /**
   * Monitor decomposition progress and detect stuck processes
   */
  monitorDecompositionProgress(): {
    status: 'healthy' | 'warning' | 'critical';
    activeOperations: number;
    stuckOperations: Array<{
      operationId: string;
      taskId: string;
      operation: string;
      duration: number;
      status: 'warning' | 'critical';
    }>;
    circuitBreakerStatus: {
      tasksBlocked: number;
      recentFailures: number;
    };
    recommendations: string[];
  } {
    const now = new Date();
    const warningThreshold = 120000; // 2 minutes
    const criticalThreshold = 300000; // 5 minutes

    const stuckOperations: Array<{
      operationId: string;
      taskId: string;
      operation: string;
      duration: number;
      status: 'warning' | 'critical';
    }> = [];

    // Check active operations for stuck processes
    for (const [operationId, info] of this.activeOperations.entries()) {
      const duration = now.getTime() - info.startTime.getTime();

      if (duration > criticalThreshold) {
        stuckOperations.push({
          operationId,
          taskId: info.taskId,
          operation: info.operation,
          duration,
          status: 'critical'
        });
      } else if (duration > warningThreshold) {
        stuckOperations.push({
          operationId,
          taskId: info.taskId,
          operation: info.operation,
          duration,
          status: 'warning'
        });
      }
    }

    // Determine overall status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (stuckOperations.some(op => op.status === 'critical')) {
      status = 'critical';
    } else if (stuckOperations.length > 0) {
      status = 'warning';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (stuckOperations.length > 0) {
      recommendations.push('Consider stopping stuck decomposition processes');
      recommendations.push('Review circuit breaker settings');
      recommendations.push('Check LLM service availability and response times');
    }

    if (stuckOperations.filter(op => op.status === 'critical').length > 0) {
      recommendations.push('URGENT: Kill critical stuck operations immediately');
      recommendations.push('Reset circuit breaker for affected tasks');
    }

    // Mock circuit breaker status (would need actual implementation)
    const circuitBreakerStatus = {
      tasksBlocked: 0, // Would count tasks currently blocked by circuit breaker
      recentFailures: 0 // Would count recent failures
    };

    return {
      status,
      activeOperations: this.activeOperations.size,
      stuckOperations,
      circuitBreakerStatus,
      recommendations
    };
  }

  /**
   * Emergency stop for all active decomposition operations
   */
  emergencyStop(): {
    stopped: number;
    operations: Array<{ operationId: string; taskId: string; operation: string; duration: number }>;
  } {
    const now = new Date();
    const stoppedOperations: Array<{ operationId: string; taskId: string; operation: string; duration: number }> = [];

    for (const [operationId, info] of this.activeOperations.entries()) {
      const duration = now.getTime() - info.startTime.getTime();
      stoppedOperations.push({
        operationId,
        taskId: info.taskId,
        operation: info.operation,
        duration
      });

      logger.warn({
        operationId,
        taskId: info.taskId,
        operation: info.operation,
        duration
      }, 'Emergency stop: Terminating active decomposition operation');
    }

    // Clear all active operations
    this.activeOperations.clear();

    // Reset circuit breaker to allow fresh attempts
    this.circuitBreaker.reset();

    logger.info({
      stoppedCount: stoppedOperations.length
    }, 'Emergency stop completed - all active operations terminated');

    return {
      stopped: stoppedOperations.length,
      operations: stoppedOperations
    };
  }
}
