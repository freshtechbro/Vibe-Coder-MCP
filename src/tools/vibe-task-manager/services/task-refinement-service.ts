import { AtomicTask, TaskPriority, TaskType } from '../types/task.js';
import { getTaskOperations } from '../core/operations/task-operations.js';
import { DecompositionService, DecompositionRequest } from './decomposition-service.js';
import { ProjectContext } from '../core/atomic-detector.js';
import { getVibeTaskManagerConfig } from '../utils/config-loader.js';
import { FileOperationResult } from '../utils/file-utils.js';
import logger from '../../../logger.js';

/**
 * Task refinement parameters
 */
export interface TaskRefinementParams {
  title?: string;
  description?: string;
  type?: TaskType;
  priority?: TaskPriority;
  estimatedHours?: number;
  filePaths?: string[];
  acceptanceCriteria?: string[];
  tags?: string[];
  dependencies?: string[];
}

/**
 * Re-decomposition parameters
 */
export interface RedecompositionParams {
  reason: string;
  newRequirements?: string;
  contextChanges?: string[];
  forceDecomposition?: boolean;
}

/**
 * Refinement result
 */
export interface RefinementResult {
  success: boolean;
  originalTask: AtomicTask;
  refinedTask?: AtomicTask;
  decomposedTasks?: AtomicTask[];
  wasDecomposed: boolean;
  changes: string[];
  error?: string;
  metadata: {
    operation: string;
    timestamp: Date;
    refinedBy: string;
  };
}

/**
 * Refinement history entry
 */
export interface RefinementHistoryEntry {
  id: string;
  taskId: string;
  operation: string;
  changes: string[];
  refinedBy: string;
  timestamp: Date;
  success: boolean;
  error?: string;
}

/**
 * Task refinement service for modifying and re-decomposing tasks
 */
export class TaskRefinementService {
  private static instance: TaskRefinementService;
  private decompositionService: DecompositionService | null = null;

  private constructor() {
    // Initialize decomposition service with config
    this.initializeDecompositionService();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TaskRefinementService {
    if (!TaskRefinementService.instance) {
      TaskRefinementService.instance = new TaskRefinementService();
    }
    return TaskRefinementService.instance;
  }

  /**
   * Initialize decomposition service
   */
  private async initializeDecompositionService(): Promise<void> {
    try {
      const config = await getVibeTaskManagerConfig();
      if (!config) {
        throw new Error('Failed to load task manager configuration');
      }
      // Convert LLMConfig to OpenRouterConfig format
      const openRouterConfig = {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY || '',
        model: 'anthropic/claude-3-sonnet',
        geminiModel: 'gemini-pro',
        perplexityModel: 'llama-3.1-sonar-small-128k-online'
      };
      this.decompositionService = new DecompositionService(openRouterConfig);
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize decomposition service');
      throw error;
    }
  }

  /**
   * Refine a task with new parameters
   */
  async refineTask(
    taskId: string,
    refinements: TaskRefinementParams,
    refinedBy: string = 'system'
  ): Promise<RefinementResult> {
    try {
      logger.info({ taskId, refinements: Object.keys(refinements), refinedBy }, 'Starting task refinement');

      // Get original task
      const taskOperations = getTaskOperations();
      const taskResult = await taskOperations.getTask(taskId);

      if (!taskResult.success) {
        return {
          success: false,
          originalTask: {} as AtomicTask,
          wasDecomposed: false,
          changes: [],
          error: `Task not found: ${taskResult.error}`,
          metadata: {
            operation: 'refine_task',
            timestamp: new Date(),
            refinedBy
          }
        };
      }

      const originalTask = taskResult.data!;

      // Validate refinement parameters
      const validationResult = this.validateRefinementParams(refinements);
      if (!validationResult.valid) {
        return {
          success: false,
          originalTask,
          wasDecomposed: false,
          changes: [],
          error: `Refinement validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            operation: 'refine_task',
            timestamp: new Date(),
            refinedBy
          }
        };
      }

      // Apply refinements
      const { refinedTask, changes } = this.applyRefinements(originalTask, refinements);

      // Check if task needs re-decomposition
      const needsDecomposition = await this.shouldRedecompose(originalTask, refinedTask, changes);

      if (needsDecomposition) {
        // Perform re-decomposition
        const decompositionResult = await this.performRedecomposition(
          refinedTask,
          { reason: 'Task refinement triggered re-decomposition' },
          refinedBy
        );

        if (decompositionResult.success && decompositionResult.decomposedTasks) {
          return {
            success: true,
            originalTask,
            decomposedTasks: decompositionResult.decomposedTasks,
            wasDecomposed: true,
            changes,
            metadata: {
              operation: 'refine_and_decompose',
              timestamp: new Date(),
              refinedBy
            }
          };
        }
      }

      // Update task without decomposition
      const updateResult = await taskOperations.updateTask(taskId, refinements);

      if (!updateResult.success) {
        return {
          success: false,
          originalTask,
          wasDecomposed: false,
          changes,
          error: `Failed to update task: ${updateResult.error}`,
          metadata: {
            operation: 'refine_task',
            timestamp: new Date(),
            refinedBy
          }
        };
      }

      logger.info({ taskId, changesCount: changes.length }, 'Task refinement completed');

      return {
        success: true,
        originalTask,
        refinedTask: updateResult.data!,
        wasDecomposed: false,
        changes,
        metadata: {
          operation: 'refine_task',
          timestamp: new Date(),
          refinedBy
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to refine task');

      return {
        success: false,
        originalTask: {} as AtomicTask,
        wasDecomposed: false,
        changes: [],
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          operation: 'refine_task',
          timestamp: new Date(),
          refinedBy
        }
      };
    }
  }

  /**
   * Force re-decomposition of a task
   */
  async redecomposeTask(
    taskId: string,
    params: RedecompositionParams,
    refinedBy: string = 'system'
  ): Promise<RefinementResult> {
    try {
      logger.info({ taskId, reason: params.reason, refinedBy }, 'Starting task re-decomposition');

      // Get original task
      const taskOperations = getTaskOperations();
      const taskResult = await taskOperations.getTask(taskId);

      if (!taskResult.success) {
        return {
          success: false,
          originalTask: {} as AtomicTask,
          wasDecomposed: false,
          changes: [],
          error: `Task not found: ${taskResult.error}`,
          metadata: {
            operation: 'redecompose_task',
            timestamp: new Date(),
            refinedBy
          }
        };
      }

      const originalTask = taskResult.data!;

      // Perform re-decomposition
      const decompositionResult = await this.performRedecomposition(originalTask, params, refinedBy);

      if (!decompositionResult.success) {
        return {
          success: false,
          originalTask,
          wasDecomposed: false,
          changes: [`Re-decomposition attempted: ${params.reason}`],
          error: decompositionResult.error,
          metadata: {
            operation: 'redecompose_task',
            timestamp: new Date(),
            refinedBy
          }
        };
      }

      logger.info({
        taskId,
        decomposedTasksCount: decompositionResult.decomposedTasks?.length || 0
      }, 'Task re-decomposition completed');

      return {
        success: true,
        originalTask,
        decomposedTasks: decompositionResult.decomposedTasks,
        wasDecomposed: true,
        changes: [`Re-decomposed due to: ${params.reason}`],
        metadata: {
          operation: 'redecompose_task',
          timestamp: new Date(),
          refinedBy
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to re-decompose task');

      return {
        success: false,
        originalTask: {} as AtomicTask,
        wasDecomposed: false,
        changes: [],
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          operation: 'redecompose_task',
          timestamp: new Date(),
          refinedBy
        }
      };
    }
  }

  /**
   * Bulk refine multiple tasks
   */
  async bulkRefineTask(
    taskIds: string[],
    refinements: TaskRefinementParams,
    refinedBy: string = 'system'
  ): Promise<RefinementResult[]> {
    logger.info({ taskIds, refinedBy }, 'Starting bulk task refinement');

    const results: RefinementResult[] = [];

    for (const taskId of taskIds) {
      try {
        const result = await this.refineTask(taskId, refinements, refinedBy);
        results.push(result);
      } catch (error) {
        logger.error({ err: error, taskId }, 'Failed to refine task in bulk operation');
        results.push({
          success: false,
          originalTask: {} as AtomicTask,
          wasDecomposed: false,
          changes: [],
          error: error instanceof Error ? error.message : String(error),
          metadata: {
            operation: 'bulk_refine_task',
            timestamp: new Date(),
            refinedBy
          }
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info({
      totalTasks: taskIds.length,
      successCount,
      failureCount: taskIds.length - successCount
    }, 'Bulk task refinement completed');

    return results;
  }

  /**
   * Validate refinement parameters
   */
  private validateRefinementParams(params: TaskRefinementParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (params.title !== undefined) {
      if (typeof params.title !== 'string' || params.title.trim().length === 0) {
        errors.push('Task title must be a non-empty string');
      }
      if (params.title.length > 200) {
        errors.push('Task title must be 200 characters or less');
      }
    }

    if (params.description !== undefined) {
      if (typeof params.description !== 'string' || params.description.trim().length === 0) {
        errors.push('Task description must be a non-empty string');
      }
    }

    if (params.type && !['development', 'testing', 'documentation', 'research'].includes(params.type)) {
      errors.push('Task type must be one of: development, testing, documentation, research');
    }

    if (params.priority && !['low', 'medium', 'high', 'critical'].includes(params.priority)) {
      errors.push('Task priority must be one of: low, medium, high, critical');
    }

    if (params.estimatedHours !== undefined && (typeof params.estimatedHours !== 'number' || params.estimatedHours < 0)) {
      errors.push('Estimated hours must be a non-negative number');
    }

    if (params.filePaths && !Array.isArray(params.filePaths)) {
      errors.push('File paths must be an array');
    }

    if (params.acceptanceCriteria && !Array.isArray(params.acceptanceCriteria)) {
      errors.push('Acceptance criteria must be an array');
    }

    if (params.tags && !Array.isArray(params.tags)) {
      errors.push('Tags must be an array');
    }

    if (params.dependencies && !Array.isArray(params.dependencies)) {
      errors.push('Dependencies must be an array');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Apply refinements to a task
   */
  private applyRefinements(
    originalTask: AtomicTask,
    refinements: TaskRefinementParams
  ): { refinedTask: AtomicTask; changes: string[] } {
    const changes: string[] = [];
    const refinedTask: AtomicTask = { ...originalTask };

    // Track changes
    if (refinements.title && refinements.title !== originalTask.title) {
      changes.push(`Title changed from "${originalTask.title}" to "${refinements.title}"`);
      refinedTask.title = refinements.title;
    }

    if (refinements.description && refinements.description !== originalTask.description) {
      changes.push(`Description updated`);
      refinedTask.description = refinements.description;
    }

    if (refinements.type && refinements.type !== originalTask.type) {
      changes.push(`Type changed from "${originalTask.type}" to "${refinements.type}"`);
      refinedTask.type = refinements.type;
    }

    if (refinements.priority && refinements.priority !== originalTask.priority) {
      changes.push(`Priority changed from "${originalTask.priority}" to "${refinements.priority}"`);
      refinedTask.priority = refinements.priority;
    }

    if (refinements.estimatedHours !== undefined && refinements.estimatedHours !== originalTask.estimatedHours) {
      changes.push(`Estimated hours changed from ${originalTask.estimatedHours} to ${refinements.estimatedHours}`);
      refinedTask.estimatedHours = refinements.estimatedHours;
    }

    if (refinements.filePaths && JSON.stringify(refinements.filePaths) !== JSON.stringify(originalTask.filePaths)) {
      changes.push(`File paths updated (${refinements.filePaths.length} files)`);
      refinedTask.filePaths = refinements.filePaths;
    }

    if (refinements.acceptanceCriteria && JSON.stringify(refinements.acceptanceCriteria) !== JSON.stringify(originalTask.acceptanceCriteria)) {
      changes.push(`Acceptance criteria updated (${refinements.acceptanceCriteria.length} criteria)`);
      refinedTask.acceptanceCriteria = refinements.acceptanceCriteria;
    }

    if (refinements.tags && JSON.stringify(refinements.tags) !== JSON.stringify(originalTask.tags)) {
      changes.push(`Tags updated`);
      refinedTask.tags = refinements.tags;
    }

    if (refinements.dependencies && JSON.stringify(refinements.dependencies) !== JSON.stringify(originalTask.dependencies)) {
      changes.push(`Dependencies updated`);
      refinedTask.dependencies = refinements.dependencies;
    }

    // Update metadata
    refinedTask.updatedAt = new Date();

    return { refinedTask, changes };
  }

  /**
   * Determine if task should be re-decomposed based on changes
   */
  private async shouldRedecompose(
    originalTask: AtomicTask,
    refinedTask: AtomicTask,
    changes: string[]
  ): Promise<boolean> {
    // Significant changes that might warrant re-decomposition
    const significantChanges = [
      // Scope expansion
      refinedTask.estimatedHours > originalTask.estimatedHours * 1.5,
      // Major file path changes
      refinedTask.filePaths.length > originalTask.filePaths.length * 1.5,
      // Acceptance criteria expansion
      refinedTask.acceptanceCriteria.length > originalTask.acceptanceCriteria.length * 1.5,
      // Type change to more complex type
      originalTask.type === 'documentation' && refinedTask.type === 'development',
      // Priority escalation with scope increase
      originalTask.priority !== 'critical' && refinedTask.priority === 'critical' && refinedTask.estimatedHours > 6
    ];

    const hasSignificantChanges = significantChanges.some(condition => condition);

    if (hasSignificantChanges) {
      logger.info({
        taskId: originalTask.id,
        changes: changes.length,
        originalHours: originalTask.estimatedHours,
        refinedHours: refinedTask.estimatedHours
      }, 'Task changes suggest re-decomposition needed');
    }

    return hasSignificantChanges;
  }

  /**
   * Perform task re-decomposition
   */
  private async performRedecomposition(
    task: AtomicTask,
    _params: RedecompositionParams,
    _refinedBy: string
  ): Promise<{ success: boolean; decomposedTasks?: AtomicTask[]; error?: string }> {
    try {
      // Ensure decomposition service is initialized
      if (!this.decompositionService) {
        await this.initializeDecompositionService();
      }

      if (!this.decompositionService) {
        throw new Error('Failed to initialize decomposition service');
      }

      // Build project context
      const context: ProjectContext = {
        projectId: task.projectId,
        languages: this.getProjectLanguages(task.projectId), // Get from project config
        frameworks: this.getProjectFrameworks(task.projectId), // Get from project config
        tools: this.getProjectTools(task.projectId), // Get from project config
        existingTasks: [],
        codebaseSize: this.determineCodebaseSize(task.projectId), // Determine from project
        teamSize: this.getTeamSize(task.projectId), // Get from project config
        complexity: this.determineTaskComplexity(task) // Determine from task analysis
      };

      // Create decomposition request
      const decompositionRequest: DecompositionRequest = {
        task,
        context,
        config: {
          maxDepth: 3,
          maxSubTasks: 6,
          minConfidence: 0.7,
          enableParallelDecomposition: false
        }
      };

      // Start decomposition session
      const session = await this.decompositionService.startDecomposition(decompositionRequest);

      // Wait for completion (with timeout)
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds timeout

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

        const currentSession = this.decompositionService.getSession(session.id);
        if (!currentSession) {
          throw new Error('Decomposition session lost');
        }

        if (currentSession.status === 'completed') {
          const results = this.decompositionService.getResults(session.id);
          return {
            success: true,
            decomposedTasks: results
          };
        }

        if (currentSession.status === 'failed') {
          return {
            success: false,
            error: currentSession.error || 'Decomposition failed'
          };
        }

        attempts++;
      }

      // Timeout
      this.decompositionService.cancelSession(session.id);
      return {
        success: false,
        error: 'Decomposition timeout'
      };

    } catch (error) {
      logger.error({ err: error, taskId: task.id }, 'Failed to perform re-decomposition');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get refinement history for a task
   * Currently returns empty array - refinement history tracking not yet implemented
   */
  async getRefinementHistory(_taskId: string): Promise<FileOperationResult<RefinementHistoryEntry[]>> {
    // Refinement history tracking would require storing refinement events in a separate log
    return {
      success: true,
      data: [],
      metadata: {
        filePath: 'task-refinement-service',
        operation: 'get_refinement_history',
        timestamp: new Date()
      }
    };
  }

  /**
   * Analyze task complexity for refinement recommendations
   */
  async analyzeTaskComplexity(taskId: string): Promise<FileOperationResult<{
    complexity: 'low' | 'medium' | 'high';
    recommendations: string[];
    shouldDecompose: boolean;
    estimatedSubTasks: number;
  }>> {
    try {
      const taskOperations = getTaskOperations();
      const taskResult = await taskOperations.getTask(taskId);

      if (!taskResult.success) {
        return {
          success: false,
          error: `Task not found: ${taskResult.error}`,
          metadata: {
            filePath: 'task-refinement-service',
            operation: 'analyze_complexity',
            timestamp: new Date()
          }
        };
      }

      const task = taskResult.data!;
      const analysis = this.performComplexityAnalysis(task);

      return {
        success: true,
        data: analysis,
        metadata: {
          filePath: 'task-refinement-service',
          operation: 'analyze_complexity',
          timestamp: new Date()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-refinement-service',
          operation: 'analyze_complexity',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Perform complexity analysis on a task
   */
  private performComplexityAnalysis(task: AtomicTask): {
    complexity: 'low' | 'medium' | 'high';
    recommendations: string[];
    shouldDecompose: boolean;
    estimatedSubTasks: number;
  } {
    const factors = {
      hours: task.estimatedHours,
      files: task.filePaths.length,
      criteria: task.acceptanceCriteria.length,
      dependencies: task.dependencies.length
    };

    let complexityScore = 0;
    const recommendations: string[] = [];

    // Scoring based on various factors
    if (factors.hours > 6) {
      complexityScore += 3;
      recommendations.push('Consider breaking down tasks over 6 hours');
    } else if (factors.hours > 4) {
      complexityScore += 2;
    } else if (factors.hours > 2) {
      complexityScore += 1;
    }

    if (factors.files > 5) {
      complexityScore += 2;
      recommendations.push('Multiple file modifications suggest complex task');
    } else if (factors.files > 3) {
      complexityScore += 1;
    }

    if (factors.criteria < 2) {
      complexityScore += 1;
      recommendations.push('Add more specific acceptance criteria');
    } else if (factors.criteria > 5) {
      complexityScore += 1;
      recommendations.push('Many acceptance criteria may indicate complex task');
    }

    if (factors.dependencies > 3) {
      complexityScore += 1;
      recommendations.push('Multiple dependencies increase complexity');
    }

    // Determine complexity level
    let complexity: 'low' | 'medium' | 'high';
    if (complexityScore <= 2) {
      complexity = 'low';
    } else if (complexityScore <= 5) {
      complexity = 'medium';
    } else {
      complexity = 'high';
      recommendations.push('High complexity task should be decomposed');
    }

    const shouldDecompose = complexityScore > 4;
    const estimatedSubTasks = shouldDecompose ? Math.min(Math.ceil(factors.hours / 3), 6) : 1;

    return {
      complexity,
      recommendations,
      shouldDecompose,
      estimatedSubTasks
    };
  }

  /**
   * Helper methods for project context building
   */

  /**
   * Get project languages from project configuration
   * Returns default languages - could be enhanced to fetch from project storage
   */
  private getProjectLanguages(projectId: string): string[] {
    // Default implementation returns sensible defaults based on common project types
    return ['typescript', 'javascript'];
  }

  /**
   * Get project frameworks from project configuration
   * Returns default frameworks - could be enhanced to fetch from project storage
   */
  private getProjectFrameworks(projectId: string): string[] {
    // Default implementation returns sensible defaults
    return ['node.js'];
  }

  /**
   * Get project tools from project configuration
   * Returns default tools - could be enhanced to fetch from project storage
   */
  private getProjectTools(projectId: string): string[] {
    // Default implementation returns sensible defaults
    return ['vitest', 'npm'];
  }

  /**
   * Determine codebase size from project analysis
   * Returns default size - could be enhanced to analyze project structure
   */
  private determineCodebaseSize(projectId: string): 'small' | 'medium' | 'large' {
    // Default implementation returns medium as a sensible default
    return 'medium';
  }

  /**
   * Get team size from project configuration
   * Returns default team size - could be enhanced to fetch from project storage
   */
  private getTeamSize(projectId: string): number {
    // Default implementation returns a sensible default
    return 3;
  }

  /**
   * Determine task complexity from task analysis
   */
  private determineTaskComplexity(task: AtomicTask): 'low' | 'medium' | 'high' {
    const analysis = this.performComplexityAnalysis(task);
    return analysis.complexity;
  }
}

/**
 * Get singleton instance of task refinement service
 */
export function getTaskRefinementService(): TaskRefinementService {
  return TaskRefinementService.getInstance();
}
