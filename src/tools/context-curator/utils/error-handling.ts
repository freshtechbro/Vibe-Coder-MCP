/**
 * Error Handling Classes for Context Curator
 * 
 * Provides comprehensive error handling capabilities for Context Curator operations,
 * including context preservation, recovery hints, and operation-specific error types.
 */

import { ZodIssue } from 'zod';

/**
 * Type for structured error context
 */
export type ContextCuratorErrorContext = Record<string, unknown>;

/**
 * Base error class for all Context Curator operations
 */
export class ContextCuratorError extends Error {
  /** Additional context information about the error */
  public readonly context?: ContextCuratorErrorContext;
  /** Whether this error is potentially recoverable */
  public readonly recoverable: boolean;
  /** Error severity level */
  public readonly severity: 'low' | 'medium' | 'high' | 'critical';
  /** Operation that was being performed when error occurred */
  public readonly operation?: string;
  /** Timestamp when error occurred */
  public readonly timestamp: Date;
  /** Original error that caused this error (if any) */
  public readonly cause?: Error;

  constructor(
    message: string,
    options: {
      context?: ContextCuratorErrorContext;
      recoverable?: boolean;
      severity?: 'low' | 'medium' | 'high' | 'critical';
      operation?: string;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'ContextCuratorError';
    this.context = options.context;
    this.recoverable = options.recoverable ?? false;
    this.severity = options.severity ?? 'medium';
    this.operation = options.operation;
    this.timestamp = new Date();
    this.cause = options.cause;

    // Maintain stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get recovery suggestions based on error type and context
   */
  getRecoveryHints(): string[] {
    const hints: string[] = [];
    
    if (this.recoverable) {
      hints.push('This error may be recoverable - consider retrying the operation');
      
      if (this.operation) {
        hints.push(`Check the ${this.operation} operation parameters and configuration`);
      }
      
      if (this.context?.filePath) {
        hints.push(`Verify file accessibility: ${this.context.filePath}`);
      }
      
      if (this.context?.tokenBudget) {
        hints.push('Consider adjusting token budget or file selection criteria');
      }
    } else {
      hints.push('This error requires manual intervention to resolve');
    }
    
    return hints;
  }

  /**
   * Convert error to structured object for logging/serialization
   */
  toStructured(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      severity: this.severity,
      recoverable: this.recoverable,
      operation: this.operation,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack
      } : undefined
    };
  }
}

/**
 * Error for LLM-related operations (generally recoverable)
 */
export class ContextCuratorLLMError extends ContextCuratorError {
  /** The specific LLM task that failed */
  public readonly task: string;
  /** LLM model used */
  public readonly model?: string;
  /** Number of tokens in the request */
  public readonly tokenCount?: number;

  constructor(
    message: string,
    context: {
      task: string;
      model?: string;
      tokenCount?: number;
      cause?: Error;
      [key: string]: unknown;
    }
  ) {
    super(message, {
      context,
      recoverable: true, // LLM errors are generally recoverable
      severity: 'medium',
      operation: 'llm_processing',
      cause: context.cause
    });
    
    this.name = 'ContextCuratorLLMError';
    this.task = context.task;
    this.model = context.model;
    this.tokenCount = context.tokenCount;
  }

  getRecoveryHints(): string[] {
    const hints = super.getRecoveryHints();
    
    hints.push(`Retry the ${this.task} operation with adjusted parameters`);
    
    if (this.tokenCount && this.tokenCount > 100000) {
      hints.push('Consider reducing token count by optimizing file content or selection');
    }
    
    if (this.model) {
      hints.push(`Consider using a different model than ${this.model}`);
    }
    
    hints.push('Check LLM service availability and rate limits');
    
    return hints;
  }
}

/**
 * Error for configuration-related issues (not recoverable without intervention)
 */
export class ContextCuratorConfigError extends ContextCuratorError {
  /** Configuration key that caused the error */
  public readonly configKey?: string;
  /** Expected configuration value type */
  public readonly expectedType?: string;

  constructor(
    message: string,
    context?: {
      configKey?: string;
      expectedType?: string;
      actualValue?: unknown;
      [key: string]: unknown;
    }
  ) {
    super(message, {
      context,
      recoverable: false, // Config errors require manual intervention
      severity: 'high',
      operation: 'configuration_loading'
    });
    
    this.name = 'ContextCuratorConfigError';
    this.configKey = context?.configKey;
    this.expectedType = context?.expectedType;
  }

  getRecoveryHints(): string[] {
    const hints = super.getRecoveryHints();
    
    if (this.configKey) {
      hints.push(`Check configuration for key: ${this.configKey}`);
      
      if (this.expectedType) {
        hints.push(`Ensure ${this.configKey} is of type: ${this.expectedType}`);
      }
    }
    
    hints.push('Verify environment variables and configuration files');
    hints.push('Check Context Curator configuration documentation');
    
    return hints;
  }
}

/**
 * Error for file system operations
 */
export class ContextCuratorFileError extends ContextCuratorError {
  /** File path that caused the error */
  public readonly filePath: string;
  /** File operation that failed */
  public readonly fileOperation: 'read' | 'write' | 'access' | 'stat' | 'glob';

  constructor(
    message: string,
    context: {
      filePath: string;
      fileOperation: 'read' | 'write' | 'access' | 'stat' | 'glob';
      cause?: Error;
      [key: string]: unknown;
    }
  ) {
    super(message, {
      context,
      recoverable: true, // File errors might be recoverable
      severity: 'medium',
      operation: 'file_processing',
      cause: context.cause
    });
    
    this.name = 'ContextCuratorFileError';
    this.filePath = context.filePath;
    this.fileOperation = context.fileOperation;
  }

  getRecoveryHints(): string[] {
    const hints = super.getRecoveryHints();
    
    hints.push(`Verify file exists and is accessible: ${this.filePath}`);
    hints.push(`Check permissions for ${this.fileOperation} operation`);
    
    if (this.fileOperation === 'read') {
      hints.push('Ensure file is not locked by another process');
      hints.push('Check file encoding and format');
    }
    
    if (this.fileOperation === 'glob') {
      hints.push('Verify glob pattern syntax and directory structure');
    }
    
    return hints;
  }
}

/**
 * Error for validation failures
 */
export class ContextCuratorValidationError extends ContextCuratorError {
  /** Validation issues from Zod */
  public readonly validationIssues?: ZodIssue[];
  /** Schema name that failed validation */
  public readonly schemaName?: string;

  constructor(
    message: string,
    context?: {
      validationIssues?: ZodIssue[];
      schemaName?: string;
      invalidData?: unknown;
      [key: string]: unknown;
    }
  ) {
    super(message, {
      context: { ...context, validationIssues: context?.validationIssues },
      recoverable: true, // Validation errors are often recoverable with corrected input
      severity: 'medium',
      operation: 'data_validation'
    });
    
    this.name = 'ContextCuratorValidationError';
    this.validationIssues = context?.validationIssues;
    this.schemaName = context?.schemaName;
  }

  getRecoveryHints(): string[] {
    const hints = super.getRecoveryHints();
    
    if (this.schemaName) {
      hints.push(`Check data format for schema: ${this.schemaName}`);
    }
    
    if (this.validationIssues && this.validationIssues.length > 0) {
      hints.push('Validation issues found:');
      this.validationIssues.forEach(issue => {
        hints.push(`  - ${issue.path.join('.')}: ${issue.message}`);
      });
    }
    
    hints.push('Verify input data matches expected schema format');

    return hints;
  }
}

/**
 * Error for token budget exceeded scenarios
 */
export class ContextCuratorTokenBudgetError extends ContextCuratorError {
  /** Current token count */
  public readonly currentTokens: number;
  /** Maximum allowed tokens */
  public readonly maxTokens: number;
  /** Percentage over budget */
  public readonly overagePercentage: number;

  constructor(
    message: string,
    context: {
      currentTokens: number;
      maxTokens: number;
      operation?: string;
      [key: string]: unknown;
    }
  ) {
    const overagePercentage = ((context.currentTokens - context.maxTokens) / context.maxTokens) * 100;

    super(message, {
      context: { ...context, overagePercentage },
      recoverable: true, // Token budget errors are recoverable by adjusting selection
      severity: overagePercentage > 50 ? 'high' : 'medium',
      operation: context.operation || 'token_estimation'
    });

    this.name = 'ContextCuratorTokenBudgetError';
    this.currentTokens = context.currentTokens;
    this.maxTokens = context.maxTokens;
    this.overagePercentage = overagePercentage;
  }

  getRecoveryHints(): string[] {
    const hints = super.getRecoveryHints();

    hints.push(`Current tokens (${this.currentTokens}) exceed budget (${this.maxTokens}) by ${this.overagePercentage.toFixed(1)}%`);
    hints.push('Consider reducing file selection or optimizing content');
    hints.push('Increase token budget if more content is essential');
    hints.push('Use more aggressive content optimization settings');

    if (this.overagePercentage > 100) {
      hints.push('Consider splitting the task into smaller chunks');
    }

    return hints;
  }
}

/**
 * Error for timeout scenarios
 */
export class ContextCuratorTimeoutError extends ContextCuratorError {
  /** Timeout duration in milliseconds */
  public readonly timeoutMs: number;
  /** Actual duration before timeout */
  public readonly actualDurationMs?: number;

  constructor(
    message: string,
    context: {
      timeoutMs: number;
      actualDurationMs?: number;
      operation?: string;
      [key: string]: unknown;
    }
  ) {
    super(message, {
      context,
      recoverable: true, // Timeouts are often recoverable with retry
      severity: 'medium',
      operation: context.operation || 'async_operation'
    });

    this.name = 'ContextCuratorTimeoutError';
    this.timeoutMs = context.timeoutMs;
    this.actualDurationMs = context.actualDurationMs;
  }

  getRecoveryHints(): string[] {
    const hints = super.getRecoveryHints();

    hints.push(`Operation timed out after ${this.timeoutMs}ms`);
    hints.push('Consider increasing timeout duration');
    hints.push('Check network connectivity and service availability');
    hints.push('Retry the operation with exponential backoff');

    if (this.actualDurationMs) {
      hints.push(`Operation ran for ${this.actualDurationMs}ms before timeout`);
    }

    return hints;
  }
}

/**
 * Utility functions for error handling
 */
export class ErrorHandler {
  /**
   * Wrap a function with error handling and context
   */
  static async withErrorContext<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: ContextCuratorErrorContext
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ContextCuratorError) {
        // Re-throw with additional context
        throw new ContextCuratorError(error.message, {
          ...error,
          context: { ...error.context, ...context },
          operation: error.operation || operation
        });
      } else {
        // Wrap unknown errors
        throw new ContextCuratorError(
          error instanceof Error ? error.message : 'Unknown error occurred',
          {
            context,
            operation,
            cause: error instanceof Error ? error : undefined
          }
        );
      }
    }
  }

  /**
   * Check if an error is recoverable
   */
  static isRecoverable(error: unknown): boolean {
    if (error instanceof ContextCuratorError) {
      return error.recoverable;
    }
    return false; // Unknown errors are not considered recoverable
  }

  /**
   * Get error severity
   */
  static getSeverity(error: unknown): 'low' | 'medium' | 'high' | 'critical' {
    if (error instanceof ContextCuratorError) {
      return error.severity;
    }
    return 'medium'; // Default severity for unknown errors
  }

  /**
   * Format error for logging
   */
  static formatForLogging(error: unknown): Record<string, unknown> {
    if (error instanceof ContextCuratorError) {
      return error.toStructured();
    } else if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        severity: 'medium',
        recoverable: false
      };
    } else {
      return {
        name: 'UnknownError',
        message: String(error),
        severity: 'medium',
        recoverable: false
      };
    }
  }

  /**
   * Validate and return a safe file operation type
   */
  private static validateFileOperation(operation: unknown): 'read' | 'write' | 'access' | 'stat' | 'glob' {
    const validOperations: ReadonlyArray<'read' | 'write' | 'access' | 'stat' | 'glob'> = ['read', 'write', 'access', 'stat', 'glob'];
    if (typeof operation === 'string' && validOperations.includes(operation as 'read' | 'write' | 'access' | 'stat' | 'glob')) {
      return operation as 'read' | 'write' | 'access' | 'stat' | 'glob';
    }
    return 'read'; // Safe default
  }

  /**
   * Create appropriate error type based on operation and cause
   */
  static createError(
    message: string,
    operation: string,
    cause?: Error,
    context?: ContextCuratorErrorContext
  ): ContextCuratorError {
    // Determine appropriate error type based on operation
    switch (operation) {
      case 'llm_processing':
      case 'intent_analysis':
      case 'prompt_refinement':
        return new ContextCuratorLLMError(message, {
          task: operation,
          cause,
          ...context
        });

      case 'configuration_loading':
      case 'config_validation':
        return new ContextCuratorConfigError(message, {
          cause,
          ...context
        });

      case 'file_processing':
      case 'file_reading':
      case 'file_discovery':
        return new ContextCuratorFileError(message, {
          filePath: context?.filePath as string || 'unknown',
          fileOperation: this.validateFileOperation(context?.fileOperation),
          cause,
          ...context
        });

      case 'data_validation':
      case 'schema_validation':
        return new ContextCuratorValidationError(message, {
          cause,
          ...context
        });

      case 'token_estimation':
      case 'token_budget':
        if (context?.currentTokens && context?.maxTokens) {
          return new ContextCuratorTokenBudgetError(message, {
            currentTokens: context.currentTokens as number,
            maxTokens: context.maxTokens as number,
            operation,
            ...context
          });
        }
        break;

      case 'timeout':
      case 'async_operation':
        if (context?.timeoutMs) {
          return new ContextCuratorTimeoutError(message, {
            timeoutMs: context.timeoutMs as number,
            operation,
            ...context
          });
        }
        break;
    }

    // Default to base error
    return new ContextCuratorError(message, {
      context,
      operation,
      cause
    });
  }
}
