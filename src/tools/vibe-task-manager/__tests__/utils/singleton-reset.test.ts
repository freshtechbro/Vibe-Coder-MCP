/**
 * Test suite for singleton reset functionality
 * Verifies that singleton instances are properly reset between tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  registerSingletonForReset,
  resetSingleton,
  resetAllSingletons,
  autoRegisterKnownSingletons,
  clearSingletonRegistry,
  getRegisteredSingletons,
  isSingletonRegistered,
  resetTimeoutManager,
  performSingletonTestCleanup
} from './singleton-reset-manager.js';
import { withTestCleanup } from './test-helpers.js';

// Test singleton class
class TestSingleton {
  private static instance: TestSingleton | null = null;
  private data: string[] = [];
  private isInitialized = false;

  static getInstance(): TestSingleton {
    if (!TestSingleton.instance) {
      TestSingleton.instance = new TestSingleton();
    }
    return TestSingleton.instance;
  }

  initialize(): void {
    this.isInitialized = true;
  }

  addData(item: string): void {
    this.data.push(item);
  }

  getData(): string[] {
    return [...this.data];
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  reset(): void {
    this.data = [];
    this.isInitialized = false;
  }

  static resetStatic(): void {
    TestSingleton.instance = null;
  }
}

// Another test singleton with different pattern
class AnotherTestSingleton {
  private static instance: AnotherTestSingleton | null = null;
  private counter = 0;

  static getInstance(): AnotherTestSingleton {
    if (!AnotherTestSingleton.instance) {
      AnotherTestSingleton.instance = new AnotherTestSingleton();
    }
    return AnotherTestSingleton.instance;
  }

  increment(): void {
    this.counter++;
  }

  getCount(): number {
    return this.counter;
  }

  cleanup(): void {
    this.counter = 0;
    AnotherTestSingleton.instance = null;
  }
}

describe('Singleton Reset Manager', () => {
  withTestCleanup('singleton-reset');

  beforeEach(() => {
    clearSingletonRegistry();
  });

  afterEach(() => {
    // Clean up test singletons
    TestSingleton.resetStatic();
    AnotherTestSingleton.getInstance().cleanup();
  });

  describe('Registration', () => {
    it('should register singleton for reset', () => {
      registerSingletonForReset({
        name: 'TestSingleton',
        getInstance: () => TestSingleton.getInstance(),
        resetMethod: 'reset',
        customResetFn: () => TestSingleton.resetStatic()
      });

      expect(isSingletonRegistered('TestSingleton')).toBe(true);
      expect(getRegisteredSingletons()).toContain('TestSingleton');
    });

    it('should register multiple singletons', () => {
      registerSingletonForReset({
        name: 'TestSingleton',
        getInstance: () => TestSingleton.getInstance(),
        resetMethod: 'reset'
      });

      registerSingletonForReset({
        name: 'AnotherTestSingleton',
        getInstance: () => AnotherTestSingleton.getInstance(),
        resetMethod: 'cleanup'
      });

      const registered = getRegisteredSingletons();
      expect(registered).toContain('TestSingleton');
      expect(registered).toContain('AnotherTestSingleton');
      expect(registered).toHaveLength(2);
    });
  });

  describe('Individual Reset', () => {
    it('should reset singleton with reset method', async () => {
      const singleton = TestSingleton.getInstance();
      singleton.initialize();
      singleton.addData('test-data');

      expect(singleton.isReady()).toBe(true);
      expect(singleton.getData()).toEqual(['test-data']);

      registerSingletonForReset({
        name: 'TestSingleton',
        getInstance: () => TestSingleton.getInstance(),
        resetMethod: 'reset',
        customResetFn: () => TestSingleton.resetStatic()
      });

      const success = await resetSingleton('TestSingleton');
      expect(success).toBe(true);

      // Create new instance and verify it's clean
      const newSingleton = TestSingleton.getInstance();
      expect(newSingleton.isReady()).toBe(false);
      expect(newSingleton.getData()).toEqual([]);
    });

    it('should reset singleton with cleanup method', async () => {
      const singleton = AnotherTestSingleton.getInstance();
      singleton.increment();
      singleton.increment();

      expect(singleton.getCount()).toBe(2);

      registerSingletonForReset({
        name: 'AnotherTestSingleton',
        getInstance: () => AnotherTestSingleton.getInstance(),
        resetMethod: 'cleanup'
      });

      const success = await resetSingleton('AnotherTestSingleton');
      expect(success).toBe(true);

      // Create new instance and verify it's clean
      const newSingleton = AnotherTestSingleton.getInstance();
      expect(newSingleton.getCount()).toBe(0);
    });

    it('should handle non-existent singleton', async () => {
      const success = await resetSingleton('NonExistentSingleton');
      expect(success).toBe(false);
    });
  });

  describe('Bulk Reset', () => {
    it('should reset all registered singletons', async () => {
      // Set up test data
      const singleton1 = TestSingleton.getInstance();
      singleton1.initialize();
      singleton1.addData('data1');

      const singleton2 = AnotherTestSingleton.getInstance();
      singleton2.increment();

      // Register both
      registerSingletonForReset({
        name: 'TestSingleton',
        getInstance: () => TestSingleton.getInstance(),
        resetMethod: 'reset',
        customResetFn: () => TestSingleton.resetStatic()
      });

      registerSingletonForReset({
        name: 'AnotherTestSingleton',
        getInstance: () => AnotherTestSingleton.getInstance(),
        resetMethod: 'cleanup'
      });

      // Reset all
      const results = await resetAllSingletons();

      expect(results.total).toBe(2);
      expect(results.successful).toBe(2);
      expect(results.failed).toHaveLength(0);

      // Verify both are reset
      const newSingleton1 = TestSingleton.getInstance();
      expect(newSingleton1.isReady()).toBe(false);
      expect(newSingleton1.getData()).toEqual([]);

      const newSingleton2 = AnotherTestSingleton.getInstance();
      expect(newSingleton2.getCount()).toBe(0);
    });
  });

  describe('Known Singletons', () => {
    it('should auto-register known singletons', async () => {
      await autoRegisterKnownSingletons();
      
      const registered = getRegisteredSingletons();
      
      // Should have registered some known singletons
      expect(registered.length).toBeGreaterThan(0);
      
      // Check for specific known singletons
      expect(registered).toContain('TimeoutManager');
    });

    it('should reset TimeoutManager specifically', async () => {
      await resetTimeoutManager();
      
      // This should not throw and should complete successfully
      expect(true).toBe(true);
    });
  });

  describe('Comprehensive Cleanup', () => {
    it('should perform comprehensive singleton test cleanup', async () => {
      // Set up some test data
      const singleton1 = TestSingleton.getInstance();
      singleton1.initialize();
      singleton1.addData('test');

      const singleton2 = AnotherTestSingleton.getInstance();
      singleton2.increment();

      // Register them
      registerSingletonForReset({
        name: 'TestSingleton',
        getInstance: () => TestSingleton.getInstance(),
        resetMethod: 'reset',
        customResetFn: () => TestSingleton.resetStatic()
      });

      registerSingletonForReset({
        name: 'AnotherTestSingleton',
        getInstance: () => AnotherTestSingleton.getInstance(),
        resetMethod: 'cleanup'
      });

      // Perform comprehensive cleanup
      await performSingletonTestCleanup();

      // Verify cleanup worked
      const newSingleton1 = TestSingleton.getInstance();
      expect(newSingleton1.isReady()).toBe(false);
      expect(newSingleton1.getData()).toEqual([]);

      const newSingleton2 = AnotherTestSingleton.getInstance();
      expect(newSingleton2.getCount()).toBe(0);
    });
  });

  describe('Registry Management', () => {
    it('should clear singleton registry', () => {
      registerSingletonForReset({
        name: 'TestSingleton',
        getInstance: () => TestSingleton.getInstance()
      });

      expect(getRegisteredSingletons()).toHaveLength(1);

      clearSingletonRegistry();

      expect(getRegisteredSingletons()).toHaveLength(0);
      expect(isSingletonRegistered('TestSingleton')).toBe(false);
    });

    it('should check singleton registration status', () => {
      expect(isSingletonRegistered('TestSingleton')).toBe(false);

      registerSingletonForReset({
        name: 'TestSingleton',
        getInstance: () => TestSingleton.getInstance()
      });

      expect(isSingletonRegistered('TestSingleton')).toBe(true);
    });
  });
});
