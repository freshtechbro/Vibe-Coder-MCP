/**
 * Integration test for test cleanup utilities
 * Demonstrates proper usage of EventEmitter cleanup, singleton management, and memory monitoring
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { 
  withTestCleanup, 
  createTestEventEmitter, 
  createTestService,
  registerTestSingleton,
  waitFor,
  createMockFunction,
  assertMemoryUsage
} from './test-helpers.js';
import {
  performTestCleanup,
  registerEventEmitter,
  registerCleanupFunction,
  checkMemoryLeaks,
  getMemoryUsage
} from './test-cleanup.js';

// Mock service that extends EventEmitter
class MockService extends EventEmitter {
  private isActive = true;
  private timers: NodeJS.Timeout[] = [];

  constructor(public name: string) {
    super();
    this.setMaxListeners(30); // Higher limit for tests
  }

  start(): void {
    this.emit('started', this.name);
    
    // Simulate some background work
    const timer = setInterval(() => {
      if (this.isActive) {
        this.emit('heartbeat', Date.now());
      }
    }, 100);
    
    this.timers.push(timer);
  }

  stop(): void {
    this.isActive = false;
    this.timers.forEach(timer => clearInterval(timer));
    this.timers = [];
    this.emit('stopped', this.name);
  }

  cleanup(): void {
    this.stop();
    this.removeAllListeners();
  }
}

// Singleton service for testing
class SingletonService {
  private static instance: SingletonService | null = null;
  private data: string[] = [];

  static getInstance(): SingletonService {
    if (!SingletonService.instance) {
      SingletonService.instance = new SingletonService();
    }
    return SingletonService.instance;
  }

  addData(item: string): void {
    this.data.push(item);
  }

  getData(): string[] {
    return [...this.data];
  }

  reset(): void {
    this.data = [];
    SingletonService.instance = null;
  }
}

describe('Test Cleanup Integration', () => {
  // Apply automatic cleanup
  withTestCleanup('cleanup-integration');

  describe('EventEmitter Cleanup', () => {
    it('should automatically clean up EventEmitters', async () => {
      const emitter1 = createTestEventEmitter('test-emitter-1');
      const emitter2 = createTestEventEmitter('test-emitter-2');
      
      let event1Count = 0;
      let event2Count = 0;
      
      emitter1.on('test', () => event1Count++);
      emitter2.on('test', () => event2Count++);
      
      // Emit some events
      emitter1.emit('test');
      emitter2.emit('test');
      
      expect(event1Count).toBe(1);
      expect(event2Count).toBe(1);
      
      // Cleanup will happen automatically in afterEach
      // We can also manually trigger it for testing
      await performTestCleanup();
      
      // After cleanup, listeners should be removed
      emitter1.emit('test');
      emitter2.emit('test');
      
      // Counts should not increase
      expect(event1Count).toBe(1);
      expect(event2Count).toBe(1);
    });

    it('should handle services with EventEmitter cleanup', async () => {
      const service = createTestService(
        'mock-service',
        () => new MockService('test-service'),
        'cleanup'
      );

      let startedCount = 0;
      let heartbeatCount = 0;
      let stoppedCount = 0;

      service.on('started', () => startedCount++);
      service.on('heartbeat', () => heartbeatCount++);
      service.on('stopped', () => stoppedCount++);

      service.start();
      expect(startedCount).toBe(1);

      // Wait for some heartbeats
      await waitFor(() => heartbeatCount > 2, 1000);
      expect(heartbeatCount).toBeGreaterThan(2);

      // Cleanup will happen automatically
      await performTestCleanup();
      
      expect(stoppedCount).toBe(1);
    });
  });

  describe('Singleton Management', () => {
    it('should reset singletons between tests', () => {
      const singleton1 = SingletonService.getInstance();
      singleton1.addData('test-data-1');

      registerTestSingleton('SingletonService', SingletonService.getInstance, 'reset');

      expect(singleton1.getData()).toEqual(['test-data-1']);

      // After cleanup, singleton should be reset
      // This will be tested in the next test
    });

    it('should have clean singleton state', () => {
      // This test should see a fresh singleton due to cleanup
      const singleton2 = SingletonService.getInstance();
      expect(singleton2.getData()).toEqual([]);
      
      singleton2.addData('test-data-2');
      expect(singleton2.getData()).toEqual(['test-data-2']);
    });
  });

  describe('Memory Management', () => {
    it('should monitor memory usage', () => {
      const initialMemory = getMemoryUsage();
      expect(initialMemory.heapUsed).toBeGreaterThan(0);
      expect(initialMemory.formatted.heapUsed).toMatch(/\d+(\.\d+)? MB/);
      
      // Create some objects to use memory
      const largeArray = new Array(10000).fill('test-data');
      expect(largeArray.length).toBe(10000);
      
      const afterMemory = getMemoryUsage();
      expect(afterMemory.heapUsed).toBeGreaterThanOrEqual(initialMemory.heapUsed);
    });

    it('should detect memory leaks', async () => {
      // Create some EventEmitters without registering them for cleanup
      const unregisteredEmitter = new EventEmitter();
      registerEventEmitter(unregisteredEmitter, 'unregistered-test');
      
      // Create a cleanup function without executing it
      registerCleanupFunction('test-cleanup', () => {
        // This won't be executed, simulating a leak
      });
      
      const leakCheck = checkMemoryLeaks();
      
      // Should detect the unregistered resources
      expect(leakCheck.hasLeaks).toBe(true);
      expect(leakCheck.warnings.length).toBeGreaterThan(0);
      
      // Clean up manually to avoid affecting other tests
      await performTestCleanup();
    });

    it('should assert memory usage limits', () => {
      // This should pass with reasonable memory usage
      assertMemoryUsage(1000); // 1GB limit
      
      // This would fail if memory usage was too high
      expect(() => assertMemoryUsage(1)).toThrow('Memory usage too high');
    });
  });

  describe('Mock Functions', () => {
    it('should create and cleanup mock functions', () => {
      const mockFn = createMockFunction('test-mock', (x: number) => x * 2);
      
      const result1 = mockFn(5);
      const result2 = mockFn(10);
      
      expect(result1).toBe(10);
      expect(result2).toBe(20);
      
      // Mock function tracks calls internally
      // Cleanup will happen automatically
    });
  });

  describe('Async Operations', () => {
    it('should handle async cleanup properly', async () => {
      let cleanupExecuted = false;
      
      registerCleanupFunction('async-cleanup', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        cleanupExecuted = true;
      });
      
      await performTestCleanup();
      expect(cleanupExecuted).toBe(true);
    });

    it('should wait for conditions with timeout', async () => {
      let counter = 0;
      const timer = setInterval(() => counter++, 10);
      
      try {
        await waitFor(() => counter >= 5, 1000);
        expect(counter).toBeGreaterThanOrEqual(5);
      } finally {
        clearInterval(timer);
      }
    });

    it('should timeout when condition is not met', async () => {
      await expect(
        waitFor(() => false, 100) // Will never be true
      ).rejects.toThrow('Condition not met within 100ms');
    });
  });
});
