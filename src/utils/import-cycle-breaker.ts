/**
 * Import Cycle Breaker Utility
 * 
 * Detects and breaks circular import dependencies by tracking import stack
 * and providing safe fallbacks when circular imports are detected.
 * 
 * This utility helps prevent infinite recursion during dynamic module loading
 * by maintaining a stack of currently importing modules and detecting cycles.
 */

import logger from '../logger.js';

/**
 * Import cycle detection and breaking utility
 */
export class ImportCycleBreaker {
  private static importStack = new Set<string>();
  private static importHistory = new Map<string, { timestamp: number; success: boolean }>();
  private static readonly IMPORT_TIMEOUT = 5000; // 5 seconds
  private static readonly HISTORY_CLEANUP_INTERVAL = 60000; // 1 minute
  private static cleanupTimer?: NodeJS.Timeout;

  /**
   * Safely import a module with circular dependency detection
   * 
   * @param modulePath - The path to the module to import
   * @param importName - The specific export to import from the module
   * @returns The imported module/export or null if circular dependency detected
   */
  static async safeImport<T>(modulePath: string, importName?: string): Promise<T | null> {
    const importKey = importName ? `${modulePath}:${importName}` : modulePath;
    
    // Check if this import is already in progress (circular dependency)
    if (this.importStack.has(importKey)) {
      logger.warn({ 
        modulePath, 
        importName, 
        currentStack: Array.from(this.importStack) 
      }, 'Circular import detected, using fallback');
      
      this.recordImportAttempt(importKey, false);
      return null;
    }

    // Check recent failed imports to avoid repeated failures
    const recentAttempt = this.importHistory.get(importKey);
    if (recentAttempt && !recentAttempt.success && 
        (Date.now() - recentAttempt.timestamp) < this.IMPORT_TIMEOUT) {
      logger.debug({ 
        modulePath, 
        importName, 
        lastAttempt: recentAttempt.timestamp 
      }, 'Skipping recent failed import attempt');
      return null;
    }

    // Add to import stack
    this.importStack.add(importKey);
    
    try {
      logger.debug({ modulePath, importName }, 'Starting safe import');
      
      // Set timeout for import operation
      const importPromise = this.performImport<T>(modulePath, importName);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Import timeout')), this.IMPORT_TIMEOUT);
      });
      
      const module = await Promise.race([importPromise, timeoutPromise]);
      
      logger.debug({ modulePath, importName }, 'Safe import completed successfully');
      this.recordImportAttempt(importKey, true);
      
      return module;
      
    } catch (error) {
      logger.warn({ 
        err: error, 
        modulePath, 
        importName 
      }, 'Safe import failed');
      
      this.recordImportAttempt(importKey, false);
      return null;
      
    } finally {
      // Remove from import stack
      this.importStack.delete(importKey);
      
      // Start cleanup timer if not already running
      this.startCleanupTimer();
    }
  }

  /**
   * Perform the actual module import
   */
  private static async performImport<T>(modulePath: string, importName?: string): Promise<T> {
    const module = await import(modulePath);
    
    if (importName) {
      if (!(importName in module)) {
        throw new Error(`Export '${importName}' not found in module '${modulePath}'`);
      }
      return module[importName];
    }
    
    return module;
  }

  /**
   * Record import attempt for history tracking
   */
  private static recordImportAttempt(importKey: string, success: boolean): void {
    this.importHistory.set(importKey, {
      timestamp: Date.now(),
      success
    });
  }

  /**
   * Start cleanup timer to remove old import history entries
   */
  private static startCleanupTimer(): void {
    if (this.cleanupTimer) {
      return;
    }
    
    this.cleanupTimer = setTimeout(() => {
      this.cleanupImportHistory();
      this.cleanupTimer = undefined;
    }, this.HISTORY_CLEANUP_INTERVAL);
  }

  /**
   * Clean up old import history entries
   */
  private static cleanupImportHistory(): void {
    const now = Date.now();
    const cutoff = now - (this.HISTORY_CLEANUP_INTERVAL * 2); // Keep 2 intervals worth
    
    let cleanedCount = 0;
    for (const [key, entry] of this.importHistory.entries()) {
      if (entry.timestamp < cutoff) {
        this.importHistory.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug({ cleanedCount }, 'Cleaned up old import history entries');
    }
  }

  /**
   * Get current import stack for debugging
   */
  static getCurrentImportStack(): string[] {
    return Array.from(this.importStack);
  }

  /**
   * Get import history for debugging
   */
  static getImportHistory(): Record<string, { timestamp: number; success: boolean }> {
    const history: Record<string, { timestamp: number; success: boolean }> = {};
    for (const [key, value] of this.importHistory.entries()) {
      history[key] = value;
    }
    return history;
  }

  /**
   * Clear all import tracking (useful for testing)
   */
  static clearAll(): void {
    this.importStack.clear();
    this.importHistory.clear();
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Check if a specific import is currently in progress
   */
  static isImportInProgress(modulePath: string, importName?: string): boolean {
    const importKey = importName ? `${modulePath}:${importName}` : modulePath;
    return this.importStack.has(importKey);
  }

  /**
   * Get statistics about import operations
   */
  static getStatistics(): {
    currentImports: number;
    historyEntries: number;
    successfulImports: number;
    failedImports: number;
  } {
    let successfulImports = 0;
    let failedImports = 0;
    
    for (const entry of this.importHistory.values()) {
      if (entry.success) {
        successfulImports++;
      } else {
        failedImports++;
      }
    }
    
    return {
      currentImports: this.importStack.size,
      historyEntries: this.importHistory.size,
      successfulImports,
      failedImports
    };
  }

  /**
   * Create a safe import wrapper for a specific module
   * Useful for creating module-specific import functions
   */
  static createModuleImporter(modulePath: string) {
    return async <T>(importName?: string): Promise<T | null> => {
      return this.safeImport<T>(modulePath, importName);
    };
  }

  /**
   * Batch import multiple modules safely
   * Returns results in the same order as input, with null for failed imports
   */
  static async safeBatchImport<T>(
    imports: Array<{ modulePath: string; importName?: string }>
  ): Promise<Array<T | null>> {
    const results = await Promise.allSettled(
      imports.map(({ modulePath, importName }) => 
        this.safeImport<T>(modulePath, importName)
      )
    );
    
    return results.map(result => 
      result.status === 'fulfilled' ? result.value : null
    );
  }
}
