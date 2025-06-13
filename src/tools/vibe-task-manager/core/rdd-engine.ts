import { performFormatAwareLlmCall } from '../../../utils/llmHelper.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { getLLMModelForOperation } from '../utils/config-loader.js';
import { AtomicTask, TaskType, TaskPriority } from '../types/task.js';
import { AtomicTaskDetector, AtomicityAnalysis, ProjectContext } from './atomic-detector.js';
import { getPrompt } from '../services/prompt-service.js';
import logger from '../../../logger.js';

/**
 * Decomposition result for a single task
 */
export interface DecompositionResult {
  success: boolean;
  isAtomic: boolean;
  originalTask: AtomicTask;
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

  constructor(config: OpenRouterConfig, rddConfig?: Partial<RDDConfig>) {
    this.config = config;
    this.atomicDetector = new AtomicTaskDetector(config);
    this.rddConfig = {
      maxDepth: 5,
      maxSubTasks: 8,
      minConfidence: 0.7,
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
    logger.info({ taskId: task.id, depth }, 'Starting RDD decomposition');

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
        return {
          success: true,
          isAtomic: true,
          originalTask: task,
          subTasks: [],
          analysis,
          depth
        };
      }

      // MERGE: Process sub-tasks recursively if needed
      const processedSubTasks = await this.processSubTasks(subTasks, context, depth + 1);

      logger.info({
        taskId: task.id,
        subTaskCount: processedSubTasks.length,
        depth
      }, 'RDD decomposition completed');

      return {
        success: true,
        isAtomic: false,
        originalTask: task,
        subTasks: processedSubTasks,
        analysis,
        depth
      };

    } catch (error) {
      logger.error({ err: error, taskId: task.id, depth }, 'RDD decomposition failed');

      // Create a fallback analysis to avoid calling the failing atomic detector again
      const fallbackAnalysis = {
        isAtomic: true,
        confidence: 0.5,
        reasoning: 'Fallback analysis due to decomposition failure',
        estimatedHours: task.estimatedHours,
        complexityFactors: ['decomposition_error'],
        recommendations: ['Manual review required']
      };

      return {
        success: false,
        isAtomic: false,
        originalTask: task,
        subTasks: [],
        analysis: fallbackAnalysis,
        error: error instanceof Error ? error.message : 'Unknown error',
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

      const response = await performFormatAwareLlmCall(
        splitPrompt,
        systemPrompt,
        this.config,
        'task_decomposition',
        'json', // Explicitly specify JSON format for task decomposition
        undefined, // Schema will be inferred from task name
        0.2 // Slightly higher temperature for creativity
      );

      const subTasks = this.parseSplitResponse(response, task);

      // Validate and limit sub-tasks
      const validatedSubTasks = this.validateSubTasks(subTasks, task);

      logger.info({
        taskId: task.id,
        subTaskCount: validatedSubTasks.length
      }, 'Task split completed');

      return validatedSubTasks;

    } catch (error) {
      logger.error({ err: error, taskId: task.id }, 'Failed to split task');
      return [];
    }
  }

  /**
   * Process sub-tasks recursively if they need further decomposition
   */
  private async processSubTasks(
    subTasks: AtomicTask[],
    context: ProjectContext,
    depth: number
  ): Promise<AtomicTask[]> {
    const processedTasks: AtomicTask[] = [];

    for (const subTask of subTasks) {
      // Quick atomic check for sub-tasks
      const quickAnalysis = await this.atomicDetector.analyzeTask(subTask, context);

      if (quickAnalysis.isAtomic && quickAnalysis.confidence >= this.rddConfig.minConfidence) {
        // Sub-task is atomic, add as-is
        processedTasks.push(subTask);
      } else if (depth < this.rddConfig.maxDepth) {
        // Sub-task needs further decomposition
        const decompositionResult = await this.decomposeTask(subTask, context, depth);

        if (decompositionResult.success && decompositionResult.subTasks.length > 0) {
          processedTasks.push(...decompositionResult.subTasks);
        } else {
          // Decomposition failed, keep original sub-task
          processedTasks.push(subTask);
        }
      } else {
        // Max depth reached, keep as-is
        processedTasks.push(subTask);
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

DECOMPOSITION REQUIREMENTS:
1. Create 2-${this.rddConfig.maxSubTasks} atomic sub-tasks
2. Each sub-task should be completable in 1-4 hours
3. Sub-tasks should be independent where possible
4. Maintain clear acceptance criteria for each sub-task
5. Preserve the original task's intent and scope
6. Consider logical implementation order

Provide your decomposition in the following JSON format:
{
  "subTasks": [
    {
      "title": "Sub-task title",
      "description": "Detailed description",
      "type": "development|testing|documentation|research",
      "priority": "low|medium|high|critical",
      "estimatedHours": number,
      "filePaths": ["file1.ts", "file2.ts"],
      "acceptanceCriteria": ["criterion1", "criterion2"],
      "tags": ["tag1", "tag2"],
      "dependencies": ["T0001", "T0002"]
    }
  ]
}`;
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

      if (!parsed.subTasks || !Array.isArray(parsed.subTasks)) {
        throw new Error('Invalid subTasks array');
      }

      return parsed.subTasks.map((subTask: any, index: number) => {
        const subTaskId = `${originalTask.id}-${String(index + 1).padStart(2, '0')}`;

        return {
          id: subTaskId,
          title: subTask.title || '',
          description: subTask.description || '',
          type: this.validateTaskType(subTask.type) || originalTask.type,
          priority: this.validateTaskPriority(subTask.priority) || originalTask.priority,
          status: 'pending' as const,
          projectId: originalTask.projectId,
          epicId: originalTask.epicId,
          estimatedHours: subTask.estimatedHours || 2,
          actualHours: 0,
          filePaths: Array.isArray(subTask.filePaths) ? subTask.filePaths : [],
          acceptanceCriteria: Array.isArray(subTask.acceptanceCriteria) ? subTask.acceptanceCriteria : [],
          tags: Array.isArray(subTask.tags) ? subTask.tags : originalTask.tags,
          dependencies: Array.isArray(subTask.dependencies) ? subTask.dependencies : [],
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
          assignedAgent: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: originalTask.createdBy,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: originalTask.createdBy,
            tags: Array.isArray(subTask.tags) ? subTask.tags : originalTask.tags
          }
        };
      });

    } catch (error) {
      logger.warn({ err: error, response }, 'Failed to parse split response');
      throw new Error(`Failed to parse decomposition response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate and limit sub-tasks
   */
  private validateSubTasks(subTasks: AtomicTask[], originalTask: AtomicTask): AtomicTask[] {
    // Limit number of sub-tasks
    const limitedTasks = subTasks.slice(0, this.rddConfig.maxSubTasks);

    // Validate each sub-task
    return limitedTasks.filter(subTask => {
      if (!subTask.title || !subTask.description) {
        logger.warn({ subTaskId: subTask.id }, 'Sub-task missing title or description');
        return false;
      }

      if (subTask.estimatedHours <= 0 || subTask.estimatedHours > 6) {
        logger.warn({ subTaskId: subTask.id, hours: subTask.estimatedHours }, 'Sub-task has invalid estimated hours');
        return false;
      }

      return true;
    });
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
}
