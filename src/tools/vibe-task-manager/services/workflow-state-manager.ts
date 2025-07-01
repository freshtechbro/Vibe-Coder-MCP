/**
 * Workflow State Manager for Decomposition → Orchestration → Execution Flow
 * 
 * Provides comprehensive state tracking, transitions, and persistence for the
 * complete workflow lifecycle with proper state validation and recovery.
 */

import path from 'path';
import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import logger from '../../../logger.js';
import { FileUtils } from '../utils/file-utils.js';
import { createErrorContext } from '../utils/enhanced-errors.js';
import { getVibeTaskManagerOutputDir } from '../utils/config-loader.js';

/**
 * Workflow phases in the decomposition → orchestration → execution flow
 */
export enum WorkflowPhase {
  INITIALIZATION = 'initialization',
  DECOMPOSITION = 'decomposition', 
  ORCHESTRATION = 'orchestration',
  EXECUTION = 'execution',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Workflow state for each phase
 */
export enum WorkflowState {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  BLOCKED = 'blocked',
  RETRYING = 'retrying'
}

/**
 * Workflow transition metadata
 */
export interface WorkflowTransition {
  fromPhase: WorkflowPhase;
  fromState: WorkflowState;
  toPhase: WorkflowPhase;
  toState: WorkflowState;
  timestamp: Date;
  reason?: string;
  metadata?: Record<string, unknown>;
  triggeredBy?: string;
}

/**
 * Phase execution details
 */
export interface PhaseExecution {
  phase: WorkflowPhase;
  state: WorkflowState;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  progress: number; // 0-100
  error?: string;
  metadata: Record<string, unknown>;
  retryCount: number;
  maxRetries: number;
}

/**
 * Complete workflow state
 */
export interface WorkflowStateSnapshot {
  workflowId: string;
  sessionId: string;
  projectId: string;
  currentPhase: WorkflowPhase;
  currentState: WorkflowState;
  overallProgress: number; // 0-100
  startTime: Date;
  endTime?: Date;
  totalDuration?: number;
  
  // Phase tracking
  phases: Map<WorkflowPhase, PhaseExecution>;
  transitions: WorkflowTransition[];
  
  // Workflow metadata
  metadata: {
    taskCount?: number;
    epicCount?: number;
    agentCount?: number;
    dependencyCount?: number;
    [key: string]: unknown;
  };
  
  // Persistence info
  persistedAt: Date;
  version: string;
}

/**
 * Workflow state change event
 */
export interface WorkflowStateChangeEvent {
  workflowId: string;
  sessionId: string;
  projectId: string;
  transition: WorkflowTransition;
  snapshot: WorkflowStateSnapshot;
}

/**
 * Valid workflow transitions
 */
const VALID_TRANSITIONS: Map<string, Set<string>> = new Map([
  // From INITIALIZATION
  [`${WorkflowPhase.INITIALIZATION}:${WorkflowState.PENDING}`, new Set([
    `${WorkflowPhase.INITIALIZATION}:${WorkflowState.IN_PROGRESS}`,
    `${WorkflowPhase.INITIALIZATION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.INITIALIZATION}:${WorkflowState.CANCELLED}`
  ])],
  [`${WorkflowPhase.INITIALIZATION}:${WorkflowState.IN_PROGRESS}`, new Set([
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.PENDING}`,
    `${WorkflowPhase.INITIALIZATION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.INITIALIZATION}:${WorkflowState.CANCELLED}`
  ])],
  
  // From DECOMPOSITION
  [`${WorkflowPhase.DECOMPOSITION}:${WorkflowState.PENDING}`, new Set([
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.IN_PROGRESS}`,
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.CANCELLED}`
  ])],
  [`${WorkflowPhase.DECOMPOSITION}:${WorkflowState.IN_PROGRESS}`, new Set([
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.COMPLETED}`,
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.CANCELLED}`,
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.RETRYING}`
  ])],
  [`${WorkflowPhase.DECOMPOSITION}:${WorkflowState.COMPLETED}`, new Set([
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.PENDING}`
  ])],
  [`${WorkflowPhase.DECOMPOSITION}:${WorkflowState.RETRYING}`, new Set([
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.IN_PROGRESS}`,
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.CANCELLED}`
  ])],
  
  // From ORCHESTRATION
  [`${WorkflowPhase.ORCHESTRATION}:${WorkflowState.PENDING}`, new Set([
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.IN_PROGRESS}`,
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.CANCELLED}`
  ])],
  [`${WorkflowPhase.ORCHESTRATION}:${WorkflowState.IN_PROGRESS}`, new Set([
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.COMPLETED}`,
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.CANCELLED}`,
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.RETRYING}`
  ])],
  [`${WorkflowPhase.ORCHESTRATION}:${WorkflowState.COMPLETED}`, new Set([
    `${WorkflowPhase.EXECUTION}:${WorkflowState.PENDING}`
  ])],
  [`${WorkflowPhase.ORCHESTRATION}:${WorkflowState.RETRYING}`, new Set([
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.IN_PROGRESS}`,
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.CANCELLED}`
  ])],
  
  // From EXECUTION
  [`${WorkflowPhase.EXECUTION}:${WorkflowState.PENDING}`, new Set([
    `${WorkflowPhase.EXECUTION}:${WorkflowState.IN_PROGRESS}`,
    `${WorkflowPhase.EXECUTION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.EXECUTION}:${WorkflowState.CANCELLED}`
  ])],
  [`${WorkflowPhase.EXECUTION}:${WorkflowState.IN_PROGRESS}`, new Set([
    `${WorkflowPhase.EXECUTION}:${WorkflowState.COMPLETED}`,
    `${WorkflowPhase.EXECUTION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.EXECUTION}:${WorkflowState.CANCELLED}`,
    `${WorkflowPhase.EXECUTION}:${WorkflowState.RETRYING}`
  ])],
  [`${WorkflowPhase.EXECUTION}:${WorkflowState.COMPLETED}`, new Set([
    `${WorkflowPhase.COMPLETED}:${WorkflowState.COMPLETED}`
  ])],
  [`${WorkflowPhase.EXECUTION}:${WorkflowState.RETRYING}`, new Set([
    `${WorkflowPhase.EXECUTION}:${WorkflowState.IN_PROGRESS}`,
    `${WorkflowPhase.EXECUTION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.EXECUTION}:${WorkflowState.CANCELLED}`
  ])]
]);

/**
 * Workflow State Manager
 */
export class WorkflowStateManager extends EventEmitter {
  private static instance: WorkflowStateManager | null = null;
  private workflows: Map<string, WorkflowStateSnapshot> = new Map();
  private persistenceEnabled: boolean = true;
  private persistenceDirectory: string;
  private readonly version = '1.0.0';

  constructor(persistenceDirectory?: string) {
    super();
    // Use absolute path by default instead of relative path
    this.persistenceDirectory = persistenceDirectory ||
      path.join(getVibeTaskManagerOutputDir(), 'workflow-states');
  }

  /**
   * Get singleton instance
   */
  static getInstance(persistenceDirectory?: string): WorkflowStateManager {
    if (!WorkflowStateManager.instance) {
      WorkflowStateManager.instance = new WorkflowStateManager(persistenceDirectory);
    }
    return WorkflowStateManager.instance;
  }

  /**
   * Initialize a new workflow
   */
  async initializeWorkflow(
    workflowId: string,
    sessionId: string,
    projectId: string,
    metadata: Record<string, unknown> = {}
  ): Promise<WorkflowStateSnapshot> {
    const context = createErrorContext('WorkflowStateManager', 'initializeWorkflow')
      .sessionId(sessionId)
      .projectId(projectId)
      .metadata({ workflowId })
      .build();

    try {
      const now = new Date();
      
      const initialPhase: PhaseExecution = {
        phase: WorkflowPhase.INITIALIZATION,
        state: WorkflowState.PENDING,
        startTime: now,
        progress: 0,
        metadata: {},
        retryCount: 0,
        maxRetries: 3
      };

      const workflow: WorkflowStateSnapshot = {
        workflowId,
        sessionId,
        projectId,
        currentPhase: WorkflowPhase.INITIALIZATION,
        currentState: WorkflowState.PENDING,
        overallProgress: 0,
        startTime: now,
        phases: new Map([[WorkflowPhase.INITIALIZATION, initialPhase]]),
        transitions: [],
        metadata,
        persistedAt: now,
        version: this.version
      };

      this.workflows.set(workflowId, workflow);
      
      if (this.persistenceEnabled) {
        await this.persistWorkflow(workflow);
      }

      logger.info({
        workflowId,
        sessionId,
        projectId,
        phase: WorkflowPhase.INITIALIZATION,
        state: WorkflowState.PENDING
      }, 'Workflow initialized');

      this.emit('workflow:initialized', { workflowId, sessionId, projectId, snapshot: workflow });
      
      return workflow;

    } catch (error) {
      logger.error({ err: error, ...context }, 'Failed to initialize workflow');
      throw error;
    }
  }

  /**
   * Transition workflow to a new phase and state
   */
  async transitionWorkflow(
    workflowId: string,
    toPhase: WorkflowPhase,
    toState: WorkflowState,
    options: {
      reason?: string;
      metadata?: Record<string, unknown>;
      triggeredBy?: string;
      progress?: number;
    } = {}
  ): Promise<WorkflowStateSnapshot> {
    const context = createErrorContext('WorkflowStateManager', 'transitionWorkflow')
      .metadata({ workflowId, toPhase, toState, ...options })
      .build();

    try {
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      const fromPhase = workflow.currentPhase;
      const fromState = workflow.currentState;

      // Validate transition
      const isValidTransition = this.validateTransition(fromPhase, fromState, toPhase, toState);
      if (!isValidTransition) {
        throw new Error(
          `Invalid transition from ${fromPhase}:${fromState} to ${toPhase}:${toState}`
        );
      }

      const now = new Date();

      // Create transition record
      const transition: WorkflowTransition = {
        fromPhase,
        fromState,
        toPhase,
        toState,
        timestamp: now,
        reason: options.reason,
        metadata: options.metadata,
        triggeredBy: options.triggeredBy
      };

      // Update current phase execution if completing
      if (workflow.phases.has(fromPhase)) {
        const currentPhaseExecution = workflow.phases.get(fromPhase)!;
        if (toState === WorkflowState.COMPLETED || toState === WorkflowState.FAILED) {
          currentPhaseExecution.endTime = now;
          currentPhaseExecution.duration = now.getTime() - currentPhaseExecution.startTime.getTime();
          currentPhaseExecution.state = toState;
          if (options.progress !== undefined) {
            currentPhaseExecution.progress = options.progress;
          }
        }
      }

      // Create new phase execution if transitioning to new phase
      if (toPhase !== fromPhase) {
        const newPhaseExecution: PhaseExecution = {
          phase: toPhase,
          state: toState,
          startTime: now,
          progress: options.progress || 0,
          metadata: options.metadata || {},
          retryCount: 0,
          maxRetries: 3
        };
        workflow.phases.set(toPhase, newPhaseExecution);
      } else {
        // Update existing phase execution
        const phaseExecution = workflow.phases.get(toPhase)!;
        phaseExecution.state = toState;
        if (options.progress !== undefined) {
          phaseExecution.progress = options.progress;
        }
        if (options.metadata) {
          phaseExecution.metadata = { ...phaseExecution.metadata, ...options.metadata };
        }
      }

      // Update workflow state
      workflow.currentPhase = toPhase;
      workflow.currentState = toState;
      workflow.transitions.push(transition);
      workflow.persistedAt = now;

      // Calculate overall progress
      workflow.overallProgress = this.calculateOverallProgress(workflow);

      // Mark workflow as completed if in final state
      if (toPhase === WorkflowPhase.COMPLETED || toPhase === WorkflowPhase.FAILED) {
        workflow.endTime = now;
        workflow.totalDuration = now.getTime() - workflow.startTime.getTime();
      }

      // Persist workflow state
      if (this.persistenceEnabled) {
        await this.persistWorkflow(workflow);
      }

      logger.info({
        workflowId,
        fromPhase,
        fromState,
        toPhase,
        toState,
        progress: workflow.overallProgress,
        reason: options.reason
      }, 'Workflow transitioned');

      // Emit state change event
      const stateChangeEvent: WorkflowStateChangeEvent = {
        workflowId,
        sessionId: workflow.sessionId,
        projectId: workflow.projectId,
        transition,
        snapshot: workflow
      };

      this.emit('workflow:state-changed', stateChangeEvent);
      this.emit(`workflow:${toPhase}:${toState}`, stateChangeEvent);

      return workflow;

    } catch (error) {
      logger.error({ err: error, ...context }, 'Failed to transition workflow');
      throw error;
    }
  }

  /**
   * Update phase progress
   */
  async updatePhaseProgress(
    workflowId: string,
    phase: WorkflowPhase,
    progress: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const phaseExecution = workflow.phases.get(phase);
    if (!phaseExecution) {
      throw new Error(`Phase ${phase} not found in workflow ${workflowId}`);
    }

    phaseExecution.progress = Math.max(0, Math.min(100, progress));
    if (metadata) {
      phaseExecution.metadata = { ...phaseExecution.metadata, ...metadata };
    }

    // Update overall progress
    workflow.overallProgress = this.calculateOverallProgress(workflow);
    workflow.persistedAt = new Date();

    // Persist if enabled
    if (this.persistenceEnabled) {
      await this.persistWorkflow(workflow);
    }

    logger.debug({
      workflowId,
      phase,
      progress,
      overallProgress: workflow.overallProgress
    }, 'Phase progress updated');

    this.emit('workflow:progress-updated', {
      workflowId,
      sessionId: workflow.sessionId,
      projectId: workflow.projectId,
      phase,
      progress,
      overallProgress: workflow.overallProgress
    });
  }

  /**
   * Get workflow state
   */
  getWorkflow(workflowId: string): WorkflowStateSnapshot | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Get all workflows for a project
   */
  getProjectWorkflows(projectId: string): WorkflowStateSnapshot[] {
    return Array.from(this.workflows.values()).filter(w => w.projectId === projectId);
  }

  /**
   * Get workflows by session
   */
  getSessionWorkflows(sessionId: string): WorkflowStateSnapshot[] {
    return Array.from(this.workflows.values()).filter(w => w.sessionId === sessionId);
  }

  /**
   * Validate workflow transition
   */
  private validateTransition(
    fromPhase: WorkflowPhase,
    fromState: WorkflowState,
    toPhase: WorkflowPhase,
    toState: WorkflowState
  ): boolean {
    const fromKey = `${fromPhase}:${fromState}`;
    const toKey = `${toPhase}:${toState}`;

    const validTransitions = VALID_TRANSITIONS.get(fromKey);
    return validTransitions ? validTransitions.has(toKey) : false;
  }

  /**
   * Calculate overall workflow progress
   */
  private calculateOverallProgress(workflow: WorkflowStateSnapshot): number {
    const phaseWeights: Record<WorkflowPhase, number> = {
      [WorkflowPhase.INITIALIZATION]: 5,
      [WorkflowPhase.DECOMPOSITION]: 30,
      [WorkflowPhase.ORCHESTRATION]: 15,
      [WorkflowPhase.EXECUTION]: 45,
      [WorkflowPhase.COMPLETED]: 5,
      [WorkflowPhase.FAILED]: 0,
      [WorkflowPhase.CANCELLED]: 0
    };

    let totalWeight = 0;
    let completedWeight = 0;

    for (const [phase, execution] of workflow.phases) {
      const weight = phaseWeights[phase] || 0;
      totalWeight += weight;

      if (execution.state === WorkflowState.COMPLETED) {
        completedWeight += weight;
      } else if (execution.state === WorkflowState.IN_PROGRESS) {
        completedWeight += (weight * execution.progress) / 100;
      }
    }

    return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
  }

  /**
   * Persist workflow to file system
   */
  private async persistWorkflow(workflow: WorkflowStateSnapshot): Promise<void> {
    try {
      // Ensure persistence directory exists
      await fs.ensureDir(this.persistenceDirectory);

      // Convert Map to object for serialization
      const workflowToSave = {
        ...workflow,
        phases: Object.fromEntries(workflow.phases),
        persistedAt: new Date()
      };

      const filePath = `${this.persistenceDirectory}/${workflow.workflowId}.json`;
      const saveResult = await FileUtils.writeJsonFile(filePath, workflowToSave);

      if (!saveResult.success) {
        logger.warn({
          workflowId: workflow.workflowId,
          error: saveResult.error
        }, 'Failed to persist workflow state');
      }

    } catch (error) {
      logger.error({
        err: error,
        workflowId: workflow.workflowId
      }, 'Error persisting workflow state');
    }
  }

  /**
   * Load workflow from persistence
   */
  async loadWorkflow(workflowId: string): Promise<WorkflowStateSnapshot | null> {
    try {
      const filePath = `${this.persistenceDirectory}/${workflowId}.json`;
      const loadResult = await FileUtils.readJsonFile<Record<string, unknown>>(filePath);

      if (!loadResult.success) {
        return null;
      }

      const workflowData = loadResult.data;

      // Validate and convert phases object back to Map
      if (!workflowData || typeof workflowData !== 'object') {
        logger.warn({ workflowId }, 'Invalid workflow data structure');
        return null;
      }

      const phases = workflowData.phases && typeof workflowData.phases === 'object'
        ? new Map(Object.entries(workflowData.phases as Record<string, unknown>))
        : new Map();

      const startTime = typeof workflowData.startTime === 'string' || typeof workflowData.startTime === 'number'
        ? new Date(workflowData.startTime)
        : new Date();

      const endTime = workflowData.endTime && (typeof workflowData.endTime === 'string' || typeof workflowData.endTime === 'number')
        ? new Date(workflowData.endTime)
        : undefined;

      const persistedAt = typeof workflowData.persistedAt === 'string' || typeof workflowData.persistedAt === 'number'
        ? new Date(workflowData.persistedAt)
        : new Date();

      const transitions = Array.isArray(workflowData.transitions)
        ? workflowData.transitions.map((t: unknown) => {
            const transition = t as Record<string, unknown>;
            return {
              ...transition,
              timestamp: typeof transition.timestamp === 'string' || typeof transition.timestamp === 'number'
                ? new Date(transition.timestamp)
                : new Date()
            };
          })
        : [];

      const workflow: WorkflowStateSnapshot = {
        ...workflowData,
        phases,
        startTime,
        endTime,
        persistedAt,
        transitions
      } as WorkflowStateSnapshot;

      this.workflows.set(workflowId, workflow);
      return workflow;

    } catch (error) {
      logger.error({ err: error, workflowId }, 'Failed to load workflow from persistence');
      return null;
    }
  }

  /**
   * Clean up completed workflows older than specified days
   */
  async cleanupOldWorkflows(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let cleanedCount = 0;

    for (const [workflowId, workflow] of this.workflows) {
      if (workflow.endTime && workflow.endTime < cutoffDate) {
        this.workflows.delete(workflowId);

        // Remove persisted file
        try {
          const filePath = `${this.persistenceDirectory}/${workflowId}.json`;
          await fs.remove(filePath);
          cleanedCount++;
        } catch (error) {
          logger.warn({ err: error, workflowId }, 'Failed to remove persisted workflow file');
        }
      }
    }

    logger.info({ cleanedCount, olderThanDays }, 'Workflow cleanup completed');
    return cleanedCount;
  }

  /**
   * Get workflow statistics
   */
  getWorkflowStats(): {
    total: number;
    byPhase: Record<WorkflowPhase, number>;
    byState: Record<WorkflowState, number>;
    averageDuration: number;
    completionRate: number;
  } {
    const workflows = Array.from(this.workflows.values());
    const total = workflows.length;

    const byPhase: Record<WorkflowPhase, number> = {} as Record<WorkflowPhase, number>;
    const byState: Record<WorkflowState, number> = {} as Record<WorkflowState, number>;

    let totalDuration = 0;
    let completedCount = 0;
    let durationCount = 0;

    for (const workflow of workflows) {
      // Count by current phase
      byPhase[workflow.currentPhase] = (byPhase[workflow.currentPhase] || 0) + 1;

      // Count by current state
      byState[workflow.currentState] = (byState[workflow.currentState] || 0) + 1;

      // Calculate durations and completion rate
      if (workflow.totalDuration) {
        totalDuration += workflow.totalDuration;
        durationCount++;
      }

      if (workflow.currentPhase === WorkflowPhase.COMPLETED) {
        completedCount++;
      }
    }

    return {
      total,
      byPhase,
      byState,
      averageDuration: durationCount > 0 ? totalDuration / durationCount : 0,
      completionRate: total > 0 ? (completedCount / total) * 100 : 0
    };
  }
}
