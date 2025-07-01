/**
 * Security Audit System for Vibe Task Manager
 *
 * Implements comprehensive security audit logging including:
 * - Security event logging
 * - Access attempt tracking
 * - Suspicious activity detection
 * - Audit log integrity protection
 * - Compliance reporting capabilities
 */

import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { AppError } from '../../../utils/errors.js';
import logger from '../../../logger.js';

/**
 * Security audit event types
 */
export type SecurityEventType =
  | 'authentication' | 'authorization' | 'access_attempt' | 'data_access'
  | 'data_modification' | 'security_violation' | 'system_event'
  | 'suspicious_activity' | 'compliance_event' | 'error_event';

/**
 * Security audit event severity
 */
export type SecurityEventSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Security audit event
 */
export interface SecurityAuditEvent {
  id: string;
  timestamp: Date;
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  source: string; // Component/service that generated the event
  actor: {
    userId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
  };
  resource: {
    type: string; // task, project, file, etc.
    id?: string;
    path?: string;
  };
  action: string; // create, read, update, delete, execute, etc.
  outcome: 'success' | 'failure' | 'blocked' | 'warning';
  details: {
    description: string;
    metadata?: Record<string, unknown>;
    errorCode?: string;
    stackTrace?: string;
  };
  integrity: {
    checksum: string;
    previousEventId?: string;
  };
}

/**
 * Suspicious activity pattern
 */
export interface SuspiciousActivityPattern {
  id: string;
  name: string;
  description: string;
  pattern: {
    eventTypes: SecurityEventType[];
    timeWindow: number; // ms
    threshold: number;
    conditions?: Record<string, unknown>;
  };
  severity: SecurityEventSeverity;
  enabled: boolean;
}

/**
 * Audit configuration
 */
export interface SecurityAuditConfig {
  enabled: boolean;
  logDirectory: string;
  maxLogFileSize: number; // bytes
  maxLogFiles: number;
  enableIntegrityProtection: boolean;
  enableSuspiciousActivityDetection: boolean;
  enableComplianceReporting: boolean;
  retentionPeriodDays: number;
  encryptLogs: boolean;
  encryptionKey?: string;
}

/**
 * Compliance report
 */
export interface ComplianceReport {
  id: string;
  generatedAt: Date;
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalEvents: number;
    eventsByType: Record<SecurityEventType, number>;
    eventsBySeverity: Record<SecurityEventSeverity, number>;
    securityViolations: number;
    suspiciousActivities: number;
  };
  violations: SecurityAuditEvent[];
  recommendations: string[];
}

/**
 * Security Audit Logger
 */
export class SecurityAuditLogger {
  private static instance: SecurityAuditLogger | null = null;
  private config: SecurityAuditConfig;
  private auditEvents: SecurityAuditEvent[] = [];
  private suspiciousPatterns: Map<string, SuspiciousActivityPattern> = new Map();
  private eventCounter = 0;
  private lastEventId: string | null = null;
  private currentLogFile: string | null = null;
  private logFileHandle: fs.WriteStream | null = null;

  private constructor(config?: Partial<SecurityAuditConfig>) {
    this.config = {
      enabled: true,
      logDirectory: path.join(process.cwd(), 'data', 'audit-logs'),
      maxLogFileSize: 10 * 1024 * 1024, // 10MB
      maxLogFiles: 100,
      enableIntegrityProtection: true,
      enableSuspiciousActivityDetection: true,
      enableComplianceReporting: true,
      retentionPeriodDays: 365, // 1 year
      encryptLogs: false,
      ...config
    };

    this.initializeAuditSystem();
    this.initializeSuspiciousActivityPatterns();

    logger.info({ config: this.config }, 'Security Audit Logger initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<SecurityAuditConfig>): SecurityAuditLogger {
    if (!SecurityAuditLogger.instance) {
      SecurityAuditLogger.instance = new SecurityAuditLogger(config);
    }
    return SecurityAuditLogger.instance;
  }

  /**
   * Log security audit event
   */
  async logSecurityEvent(
    eventType: SecurityEventType,
    severity: SecurityEventSeverity,
    source: string,
    action: string,
    outcome: 'success' | 'failure' | 'blocked' | 'warning',
    description: string,
    options?: {
      actor?: Partial<SecurityAuditEvent['actor']>;
      resource?: Partial<SecurityAuditEvent['resource']>;
      metadata?: Record<string, unknown>;
      errorCode?: string;
      stackTrace?: string;
    }
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const eventId = `audit_${++this.eventCounter}_${Date.now()}`;

      const auditEvent: SecurityAuditEvent = {
        id: eventId,
        timestamp: new Date(),
        eventType,
        severity,
        source,
        actor: {
          userId: options?.actor?.userId,
          sessionId: options?.actor?.sessionId,
          ipAddress: options?.actor?.ipAddress,
          userAgent: options?.actor?.userAgent
        },
        resource: {
          type: options?.resource?.type || 'unknown',
          id: options?.resource?.id,
          path: options?.resource?.path
        },
        action,
        outcome,
        details: {
          description,
          metadata: options?.metadata,
          errorCode: options?.errorCode,
          stackTrace: options?.stackTrace
        },
        integrity: {
          checksum: '',
          previousEventId: this.lastEventId || undefined
        }
      };

      // Calculate integrity checksum
      if (this.config.enableIntegrityProtection) {
        auditEvent.integrity.checksum = this.calculateEventChecksum(auditEvent);
      }

      // Store in memory
      this.auditEvents.push(auditEvent);
      this.lastEventId = eventId;

      // Keep only last 10000 events in memory
      if (this.auditEvents.length > 10000) {
        this.auditEvents = this.auditEvents.slice(-10000);
      }

      // Write to log file
      await this.writeToLogFile(auditEvent);

      // Check for suspicious activity
      if (this.config.enableSuspiciousActivityDetection) {
        await this.detectSuspiciousActivity(auditEvent);
      }

      // Log to application logger based on severity
      const logData = {
        eventId,
        eventType,
        severity,
        source,
        action,
        outcome,
        description: description.substring(0, 200) // Truncate for log readability
      };

      switch (severity) {
        case 'critical':
          logger.error(logData, 'Critical security event');
          break;
        case 'high':
          logger.warn(logData, 'High severity security event');
          break;
        case 'medium':
          logger.info(logData, 'Medium severity security event');
          break;
        default:
          logger.debug(logData, 'Security event logged');
      }

    } catch (error) {
      logger.error({ err: error }, 'Failed to log security audit event');
    }
  }

  /**
   * Initialize audit system
   */
  private async initializeAuditSystem(): Promise<void> {
    try {
      // Ensure audit log directory exists
      await fs.ensureDir(this.config.logDirectory);

      // Initialize log file
      await this.initializeLogFile();

      // Clean up old log files
      await this.cleanupOldLogFiles();

    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize audit system');
      throw new AppError('Failed to initialize security audit system');
    }
  }

  /**
   * Initialize log file
   */
  private async initializeLogFile(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.currentLogFile = path.join(this.config.logDirectory, `audit-${timestamp}.log`);

    this.logFileHandle = fs.createWriteStream(this.currentLogFile, { flags: 'a' });

    // Log audit system startup
    await this.logSecurityEvent(
      'system_event',
      'info',
      'audit-logger',
      'startup',
      'success',
      'Security audit system initialized'
    );
  }

  /**
   * Write event to log file
   */
  private async writeToLogFile(event: SecurityAuditEvent): Promise<void> {
    if (!this.logFileHandle) {
      return;
    }

    try {
      let logData = JSON.stringify(event) + '\n';

      // Encrypt if enabled
      if (this.config.encryptLogs && this.config.encryptionKey) {
        logData = this.encryptLogData(logData);
      }

      // Check file size and rotate if necessary
      const stats = await fs.stat(this.currentLogFile!);
      if (stats.size > this.config.maxLogFileSize) {
        await this.rotateLogFile();
      }

      this.logFileHandle.write(logData);

    } catch (error) {
      logger.error({ err: error }, 'Failed to write to audit log file');
    }
  }

  /**
   * Rotate log file
   */
  private async rotateLogFile(): Promise<void> {
    if (this.logFileHandle) {
      this.logFileHandle.end();
    }

    await this.initializeLogFile();
  }

  /**
   * Calculate event checksum for integrity
   */
  private calculateEventChecksum(event: SecurityAuditEvent): string {
    const eventData = {
      ...event,
      integrity: { ...event.integrity, checksum: '' } // Exclude checksum from calculation
    };

    const eventString = JSON.stringify(eventData);
    return crypto.createHash('sha256').update(eventString).digest('hex').substring(0, 8);
  }

  /**
   * Encrypt log data
   */
  private encryptLogData(data: string): string {
    if (!this.config.encryptionKey) {
      return data;
    }

    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.config.encryptionKey.substring(0, 32)), iv);
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return iv.toString('hex') + ':' + encrypted + '\n';
    } catch (error) {
      logger.error({ err: error }, 'Failed to encrypt log data');
      return data; // Return unencrypted if encryption fails
    }
  }

  /**
   * Initialize suspicious activity patterns
   */
  private initializeSuspiciousActivityPatterns(): void {
    const patterns: SuspiciousActivityPattern[] = [
      {
        id: 'multiple_failed_auth',
        name: 'Multiple Failed Authentication Attempts',
        description: 'Multiple failed authentication attempts from same source',
        pattern: {
          eventTypes: ['authentication'],
          timeWindow: 300000, // 5 minutes
          threshold: 5,
          conditions: { outcome: 'failure' }
        },
        severity: 'high',
        enabled: true
      },
      {
        id: 'rapid_data_access',
        name: 'Rapid Data Access',
        description: 'Unusually rapid data access patterns',
        pattern: {
          eventTypes: ['data_access'],
          timeWindow: 60000, // 1 minute
          threshold: 50,
          conditions: { outcome: 'success' }
        },
        severity: 'medium',
        enabled: true
      },
      {
        id: 'security_violations',
        name: 'Multiple Security Violations',
        description: 'Multiple security violations in short time',
        pattern: {
          eventTypes: ['security_violation'],
          timeWindow: 600000, // 10 minutes
          threshold: 3
        },
        severity: 'critical',
        enabled: true
      },
      {
        id: 'privilege_escalation',
        name: 'Potential Privilege Escalation',
        description: 'Attempts to access unauthorized resources',
        pattern: {
          eventTypes: ['authorization'],
          timeWindow: 300000, // 5 minutes
          threshold: 10,
          conditions: { outcome: 'blocked' }
        },
        severity: 'high',
        enabled: true
      }
    ];

    for (const pattern of patterns) {
      this.suspiciousPatterns.set(pattern.id, pattern);
    }
  }

  /**
   * Detect suspicious activity
   */
  private async detectSuspiciousActivity(newEvent: SecurityAuditEvent): Promise<void> {
    const now = Date.now();

    for (const pattern of this.suspiciousPatterns.values()) {
      if (!pattern.enabled || !pattern.pattern.eventTypes.includes(newEvent.eventType)) {
        continue;
      }

      // Get recent events matching pattern
      const recentEvents = this.auditEvents.filter(event => {
        const eventTime = event.timestamp.getTime();
        const withinTimeWindow = now - eventTime <= pattern.pattern.timeWindow;
        const matchesType = pattern.pattern.eventTypes.includes(event.eventType);

        let matchesConditions = true;
        if (pattern.pattern.conditions) {
          for (const [key, value] of Object.entries(pattern.pattern.conditions)) {
            if ((event as unknown as Record<string, unknown>)[key] !== value) {
              matchesConditions = false;
              break;
            }
          }
        }

        return withinTimeWindow && matchesType && matchesConditions;
      });

      // Check if threshold is exceeded
      if (recentEvents.length >= pattern.pattern.threshold) {
        await this.logSecurityEvent(
          'suspicious_activity',
          pattern.severity,
          'audit-logger',
          'pattern_detection',
          'warning',
          `Suspicious activity detected: ${pattern.description}`,
          {
            metadata: {
              patternId: pattern.id,
              patternName: pattern.name,
              eventCount: recentEvents.length,
              threshold: pattern.pattern.threshold,
              timeWindow: pattern.pattern.timeWindow,
              triggeringEvents: recentEvents.slice(-5).map(e => e.id) // Last 5 events
            }
          }
        );
      }
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceReport> {
    const reportId = `compliance_${Date.now()}`;

    // Filter events by date range
    const periodEvents = this.auditEvents.filter(event =>
      event.timestamp >= startDate && event.timestamp <= endDate
    );

    // Calculate summary statistics
    const eventsByType: Record<SecurityEventType, number> = {} as Record<SecurityEventType, number>;
    const eventsBySeverity: Record<SecurityEventSeverity, number> = {} as Record<SecurityEventSeverity, number>;

    for (const event of periodEvents) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
    }

    const violations = periodEvents.filter(event =>
      event.eventType === 'security_violation' ||
      event.eventType === 'suspicious_activity'
    );

    const recommendations = this.generateRecommendations(periodEvents, violations);

    const report: ComplianceReport = {
      id: reportId,
      generatedAt: new Date(),
      period: { start: startDate, end: endDate },
      summary: {
        totalEvents: periodEvents.length,
        eventsByType,
        eventsBySeverity,
        securityViolations: violations.length,
        suspiciousActivities: periodEvents.filter(e => e.eventType === 'suspicious_activity').length
      },
      violations,
      recommendations
    };

    // Log report generation
    await this.logSecurityEvent(
      'compliance_event',
      'info',
      'audit-logger',
      'report_generation',
      'success',
      `Compliance report generated for period ${startDate.toISOString()} to ${endDate.toISOString()}`,
      {
        metadata: {
          reportId,
          totalEvents: periodEvents.length,
          violations: violations.length
        }
      }
    );

    return report;
  }

  /**
   * Generate security recommendations
   */
  private generateRecommendations(
    events: SecurityAuditEvent[],
    violations: SecurityAuditEvent[]
  ): string[] {
    const recommendations: string[] = [];

    // Check for high number of authentication failures
    const authFailures = events.filter(e =>
      e.eventType === 'authentication' && e.outcome === 'failure'
    ).length;

    if (authFailures > 100) {
      recommendations.push('Consider implementing account lockout policies due to high authentication failure rate');
    }

    // Check for security violations
    if (violations.length > 10) {
      recommendations.push('Review and strengthen security policies due to multiple violations');
    }

    // Check for suspicious activity
    const suspiciousEvents = events.filter(e => e.eventType === 'suspicious_activity').length;
    if (suspiciousEvents > 5) {
      recommendations.push('Investigate suspicious activity patterns and consider additional monitoring');
    }

    // Check for critical events
    const criticalEvents = events.filter(e => e.severity === 'critical').length;
    if (criticalEvents > 0) {
      recommendations.push('Address all critical security events immediately');
    }

    return recommendations;
  }

  /**
   * Clean up old log files
   */
  private async cleanupOldLogFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.logDirectory);
      const logFiles = files
        .filter(file => file.startsWith('audit-') && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.config.logDirectory, file),
          stats: fs.statSync(path.join(this.config.logDirectory, file))
        }))
        .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

      // Remove files exceeding max count
      if (logFiles.length > this.config.maxLogFiles) {
        const filesToRemove = logFiles.slice(this.config.maxLogFiles);
        for (const file of filesToRemove) {
          await fs.remove(file.path);
          logger.debug({ file: file.name }, 'Removed old audit log file');
        }
      }

      // Remove files exceeding retention period
      const retentionCutoff = Date.now() - (this.config.retentionPeriodDays * 24 * 60 * 60 * 1000);
      for (const file of logFiles) {
        if (file.stats.mtime.getTime() < retentionCutoff) {
          await fs.remove(file.path);
          logger.debug({ file: file.name }, 'Removed expired audit log file');
        }
      }

    } catch (error) {
      logger.warn({ err: error }, 'Failed to cleanup old audit log files');
    }
  }

  /**
   * Get audit statistics
   */
  getAuditStatistics(): {
    totalEvents: number;
    eventsByType: Record<SecurityEventType, number>;
    eventsBySeverity: Record<SecurityEventSeverity, number>;
    recentViolations: SecurityAuditEvent[];
    suspiciousPatterns: number;
  } {
    const eventsByType: Record<SecurityEventType, number> = {} as Record<SecurityEventType, number>;
    const eventsBySeverity: Record<SecurityEventSeverity, number> = {} as Record<SecurityEventSeverity, number>;

    for (const event of this.auditEvents) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
    }

    const recentViolations = this.auditEvents
      .filter(event =>
        event.eventType === 'security_violation' ||
        event.eventType === 'suspicious_activity'
      )
      .slice(-20); // Last 20 violations

    return {
      totalEvents: this.auditEvents.length,
      eventsByType,
      eventsBySeverity,
      recentViolations,
      suspiciousPatterns: this.suspiciousPatterns.size
    };
  }

  /**
   * Shutdown audit logger
   */
  async shutdown(): Promise<void> {
    // Log shutdown event
    await this.logSecurityEvent(
      'system_event',
      'info',
      'audit-logger',
      'shutdown',
      'success',
      'Security audit system shutdown'
    );

    // Close log file handle
    if (this.logFileHandle) {
      this.logFileHandle.end();
    }

    this.auditEvents = [];
    this.suspiciousPatterns.clear();

    logger.info('Security Audit Logger shutdown');
  }
}

/**
 * Convenience function to log security event
 */
export async function logSecurityEvent(
  eventType: SecurityEventType,
  severity: SecurityEventSeverity,
  source: string,
  action: string,
  outcome: 'success' | 'failure' | 'blocked' | 'warning',
  description: string,
  options?: Parameters<SecurityAuditLogger['logSecurityEvent']>[6]
): Promise<void> {
  const auditLogger = SecurityAuditLogger.getInstance();
  return auditLogger.logSecurityEvent(eventType, severity, source, action, outcome, description, options);
}

/**
 * Convenience function to get audit logger instance
 */
export function getSecurityAuditLogger(): SecurityAuditLogger {
  return SecurityAuditLogger.getInstance();
}
