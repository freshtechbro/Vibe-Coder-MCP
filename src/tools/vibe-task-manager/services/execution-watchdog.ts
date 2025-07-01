/**
 * Execution Watchdog System
 * 
 * Implements timeout monitoring and recovery for agent tasks.
 * Provides configurable timeout thresholds, automatic detection,
 * escalation procedures, and health checks.
 */

import { AgentOrchestrator } from './agent-orchestrator.js';
import { TaskStreamer } from './task-streamer.js';
import { FeedbackProcessor } from './feedback-processor.js';
import { AtomicTask } from '../types/task.js';
import { AppError } from '../../../utils/errors.js';
import logger from '../../../logger.js';

/**
 * Watchdog configuration per task type
 */
export interface WatchdogConfig {
  taskType: string;
  timeoutMinutes: number;
  warningThresholdMinutes: number;
  maxRetries: number;
  escalationDelayMinutes: number;
  healthCheckIntervalMinutes: number;
}

/**
 * Task monitoring information
 */
export interface TaskMonitor {
  taskId: string;
  agentId: string;
  startTime: Date;
  lastHeartbeat: Date;
  timeoutAt: Date;
  warningAt: Date;
  status: 'monitoring' | 'warning' | 'timeout' | 'escalated' | 'recovered';
  retryCount: number;
  escalationLevel: number;
  taskType: string;
  estimatedDuration?: number;
}

/**
 * Agent health status
 */
export interface AgentHealth {
  agentId: string;
  lastSeen: Date;
  consecutiveTimeouts: number;
  totalTasksAssigned: number;
  totalTasksCompleted: number;
  averageCompletionTime: number;
  healthScore: number;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'offline';
  lastHealthCheck: Date;
}

/**
 * Watchdog statistics
 */
export interface WatchdogStats {
  totalTasksMonitored: number;
  activeMonitors: number;
  timeoutsDetected: number;
  escalationsTriggered: number;
  recoveredTasks: number;
  averageTaskDuration: number;
  agentsMonitored: number;
  unhealthyAgents: number;
  lastStatsUpdate: Date;
}

/**
 * Escalation action types
 */
export type EscalationAction = 
  | 'reassign_task'
  | 'restart_agent'
  | 'human_intervention'
  | 'task_cancellation'
  | 'system_alert';

/**
 * Escalation procedure
 */
export interface EscalationProcedure {
  level: number;
  action: EscalationAction;
  delayMinutes: number;
  description: string;
  autoExecute: boolean;
}

/**
 * Execution Watchdog System
 */
export class ExecutionWatchdog {
  private static instance: ExecutionWatchdog | null = null;
  
  private configs = new Map<string, WatchdogConfig>();
  private monitors = new Map<string, TaskMonitor>();
  private agentHealth = new Map<string, AgentHealth>();
  private agentOrchestrator: AgentOrchestrator;
  private taskStreamer: TaskStreamer;
  private feedbackProcessor: FeedbackProcessor;
  private watchdogTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private stats: WatchdogStats;
  private escalationProcedures: EscalationProcedure[];

  private constructor() {
    this.agentOrchestrator = AgentOrchestrator.getInstance();
    this.taskStreamer = TaskStreamer.getInstance();
    this.feedbackProcessor = FeedbackProcessor.getInstance();

    this.stats = {
      totalTasksMonitored: 0,
      activeMonitors: 0,
      timeoutsDetected: 0,
      escalationsTriggered: 0,
      recoveredTasks: 0,
      averageTaskDuration: 0,
      agentsMonitored: 0,
      unhealthyAgents: 0,
      lastStatsUpdate: new Date()
    };

    // Default escalation procedures
    this.escalationProcedures = [
      {
        level: 1,
        action: 'reassign_task',
        delayMinutes: 5,
        description: 'Reassign task to another agent',
        autoExecute: true
      },
      {
        level: 2,
        action: 'restart_agent',
        delayMinutes: 10,
        description: 'Request agent restart',
        autoExecute: false
      },
      {
        level: 3,
        action: 'human_intervention',
        delayMinutes: 15,
        description: 'Escalate to human operator',
        autoExecute: true
      }
    ];

    this.initializeDefaultConfigs();
    this.startWatchdog();
    
    logger.info('Execution watchdog initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ExecutionWatchdog {
    if (!ExecutionWatchdog.instance) {
      ExecutionWatchdog.instance = new ExecutionWatchdog();
    }
    return ExecutionWatchdog.instance;
  }

  /**
   * Start monitoring a task
   */
  async startMonitoring(
    taskId: string, 
    agentId: string, 
    task: AtomicTask
  ): Promise<void> {
    try {
      const config = this.getConfigForTaskType(task.type);
      const now = new Date();
      
      const monitor: TaskMonitor = {
        taskId,
        agentId,
        startTime: now,
        lastHeartbeat: now,
        timeoutAt: new Date(now.getTime() + config.timeoutMinutes * 60000),
        warningAt: new Date(now.getTime() + config.warningThresholdMinutes * 60000),
        status: 'monitoring',
        retryCount: 0,
        escalationLevel: 0,
        taskType: task.type,
        estimatedDuration: task.estimatedHours ? task.estimatedHours * 60 : undefined
      };

      this.monitors.set(taskId, monitor);
      this.stats.totalTasksMonitored++;
      this.stats.activeMonitors = this.monitors.size;

      // Initialize agent health if not exists
      if (!this.agentHealth.has(agentId)) {
        await this.initializeAgentHealth(agentId);
      }

      // Update agent health
      const agentHealthInfo = this.agentHealth.get(agentId)!;
      agentHealthInfo.totalTasksAssigned++;
      agentHealthInfo.lastSeen = now;

      logger.info({ 
        taskId, 
        agentId, 
        timeoutAt: monitor.timeoutAt,
        taskType: task.type 
      }, 'Task monitoring started');

    } catch (error) {
      logger.error({ err: error, taskId, agentId }, 'Failed to start task monitoring');
      throw new AppError('Task monitoring startup failed', { cause: error });
    }
  }

  /**
   * Stop monitoring a task
   */
  async stopMonitoring(taskId: string, completed: boolean = true): Promise<void> {
    try {
      const monitor = this.monitors.get(taskId);
      if (!monitor) {
        logger.warn({ taskId }, 'Attempted to stop monitoring non-existent task');
        return;
      }

      const duration = Date.now() - monitor.startTime.getTime();
      
      // Update agent health
      const agentHealthInfo = this.agentHealth.get(monitor.agentId);
      if (agentHealthInfo) {
        if (completed) {
          agentHealthInfo.totalTasksCompleted++;
          agentHealthInfo.averageCompletionTime = 
            (agentHealthInfo.averageCompletionTime + duration) / 2;
          
          if (monitor.status === 'timeout' || monitor.status === 'escalated') {
            this.stats.recoveredTasks++;
            monitor.status = 'recovered';
          }
        } else {
          agentHealthInfo.consecutiveTimeouts++;
        }
        
        agentHealthInfo.healthScore = this.calculateHealthScore(agentHealthInfo);
        agentHealthInfo.status = this.determineHealthStatus(agentHealthInfo);
      }

      // Update statistics
      this.stats.averageTaskDuration = 
        (this.stats.averageTaskDuration + duration) / 2;
      
      this.monitors.delete(taskId);
      this.stats.activeMonitors = this.monitors.size;

      logger.info({ 
        taskId, 
        agentId: monitor.agentId,
        duration: Math.round(duration / 1000),
        completed 
      }, 'Task monitoring stopped');

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to stop task monitoring');
      throw new AppError('Task monitoring shutdown failed', { cause: error });
    }
  }

  /**
   * Update task heartbeat
   */
  updateTaskHeartbeat(taskId: string): void {
    const monitor = this.monitors.get(taskId);
    if (monitor) {
      monitor.lastHeartbeat = new Date();
      
      // Reset warning status if task is active again
      if (monitor.status === 'warning') {
        monitor.status = 'monitoring';
      }

      // Update agent health
      const agentHealthInfo = this.agentHealth.get(monitor.agentId);
      if (agentHealthInfo) {
        agentHealthInfo.lastSeen = new Date();
        agentHealthInfo.consecutiveTimeouts = 0; // Reset timeout counter
      }

      logger.debug({ taskId, agentId: monitor.agentId }, 'Task heartbeat updated');
    }
  }

  /**
   * Configure timeout for task type
   */
  configureTaskType(config: WatchdogConfig): void {
    this.configs.set(config.taskType, config);
    logger.info({ taskType: config.taskType, config }, 'Watchdog configuration updated');
  }

  /**
   * Get watchdog statistics
   */
  getStats(): WatchdogStats {
    this.stats.lastStatsUpdate = new Date();
    this.stats.agentsMonitored = this.agentHealth.size;
    this.stats.unhealthyAgents = Array.from(this.agentHealth.values())
      .filter(health => health.status === 'unhealthy' || health.status === 'offline').length;
    
    return { ...this.stats };
  }

  /**
   * Get agent health information
   */
  getAgentHealth(agentId?: string): AgentHealth[] {
    if (agentId) {
      const health = this.agentHealth.get(agentId);
      return health ? [health] : [];
    }
    return Array.from(this.agentHealth.values());
  }

  /**
   * Get active task monitors
   */
  getActiveMonitors(): TaskMonitor[] {
    return Array.from(this.monitors.values());
  }

  /**
   * Force timeout check (for testing)
   */
  async forceTimeoutCheck(): Promise<void> {
    await this.checkTimeouts();
  }

  /**
   * Initialize default configurations
   */
  private initializeDefaultConfigs(): void {
    const defaultConfigs: WatchdogConfig[] = [
      {
        taskType: 'frontend',
        timeoutMinutes: 45,
        warningThresholdMinutes: 30,
        maxRetries: 2,
        escalationDelayMinutes: 5,
        healthCheckIntervalMinutes: 10
      },
      {
        taskType: 'backend',
        timeoutMinutes: 60,
        warningThresholdMinutes: 40,
        maxRetries: 2,
        escalationDelayMinutes: 5,
        healthCheckIntervalMinutes: 10
      },
      {
        taskType: 'database',
        timeoutMinutes: 30,
        warningThresholdMinutes: 20,
        maxRetries: 3,
        escalationDelayMinutes: 3,
        healthCheckIntervalMinutes: 5
      },
      {
        taskType: 'testing',
        timeoutMinutes: 20,
        warningThresholdMinutes: 15,
        maxRetries: 1,
        escalationDelayMinutes: 2,
        healthCheckIntervalMinutes: 5
      },
      {
        taskType: 'documentation',
        timeoutMinutes: 25,
        warningThresholdMinutes: 18,
        maxRetries: 1,
        escalationDelayMinutes: 3,
        healthCheckIntervalMinutes: 10
      },
      {
        taskType: 'general',
        timeoutMinutes: 30,
        warningThresholdMinutes: 20,
        maxRetries: 2,
        escalationDelayMinutes: 5,
        healthCheckIntervalMinutes: 10
      }
    ];

    defaultConfigs.forEach(config => {
      this.configs.set(config.taskType, config);
    });

    logger.debug({ configCount: defaultConfigs.length }, 'Default watchdog configurations initialized');
  }

  /**
   * Get configuration for task type
   */
  private getConfigForTaskType(taskType: string): WatchdogConfig {
    return this.configs.get(taskType) || this.configs.get('general')!;
  }

  /**
   * Start watchdog monitoring
   */
  private startWatchdog(): void {
    // Main watchdog timer - check every 30 seconds
    this.watchdogTimer = setInterval(() => {
      this.checkTimeouts().catch(error => {
        logger.error({ err: error }, 'Error in watchdog timeout check');
      });
    }, 30000);

    // Health check timer - check every 2 minutes
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks().catch(error => {
        logger.error({ err: error }, 'Error in agent health check');
      });
    }, 120000);

    logger.debug('Watchdog timers started');
  }

  /**
   * Check for task timeouts
   */
  private async checkTimeouts(): Promise<void> {
    const now = new Date();
    
    for (const monitor of this.monitors.values()) {
      try {
        // Check for warnings
        if (monitor.status === 'monitoring' && now >= monitor.warningAt) {
          monitor.status = 'warning';
          logger.warn({ 
            taskId: monitor.taskId, 
            agentId: monitor.agentId,
            timeoutIn: Math.round((monitor.timeoutAt.getTime() - now.getTime()) / 60000)
          }, 'Task approaching timeout');
        }

        // Check for timeouts
        if (monitor.status !== 'timeout' && now >= monitor.timeoutAt) {
          monitor.status = 'timeout';
          this.stats.timeoutsDetected++;
          
          logger.error({ 
            taskId: monitor.taskId, 
            agentId: monitor.agentId,
            duration: Math.round((now.getTime() - monitor.startTime.getTime()) / 60000)
          }, 'Task timeout detected');

          await this.handleTimeout(monitor);
        }
      } catch (error) {
        logger.error({ err: error, taskId: monitor.taskId }, 'Error checking task timeout');
      }
    }
  }

  /**
   * Handle task timeout
   */
  private async handleTimeout(monitor: TaskMonitor): Promise<void> {
    try {
      const config = this.getConfigForTaskType(monitor.taskType);
      
      // Update agent health
      const agentHealthInfo = this.agentHealth.get(monitor.agentId);
      if (agentHealthInfo) {
        agentHealthInfo.consecutiveTimeouts++;
        agentHealthInfo.healthScore = this.calculateHealthScore(agentHealthInfo);
        agentHealthInfo.status = this.determineHealthStatus(agentHealthInfo);
      }

      // Check if we should retry
      if (monitor.retryCount < config.maxRetries) {
        monitor.retryCount++;
        await this.retryTask(monitor);
      } else {
        // Escalate
        await this.escalateTask(monitor);
      }

    } catch (error) {
      logger.error({ err: error, taskId: monitor.taskId }, 'Failed to handle task timeout');
    }
  }

  /**
   * Retry a timed-out task
   */
  private async retryTask(monitor: TaskMonitor): Promise<void> {
    try {
      // Release current task claim
      await this.taskStreamer.releaseTask(monitor.taskId, monitor.agentId);
      
      // Reset monitor timing
      const config = this.getConfigForTaskType(monitor.taskType);
      const now = new Date();
      monitor.startTime = now;
      monitor.lastHeartbeat = now;
      monitor.timeoutAt = new Date(now.getTime() + config.timeoutMinutes * 60000);
      monitor.warningAt = new Date(now.getTime() + config.warningThresholdMinutes * 60000);
      monitor.status = 'monitoring';

      logger.info({ 
        taskId: monitor.taskId, 
        agentId: monitor.agentId,
        retryCount: monitor.retryCount 
      }, 'Task retry initiated');

    } catch (error) {
      logger.error({ err: error, taskId: monitor.taskId }, 'Failed to retry task');
    }
  }

  /**
   * Escalate a task
   */
  private async escalateTask(monitor: TaskMonitor): Promise<void> {
    try {
      monitor.status = 'escalated';
      monitor.escalationLevel++;
      this.stats.escalationsTriggered++;

      const procedure = this.escalationProcedures[monitor.escalationLevel - 1];
      if (procedure) {
        logger.warn({ 
          taskId: monitor.taskId, 
          agentId: monitor.agentId,
          escalationLevel: monitor.escalationLevel,
          action: procedure.action 
        }, 'Task escalation triggered');

        if (procedure.autoExecute) {
          await this.executeEscalationAction(monitor, procedure);
        }
      } else {
        logger.error({ 
          taskId: monitor.taskId, 
          escalationLevel: monitor.escalationLevel 
        }, 'No escalation procedure defined for level');
      }

    } catch (error) {
      logger.error({ err: error, taskId: monitor.taskId }, 'Failed to escalate task');
    }
  }

  /**
   * Execute escalation action
   */
  private async executeEscalationAction(
    monitor: TaskMonitor, 
    procedure: EscalationProcedure
  ): Promise<void> {
    try {
      switch (procedure.action) {
        case 'reassign_task':
          await this.taskStreamer.releaseTask(monitor.taskId, monitor.agentId);
          logger.info({ taskId: monitor.taskId }, 'Task reassigned due to escalation');
          break;

        case 'human_intervention':
          logger.error({ 
            taskId: monitor.taskId, 
            agentId: monitor.agentId 
          }, 'HUMAN INTERVENTION REQUIRED: Task escalated to maximum level');
          break;

        case 'task_cancellation':
          await this.stopMonitoring(monitor.taskId, false);
          logger.warn({ taskId: monitor.taskId }, 'Task cancelled due to escalation');
          break;

        default:
          logger.warn({ action: procedure.action }, 'Escalation action not implemented');
      }

    } catch (error) {
      logger.error({ err: error, action: procedure.action }, 'Failed to execute escalation action');
    }
  }

  /**
   * Initialize agent health tracking
   */
  private async initializeAgentHealth(agentId: string): Promise<void> {
    const health: AgentHealth = {
      agentId,
      lastSeen: new Date(),
      consecutiveTimeouts: 0,
      totalTasksAssigned: 0,
      totalTasksCompleted: 0,
      averageCompletionTime: 0,
      healthScore: 1.0,
      status: 'healthy',
      lastHealthCheck: new Date()
    };

    this.agentHealth.set(agentId, health);
    logger.debug({ agentId }, 'Agent health tracking initialized');
  }

  /**
   * Perform agent health checks
   */
  private async performHealthChecks(): Promise<void> {
    const now = new Date();
    
    for (const health of this.agentHealth.values()) {
      try {
        // Check if agent has been seen recently
        const timeSinceLastSeen = now.getTime() - health.lastSeen.getTime();
        const maxIdleTime = 10 * 60 * 1000; // 10 minutes

        if (timeSinceLastSeen > maxIdleTime) {
          health.status = 'offline';
        } else {
          health.healthScore = this.calculateHealthScore(health);
          health.status = this.determineHealthStatus(health);
        }

        health.lastHealthCheck = now;

      } catch (error) {
        logger.error({ err: error, agentId: health.agentId }, 'Error in agent health check');
      }
    }
  }

  /**
   * Calculate agent health score
   */
  private calculateHealthScore(health: AgentHealth): number {
    const completionRate = health.totalTasksAssigned > 0 
      ? health.totalTasksCompleted / health.totalTasksAssigned 
      : 1.0;
    
    const timeoutPenalty = Math.min(health.consecutiveTimeouts * 0.2, 0.8);
    const baseScore = completionRate - timeoutPenalty;
    
    return Math.max(0, Math.min(1, baseScore));
  }

  /**
   * Determine health status from score
   */
  private determineHealthStatus(health: AgentHealth): AgentHealth['status'] {
    if (health.healthScore >= 0.8) return 'healthy';
    if (health.healthScore >= 0.5) return 'degraded';
    return 'unhealthy';
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
    }
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.monitors.clear();
    this.agentHealth.clear();
    this.configs.clear();
    
    ExecutionWatchdog.instance = null;
    logger.info('Execution watchdog destroyed');
  }
}
