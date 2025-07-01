/**
 * Path Security Validation for Vibe Task Manager
 *
 * Implements comprehensive file path security validation including:
 * - Directory traversal attack prevention
 * - Allowed path whitelist validation
 * - Symbolic link resolution security
 * - Path canonicalization and validation
 * - Security audit logging
 */

import fs from 'fs-extra';
import path from 'path';
import logger from '../../../logger.js';
import { getUnifiedSecurityConfig } from './unified-security-config.js';

/**
 * Path validation result
 */
export interface PathValidationResult {
  valid: boolean;
  canonicalPath?: string;
  error?: string;
  securityViolation?: boolean;
  violationType?: 'traversal' | 'whitelist' | 'symlink' | 'absolute' | 'malformed';
  auditInfo: {
    originalPath: string;
    timestamp: Date;
    validationTime: number; // ms
  };
}

/**
 * Path whitelist configuration
 */
export interface PathWhitelistConfig {
  allowedDirectories: string[];
  allowedExtensions: string[];
  blockedPatterns: RegExp[];
  allowSymlinks: boolean;
  allowAbsolutePaths: boolean;
  maxPathLength: number;
}

/**
 * Security audit event for path validation
 */
export interface PathSecurityAuditEvent {
  id: string;
  type: 'validation_success' | 'validation_failure' | 'security_violation';
  originalPath: string;
  canonicalPath?: string;
  violationType?: string;
  userAgent?: string;
  sessionId?: string;
  timestamp: Date;
  validationTime: number;
  stackTrace?: string;
}

/**
 * Path Security Validator
 */
export class PathSecurityValidator {
  private static instance: PathSecurityValidator | null = null;
  private config: PathWhitelistConfig;
  private auditEvents: PathSecurityAuditEvent[] = [];
  private auditCounter = 0;

  private constructor(config?: Partial<PathWhitelistConfig>) {
    try {
      // Try to get configuration from unified security config manager
      const unifiedConfig = getUnifiedSecurityConfig();
      const unifiedPathConfig = unifiedConfig.getPathValidatorConfig();

      this.config = {
        allowedDirectories: unifiedPathConfig.allowedDirectories,
        allowedExtensions: [
          '.json', '.yaml', '.yml', '.txt', '.md', '.log', '.gz',
          '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
          '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h',
          '.html', '.css', '.scss', '.sass', '.less',
          '.xml', '.csv', '.sql', '.sh', '.bat', '.ps1'
        ],
        blockedPatterns: [
          /\.\./g, // Directory traversal
          /~\//g, // Home directory access
          // eslint-disable-next-line no-useless-escape
          /\/etc\//g, // System config access
          // eslint-disable-next-line no-useless-escape
          /\/proc\//g, // Process info access
          // eslint-disable-next-line no-useless-escape
          /\/sys\//g, // System info access
          // eslint-disable-next-line no-useless-escape
          /\/dev\//g, // Device access
          // eslint-disable-next-line no-useless-escape
          /\/var\/log\//g, // System logs
          // eslint-disable-next-line no-useless-escape
          /\/root\//g, // Root directory
          // eslint-disable-next-line no-useless-escape
          /\/home\/[^\/]+\/\.[^\/]+/g, // Hidden files in home dirs
          /\0/g, // Null bytes
          // eslint-disable-next-line no-control-regex
          /[\x00-\x1f\x7f-\x9f]/g // Control characters
        ],
        allowSymlinks: false,
        allowAbsolutePaths: true, // Allow but validate against whitelist
        maxPathLength: unifiedPathConfig.maxPathLength,
        ...config
      };

      logger.info({
        config: this.config,
        source: 'unified-security-config'
      }, 'Path Security Validator initialized from unified configuration');

    } catch (error) {
      // Fallback to hardcoded defaults if unified config is not available
      logger.warn({ err: error }, 'Unified security config not available, falling back to defaults');

      this.config = {
        allowedDirectories: [
          process.cwd(),
          path.join(process.cwd(), 'data'),
          path.join(process.cwd(), 'src'),
          path.join(process.cwd(), 'temp'),
          '/tmp', // Allow temp directory
          '/test' // Allow test paths
        ],
        allowedExtensions: [
          '.json', '.yaml', '.yml', '.txt', '.md', '.log', '.gz',
          '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
          '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h',
          '.html', '.css', '.scss', '.sass', '.less',
          '.xml', '.csv', '.sql', '.sh', '.bat', '.ps1'
        ],
        blockedPatterns: [
          /\.\./g, // Directory traversal
          /~\//g, // Home directory access
          // eslint-disable-next-line no-useless-escape
          /\/etc\//g, // System config access
          // eslint-disable-next-line no-useless-escape
          /\/proc\//g, // Process info access
          // eslint-disable-next-line no-useless-escape
          /\/sys\//g, // System info access
          // eslint-disable-next-line no-useless-escape
          /\/dev\//g, // Device access
          // eslint-disable-next-line no-useless-escape
          /\/var\/log\//g, // System logs
          // eslint-disable-next-line no-useless-escape
          /\/root\//g, // Root directory
          // eslint-disable-next-line no-useless-escape
          /\/home\/[^\/]+\/\.[^\/]+/g, // Hidden files in home dirs
          /\0/g, // Null bytes
          // eslint-disable-next-line no-control-regex
          /[\x00-\x1f\x7f-\x9f]/g // Control characters
        ],
        allowSymlinks: false,
        allowAbsolutePaths: true, // Allow but validate against whitelist
        maxPathLength: 4096,
        ...config
      };

      logger.info({
        config: this.config,
        source: 'hardcoded-defaults'
      }, 'Path Security Validator initialized from defaults (fallback)');
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<PathWhitelistConfig>): PathSecurityValidator {
    if (!PathSecurityValidator.instance) {
      PathSecurityValidator.instance = new PathSecurityValidator(config);
    }
    return PathSecurityValidator.instance;
  }

  /**
   * Validate file path with comprehensive security checks
   */
  async validatePath(
    filePath: string,
    _operation: 'read' | 'write' | 'execute' = 'read',
    context?: { sessionId?: string; userAgent?: string }
  ): Promise<PathValidationResult> {
    const startTime = Date.now();
    const auditInfo = {
      originalPath: filePath,
      timestamp: new Date(),
      validationTime: 0
    };

    try {
      // Basic input validation
      if (!filePath || typeof filePath !== 'string') {
        return this.createValidationResult(false, auditInfo, 'Invalid path input', 'malformed');
      }

      // Check path length
      if (filePath.length > this.config.maxPathLength) {
        return this.createValidationResult(false, auditInfo, 'Path too long', 'malformed');
      }

      // Check for blocked patterns
      const blockedPattern = this.config.blockedPatterns.find(pattern => pattern.test(filePath));
      if (blockedPattern) {
        return this.createValidationResult(false, auditInfo, 'Path contains blocked pattern', 'traversal');
      }

      // Canonicalize path
      let canonicalPath: string;
      try {
        canonicalPath = path.resolve(filePath);
      } catch (error) {
        logger.debug({ error, filePath }, 'Path canonicalization failed');
        return this.createValidationResult(false, auditInfo, 'Path canonicalization failed', 'malformed');
      }

      // Check for directory traversal after canonicalization
      if (this.containsTraversal(canonicalPath, filePath)) {
        return this.createValidationResult(false, auditInfo, 'Directory traversal detected', 'traversal');
      }

      // Check against whitelist
      if (!this.isPathInWhitelist(canonicalPath)) {
        return this.createValidationResult(false, auditInfo, 'Path not in whitelist', 'whitelist');
      }

      // Check file extension if it's a file
      if (path.extname(canonicalPath) && !this.isExtensionAllowed(canonicalPath)) {
        return this.createValidationResult(false, auditInfo, 'File extension not allowed', 'whitelist');
      }

      // Check for symbolic links if not allowed
      if (!this.config.allowSymlinks && await this.isSymbolicLink(canonicalPath)) {
        return this.createValidationResult(false, auditInfo, 'Symbolic links not allowed', 'symlink');
      }

      // Validate absolute paths
      if (path.isAbsolute(filePath) && !this.config.allowAbsolutePaths) {
        return this.createValidationResult(false, auditInfo, 'Absolute paths not allowed', 'absolute');
      }

      // All checks passed
      auditInfo.validationTime = Date.now() - startTime;
      this.logAuditEvent('validation_success', filePath, canonicalPath, undefined, context, auditInfo.validationTime);

      return {
        valid: true,
        canonicalPath,
        securityViolation: false,
        auditInfo
      };

    } catch (error) {
      auditInfo.validationTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logAuditEvent('validation_failure', filePath, undefined, 'system_error', context, auditInfo.validationTime, error);

      return this.createValidationResult(false, auditInfo, `Validation error: ${errorMessage}`, 'malformed');
    }
  }

  /**
   * Create validation result with audit logging
   */
  private createValidationResult(
    valid: boolean,
    auditInfo: PathValidationResult['auditInfo'],
    error?: string,
    violationType?: PathValidationResult['violationType'],
    canonicalPath?: string
  ): PathValidationResult {
    auditInfo.validationTime = Date.now() - auditInfo.timestamp.getTime();

    if (!valid && violationType) {
      this.logAuditEvent('security_violation', auditInfo.originalPath, canonicalPath, violationType, undefined, auditInfo.validationTime);
    }

    return {
      valid,
      canonicalPath,
      error,
      securityViolation: !valid && violationType !== 'malformed',
      violationType,
      auditInfo
    };
  }

  /**
   * Check if path contains directory traversal
   */
  private containsTraversal(canonicalPath: string, originalPath: string): boolean {
    // Check for common traversal patterns
    const traversalPatterns = ['../', '..\\', '%2e%2e%2f', '%2e%2e%5c'];
    return traversalPatterns.some(pattern => originalPath.toLowerCase().includes(pattern));
  }

  /**
   * Check if path is in whitelist
   */
  private isPathInWhitelist(canonicalPath: string): boolean {
    return this.config.allowedDirectories.some(allowedDir => {
      const normalizedAllowed = path.resolve(allowedDir);
      return canonicalPath === normalizedAllowed ||
             canonicalPath.startsWith(normalizedAllowed + path.sep);
    });
  }

  /**
   * Check if file extension is allowed
   */
  private isExtensionAllowed(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.config.allowedExtensions.includes(ext);
  }

  /**
   * Check if path is a symbolic link
   */
  private async isSymbolicLink(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.lstat(filePath);
      return stats.isSymbolicLink();
    } catch {
      // If file doesn't exist or can't be accessed, it's not a symlink
      return false;
    }
  }

  /**
   * Log security audit event
   */
  private logAuditEvent(
    type: PathSecurityAuditEvent['type'],
    originalPath: string,
    canonicalPath?: string,
    violationType?: string,
    context?: { sessionId?: string; userAgent?: string },
    validationTime?: number,
    error?: Error | unknown
  ): void {
    const auditEvent: PathSecurityAuditEvent = {
      id: `path_audit_${++this.auditCounter}_${Date.now()}`,
      type,
      originalPath,
      canonicalPath,
      violationType,
      userAgent: context?.userAgent,
      sessionId: context?.sessionId,
      timestamp: new Date(),
      validationTime: validationTime || 0,
      stackTrace: error instanceof Error ? error.stack : undefined
    };

    this.auditEvents.push(auditEvent);

    // Keep only last 1000 audit events
    if (this.auditEvents.length > 1000) {
      this.auditEvents = this.auditEvents.slice(-1000);
    }

    // Log based on severity
    if (type === 'security_violation') {
      logger.warn({
        auditEvent,
        originalPath,
        canonicalPath,
        violationType
      }, 'Path security violation detected');
    } else if (type === 'validation_failure') {
      logger.error({
        auditEvent,
        error: error instanceof Error ? error.message : String(error || 'Unknown error')
      }, 'Path validation failed');
    } else {
      logger.debug({
        auditEvent
      }, 'Path validation successful');
    }
  }

  /**
   * Get security audit events
   */
  getAuditEvents(filter?: {
    type?: PathSecurityAuditEvent['type'];
    violationType?: string;
    since?: Date;
    sessionId?: string;
  }): PathSecurityAuditEvent[] {
    let events = [...this.auditEvents];

    if (filter) {
      if (filter.type) {
        events = events.filter(event => event.type === filter.type);
      }
      if (filter.violationType) {
        events = events.filter(event => event.violationType === filter.violationType);
      }
      if (filter.since) {
        events = events.filter(event => event.timestamp >= filter.since!);
      }
      if (filter.sessionId) {
        events = events.filter(event => event.sessionId === filter.sessionId);
      }
    }

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get security statistics
   */
  getSecurityStatistics(): {
    totalValidations: number;
    successfulValidations: number;
    securityViolations: number;
    validationFailures: number;
    averageValidationTime: number;
    violationsByType: Record<string, number>;
  } {
    const total = this.auditEvents.length;
    const successful = this.auditEvents.filter(e => e.type === 'validation_success').length;
    const violations = this.auditEvents.filter(e => e.type === 'security_violation').length;
    const failures = this.auditEvents.filter(e => e.type === 'validation_failure').length;

    const avgTime = total > 0
      ? this.auditEvents.reduce((sum, e) => sum + e.validationTime, 0) / total
      : 0;

    const violationsByType: Record<string, number> = {};
    this.auditEvents
      .filter(e => e.violationType)
      .forEach(e => {
        violationsByType[e.violationType!] = (violationsByType[e.violationType!] || 0) + 1;
      });

    return {
      totalValidations: total,
      successfulValidations: successful,
      securityViolations: violations,
      validationFailures: failures,
      averageValidationTime: avgTime,
      violationsByType
    };
  }

  /**
   * Update whitelist configuration
   */
  updateWhitelist(config: Partial<PathWhitelistConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info({ config: this.config }, 'Path whitelist configuration updated');
  }

  /**
   * Clear audit events (for testing or maintenance)
   */
  clearAuditEvents(): void {
    this.auditEvents = [];
    this.auditCounter = 0;
    logger.info('Path security audit events cleared');
  }

  /**
   * Shutdown validator
   */
  shutdown(): void {
    this.auditEvents = [];
    logger.info('Path Security Validator shutdown');
  }
}

/**
 * Convenience function to validate a path
 */
export async function validateSecurePath(
  filePath: string,
  operation: 'read' | 'write' | 'execute' = 'read',
  context?: { sessionId?: string; userAgent?: string }
): Promise<PathValidationResult> {
  const validator = PathSecurityValidator.getInstance();
  return validator.validatePath(filePath, operation, context);
}

/**
 * Convenience function to get path validator instance
 */
export function getPathValidator(): PathSecurityValidator {
  return PathSecurityValidator.getInstance();
}
