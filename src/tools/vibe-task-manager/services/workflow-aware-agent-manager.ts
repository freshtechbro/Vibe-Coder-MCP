/**
 * Workflow-Aware Agent Lifecycle Manager
 * 
 * Prevents agents from being marked offline during active decomposition and orchestration
 * processes by implementing workflow-aware heartbeat management and adaptive timeouts.
 */

import { EventEmitter } from 'events';
import { AgentOrchestrator } from './agent-orchestrator.js';
import { WorkflowStateManager, WorkflowPhase } from './workflow-state-manager.js';
import { DecompositionService } from './decomposition-service.js';
// Timeout manager not used in this implementation
import { createErrorContext, ValidationError } from '../utils/enhanced-errors.js';
import { InitializationMonitor } from '../../../utils/initialization-monitor.js';
import logger from '../../../logger.js';

/**
 * Agent activity types that require extended heartbeat tolerance
 */
export type AgentActivity = 
  | 'idle'
  | 'decomposition'
  | 'orchestration'
  | 'task_execution'
  | 'research'
  | 'context_enrichment'
  | 'dependency_analysis';

/**
 * Agent lifecycle state with workflow awareness
 */
export interface WorkflowAwareAgentState {
  agentId: string;
  currentActivity: AgentActivity;
  activityStartTime: Date;
  lastHeartbeat: Date;
  lastProgressUpdate: Date;
  workflowId?: string;
  sessionId?: string;
  expectedDuration?: number; // Expected activity duration in ms
  progressPercentage: number;
  isWorkflowCritical: boolean; // True if agent is critical for current workflow
  extendedTimeoutUntil?: Date; // Extended timeout deadline
  gracePeriodCount: number; // Number of grace periods used
  metadata: {
    workflowPhase?: WorkflowPhase;
    taskCount?: number;
    estimatedCompletion?: Date;
    lastActivityUpdate?: Date;
    [key: string]: unknown; // Allow additional metadata fields
  };
}

/**
 * Workflow-aware timeout configuration
 */
export interface WorkflowTimeoutConfig {
  baseHeartbeatInterval: number; // Base heartbeat interval (30s)
  activityTimeoutMultipliers: Record<AgentActivity, number>; // Multipliers per activity
  maxGracePeriods: number; // Maximum grace periods before marking offline
  gracePeriodDuration: number; // Duration of each grace period
  progressUpdateInterval: number; // Required progress update interval
  workflowCriticalExtension: number; // Extra time for workflow-critical agents
  enableAdaptiveTimeouts: boolean; // Enable progress-based timeout adjustment
}

/**
 * Default workflow timeout configuration
 */
const DEFAULT_WORKFLOW_TIMEOUT_CONFIG: WorkflowTimeoutConfig = {
  baseHeartbeatInterval: 30000, // 30 seconds
  activityTimeoutMultipliers: {
    idle: 2, // 60 seconds for idle agents
    decomposition: 20, // 10 minutes for decomposition
    orchestration: 10, // 5 minutes for orchestration
    task_execution: 6, // 3 minutes for task execution
    research: 15, // 7.5 minutes for research
    context_enrichment: 8, // 4 minutes for context enrichment
    dependency_analysis: 12 // 6 minutes for dependency analysis
  },
  maxGracePeriods: 3,
  gracePeriodDuration: 60000, // 1 minute grace periods
  progressUpdateInterval: 120000, // 2 minutes between progress updates
  workflowCriticalExtension: 300000, // 5 minutes extra for critical agents
  enableAdaptiveTimeouts: true
};

/**
 * Workflow-aware agent lifecycle manager
 */
export class WorkflowAwareAgentManager extends EventEmitter {
  private static instance: WorkflowAwareAgentManager | null = null;
  private config: WorkflowTimeoutConfig;
  private agentStates = new Map<string, WorkflowAwareAgentState>();
  private agentOrchestrator: AgentOrchestrator | null = null;
  private workflowStateManager: WorkflowStateManager | null = null;
  private decompositionService: DecompositionService | null = null;
  
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private startTime = Date.now();

  private constructor(config: Partial<WorkflowTimeoutConfig> = {}) {
    super();
    this.config = { ...DEFAULT_WORKFLOW_TIMEOUT_CONFIG, ...config };

    // AgentOrchestrator will be initialized lazily to prevent circular dependency

    // Initialize workflow state manager and decomposition service with proper getInstance calls
    try {
      this.workflowStateManager = WorkflowStateManager.getInstance();
    } catch (error) {
      logger.warn({ err: error }, 'WorkflowStateManager getInstance not available, using null fallback');
      this.workflowStateManager = null;
    }

    // Initialize decomposition service with config (following TaskRefinementService pattern)
    // Use async initialization pattern to prevent timing issues
    this.scheduleAsyncInitialization();

    logger.info('Workflow-aware agent manager initialized', {
      config: this.config
    });
  }

  /**
   * Schedule async initialization to prevent timing issues
   */
  private scheduleAsyncInitialization(): void {
    process.nextTick(() => {
      this.initializeDecompositionService().then(() => {
        this.setupEventListeners();
      }).catch(error => {
        logger.warn({ err: error }, 'DecompositionService initialization failed, setting up event listeners with fallback');
        this.setupEventListeners(); // Still setup with null service
      });
    });
  }

  /**
   * Initialize decomposition service with config
   */
  private async initializeDecompositionService(): Promise<void> {
    try {
      const { getVibeTaskManagerConfig } = await import('../utils/config-loader.js');
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
      this.decompositionService = DecompositionService.getInstance(openRouterConfig);
    } catch (error) {
      logger.warn({ err: error }, 'DecompositionService initialization failed, using fallback');
      this.decompositionService = null;
    }
  }

  /**
   * Lazily initialize AgentOrchestrator to prevent circular dependency
   */
  private async getAgentOrchestrator(): Promise<AgentOrchestrator> {
    if (!this.agentOrchestrator) {
      // Use dynamic import to break circular dependency
      const { AgentOrchestrator } = await import('./agent-orchestrator.js');
      this.agentOrchestrator = AgentOrchestrator.getInstance();
    }
    return this.agentOrchestrator;
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<WorkflowTimeoutConfig>): WorkflowAwareAgentManager {
    if (!WorkflowAwareAgentManager.instance) {
      const monitor = InitializationMonitor.getInstance();
      monitor.startServiceInitialization('WorkflowAwareAgentManager', [
        'WorkflowStateManager',
        'DecompositionService'
      ], { config });

      try {
        monitor.startPhase('WorkflowAwareAgentManager', 'constructor');
        WorkflowAwareAgentManager.instance = new WorkflowAwareAgentManager(config);
        monitor.endPhase('WorkflowAwareAgentManager', 'constructor');

        monitor.endServiceInitialization('WorkflowAwareAgentManager');
      } catch (error) {
        monitor.endPhase('WorkflowAwareAgentManager', 'constructor', error as Error);
        monitor.endServiceInitialization('WorkflowAwareAgentManager', error as Error);
        throw error;
      }
    }
    return WorkflowAwareAgentManager.instance;
  }

  /**
   * Start workflow-aware monitoring
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('Workflow-aware agent monitoring already active');
      return;
    }

    try {
      this.isMonitoring = true;
      this.startTime = Date.now();

      // Start monitoring interval
      this.monitoringInterval = setInterval(() => {
        this.performWorkflowAwareHealthCheck().catch(error => {
          logger.error({ err: error }, 'Error in workflow-aware health check');
        });
      }, this.config.baseHeartbeatInterval);

      logger.info('Workflow-aware agent monitoring started', {
        interval: this.config.baseHeartbeatInterval,
        enableAdaptiveTimeouts: this.config.enableAdaptiveTimeouts
      });

    } catch (error) {
      this.isMonitoring = false;
      const context = createErrorContext('WorkflowAwareAgentManager', 'startMonitoring')
        .metadata({ config: this.config })
        .build();
      
      logger.error({ err: error, context }, 'Failed to start workflow-aware monitoring');
      throw new ValidationError('Failed to start workflow-aware monitoring', context);
    }
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    try {
      this.isMonitoring = false;

      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }

      logger.info('Workflow-aware agent monitoring stopped');

    } catch (error) {
      logger.error({ err: error }, 'Error stopping workflow-aware monitoring');
    }
  }

  /**
   * Register agent activity
   */
  async registerAgentActivity(
    agentId: string,
    activity: AgentActivity,
    options: {
      workflowId?: string;
      sessionId?: string;
      expectedDuration?: number;
      isWorkflowCritical?: boolean;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    const now = new Date();
    
    const agentState: WorkflowAwareAgentState = {
      agentId,
      currentActivity: activity,
      activityStartTime: now,
      lastHeartbeat: now,
      lastProgressUpdate: now,
      workflowId: options.workflowId,
      sessionId: options.sessionId,
      expectedDuration: options.expectedDuration,
      progressPercentage: 0,
      isWorkflowCritical: options.isWorkflowCritical || false,
      gracePeriodCount: 0,
      metadata: {
        ...options.metadata,
        lastActivityUpdate: now
      }
    };

    // Calculate extended timeout if needed
    if (activity !== 'idle' && options.isWorkflowCritical) {
      const baseTimeout = this.calculateActivityTimeout(activity);
      agentState.extendedTimeoutUntil = new Date(now.getTime() + baseTimeout + this.config.workflowCriticalExtension);
    }

    this.agentStates.set(agentId, agentState);

    logger.info({
      agentId,
      activity,
      workflowId: options.workflowId,
      sessionId: options.sessionId,
      isWorkflowCritical: options.isWorkflowCritical,
      extendedTimeoutUntil: agentState.extendedTimeoutUntil
    }, 'Agent activity registered');

    // Emit activity change event
    this.emit('agent_activity_changed', {
      agentId,
      activity,
      timestamp: now,
      metadata: agentState.metadata
    });
  }

  /**
   * Update agent progress
   */
  async updateAgentProgress(
    agentId: string,
    progressPercentage: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const agentState = this.agentStates.get(agentId);
    if (!agentState) {
      logger.warn({ agentId }, 'Cannot update progress for unregistered agent');
      return;
    }

    const now = new Date();
    agentState.progressPercentage = Math.max(0, Math.min(100, progressPercentage));
    agentState.lastProgressUpdate = now;
    agentState.lastHeartbeat = now; // Progress update counts as heartbeat
    
    if (metadata) {
      agentState.metadata = { ...agentState.metadata, ...metadata, lastActivityUpdate: now };
    }

    // Reset grace period count on progress update
    agentState.gracePeriodCount = 0;

    // Adjust timeout based on progress if adaptive timeouts are enabled
    if (this.config.enableAdaptiveTimeouts && agentState.expectedDuration) {
      this.adjustTimeoutBasedOnProgress(agentState);
    }

    logger.debug({
      agentId,
      progressPercentage,
      activity: agentState.currentActivity,
      workflowId: agentState.workflowId
    }, 'Agent progress updated');

    // Emit progress update event
    this.emit('agent_progress_updated', {
      agentId,
      progressPercentage,
      activity: agentState.currentActivity,
      timestamp: now,
      metadata: agentState.metadata
    });

    // Update orchestrator heartbeat
    this.getAgentOrchestrator().then(orchestrator => {
      if (orchestrator && typeof orchestrator.updateAgentHeartbeat === 'function') {
        orchestrator.updateAgentHeartbeat(agentId, 'available');
      }
    }).catch(error => {
      logger.warn({ err: error, agentId }, 'Failed to update agent heartbeat');
    });
  }

  /**
   * Complete agent activity
   */
  async completeAgentActivity(
    agentId: string,
    success: boolean = true,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const agentState = this.agentStates.get(agentId);
    if (!agentState) {
      logger.warn({ agentId }, 'Cannot complete activity for unregistered agent');
      return;
    }

    const now = new Date();
    const duration = now.getTime() - agentState.activityStartTime.getTime();

    logger.info({
      agentId,
      activity: agentState.currentActivity,
      duration: Math.round(duration / 1000),
      success,
      workflowId: agentState.workflowId
    }, 'Agent activity completed');

    // Emit activity completion event
    this.emit('agent_activity_completed', {
      agentId,
      activity: agentState.currentActivity,
      duration,
      success,
      timestamp: now,
      metadata: { ...agentState.metadata, ...metadata }
    });

    // Reset to idle activity
    await this.registerAgentActivity(agentId, 'idle', {
      workflowId: agentState.workflowId,
      sessionId: agentState.sessionId
    });
  }

  /**
   * Get agent state
   */
  getAgentState(agentId: string): WorkflowAwareAgentState | undefined {
    return this.agentStates.get(agentId);
  }

  /**
   * Get all agent states
   */
  getAllAgentStates(): WorkflowAwareAgentState[] {
    return Array.from(this.agentStates.values());
  }

  /**
   * Get workflow-aware statistics
   */
  getWorkflowAwareStats(): {
    totalAgents: number;
    activeWorkflows: number;
    agentsByActivity: Record<AgentActivity, number>;
    criticalAgents: number;
    agentsInGracePeriod: number;
    averageProgress: number;
  } {
    const states = Array.from(this.agentStates.values());
    const agentsByActivity: Record<AgentActivity, number> = {
      idle: 0,
      decomposition: 0,
      orchestration: 0,
      task_execution: 0,
      research: 0,
      context_enrichment: 0,
      dependency_analysis: 0
    };

    let criticalAgents = 0;
    let agentsInGracePeriod = 0;
    let totalProgress = 0;
    const activeWorkflows = new Set<string>();

    for (const state of states) {
      agentsByActivity[state.currentActivity]++;
      if (state.isWorkflowCritical) criticalAgents++;
      if (state.gracePeriodCount > 0) agentsInGracePeriod++;
      if (state.workflowId) activeWorkflows.add(state.workflowId);
      totalProgress += state.progressPercentage;
    }

    return {
      totalAgents: states.length,
      activeWorkflows: activeWorkflows.size,
      agentsByActivity,
      criticalAgents,
      agentsInGracePeriod,
      averageProgress: states.length > 0 ? totalProgress / states.length : 0
    };
  }

  /**
   * Setup event listeners for workflow and decomposition events
   */
  private setupEventListeners(): void {
    // Listen to workflow state changes (with fallback for services that don't support events)
    try {
      const workflowStateManagerAny = this.workflowStateManager as EventEmitter;
      if (typeof workflowStateManagerAny.on === 'function') {
        workflowStateManagerAny.on('workflow_phase_changed', (data: Record<string, unknown>) => {
          this.handleWorkflowPhaseChange(data).catch(error => {
            logger.error({ err: error, data }, 'Error handling workflow phase change');
          });
        });

        workflowStateManagerAny.on('workflow_progress_updated', (data: Record<string, unknown>) => {
          this.handleWorkflowProgressUpdate(data).catch(error => {
            logger.error({ err: error, data }, 'Error handling workflow progress update');
          });
        });
      } else {
        logger.debug('WorkflowStateManager does not support event listeners, using fallback mode');
      }
    } catch (error) {
      logger.warn({ err: error }, 'Failed to setup workflow state manager event listeners');
    }

    // Listen to decomposition events (with fallback for services that don't support events)
    try {
      const decompositionServiceAny = this.decompositionService as EventEmitter;
      if (decompositionServiceAny && typeof decompositionServiceAny.on === 'function') {
        decompositionServiceAny.on('decomposition_started', (data: Record<string, unknown>) => {
          this.handleDecompositionStarted(data).catch(error => {
            logger.error({ err: error, data }, 'Error handling decomposition started');
          });
        });

        decompositionServiceAny.on('decomposition_progress', (data: Record<string, unknown>) => {
          this.handleDecompositionProgress(data).catch(error => {
            logger.error({ err: error, data }, 'Error handling decomposition progress');
          });
        });

        decompositionServiceAny.on('decomposition_completed', (data: Record<string, unknown>) => {
          this.handleDecompositionCompleted(data).catch(error => {
            logger.error({ err: error, data }, 'Error handling decomposition completed');
          });
        });

        decompositionServiceAny.on('decomposition_failed', (data: Record<string, unknown>) => {
          this.handleDecompositionFailed(data).catch(error => {
            logger.error({ err: error, data }, 'Error handling decomposition failed');
          });
        });

        decompositionServiceAny.on('epic_generation_started', (data: Record<string, unknown>) => {
          this.handleEpicGenerationStarted(data).catch(error => {
            logger.error({ err: error, data }, 'Error handling epic generation started');
          });
        });

        decompositionServiceAny.on('epic_generation_completed', (data: Record<string, unknown>) => {
          this.handleEpicGenerationCompleted(data).catch(error => {
            logger.error({ err: error, data }, 'Error handling epic generation completed');
          });
        });

        decompositionServiceAny.on('task_list_started', (data: Record<string, unknown>) => {
          this.handleTaskListStarted(data).catch(error => {
            logger.error({ err: error, data }, 'Error handling task list started');
          });
        });

        decompositionServiceAny.on('task_list_completed', (data: Record<string, unknown>) => {
          this.handleTaskListCompleted(data).catch(error => {
            logger.error({ err: error, data }, 'Error handling task list completed');
          });
        });
      } else {
        logger.debug('DecompositionService does not support event listeners, using fallback mode');
      }
    } catch (error) {
      logger.warn({ err: error }, 'Failed to setup decomposition service event listeners');
    }

    logger.debug('Event listeners setup for workflow-aware agent management');
  }

  /**
   * Perform workflow-aware health check
   */
  private async performWorkflowAwareHealthCheck(): Promise<void> {
    const now = new Date();

    for (const [agentId, agentState] of this.agentStates.entries()) {
      try {
        const shouldMarkOffline = await this.shouldMarkAgentOffline(agentState, now);

        if (shouldMarkOffline) {
          await this.handleAgentTimeout(agentState, now);
        } else {
          // Check if agent needs progress update reminder
          const timeSinceProgress = now.getTime() - agentState.lastProgressUpdate.getTime();
          if (timeSinceProgress > this.config.progressUpdateInterval && agentState.currentActivity !== 'idle') {
            this.emit('agent_progress_reminder', {
              agentId,
              activity: agentState.currentActivity,
              timeSinceProgress,
              timestamp: now
            });
          }
        }

      } catch (error) {
        logger.error({ err: error, agentId }, 'Error in workflow-aware health check for agent');
      }
    }
  }

  /**
   * Determine if agent should be marked offline
   */
  private async shouldMarkAgentOffline(agentState: WorkflowAwareAgentState, now: Date): Promise<boolean> {
    const timeSinceHeartbeat = now.getTime() - agentState.lastHeartbeat.getTime();
    const activityTimeout = this.calculateActivityTimeout(agentState.currentActivity);

    // Check if we're within extended timeout period
    if (agentState.extendedTimeoutUntil && now < agentState.extendedTimeoutUntil) {
      return false;
    }

    // Check if we're within grace period
    if (agentState.gracePeriodCount < this.config.maxGracePeriods) {
      if (timeSinceHeartbeat > activityTimeout) {
        // Enter grace period
        agentState.gracePeriodCount++;
        const gracePeriodEnd = new Date(now.getTime() + this.config.gracePeriodDuration);

        logger.warn({
          agentId: agentState.agentId,
          activity: agentState.currentActivity,
          gracePeriod: agentState.gracePeriodCount,
          maxGracePeriods: this.config.maxGracePeriods,
          gracePeriodEnd
        }, 'Agent entered grace period');

        this.emit('agent_grace_period', {
          agentId: agentState.agentId,
          gracePeriod: agentState.gracePeriodCount,
          gracePeriodEnd,
          timestamp: now
        });

        return false; // Don't mark offline yet
      }
    }

    // Mark offline if exceeded all grace periods
    return timeSinceHeartbeat > activityTimeout + (this.config.gracePeriodDuration * this.config.maxGracePeriods);
  }

  /**
   * Calculate timeout for specific activity
   */
  private calculateActivityTimeout(activity: AgentActivity): number {
    const multiplier = this.config.activityTimeoutMultipliers[activity] || 2;
    return this.config.baseHeartbeatInterval * multiplier;
  }

  /**
   * Adjust timeout based on progress
   */
  private adjustTimeoutBasedOnProgress(agentState: WorkflowAwareAgentState): void {
    if (!agentState.expectedDuration || agentState.progressPercentage === 0) {
      return;
    }

    const progressRatio = agentState.progressPercentage / 100;
    const elapsedTime = Date.now() - agentState.activityStartTime.getTime();
    const estimatedTotalTime = elapsedTime / progressRatio;
    const estimatedRemainingTime = estimatedTotalTime - elapsedTime;

    // Extend timeout if we have good progress and need more time
    if (progressRatio > 0.1 && estimatedRemainingTime > 0) {
      const bufferTime = estimatedRemainingTime * 0.5; // 50% buffer
      agentState.extendedTimeoutUntil = new Date(Date.now() + estimatedRemainingTime + bufferTime);

      logger.debug({
        agentId: agentState.agentId,
        progressRatio,
        estimatedRemainingTime,
        extendedTimeoutUntil: agentState.extendedTimeoutUntil
      }, 'Adjusted timeout based on progress');
    }
  }

  /**
   * Handle agent timeout
   */
  private async handleAgentTimeout(agentState: WorkflowAwareAgentState, now: Date): Promise<void> {
    logger.warn({
      agentId: agentState.agentId,
      activity: agentState.currentActivity,
      workflowId: agentState.workflowId,
      gracePeriodCount: agentState.gracePeriodCount,
      isWorkflowCritical: agentState.isWorkflowCritical
    }, 'Agent timeout detected - marking offline');

    // Emit timeout event
    this.emit('agent_timeout', {
      agentId: agentState.agentId,
      activity: agentState.currentActivity,
      workflowId: agentState.workflowId,
      gracePeriodCount: agentState.gracePeriodCount,
      timestamp: now
    });

    // Mark agent as offline in orchestrator
    this.getAgentOrchestrator().then(orchestrator => {
      if (orchestrator && typeof orchestrator.updateAgentHeartbeat === 'function') {
        orchestrator.updateAgentHeartbeat(agentState.agentId, 'offline');
      }
    }).catch(error => {
      logger.warn({ err: error, agentId: agentState.agentId }, 'Failed to update agent heartbeat to offline');
    });

    // Remove from our tracking
    this.agentStates.delete(agentState.agentId);
  }

  /**
   * Handle workflow phase change
   */
  private async handleWorkflowPhaseChange(data: Record<string, unknown>): Promise<void> {
    const { workflowId, sessionId, fromPhase, toPhase, agentId } = data;

    if (!agentId || typeof agentId !== 'string') return;

    const agentState = this.agentStates.get(agentId);
    if (!agentState) return;

    // Update agent activity based on workflow phase
    let newActivity: AgentActivity = 'idle';
    let isWorkflowCritical = false;

    switch (toPhase) {
      case WorkflowPhase.DECOMPOSITION:
        newActivity = 'decomposition';
        isWorkflowCritical = true;
        break;
      case WorkflowPhase.ORCHESTRATION:
        newActivity = 'orchestration';
        isWorkflowCritical = true;
        break;
      case WorkflowPhase.EXECUTION:
        newActivity = 'task_execution';
        isWorkflowCritical = false;
        break;
      default:
        newActivity = 'idle';
        isWorkflowCritical = false;
    }

    await this.registerAgentActivity(agentId, newActivity, {
      workflowId: workflowId as string,
      sessionId: sessionId as string,
      isWorkflowCritical,
      metadata: {
        workflowPhase: toPhase,
        previousPhase: fromPhase
      }
    });
  }

  /**
   * Handle workflow progress update
   */
  private async handleWorkflowProgressUpdate(data: Record<string, unknown>): Promise<void> {
    const { workflowId, sessionId, progress, agentId } = data;

    if (!agentId || typeof agentId !== 'string' || typeof progress !== 'number') return;

    await this.updateAgentProgress(agentId, progress, {
      workflowId: workflowId as string,
      sessionId: sessionId as string,
      lastWorkflowUpdate: new Date()
    });
  }

  /**
   * Handle decomposition started
   */
  private async handleDecompositionStarted(data: Record<string, unknown>): Promise<void> {
    const { sessionId, agentId, taskId, projectId, originalSessionId, jobId } = data;

    if (!agentId || typeof agentId !== 'string') return;

    await this.registerAgentActivity(agentId, 'decomposition', {
      sessionId: sessionId as string,
      workflowId: sessionId as string, // Use sessionId as workflowId for decomposition
      isWorkflowCritical: true,
      expectedDuration: 10 * 60 * 1000, // 10 minutes expected
      metadata: {
        taskId,
        projectId,
        decompositionStarted: new Date()
      }
    });

    // NEW: Bridge to stdio communication for decomposition started
    if (originalSessionId && jobId) {
      const bridgeStartTime = Date.now();
      try {
        const { sseNotifier } = await import('../../../services/sse-notifier/index.js');
        const { JobStatus } = await import('../../../services/job-manager/index.js');
        
        sseNotifier.sendProgress(
          originalSessionId as string,
          jobId as string,
          JobStatus.RUNNING,
          'Decomposition started - analyzing task complexity',
          0
        );

        const bridgeExecutionTime = Date.now() - bridgeStartTime;
        logger.info({
          originalSessionId,
          jobId,
          step: 'decomposition_started',
          bridgeExecutionTime,
          performance: {
            bridgeLatency: bridgeExecutionTime,
            timestamp: new Date().toISOString()
          }
        }, 'Progress bridge: decomposition started forwarded to stdio client');
      } catch (error) {
        const bridgeExecutionTime = Date.now() - bridgeStartTime;
        logger.error({
          err: error,
          originalSessionId,
          jobId,
          bridgeExecutionTime,
          errorType: error instanceof Error ? error.constructor.name : 'Unknown',
          errorMessage: error instanceof Error ? error.message : String(error)
        }, 'Progress bridge: failed to send decomposition started to stdio client');
      }
    }
  }

  /**
   * Handle decomposition progress
   */
  private async handleDecompositionProgress(data: Record<string, unknown>): Promise<void> {
    const { sessionId, agentId, progress, originalSessionId, jobId, step } = data;

    if (!agentId || typeof agentId !== 'string' || typeof progress !== 'number') return;

    await this.updateAgentProgress(agentId, progress, {
      sessionId: sessionId as string,
      lastDecompositionUpdate: new Date()
    });

    // NEW: Bridge to stdio communication for decomposition progress
    if (originalSessionId && jobId) {
      const bridgeStartTime = Date.now();
      try {
        const { sseNotifier } = await import('../../../services/sse-notifier/index.js');
        const { JobStatus } = await import('../../../services/job-manager/index.js');
        
        // Create descriptive progress message based on step
        let progressMessage = `Decomposition ${progress}% complete`;
        const metadata = data.metadata as Record<string, unknown> || {};
        
        if (step) {
          switch (step as string) {
            case 'decomposition_started':
              progressMessage = 'Decomposition started - analyzing task complexity';
              break;
            case 'context_enrichment_completed':
              progressMessage = 'Context analysis complete - beginning decomposition';
              break;
            case 'epic_generation_started':
              progressMessage = `Epic identification started - analyzing ${metadata.taskCount || 0} tasks`;
              break;
            case 'epic_generation_completed':
              progressMessage = `Epic identification completed - functional areas identified`;
              break;
            case 'task_persistence_started':
              progressMessage = `Task persistence started - saving ${metadata.taskCount || 0} tasks`;
              break;
            case 'task_persisted':
              progressMessage = metadata.message as string || `Task ${metadata.persistedCount}/${metadata.totalTasks} persisted`;
              break;
            case 'dependency_analysis_started':
              progressMessage = `Dependency analysis started - mapping task relationships`;
              break;
            case 'dependency_analysis_completed':
              progressMessage = 'Dependency analysis completed - task graph generated';
              break;
            case 'decomposition_completed':
              progressMessage = `Decomposition completed - ${metadata.persistedTasks || 0} tasks ready`;
              break;
            case 'task_processing':
              progressMessage = `Processing ${metadata.currentTaskTitle || 'task'} - ${metadata.processedTasks}/${metadata.totalTasks}`;
              break;
            default:
              progressMessage = `Decomposition ${progress}% complete - ${step}`;
          }
        }
        
        sseNotifier.sendProgress(
          originalSessionId as string,
          jobId as string,
          JobStatus.RUNNING,
          progressMessage,
          progress as number
        );

        const bridgeExecutionTime = Date.now() - bridgeStartTime;
        logger.info({
          originalSessionId,
          jobId,
          progress,
          step,
          progressMessage,
          bridgeExecutionTime,
          performance: {
            bridgeLatency: bridgeExecutionTime,
            progressValue: progress,
            timestamp: new Date().toISOString()
          }
        }, 'Progress bridge: decomposition progress forwarded to stdio client');
      } catch (error) {
        const bridgeExecutionTime = Date.now() - bridgeStartTime;
        logger.error({
          err: error,
          originalSessionId,
          jobId,
          progress,
          step,
          bridgeExecutionTime,
          errorType: error instanceof Error ? error.constructor.name : 'Unknown',
          errorMessage: error instanceof Error ? error.message : String(error)
        }, 'Progress bridge: failed to send decomposition progress to stdio client');
      }
    }
  }

  /**
   * Handle decomposition completed
   */
  private async handleDecompositionCompleted(data: Record<string, unknown>): Promise<void> {
    const { sessionId, agentId, status, originalSessionId, jobId, totalTasks, persistedTasks } = data;
    
    // Extract success from status field (since decomposition events use 'status' not 'success')
    const success = status === 'completed';

    if (!agentId || typeof agentId !== 'string') return;

    await this.completeAgentActivity(agentId, success as boolean, {
      sessionId: sessionId as string,
      decompositionCompleted: new Date()
    });

    // NEW: Bridge to stdio communication for decomposition completed
    if (originalSessionId && jobId) {
      try {
        const { sseNotifier } = await import('../../../services/sse-notifier/index.js');
        const { JobStatus } = await import('../../../services/job-manager/index.js');
        
        // Create completion message with task count information
        const taskCount = persistedTasks || totalTasks || 0;
        const completionMessage = success 
          ? `Decomposition completed successfully - ${taskCount} tasks generated`
          : 'Decomposition completed with issues - check results for details';
        
        sseNotifier.sendProgress(
          originalSessionId as string,
          jobId as string,
          success ? JobStatus.COMPLETED : JobStatus.FAILED,
          completionMessage,
          100
        );

        logger.debug({
          originalSessionId,
          jobId,
          success,
          taskCount,
          completionMessage
        }, 'Progress bridge: forwarded decomposition completion to stdio client');
      } catch (error) {
        logger.warn({
          err: error,
          originalSessionId,
          jobId,
          success
        }, 'Failed to send decomposition completion to stdio client');
      }
    }
  }

  /**
   * Handle decomposition failed
   */
  private async handleDecompositionFailed(data: Record<string, unknown>): Promise<void> {
    const { sessionId, agentId, error, originalSessionId, jobId } = data;

    if (!agentId || typeof agentId !== 'string') return;

    await this.completeAgentActivity(agentId, false, {
      sessionId: sessionId as string,
      decompositionFailed: new Date(),
      error: error as Record<string, unknown>
    });

    // Bridge to stdio communication for decomposition failed
    if (originalSessionId && jobId) {
      try {
        const { sseNotifier } = await import('../../../services/sse-notifier/index.js');
        const { JobStatus } = await import('../../../services/job-manager/index.js');
        
        const errorMessage = error && typeof error === 'object' && 'message' in error 
          ? `Decomposition failed: ${error.message}`
          : 'Decomposition failed - check logs for details';
        
        sseNotifier.sendProgress(
          originalSessionId as string,
          jobId as string,
          JobStatus.FAILED,
          errorMessage,
          0
        );

        logger.debug({
          originalSessionId,
          jobId,
          error
        }, 'Progress bridge: forwarded decomposition failure to stdio client');
      } catch (bridgeError) {
        logger.warn({
          err: bridgeError,
          originalSessionId,
          jobId,
          error
        }, 'Failed to send decomposition failure to stdio client');
      }
    }
  }

  /**
   * Handle epic generation started
   */
  private async handleEpicGenerationStarted(data: Record<string, unknown>): Promise<void> {
    const { agentId, originalSessionId, jobId, metadata } = data;

    if (!agentId || typeof agentId !== 'string') return;

    // Bridge to stdio communication for epic generation started
    if (originalSessionId && jobId) {
      try {
        const { sseNotifier } = await import('../../../services/sse-notifier/index.js');
        const { JobStatus } = await import('../../../services/job-manager/index.js');
        
        const taskCount = metadata && typeof metadata === 'object' && 'taskCount' in metadata 
          ? metadata.taskCount 
          : 'multiple';
        
        sseNotifier.sendProgress(
          originalSessionId as string,
          jobId as string,
          JobStatus.RUNNING,
          `Epic generation started - organizing ${taskCount} tasks`,
          82
        );

        logger.debug({
          originalSessionId,
          jobId,
          taskCount
        }, 'Progress bridge: forwarded epic generation started to stdio client');
      } catch (error) {
        logger.warn({
          err: error,
          originalSessionId,
          jobId
        }, 'Failed to send epic generation started to stdio client');
      }
    }
  }

  /**
   * Handle epic generation completed
   */
  private async handleEpicGenerationCompleted(data: Record<string, unknown>): Promise<void> {
    const { agentId, status, originalSessionId, jobId, metadata } = data;

    if (!agentId || typeof agentId !== 'string') return;

    const success = status === 'completed';

    // Bridge to stdio communication for epic generation completed
    if (originalSessionId && jobId) {
      try {
        const { sseNotifier } = await import('../../../services/sse-notifier/index.js');
        const { JobStatus } = await import('../../../services/job-manager/index.js');
        
        const taskCount = metadata && typeof metadata === 'object' && 'taskCount' in metadata 
          ? metadata.taskCount 
          : 'multiple';
        
        const completionMessage = success 
          ? `Epic generation completed - ${taskCount} tasks organized into epics`
          : 'Epic generation completed with issues - tasks may use default epic';
        
        sseNotifier.sendProgress(
          originalSessionId as string,
          jobId as string,
          JobStatus.RUNNING,
          completionMessage,
          85
        );

        logger.debug({
          originalSessionId,
          jobId,
          success,
          taskCount,
          completionMessage
        }, 'Progress bridge: forwarded epic generation completion to stdio client');
      } catch (error) {
        logger.warn({
          err: error,
          originalSessionId,
          jobId,
          success
        }, 'Failed to send epic generation completion to stdio client');
      }
    }
  }

  /**
   * Handle task list started
   */
  private async handleTaskListStarted(data: Record<string, unknown>): Promise<void> {
    const { agentId, originalSessionId, jobId } = data;

    if (!agentId || typeof agentId !== 'string') return;

    // Bridge to stdio communication for task list processing started
    if (originalSessionId && jobId) {
      try {
        const { sseNotifier } = await import('../../../services/sse-notifier/index.js');
        const { JobStatus } = await import('../../../services/job-manager/index.js');
        
        sseNotifier.sendProgress(
          originalSessionId as string,
          jobId as string,
          JobStatus.RUNNING,
          'Task list processing started - persisting tasks to storage',
          86
        );

        logger.debug({
          originalSessionId,
          jobId
        }, 'Progress bridge: forwarded task list started to stdio client');
      } catch (error) {
        logger.warn({
          err: error,
          originalSessionId,
          jobId
        }, 'Failed to send task list started to stdio client');
      }
    }
  }

  /**
   * Handle task list completed
   */
  private async handleTaskListCompleted(data: Record<string, unknown>): Promise<void> {
    const { agentId, originalSessionId, jobId, totalTasks, persistedTasks } = data;

    if (!agentId || typeof agentId !== 'string') return;

    // Bridge to stdio communication for task list processing completed
    if (originalSessionId && jobId) {
      try {
        const { sseNotifier } = await import('../../../services/sse-notifier/index.js');
        const { JobStatus } = await import('../../../services/job-manager/index.js');
        
        const taskCount = persistedTasks || totalTasks || 0;
        const completionMessage = `Task list processing completed - ${taskCount} tasks persisted to storage`;
        
        sseNotifier.sendProgress(
          originalSessionId as string,
          jobId as string,
          JobStatus.RUNNING,
          completionMessage,
          90
        );

        logger.debug({
          originalSessionId,
          jobId,
          taskCount,
          completionMessage
        }, 'Progress bridge: forwarded task list completion to stdio client');
      } catch (error) {
        logger.warn({
          err: error,
          originalSessionId,
          jobId,
          taskCount: persistedTasks || totalTasks || 0
        }, 'Failed to send task list completion to stdio client');
      }
    }
  }

  /**
   * Dispose of the manager
   */
  dispose(): void {
    this.stopMonitoring();
    this.removeAllListeners();
    this.agentStates.clear();

    logger.info('Workflow-aware agent manager disposed');
  }
}
