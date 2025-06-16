/**
 * Data Sanitization System for Vibe Task Manager
 *
 * Implements comprehensive input sanitization and validation including:
 * - Task input sanitization
 * - Command injection prevention
 * - XSS prevention for web interfaces
 * - SQL injection prevention (future-proofing)
 * - Input validation with detailed error messages
 */

import { AtomicTask } from '../types/task.js';
import { ValidationError } from '../../../utils/errors.js';
import logger from '../../../logger.js';

/**
 * Sanitization result
 */
export interface SanitizationResult<T> {
  success: boolean;
  sanitizedData?: T;
  originalData: T;
  violations: SanitizationViolation[];
  sanitizationTime: number; // ms
}

/**
 * Sanitization violation
 */
export interface SanitizationViolation {
  field: string;
  violationType: 'xss' | 'injection' | 'malformed' | 'length' | 'pattern' | 'encoding';
  originalValue: any;
  sanitizedValue?: any;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

/**
 * Sanitization configuration
 */
export interface SanitizationConfig {
  enableXssProtection: boolean;
  enableCommandInjectionProtection: boolean;
  enableSqlInjectionProtection: boolean;
  maxStringLength: number;
  maxArrayLength: number;
  maxObjectDepth: number;
  allowedHtmlTags: string[];
  allowedProtocols: string[];
  strictMode: boolean;
  logViolations: boolean;
}

/**
 * Data Sanitizer
 */
export class DataSanitizer {
  private static instance: DataSanitizer | null = null;
  private config: SanitizationConfig;
  private violations: SanitizationViolation[] = [];

  // Security patterns
  private readonly XSS_PATTERNS = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /onclick\s*=/gi,
    /onmouseover\s*=/gi,
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
    /<embed\b[^>]*>/gi,
    /<link\b[^>]*>/gi,
    /<meta\b[^>]*>/gi
  ];

  private readonly COMMAND_INJECTION_PATTERNS = [
    /[;&|`${}[\]]/g, // Removed () to allow function calls in descriptions
    /\.\.\//g,
    /~\//g,
    /\/etc\//g,
    /\/proc\//g,
    /\/sys\//g,
    /\/dev\//g,
    /\|\s*\w+/g, // Pipe commands
    /&&\s*\w+/g, // Command chaining
    /;\s*\w+/g, // Command separation
    /`[^`]*`/g, // Command substitution
    /\$\([^)]*\)/g // Command substitution
  ];

  // Whitelist for common development terms (following existing patterns)
  private readonly DEVELOPMENT_WHITELIST = [
    'e.g.', 'i.e.', 'etc.', 'API', 'UI', 'UX', 'DB', 'SQL', 'HTTP', 'HTTPS',
    'JSON', 'XML', 'CSS', 'HTML', 'JS', 'TS', 'React', 'Vue', 'Angular',
    'Node.js', 'Express', 'MongoDB', 'PostgreSQL', 'MySQL', 'Redis',
    'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'CI/CD', 'REST', 'GraphQL'
  ];

  private readonly SQL_INJECTION_PATTERNS = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /('|(\\')|(;)|(--)|(\s)|(\/\*)|(\*\/))/gi,
    /(\b(OR|AND)\b.*?[=<>])/gi,
    /(\b(LIKE)\b.*?['"])/gi,
    /(INFORMATION_SCHEMA|SYSOBJECTS|SYSCOLUMNS)/gi
  ];

  private readonly ENCODING_PATTERNS = [
    /%[0-9a-fA-F]{2}/g, // URL encoding
    /&#x?[0-9a-fA-F]+;/g, // HTML entity encoding
    /\\u[0-9a-fA-F]{4}/g, // Unicode encoding
    /\\x[0-9a-fA-F]{2}/g // Hex encoding
  ];

  private constructor(config?: Partial<SanitizationConfig>) {
    this.config = {
      enableXssProtection: true,
      enableCommandInjectionProtection: true,
      enableSqlInjectionProtection: true,
      maxStringLength: 10000,
      maxArrayLength: 1000,
      maxObjectDepth: 10,
      allowedHtmlTags: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
      allowedProtocols: ['http:', 'https:', 'mailto:'],
      strictMode: true,
      logViolations: true,
      ...config
    };

    logger.info({ config: this.config }, 'Data Sanitizer initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<SanitizationConfig>): DataSanitizer {
    if (!DataSanitizer.instance) {
      DataSanitizer.instance = new DataSanitizer(config);
    }
    return DataSanitizer.instance;
  }

  /**
   * Sanitize atomic task data
   */
  async sanitizeTask(task: AtomicTask): Promise<SanitizationResult<AtomicTask>> {
    const startTime = Date.now();
    const violations: SanitizationViolation[] = [];

    try {
      const sanitizedTask: AtomicTask = {
        ...task,
        title: this.sanitizeString(task.title, 'title', violations),
        description: this.sanitizeString(task.description, 'description', violations),
        acceptanceCriteria: task.acceptanceCriteria.map((criteria, index) =>
          this.sanitizeString(criteria, `acceptanceCriteria[${index}]`, violations)
        ),
        filePaths: task.filePaths.map((filePath, index) =>
          this.sanitizeFilePath(filePath, `filePaths[${index}]`, violations)
        ),
        dependencies: this.sanitizeArray(task.dependencies, 'dependencies', violations),
        validationMethods: {
          automated: task.validationMethods.automated.map((method, index) =>
            this.sanitizeString(method, `validationMethods.automated[${index}]`, violations)
          ),
          manual: task.validationMethods.manual.map((method, index) =>
            this.sanitizeString(method, `validationMethods.manual[${index}]`, violations)
          )
        },
        metadata: this.sanitizeObject(task.metadata, 'metadata', violations, 0)
      };

      const sanitizationTime = Date.now() - startTime;

      if (violations.length > 0 && this.config.logViolations) {
        logger.warn({
          taskId: task.id,
          violations: violations.length,
          violationTypes: violations.map(v => v.violationType)
        }, 'Task sanitization violations detected');
      }

      return {
        success: violations.filter(v => v.severity === 'critical').length === 0,
        sanitizedData: sanitizedTask,
        originalData: task,
        violations,
        sanitizationTime
      };

    } catch (error) {
      logger.error({ err: error, taskId: task.id }, 'Task sanitization failed');

      return {
        success: false,
        originalData: task,
        violations: [{
          field: 'task',
          violationType: 'malformed',
          originalValue: task,
          severity: 'critical',
          description: `Sanitization error: ${error instanceof Error ? error.message : String(error)}`
        }],
        sanitizationTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check if field is a system identifier that should not be sanitized
   */
  private isSystemIdentifier(fieldName: string): boolean {
    const systemIdFields = [
      'id', 'taskId', 'epicId', 'projectId', 'dependencyId',
      'createdBy', 'updatedBy', 'assignedAgent'
    ];

    // Check exact field name or if it's a nested ID field
    return systemIdFields.includes(fieldName) ||
           systemIdFields.some(field => fieldName.endsWith(field)) ||
           fieldName.includes('.id') ||
           fieldName.includes('Id');
  }

  /**
   * Sanitize string input with development-friendly whitelist
   */
  private sanitizeString(
    input: string,
    fieldName: string,
    violations: SanitizationViolation[]
  ): string {
    if (!input || typeof input !== 'string') {
      return input;
    }

    // Skip sanitization for system identifiers
    if (this.isSystemIdentifier(fieldName)) {
      return input;
    }

    let sanitized = input;

    // Length validation
    if (sanitized.length > this.config.maxStringLength) {
      violations.push({
        field: fieldName,
        violationType: 'length',
        originalValue: input,
        sanitizedValue: sanitized.substring(0, this.config.maxStringLength),
        severity: 'medium',
        description: `String exceeds maximum length of ${this.config.maxStringLength}`
      });
      sanitized = sanitized.substring(0, this.config.maxStringLength);
    }

    // XSS protection (skip for whitelisted terms)
    if (this.config.enableXssProtection && !this.isWhitelistedContent(sanitized)) {
      const originalSanitized = sanitized;
      sanitized = this.removeXssPatterns(sanitized);

      if (sanitized !== originalSanitized) {
        violations.push({
          field: fieldName,
          violationType: 'xss',
          originalValue: originalSanitized,
          sanitizedValue: sanitized,
          severity: 'high',
          description: 'Potential XSS patterns removed'
        });
      }
    }

    // Command injection protection (skip for whitelisted terms)
    if (this.config.enableCommandInjectionProtection && !this.isWhitelistedContent(sanitized)) {
      const originalSanitized = sanitized;
      sanitized = this.removeCommandInjectionPatterns(sanitized);

      if (sanitized !== originalSanitized) {
        violations.push({
          field: fieldName,
          violationType: 'injection',
          originalValue: originalSanitized,
          sanitizedValue: sanitized,
          severity: 'critical',
          description: 'Potential command injection patterns removed'
        });
      }
    }

    // SQL injection protection (skip for whitelisted terms)
    if (this.config.enableSqlInjectionProtection && !this.isWhitelistedContent(sanitized)) {
      const originalSanitized = sanitized;
      sanitized = this.removeSqlInjectionPatterns(sanitized);

      if (sanitized !== originalSanitized) {
        violations.push({
          field: fieldName,
          violationType: 'injection',
          originalValue: originalSanitized,
          sanitizedValue: sanitized,
          severity: 'high',
          description: 'Potential SQL injection patterns removed'
        });
      }
    }

    // Encoding validation (skip for whitelisted terms)
    if (!this.isWhitelistedContent(sanitized)) {
      const encodingViolations = this.detectEncodingAttacks(sanitized);
      if (encodingViolations.length > 0) {
        violations.push({
          field: fieldName,
          violationType: 'encoding',
          originalValue: input,
          sanitizedValue: sanitized,
          severity: 'medium',
          description: 'Suspicious encoding patterns detected'
        });
      }
    }

    return sanitized;
  }

  /**
   * Check if content contains whitelisted development terms
   */
  private isWhitelistedContent(content: string): boolean {
    const lowerContent = content.toLowerCase();
    return this.DEVELOPMENT_WHITELIST.some(term =>
      lowerContent.includes(term.toLowerCase())
    );
  }

  /**
   * Sanitize file path
   */
  private sanitizeFilePath(
    filePath: string,
    fieldName: string,
    violations: SanitizationViolation[]
  ): string {
    if (!filePath || typeof filePath !== 'string') {
      return filePath;
    }

    let sanitized = filePath;

    // Remove dangerous path patterns
    const dangerousPatterns = [
      /\.\.\//g,
      /~\//g,
      /\/etc\//g,
      /\/proc\//g,
      /\/sys\//g,
      /\/dev\//g,
      /\0/g // Null bytes
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sanitized)) {
        violations.push({
          field: fieldName,
          violationType: 'injection',
          originalValue: filePath,
          sanitizedValue: sanitized.replace(pattern, ''),
          severity: 'critical',
          description: 'Dangerous path pattern detected'
        });
        sanitized = sanitized.replace(pattern, '');
      }
    }

    return sanitized;
  }

  /**
   * Sanitize array
   */
  private sanitizeArray<T>(
    array: T[],
    fieldName: string,
    violations: SanitizationViolation[]
  ): T[] {
    if (!Array.isArray(array)) {
      return array;
    }

    if (array.length > this.config.maxArrayLength) {
      violations.push({
        field: fieldName,
        violationType: 'length',
        originalValue: array,
        sanitizedValue: array.slice(0, this.config.maxArrayLength),
        severity: 'medium',
        description: `Array exceeds maximum length of ${this.config.maxArrayLength}`
      });
      return array.slice(0, this.config.maxArrayLength);
    }

    return array;
  }

  /**
   * Sanitize object recursively
   */
  private sanitizeObject(
    obj: any,
    fieldName: string,
    violations: SanitizationViolation[],
    depth: number
  ): any {
    if (depth > this.config.maxObjectDepth) {
      violations.push({
        field: fieldName,
        violationType: 'pattern',
        originalValue: obj,
        severity: 'medium',
        description: `Object depth exceeds maximum of ${this.config.maxObjectDepth}`
      });
      return {};
    }

    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return this.sanitizeArray(obj, fieldName, violations);
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Don't sanitize object keys as they are typically property names
      const sanitizedKey = key;

      if (typeof value === 'string') {
        sanitized[sanitizedKey] = this.sanitizeString(value, `${fieldName}.${key}`, violations);
      } else if (typeof value === 'object') {
        sanitized[sanitizedKey] = this.sanitizeObject(value, `${fieldName}.${key}`, violations, depth + 1);
      } else {
        sanitized[sanitizedKey] = value;
      }
    }

    return sanitized;
  }

  /**
   * Remove XSS patterns
   */
  private removeXssPatterns(input: string): string {
    let sanitized = input;

    for (const pattern of this.XSS_PATTERNS) {
      sanitized = sanitized.replace(pattern, '');
    }

    // Remove dangerous attributes
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Validate protocols in URLs
    sanitized = sanitized.replace(/href\s*=\s*["']([^"']*)["']/gi, (match, url) => {
      const protocol = url.split(':')[0].toLowerCase() + ':';
      if (this.config.allowedProtocols.includes(protocol)) {
        return match;
      }
      return '';
    });

    return sanitized;
  }

  /**
   * Remove command injection patterns
   */
  private removeCommandInjectionPatterns(input: string): string {
    let sanitized = input;

    for (const pattern of this.COMMAND_INJECTION_PATTERNS) {
      sanitized = sanitized.replace(pattern, '');
    }

    return sanitized;
  }

  /**
   * Remove SQL injection patterns
   */
  private removeSqlInjectionPatterns(input: string): string {
    let sanitized = input;

    for (const pattern of this.SQL_INJECTION_PATTERNS) {
      sanitized = sanitized.replace(pattern, '');
    }

    return sanitized;
  }

  /**
   * Detect encoding attacks
   */
  private detectEncodingAttacks(input: string): string[] {
    const violations: string[] = [];

    for (const pattern of this.ENCODING_PATTERNS) {
      if (pattern.test(input)) {
        violations.push(pattern.source);
      }
    }

    return violations;
  }

  /**
   * Sanitize generic input
   */
  async sanitizeInput<T>(
    input: T,
    fieldName: string = 'input'
  ): Promise<SanitizationResult<T>> {
    const startTime = Date.now();
    const violations: SanitizationViolation[] = [];

    try {
      let sanitized: T;

      if (typeof input === 'string') {
        sanitized = this.sanitizeString(input, fieldName, violations) as T;
      } else if (Array.isArray(input)) {
        sanitized = this.sanitizeArray(input, fieldName, violations) as T;
      } else if (typeof input === 'object' && input !== null) {
        sanitized = this.sanitizeObject(input, fieldName, violations, 0) as T;
      } else {
        sanitized = input;
      }

      return {
        success: violations.filter(v => v.severity === 'critical').length === 0,
        sanitizedData: sanitized,
        originalData: input,
        violations,
        sanitizationTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        originalData: input,
        violations: [{
          field: fieldName,
          violationType: 'malformed',
          originalValue: input,
          severity: 'critical',
          description: `Sanitization error: ${error instanceof Error ? error.message : String(error)}`
        }],
        sanitizationTime: Date.now() - startTime
      };
    }
  }

  /**
   * Get sanitization statistics
   */
  getSanitizationStatistics(): {
    totalViolations: number;
    violationsByType: Record<string, number>;
    violationsBySeverity: Record<string, number>;
    recentViolations: SanitizationViolation[];
  } {
    const violationsByType: Record<string, number> = {};
    const violationsBySeverity: Record<string, number> = {};

    for (const violation of this.violations) {
      violationsByType[violation.violationType] = (violationsByType[violation.violationType] || 0) + 1;
      violationsBySeverity[violation.severity] = (violationsBySeverity[violation.severity] || 0) + 1;
    }

    return {
      totalViolations: this.violations.length,
      violationsByType,
      violationsBySeverity,
      recentViolations: this.violations.slice(-100) // Last 100 violations
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SanitizationConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info({ config: this.config }, 'Data sanitizer configuration updated');
  }

  /**
   * Clear violation history
   */
  clearViolationHistory(): void {
    this.violations = [];
    logger.info('Data sanitizer violation history cleared');
  }

  /**
   * Shutdown sanitizer
   */
  shutdown(): void {
    this.violations = [];
    logger.info('Data Sanitizer shutdown');
  }
}

/**
 * Convenience function to sanitize task
 */
export async function sanitizeTask(task: AtomicTask): Promise<SanitizationResult<AtomicTask>> {
  const sanitizer = DataSanitizer.getInstance();
  return sanitizer.sanitizeTask(task);
}

/**
 * Convenience function to sanitize input
 */
export async function sanitizeInput<T>(input: T, fieldName?: string): Promise<SanitizationResult<T>> {
  const sanitizer = DataSanitizer.getInstance();
  return sanitizer.sanitizeInput(input, fieldName);
}

/**
 * Convenience function to get data sanitizer instance
 */
export function getDataSanitizer(): DataSanitizer {
  return DataSanitizer.getInstance();
}
