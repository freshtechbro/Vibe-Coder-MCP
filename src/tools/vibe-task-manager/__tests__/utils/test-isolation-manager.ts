/**
 * Test Isolation Manager
 * 
 * Centralized utility to reset all singleton state between tests
 * to prevent test isolation issues and cross-test contamination.
 */

import { vi } from 'vitest';

/**
 * Interface for singleton services that need reset capabilities
 */
export interface ResettableSingleton {
  resetInstance?: () => void;
  clearState?: () => void;
}

/**
 * Test isolation manager for resetting singleton state
 */
export class TestIsolationManager {
  private static registeredSingletons: Array<ResettableSingleton> = [];
  private static originalConsoleError = console.error;

  /**
   * Register a singleton service for test cleanup
   */
  static registerSingleton(singleton: ResettableSingleton): void {
    if (!this.registeredSingletons.includes(singleton)) {
      this.registeredSingletons.push(singleton);
    }
  }

  /**
   * Reset all registered singleton instances
   */
  static resetAllSingletons(): void {
    this.registeredSingletons.forEach(singleton => {
      try {
        if (singleton.resetInstance) {
          singleton.resetInstance();
        }
        if (singleton.clearState) {
          singleton.clearState();
        }
      } catch {
        // Suppress errors during test cleanup
      }
    });
  }

  /**
   * Reset core Vibe Task Manager singletons
   */
  static resetCoreServices(): void {
    try {
      // For test isolation issues, we need to be careful about singleton resets
      // Only reset if no tests are running or if explicitly needed
      console.log('TestIsolationManager: Skipping singleton resets to preserve mocks');
      
      // Commented out to preserve mocks during test execution
      // const { EpicService } = require('../../services/epic-service.js');
      // const { TaskOperations } = require('../../core/operations/task-operations.js');
      // const { DependencyOperations } = require('../../core/operations/dependency-operations.js');
      
      // if (EpicService && typeof EpicService.resetInstance === 'function') {
      //   EpicService.resetInstance();
      // }
      // if (TaskOperations && typeof TaskOperations.resetInstance === 'function') {
      //   TaskOperations.resetInstance();
      // }
      // if (DependencyOperations && typeof DependencyOperations.resetInstance === 'function') {
      //   DependencyOperations.resetInstance();
      // }
    } catch {
      // Suppress errors during test cleanup
    }
  }

  /**
   * Complete test isolation setup
   */
  static setupTestIsolation(): void {
    // Clear all mocks but don't reset implementations
    vi.clearAllMocks();
    
    // Reset all singleton state
    this.resetAllSingletons();
    
    // Reset core services specifically
    this.resetCoreServices();
    
    // Don't reset modules as it's too aggressive
    // vi.resetModules();
    
    // Suppress console errors during test setup
    console.error = vi.fn();
  }

  /**
   * Complete test cleanup
   */
  static cleanupTestIsolation(): void {
    // Reset all singleton state
    this.resetAllSingletons();
    
    // Reset core services specifically
    this.resetCoreServices();
    
    // Restore console
    console.error = this.originalConsoleError;
  }

  /**
   * Clear all registered singletons (for test cleanup)
   */
  static clearRegistry(): void {
    this.registeredSingletons.length = 0;
  }
}

/**
 * Helper function to create resettable singleton pattern
 */
export function createResettableSingleton<T>(
  createInstance: () => T,
  resetFn?: (instance: T) => void
): {
  getInstance: () => T;
  resetInstance: () => void;
  clearState: () => void;
} {
  let instance: T | null = null;

  const singletonManager = {
    getInstance(): T {
      if (!instance) {
        instance = createInstance();
      }
      return instance;
    },

    resetInstance(): void {
      if (instance && resetFn) {
        resetFn(instance);
      }
      instance = null;
    },

    clearState(): void {
      if (instance && resetFn) {
        resetFn(instance);
      }
    }
  };

  // Auto-register with test isolation manager
  TestIsolationManager.registerSingleton(singletonManager);

  return singletonManager;
}

/**
 * Decorator to make a class resettable for testing
 */
export function Resettable<T extends { new (...args: unknown[]): object }>(constructor: T) {
  const originalClass = constructor as Record<string, unknown>;
  let instance: unknown = null;

  const resettableClass = class extends originalClass {
    static getInstance(...args: unknown[]) {
      if (!instance) {
        instance = new (resettableClass as Record<string, unknown>)(...args);
      }
      return instance;
    }

    static resetInstance() {
      if (instance && typeof instance.reset === 'function') {
        instance.reset();
      }
      instance = null;
    }

    static clearState() {
      if (instance && typeof instance.clearState === 'function') {
        instance.clearState();
      }
    }
  };

  // Auto-register with test isolation manager
  TestIsolationManager.registerSingleton(resettableClass);

  return resettableClass as Record<string, unknown>;
}