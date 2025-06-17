/**
 * Workflow-Aware Agent Lifecycle Manager
 * 
 * Prevents agents from being marked offline during active decomposition and orchestration
 * processes by implementing workflow-aware heartbeat management and adaptive timeouts.
 */

import { EventEmitter } from 'events';
import { AgentOrchestrator } from './agent-orchestrator.js';
import { WorkflowStateManager, WorkflowPhase, WorkflowState } from './workflow-state-manager.js';
import { DecompositionService } from './decomposition-service.js';
import { getTimeoutManager } from '../utils/timeout-manager.js';
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
    [key: string]: any; // Allow additional metadata fields
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
  private workflowStateManager: WorkflowStateManager;
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
      logger.warn({ err: error }, 'WorkflowStateManager getInstance not available, using fallback');
      this.workflowStateManager = { on: () => {}, emit: () => {} } as any;
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
      metadata?: Record<string, any>;
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
    metadata?: Record<string, any>
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
    metadata?: Record<string, any>
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
      const workflowStateManagerAny = this.workflowStateManager as any;
      if (typeof workflowStateManagerAny.on === 'function') {
        workflowStateManagerAny.on('workflow_phase_changed', (data: any) => {
          this.handleWorkflowPhaseChange(data).catch(error => {
            logger.error({ err: error, data }, 'Error handling workflow phase change');
          });
        });

        workflowStateManagerAny.on('workflow_progress_updated', (data: any) => {
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
      const decompositionServiceAny = this.decompositionService as any;
      if (decompositionServiceAny && typeof decompositionServiceAny.on === 'function') {
        decompositionServiceAny.on('decomposition_started', (data: any) => {
          this.handleDecompositionStarted(data).catch(error => {
            logger.error({ err: error, data }, 'Error handling decomposition started');
          });
        });

        decompositionServiceAny.on('decomposition_progress', (data: any) => {
          this.handleDecompositionProgress(data).catch(error => {
            logger.error({ err: error, data }, 'Error handling decomposition progress');
          });
        });

        decompositionServiceAny.on('decomposition_completed', (data: any) => {
          this.handleDecompositionCompleted(data).catch(error => {
            logger.error({ err: error, data }, 'Error handling decomposition completed');
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
  private async handleWorkflowPhaseChange(data: any): Promise<void> {
    const { workflowId, sessionId, fromPhase, toPhase, agentId } = data;

    if (!agentId) return;

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
      workflowId,
      sessionId,
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
  private async handleWorkflowProgressUpdate(data: any): Promise<void> {
    const { workflowId, sessionId, progress, agentId } = data;

    if (!agentId || typeof progress !== 'number') return;

    await this.updateAgentProgress(agentId, progress, {
      workflowId,
      sessionId,
      lastWorkflowUpdate: new Date()
    });
  }

  /**
   * Handle decomposition started
   */
  private async handleDecompositionStarted(data: any): Promise<void> {
    const { sessionId, agentId, taskId, projectId } = data;

    if (!agentId) return;

    await this.registerAgentActivity(agentId, 'decomposition', {
      sessionId,
      workflowId: sessionId, // Use sessionId as workflowId for decomposition
      isWorkflowCritical: true,
      expectedDuration: 10 * 60 * 1000, // 10 minutes expected
      metadata: {
        taskId,
        projectId,
        decompositionStarted: new Date()
      }
    });
  }

  /**
   * Handle decomposition progress
   */
  private async handleDecompositionProgress(data: any): Promise<void> {
    const { sessionId, agentId, progress } = data;

    if (!agentId || typeof progress !== 'number') return;

    await this.updateAgentProgress(agentId, progress, {
      sessionId,
      lastDecompositionUpdate: new Date()
    });
  }

  /**
   * Handle decomposition completed
   */
  private async handleDecompositionCompleted(data: any): Promise<void> {
    const { sessionId, agentId, success = true } = data;

    if (!agentId) return;

    await this.completeAgentActivity(agentId, success, {
      sessionId,
      decompositionCompleted: new Date()
    });
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
