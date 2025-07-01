/**
 * Agent Feedback Processing Service
 *
 * Processes agent feedback, updates task status, handles help requests,
 * and manages agent performance metrics.
 */

import { AgentResponse } from '../cli/sentinel-protocol.js';
import { AgentOrchestrator } from './agent-orchestrator.js';
import { TaskStreamer } from './task-streamer.js';
import { AppError, ValidationError } from '../../../utils/errors.js';
import logger from '../../../logger.js';

/**
 * Feedback processing configuration
 */
export interface FeedbackConfig {
  enablePerformanceTracking: boolean;
  helpRequestTimeout: number;
  blockerEscalationDelay: number;
  autoRetryFailedTasks: boolean;
  maxHelpRequests: number;
}

/**
 * Performance metrics for agents
 */
export interface AgentPerformanceMetrics {
  agentId: string;
  tasksCompleted: number;
  tasksFailedCount: number;
  averageCompletionTime: number;
  successRate: number;
  helpRequestsCount: number;
  blockersEncountered: number;
  lastActivityAt: Date;
  performanceScore: number;
}

/**
 * Help request tracking
 */
export interface HelpRequest {
  id: string;
  taskId: string;
  agentId: string;
  requestedAt: Date;
  resolvedAt?: Date;
  status: 'pending' | 'resolved' | 'escalated' | 'timeout';
  description: string;
  attemptedSolutions: string[];
  specificQuestions: string[];
  resolution?: string;
  resolutionType?: 'self_resolved' | 'human_intervention' | 'task_reassignment';
}

/**
 * Blocker tracking
 */
export interface BlockerInfo {
  id: string;
  taskId: string;
  agentId: string;
  reportedAt: Date;
  resolvedAt?: Date;
  status: 'active' | 'resolved' | 'escalated';
  type: 'dependency' | 'resource' | 'technical' | 'clarification';
  description: string;
  suggestedResolution: string;
  actualResolution?: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Feedback processing statistics
 */
export interface FeedbackStats {
  totalResponsesProcessed: number;
  completedTasks: number;
  failedTasks: number;
  helpRequests: number;
  blockers: number;
  averageResponseTime: number;
  lastProcessedAt?: Date;
}

/**
 * Agent Feedback Processing Service
 */
export class FeedbackProcessor {
  private static instance: FeedbackProcessor | null = null;

  private agentOrchestrator: AgentOrchestrator;
  private taskStreamer: TaskStreamer;
  private config: FeedbackConfig;
  private performanceMetrics = new Map<string, AgentPerformanceMetrics>();
  private helpRequests = new Map<string, HelpRequest>();
  private blockers = new Map<string, BlockerInfo>();
  private stats: FeedbackStats;

  private constructor(config?: Partial<FeedbackConfig>) {
    this.config = {
      enablePerformanceTracking: true,
      helpRequestTimeout: 3600000, // 1 hour
      blockerEscalationDelay: 1800000, // 30 minutes
      autoRetryFailedTasks: true,
      maxHelpRequests: 3,
      ...config
    };

    this.agentOrchestrator = AgentOrchestrator.getInstance();
    this.taskStreamer = TaskStreamer.getInstance();

    this.stats = {
      totalResponsesProcessed: 0,
      completedTasks: 0,
      failedTasks: 0,
      helpRequests: 0,
      blockers: 0,
      averageResponseTime: 0
    };

    logger.info({ config: this.config }, 'Feedback processor initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<FeedbackConfig>): FeedbackProcessor {
    if (!FeedbackProcessor.instance) {
      FeedbackProcessor.instance = new FeedbackProcessor(config);
    }
    return FeedbackProcessor.instance;
  }

  /**
   * Process agent feedback response
   */
  async processFeedback(
    responseText: string,
    agentId: string,
    taskId?: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Parse the response using the orchestrator
      await this.agentOrchestrator.processAgentResponse(responseText, agentId);

      // Update statistics
      this.stats.totalResponsesProcessed++;
      this.stats.lastProcessedAt = new Date();

      const responseTime = Date.now() - startTime;
      this.stats.averageResponseTime =
        (this.stats.averageResponseTime + responseTime) / 2;

      logger.debug({
        agentId,
        taskId,
        responseTime
      }, 'Agent feedback processed');

    } catch (error) {
      logger.error({ err: error, agentId, taskId }, 'Failed to process agent feedback');
      throw new AppError('Feedback processing failed', { cause: error });
    }
  }

  /**
   * Handle task completion
   */
  async handleTaskCompletion(
    taskId: string,
    agentId: string,
    response: AgentResponse
  ): Promise<void> {
    try {
      // Update performance metrics
      if (this.config.enablePerformanceTracking) {
        await this.updateAgentPerformance(agentId, 'completed', response);
      }

      // Update statistics
      this.stats.completedTasks++;

      // Generate next task recommendations
      await this.generateNextTaskRecommendations(agentId);

      logger.info({
        taskId,
        agentId,
        completionDetails: response.completion_details
      }, 'Task completion processed');

    } catch (error) {
      logger.error({ err: error, taskId, agentId }, 'Failed to handle task completion');
      throw new AppError('Task completion handling failed', { cause: error });
    }
  }

  /**
   * Handle help request
   */
  async handleHelpRequest(
    taskId: string,
    agentId: string,
    response: AgentResponse
  ): Promise<HelpRequest> {
    try {
      const helpRequestId = `help_${taskId}_${Date.now()}`;

      const helpRequest: HelpRequest = {
        id: helpRequestId,
        taskId,
        agentId,
        requestedAt: new Date(),
        status: 'pending',
        description: response.help_request?.issue_description || response.message || 'No description provided',
        attemptedSolutions: response.help_request?.attempted_solutions || [],
        specificQuestions: response.help_request?.specific_questions || []
      };

      this.helpRequests.set(helpRequestId, helpRequest);

      // Update performance metrics
      if (this.config.enablePerformanceTracking) {
        await this.updateAgentPerformance(agentId, 'help_requested', response);
      }

      // Update statistics
      this.stats.helpRequests++;

      // Check if agent has exceeded help request limit
      const agentHelpRequests = Array.from(this.helpRequests.values())
        .filter(req => req.agentId === agentId && req.status === 'pending').length;

      if (agentHelpRequests > this.config.maxHelpRequests) {
        logger.warn({
          agentId,
          helpRequestCount: agentHelpRequests
        }, 'Agent exceeded help request limit');

        // Consider reassigning tasks or marking agent as needing attention
        await this.escalateAgentIssues(agentId);
      }

      // Set timeout for help request
      setTimeout(() => {
        this.timeoutHelpRequest(helpRequestId);
      }, this.config.helpRequestTimeout);

      logger.info({
        helpRequestId,
        taskId,
        agentId,
        description: helpRequest.description
      }, 'Help request created');

      return helpRequest;

    } catch (error) {
      logger.error({ err: error, taskId, agentId }, 'Failed to handle help request');
      throw new AppError('Help request handling failed', { cause: error });
    }
  }

  /**
   * Handle task blocker
   */
  async handleTaskBlocker(
    taskId: string,
    agentId: string,
    response: AgentResponse
  ): Promise<BlockerInfo> {
    try {
      const blockerId = `blocker_${taskId}_${Date.now()}`;

      const blocker: BlockerInfo = {
        id: blockerId,
        taskId,
        agentId,
        reportedAt: new Date(),
        status: 'active',
        type: response.blocker_details?.blocker_type || 'technical',
        description: response.blocker_details?.description || response.message || 'No description provided',
        suggestedResolution: response.blocker_details?.suggested_resolution || 'Manual intervention required',
        impact: this.assessBlockerImpact(response)
      };

      this.blockers.set(blockerId, blocker);

      // Update performance metrics
      if (this.config.enablePerformanceTracking) {
        await this.updateAgentPerformance(agentId, 'blocked', response);
      }

      // Update statistics
      this.stats.blockers++;

      // Schedule escalation if needed
      if (blocker.impact === 'high' || blocker.impact === 'critical') {
        setTimeout(() => {
          this.escalateBlocker(blockerId);
        }, this.config.blockerEscalationDelay);
      }

      logger.warn({
        blockerId,
        taskId,
        agentId,
        type: blocker.type,
        impact: blocker.impact
      }, 'Task blocker reported');

      return blocker;

    } catch (error) {
      logger.error({ err: error, taskId, agentId }, 'Failed to handle task blocker');
      throw new AppError('Task blocker handling failed', { cause: error });
    }
  }

  /**
   * Handle task failure
   */
  async handleTaskFailure(
    taskId: string,
    agentId: string,
    response: AgentResponse
  ): Promise<void> {
    try {
      // Update performance metrics
      if (this.config.enablePerformanceTracking) {
        await this.updateAgentPerformance(agentId, 'failed', response);
      }

      // Update statistics
      this.stats.failedTasks++;

      // Auto-retry if enabled
      if (this.config.autoRetryFailedTasks) {
        // Note: In a full implementation, we'd retrieve the task and re-queue it
        logger.info({ taskId, agentId }, 'Task queued for auto-retry');
      }

      logger.error({
        taskId,
        agentId,
        message: response.message
      }, 'Task failure processed');

    } catch (error) {
      logger.error({ err: error, taskId, agentId }, 'Failed to handle task failure');
      throw new AppError('Task failure handling failed', { cause: error });
    }
  }

  /**
   * Resolve help request
   */
  async resolveHelpRequest(
    helpRequestId: string,
    resolution: string,
    resolutionType: HelpRequest['resolutionType'] = 'human_intervention'
  ): Promise<void> {
    try {
      const helpRequest = this.helpRequests.get(helpRequestId);
      if (!helpRequest) {
        throw new ValidationError(`Help request not found: ${helpRequestId}`);
      }

      helpRequest.status = 'resolved';
      helpRequest.resolvedAt = new Date();
      helpRequest.resolution = resolution;
      helpRequest.resolutionType = resolutionType;

      logger.info({
        helpRequestId,
        taskId: helpRequest.taskId,
        resolutionType
      }, 'Help request resolved');

    } catch (error) {
      logger.error({ err: error, helpRequestId }, 'Failed to resolve help request');
      throw new AppError('Help request resolution failed', { cause: error });
    }
  }

  /**
   * Resolve blocker
   */
  async resolveBlocker(
    blockerId: string,
    resolution: string
  ): Promise<void> {
    try {
      const blocker = this.blockers.get(blockerId);
      if (!blocker) {
        throw new ValidationError(`Blocker not found: ${blockerId}`);
      }

      blocker.status = 'resolved';
      blocker.resolvedAt = new Date();
      blocker.actualResolution = resolution;

      logger.info({
        blockerId,
        taskId: blocker.taskId,
        resolution
      }, 'Blocker resolved');

    } catch (error) {
      logger.error({ err: error, blockerId }, 'Failed to resolve blocker');
      throw new AppError('Blocker resolution failed', { cause: error });
    }
  }

  /**
   * Get agent performance metrics
   */
  getAgentPerformance(agentId: string): AgentPerformanceMetrics | null {
    return this.performanceMetrics.get(agentId) || null;
  }

  /**
   * Get all performance metrics
   */
  getAllPerformanceMetrics(): AgentPerformanceMetrics[] {
    return Array.from(this.performanceMetrics.values());
  }

  /**
   * Get pending help requests
   */
  getPendingHelpRequests(): HelpRequest[] {
    return Array.from(this.helpRequests.values())
      .filter(req => req.status === 'pending');
  }

  /**
   * Get active blockers
   */
  getActiveBlockers(): BlockerInfo[] {
    return Array.from(this.blockers.values())
      .filter(blocker => blocker.status === 'active');
  }

  /**
   * Get feedback processing statistics
   */
  getStats(): FeedbackStats {
    return { ...this.stats };
  }

  /**
   * Update agent performance metrics
   */
  private async updateAgentPerformance(
    agentId: string,
    action: 'completed' | 'failed' | 'help_requested' | 'blocked',
    _response: AgentResponse
  ): Promise<void> {
    let metrics = this.performanceMetrics.get(agentId);

    if (!metrics) {
      metrics = {
        agentId,
        tasksCompleted: 0,
        tasksFailedCount: 0,
        averageCompletionTime: 0,
        successRate: 1.0,
        helpRequestsCount: 0,
        blockersEncountered: 0,
        lastActivityAt: new Date(),
        performanceScore: 1.0
      };
    }

    metrics.lastActivityAt = new Date();

    switch (action) {
      case 'completed':
        metrics.tasksCompleted++;
        break;

      case 'failed':
        metrics.tasksFailedCount++;
        break;

      case 'help_requested':
        metrics.helpRequestsCount++;
        break;

      case 'blocked':
        metrics.blockersEncountered++;
        break;
    }

    // Recalculate success rate
    const totalTasks = metrics.tasksCompleted + metrics.tasksFailedCount;
    if (totalTasks > 0) {
      metrics.successRate = metrics.tasksCompleted / totalTasks;
    }

    // Calculate performance score (weighted combination of metrics)
    metrics.performanceScore = this.calculatePerformanceScore(metrics);

    this.performanceMetrics.set(agentId, metrics);
  }

  /**
   * Calculate agent performance score
   */
  private calculatePerformanceScore(metrics: AgentPerformanceMetrics): number {
    const successWeight = 0.4;
    const completionWeight = 0.3;
    const helpWeight = 0.2;
    const blockerWeight = 0.1;

    const successScore = metrics.successRate;
    const completionScore = Math.min(metrics.tasksCompleted / 10, 1.0); // Normalize to 10 tasks
    const helpScore = Math.max(0, 1.0 - (metrics.helpRequestsCount / 10)); // Penalty for help requests
    const blockerScore = Math.max(0, 1.0 - (metrics.blockersEncountered / 5)); // Penalty for blockers

    return (
      successScore * successWeight +
      completionScore * completionWeight +
      helpScore * helpWeight +
      blockerScore * blockerWeight
    );
  }

  /**
   * Assess blocker impact level
   */
  private assessBlockerImpact(response: AgentResponse): BlockerInfo['impact'] {
    const description = response.blocker_details?.description || response.message || '';
    const lowerDesc = description.toLowerCase();

    if (lowerDesc.includes('critical') || lowerDesc.includes('urgent') || lowerDesc.includes('blocking')) {
      return 'critical';
    } else if (lowerDesc.includes('important') || lowerDesc.includes('significant')) {
      return 'high';
    } else if (lowerDesc.includes('minor') || lowerDesc.includes('small')) {
      return 'low';
    } else {
      return 'medium';
    }
  }

  /**
   * Generate next task recommendations for agent
   */
  private async generateNextTaskRecommendations(agentId: string): Promise<void> {
    try {
      // In a full implementation, this would analyze agent capabilities
      // and suggest the next best tasks from the queue
      logger.debug({ agentId }, 'Generating next task recommendations');

    } catch (error) {
      logger.error({ err: error, agentId }, 'Failed to generate task recommendations');
    }
  }

  /**
   * Timeout help request
   */
  private timeoutHelpRequest(helpRequestId: string): void {
    const helpRequest = this.helpRequests.get(helpRequestId);
    if (helpRequest && helpRequest.status === 'pending') {
      helpRequest.status = 'timeout';
      logger.warn({ helpRequestId }, 'Help request timed out');
    }
  }

  /**
   * Escalate blocker
   */
  private escalateBlocker(blockerId: string): void {
    const blocker = this.blockers.get(blockerId);
    if (blocker && blocker.status === 'active') {
      blocker.status = 'escalated';
      logger.warn({ blockerId }, 'Blocker escalated');
    }
  }

  /**
   * Escalate agent issues
   */
  private async escalateAgentIssues(agentId: string): Promise<void> {
    logger.warn({ agentId }, 'Escalating agent issues - multiple help requests');
    // In a full implementation, this could trigger human intervention
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.performanceMetrics.clear();
    this.helpRequests.clear();
    this.blockers.clear();

    FeedbackProcessor.instance = null;
    logger.info('Feedback processor destroyed');
  }
}
