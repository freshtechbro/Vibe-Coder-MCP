import { RDDEngine, DecompositionResult, RDDConfig } from '../core/rdd-engine.js';
import { ProjectContext as AtomicDetectorContext } from '../core/atomic-detector.js';
import { ProjectContext } from '../types/project-context.js';
import { AtomicTask } from '../types/task.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { getVibeTaskManagerConfig } from '../utils/config-loader.js';
import { ContextEnrichmentService, ContextRequest } from './context-enrichment-service.js';
import { AutoResearchDetector } from './auto-research-detector.js';
import { ResearchIntegration } from '../integrations/research-integration.js';
import { ResearchTriggerContext } from '../types/research-types.js';
import { getTaskOperations } from '../core/operations/task-operations.js';
import {
  EnhancedError,
  TaskExecutionError,
  ValidationError,
  TimeoutError,
  createErrorContext
} from '../utils/enhanced-errors.js';
import logger from '../../../logger.js';
import type {
  ParsedTaskList,
  TaskListItem
} from '../types/artifact-types.js';
import type { TaskType } from '../types/task.js';
import { TaskOperations } from '../core/operations/task-operations.js';
import { WorkflowStateManager, WorkflowPhase, WorkflowState } from './workflow-state-manager.js';
import { DecompositionSummaryGenerator, SummaryConfig } from './decomposition-summary-generator.js';

/**
 * Decomposition session for tracking progress
 */
export interface DecompositionSession {
  id: string;
  taskId: string;
  projectId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  progress: number; // 0-100
  currentDepth: number;
  maxDepth: number;
  totalTasks: number;
  processedTasks: number;
  results: DecompositionResult[];
  error?: string;
  // NEW: Enhanced fields for task persistence and rich responses
  persistedTasks?: AtomicTask[];
  taskFiles?: string[];
  richResults?: {
    tasks: AtomicTask[];
    files: string[];
    summary: {
      totalTasks: number;
      totalHours: number;
      projectId: string;
      successfullyPersisted: number;
      totalGenerated: number;
    };
  };
}

/**
 * Decomposition request parameters
 */
export interface DecompositionRequest {
  task: AtomicTask;
  context: AtomicDetectorContext;
  config?: Partial<RDDConfig>;
  sessionId?: string;
}

/**
 * Decomposition service orchestrates the task decomposition process
 */
export class DecompositionService {
  private engine: RDDEngine;
  private sessions: Map<string, DecompositionSession> = new Map();
  private config: OpenRouterConfig;
  private contextService: ContextEnrichmentService;
  private autoResearchDetector: AutoResearchDetector;
  private researchIntegrationService: ResearchIntegration;
  private workflowStateManager: WorkflowStateManager;
  private summaryGenerator: DecompositionSummaryGenerator;

  constructor(config: OpenRouterConfig, summaryConfig?: Partial<SummaryConfig>) {
    this.config = config;
    this.engine = new RDDEngine(config);
    this.contextService = ContextEnrichmentService.getInstance();
    this.autoResearchDetector = AutoResearchDetector.getInstance();
    this.researchIntegrationService = ResearchIntegration.getInstance();
    this.workflowStateManager = new WorkflowStateManager();
    this.summaryGenerator = new DecompositionSummaryGenerator(summaryConfig);
  }

  /**
   * Start a new decomposition session
   */
  async startDecomposition(request: DecompositionRequest): Promise<DecompositionSession> {
    const sessionId = request.sessionId || this.generateSessionId();

    const context = createErrorContext('DecompositionService', 'startDecomposition')
      .taskId(request.task.id)
      .projectId(request.context.projectId)
      .sessionId(sessionId)
      .metadata({
        maxDepth: request.config?.maxDepth || 5,
        hasCustomConfig: !!request.config
      })
      .build();

    try {
      // Validate request
      if (!request.task) {
        throw new ValidationError(
          'Task is required for decomposition',
          context,
          {
            field: 'request.task',
            expectedFormat: 'AtomicTask object'
          }
        );
      }

      if (!request.task.id || request.task.id.trim() === '') {
        throw new ValidationError(
          'Task ID is required for decomposition',
          context,
          {
            field: 'request.task.id',
            expectedFormat: 'Non-empty string',
            actualValue: request.task.id
          }
        );
      }

      if (!request.context) {
        throw new ValidationError(
          'Project context is required for decomposition',
          context,
          {
            field: 'request.context',
            expectedFormat: 'ProjectContext object'
          }
        );
      }

      if (!request.context.projectId || request.context.projectId.trim() === '') {
        throw new ValidationError(
          'Project ID is required in context for decomposition',
          context,
          {
            field: 'request.context.projectId',
            expectedFormat: 'Non-empty string',
            actualValue: request.context.projectId
          }
        );
      }

      logger.info({
        sessionId,
        taskId: request.task.id,
        projectId: request.context.projectId
      }, 'Starting decomposition session');

      const session: DecompositionSession = {
        id: sessionId,
        taskId: request.task.id,
        projectId: request.context.projectId,
        status: 'pending',
        startTime: new Date(),
        progress: 0,
        currentDepth: 0,
        maxDepth: request.config?.maxDepth || 5,
        totalTasks: 1,
        processedTasks: 0,
        results: []
      };

      this.sessions.set(sessionId, session);

      // Initialize workflow state management
      await this.workflowStateManager.initializeWorkflow(
        sessionId,
        sessionId,
        request.context.projectId,
        {
          taskId: request.task.id,
          taskTitle: request.task.title,
          maxDepth: request.config?.maxDepth || 5
        }
      );

      // Start decomposition asynchronously with enhanced error handling
      setTimeout(() => {
        this.executeDecomposition(session, request).catch(error => {
          const errorMessage = error instanceof EnhancedError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Unknown error';

          logger.error({
            err: error,
            sessionId,
            errorType: error.constructor.name,
            retryable: error instanceof EnhancedError ? error.retryable : false
          }, 'Decomposition session failed');

          session.status = 'failed';
          session.error = errorMessage;
          session.endTime = new Date();
        });
      }, 0);

      return session;

    } catch (error) {
      if (error instanceof EnhancedError) {
        throw error;
      }

      throw new TaskExecutionError(
        `Failed to start decomposition session: ${error instanceof Error ? error.message : String(error)}`,
        context,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true
        }
      );
    }
  }

  /**
   * Get decomposition session status
   */
  getSession(sessionId: string): DecompositionSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): DecompositionSession[] {
    return Array.from(this.sessions.values()).filter(
      session => session.status === 'pending' || session.status === 'in_progress'
    );
  }

  /**
   * Cancel a decomposition session
   */
  cancelSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === 'completed' || session.status === 'failed') {
      return false;
    }

    session.status = 'failed';
    session.error = 'Cancelled by user';
    session.endTime = new Date();

    logger.info({ sessionId }, 'Decomposition session cancelled');
    return true;
  }

  /**
   * Clean up old sessions
   */
  cleanupSessions(maxAge: number = 24 * 60 * 60 * 1000): number {
    const cutoff = new Date(Date.now() - maxAge);
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.endTime && session.endTime < cutoff) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info({ cleaned }, 'Cleaned up old decomposition sessions');
    }

    return cleaned;
  }

  /**
   * Execute the decomposition process
   */
  private async executeDecomposition(
    session: DecompositionSession,
    request: DecompositionRequest
  ): Promise<void> {
    try {
      session.status = 'in_progress';
      session.progress = 10;

      // Transition to decomposition phase
      await this.workflowStateManager.transitionWorkflow(
        session.id,
        WorkflowPhase.DECOMPOSITION,
        WorkflowState.IN_PROGRESS,
        {
          reason: 'Starting decomposition execution',
          progress: 10,
          triggeredBy: 'DecompositionService'
        }
      );

      // Update engine configuration if provided
      if (request.config) {
        this.engine = new RDDEngine(this.config, request.config);
      }

      // Enrich context with codebase information
      const enrichedContext = await this.enrichContext(request.context, request.task);
      session.progress = 20;

      // Update workflow progress
      await this.workflowStateManager.updatePhaseProgress(
        session.id,
        WorkflowPhase.DECOMPOSITION,
        20,
        { step: 'context_enrichment_completed' }
      );

      // Perform decomposition
      const result = await this.engine.decomposeTask(request.task, enrichedContext);
      session.progress = 80;

      // Update workflow progress
      await this.workflowStateManager.updatePhaseProgress(
        session.id,
        WorkflowPhase.DECOMPOSITION,
        80,
        {
          step: 'decomposition_completed',
          subTaskCount: result.subTasks?.length || 0,
          isAtomic: result.isAtomic
        }
      );

      // Process results
      session.results = [result];
      session.processedTasks = 1;
      session.currentDepth = result.depth;

      // NEW: Persist decomposed tasks to storage
      if (result.subTasks && result.subTasks.length > 0) {
        session.progress = 85;
        const taskOps = getTaskOperations();
        const persistedTasks: AtomicTask[] = [];
        const taskFiles: string[] = [];
        const taskIdMapping = new Map<string, string>(); // Map original IDs to new task IDs

        // First pass: Create all tasks and build ID mapping
        for (const subTask of result.subTasks) {
          try {
            const createResult = await taskOps.createTask({
              title: subTask.title,
              description: subTask.description,
              type: subTask.type || 'development',
              priority: subTask.priority || 'medium',
              projectId: session.projectId,
              epicId: subTask.epicId,
              estimatedHours: subTask.estimatedHours || 1,
              acceptanceCriteria: subTask.acceptanceCriteria || [],
              tags: subTask.tags || []
            }, session.id);

            if (createResult.success && createResult.data) {
              persistedTasks.push(createResult.data);
              taskIdMapping.set(subTask.id, createResult.data.id); // Map original ID to new ID
              if (createResult.data.filePaths && createResult.data.filePaths.length > 0) {
                taskFiles.push(...createResult.data.filePaths);
              }
            }
          } catch (error) {
            logger.warn({
              err: error,
              taskTitle: subTask.title,
              sessionId: session.id
            }, 'Failed to persist individual task');
          }
        }

        // Second pass: Create dependencies using new task IDs
        const { getDependencyOperations } = await import('../core/operations/dependency-operations.js');
        const dependencyOps = getDependencyOperations();
        let dependenciesCreated = 0;

        for (const subTask of result.subTasks) {
          if (subTask.dependencies && subTask.dependencies.length > 0) {
            const newTaskId = taskIdMapping.get(subTask.id);
            if (newTaskId) {
              for (const depId of subTask.dependencies) {
                const newDepId = taskIdMapping.get(depId);
                if (newDepId) {
                  try {
                    const depResult = await dependencyOps.createDependency({
                      fromTaskId: newTaskId,
                      toTaskId: newDepId,
                      type: 'requires',
                      description: `${subTask.title} depends on ${depId}`,
                      critical: false
                    }, session.id);

                    if (depResult.success) {
                      dependenciesCreated++;
                      logger.debug({
                        fromTask: newTaskId,
                        toTask: newDepId,
                        sessionId: session.id
                      }, 'Dependency created successfully');
                    }
                  } catch (error) {
                    logger.warn({
                      err: error,
                      fromTask: newTaskId,
                      toTask: newDepId,
                      sessionId: session.id
                    }, 'Failed to create dependency');
                  }
                }
              }
            }
          }
        }

        // Third pass: Generate dependency graph if dependencies were created
        if (dependenciesCreated > 0) {
          try {
            const graphResult = await dependencyOps.generateDependencyGraph(session.projectId);
            if (graphResult.success) {
              logger.info({
                projectId: session.projectId,
                dependenciesCreated,
                sessionId: session.id
              }, 'Dependency graph generated successfully');
            } else {
              logger.warn({
                projectId: session.projectId,
                error: graphResult.error,
                sessionId: session.id
              }, 'Failed to generate dependency graph');
            }
          } catch (error) {
            logger.warn({
              err: error,
              projectId: session.projectId,
              sessionId: session.id
            }, 'Error generating dependency graph');
          }
        }

        // Update session with persisted task references
        session.persistedTasks = persistedTasks;
        session.taskFiles = taskFiles;

        // NEW: Store rich results for MCP response
        session.richResults = {
          tasks: persistedTasks,
          files: taskFiles,
          summary: {
            totalTasks: persistedTasks.length,
            totalHours: persistedTasks.reduce((sum, task) => sum + (task?.estimatedHours || 0), 0),
            projectId: session.projectId,
            successfullyPersisted: persistedTasks.length,
            totalGenerated: result.subTasks.length
          }
        };

        logger.info({
          sessionId: session.id,
          totalGenerated: result.subTasks.length,
          successfullyPersisted: persistedTasks.length,
          taskFiles: taskFiles.length
        }, 'Tasks persisted to storage successfully');
      }

      // NEW: Perform dependency analysis before completion
      if (result.subTasks && result.subTasks.length > 1) {
        session.progress = 90;
        logger.info({
          sessionId: session.id,
          taskCount: result.subTasks.length
        }, 'Starting dependency analysis for decomposed tasks');

        try {
          await this.performDependencyAnalysis(session, result.subTasks);
          logger.info({
            sessionId: session.id
          }, 'Dependency analysis completed successfully');
        } catch (error) {
          logger.warn({
            err: error,
            sessionId: session.id
          }, 'Dependency analysis failed, continuing without dependencies');
        }
      }

      // Calculate final statistics
      this.calculateSessionStats(session);
      session.progress = 100;
      session.status = 'completed';
      session.endTime = new Date();

      // Complete decomposition phase
      await this.workflowStateManager.transitionWorkflow(
        session.id,
        WorkflowPhase.DECOMPOSITION,
        WorkflowState.COMPLETED,
        {
          reason: 'Decomposition completed successfully',
          progress: 100,
          triggeredBy: 'DecompositionService',
          metadata: {
            totalSubTasks: result.subTasks?.length || 0,
            isAtomic: result.isAtomic,
            depth: result.depth,
            persistedTasks: session.persistedTasks?.length || 0
          }
        }
      );

      logger.info({
        sessionId: session.id,
        totalSubTasks: result.subTasks.length,
        isAtomic: result.isAtomic,
        depth: result.depth
      }, 'Decomposition session completed');

      // Generate session summary
      try {
        const summaryResult = await this.summaryGenerator.generateSessionSummary(session);
        if (summaryResult.success) {
          logger.info({
            sessionId: session.id,
            outputDirectory: summaryResult.outputDirectory,
            filesGenerated: summaryResult.generatedFiles.length,
            generationTime: summaryResult.metadata.generationTime
          }, 'Decomposition session summary generated successfully');
        } else {
          logger.warn({
            sessionId: session.id,
            error: summaryResult.error
          }, 'Failed to generate decomposition session summary');
        }
      } catch (summaryError) {
        logger.warn({
          err: summaryError,
          sessionId: session.id
        }, 'Error generating decomposition session summary');
      }

      // Trigger orchestration workflow after successful decomposition
      await this.triggerOrchestrationWorkflow(session);

    } catch (error) {
      logger.error({ err: error, sessionId: session.id }, 'Decomposition execution failed');

      // Mark workflow as failed
      try {
        await this.workflowStateManager.transitionWorkflow(
          session.id,
          WorkflowPhase.DECOMPOSITION,
          WorkflowState.FAILED,
          {
            reason: `Decomposition failed: ${error instanceof Error ? error.message : String(error)}`,
            triggeredBy: 'DecompositionService',
            metadata: { error: error instanceof Error ? error.message : String(error) }
          }
        );
      } catch (workflowError) {
        logger.warn({ err: workflowError, sessionId: session.id }, 'Failed to update workflow state on error');
      }

      throw error;
    }
  }

  /**
   * Enrich context with additional codebase information and auto-research
   */
  private async enrichContext(context: AtomicDetectorContext, task?: AtomicTask): Promise<AtomicDetectorContext> {
    try {
      logger.info({ projectId: context.projectId }, 'Enriching context with codebase information and auto-research');

      // If no task provided, return context as-is
      if (!task) {
        logger.debug('No task provided for context enrichment, using original context');
        return context;
      }

      // Determine project path from context or use current working directory
      const projectPath = this.getProjectPath(context); // Get from project configuration

      // Create context request based on task information
      const contextRequest: ContextRequest = {
        taskDescription: task.description || task.title,
        projectPath,
        maxFiles: this.determineMaxFiles(task),
        maxContentSize: this.determineMaxContentSize(task),
        searchPatterns: this.extractSearchPatterns(task),
        priorityFileTypes: this.determineFileTypes(context),
        excludeDirs: ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'],
        contentKeywords: this.extractContentKeywords(task)
      };

      logger.debug({
        taskId: task.id,
        searchPatterns: contextRequest.searchPatterns,
        maxFiles: contextRequest.maxFiles
      }, 'Gathering context for task decomposition');

      // Gather context using the context enrichment service
      const contextResult = await this.contextService.gatherContext(contextRequest);

      // NEW: Auto-Research Triggering Integration
      // Evaluate if research is needed based on project type, task complexity, knowledge gaps, and domain requirements
      const researchTriggerContext: ResearchTriggerContext = {
        task,
        projectContext: context,
        contextResult,
        projectPath,
        sessionId: `research_${task.id}_${Date.now()}`
      };

      logger.debug({
        taskId: task.id,
        projectId: context.projectId
      }, 'Evaluating auto-research need');

      const researchEvaluation = await this.autoResearchDetector.evaluateResearchNeed(researchTriggerContext);

      let enhancedContext: AtomicDetectorContext = context;

      // If research is recommended, perform it before context enrichment
      if (researchEvaluation.decision.shouldTriggerResearch) {
        logger.info({
          taskId: task.id,
          primaryReason: researchEvaluation.decision.primaryReason,
          confidence: researchEvaluation.decision.confidence,
          estimatedQueries: researchEvaluation.decision.recommendedScope.estimatedQueries
        }, 'Auto-research triggered - enhancing decomposition with research');

        try {
          // Perform research integration
          const researchResult = await this.researchIntegrationService.enhanceDecompositionWithResearch({
            taskDescription: task.description || task.title,
            projectPath,
            domain: this.extractDomain(context),
            context: context
          });

          // Extract research insights and create enhanced context
          const researchInsights = researchResult.researchResults.reduce((acc, result) => {
            acc.researchResults.push(result.content);
            acc.researchQueries.push(result.metadata.query);
            acc.knowledgeBase.push(...result.insights.keyFindings);
            acc.actionItems.push(...result.insights.actionItems);
            return acc;
          }, {
            researchResults: [] as string[],
            researchSummary: '',
            researchQueries: [] as string[],
            researchTime: researchResult.integrationMetrics.researchTime,
            knowledgeBase: [] as string[],
            actionItems: [] as string[]
          });

          // Create research summary
          researchInsights.researchSummary = this.createResearchSummary(researchResult.researchResults);

          // Enhance context with research insights (using a simple approach for now)
          enhancedContext = {
            ...context,
            // Add research insights to the context in a compatible way
            researchInsights: researchInsights
          } as AtomicDetectorContext;

          logger.info({
            taskId: task.id,
            researchTime: researchEvaluation.metadata.performance.totalTime
          }, 'Auto-research completed successfully');

        } catch (researchError) {
          logger.warn({
            err: researchError,
            taskId: task.id,
            primaryReason: researchEvaluation.decision.primaryReason
          }, 'Auto-research failed, continuing with standard context enrichment');

          // Continue with standard enrichment if research fails
          enhancedContext = context;
        }
      } else {
        logger.debug({
          taskId: task.id,
          primaryReason: researchEvaluation.decision.primaryReason,
          confidence: researchEvaluation.decision.confidence
        }, 'Auto-research not needed, proceeding with standard context enrichment');
      }

      // Create enhanced context summary for the LLM
      const contextSummary = await this.contextService.createContextSummary(contextResult);

      // Enhance the project context with gathered information (merge with any research-enhanced context)
      const finalEnhancedContext: AtomicDetectorContext = {
        ...enhancedContext, // Use research-enhanced context as base (or original context if no research)
        // Add context information in a compatible way
        codebaseContext: {
          relevantFiles: contextResult.contextFiles.map(f => ({
            path: f.filePath,
            relevance: f.relevance.overallScore,
            type: f.extension,
            size: f.charCount
          })),
          contextSummary,
          gatheringMetrics: contextResult.metrics,
          totalContextSize: contextResult.summary.totalSize,
          averageRelevance: contextResult.summary.averageRelevance
        }
      };

      logger.info({
        projectId: context.projectId,
        filesFound: contextResult.summary.totalFiles,
        totalSize: contextResult.summary.totalSize,
        averageRelevance: contextResult.summary.averageRelevance,
        gatheringTime: contextResult.metrics.totalTime,
        hasResearchContext: !!(finalEnhancedContext as any).researchInsights,
        autoResearchTriggered: researchEvaluation.decision.shouldTriggerResearch
      }, 'Context enrichment completed with auto-research integration');

      return finalEnhancedContext;

    } catch (error) {
      logger.warn({ err: error, projectId: context.projectId }, 'Failed to enrich context, using original');
      return context;
    }
  }

  /**
   * Calculate session statistics
   */
  private calculateSessionStats(session: DecompositionSession): void {
    if (session.results.length === 0) return;

    const mainResult = session.results[0];

    // Count total atomic tasks produced
    const countAtomicTasks = (result: DecompositionResult): number => {
      if (result.isAtomic) return 1;
      return result.subTasks.length;
    };

    session.totalTasks = countAtomicTasks(mainResult);
    session.processedTasks = session.totalTasks;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `decomp_${timestamp}_${random}`;
  }

  /**
   * Retry failed decomposition with different parameters
   */
  async retryDecomposition(
    sessionId: string,
    newConfig?: Partial<RDDConfig>
  ): Promise<DecompositionSession | null> {
    const originalSession = this.sessions.get(sessionId);
    if (!originalSession || originalSession.status !== 'failed') {
      return null;
    }

    // Create new session based on original
    const retrySessionId = `${sessionId}_retry_${Date.now()}`;

    // We need to reconstruct the original request
    // This is a limitation - in a real implementation, we'd store the original request
    logger.warn({ sessionId, retrySessionId }, 'Retry decomposition requested but original request not stored');

    return null; // Cannot retry without original request
  }

  /**
   * Get decomposition statistics
   */
  getStatistics(): {
    totalSessions: number;
    activeSessions: number;
    completedSessions: number;
    failedSessions: number;
    averageProcessingTime: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const completed = sessions.filter(s => s.status === 'completed');
    const failed = sessions.filter(s => s.status === 'failed');
    const active = sessions.filter(s => s.status === 'in_progress' || s.status === 'pending');

    const averageProcessingTime = completed.length > 0
      ? completed.reduce((sum, s) => {
          const duration = s.endTime ? s.endTime.getTime() - s.startTime.getTime() : 0;
          return sum + duration;
        }, 0) / completed.length
      : 0;

    return {
      totalSessions: sessions.length,
      activeSessions: active.length,
      completedSessions: completed.length,
      failedSessions: failed.length,
      averageProcessingTime
    };
  }

  /**
   * Parallel decomposition of multiple tasks (if enabled)
   */
  async decomposeMultipleTasks(
    requests: DecompositionRequest[]
  ): Promise<DecompositionSession[]> {
    logger.info({ taskCount: requests.length }, 'Starting parallel decomposition');

    const sessions = await Promise.all(
      requests.map(request => this.startDecomposition(request))
    );

    return sessions;
  }

  /**
   * Decompose tasks from a parsed task list
   */
  async decomposeFromTaskList(
    taskList: ParsedTaskList,
    projectId: string,
    epicId?: string,
    options?: {
      maxDepth?: number;
      minHours?: number;
      maxHours?: number;
      forceDecomposition?: boolean;
    }
  ): Promise<DecompositionSession> {
    const sessionId = this.generateSessionId();

    const context = createErrorContext('DecompositionService', 'decomposeFromTaskList')
      .projectId(projectId)
      .sessionId(sessionId)
      .metadata({
        taskListPath: taskList.metadata.filePath,
        totalTasks: taskList.metadata.totalTasks,
        phaseCount: taskList.metadata.phaseCount,
        maxDepth: options?.maxDepth || 3
      })
      .build();

    try {
      // Validate inputs
      if (!projectId || projectId.trim() === '') {
        throw new ValidationError(
          'Project ID is required for task list decomposition',
          context,
          {
            field: 'projectId',
            expectedFormat: 'Non-empty string',
            actualValue: projectId
          }
        );
      }

      if (!taskList.phases || taskList.phases.length === 0) {
        throw new ValidationError(
          'Task list must contain at least one phase with tasks',
          context,
          {
            field: 'taskList.phases',
            expectedFormat: 'Array with at least one phase',
            actualValue: taskList.phases?.length || 0
          }
        );
      }

      logger.info({
        sessionId,
        projectId,
        taskListPath: taskList.metadata.filePath,
        totalTasks: taskList.metadata.totalTasks,
        phaseCount: taskList.metadata.phaseCount
      }, 'Starting task list decomposition session');

      const session: DecompositionSession = {
        id: sessionId,
        taskId: `task-list-${taskList.metadata.projectName}`,
        projectId,
        status: 'pending',
        startTime: new Date(),
        progress: 0,
        currentDepth: 0,
        maxDepth: options?.maxDepth || 3,
        totalTasks: taskList.metadata.totalTasks,
        processedTasks: 0,
        results: []
      };

      this.sessions.set(sessionId, session);

      // Start decomposition asynchronously
      setTimeout(() => {
        this.executeTaskListDecomposition(session, taskList, projectId, epicId, options).catch(error => {
          const errorMessage = error instanceof EnhancedError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Unknown error';

          logger.error({
            err: error,
            sessionId,
            errorType: error.constructor.name,
            retryable: error instanceof EnhancedError ? error.retryable : false
          }, 'Task list decomposition session failed');

          session.status = 'failed';
          session.error = errorMessage;
          session.endTime = new Date();
        });
      }, 0);

      return session;

    } catch (error) {
      logger.error({
        err: error,
        sessionId,
        projectId,
        taskListPath: taskList.metadata.filePath
      }, 'Failed to start task list decomposition session');

      throw error instanceof EnhancedError ? error : new TaskExecutionError(
        'Failed to start task list decomposition session',
        context,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get decomposition results for a session
   */
  getResults(sessionId: string): AtomicTask[] {
    const session = this.sessions.get(sessionId);
    if (!session || session.results.length === 0) {
      return [];
    }

    const mainResult = session.results[0];
    if (mainResult.isAtomic) {
      return [mainResult.originalTask];
    }

    return mainResult.subTasks;
  }

  /**
   * Export session data for analysis
   */
  exportSession(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      session: {
        id: session.id,
        taskId: session.taskId,
        projectId: session.projectId,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        progress: session.progress,
        totalTasks: session.totalTasks,
        processedTasks: session.processedTasks,
        error: session.error
      },
      results: session.results.map(result => ({
        success: result.success,
        isAtomic: result.isAtomic,
        originalTaskId: result.originalTask.id,
        subTaskCount: result.subTasks.length,
        depth: result.depth,
        analysis: result.analysis,
        error: result.error
      }))
    };
  }

  /**
   * Execute task list decomposition process
   */
  private async executeTaskListDecomposition(
    session: DecompositionSession,
    taskList: ParsedTaskList,
    projectId: string,
    epicId?: string,
    options?: {
      maxDepth?: number;
      minHours?: number;
      maxHours?: number;
      forceDecomposition?: boolean;
    }
  ): Promise<void> {
    try {
      session.status = 'in_progress';
      session.progress = 10;

      const taskOps = TaskOperations.getInstance();
      const persistedTasks: AtomicTask[] = [];
      const taskFiles: string[] = [];

      logger.info({
        sessionId: session.id,
        projectId,
        totalTasks: taskList.metadata.totalTasks,
        phaseCount: taskList.metadata.phaseCount
      }, 'Processing task list decomposition');

      session.progress = 20;

      // Process each phase and its tasks
      for (const phase of taskList.phases) {
        logger.info({
          sessionId: session.id,
          phaseName: phase.name,
          taskCount: phase.tasks.length
        }, 'Processing phase tasks');

        for (const taskItem of phase.tasks) {
          try {
            // Convert task list item to atomic task
            const now = new Date();
            const atomicTask: AtomicTask = {
              id: taskItem.id,
              title: taskItem.title,
              description: taskItem.description,
              type: this.determineTaskType(taskItem),
              status: 'pending',
              priority: taskItem.priority,
              projectId,
              epicId: epicId || `epic-${phase.name.toLowerCase().replace(/\s+/g, '-')}`,
              estimatedHours: this.parseEstimatedHours(taskItem.estimatedEffort),
              actualHours: 0,
              dependencies: taskItem.dependencies,
              dependents: [],
              filePaths: [],
              acceptanceCriteria: [taskItem.userStory],
              testingRequirements: {
                unitTests: [],
                integrationTests: [],
                performanceTests: [],
                coverageTarget: 80
              },
              performanceCriteria: {},
              qualityCriteria: {
                codeQuality: ['Follow existing patterns'],
                documentation: ['Update relevant documentation'],
                typeScript: true,
                eslint: true
              },
              integrationCriteria: {
                compatibility: ['Zero breaking changes'],
                patterns: ['Follow existing codebase patterns']
              },
              validationMethods: {
                automated: ['Unit tests', 'Integration tests'],
                manual: ['Code review', 'Manual testing']
              },
              createdAt: now,
              updatedAt: now,
              createdBy: 'task-list-decomposition',
              tags: [phase.name, 'imported-from-task-list'],
              metadata: {
                createdAt: now,
                updatedAt: now,
                createdBy: 'task-list-decomposition',
                tags: [phase.name, 'imported-from-task-list']
              }
            };

            // Create the task
            const createResult = await taskOps.createTask({
              title: atomicTask.title,
              description: atomicTask.description,
              type: atomicTask.type,
              priority: atomicTask.priority,
              projectId: atomicTask.projectId,
              epicId: atomicTask.epicId,
              estimatedHours: atomicTask.estimatedHours,
              acceptanceCriteria: atomicTask.acceptanceCriteria,
              tags: atomicTask.metadata.tags
            }, session.id);

            if (createResult.success && createResult.data) {
              persistedTasks.push(createResult.data);
              if (createResult.data.filePaths && createResult.data.filePaths.length > 0) {
                taskFiles.push(...createResult.data.filePaths);
              }
            }

            session.processedTasks++;
            session.progress = 20 + (session.processedTasks / session.totalTasks) * 60;

          } catch (error) {
            logger.error({
              err: error,
              sessionId: session.id,
              taskId: taskItem.id,
              taskTitle: taskItem.title
            }, 'Failed to create task from task list item');
            // Continue processing other tasks
          }
        }
      }

      session.progress = 90;

      // Create decomposition result
      const decompositionResult: DecompositionResult = {
        success: true,
        isAtomic: false,
        originalTask: {
          id: `task-list-${taskList.metadata.projectName}`,
          title: `Task List: ${taskList.metadata.projectName}`,
          description: `Imported from task list: ${taskList.metadata.filePath}`,
          type: 'development',
          status: 'pending',
          priority: 'medium',
          projectId,
          epicId: await this.resolveEpicId(epicId, projectId, persistedTasks),
          estimatedHours: persistedTasks.reduce((sum, task) => sum + task.estimatedHours, 0),
          actualHours: 0,
          dependencies: [],
          dependents: [],
          filePaths: [],
          acceptanceCriteria: [],
          testingRequirements: {
            unitTests: [],
            integrationTests: [],
            performanceTests: [],
            coverageTarget: 80
          },
          performanceCriteria: {},
          qualityCriteria: {
            codeQuality: [],
            documentation: [],
            typeScript: true,
            eslint: true
          },
          integrationCriteria: {
            compatibility: [],
            patterns: []
          },
          validationMethods: {
            automated: [],
            manual: []
          },
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'task-list-decomposition',
          tags: ['imported-from-task-list'],
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'task-list-decomposition',
            tags: ['imported-from-task-list']
          }
        },
        subTasks: persistedTasks,
        depth: 1,
        analysis: {
          isAtomic: false,
          confidence: 0.9,
          reasoning: 'Task list import - decomposed into atomic tasks',
          estimatedHours: persistedTasks.reduce((sum, task) => sum + task.estimatedHours, 0),
          complexityFactors: ['Multiple tasks', 'Task list import'],
          recommendations: ['Review imported tasks for accuracy']
        }
      };

      session.results = [decompositionResult];
      session.persistedTasks = persistedTasks;
      session.taskFiles = taskFiles;
      session.richResults = {
        tasks: persistedTasks,
        files: taskFiles,
        summary: {
          totalTasks: persistedTasks.length,
          totalHours: persistedTasks.reduce((sum, task) => sum + task.estimatedHours, 0),
          projectId,
          successfullyPersisted: persistedTasks.length,
          totalGenerated: taskList.metadata.totalTasks
        }
      };

      // NEW: Perform dependency analysis for task list decomposition
      if (persistedTasks.length > 1) {
        session.progress = 90;
        logger.info({
          sessionId: session.id,
          taskCount: persistedTasks.length
        }, 'Starting dependency analysis for imported tasks');

        try {
          await this.performDependencyAnalysis(session, persistedTasks);
          logger.info({
            sessionId: session.id
          }, 'Dependency analysis completed successfully for task list');
        } catch (error) {
          logger.warn({
            err: error,
            sessionId: session.id
          }, 'Dependency analysis failed for task list, continuing without dependencies');
        }
      }

      session.status = 'completed';
      session.progress = 100;
      session.endTime = new Date();

      logger.info({
        sessionId: session.id,
        projectId,
        totalTasksCreated: persistedTasks.length,
        totalHours: session.richResults.summary.totalHours,
        processingTime: session.endTime.getTime() - session.startTime.getTime()
      }, 'Task list decomposition completed successfully');

      // Generate session summary
      try {
        const summaryResult = await this.summaryGenerator.generateSessionSummary(session);
        if (summaryResult.success) {
          logger.info({
            sessionId: session.id,
            outputDirectory: summaryResult.outputDirectory,
            filesGenerated: summaryResult.generatedFiles.length,
            generationTime: summaryResult.metadata.generationTime
          }, 'Task list decomposition session summary generated successfully');
        } else {
          logger.warn({
            sessionId: session.id,
            error: summaryResult.error
          }, 'Failed to generate task list decomposition session summary');
        }
      } catch (summaryError) {
        logger.warn({
          err: summaryError,
          sessionId: session.id
        }, 'Error generating task list decomposition session summary');
      }

      // Trigger orchestration workflow after successful task list decomposition
      await this.triggerOrchestrationWorkflow(session);

    } catch (error) {
      logger.error({
        err: error,
        sessionId: session.id,
        projectId
      }, 'Task list decomposition failed');

      session.status = 'failed';
      session.error = error instanceof Error ? error.message : 'Unknown error';
      session.endTime = new Date();
      throw error;
    }
  }

  /**
   * Perform dependency analysis on decomposed tasks
   */
  private async performDependencyAnalysis(
    session: DecompositionSession,
    tasks: AtomicTask[]
  ): Promise<void> {
    try {
      // Import dependency analysis utilities
      const { performFormatAwareLlmCall } = await import('../../../utils/llmHelper.js');
      const { getDependencyOperations } = await import('../core/operations/dependency-operations.js');
      const { getTaskOperations } = await import('../core/operations/task-operations.js');

      const dependencyOps = getDependencyOperations();
      const taskOps = getTaskOperations();

      // Prepare task information for LLM analysis
      const taskSummaries = tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        type: task.type,
        estimatedHours: task.estimatedHours,
        acceptanceCriteria: task.acceptanceCriteria
      }));

      // Build dependency analysis prompt
      const analysisPrompt = this.buildDependencyAnalysisPrompt(taskSummaries, session.projectId);

      // Call LLM for dependency analysis
      const response = await performFormatAwareLlmCall(
        analysisPrompt,
        'Analyze task dependencies and return a JSON structure with dependency relationships.',
        this.config,
        'dependency_analysis',
        'json',
        undefined,
        0.1 // Low temperature for consistent dependency analysis
      );

      // Parse and apply dependency relationships
      const dependencyData = this.parseDependencyAnalysisResponse(response);

      if (dependencyData && dependencyData.dependencies) {
        await this.applyDependencyRelationships(dependencyData.dependencies, tasks, taskOps, dependencyOps);

        // Verify that dependencies were written to YAML files
        await this.verifyDependencyPersistence(dependencyData.dependencies, taskOps, session.id);

        // Generate and save visual dependency graphs
        await this.generateAndSaveVisualDependencyGraphs(session, dependencyOps);
      }

      logger.info({
        sessionId: session.id,
        dependenciesAnalyzed: dependencyData?.dependencies?.length || 0
      }, 'Dependency analysis applied successfully');

    } catch (error) {
      logger.error({
        err: error,
        sessionId: session.id
      }, 'Failed to perform dependency analysis');
      throw error;
    }
  }

  /**
   * Build prompt for dependency analysis
   */
  private buildDependencyAnalysisPrompt(taskSummaries: any[], projectId: string): string {
    return `Analyze the following tasks for a project (${projectId}) and identify dependency relationships:

TASKS:
${taskSummaries.map((task, index) => `
${index + 1}. ID: ${task.id}
   Title: ${task.title}
   Description: ${task.description}
   Type: ${task.type}
   Estimated Hours: ${task.estimatedHours}
   Acceptance Criteria: ${task.acceptanceCriteria.join(', ')}
`).join('\n')}

Please analyze these tasks and identify:
1. Which tasks must be completed before others can start (dependencies)
2. The type of dependency (blocking, soft, or parallel)
3. The reasoning for each dependency

Return a JSON structure with the following format:
{
  "dependencies": [
    {
      "fromTaskId": "task_id_that_must_be_completed_first",
      "toTaskId": "task_id_that_depends_on_the_first",
      "type": "blocking|soft|parallel",
      "reasoning": "explanation of why this dependency exists"
    }
  ]
}

Focus on logical dependencies such as:
- Setup tasks that must complete before implementation
- Infrastructure tasks before feature development
- Database schema before API endpoints
- Authentication before protected features
- Testing dependencies on implementation completion`;
  }

  /**
   * Parse dependency analysis response from LLM
   */
  private parseDependencyAnalysisResponse(response: string): any {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(response);
      return parsed;
    } catch (error) {
      logger.warn({
        err: error,
        response: response.substring(0, 200)
      }, 'Failed to parse dependency analysis response as JSON');

      // Try to extract JSON from response if it's wrapped in text
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (innerError) {
          logger.warn({
            err: innerError,
            extractedJson: jsonMatch[0].substring(0, 200)
          }, 'Failed to parse extracted JSON from dependency analysis response');
        }
      }

      return null;
    }
  }

  /**
   * Apply dependency relationships to tasks
   */
  private async applyDependencyRelationships(
    dependencies: any[],
    tasks: AtomicTask[],
    taskOps: any,
    dependencyOps: any
  ): Promise<void> {
    const taskIdMap = new Map(tasks.map(task => [task.id, task]));

    for (const dep of dependencies) {
      try {
        const fromTask = taskIdMap.get(dep.fromTaskId);
        const toTask = taskIdMap.get(dep.toTaskId);

        if (!fromTask || !toTask) {
          logger.warn({
            fromTaskId: dep.fromTaskId,
            toTaskId: dep.toTaskId,
            fromTaskExists: !!fromTask,
            toTaskExists: !!toTask
          }, 'Skipping dependency - task not found');
          continue;
        }

        // Update task dependency arrays in memory
        if (!fromTask.dependents.includes(dep.toTaskId)) {
          fromTask.dependents.push(dep.toTaskId);
        }
        if (!toTask.dependencies.includes(dep.fromTaskId)) {
          toTask.dependencies.push(dep.fromTaskId);
        }

        // Update tasks in storage (YAML files) with proper session context
        const fromTaskUpdateResult = await taskOps.updateTask(fromTask.id, {
          dependents: fromTask.dependents
        }, 'dependency-analysis');

        const toTaskUpdateResult = await taskOps.updateTask(toTask.id, {
          dependencies: toTask.dependencies
        }, 'dependency-analysis');

        if (!fromTaskUpdateResult.success || !toTaskUpdateResult.success) {
          logger.warn({
            fromTaskId: dep.fromTaskId,
            toTaskId: dep.toTaskId,
            fromTaskUpdateSuccess: fromTaskUpdateResult.success,
            toTaskUpdateSuccess: toTaskUpdateResult.success,
            fromTaskError: fromTaskUpdateResult.error,
            toTaskError: toTaskUpdateResult.error
          }, 'Failed to update task dependency arrays in storage');
          continue;
        }

        // Create dependency record
        const dependencyResult = await dependencyOps.createDependency({
          fromTaskId: dep.fromTaskId,
          toTaskId: dep.toTaskId,
          type: this.mapDependencyType(dep.type),
          description: dep.reasoning || 'Auto-generated dependency'
        });

        if (!dependencyResult.success) {
          logger.warn({
            fromTaskId: dep.fromTaskId,
            toTaskId: dep.toTaskId,
            error: dependencyResult.error
          }, 'Failed to create dependency record');
          continue;
        }

        logger.info({
          fromTaskId: dep.fromTaskId,
          toTaskId: dep.toTaskId,
          type: this.mapDependencyType(dep.type),
          reasoning: dep.reasoning
        }, 'Successfully applied dependency relationship and updated YAML files');

      } catch (error) {
        logger.error({
          err: error,
          dependency: dep
        }, 'Failed to apply individual dependency relationship');
      }
    }
  }

  /**
   * Generate and save visual dependency graphs to dependency-graphs directory
   */
  private async generateAndSaveVisualDependencyGraphs(
    session: DecompositionSession,
    dependencyOps: any
  ): Promise<void> {
    try {
      logger.info({
        sessionId: session.id,
        projectId: session.projectId
      }, 'Generating visual dependency graphs');

      // Generate the dependency graph data structure
      const graphResult = await dependencyOps.generateDependencyGraph(session.projectId);

      if (!graphResult.success) {
        logger.warn({
          sessionId: session.id,
          projectId: session.projectId,
          error: graphResult.error
        }, 'Failed to generate dependency graph data structure');
        return;
      }

      const dependencyGraph = graphResult.data;

      // Create visual representations
      const mermaidDiagram = this.generateMermaidDependencyDiagram(dependencyGraph);
      const textSummary = this.generateTextDependencySummary(dependencyGraph);
      const jsonGraph = JSON.stringify(dependencyGraph, null, 2);

      // Save to dependency-graphs directory
      const { getVibeTaskManagerConfig } = await import('../utils/config-loader.js');
      const config = await getVibeTaskManagerConfig();
      const outputDir = config?.taskManager?.dataDirectory || './VibeCoderOutput/vibe-task-manager';

      const dependencyGraphsDir = `${outputDir}/dependency-graphs`;
      const fs = await import('fs-extra');

      // Ensure directory exists
      await fs.ensureDir(dependencyGraphsDir);

      // Save files with project-specific names
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseFileName = `${session.projectId}-${timestamp}`;

      await Promise.all([
        fs.writeFile(`${dependencyGraphsDir}/${baseFileName}-mermaid.md`, mermaidDiagram),
        fs.writeFile(`${dependencyGraphsDir}/${baseFileName}-summary.md`, textSummary),
        fs.writeFile(`${dependencyGraphsDir}/${baseFileName}-graph.json`, jsonGraph)
      ]);

      logger.info({
        sessionId: session.id,
        projectId: session.projectId,
        outputDir: dependencyGraphsDir,
        filesGenerated: 3
      }, 'Visual dependency graphs saved successfully');

    } catch (error) {
      logger.error({
        err: error,
        sessionId: session.id,
        projectId: session.projectId
      }, 'Failed to generate and save visual dependency graphs');
    }
  }

  /**
   * Generate Mermaid diagram from dependency graph
   */
  private generateMermaidDependencyDiagram(dependencyGraph: any): string {
    const { nodes, edges, criticalPath } = dependencyGraph;

    let mermaid = '# Task Dependency Graph\n\n```mermaid\ngraph TD\n';

    // Add nodes
    for (const [taskId, node] of nodes) {
      const sanitizedId = taskId.replace(/[^a-zA-Z0-9]/g, '_');
      const title = node.title.replace(/"/g, "'").substring(0, 30);
      const nodeClass = criticalPath.includes(taskId) ? 'critical' : 'normal';

      mermaid += `  ${sanitizedId}["${title}"]:::${nodeClass}\n`;
    }

    // Add edges
    for (const edge of edges) {
      const fromId = edge.fromTaskId.replace(/[^a-zA-Z0-9]/g, '_');
      const toId = edge.toTaskId.replace(/[^a-zA-Z0-9]/g, '_');
      const edgeLabel = edge.type || 'depends';

      mermaid += `  ${fromId} -->|${edgeLabel}| ${toId}\n`;
    }

    // Add styling
    mermaid += `
  classDef critical fill:#ff6b6b,stroke:#d63031,stroke-width:3px,color:#fff
  classDef normal fill:#74b9ff,stroke:#0984e3,stroke-width:2px,color:#fff
\`\`\`

## Critical Path
${criticalPath.length > 0 ? criticalPath.join(' → ') : 'No critical path identified'}

## Statistics
- Total Tasks: ${dependencyGraph.statistics.totalTasks}
- Total Dependencies: ${dependencyGraph.statistics.totalDependencies}
- Maximum Depth: ${dependencyGraph.statistics.maxDepth}
`;

    return mermaid;
  }

  /**
   * Generate text summary of dependency relationships
   */
  private generateTextDependencySummary(dependencyGraph: any): string {
    const { nodes, edges, executionOrder, criticalPath, statistics } = dependencyGraph;

    let summary = `# Dependency Analysis Summary\n\n`;
    summary += `**Project:** ${dependencyGraph.projectId}\n`;
    summary += `**Generated:** ${new Date().toISOString()}\n\n`;

    summary += `## Overview\n`;
    summary += `- **Total Tasks:** ${statistics.totalTasks}\n`;
    summary += `- **Total Dependencies:** ${statistics.totalDependencies}\n`;
    summary += `- **Maximum Depth:** ${statistics.maxDepth}\n`;
    summary += `- **Orphaned Tasks:** ${statistics.orphanedTasks.length}\n\n`;

    if (criticalPath.length > 0) {
      summary += `## Critical Path\n`;
      summary += `The longest sequence of dependent tasks:\n\n`;
      for (let i = 0; i < criticalPath.length; i++) {
        const taskId = criticalPath[i];
        const node = nodes.get(taskId);
        summary += `${i + 1}. **${taskId}**: ${node?.title || 'Unknown'}\n`;
      }
      summary += `\n`;
    }

    summary += `## Execution Order\n`;
    summary += `Recommended task execution sequence:\n\n`;
    executionOrder.forEach((taskId: string, index: number) => {
      const node = nodes.get(taskId);
      summary += `${index + 1}. **${taskId}**: ${node?.title || 'Unknown'}\n`;
    });

    summary += `\n## Dependency Details\n`;
    if (edges.length > 0) {
      edges.forEach((edge: any) => {
        const fromNode = nodes.get(edge.fromTaskId);
        const toNode = nodes.get(edge.toTaskId);
        summary += `- **${edge.fromTaskId}** (${fromNode?.title}) ${edge.type || 'depends on'} **${edge.toTaskId}** (${toNode?.title})\n`;
      });
    } else {
      summary += `No dependencies found.\n`;
    }

    return summary;
  }

  /**
   * Verify that dependency relationships were properly persisted to YAML files
   */
  private async verifyDependencyPersistence(
    dependencies: any[],
    taskOps: any,
    sessionId: string
  ): Promise<void> {
    let verificationErrors = 0;

    for (const dep of dependencies) {
      try {
        // Get the updated tasks from storage to verify persistence
        const fromTaskResult = await taskOps.getTask(dep.fromTaskId);
        const toTaskResult = await taskOps.getTask(dep.toTaskId);

        if (!fromTaskResult.success || !toTaskResult.success) {
          logger.warn({
            fromTaskId: dep.fromTaskId,
            toTaskId: dep.toTaskId,
            fromTaskExists: fromTaskResult.success,
            toTaskExists: toTaskResult.success,
            sessionId
          }, 'Could not verify dependency persistence - task not found');
          verificationErrors++;
          continue;
        }

        const fromTask = fromTaskResult.data;
        const toTask = toTaskResult.data;

        // Verify that the dependency arrays were updated in the YAML files
        const fromTaskHasDependency = fromTask.dependents.includes(dep.toTaskId);
        const toTaskHasDependency = toTask.dependencies.includes(dep.fromTaskId);

        if (!fromTaskHasDependency || !toTaskHasDependency) {
          logger.error({
            fromTaskId: dep.fromTaskId,
            toTaskId: dep.toTaskId,
            fromTaskDependents: fromTask.dependents,
            toTaskDependencies: toTask.dependencies,
            fromTaskHasDependency,
            toTaskHasDependency,
            sessionId
          }, 'Dependency persistence verification failed - arrays not updated in YAML files');
          verificationErrors++;
        } else {
          logger.debug({
            fromTaskId: dep.fromTaskId,
            toTaskId: dep.toTaskId,
            sessionId
          }, 'Dependency persistence verified successfully');
        }

      } catch (error) {
        logger.error({
          err: error,
          dependency: dep,
          sessionId
        }, 'Error during dependency persistence verification');
        verificationErrors++;
      }
    }

    if (verificationErrors > 0) {
      logger.warn({
        totalDependencies: dependencies.length,
        verificationErrors,
        sessionId
      }, 'Some dependency persistence verifications failed');
    } else {
      logger.info({
        totalDependencies: dependencies.length,
        sessionId
      }, 'All dependency persistence verifications passed');
    }
  }

  /**
   * Trigger orchestration workflow after successful decomposition
   */
  private async triggerOrchestrationWorkflow(session: DecompositionSession): Promise<void> {
    try {
      // Only trigger orchestration if we have persisted tasks
      if (!session.persistedTasks || session.persistedTasks.length === 0) {
        logger.info({
          sessionId: session.id,
          projectId: session.projectId
        }, 'No persisted tasks found - skipping orchestration trigger');
        return;
      }

      // Transition to orchestration phase
      await this.workflowStateManager.transitionWorkflow(
        session.id,
        WorkflowPhase.ORCHESTRATION,
        WorkflowState.IN_PROGRESS,
        {
          reason: 'Starting orchestration workflow',
          progress: 0,
          triggeredBy: 'DecompositionService',
          metadata: {
            taskCount: session.persistedTasks.length,
            projectId: session.projectId
          }
        }
      );

      logger.info({
        sessionId: session.id,
        projectId: session.projectId,
        taskCount: session.persistedTasks.length
      }, 'Triggering orchestration workflow after decomposition completion');

      // Import orchestration services dynamically to avoid circular dependencies
      const { AgentOrchestrator } = await import('./agent-orchestrator.js');
      const { TaskScheduler } = await import('./task-scheduler.js');
      const { getDependencyOperations } = await import('../core/operations/dependency-operations.js');

      // Initialize orchestration components
      const agentOrchestrator = AgentOrchestrator.getInstance();
      const taskScheduler = new TaskScheduler(); // TaskScheduler doesn't have getInstance()
      const dependencyOps = getDependencyOperations();

      // Generate dependency graph for scheduling
      const dependencyGraphResult = await dependencyOps.generateDependencyGraph(session.projectId);

      if (!dependencyGraphResult.success) {
        logger.warn({
          sessionId: session.id,
          projectId: session.projectId,
          error: dependencyGraphResult.error
        }, 'Failed to generate dependency graph for orchestration - proceeding without dependencies');
      }

      // Create project context for orchestration (using the full ProjectContext interface)
      const projectContext: ProjectContext = {
        projectPath: `./projects/${session.projectId}`,
        projectName: session.projectId,
        description: `Project ${session.projectId}`,
        languages: ['typescript', 'javascript'],
        frameworks: [],
        buildTools: ['npm'],
        configFiles: [],
        entryPoints: [],
        architecturalPatterns: [],
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
          source: 'auto-detected'
        }
      };

      // Schedule tasks for execution (only if we have a valid dependency graph)
      if (dependencyGraphResult.success && dependencyGraphResult.data) {
        try {
          // Convert DependencyGraph to OptimizedDependencyGraph for scheduling
          // For now, we'll skip scheduling if the graph types don't match
          // In a full implementation, we would convert the graph format
          logger.info({
            sessionId: session.id,
            projectId: session.projectId,
            graphType: 'DependencyGraph'
          }, 'Dependency graph available but scheduling requires OptimizedDependencyGraph - skipping scheduling for now');
        } catch (error) {
          logger.warn({
            err: error,
            sessionId: session.id,
            projectId: session.projectId
          }, 'Failed to process dependency graph for orchestration trigger');
        }
      }

      // Queue ready tasks for agent assignment
      const readyTasks = session.persistedTasks.filter(task =>
        !task.dependencies || task.dependencies.length === 0
      );

      logger.info({
        sessionId: session.id,
        projectId: session.projectId,
        totalTasks: session.persistedTasks.length,
        readyTasks: readyTasks.length
      }, 'Queueing ready tasks for agent assignment');

      // Assign ready tasks to available agents
      for (const task of readyTasks) {
        try {
          const assignment = await agentOrchestrator.assignTask(task, projectContext);

          if (assignment) {
            logger.info({
              sessionId: session.id,
              taskId: task.id,
              agentId: assignment.agentId
            }, 'Task assigned to agent during orchestration trigger');
          } else {
            logger.debug({
              sessionId: session.id,
              taskId: task.id
            }, 'No available agents - task will be queued for later assignment');
          }
        } catch (error) {
          logger.warn({
            err: error,
            sessionId: session.id,
            taskId: task.id
          }, 'Failed to assign task during orchestration trigger');
        }
      }

      // Complete orchestration phase
      await this.workflowStateManager.transitionWorkflow(
        session.id,
        WorkflowPhase.ORCHESTRATION,
        WorkflowState.COMPLETED,
        {
          reason: 'Orchestration workflow completed successfully',
          progress: 100,
          triggeredBy: 'DecompositionService',
          metadata: {
            tasksProcessed: readyTasks.length,
            totalTasks: session.persistedTasks.length,
            readyTasks: readyTasks.length
          }
        }
      );

      logger.info({
        sessionId: session.id,
        projectId: session.projectId,
        tasksProcessed: readyTasks.length
      }, 'Orchestration workflow triggered successfully');

    } catch (error) {
      logger.error({
        err: error,
        sessionId: session.id,
        projectId: session.projectId
      }, 'Failed to trigger orchestration workflow after decomposition');

      // Mark orchestration as failed
      try {
        await this.workflowStateManager.transitionWorkflow(
          session.id,
          WorkflowPhase.ORCHESTRATION,
          WorkflowState.FAILED,
          {
            reason: `Orchestration failed: ${error instanceof Error ? error.message : String(error)}`,
            triggeredBy: 'DecompositionService',
            metadata: { error: error instanceof Error ? error.message : String(error) }
          }
        );
      } catch (workflowError) {
        logger.warn({ err: workflowError, sessionId: session.id }, 'Failed to update workflow state on orchestration error');
      }
    }
  }

  /**
   * Map LLM dependency type to system dependency type
   */
  private mapDependencyType(llmType: string): 'blocks' | 'enables' | 'requires' | 'suggests' {
    switch (llmType?.toLowerCase()) {
      case 'blocking':
      case 'blocks':
        return 'blocks';
      case 'soft':
      case 'enables':
        return 'enables';
      case 'parallel':
      case 'suggests':
        return 'suggests';
      default:
        return 'requires';
    }
  }

  /**
   * Helper methods for context enrichment
   */

  /**
   * Get project path from context or use current working directory
   * Follows existing patterns from context-extractor.ts and security config
   */
  private getProjectPath(context: any): string {
    // 1. Try to get path from context first (if it's the full ProjectContext from project-context.ts)
    if (context.projectPath && context.projectPath !== '/unknown' && context.projectPath !== '/') {
      return context.projectPath;
    }

    // 2. Use environment variable (following existing security patterns from filesystem-security.ts)
    const envProjectPath = process.env.VIBE_TASK_MANAGER_READ_DIR;
    if (envProjectPath && envProjectPath !== '/' && envProjectPath.length > 1) {
      return envProjectPath;
    }

    // 3. Fallback to current working directory (existing pattern)
    const cwd = process.cwd();
    logger.debug({ context, envProjectPath, cwd }, 'Project path resolution completed');
    return cwd;
  }

  /**
   * Determine maximum number of files to gather based on task complexity
   */
  private determineMaxFiles(task: AtomicTask): number {
    const baseFiles = 10;

    // Increase file count for complex tasks
    if (task.estimatedHours && task.estimatedHours > 8) {
      return Math.min(baseFiles * 2, 30); // Cap at 30 files
    }

    // Increase for tasks with many dependencies or complex descriptions
    const complexityIndicators = [
      'refactor', 'architecture', 'system', 'integration',
      'framework', 'migration', 'optimization'
    ];

    const description = (task.description || task.title).toLowerCase();
    const complexityScore = complexityIndicators.filter(indicator =>
      description.includes(indicator)
    ).length;

    return Math.min(baseFiles + (complexityScore * 5), 25);
  }

  /**
   * Determine maximum content size based on task scope
   */
  private determineMaxContentSize(task: AtomicTask): number {
    const baseSize = 50000; // 50KB base

    // Increase content size for complex tasks
    if (task.estimatedHours && task.estimatedHours > 12) {
      return baseSize * 2; // 100KB for very complex tasks
    }

    if (task.estimatedHours && task.estimatedHours > 6) {
      return Math.floor(baseSize * 1.5); // 75KB for moderately complex tasks
    }

    return baseSize;
  }

  /**
   * Extract search patterns from task information
   */
  private extractSearchPatterns(task: AtomicTask): string[] {
    const patterns: string[] = [];
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    // Common technical patterns
    const technicalTerms = [
      'auth', 'user', 'login', 'service', 'component', 'util', 'helper',
      'api', 'endpoint', 'route', 'controller', 'model', 'view',
      'test', 'spec', 'mock', 'config', 'setup', 'init'
    ];

    // Extract patterns that appear in the task description
    technicalTerms.forEach(term => {
      if (text.includes(term)) {
        patterns.push(term);
      }
    });

    // Extract potential class/function names (CamelCase words)
    const camelCaseMatches = text.match(/[A-Z][a-z]+(?:[A-Z][a-z]+)*/g) || [];
    patterns.push(...camelCaseMatches.map(match => match.toLowerCase()));

    // Extract potential file/module names (kebab-case or snake_case)
    const moduleMatches = text.match(/[a-z]+[-_][a-z]+/g) || [];
    patterns.push(...moduleMatches);

    // Remove duplicates and return top patterns
    const uniquePatterns = [...new Set(patterns)];
    return uniquePatterns.slice(0, 8); // Limit to 8 patterns
  }

  /**
   * Extract content keywords for more targeted search
   */
  private extractContentKeywords(task: AtomicTask): string[] {
    const keywords: string[] = [];
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    // Action keywords
    const actionKeywords = [
      'implement', 'create', 'add', 'remove', 'update', 'fix', 'refactor',
      'optimize', 'enhance', 'integrate', 'migrate', 'test', 'validate'
    ];

    actionKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        keywords.push(keyword);
      }
    });

    // Domain-specific keywords
    const domainKeywords = [
      'database', 'api', 'frontend', 'backend', 'ui', 'ux', 'security',
      'performance', 'cache', 'storage', 'network', 'validation'
    ];

    domainKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        keywords.push(keyword);
      }
    });

    return [...new Set(keywords)].slice(0, 6); // Limit to 6 keywords
  }

  /**
   * Determine file types to include based on project context
   */
  private determineFileTypes(context: AtomicDetectorContext): string[] {
    const baseTypes = ['.ts', '.js', '.json'];

    // Add language-specific file types
    if (context.languages.includes('typescript')) {
      baseTypes.push('.tsx', '.d.ts');
    }

    if (context.languages.includes('javascript')) {
      baseTypes.push('.jsx', '.mjs');
    }

    if (context.languages.includes('python')) {
      baseTypes.push('.py', '.pyx');
    }

    if (context.languages.includes('java')) {
      baseTypes.push('.java');
    }

    if (context.languages.includes('csharp')) {
      baseTypes.push('.cs');
    }

    // Add framework-specific types
    if (context.frameworks.includes('react')) {
      baseTypes.push('.tsx', '.jsx');
    }

    if (context.frameworks.includes('vue')) {
      baseTypes.push('.vue');
    }

    if (context.frameworks.includes('angular')) {
      baseTypes.push('.component.ts', '.service.ts');
    }

    return [...new Set(baseTypes)];
  }

  /**
   * Helper methods for auto-research integration
   */
  private extractDomain(context: AtomicDetectorContext): string {
    // Extract domain from project context
    if (context.frameworks.includes('react') || context.frameworks.includes('vue') || context.frameworks.includes('angular')) {
      return 'frontend-development';
    }
    if (context.frameworks.includes('express') || context.frameworks.includes('fastify') || context.frameworks.includes('nestjs')) {
      return 'backend-development';
    }
    if (context.languages.includes('python')) {
      return 'python-development';
    }
    if (context.languages.includes('java')) {
      return 'java-development';
    }
    if (context.languages.includes('typescript') || context.languages.includes('javascript')) {
      return 'web-development';
    }
    return 'software-development';
  }

  private createResearchSummary(researchResults: any[]): string {
    if (researchResults.length === 0) {
      return 'No research results available';
    }

    const keyFindings = researchResults.flatMap(result => result.insights.keyFindings).slice(0, 5);
    const recommendations = researchResults.flatMap(result => result.insights.recommendations).slice(0, 3);

    return `Research Summary:
Key Findings:
${keyFindings.map(finding => `- ${finding}`).join('\n')}

Recommendations:
${recommendations.map(rec => `- ${rec}`).join('\n')}

Total Research Results: ${researchResults.length}`;
  }

  /**
   * Helper methods for task list decomposition
   */

  /**
   * Determine task type from task list item
   */
  private determineTaskType(taskItem: TaskListItem): TaskType {
    const text = `${taskItem.title} ${taskItem.description}`.toLowerCase();

    if (text.includes('test') || text.includes('spec') || text.includes('coverage')) {
      return 'testing';
    }
    if (text.includes('deploy') || text.includes('release') || text.includes('build')) {
      return 'deployment';
    }
    if (text.includes('research') || text.includes('investigate') || text.includes('analyze')) {
      return 'research';
    }
    if (text.includes('document') || text.includes('readme') || text.includes('guide')) {
      return 'documentation';
    }
    if (text.includes('review') || text.includes('audit') || text.includes('check')) {
      return 'review';
    }
    if (text.includes('fix') || text.includes('bug') || text.includes('issue')) {
      return 'development'; // Use development instead of bugfix
    }
    if (text.includes('refactor') || text.includes('optimize') || text.includes('improve')) {
      return 'development'; // Use development instead of refactoring
    }

    return 'development'; // Default type
  }

  /**
   * Parse estimated hours from effort string
   */
  private parseEstimatedHours(effortString: string): number {
    if (!effortString) return 1;

    const text = effortString.toLowerCase();

    // Extract number from strings like "2 hours", "3h", "1.5 hrs"
    const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)/);
    if (hourMatch) {
      return parseFloat(hourMatch[1]);
    }

    // Extract number from strings like "30 minutes", "45 mins"
    const minuteMatch = text.match(/(\d+)\s*(?:minutes?|mins?|m)/);
    if (minuteMatch) {
      return parseFloat(minuteMatch[1]) / 60;
    }

    // Extract number from strings like "2 days"
    const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:days?|d)/);
    if (dayMatch) {
      return parseFloat(dayMatch[1]) * 8; // Assume 8 hours per day
    }

    // Default fallback
    return 1;
  }

  /**
   * Extract dependencies from task list
   */
  private extractTaskListDependencies(taskList: ParsedTaskList): Array<{
    from: string;
    to: string;
    type: 'blocks' | 'enables' | 'requires';
  }> {
    const dependencies: Array<{
      from: string;
      to: string;
      type: 'blocks' | 'enables' | 'requires';
    }> = [];

    // Process each phase and its tasks
    for (const phase of taskList.phases) {
      for (const task of phase.tasks) {
        // Process explicit dependencies
        for (const depId of task.dependencies) {
          if (depId && depId !== 'None') {
            dependencies.push({
              from: depId,
              to: task.id,
              type: 'blocks'
            });
          }
        }
      }
    }

    return dependencies;
  }

  /**
   * Resolve epic ID using dynamic epic resolution
   */
  private async resolveEpicId(
    epicId: string | undefined,
    projectId: string,
    tasks: any[]
  ): Promise<string> {
    try {
      // If epic ID is provided and not 'default-epic', use it
      if (epicId && epicId !== 'default-epic') {
        return epicId;
      }

      // Use epic context resolver to determine appropriate epic
      const { getEpicContextResolver } = await import('../services/epic-context-resolver.js');
      const contextResolver = getEpicContextResolver();

      // Extract context from tasks to determine functional area
      const taskContext = this.extractTaskContext(tasks);

      const resolverParams = {
        projectId,
        taskContext
      };

      const contextResult = await contextResolver.resolveEpicContext(resolverParams);

      logger.info({
        originalEpicId: epicId,
        resolvedEpicId: contextResult.epicId,
        source: contextResult.source,
        created: contextResult.created
      }, 'Epic ID resolved for decomposition');

      return contextResult.epicId;

    } catch (error) {
      logger.warn({ err: error, epicId, projectId }, 'Failed to resolve epic ID, using fallback');
      return `${projectId}-main-epic`;
    }
  }

  /**
   * Extract task context for epic resolution
   */
  private extractTaskContext(tasks: any[]): {
    title: string;
    description: string;
    type: string;
    tags: string[];
  } | undefined {
    if (!tasks || tasks.length === 0) {
      return undefined;
    }

    // Combine information from multiple tasks to determine context
    const titles = tasks.map(t => t.title || '').filter(Boolean);
    const descriptions = tasks.map(t => t.description || '').filter(Boolean);
    const types = tasks.map(t => t.type || '').filter(Boolean);
    const allTags = tasks.flatMap(t => t.tags || []).filter(Boolean);

    if (titles.length === 0) {
      return undefined;
    }

    return {
      title: titles.join(', '),
      description: descriptions.join('. '),
      type: types[0] || 'development',
      tags: [...new Set(allTags)] // Remove duplicates
    };
  }
}
