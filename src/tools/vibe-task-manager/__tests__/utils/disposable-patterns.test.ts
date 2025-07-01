/**
 * Tests for standardized disposable patterns
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ResourceManager,
  DisposableService,
  DisposableWrapper,
  GlobalDisposableRegistry
} from '../../utils/disposable-patterns.js';
import { setupUniversalTestMock, cleanupTestServices } from './service-test-helper.js';

describe('Disposable Patterns', () => {
  beforeEach(async () => {
    await setupUniversalTestMock('disposable-patterns-test');
    GlobalDisposableRegistry.clear();
  });

  afterEach(async () => {
    await cleanupTestServices();
  });

  describe('ResourceManager', () => {
    it('should register and dispose resources', async () => {
      const manager = new ResourceManager();
      const mockDisposable = { dispose: vi.fn() };
      const mockCleanup = vi.fn();

      manager.register(mockDisposable);
      manager.register(mockCleanup);

      expect(manager.getResourceCount()).toBe(2);

      await manager.dispose();

      expect(mockDisposable.dispose).toHaveBeenCalled();
      expect(mockCleanup).toHaveBeenCalled();
      expect(manager.getResourceCount()).toBe(0);
      expect(manager.isDisposed()).toBe(true);
    });

    it('should handle timer resources', async () => {
      const manager = new ResourceManager();
      const timer = setTimeout(() => {}, 1000);
      const interval = setInterval(() => {}, 1000);

      manager.register(timer);
      manager.register(interval);

      expect(manager.getResourceCount()).toBe(2);

      await manager.dispose();

      expect(manager.getResourceCount()).toBe(0);
    });

    it('should handle different cleanup methods', async () => {
      const manager = new ResourceManager();
      const mockCleanup = { cleanup: vi.fn() };
      const mockDestroy = { destroy: vi.fn() };
      const mockClose = { close: vi.fn() };
      const mockClear = { clear: vi.fn() };

      manager.register(mockCleanup);
      manager.register(mockDestroy);
      manager.register(mockClose);
      manager.register(mockClear);

      await manager.dispose();

      expect(mockCleanup.cleanup).toHaveBeenCalled();
      expect(mockDestroy.destroy).toHaveBeenCalled();
      expect(mockClose.close).toHaveBeenCalled();
      expect(mockClear.clear).toHaveBeenCalled();
    });

    it('should handle disposal errors gracefully', async () => {
      const manager = new ResourceManager();
      const errorDisposable = {
        dispose: vi.fn().mockRejectedValue(new Error('Disposal error'))
      };
      const goodDisposable = { dispose: vi.fn() };

      manager.register(errorDisposable);
      manager.register(goodDisposable);

      await manager.dispose();

      expect(errorDisposable.dispose).toHaveBeenCalled();
      expect(goodDisposable.dispose).toHaveBeenCalled();
      expect(manager.isDisposed()).toBe(true);
    });
  });

  describe('DisposableService', () => {
    class TestService extends DisposableService {
      public onDisposeCallCount = 0;
      public customCleanupCalled = false;

      protected async onDispose(): Promise<void> {
        this.onDisposeCallCount++;
        this.customCleanupCalled = true;
      }

      public createTestTimer(): NodeJS.Timeout {
        return this.createTimer(() => {}, 1000);
      }

      public registerTestResource(resource: unknown): void {
        this.registerResource(resource);
      }
    }

    it('should implement disposable service pattern', async () => {
      const service = new TestService();
      const mockResource = { dispose: vi.fn() };

      service.registerTestResource(mockResource);
      service.createTestTimer();

      expect(service.isDisposed()).toBe(false);

      await service.dispose();

      expect(service.isDisposed()).toBe(true);
      expect(service.onDisposeCallCount).toBe(1);
      expect(service.customCleanupCalled).toBe(true);
      expect(mockResource.dispose).toHaveBeenCalled();
    });

    it('should support different disposal method names', async () => {
      const service = new TestService();

      await service.cleanup();
      expect(service.isDisposed()).toBe(true);

      const service2 = new TestService();
      await service2.destroy();
      expect(service2.isDisposed()).toBe(true);
    });

    it('should prevent multiple disposal', async () => {
      const service = new TestService();

      await service.dispose();
      expect(service.onDisposeCallCount).toBe(1);

      await service.dispose();
      expect(service.onDisposeCallCount).toBe(1); // Should not increase
    });
  });

  describe('DisposableWrapper', () => {
    it('should wrap objects with dispose method', async () => {
      const mockObject = { dispose: vi.fn() };
      const wrapper = new DisposableWrapper(mockObject);

      await wrapper.dispose();

      expect(mockObject.dispose).toHaveBeenCalled();
      expect(wrapper.isDisposed()).toBe(true);
    });

    it('should wrap objects with custom method', async () => {
      const mockObject = { cleanup: vi.fn() };
      const wrapper = new DisposableWrapper(mockObject, 'cleanup');

      await wrapper.dispose();

      expect(mockObject.cleanup).toHaveBeenCalled();
      expect(wrapper.isDisposed()).toBe(true);
    });

    it('should wrap objects with function', async () => {
      const mockCleanup = vi.fn();
      const wrapper = new DisposableWrapper(null, mockCleanup);

      await wrapper.dispose();

      expect(mockCleanup).toHaveBeenCalled();
      expect(wrapper.isDisposed()).toBe(true);
    });
  });

  describe('GlobalDisposableRegistry', () => {
    it('should register and dispose all resources globally', async () => {
      const mockDisposable1 = { dispose: vi.fn() };
      const mockDisposable2 = { dispose: vi.fn() };

      GlobalDisposableRegistry.register(mockDisposable1);
      GlobalDisposableRegistry.register(mockDisposable2);

      expect(GlobalDisposableRegistry.getCount()).toBe(2);

      await GlobalDisposableRegistry.disposeAll();

      expect(mockDisposable1.dispose).toHaveBeenCalled();
      expect(mockDisposable2.dispose).toHaveBeenCalled();
      expect(GlobalDisposableRegistry.getCount()).toBe(0);
    });

    it('should handle disposal errors in global registry', async () => {
      const errorDisposable = {
        dispose: vi.fn().mockRejectedValue(new Error('Global disposal error'))
      };
      const goodDisposable = { dispose: vi.fn() };

      GlobalDisposableRegistry.register(errorDisposable);
      GlobalDisposableRegistry.register(goodDisposable);

      await GlobalDisposableRegistry.disposeAll();

      expect(errorDisposable.dispose).toHaveBeenCalled();
      expect(goodDisposable.dispose).toHaveBeenCalled();
      expect(GlobalDisposableRegistry.getCount()).toBe(0);
    });

    it('should support unregistering resources', () => {
      const mockDisposable = { dispose: vi.fn() };

      GlobalDisposableRegistry.register(mockDisposable);
      expect(GlobalDisposableRegistry.getCount()).toBe(1);

      const removed = GlobalDisposableRegistry.unregister(mockDisposable);
      expect(removed).toBe(true);
      expect(GlobalDisposableRegistry.getCount()).toBe(0);

      const removedAgain = GlobalDisposableRegistry.unregister(mockDisposable);
      expect(removedAgain).toBe(false);
    });
  });

  describe('Integration with Storage Classes', () => {
    it('should work with ProjectStorage disposable pattern', async () => {
      const { ProjectStorage } = await import('../../core/storage/project-storage.js');
      
      const storage = new ProjectStorage('/tmp/test-storage');
      
      // Storage should be disposable
      expect(typeof storage.dispose).toBe('function');
      expect(typeof storage.cleanup).toBe('function');
      expect(typeof storage.destroy).toBe('function');
      
      // Should not be disposed initially
      expect(storage.isDisposed()).toBe(false);
      
      // Should dispose properly
      await storage.dispose();
      expect(storage.isDisposed()).toBe(true);
    });
  });
});
