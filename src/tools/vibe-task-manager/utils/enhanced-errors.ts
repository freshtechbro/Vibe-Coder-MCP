/**
 * Enhanced Error Types and Custom Error Classes for Vibe Task Manager
 * Provides specific error types with context, recovery suggestions, and structured error handling
 */

import { AppError, ErrorContext } from '../../../utils/errors.js';
import logger from '../../../logger.js';

/**
 * Enhanced error severity levels
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Error categories for better classification
 */
export type ErrorCategory = 
  | 'configuration'
  | 'validation'
  | 'network'
  | 'timeout'
  | 'resource'
  | 'permission'
  | 'dependency'
  | 'agent'
  | 'task'
  | 'system';

/**
 * Recovery action suggestions
 */
export interface RecoveryAction {
  action: string;
  description: string;
  automated: boolean;
  priority: number;
}

/**
 * Enhanced error context that extends the base ErrorContext
 */
export interface EnhancedErrorContext extends ErrorContext {
  component: string;
  operation: string;
  taskId?: string;
  agentId?: string;
  projectId?: string;
  sessionId?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Base enhanced error class
 */
export class EnhancedError extends AppError {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly context: EnhancedErrorContext;
  public readonly recoveryActions: RecoveryAction[];
  public readonly retryable: boolean;
  public readonly userFriendly: boolean;

  constructor(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    context: EnhancedErrorContext,
    options: {
      cause?: Error;
      recoveryActions?: RecoveryAction[];
      retryable?: boolean;
      userFriendly?: boolean;
    } = {}
  ) {
    super(message, { cause: options.cause });
    
    this.category = category;
    this.severity = severity;
    this.context = context;
    this.recoveryActions = options.recoveryActions || [];
    this.retryable = options.retryable ?? false;
    this.userFriendly = options.userFriendly ?? false;

    // Log error automatically
    this.logError();
  }

  /**
   * Get user-friendly error message
   */
  getUserFriendlyMessage(): string {
    if (this.userFriendly) {
      return this.message;
    }

    // Generate user-friendly message based on category
    switch (this.category) {
      case 'configuration':
        return 'There is a configuration issue that needs to be resolved.';
      case 'validation':
        return 'The provided input is invalid or incomplete.';
      case 'network':
        return 'A network connection issue occurred.';
      case 'timeout':
        return 'The operation took too long to complete.';
      case 'resource':
        return 'System resources are insufficient or unavailable.';
      case 'permission':
        return 'Permission denied for the requested operation.';
      case 'dependency':
        return 'A required dependency is missing or unavailable.';
      case 'agent':
        return 'An agent encountered an issue while processing the task.';
      case 'task':
        return 'The task could not be completed as requested.';
      default:
        return 'An unexpected error occurred.';
    }
  }

  /**
   * Get recovery suggestions
   */
  getRecoverySuggestions(): string[] {
    return this.recoveryActions
      .sort((a, b) => a.priority - b.priority)
      .map(action => `${action.action}: ${action.description}`);
  }

  /**
   * Log error with appropriate level
   */
  logError(): void {
    const logData = {
      category: this.category,
      severity: this.severity,
      context: this.context,
      retryable: this.retryable,
      recoveryActions: this.recoveryActions.length,
      stack: this.stack
    };

    switch (this.severity) {
      case 'critical':
        logger.fatal(logData, this.message);
        break;
      case 'high':
        logger.error(logData, this.message);
        break;
      case 'medium':
        logger.warn(logData, this.message);
        break;
      case 'low':
        logger.info(logData, this.message);
        break;
    }
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends EnhancedError {
  constructor(
    message: string,
    context: EnhancedErrorContext,
    options: {
      cause?: Error;
      configKey?: string;
      expectedValue?: string;
      actualValue?: string;
      userFriendly?: boolean;
    } = {}
  ) {
    const recoveryActions: RecoveryAction[] = [
      {
        action: 'Check Configuration',
        description: 'Verify configuration values are correct and properly formatted',
        automated: false,
        priority: 2
      },
      {
        action: 'Validate Environment Variables',
        description: 'Ensure all required environment variables are set',
        automated: true,
        priority: 3
      }
    ];

    if (options.configKey) {
      recoveryActions.unshift({
        action: `Update ${options.configKey}`,
        description: `Set ${options.configKey} to a valid value${options.expectedValue ? ` (expected: ${options.expectedValue})` : ''}`,
        automated: false,
        priority: 1
      });
    }

    super(message, 'configuration', 'high', context, {
      cause: options.cause,
      recoveryActions,
      retryable: true,
      userFriendly: options.userFriendly ?? true
    });
  }
}

/**
 * Task execution errors
 */
export class TaskExecutionError extends EnhancedError {
  constructor(
    message: string,
    context: EnhancedErrorContext,
    options: {
      cause?: Error;
      taskType?: string;
      agentCapabilities?: string[];
      retryable?: boolean;
      userFriendly?: boolean;
    } = {}
  ) {
    const recoveryActions: RecoveryAction[] = [
      {
        action: 'Retry Task',
        description: 'Attempt to execute the task again',
        automated: true,
        priority: 1
      },
      {
        action: 'Reassign Agent',
        description: 'Assign the task to a different agent',
        automated: true,
        priority: 2
      }
    ];

    if (options.taskType) {
      recoveryActions.push({
        action: 'Check Task Requirements',
        description: `Verify that the ${options.taskType} task requirements are met`,
        automated: false,
        priority: 3
      });
    }

    super(message, 'task', 'medium', context, {
      cause: options.cause,
      recoveryActions,
      retryable: options.retryable ?? true,
      userFriendly: options.userFriendly ?? true
    });
  }
}

/**
 * Agent-related errors
 */
export class AgentError extends EnhancedError {
  constructor(
    message: string,
    context: EnhancedErrorContext,
    options: {
      cause?: Error;
      agentType?: string;
      agentStatus?: string;
      capabilities?: string[];
      userFriendly?: boolean;
    } = {}
  ) {
    const recoveryActions: RecoveryAction[] = [
      {
        action: 'Restart Agent',
        description: 'Restart the agent to resolve temporary issues',
        automated: true,
        priority: 1
      },
      {
        action: 'Check Agent Health',
        description: 'Verify agent is responding and functioning correctly',
        automated: true,
        priority: 2
      }
    ];

    if (options.agentType) {
      recoveryActions.push({
        action: `Verify ${options.agentType} Agent`,
        description: `Check that the ${options.agentType} agent is properly configured`,
        automated: false,
        priority: 3
      });
    }

    super(message, 'agent', 'medium', context, {
      cause: options.cause,
      recoveryActions,
      retryable: true,
      userFriendly: options.userFriendly ?? true
    });
  }
}

/**
 * Timeout-related errors
 */
export class TimeoutError extends EnhancedError {
  constructor(
    message: string,
    context: EnhancedErrorContext,
    options: {
      cause?: Error;
      operation?: string;
      timeoutMs?: number;
      actualDurationMs?: number;
      userFriendly?: boolean;
    } = {}
  ) {
    const recoveryActions: RecoveryAction[] = [
      {
        action: 'Increase Timeout',
        description: 'Configure a longer timeout for this operation',
        automated: false,
        priority: 1
      },
      {
        action: 'Retry Operation',
        description: 'Attempt the operation again',
        automated: true,
        priority: 2
      }
    ];

    if (options.operation) {
      recoveryActions.push({
        action: `Optimize ${options.operation}`,
        description: `Review and optimize the ${options.operation} operation for better performance`,
        automated: false,
        priority: 3
      });
    }

    super(message, 'timeout', 'medium', context, {
      cause: options.cause,
      recoveryActions,
      retryable: true,
      userFriendly: options.userFriendly ?? true
    });
  }
}

/**
 * Resource-related errors
 */
export class ResourceError extends EnhancedError {
  constructor(
    message: string,
    context: EnhancedErrorContext,
    options: {
      cause?: Error;
      resourceType?: string;
      availableAmount?: number;
      requiredAmount?: number;
      userFriendly?: boolean;
    } = {}
  ) {
    const recoveryActions: RecoveryAction[] = [
      {
        action: 'Free Resources',
        description: 'Release unused resources to make more available',
        automated: true,
        priority: 1
      },
      {
        action: 'Wait for Resources',
        description: 'Wait for resources to become available',
        automated: true,
        priority: 2
      }
    ];

    if (options.resourceType) {
      recoveryActions.push({
        action: `Increase ${options.resourceType}`,
        description: `Allocate more ${options.resourceType} resources`,
        automated: false,
        priority: 3
      });
    }

    super(message, 'resource', 'high', context, {
      cause: options.cause,
      recoveryActions,
      retryable: true,
      userFriendly: options.userFriendly ?? true
    });
  }
}

/**
 * Validation errors
 */
export class ValidationError extends EnhancedError {
  constructor(
    message: string,
    context: EnhancedErrorContext,
    options: {
      cause?: Error;
      field?: string;
      expectedFormat?: string;
      actualValue?: unknown;
      userFriendly?: boolean;
    } = {}
  ) {
    const recoveryActions: RecoveryAction[] = [
      {
        action: 'Correct Input',
        description: 'Provide valid input according to the expected format',
        automated: false,
        priority: 1
      }
    ];

    if (options.field && options.expectedFormat) {
      recoveryActions.push({
        action: `Fix ${options.field}`,
        description: `Ensure ${options.field} follows the format: ${options.expectedFormat}`,
        automated: false,
        priority: 1
      });
    }

    super(message, 'validation', 'medium', context, {
      cause: options.cause,
      recoveryActions,
      retryable: false,
      userFriendly: options.userFriendly ?? true
    });
  }
}

/**
 * Network-related errors
 */
export class NetworkError extends EnhancedError {
  constructor(
    message: string,
    context: EnhancedErrorContext,
    options: {
      cause?: Error;
      endpoint?: string;
      statusCode?: number;
      retryAfter?: number;
      userFriendly?: boolean;
    } = {}
  ) {
    const recoveryActions: RecoveryAction[] = [
      {
        action: 'Check Network Connection',
        description: 'Verify network connectivity and DNS resolution',
        automated: true,
        priority: 1
      },
      {
        action: 'Retry Request',
        description: 'Attempt the network request again',
        automated: true,
        priority: 2
      }
    ];

    if (options.endpoint) {
      recoveryActions.push({
        action: `Verify ${options.endpoint}`,
        description: `Check that ${options.endpoint} is accessible and responding`,
        automated: true,
        priority: 2
      });
    }

    super(message, 'network', 'medium', context, {
      cause: options.cause,
      recoveryActions,
      retryable: true,
      userFriendly: options.userFriendly ?? true
    });
  }
}

/**
 * Error factory for creating appropriate error types
 */
export class ErrorFactory {
  static createError(
    type: ErrorCategory,
    message: string,
    context: EnhancedErrorContext,
    options: Record<string, unknown> = {}
  ): EnhancedError {
    // Override userFriendly to false for factory-created errors to ensure
    // they return category-based user-friendly messages
    const factoryOptions = { ...options, userFriendly: false };

    switch (type) {
      case 'configuration':
        return new ConfigurationError(message, context, factoryOptions);
      case 'task':
        return new TaskExecutionError(message, context, factoryOptions);
      case 'agent':
        return new AgentError(message, context, factoryOptions);
      case 'timeout':
        return new TimeoutError(message, context, factoryOptions);
      case 'resource':
        return new ResourceError(message, context, factoryOptions);
      case 'validation':
        return new ValidationError(message, context, factoryOptions);
      case 'network':
        return new NetworkError(message, context, factoryOptions);
      default:
        return new EnhancedError(message, type, 'medium', context, factoryOptions);
    }
  }
}

/**
 * Error context builder for consistent context creation
 */
export class ErrorContextBuilder {
  private context: Partial<EnhancedErrorContext> = {
    timestamp: new Date()
  };

  component(component: string): this {
    this.context.component = component;
    return this;
  }

  operation(operation: string): this {
    this.context.operation = operation;
    return this;
  }

  taskId(taskId: string): this {
    this.context.taskId = taskId;
    return this;
  }

  agentId(agentId: string): this {
    this.context.agentId = agentId;
    return this;
  }

  projectId(projectId: string): this {
    this.context.projectId = projectId;
    return this;
  }

  sessionId(sessionId: string): this {
    this.context.sessionId = sessionId;
    return this;
  }

  metadata(metadata: Record<string, unknown>): this {
    this.context.metadata = { ...this.context.metadata, ...metadata };
    return this;
  }

  build(): EnhancedErrorContext {
    if (!this.context.component || !this.context.operation) {
      throw new Error('Component and operation are required for error context');
    }

    return this.context as EnhancedErrorContext;
  }
}

/**
 * Convenience function to create error context
 */
export function createErrorContext(component: string, operation: string): ErrorContextBuilder {
  return new ErrorContextBuilder().component(component).operation(operation);
}
