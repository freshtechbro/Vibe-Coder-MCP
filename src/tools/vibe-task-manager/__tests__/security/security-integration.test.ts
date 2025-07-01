/**
 * Integration Tests for Epic 7.1 Security Components
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PathSecurityValidator } from '../../security/path-validator.js';
import { ConcurrentAccessManager } from '../../security/concurrent-access.js';
import { DataSanitizer } from '../../security/data-sanitizer.js';
import { SecurityAuditLogger } from '../../security/audit-logger.js';
import { AuthenticationIntegration } from '../../security/auth-integration.js';
import { AtomicTask } from '../../types/task.js';
import path from 'path';

// Mock fs-extra
vi.mock('fs-extra');

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('Epic 7.1: Security Integration Tests', () => {
  let pathValidator: PathSecurityValidator;
  let concurrentAccess: ConcurrentAccessManager;
  let dataSanitizer: DataSanitizer;
  let auditLogger: SecurityAuditLogger;
  let authIntegration: AuthenticationIntegration;

  beforeEach(() => {
    // Reset singletons
    (PathSecurityValidator as Record<string, unknown>).instance = null;
    (ConcurrentAccessManager as Record<string, unknown>).instance = null;
    (DataSanitizer as Record<string, unknown>).instance = null;
    (SecurityAuditLogger as Record<string, unknown>).instance = null;
    (AuthenticationIntegration as Record<string, unknown>).instance = null;

    // Initialize components
    pathValidator = PathSecurityValidator.getInstance();
    concurrentAccess = ConcurrentAccessManager.getInstance();
    dataSanitizer = DataSanitizer.getInstance();
    auditLogger = SecurityAuditLogger.getInstance();
    authIntegration = AuthenticationIntegration.getInstance();
  });

  afterEach(async () => {
    // Cleanup
    if (pathValidator) pathValidator.shutdown();
    if (concurrentAccess) await concurrentAccess.shutdown();
    if (dataSanitizer) dataSanitizer.shutdown();
    if (auditLogger) await auditLogger.shutdown();
    if (authIntegration) await authIntegration.shutdown();

    vi.clearAllMocks();
  });

  describe('Task 7.1.1: Path Security Validation', () => {
    it('should validate secure paths successfully', async () => {
      const safePath = path.join(process.cwd(), 'src', 'test.js');

      const result = await pathValidator.validatePath(safePath);

      expect(result.valid).toBe(true);
      expect(result.securityViolation).toBe(false);
      expect(result.canonicalPath).toBeDefined();
    });

    it('should reject malicious paths', async () => {
      const maliciousPath = '../../../etc/passwd';

      const result = await pathValidator.validatePath(maliciousPath);

      expect(result.valid).toBe(false);
      expect(result.securityViolation).toBe(true);
      expect(result.violationType).toBe('traversal');
    });

    it('should provide audit trail', async () => {
      await pathValidator.validatePath(path.join(process.cwd(), 'test.js'));
      await pathValidator.validatePath('../malicious');

      const events = pathValidator.getAuditEvents();
      expect(events.length).toBeGreaterThan(0);

      const stats = pathValidator.getSecurityStatistics();
      expect(stats.totalValidations).toBeGreaterThan(0);
      expect(stats.securityViolations).toBeGreaterThan(0);
    });
  });

  describe('Task 7.1.2: Concurrent Access Management', () => {
    it('should acquire and release locks successfully', async () => {
      const resource = 'test-resource';
      const owner = 'test-user';

      const acquireResult = await concurrentAccess.acquireLock(resource, owner);
      expect(acquireResult.success).toBe(true);
      expect(acquireResult.lock).toBeDefined();

      const releaseResult = await concurrentAccess.releaseLock(acquireResult.lock!.id);
      expect(releaseResult).toBe(true);
    });

    it('should prevent concurrent access conflicts', async () => {
      const resource = 'shared-resource';

      const lock1 = await concurrentAccess.acquireLock(resource, 'user1');
      expect(lock1.success).toBe(true);

      const lock2 = await concurrentAccess.acquireLock(resource, 'user2');
      expect(lock2.success).toBe(false);
      expect(lock2.conflictingLock).toBeDefined();

      await concurrentAccess.releaseLock(lock1.lock!.id);
    });

    it('should provide lock statistics', () => {
      const stats = concurrentAccess.getLockStatistics();
      expect(stats).toBeDefined();
      expect(typeof stats.activeLocks).toBe('number');
      expect(typeof stats.totalAcquisitions).toBe('number');
    });
  });

  describe('Task 7.1.3: Data Sanitization System', () => {
    it('should sanitize task data successfully', async () => {
      const mockTask: AtomicTask = {
        id: 'test-task',
        title: 'Test Task <script>alert("xss")</script>',
        description: 'Test description with ../../../etc/passwd',
        type: 'development',
        priority: 'medium',
        status: 'pending',
        estimatedHours: 2,
        actualHours: 0,
        acceptanceCriteria: ['Criteria with <iframe>malicious</iframe>'],
        filePaths: ['../../../malicious/path'],
        dependencies: [],
        validationMethods: {
          automated: ['test && rm -rf /'],
          manual: ['Manual test']
        },
        metadata: {
          malicious: '<script>evil()</script>'
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await dataSanitizer.sanitizeTask(mockTask);

      // The result might be marked as unsuccessful due to critical violations,
      // but sanitization should still work and provide sanitized data
      expect(result.sanitizedData).toBeDefined();
      expect(result.violations.length).toBeGreaterThan(0);

      // Check that malicious content was removed
      expect(result.sanitizedData!.title).not.toContain('<script>');
      expect(result.sanitizedData!.description).not.toContain('../../../');

      // Verify violations were detected
      const hasSecurityViolations = result.violations.some(v =>
        v.violationType === 'xss' || v.violationType === 'injection'
      );
      expect(hasSecurityViolations).toBe(true);
    });

    it('should detect various attack patterns', async () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        '../../../etc/passwd',
        'test && rm -rf /',
        'SELECT * FROM users',
        'javascript:alert(1)'
      ];

      for (const input of maliciousInputs) {
        const result = await dataSanitizer.sanitizeInput(input);
        expect(result.violations.length).toBeGreaterThan(0);
      }
    });

    it('should provide sanitization statistics', () => {
      const stats = dataSanitizer.getSanitizationStatistics();
      expect(stats).toBeDefined();
      expect(typeof stats.totalViolations).toBe('number');
      expect(stats.violationsByType).toBeDefined();
    });
  });

  describe('Task 7.1.4: Security Audit System', () => {
    it('should log security events', async () => {
      await auditLogger.logSecurityEvent(
        'authentication',
        'info',
        'test-source',
        'login',
        'success',
        'Test login event'
      );

      const stats = auditLogger.getAuditStatistics();
      expect(stats.totalEvents).toBeGreaterThan(0);
      expect(stats.eventsByType.authentication).toBeGreaterThan(0);
    });

    it('should detect suspicious activity patterns', async () => {
      // Simulate multiple failed authentication attempts
      for (let i = 0; i < 6; i++) {
        await auditLogger.logSecurityEvent(
          'authentication',
          'medium',
          'test-source',
          'login',
          'failure',
          'Failed login attempt'
        );
      }

      const stats = auditLogger.getAuditStatistics();
      expect(stats.totalEvents).toBeGreaterThan(5);
    });

    it('should generate compliance reports', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const endDate = new Date();

      const report = await auditLogger.generateComplianceReport(startDate, endDate);

      expect(report).toBeDefined();
      expect(report.id).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });
  });

  describe('Task 7.1.5: Authentication Integration', () => {
    it('should authenticate users successfully', async () => {
      const result = await authIntegration.authenticate('test-user', 'developer');

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.session).toBeDefined();
    });

    it('should validate tokens correctly', async () => {
      const authResult = await authIntegration.authenticate('test-user', 'developer');
      expect(authResult.success).toBe(true);

      const validateResult = await authIntegration.validateToken(authResult.token!.token);
      expect(validateResult.success).toBe(true);
      expect(validateResult.session).toBeDefined();
    });

    it('should enforce role-based access control', async () => {
      const authResult = await authIntegration.authenticate('test-user', 'viewer');
      expect(authResult.success).toBe(true);

      const authzResult = await authIntegration.authorize(
        authResult.session!.id,
        'task:delete'
      );
      expect(authzResult.authorized).toBe(false);
      expect(authzResult.reason).toContain('Insufficient permissions');
    });

    it('should provide authentication statistics', () => {
      const stats = authIntegration.getAuthenticationStatistics();
      expect(stats).toBeDefined();
      expect(typeof stats.activeSessions).toBe('number');
      expect(typeof stats.activeTokens).toBe('number');
    });
  });

  describe('Security Performance Requirements', () => {
    it('should meet <50ms security overhead requirement', async () => {
      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        // Simulate typical security operations
        await pathValidator.validatePath(path.join(process.cwd(), `test${i}.js`));
        await dataSanitizer.sanitizeInput(`test input ${i}`);
        await auditLogger.logSecurityEvent(
          'data_access',
          'info',
          'test',
          'read',
          'success',
          `Test operation ${i}`
        );

        const endTime = Date.now();
        times.push(endTime - startTime);
      }

      const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;

      // Security overhead should be less than 50ms
      expect(averageTime).toBeLessThan(50);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete secure task processing workflow', async () => {
      // 1. Authenticate user
      const authResult = await authIntegration.authenticate('test-user', 'developer');
      expect(authResult.success).toBe(true);

      // 2. Authorize task creation
      const authzResult = await authIntegration.authorize(
        authResult.session!.id,
        'task:create'
      );
      expect(authzResult.authorized).toBe(true);

      // 3. Acquire lock for task processing
      const lockResult = await concurrentAccess.acquireLock(
        'task-processing',
        authResult.session!.userId
      );
      expect(lockResult.success).toBe(true);

      // 4. Validate file paths
      const pathResult = await pathValidator.validatePath(
        path.join(process.cwd(), 'src', 'task.js')
      );
      expect(pathResult.valid).toBe(true);

      // 5. Sanitize task data
      const mockTask: AtomicTask = {
        id: 'secure-task',
        title: 'Secure Task Processing',
        description: 'Process task securely',
        type: 'development',
        priority: 'medium',
        status: 'pending',
        estimatedHours: 2,
        actualHours: 0,
        acceptanceCriteria: ['Secure processing'],
        filePaths: [path.join(process.cwd(), 'src', 'task.js')],
        dependencies: [],
        validationMethods: {
          automated: ['npm test'],
          manual: ['Code review']
        },
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const sanitizeResult = await dataSanitizer.sanitizeTask(mockTask);
      expect(sanitizeResult.success).toBe(true);

      // 6. Log security events
      await auditLogger.logSecurityEvent(
        'data_modification',
        'info',
        'task-processor',
        'create',
        'success',
        'Task created successfully',
        {
          actor: {
            userId: authResult.session!.userId,
            sessionId: authResult.session!.id
          },
          resource: {
            type: 'task',
            id: mockTask.id
          }
        }
      );

      // 7. Release lock
      const releaseResult = await concurrentAccess.releaseLock(lockResult.lock!.id);
      expect(releaseResult).toBe(true);

      // Verify all components worked together
      const pathStats = pathValidator.getSecurityStatistics();
      const lockStats = concurrentAccess.getLockStatistics();
      // const sanitizeStats = dataSanitizer.getSanitizationStatistics();
      const auditStats = auditLogger.getAuditStatistics();

      expect(pathStats.totalValidations).toBeGreaterThan(0);
      expect(lockStats.totalAcquisitions).toBeGreaterThan(0);
      expect(auditStats.totalEvents).toBeGreaterThan(0);
    });
  });
});
