/**
 * Security Middleware for Vibe Task Manager
 *
 * Provides unified security layer for command handlers including:
 * - Input sanitization
 * - Path validation
 * - Concurrent access management
 * - Performance monitoring
 * - Security violation tracking
 */

import { PathSecurityValidator, PathValidationResult } from './path-validator.js';
import { DataSanitizer, SanitizationResult } from './data-sanitizer.js';
import { ConcurrentAccessManager, LockAcquisitionResult } from './concurrent-access.js';
import { CommandExecutionContext } from '../nl/command-handlers.js';
import logger from '../../../logger.js';

/**
 * Security validation result
 */
export interface SecurityValidationResult {
  valid: boolean;
  sanitizedData?: unknown;
  pathValidation?: PathValidationResult;
  sanitizationResult?: SanitizationResult<unknown>;
  lockResult?: LockAcquisitionResult;
  violations: SecurityViolation[];
  performanceMetrics: {
    totalTime: number;
    pathValidationTime?: number;
    sanitizationTime?: number;
    lockAcquisitionTime?: number;
  };
}

/**
 * Security violation
 */
export interface SecurityViolation {
  type: 'path' | 'sanitization' | 'access' | 'performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  field?: string;
  originalValue?: unknown;
  sanitizedValue?: unknown;
  context?: Record<string, unknown>;
}

/**
 * Security middleware configuration
 */
export interface SecurityMiddlewareConfig {
  enablePathValidation: boolean;
  enableInputSanitization: boolean;
  enableConcurrentAccess: boolean;
  performanceThresholdMs: number;
  strictMode: boolean;
  logViolations: boolean;
  blockOnCriticalViolations: boolean;
}

/**
 * Security operation context
 */
export interface SecurityOperationContext {
  operation: string;
  resource?: string;
  sessionId?: string;
  userId?: string;
  filePaths?: string[];
  requiresLock?: boolean;
  lockTimeout?: number;
}

/**
 * Security Middleware
 */
export class SecurityMiddleware {
  private static instance: SecurityMiddleware | null = null;
  private pathValidator: PathSecurityValidator;
  private dataSanitizer: DataSanitizer;
  private accessManager: ConcurrentAccessManager;
  private config: SecurityMiddlewareConfig;

  private constructor(config?: Partial<SecurityMiddlewareConfig>) {
    this.config = {
      enablePathValidation: true,
      enableInputSanitization: true,
      enableConcurrentAccess: true,
      performanceThresholdMs: 50, // <50ms requirement
      strictMode: true,
      logViolations: true,
      blockOnCriticalViolations: true,
      ...config
    };

    this.pathValidator = PathSecurityValidator.getInstance();
    this.dataSanitizer = DataSanitizer.getInstance();
    this.accessManager = ConcurrentAccessManager.getInstance();

    logger.info({ config: this.config }, 'Security Middleware initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<SecurityMiddlewareConfig>): SecurityMiddleware {
    if (!SecurityMiddleware.instance) {
      SecurityMiddleware.instance = new SecurityMiddleware(config);
    }
    return SecurityMiddleware.instance;
  }

  /**
   * Validate security for command execution
   */
  async validateCommandSecurity(
    data: unknown,
    context: CommandExecutionContext,
    operationContext: SecurityOperationContext
  ): Promise<SecurityValidationResult> {
    const startTime = Date.now();
    const violations: SecurityViolation[] = [];
    let sanitizedData = data;
    let pathValidation: PathValidationResult | undefined;
    let sanitizationResult: SanitizationResult<unknown> | undefined;
    let lockResult: LockAcquisitionResult | undefined;

    try {
      // 1. Input Sanitization
      if (this.config.enableInputSanitization && data) {
        const sanitizationStart = Date.now();
        sanitizationResult = await this.dataSanitizer.sanitizeInput(data);
        const sanitizationTime = Date.now() - sanitizationStart;

        if (!sanitizationResult.success) {
          violations.push({
            type: 'sanitization',
            severity: 'high',
            description: 'Input sanitization failed',
            context: { violations: sanitizationResult.violations }
          });

          if (this.config.blockOnCriticalViolations) {
            return this.createValidationResult(false, violations, {
              totalTime: Date.now() - startTime,
              sanitizationTime
            });
          }
        }

        sanitizedData = sanitizationResult.sanitizedData || data;

        // Add sanitization violations
        if (sanitizationResult) {
          sanitizationResult.violations.forEach(violation => {
            violations.push({
              type: 'sanitization',
              severity: violation.severity,
              description: violation.description,
              field: violation.field,
              originalValue: violation.originalValue,
              sanitizedValue: violation.sanitizedValue
            });
          });
        }
      }

      // 2. Path Validation
      if (this.config.enablePathValidation && operationContext.filePaths) {
        const pathValidationStart = Date.now();

        for (const filePath of operationContext.filePaths) {
          pathValidation = await this.pathValidator.validatePath(
            filePath,
            'write', // Default to most restrictive
            { sessionId: context.sessionId }
          );

          if (!pathValidation.valid) {
            violations.push({
              type: 'path',
              severity: pathValidation.securityViolation ? 'critical' : 'medium',
              description: pathValidation.error || 'Path validation failed',
              field: 'filePath',
              originalValue: filePath,
              context: { violationType: pathValidation.violationType }
            });

            if (this.config.blockOnCriticalViolations && pathValidation.securityViolation) {
              return this.createValidationResult(false, violations, {
                totalTime: Date.now() - startTime,
                pathValidationTime: Date.now() - pathValidationStart
              });
            }
          }
        }
      }

      // 3. Concurrent Access Management
      if (this.config.enableConcurrentAccess && operationContext.requiresLock) {
        const lockStart = Date.now();

        lockResult = await this.accessManager.acquireLock(
          operationContext.resource || operationContext.operation,
          context.userId || context.sessionId,
          'write',
          {
            timeout: operationContext.lockTimeout,
            sessionId: context.sessionId,
            waitForRelease: false
          }
        );

        const lockTime = Date.now() - lockStart;

        if (!lockResult.success) {
          violations.push({
            type: 'access',
            severity: 'medium',
            description: lockResult.error || 'Failed to acquire resource lock',
            context: {
              resource: operationContext.resource,
              conflictingLock: lockResult.conflictingLock?.id
            }
          });

          if (this.config.strictMode) {
            return this.createValidationResult(false, violations, {
              totalTime: Date.now() - startTime,
              lockAcquisitionTime: lockTime
            });
          }
        }
      }

      const totalTime = Date.now() - startTime;

      // 4. Performance Validation
      if (totalTime > this.config.performanceThresholdMs) {
        violations.push({
          type: 'performance',
          severity: 'medium',
          description: `Security validation exceeded performance threshold: ${totalTime}ms > ${this.config.performanceThresholdMs}ms`,
          context: { actualTime: totalTime, threshold: this.config.performanceThresholdMs }
        });
      }

      // Log violations if enabled
      if (this.config.logViolations && violations.length > 0) {
        logger.warn({
          violations: violations.length,
          operation: operationContext.operation,
          sessionId: context.sessionId,
          totalTime
        }, 'Security violations detected');
      }

      return this.createValidationResult(true, violations, {
        totalTime,
        pathValidationTime: pathValidation?.auditInfo.validationTime,
        sanitizationTime: sanitizationResult?.sanitizationTime,
        lockAcquisitionTime: lockResult?.waitTime
      }, sanitizedData, pathValidation, sanitizationResult, lockResult);

    } catch (error) {
      logger.error({ err: error, operation: operationContext.operation }, 'Security validation error');

      violations.push({
        type: 'access',
        severity: 'critical',
        description: `Security validation error: ${error instanceof Error ? error.message : String(error)}`,
        context: { error: error instanceof Error ? error.message : String(error) }
      });

      return this.createValidationResult(false, violations, {
        totalTime: Date.now() - startTime
      });
    }
  }

  /**
   * Release acquired locks
   */
  async releaseLocks(lockIds: string[]): Promise<void> {
    if (!this.config.enableConcurrentAccess) {
      return;
    }

    for (const lockId of lockIds) {
      try {
        await this.accessManager.releaseLock(lockId);
      } catch (error) {
        logger.error({ err: error, lockId }, 'Failed to release lock');
      }
    }
  }

  /**
   * Create validation result
   */
  private createValidationResult(
    valid: boolean,
    violations: SecurityViolation[],
    performanceMetrics: SecurityValidationResult['performanceMetrics'],
    sanitizedData?: unknown,
    pathValidation?: PathValidationResult,
    sanitizationResult?: SanitizationResult<unknown>,
    lockResult?: LockAcquisitionResult
  ): SecurityValidationResult {
    return {
      valid,
      sanitizedData,
      pathValidation,
      sanitizationResult,
      lockResult,
      violations,
      performanceMetrics
    };
  }

  /**
   * Get security configuration
   */
  getConfig(): SecurityMiddlewareConfig {
    return { ...this.config };
  }

  /**
   * Update security configuration
   */
  updateConfig(config: Partial<SecurityMiddlewareConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info({ config: this.config }, 'Security Middleware configuration updated');
  }

  /**
   * Shutdown middleware
   */
  shutdown(): void {
    // Clean up resources if needed
    logger.info('Security Middleware shutdown');
  }
}

/**
 * Convenience function for command security validation
 */
export async function validateCommandSecurity(
  data: unknown,
  context: CommandExecutionContext,
  operationContext: SecurityOperationContext
): Promise<SecurityValidationResult> {
  const middleware = SecurityMiddleware.getInstance();
  return middleware.validateCommandSecurity(data, context, operationContext);
}

/**
 * Convenience function for releasing locks
 */
export async function releaseLocks(lockIds: string[]): Promise<void> {
  const middleware = SecurityMiddleware.getInstance();
  return middleware.releaseLocks(lockIds);
}
