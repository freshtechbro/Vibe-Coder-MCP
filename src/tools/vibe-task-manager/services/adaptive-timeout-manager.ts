/**
 * Adaptive Timeout Manager for Vibe Task Manager
 * Implements progress-aware timeouts with cancellation tokens and exponential backoff
 */

import { getTimeoutManager, TimeoutOperation } from '../utils/timeout-manager.js';
import logger from '../../../logger.js';
import { EventEmitter } from 'events';

export interface TimeoutConfig {
  baseTimeoutMs: number;
  maxTimeoutMs: number;
  progressCheckIntervalMs: number;
  exponentialBackoffFactor: number;
  maxRetries: number;
  partialResultThreshold: number; // 0-1, minimum progress to consider partial success
}

export interface ProgressInfo {
  completed: number;
  total: number;
  stage: string;
  lastUpdate: Date;
  estimatedTimeRemaining?: number;
}

export interface TimeoutResult<T> {
  success: boolean;
  result?: T;
  partialResult?: Partial<T>;
  error?: string;
  timeoutOccurred: boolean;
  retryCount: number;
  totalDuration: number;
  progressAtTimeout?: ProgressInfo;
}

export interface CancellationToken {
  isCancelled: boolean;
  cancel(): void;
  onCancelled(callback: () => void): void;
}

class CancellationTokenImpl implements CancellationToken {
  private _isCancelled = false;
  private _callbacks: (() => void)[] = [];

  get isCancelled(): boolean {
    return this._isCancelled;
  }

  cancel(): void {
    if (!this._isCancelled) {
      this._isCancelled = true;
      this._callbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          logger.error({ err: error }, 'Error in cancellation callback');
        }
      });
    }
  }

  onCancelled(callback: () => void): void {
    if (this._isCancelled) {
      callback();
    } else {
      this._callbacks.push(callback);
    }
  }
}

export type ProgressCallback = (progress: ProgressInfo) => void;
export type PartialResultExtractor<T> = (currentState: Record<string, unknown>) => Partial<T> | undefined;

/**
 * Adaptive Timeout Manager with progress-aware timeouts and cancellation support
 */
export class AdaptiveTimeoutManager extends EventEmitter {
  private static instance: AdaptiveTimeoutManager;
  private activeOperations = new Map<string, {
    startTime: Date;
    config: TimeoutConfig;
    progress?: ProgressInfo;
    cancellationToken: CancellationTokenImpl;
    timeoutHandle?: NodeJS.Timeout;
    progressCheckHandle?: NodeJS.Timeout;
  }>();

  private constructor() {
    super();
  }

  static getInstance(): AdaptiveTimeoutManager {
    if (!AdaptiveTimeoutManager.instance) {
      AdaptiveTimeoutManager.instance = new AdaptiveTimeoutManager();
    }
    return AdaptiveTimeoutManager.instance;
  }

  /**
   * Execute operation with adaptive timeout
   */
  async executeWithTimeout<T>(
    operationId: string,
    operation: (cancellationToken: CancellationToken, progressCallback: ProgressCallback) => Promise<T>,
    config: Partial<TimeoutConfig> = {},
    partialResultExtractor?: PartialResultExtractor<T>
  ): Promise<TimeoutResult<T>> {
    // Get configurable timeout values from timeout manager
    const timeoutManager = getTimeoutManager();
    const retryConfig = timeoutManager.getRetryConfig();

    // Determine operation type and set appropriate timeouts
    const operationType = this.inferOperationType(operationId);
    const baseTimeout = operationType === 'taskDecomposition' 
      ? timeoutManager.getTimeout('taskDecomposition')
      : timeoutManager.getTimeout('taskExecution');

    const fullConfig: TimeoutConfig = {
      baseTimeoutMs: baseTimeout,
      maxTimeoutMs: baseTimeout * 2, 
      // Longer intervals for LLM-heavy operations to reduce noise
      progressCheckIntervalMs: operationType === 'taskDecomposition' ? 30000 : 10000, // 30s for decomposition, 10s for others
      exponentialBackoffFactor: retryConfig.backoffMultiplier,
      maxRetries: retryConfig.maxRetries,
      partialResultThreshold: 0.3, // 30% progress for partial success
      ...config
    };

    let retryCount = 0;
    let lastError: string | undefined;

    while (retryCount <= fullConfig.maxRetries) {
      const result = await this.attemptOperation(
        operationId,
        operation,
        fullConfig,
        retryCount,
        partialResultExtractor
      );

      if (result.success || !result.timeoutOccurred) {
        return result;
      }

      // Check if we have sufficient partial results to continue
      if (result.partialResult && result.progressAtTimeout) {
        const progressRatio = result.progressAtTimeout.completed / result.progressAtTimeout.total;
        if (progressRatio >= fullConfig.partialResultThreshold) {
          logger.info({
            operationId,
            progressRatio,
            retryCount
          }, 'Accepting partial result due to sufficient progress');

          return {
            ...result,
            success: true,
            result: result.partialResult as T
          };
        }
      }

      lastError = result.error;
      retryCount++;

      if (retryCount <= fullConfig.maxRetries) {
        const backoffDelay = this.calculateBackoffDelay(retryCount, fullConfig);
        logger.info({
          operationId,
          retryCount,
          backoffDelay,
          lastError
        }, 'Retrying operation after timeout');

        await this.delay(backoffDelay);
      }
    }

    return {
      success: false,
      error: lastError || 'Operation failed after maximum retries',
      timeoutOccurred: true,
      retryCount,
      totalDuration: 0
    };
  }

  /**
   * Create a cancellation token
   */
  createCancellationToken(): CancellationToken {
    return new CancellationTokenImpl();
  }

  /**
   * Cancel operation by ID
   */
  cancelOperation(operationId: string): boolean {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      operation.cancellationToken.cancel();
      this.clearOperationTimeouts(operationId);
      this.activeOperations.delete(operationId);
      logger.info({ operationId }, 'Operation cancelled');
      return true;
    }
    return false;
  }

  /**
   * Get active operations
   */
  getActiveOperations(): string[] {
    return Array.from(this.activeOperations.keys());
  }

  /**
   * Get operation progress
   */
  getOperationProgress(operationId: string): ProgressInfo | undefined {
    return this.activeOperations.get(operationId)?.progress;
  }

  /**
   * Attempt single operation execution
   */
  private async attemptOperation<T>(
    operationId: string,
    operation: (cancellationToken: CancellationToken, progressCallback: ProgressCallback) => Promise<T>,
    config: TimeoutConfig,
    retryCount: number,
    partialResultExtractor?: PartialResultExtractor<T>
  ): Promise<TimeoutResult<T>> {
    const startTime = new Date();
    const cancellationToken = new CancellationTokenImpl();
    let currentProgress: ProgressInfo | undefined;
    let operationState: Record<string, unknown> = {};

    // Store operation info
    const operationInfo = {
      startTime,
      config,
      progress: currentProgress,
      cancellationToken,
      timeoutHandle: undefined as NodeJS.Timeout | undefined,
      progressCheckHandle: undefined as NodeJS.Timeout | undefined
    };

    this.activeOperations.set(operationId, operationInfo);

    try {
      // Set up progress callback
      const progressCallback: ProgressCallback = (progress: ProgressInfo) => {
        currentProgress = progress;
        operationInfo.progress = progress;
        operationState = { ...operationState, progress };

        // Adjust timeout based on progress
        this.adjustTimeoutBasedOnProgress(operationId, progress, config);

        this.emit('progress', { operationId, progress });
      };

      // Set up adaptive timeout
      const adaptiveTimeout = this.calculateAdaptiveTimeout(config, retryCount);
      operationInfo.timeoutHandle = setTimeout(() => {
        this.handleTimeout(operationId);
      }, adaptiveTimeout);

      // Set up progress monitoring
      operationInfo.progressCheckHandle = setInterval(() => {
        this.checkProgressStagnation(operationId);
      }, config.progressCheckIntervalMs);

      // Execute the operation
      const result = await operation(cancellationToken, progressCallback);

      // Clear timeouts
      this.clearOperationTimeouts(operationId);

      const totalDuration = Date.now() - startTime.getTime();

      return {
        success: true,
        result,
        timeoutOccurred: false,
        retryCount,
        totalDuration
      };

    } catch (error) {
      this.clearOperationTimeouts(operationId);

      const totalDuration = Date.now() - startTime.getTime();
      const isTimeout = cancellationToken.isCancelled;

      let partialResult: Partial<T> | undefined;
      if (isTimeout && partialResultExtractor) {
        try {
          partialResult = partialResultExtractor(operationState);
        } catch (extractError) {
          logger.warn({ err: extractError, operationId }, 'Failed to extract partial result');
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timeoutOccurred: isTimeout,
        retryCount,
        totalDuration,
        partialResult,
        progressAtTimeout: currentProgress
      };
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Calculate adaptive timeout based on progress and retry count
   */
  private calculateAdaptiveTimeout(config: TimeoutConfig, retryCount: number): number {
    const baseTimeout = config.baseTimeoutMs * Math.pow(config.exponentialBackoffFactor, retryCount);
    return Math.min(baseTimeout, config.maxTimeoutMs);
  }

  /**
   * Adjust timeout based on current progress
   */
  private adjustTimeoutBasedOnProgress(operationId: string, progress: ProgressInfo, config: TimeoutConfig): void {
    const operation = this.activeOperations.get(operationId);
    if (!operation || !operation.timeoutHandle) return;

    const progressRatio = progress.completed / progress.total;
    const elapsedTime = Date.now() - operation.startTime.getTime();

    // If we have good progress, extend timeout
    if (progressRatio > 0.1 && progress.estimatedTimeRemaining) {
      const newTimeout = Math.min(
        progress.estimatedTimeRemaining * 1.5, // 50% buffer
        config.maxTimeoutMs - elapsedTime
      );

      if (newTimeout > 5000) { // At least 5 seconds remaining
        clearTimeout(operation.timeoutHandle);
        operation.timeoutHandle = setTimeout(() => {
          this.handleTimeout(operationId);
        }, newTimeout);

        logger.debug({
          operationId,
          progressRatio,
          newTimeout,
          estimatedRemaining: progress.estimatedTimeRemaining
        }, 'Adjusted timeout based on progress');
      }
    }
  }

  /**
   * Handle operation timeout
   */
  private handleTimeout(operationId: string): void {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      logger.warn({
        operationId,
        elapsedTime: Date.now() - operation.startTime.getTime(),
        progress: operation.progress
      }, 'Operation timeout triggered');

      operation.cancellationToken.cancel();
      this.emit('timeout', { operationId, progress: operation.progress });
    }
  }

  /**
   * Check for progress stagnation
   */
  private checkProgressStagnation(operationId: string): void {
    const operation = this.activeOperations.get(operationId);
    if (!operation?.progress) return;

    const timeSinceLastUpdate = Date.now() - operation.progress.lastUpdate.getTime();
    // More conservative stagnation threshold for LLM-heavy operations
    const multiplier = operation.config.progressCheckIntervalMs >= 30000 ? 2 : 3; // 2x for long intervals, 3x for short
    const stagnationThreshold = operation.config.progressCheckIntervalMs * multiplier;

    if (timeSinceLastUpdate > stagnationThreshold) {
      logger.warn({
        operationId,
        timeSinceLastUpdate,
        currentStage: operation.progress.stage
      }, 'Progress stagnation detected');

      this.emit('stagnation', { operationId, progress: operation.progress });
    }
  }

  /**
   * Calculate backoff delay for retries
   */
  private calculateBackoffDelay(retryCount: number, config: TimeoutConfig): number {
    return Math.min(
      1000 * Math.pow(config.exponentialBackoffFactor, retryCount),
      30000 // Max 30 seconds
    );
  }

  /**
   * Infer operation type from operation ID to optimize timeout settings
   */
  private inferOperationType(operationId: string): 'taskDecomposition' | 'taskExecution' | 'other' {
    const lowerOperationId = operationId.toLowerCase();
    
    if (lowerOperationId.includes('decomposition') || 
        lowerOperationId.includes('decompose') ||
        lowerOperationId.includes('split') ||
        lowerOperationId.includes('rdd')) {
      return 'taskDecomposition';
    }
    
    if (lowerOperationId.includes('execution') || 
        lowerOperationId.includes('execute') ||
        lowerOperationId.includes('run')) {
      return 'taskExecution';
    }
    
    return 'other';
  }

  /**
   * Clear operation timeouts
   */
  private clearOperationTimeouts(operationId: string): void {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      if (operation.timeoutHandle) {
        clearTimeout(operation.timeoutHandle);
      }
      if (operation.progressCheckHandle) {
        clearInterval(operation.progressCheckHandle);
      }
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown manager and clear all operations
   */
  shutdown(): void {
    for (const operationId of this.activeOperations.keys()) {
      this.cancelOperation(operationId);
    }
    this.removeAllListeners();
    logger.info('Adaptive Timeout Manager shutdown');
  }
}
