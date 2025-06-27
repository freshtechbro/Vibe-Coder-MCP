/**
 * Comprehensive Test Cleanup Utilities
 * Provides robust cleanup mechanisms for test isolation and state management
 */

import { vi } from 'vitest';

export interface CleanupOptions {
  clearMocks?: boolean;
  resetMocks?: boolean;
  restoreMocks?: boolean;
  clearTimers?: boolean;
  resetModules?: boolean;
  clearCache?: boolean;
  resetSingletons?: boolean;
}

export interface TestState {
  mocks: Map<string, any>;
  timers: Set<NodeJS.Timeout>;
  intervals: Set<NodeJS.Timeout>;
  singletons: Map<string, any>;
  moduleCache: Set<string>;
}

export class ComprehensiveTestCleanup {
  private static instance: ComprehensiveTestCleanup | null = null;
  private testStates = new Map<string, TestState>();
  private globalCleanupFunctions: Array<() => void> = [];

  static getInstance(): ComprehensiveTestCleanup {
    if (!ComprehensiveTestCleanup.instance) {
      ComprehensiveTestCleanup.instance = new ComprehensiveTestCleanup();
    }
    return ComprehensiveTestCleanup.instance;
  }

  static reset(): void {
    if (ComprehensiveTestCleanup.instance) {
      ComprehensiveTestCleanup.instance.cleanupAll();
      ComprehensiveTestCleanup.instance = null;
    }
  }

  /**
   * Initialize test state tracking for a specific test
   */
  initializeTestState(testName: string): TestState {
    const state: TestState = {
      mocks: new Map(),
      timers: new Set(),
      intervals: new Set(),
      singletons: new Map(),
      moduleCache: new Set()
    };

    this.testStates.set(testName, state);
    return state;
  }

  /**
   * Register a mock for cleanup tracking
   */
  registerMock(testName: string, mockName: string, mock: any): void {
    const state = this.testStates.get(testName);
    if (state) {
      state.mocks.set(mockName, mock);
    }
  }

  /**
   * Register a timer for cleanup tracking
   */
  registerTimer(testName: string, timer: NodeJS.Timeout): void {
    const state = this.testStates.get(testName);
    if (state) {
      state.timers.add(timer);
    }
  }

  /**
   * Register a singleton for cleanup tracking
   */
  registerSingleton(testName: string, singletonName: string, singleton: any): void {
    const state = this.testStates.get(testName);
    if (state) {
      state.singletons.set(singletonName, singleton);
    }
  }

  /**
   * Comprehensive cleanup for a specific test
   */
  cleanupTest(testName: string, options: CleanupOptions = {}): void {
    const {
      clearMocks = true,
      resetMocks = true,
      restoreMocks = true,
      clearTimers = true,
      resetModules = false,
      clearCache = true,
      resetSingletons = true
    } = options;

    const state = this.testStates.get(testName);
    if (!state) {
      return;
    }

    try {
      // Clean up mocks
      if (clearMocks || resetMocks || restoreMocks) {
        this.cleanupMocks(state, { clearMocks, resetMocks, restoreMocks });
      }

      // Clean up timers
      if (clearTimers) {
        this.cleanupTimers(state);
      }

      // Reset singletons
      if (resetSingletons) {
        this.resetSingletons(state);
      }

      // Clear cache
      if (clearCache) {
        this.clearTestCache(state);
      }

      // Reset modules
      if (resetModules) {
        this.resetModules(state);
      }

      // Run global Vitest cleanup
      this.runVitestCleanup();

    } catch (error) {
      console.warn(`Cleanup failed for test ${testName}:`, error);
    } finally {
      // Remove test state
      this.testStates.delete(testName);
    }
  }

  /**
   * Clean up all mocks for a test
   */
  private cleanupMocks(state: TestState, options: { clearMocks: boolean; resetMocks: boolean; restoreMocks: boolean }): void {
    const { clearMocks, resetMocks, restoreMocks } = options;

    for (const [mockName, mock] of state.mocks) {
      try {
        if (mock && typeof mock === 'object') {
          // Handle Vitest mock functions
          if (typeof mock.mockClear === 'function' && clearMocks) {
            mock.mockClear();
          }
          if (typeof mock.mockReset === 'function' && resetMocks) {
            mock.mockReset();
          }
          if (typeof mock.mockRestore === 'function' && restoreMocks) {
            mock.mockRestore();
          }

          // Handle spy functions
          if (typeof mock.restore === 'function' && restoreMocks) {
            mock.restore();
          }
        }
      } catch (error) {
        console.warn(`Failed to cleanup mock ${mockName}:`, error);
      }
    }

    state.mocks.clear();
  }

  /**
   * Clean up all timers for a test
   */
  private cleanupTimers(state: TestState): void {
    // Clear timeouts
    for (const timer of state.timers) {
      try {
        clearTimeout(timer);
      } catch (error) {
        console.warn('Failed to clear timeout:', error);
      }
    }
    state.timers.clear();

    // Clear intervals
    for (const interval of state.intervals) {
      try {
        clearInterval(interval);
      } catch (error) {
        console.warn('Failed to clear interval:', error);
      }
    }
    state.intervals.clear();
  }

  /**
   * Reset singleton instances
   */
  private resetSingletons(state: TestState): void {
    for (const [singletonName, singleton] of state.singletons) {
      try {
        // Common singleton reset patterns
        if (singleton && typeof singleton === 'object') {
          // Reset instance property
          if ('instance' in singleton) {
            singleton.instance = null;
          }

          // Call reset method if available
          if (typeof singleton.reset === 'function') {
            singleton.reset();
          }

          // Clear cache if available
          if (typeof singleton.clearCache === 'function') {
            singleton.clearCache();
          }
        }
      } catch (error) {
        console.warn(`Failed to reset singleton ${singletonName}:`, error);
      }
    }

    state.singletons.clear();
  }

  /**
   * Clear test-specific cache
   */
  private clearTestCache(state: TestState): void {
    // Clear module cache entries
    for (const modulePath of state.moduleCache) {
      try {
        delete require.cache[modulePath];
      } catch (error) {
        console.warn(`Failed to clear module cache for ${modulePath}:`, error);
      }
    }
    state.moduleCache.clear();
  }

  /**
   * Reset modules
   */
  private resetModules(state: TestState): void {
    try {
      vi.resetModules();
    } catch (error) {
      console.warn('Failed to reset modules:', error);
    }
  }

  /**
   * Run comprehensive Vitest cleanup
   */
  private runVitestCleanup(): void {
    try {
      // Clear all mocks
      vi.clearAllMocks();
      
      // Reset all mocks
      vi.resetAllMocks();
      
      // Restore all mocks
      vi.restoreAllMocks();
      
      // Clear all timers
      vi.clearAllTimers();
      
      // Use real timers
      vi.useRealTimers();
      
    } catch (error) {
      console.warn('Vitest cleanup failed:', error);
    }
  }

  /**
   * Register a global cleanup function
   */
  registerGlobalCleanup(cleanupFn: () => void): void {
    this.globalCleanupFunctions.push(cleanupFn);
  }

  /**
   * Clean up all tests and global state
   */
  cleanupAll(): void {
    // Clean up all test states
    for (const testName of this.testStates.keys()) {
      this.cleanupTest(testName);
    }

    // Run global cleanup functions
    for (const cleanupFn of this.globalCleanupFunctions) {
      try {
        cleanupFn();
      } catch (error) {
        console.warn('Global cleanup function failed:', error);
      }
    }

    // Clear global cleanup functions
    this.globalCleanupFunctions = [];

    // Final Vitest cleanup
    this.runVitestCleanup();
  }

  /**
   * Get test state for debugging
   */
  getTestState(testName: string): TestState | undefined {
    return this.testStates.get(testName);
  }

  /**
   * Get all test states for debugging
   */
  getAllTestStates(): Map<string, TestState> {
    return new Map(this.testStates);
  }
}

// Export singleton instance
export const comprehensiveTestCleanup = ComprehensiveTestCleanup.getInstance();

// Export convenience functions
export const initializeTestState = (testName: string) => 
  comprehensiveTestCleanup.initializeTestState(testName);

export const registerMock = (testName: string, mockName: string, mock: any) =>
  comprehensiveTestCleanup.registerMock(testName, mockName, mock);

export const registerTimer = (testName: string, timer: NodeJS.Timeout) =>
  comprehensiveTestCleanup.registerTimer(testName, timer);

export const registerSingleton = (testName: string, singletonName: string, singleton: any) =>
  comprehensiveTestCleanup.registerSingleton(testName, singletonName, singleton);

export const cleanupTest = (testName: string, options?: CleanupOptions) =>
  comprehensiveTestCleanup.cleanupTest(testName, options);

export const cleanupAllTests = () => comprehensiveTestCleanup.cleanupAll();

export const registerGlobalCleanup = (cleanupFn: () => void) =>
  comprehensiveTestCleanup.registerGlobalCleanup(cleanupFn);
