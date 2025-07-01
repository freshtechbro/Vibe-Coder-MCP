/**
 * Error Recovery System
 * 
 * Implements comprehensive error recovery mechanisms including
 * agent failure detection, task retry logic, automatic re-assignment,
 * and error pattern analysis.
 */

import { AgentOrchestrator } from './agent-orchestrator.js';
import { TaskStreamer } from './task-streamer.js';
import { ExecutionWatchdog } from './execution-watchdog.js';
import { FeedbackProcessor } from './feedback-processor.js';
import { AppError, ValidationError } from '../../../utils/errors.js';
import logger from '../../../logger.js';

/**
 * Error types for classification
 */
export type ErrorType = 
  | 'agent_failure'
  | 'task_timeout'
  | 'dependency_failure'
  | 'resource_exhaustion'
  | 'communication_failure'
  | 'validation_error'
  | 'system_error'
  | 'unknown_error';

/**
 * Recovery strategy types
 */
export type RecoveryStrategy = 
  | 'retry_same_agent'
  | 'reassign_different_agent'
  | 'restart_agent'
  | 'split_task'
  | 'escalate_human'
  | 'skip_task'
  | 'rollback_changes';

/**
 * Error information
 */
export interface ErrorInfo {
  id: string;
  taskId: string;
  agentId?: string;
  errorType: ErrorType;
  message: string;
  stackTrace?: string;
  timestamp: Date;
  context: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoverable: boolean;
}

/**
 * Recovery attempt information
 */
export interface RecoveryAttempt {
  id: string;
  errorId: string;
  strategy: RecoveryStrategy;
  attemptNumber: number;
  startedAt: Date;
  completedAt?: Date;
  success: boolean;
  message?: string;
  newTaskId?: string;
  newAgentId?: string;
}

/**
 * Error pattern for analysis
 */
export interface ErrorPattern {
  pattern: string;
  errorType: ErrorType;
  frequency: number;
  lastOccurrence: Date;
  affectedAgents: Set<string>;
  affectedTasks: Set<string>;
  suggestedStrategy: RecoveryStrategy;
  preventionMeasures: string[];
}

/**
 * Recovery configuration
 */
export interface RecoveryConfig {
  maxRetryAttempts: number;
  retryDelayMinutes: number;
  exponentialBackoff: boolean;
  maxBackoffMinutes: number;
  enablePatternAnalysis: boolean;
  patternAnalysisWindowHours: number;
  autoRecoveryEnabled: boolean;
  escalationThreshold: number;
}

/**
 * Recovery statistics
 */
export interface RecoveryStats {
  totalErrors: number;
  recoveredErrors: number;
  failedRecoveries: number;
  averageRecoveryTime: number;
  mostCommonErrorType: ErrorType;
  mostEffectiveStrategy: RecoveryStrategy;
  patternsPrevented: number;
  lastStatsUpdate: Date;
}

/**
 * Error Recovery System
 */
export class ErrorRecovery {
  private static instance: ErrorRecovery | null = null;
  
  private agentOrchestrator: AgentOrchestrator;
  private taskStreamer: TaskStreamer;
  private executionWatchdog: ExecutionWatchdog;
  private feedbackProcessor: FeedbackProcessor;
  private config: RecoveryConfig;
  private errors = new Map<string, ErrorInfo>();
  private recoveryAttempts = new Map<string, RecoveryAttempt[]>();
  private errorPatterns = new Map<string, ErrorPattern>();
  private stats: RecoveryStats;

  private constructor(config?: Partial<RecoveryConfig>) {
    this.config = {
      maxRetryAttempts: 3,
      retryDelayMinutes: 2,
      exponentialBackoff: true,
      maxBackoffMinutes: 30,
      enablePatternAnalysis: true,
      patternAnalysisWindowHours: 24,
      autoRecoveryEnabled: true,
      escalationThreshold: 5,
      ...config
    };

    this.agentOrchestrator = AgentOrchestrator.getInstance();
    this.taskStreamer = TaskStreamer.getInstance();
    this.executionWatchdog = ExecutionWatchdog.getInstance();
    this.feedbackProcessor = FeedbackProcessor.getInstance();

    this.stats = {
      totalErrors: 0,
      recoveredErrors: 0,
      failedRecoveries: 0,
      averageRecoveryTime: 0,
      mostCommonErrorType: 'unknown_error',
      mostEffectiveStrategy: 'retry_same_agent',
      patternsPrevented: 0,
      lastStatsUpdate: new Date()
    };

    logger.info({ config: this.config }, 'Error recovery system initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<RecoveryConfig>): ErrorRecovery {
    if (!ErrorRecovery.instance) {
      ErrorRecovery.instance = new ErrorRecovery(config);
    }
    return ErrorRecovery.instance;
  }

  /**
   * Report an error for recovery processing
   */
  async reportError(
    taskId: string,
    errorType: ErrorType,
    message: string,
    agentId?: string,
    context?: Record<string, unknown>,
    stackTrace?: string
  ): Promise<string> {
    try {
      const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const errorInfo: ErrorInfo = {
        id: errorId,
        taskId,
        agentId,
        errorType,
        message,
        stackTrace,
        timestamp: new Date(),
        context: context || {},
        severity: this.determineSeverity(errorType, message),
        recoverable: this.isRecoverable(errorType)
      };

      this.errors.set(errorId, errorInfo);
      this.stats.totalErrors++;

      logger.error({ 
        errorId, 
        taskId, 
        agentId, 
        errorType, 
        severity: errorInfo.severity 
      }, `Error reported: ${message}`);

      // Analyze error patterns
      if (this.config.enablePatternAnalysis) {
        await this.analyzeErrorPattern(errorInfo);
      }

      // Attempt automatic recovery if enabled
      if (this.config.autoRecoveryEnabled && errorInfo.recoverable) {
        await this.attemptRecovery(errorId);
      }

      return errorId;

    } catch (error) {
      logger.error({ err: error, taskId, errorType }, 'Failed to report error');
      throw new AppError('Error reporting failed', { cause: error });
    }
  }

  /**
   * Attempt error recovery
   */
  async attemptRecovery(errorId: string): Promise<boolean> {
    try {
      const errorInfo = this.errors.get(errorId);
      if (!errorInfo) {
        throw new ValidationError(`Error not found: ${errorId}`);
      }

      // Check if we've exceeded retry attempts
      const attempts = this.recoveryAttempts.get(errorId) || [];
      if (attempts.length >= this.config.maxRetryAttempts) {
        logger.warn({ errorId, attempts: attempts.length }, 'Max recovery attempts exceeded');
        await this.escalateError(errorId);
        return false;
      }

      // Determine recovery strategy
      const strategy = this.selectRecoveryStrategy(errorInfo, attempts);
      
      // Create recovery attempt
      const attemptId = `attempt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const attempt: RecoveryAttempt = {
        id: attemptId,
        errorId,
        strategy,
        attemptNumber: attempts.length + 1,
        startedAt: new Date(),
        success: false
      };

      // Add to attempts list
      if (!this.recoveryAttempts.has(errorId)) {
        this.recoveryAttempts.set(errorId, []);
      }
      this.recoveryAttempts.get(errorId)!.push(attempt);

      logger.info({ 
        errorId, 
        attemptId, 
        strategy, 
        attemptNumber: attempt.attemptNumber 
      }, 'Starting recovery attempt');

      // Apply delay with exponential backoff
      if (attempts.length > 0) {
        const delay = this.calculateRetryDelay(attempt.attemptNumber);
        await this.sleep(delay);
      }

      // Execute recovery strategy
      const success = await this.executeRecoveryStrategy(errorInfo, attempt);
      
      // Update attempt
      attempt.completedAt = new Date();
      attempt.success = success;

      if (success) {
        this.stats.recoveredErrors++;
        const recoveryTime = attempt.completedAt.getTime() - attempt.startedAt.getTime();
        this.stats.averageRecoveryTime = 
          (this.stats.averageRecoveryTime + recoveryTime) / 2;

        logger.info({ 
          errorId, 
          attemptId, 
          strategy, 
          recoveryTime: Math.round(recoveryTime / 1000) 
        }, 'Recovery successful');
      } else {
        this.stats.failedRecoveries++;
        logger.warn({ errorId, attemptId, strategy }, 'Recovery attempt failed');
        
        // Try again if we haven't exceeded max attempts
        if (attempts.length < this.config.maxRetryAttempts) {
          setTimeout(() => {
            this.attemptRecovery(errorId).catch(error => {
              logger.error({ err: error, errorId }, 'Failed to retry recovery');
            });
          }, 1000); // Small delay before next attempt
        }
      }

      return success;

    } catch (error) {
      logger.error({ err: error, errorId }, 'Failed to attempt recovery');
      throw new AppError('Recovery attempt failed', { cause: error });
    }
  }

  /**
   * Get error information
   */
  getError(errorId: string): ErrorInfo | null {
    return this.errors.get(errorId) || null;
  }

  /**
   * Get recovery attempts for an error
   */
  getRecoveryAttempts(errorId: string): RecoveryAttempt[] {
    return this.recoveryAttempts.get(errorId) || [];
  }

  /**
   * Get error patterns
   */
  getErrorPatterns(): ErrorPattern[] {
    return Array.from(this.errorPatterns.values());
  }

  /**
   * Get recovery statistics
   */
  getStats(): RecoveryStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Clear old errors and patterns
   */
  cleanup(olderThanHours: number = 168): void { // Default 7 days
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    
    // Clean up old errors
    for (const [errorId, errorInfo] of this.errors.entries()) {
      if (errorInfo.timestamp < cutoffTime) {
        this.errors.delete(errorId);
        this.recoveryAttempts.delete(errorId);
      }
    }

    // Clean up old patterns
    for (const [patternKey, pattern] of this.errorPatterns.entries()) {
      if (pattern.lastOccurrence < cutoffTime) {
        this.errorPatterns.delete(patternKey);
      }
    }

    logger.debug({ cutoffTime, olderThanHours }, 'Error recovery cleanup completed');
  }

  /**
   * Determine error severity
   */
  private determineSeverity(errorType: ErrorType, message: string): ErrorInfo['severity'] {
    const criticalTypes: ErrorType[] = ['system_error', 'resource_exhaustion'];
    const highTypes: ErrorType[] = ['agent_failure', 'dependency_failure'];
    const mediumTypes: ErrorType[] = ['task_timeout', 'communication_failure'];
    
    if (criticalTypes.includes(errorType)) return 'critical';
    if (highTypes.includes(errorType)) return 'high';
    if (mediumTypes.includes(errorType)) return 'medium';
    
    // Check message for severity indicators
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('critical') || lowerMessage.includes('fatal')) return 'critical';
    if (lowerMessage.includes('error') || lowerMessage.includes('failed')) return 'high';
    if (lowerMessage.includes('warning') || lowerMessage.includes('timeout')) return 'medium';
    
    return 'low';
  }

  /**
   * Check if error is recoverable
   */
  private isRecoverable(errorType: ErrorType): boolean {
    const unrecoverableTypes: ErrorType[] = ['validation_error', 'system_error'];
    return !unrecoverableTypes.includes(errorType);
  }

  /**
   * Select recovery strategy
   */
  private selectRecoveryStrategy(
    errorInfo: ErrorInfo, 
    previousAttempts: RecoveryAttempt[]
  ): RecoveryStrategy {
    // Check for pattern-based strategy
    const pattern = this.findMatchingPattern(errorInfo);
    if (pattern) {
      return pattern.suggestedStrategy;
    }

    // Default strategy based on error type and previous attempts
    switch (errorInfo.errorType) {
      case 'agent_failure':
        return previousAttempts.length === 0 ? 'restart_agent' : 'reassign_different_agent';
        
      case 'task_timeout':
        return previousAttempts.length === 0 ? 'retry_same_agent' : 'reassign_different_agent';
        
      case 'dependency_failure':
        return 'retry_same_agent';
        
      case 'communication_failure':
        return 'retry_same_agent';
        
      case 'resource_exhaustion':
        return 'reassign_different_agent';
        
      default:
        return previousAttempts.length === 0 ? 'retry_same_agent' : 'reassign_different_agent';
    }
  }

  /**
   * Execute recovery strategy
   */
  private async executeRecoveryStrategy(
    errorInfo: ErrorInfo, 
    attempt: RecoveryAttempt
  ): Promise<boolean> {
    try {
      switch (attempt.strategy) {
        case 'retry_same_agent':
          return await this.retryWithSameAgent(errorInfo, attempt);
          
        case 'reassign_different_agent':
          return await this.reassignToDifferentAgent(errorInfo, attempt);
          
        case 'restart_agent':
          return await this.restartAgent(errorInfo, attempt);
          
        case 'split_task':
          return await this.splitTask(errorInfo, attempt);
          
        case 'escalate_human':
          return await this.escalateToHuman(errorInfo, attempt);
          
        case 'skip_task':
          return await this.skipTask(errorInfo, attempt);
          
        default:
          logger.warn({ strategy: attempt.strategy }, 'Unknown recovery strategy');
          return false;
      }

    } catch (error) {
      logger.error({ err: error, strategy: attempt.strategy }, 'Recovery strategy execution failed');
      return false;
    }
  }

  /**
   * Retry with same agent
   */
  private async retryWithSameAgent(errorInfo: ErrorInfo, attempt: RecoveryAttempt): Promise<boolean> {
    if (!errorInfo.agentId) return false;
    
    try {
      // Release and re-queue the task
      await this.taskStreamer.releaseTask(errorInfo.taskId, errorInfo.agentId);
      
      attempt.message = 'Task released for retry with same agent';
      return true;

    } catch (error) {
      attempt.message = `Failed to retry with same agent: ${error}`;
      return false;
    }
  }

  /**
   * Reassign to different agent
   */
  private async reassignToDifferentAgent(errorInfo: ErrorInfo, attempt: RecoveryAttempt): Promise<boolean> {
    try {
      if (errorInfo.agentId) {
        await this.taskStreamer.releaseTask(errorInfo.taskId, errorInfo.agentId);
      }
      
      // Task will be automatically reassigned by the task streamer
      attempt.message = 'Task released for reassignment to different agent';
      return true;

    } catch (error) {
      attempt.message = `Failed to reassign task: ${error}`;
      return false;
    }
  }

  /**
   * Restart agent
   */
  private async restartAgent(errorInfo: ErrorInfo, attempt: RecoveryAttempt): Promise<boolean> {
    if (!errorInfo.agentId) return false;
    
    try {
      // In a real implementation, this would trigger agent restart
      // For now, just mark agent as needing restart
      logger.warn({ agentId: errorInfo.agentId }, 'Agent restart requested');
      
      attempt.message = 'Agent restart requested';
      return true;

    } catch (error) {
      attempt.message = `Failed to restart agent: ${error}`;
      return false;
    }
  }

  /**
   * Split task into smaller tasks
   */
  private async splitTask(errorInfo: ErrorInfo, attempt: RecoveryAttempt): Promise<boolean> {
    try {
      // In a real implementation, this would use the decomposition service
      // to split the task into smaller, more manageable tasks
      logger.info({ taskId: errorInfo.taskId }, 'Task splitting requested');
      
      attempt.message = 'Task splitting initiated';
      return true;

    } catch (error) {
      attempt.message = `Failed to split task: ${error}`;
      return false;
    }
  }

  /**
   * Escalate to human intervention
   */
  private async escalateToHuman(errorInfo: ErrorInfo, attempt: RecoveryAttempt): Promise<boolean> {
    try {
      logger.error({ 
        errorId: errorInfo.id, 
        taskId: errorInfo.taskId, 
        agentId: errorInfo.agentId 
      }, 'HUMAN INTERVENTION REQUIRED: Error escalated');
      
      attempt.message = 'Escalated to human intervention';
      return true;

    } catch (error) {
      attempt.message = `Failed to escalate: ${error}`;
      return false;
    }
  }

  /**
   * Skip task
   */
  private async skipTask(errorInfo: ErrorInfo, attempt: RecoveryAttempt): Promise<boolean> {
    try {
      // Mark task as skipped/cancelled
      logger.warn({ taskId: errorInfo.taskId }, 'Task skipped due to recovery failure');
      
      attempt.message = 'Task skipped';
      return true;

    } catch (error) {
      attempt.message = `Failed to skip task: ${error}`;
      return false;
    }
  }

  /**
   * Analyze error pattern
   */
  private async analyzeErrorPattern(errorInfo: ErrorInfo): Promise<void> {
    try {
      const patternKey = `${errorInfo.errorType}_${this.extractPatternFromMessage(errorInfo.message)}`;
      
      let pattern = this.errorPatterns.get(patternKey);
      if (!pattern) {
        pattern = {
          pattern: patternKey,
          errorType: errorInfo.errorType,
          frequency: 0,
          lastOccurrence: errorInfo.timestamp,
          affectedAgents: new Set(),
          affectedTasks: new Set(),
          suggestedStrategy: this.selectRecoveryStrategy(errorInfo, []),
          preventionMeasures: []
        };
        this.errorPatterns.set(patternKey, pattern);
      }

      pattern.frequency++;
      pattern.lastOccurrence = errorInfo.timestamp;
      if (errorInfo.agentId) pattern.affectedAgents.add(errorInfo.agentId);
      pattern.affectedTasks.add(errorInfo.taskId);

      // Update prevention measures based on frequency
      if (pattern.frequency >= 3) {
        pattern.preventionMeasures = this.generatePreventionMeasures(pattern);
      }

      logger.debug({ patternKey, frequency: pattern.frequency }, 'Error pattern updated');

    } catch (error) {
      logger.error({ err: error }, 'Failed to analyze error pattern');
    }
  }

  /**
   * Extract pattern from error message
   */
  private extractPatternFromMessage(message: string): string {
    // Simple pattern extraction - could be enhanced with ML
    const words = message.toLowerCase().split(/\s+/);
    const significantWords = words.filter(word => 
      word.length > 3 && 
      !['the', 'and', 'for', 'with', 'from', 'this', 'that'].includes(word)
    );
    
    return significantWords.slice(0, 3).join('_');
  }

  /**
   * Find matching error pattern
   */
  private findMatchingPattern(errorInfo: ErrorInfo): ErrorPattern | null {
    const patternKey = `${errorInfo.errorType}_${this.extractPatternFromMessage(errorInfo.message)}`;
    return this.errorPatterns.get(patternKey) || null;
  }

  /**
   * Generate prevention measures
   */
  private generatePreventionMeasures(pattern: ErrorPattern): string[] {
    const measures: string[] = [];
    
    switch (pattern.errorType) {
      case 'agent_failure':
        measures.push('Implement agent health monitoring');
        measures.push('Add agent restart automation');
        break;
        
      case 'task_timeout':
        measures.push('Adjust timeout thresholds');
        measures.push('Implement task complexity analysis');
        break;
        
      case 'communication_failure':
        measures.push('Add communication retry logic');
        measures.push('Implement connection pooling');
        break;
    }
    
    return measures;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attemptNumber: number): number {
    if (!this.config.exponentialBackoff) {
      return this.config.retryDelayMinutes * 60000;
    }
    
    const delay = this.config.retryDelayMinutes * Math.pow(2, attemptNumber - 1);
    return Math.min(delay, this.config.maxBackoffMinutes) * 60000;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Escalate error to human intervention
   */
  private async escalateError(errorId: string): Promise<void> {
    const errorInfo = this.errors.get(errorId);
    if (errorInfo) {
      logger.error({ 
        errorId, 
        taskId: errorInfo.taskId, 
        errorType: errorInfo.errorType 
      }, 'Error escalated after max recovery attempts');
    }
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    const errors = Array.from(this.errors.values());
    
    // Find most common error type
    const errorTypeCounts = new Map<ErrorType, number>();
    errors.forEach(error => {
      errorTypeCounts.set(error.errorType, (errorTypeCounts.get(error.errorType) || 0) + 1);
    });
    
    let maxCount = 0;
    let mostCommonType: ErrorType = 'unknown_error';
    for (const [type, count] of errorTypeCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonType = type;
      }
    }
    
    this.stats.mostCommonErrorType = mostCommonType;
    this.stats.lastStatsUpdate = new Date();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.errors.clear();
    this.recoveryAttempts.clear();
    this.errorPatterns.clear();
    
    ErrorRecovery.instance = null;
    logger.info('Error recovery system destroyed');
  }
}
