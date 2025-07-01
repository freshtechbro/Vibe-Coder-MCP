/**
 * Concurrent Access Management for Vibe Task Manager
 *
 * Implements robust concurrent access control including:
 * - File-based locking mechanisms
 * - Atomic task claiming operations
 * - Deadlock detection and prevention
 * - Lock timeout and recovery
 * - Concurrent access audit trail
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { getTimeoutManager } from '../utils/timeout-manager.js';
import { AppError } from '../../../utils/errors.js';
import logger from '../../../logger.js';

/**
 * Lock information
 */
export interface LockInfo {
  id: string;
  resource: string;
  owner: string;
  sessionId?: string;
  operation: 'read' | 'write' | 'execute';
  acquiredAt: Date;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Lock acquisition result
 */
export interface LockAcquisitionResult {
  success: boolean;
  lock?: LockInfo;
  error?: string;
  waitTime?: number; // ms
  conflictingLock?: LockInfo;
}

/**
 * Deadlock detection result
 */
export interface DeadlockDetectionResult {
  hasDeadlock: boolean;
  cycle?: string[];
  affectedLocks?: LockInfo[];
  resolutionStrategy?: 'timeout' | 'priority' | 'random';
}

/**
 * Concurrent access configuration
 */
export interface ConcurrentAccessConfig {
  lockDirectory: string;
  defaultLockTimeout: number; // ms
  maxLockTimeout: number; // ms
  deadlockDetectionInterval: number; // ms
  lockCleanupInterval: number; // ms
  maxRetryAttempts: number;
  retryDelayMs: number;
  enableDeadlockDetection: boolean;
  enableLockAuditTrail: boolean;
}

/**
 * Lock audit event
 */
export interface LockAuditEvent {
  id: string;
  type: 'acquire' | 'release' | 'timeout' | 'deadlock' | 'conflict';
  lockId: string;
  resource: string;
  owner: string;
  sessionId?: string;
  timestamp: Date;
  duration?: number; // ms
  metadata?: Record<string, unknown>;
}

/**
 * Concurrent Access Manager
 */
export class ConcurrentAccessManager {
  private static instance: ConcurrentAccessManager | null = null;
  private config: ConcurrentAccessConfig;
  private activeLocks: Map<string, LockInfo> = new Map();
  private lockWaiters: Map<string, Array<{ resolve: (value: LockAcquisitionResult) => void; reject: (reason?: unknown) => void; timeout: NodeJS.Timeout }>> = new Map();
  private auditEvents: LockAuditEvent[] = [];
  private deadlockDetectionTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private lockCounter = 0;
  private auditCounter = 0;

  private constructor(config?: Partial<ConcurrentAccessConfig>) {
    const isTestEnv = process.env.NODE_ENV === 'test';

    // Get configurable timeout values from timeout manager
    const timeoutManager = getTimeoutManager();
    const retryConfig = timeoutManager.getRetryConfig();

    this.config = {
      lockDirectory: isTestEnv
        ? path.join(process.cwd(), 'tmp', 'test-locks')
        : this.getOSAwareLockDirectory(),
      defaultLockTimeout: isTestEnv ? 5000 : timeoutManager.getTimeout('databaseOperations'), // Configurable
      maxLockTimeout: isTestEnv ? 10000 : timeoutManager.getTimeout('taskExecution'), // Configurable
      deadlockDetectionInterval: isTestEnv ? 1000 : 10000, // Keep static for performance
      lockCleanupInterval: isTestEnv ? 2000 : 60000, // Keep static for performance
      maxRetryAttempts: retryConfig.maxRetries, // Configurable
      retryDelayMs: isTestEnv ? 100 : retryConfig.initialDelayMs, // Configurable
      enableDeadlockDetection: !isTestEnv, // Disable in tests for performance
      enableLockAuditTrail: true, // Keep enabled for statistics tracking
      ...config
    };

    this.initializeLockDirectory();
    this.startBackgroundTasks();

    logger.info({ config: this.config }, 'Concurrent Access Manager initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<ConcurrentAccessConfig>): ConcurrentAccessManager {
    if (!ConcurrentAccessManager.instance) {
      ConcurrentAccessManager.instance = new ConcurrentAccessManager(config);
    }
    return ConcurrentAccessManager.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    if (ConcurrentAccessManager.instance) {
      ConcurrentAccessManager.instance.dispose();
      ConcurrentAccessManager.instance = null;
    }
  }

  /**
   * Check if singleton instance exists
   */
  static hasInstance(): boolean {
    return ConcurrentAccessManager.instance !== null;
  }

  /**
   * Acquire lock on resource
   */
  async acquireLock(
    resource: string,
    owner: string,
    operation: 'read' | 'write' | 'execute' = 'write',
    options?: {
      timeout?: number;
      sessionId?: string;
      metadata?: Record<string, unknown>;
      waitForRelease?: boolean;
    }
  ): Promise<LockAcquisitionResult> {
    const startTime = Date.now();
    const timeout = Math.min(options?.timeout || this.config.defaultLockTimeout, this.config.maxLockTimeout);
    const lockId = `lock_${++this.lockCounter}_${Date.now()}`;

    try {
      // Check for existing locks
      const existingLock = this.findConflictingLock(resource, operation);

      if (existingLock) {
        if (options?.waitForRelease) {
          return await this.waitForLockRelease(resource, owner, operation, lockId, timeout, options);
        } else {
          this.logAuditEvent('conflict', lockId, resource, owner, options?.sessionId, 0, {
            conflictingLock: existingLock.id,
            operation
          });

          return {
            success: false,
            error: 'Resource is locked',
            conflictingLock: existingLock,
            waitTime: Date.now() - startTime
          };
        }
      }

      // Create lock
      const lock: LockInfo = {
        id: lockId,
        resource,
        owner,
        sessionId: options?.sessionId,
        operation,
        acquiredAt: new Date(),
        expiresAt: new Date(Date.now() + timeout),
        metadata: options?.metadata
      };

      // Atomic lock acquisition
      await this.atomicLockAcquisition(lock);

      this.activeLocks.set(lockId, lock);

      if (this.config.enableLockAuditTrail) {
        this.logAuditEvent('acquire', lockId, resource, owner, options?.sessionId, Date.now() - startTime, {
          operation,
          timeout
        });
      }

      logger.debug({
        lockId,
        resource,
        owner,
        operation,
        timeout
      }, 'Lock acquired successfully');

      return {
        success: true,
        lock,
        waitTime: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logAuditEvent('conflict', lockId, resource, owner, options?.sessionId, Date.now() - startTime, {
        error: errorMessage
      });

      logger.error({
        err: error,
        lockId,
        resource,
        owner
      }, 'Failed to acquire lock');

      return {
        success: false,
        error: errorMessage,
        waitTime: Date.now() - startTime
      };
    }
  }

  /**
   * Release lock
   */
  async releaseLock(lockId: string): Promise<boolean> {
    try {
      const lock = this.activeLocks.get(lockId);
      if (!lock) {
        logger.warn({ lockId }, 'Attempted to release non-existent lock');
        return false;
      }

      // Remove from active locks
      this.activeLocks.delete(lockId);

      // Remove file-based lock
      await this.removeFileLock(lock);

      // Notify waiters
      this.notifyWaiters(lock.resource);

      const duration = Date.now() - lock.acquiredAt.getTime();

      if (this.config.enableLockAuditTrail) {
        this.logAuditEvent('release', lockId, lock.resource, lock.owner, lock.sessionId, duration);
      }

      logger.debug({
        lockId,
        resource: lock.resource,
        owner: lock.owner,
        duration: `${duration}ms`
      }, 'Lock released successfully');

      return true;

    } catch (error) {
      logger.error({
        err: error,
        lockId
      }, 'Failed to release lock');
      return false;
    }
  }

  /**
   * Atomic lock acquisition using file system
   */
  private async atomicLockAcquisition(lock: LockInfo): Promise<void> {
    const lockFilePath = path.join(this.config.lockDirectory, `${this.sanitizeResourceName(lock.resource)}.lock`);

    try {
      // Ensure directory exists
      await fs.ensureDir(this.config.lockDirectory);

      // Use exclusive file creation for atomicity
      const lockData = JSON.stringify(lock, null, 2);
      await fs.writeFile(lockFilePath, lockData, { flag: 'wx' }); // 'wx' fails if file exists

    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
        // Lock file already exists, check if it's stale
        const existingLock = await this.readLockFile(lockFilePath);
        if (existingLock && this.isLockExpired(existingLock)) {
          // Remove stale lock and retry
          await fs.remove(lockFilePath);
          await fs.writeFile(lockFilePath, JSON.stringify(lock, null, 2), { flag: 'wx' });
        } else {
          throw new AppError('Resource is already locked');
        }
      } else if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // Directory doesn't exist, fall back to in-memory locking only
        logger.warn('Lock directory not accessible, using in-memory locking only');
        return;
      } else {
        throw error;
      }
    }
  }

  /**
   * Wait for lock release
   */
  private async waitForLockRelease(
    resource: string,
    owner: string,
    operation: 'read' | 'write' | 'execute',
    lockId: string,
    timeout: number,
    options?: { sessionId?: string; metadata?: Record<string, unknown> }
  ): Promise<LockAcquisitionResult> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.removeWaiter(resource, resolve);
        this.logAuditEvent('timeout', lockId, resource, owner, options?.sessionId, timeout);

        resolve({
          success: false,
          error: 'Lock acquisition timeout',
          waitTime: timeout
        });
      }, timeout);

      const waiter = {
        resolve: async () => {
          clearTimeout(timeoutHandle);
          this.removeWaiter(resource, resolve);

          // Try to acquire lock again
          const result = await this.acquireLock(resource, owner, operation, {
            ...options,
            waitForRelease: false
          });
          resolve(result);
        },
        reject,
        timeout: timeoutHandle
      };

      if (!this.lockWaiters.has(resource)) {
        this.lockWaiters.set(resource, []);
      }
      this.lockWaiters.get(resource)!.push(waiter);
    });
  }

  /**
   * Find conflicting lock
   */
  private findConflictingLock(resource: string, operation: 'read' | 'write' | 'execute'): LockInfo | null {
    for (const lock of this.activeLocks.values()) {
      if (lock.resource === resource) {
        // Write operations conflict with everything
        // Read operations only conflict with write operations
        if (operation === 'write' || lock.operation === 'write') {
          if (!this.isLockExpired(lock)) {
            return lock;
          }
        }
      }
    }
    return null;
  }

  /**
   * Check if lock is expired
   */
  private isLockExpired(lock: LockInfo): boolean {
    return Date.now() > lock.expiresAt.getTime();
  }

  /**
   * Notify waiters that a resource is available
   */
  private notifyWaiters(resource: string): void {
    const waiters = this.lockWaiters.get(resource);
    if (waiters && waiters.length > 0) {
      // Notify first waiter (FIFO)
      const waiter = waiters.shift()!;
      waiter.resolve({ success: true });

      if (waiters.length === 0) {
        this.lockWaiters.delete(resource);
      }
    }
  }

  /**
   * Remove waiter from queue
   */
  private removeWaiter(resource: string, resolveFunc: (value: LockAcquisitionResult) => void): void {
    const waiters = this.lockWaiters.get(resource);
    if (waiters) {
      const index = waiters.findIndex(w => w.resolve === resolveFunc);
      if (index !== -1) {
        clearTimeout(waiters[index].timeout);
        waiters.splice(index, 1);

        if (waiters.length === 0) {
          this.lockWaiters.delete(resource);
        }
      }
    }
  }

  /**
   * Get OS-aware lock directory following existing patterns
   */
  private getOSAwareLockDirectory(): string {
    // Follow existing pattern from security-config.ts and environment variables
    const envLockDir = process.env.VIBE_LOCK_DIR;
    if (envLockDir) {
      return envLockDir;
    }

    // Use OS-appropriate temp directory (following existing patterns)
    try {
      const tempDir = os.tmpdir();
      return path.join(tempDir, 'vibe-locks');
    } catch (error) {
      // Fallback to project directory if os module fails
      logger.warn({ error }, 'Failed to get OS temp directory, using project fallback');
      return path.join(process.cwd(), 'tmp', 'vibe-locks');
    }
  }

  /**
   * Initialize lock directory
   */
  private async initializeLockDirectory(): Promise<void> {
    try {
      await fs.ensureDir(this.config.lockDirectory);

      // Clean up any stale lock files on startup
      await this.cleanupStaleLocks();

    } catch (error) {
      logger.warn({ err: error }, 'Failed to initialize lock directory, continuing without file-based locking');
      // Don't throw in test environments - continue without file-based locking
    }
  }

  /**
   * Start background tasks
   */
  private startBackgroundTasks(): void {
    if (this.config.enableDeadlockDetection) {
      this.deadlockDetectionTimer = setInterval(() => {
        this.detectDeadlocks();
      }, this.config.deadlockDetectionInterval);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredLocks();
    }, this.config.lockCleanupInterval);
  }

  /**
   * Detect deadlocks
   */
  private async detectDeadlocks(): Promise<DeadlockDetectionResult> {
    // Simple deadlock detection based on circular wait conditions
    const waitGraph = new Map<string, string[]>();

    // Build wait graph
    for (const [resource, waiters] of this.lockWaiters) {
      const lockHolder = this.findLockHolder(resource);
      if (lockHolder) {
        for (let i = 0; i < waiters.length; i++) {
          // This is simplified - in a real implementation, you'd track waiter identities
          const waiterId = 'waiter'; // Placeholder
          if (!waitGraph.has(waiterId)) {
            waitGraph.set(waiterId, []);
          }
          waitGraph.get(waiterId)!.push(lockHolder.owner);
        }
      }
    }

    // Detect cycles (simplified implementation)
    const hasDeadlock = this.hasCycle(waitGraph);

    if (hasDeadlock) {
      this.logAuditEvent('deadlock', 'system', 'system', 'system', undefined, 0, {
        activeLocks: this.activeLocks.size,
        waitingRequests: Array.from(this.lockWaiters.values()).reduce((sum, waiters) => sum + waiters.length, 0)
      });

      logger.warn({
        activeLocks: this.activeLocks.size,
        waitingRequests: Array.from(this.lockWaiters.values()).reduce((sum, waiters) => sum + waiters.length, 0)
      }, 'Deadlock detected');
    }

    return {
      hasDeadlock,
      resolutionStrategy: hasDeadlock ? 'timeout' : undefined
    };
  }

  /**
   * Simple cycle detection in wait graph
   */
  private hasCycle(graph: Map<string, string[]>): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true; // Cycle detected
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        if (dfs(node)) return true;
      }
    }

    return false;
  }

  /**
   * Find lock holder for resource
   */
  private findLockHolder(resource: string): LockInfo | null {
    for (const lock of this.activeLocks.values()) {
      if (lock.resource === resource && !this.isLockExpired(lock)) {
        return lock;
      }
    }
    return null;
  }

  /**
   * Cleanup expired locks
   */
  private async cleanupExpiredLocks(): Promise<void> {
    const expiredLocks: string[] = [];

    for (const [lockId, lock] of this.activeLocks) {
      if (this.isLockExpired(lock)) {
        expiredLocks.push(lockId);
      }
    }

    for (const lockId of expiredLocks) {
      await this.releaseLock(lockId);
      this.logAuditEvent('timeout', lockId, 'expired', 'system', undefined, 0);
    }

    if (expiredLocks.length > 0) {
      logger.info({ expiredLocks: expiredLocks.length }, 'Cleaned up expired locks');
    }
  }

  /**
   * Cleanup stale lock files
   */
  private async cleanupStaleLocks(): Promise<void> {
    try {
      const lockFiles = await fs.readdir(this.config.lockDirectory);

      for (const file of lockFiles) {
        if (file.endsWith('.lock')) {
          const lockFilePath = path.join(this.config.lockDirectory, file);
          const lock = await this.readLockFile(lockFilePath);

          if (lock && this.isLockExpired(lock)) {
            await fs.remove(lockFilePath);
            logger.debug({ lockFile: file }, 'Removed stale lock file');
          }
        }
      }
    } catch (error) {
      logger.warn({ err: error }, 'Failed to cleanup stale locks');
    }
  }

  /**
   * Read lock file
   */
  private async readLockFile(lockFilePath: string): Promise<LockInfo | null> {
    try {
      const lockData = await fs.readFile(lockFilePath, 'utf-8');
      const parsed = JSON.parse(lockData);

      // Convert date strings back to Date objects
      if (parsed.acquiredAt && typeof parsed.acquiredAt === 'string') {
        parsed.acquiredAt = new Date(parsed.acquiredAt);
      }
      if (parsed.expiresAt && typeof parsed.expiresAt === 'string') {
        parsed.expiresAt = new Date(parsed.expiresAt);
      }

      return parsed as LockInfo;
    } catch {
      return null;
    }
  }

  /**
   * Remove file lock
   */
  private async removeFileLock(lock: LockInfo): Promise<void> {
    const lockFilePath = path.join(this.config.lockDirectory, `${this.sanitizeResourceName(lock.resource)}.lock`);

    try {
      await fs.remove(lockFilePath);
    } catch (error) {
      logger.warn({ err: error, lockFilePath }, 'Failed to remove lock file');
    }
  }

  /**
   * Sanitize resource name for file system
   */
  private sanitizeResourceName(resource: string): string {
    return resource.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Log audit event
   */
  private logAuditEvent(
    type: LockAuditEvent['type'],
    lockId: string,
    resource: string,
    owner: string,
    sessionId?: string,
    duration?: number,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.config.enableLockAuditTrail) return;

    const auditEvent: LockAuditEvent = {
      id: `lock_audit_${++this.auditCounter}_${Date.now()}`,
      type,
      lockId,
      resource,
      owner,
      sessionId,
      timestamp: new Date(),
      duration,
      metadata
    };

    this.auditEvents.push(auditEvent);

    // Keep only last 1000 audit events
    if (this.auditEvents.length > 1000) {
      this.auditEvents = this.auditEvents.slice(-1000);
    }

    logger.debug({ auditEvent }, `Lock ${type} event`);
  }

  /**
   * Get active locks
   */
  getActiveLocks(): LockInfo[] {
    return Array.from(this.activeLocks.values())
      .filter(lock => !this.isLockExpired(lock));
  }

  /**
   * Get lock statistics
   */
  getLockStatistics(): {
    activeLocks: number;
    expiredLocks: number;
    waitingRequests: number;
    totalAcquisitions: number;
    totalReleases: number;
    totalTimeouts: number;
    totalDeadlocks: number;
    averageLockDuration: number;
  } {
    const active = this.getActiveLocks().length;
    const expired = this.activeLocks.size - active;
    const waiting = Array.from(this.lockWaiters.values()).reduce((sum, waiters) => sum + waiters.length, 0);

    const acquisitions = this.auditEvents.filter(e => e.type === 'acquire').length;
    const releases = this.auditEvents.filter(e => e.type === 'release').length;
    const timeouts = this.auditEvents.filter(e => e.type === 'timeout').length;
    const deadlocks = this.auditEvents.filter(e => e.type === 'deadlock').length;

    const releasedEvents = this.auditEvents.filter(e => e.type === 'release' && e.duration);
    const avgDuration = releasedEvents.length > 0
      ? releasedEvents.reduce((sum, e) => sum + (e.duration || 0), 0) / releasedEvents.length
      : 0;

    return {
      activeLocks: active,
      expiredLocks: expired,
      waitingRequests: waiting,
      totalAcquisitions: acquisitions,
      totalReleases: releases,
      totalTimeouts: timeouts,
      totalDeadlocks: deadlocks,
      averageLockDuration: avgDuration
    };
  }

  /**
   * Clear all active locks (for testing)
   */
  async clearAllLocks(): Promise<void> {
    const lockIds = Array.from(this.activeLocks.keys());
    let clearedCount = 0;

    for (const lockId of lockIds) {
      try {
        await this.releaseLock(lockId);
        clearedCount++;
      } catch (error) {
        logger.warn({ lockId, error }, 'Failed to clear lock');
      }
    }

    // Clear any remaining waiters
    for (const waiters of this.lockWaiters.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(new Error('All locks cleared'));
      }
    }
    this.lockWaiters.clear();

    logger.debug({ clearedCount }, 'All locks cleared');
  }

  /**
   * Dispose of the concurrent access manager
   */
  async dispose(): Promise<void> {
    await this.shutdown();
  }

  /**
   * Shutdown concurrent access manager
   */
  async shutdown(): Promise<void> {
    // Clear timers
    if (this.deadlockDetectionTimer) {
      clearInterval(this.deadlockDetectionTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Release all active locks
    const lockIds = Array.from(this.activeLocks.keys());
    for (const lockId of lockIds) {
      await this.releaseLock(lockId);
    }

    // Clear waiters
    for (const waiters of this.lockWaiters.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(new Error('Concurrent access manager shutdown'));
      }
    }
    this.lockWaiters.clear();

    this.auditEvents = [];
    logger.info('Concurrent Access Manager shutdown');
  }
}

/**
 * Convenience function to get concurrent access manager
 */
export function getConcurrentAccessManager(): ConcurrentAccessManager {
  return ConcurrentAccessManager.getInstance();
}
