/**
 * Test cleanup utilities for proper resource management
 * Handles EventEmitter cleanup, singleton resets, and memory management
 */

import { EventEmitter } from 'events';
import logger from '../../../../logger.js';
import { performSingletonTestCleanup, autoRegisterKnownSingletons } from './singleton-reset-manager.js';

/**
 * Registry of EventEmitters created during tests
 */
const eventEmitterRegistry = new Set<EventEmitter>();

/**
 * Registry of cleanup functions
 */
const cleanupFunctions = new Map<string, () => Promise<void> | void>();

/**
 * Registry of singleton instances that need reset
 */
const singletonRegistry = new Map<string, { instance: any; resetMethod?: string }>();

/**
 * Register an EventEmitter for cleanup
 */
export function registerEventEmitter(emitter: EventEmitter, name?: string): void {
  eventEmitterRegistry.add(emitter);
  
  // Set a reasonable max listeners limit for tests
  emitter.setMaxListeners(20);
  
  if (name) {
    logger.debug({ name, listenerCount: emitter.listenerCount('*') }, 'EventEmitter registered for cleanup');
  }
}

/**
 * Register a cleanup function
 */
export function registerCleanupFunction(name: string, cleanupFn: () => Promise<void> | void): void {
  cleanupFunctions.set(name, cleanupFn);
  logger.debug({ name }, 'Cleanup function registered');
}

/**
 * Register a singleton instance for reset
 */
export function registerSingleton(name: string, instance: any, resetMethod?: string): void {
  singletonRegistry.set(name, { instance, resetMethod });
  logger.debug({ name, resetMethod }, 'Singleton registered for reset');
}

/**
 * Clean up all registered EventEmitters
 */
export async function cleanupEventEmitters(): Promise<void> {
  let cleanedCount = 0;
  
  for (const emitter of eventEmitterRegistry) {
    try {
      // Remove all listeners
      emitter.removeAllListeners();
      
      // Reset max listeners to default
      emitter.setMaxListeners(10);
      
      cleanedCount++;
    } catch (error) {
      logger.warn({ err: error }, 'Failed to cleanup EventEmitter');
    }
  }
  
  // Clear the registry
  eventEmitterRegistry.clear();
  
  if (cleanedCount > 0) {
    logger.debug({ cleanedCount }, 'EventEmitters cleaned up');
  }
}

/**
 * Execute all registered cleanup functions
 */
export async function executeCleanupFunctions(): Promise<void> {
  const results: Array<{ name: string; success: boolean; error?: any }> = [];
  
  for (const [name, cleanupFn] of cleanupFunctions) {
    try {
      await cleanupFn();
      results.push({ name, success: true });
    } catch (error) {
      results.push({ name, success: false, error });
      logger.warn({ err: error, name }, 'Cleanup function failed');
    }
  }
  
  // Clear the registry
  cleanupFunctions.clear();
  
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;
  
  if (results.length > 0) {
    logger.debug({ 
      total: results.length, 
      success: successCount, 
      failures: failureCount 
    }, 'Cleanup functions executed');
  }
}

/**
 * Reset all registered singletons
 */
export async function resetSingletons(): Promise<void> {
  const results: Array<{ name: string; success: boolean; error?: any }> = [];
  
  for (const [name, { instance, resetMethod }] of singletonRegistry) {
    try {
      if (resetMethod && typeof instance[resetMethod] === 'function') {
        await instance[resetMethod]();
      } else if (typeof instance.reset === 'function') {
        await instance.reset();
      } else if (typeof instance.cleanup === 'function') {
        await instance.cleanup();
      } else {
        // Try to reset common singleton properties
        if (instance.constructor && instance.constructor.instance) {
          instance.constructor.instance = null;
        }
      }
      
      results.push({ name, success: true });
    } catch (error) {
      results.push({ name, success: false, error });
      logger.warn({ err: error, name }, 'Singleton reset failed');
    }
  }
  
  // Clear the registry
  singletonRegistry.clear();
  
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;
  
  if (results.length > 0) {
    logger.debug({ 
      total: results.length, 
      success: successCount, 
      failures: failureCount 
    }, 'Singletons reset');
  }
}

/**
 * Comprehensive test cleanup - call this in test teardown
 */
export async function performTestCleanup(): Promise<void> {
  try {
    logger.debug('Starting comprehensive test cleanup');

    // Execute cleanup functions first
    await executeCleanupFunctions();

    // Clean up EventEmitters
    await cleanupEventEmitters();

    // Reset singletons using the legacy method
    await resetSingletons();

    // Reset singletons using the enhanced singleton reset manager
    await performSingletonTestCleanup();

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    logger.debug('Comprehensive test cleanup completed');
  } catch (error) {
    logger.error({ err: error }, 'Failed to perform comprehensive test cleanup');
    throw error;
  }
}

/**
 * Memory usage monitoring for tests
 */
export function getMemoryUsage(): {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  formatted: {
    heapUsed: string;
    heapTotal: string;
    external: string;
    rss: string;
  };
} {
  const usage = process.memoryUsage();
  
  return {
    ...usage,
    formatted: {
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100} MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100} MB`,
      external: `${Math.round(usage.external / 1024 / 1024 * 100) / 100} MB`,
      rss: `${Math.round(usage.rss / 1024 / 1024 * 100) / 100} MB`
    }
  };
}

/**
 * Check for potential memory leaks
 */
export function checkMemoryLeaks(): {
  hasLeaks: boolean;
  warnings: string[];
  stats: ReturnType<typeof getMemoryUsage>;
} {
  const stats = getMemoryUsage();
  const warnings: string[] = [];
  
  // Check for high memory usage (> 500MB)
  if (stats.heapUsed > 500 * 1024 * 1024) {
    warnings.push(`High heap usage: ${stats.formatted.heapUsed}`);
  }
  
  // Check for high RSS (> 1GB)
  if (stats.rss > 1024 * 1024 * 1024) {
    warnings.push(`High RSS usage: ${stats.formatted.rss}`);
  }
  
  // Check for registered resources that weren't cleaned up
  if (eventEmitterRegistry.size > 0) {
    warnings.push(`${eventEmitterRegistry.size} EventEmitters not cleaned up`);
  }
  
  if (cleanupFunctions.size > 0) {
    warnings.push(`${cleanupFunctions.size} cleanup functions not executed`);
  }
  
  if (singletonRegistry.size > 0) {
    warnings.push(`${singletonRegistry.size} singletons not reset`);
  }
  
  return {
    hasLeaks: warnings.length > 0,
    warnings,
    stats
  };
}

/**
 * Test helper to wrap EventEmitter creation with automatic registration
 */
export function createTestEventEmitter(name?: string): EventEmitter {
  const emitter = new EventEmitter();
  registerEventEmitter(emitter, name);
  return emitter;
}
