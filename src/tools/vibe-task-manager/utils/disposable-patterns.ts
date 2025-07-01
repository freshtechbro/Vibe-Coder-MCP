/**
 * Standardized disposable patterns for consistent resource management
 * Provides interfaces and utilities for proper cleanup across all services
 */

import logger from '../../../logger.js';

/**
 * Standard disposable interface for consistent resource management
 */
export interface IDisposable {
  dispose(): void | Promise<void>;
}

/**
 * Enhanced disposable interface with additional cleanup methods
 */
export interface IEnhancedDisposable extends IDisposable {
  cleanup?(): void | Promise<void>;
  destroy?(): void | Promise<void>;
  close?(): void | Promise<void>;
}

/**
 * Resource types that can be managed
 */
export type ManagedResource = 
  | NodeJS.Timeout
  | NodeJS.Timer
  | { dispose(): void | Promise<void> }
  | { cleanup(): void | Promise<void> }
  | { destroy(): void | Promise<void> }
  | { close(): void | Promise<void> }
  | { clear(): void }
  | (() => void | Promise<void>);

/**
 * Resource manager for tracking and disposing resources
 */
export class ResourceManager implements IDisposable {
  private resources = new Set<ManagedResource>();
  private disposed = false;

  /**
   * Register a resource for automatic cleanup
   */
  register(resource: ManagedResource): void {
    if (this.disposed) {
      logger.warn('Attempting to register resource on disposed ResourceManager');
      return;
    }
    this.resources.add(resource);
  }

  /**
   * Unregister a resource (useful if manually cleaned up)
   */
  unregister(resource: ManagedResource): boolean {
    return this.resources.delete(resource);
  }

  /**
   * Get count of registered resources
   */
  getResourceCount(): number {
    return this.resources.size;
  }

  /**
   * Dispose all registered resources
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    const errors: Error[] = [];

    for (const resource of this.resources) {
      try {
        await this.disposeResource(resource);
      } catch (error) {
        errors.push(error as Error);
        logger.warn('Error disposing resource', { error });
      }
    }

    this.resources.clear();

    if (errors.length > 0) {
      logger.warn(`Disposed ResourceManager with ${errors.length} errors`);
    }
  }

  /**
   * Dispose a single resource based on its type
   */
  private async disposeResource(resource: ManagedResource): Promise<void> {
    // Handle timers with proper type checking
    if (typeof resource === 'object' && resource !== null) {
      // Check for timeout (setTimeout)
      if ('_idleTimeout' in resource && !('_repeat' in resource)) {
        clearTimeout(resource as NodeJS.Timeout);
        return;
      }
      // Check for interval (setInterval)
      if ('_repeat' in resource) {
        clearInterval(resource as unknown as NodeJS.Timeout);
        return;
      }
      // Fallback: try both (safe since they handle invalid IDs gracefully)
      if ('_idleTimeout' in resource || '_repeat' in resource) {
        try {
          clearTimeout(resource as unknown as NodeJS.Timeout);
        } catch {
          // Ignore errors, try interval
        }
        try {
          clearInterval(resource as unknown as NodeJS.Timeout);
        } catch {
          // Ignore errors
        }
        return;
      }
    }

    // Handle functions
    if (typeof resource === 'function') {
      await resource();
      return;
    }

    // Handle objects with cleanup methods
    if (typeof resource === 'object' && resource !== null) {
      if ('dispose' in resource && typeof resource.dispose === 'function') {
        await resource.dispose();
      } else if ('cleanup' in resource && typeof resource.cleanup === 'function') {
        await resource.cleanup();
      } else if ('destroy' in resource && typeof resource.destroy === 'function') {
        await resource.destroy();
      } else if ('close' in resource && typeof resource.close === 'function') {
        await resource.close();
      } else if ('clear' in resource && typeof resource.clear === 'function') {
        resource.clear();
      }
    }
  }

  /**
   * Check if the resource manager has been disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }
}

/**
 * Base class for disposable services
 */
export abstract class DisposableService implements IEnhancedDisposable {
  protected resourceManager = new ResourceManager();
  protected disposed = false;

  /**
   * Register a resource for automatic cleanup
   */
  protected registerResource(resource: ManagedResource): void {
    this.resourceManager.register(resource);
  }

  /**
   * Unregister a resource
   */
  protected unregisterResource(resource: ManagedResource): boolean {
    return this.resourceManager.unregister(resource);
  }

  /**
   * Create and register a timer
   */
  protected createTimer(callback: () => void, delay: number, repeat = false): NodeJS.Timeout | NodeJS.Timer {
    const timer = repeat ? setInterval(callback, delay) : setTimeout(callback, delay);
    this.registerResource(timer);
    return timer;
  }

  /**
   * Dispose the service and all its resources
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    try {
      // Call custom cleanup logic
      await this.onDispose();
    } catch (error) {
      logger.warn('Error in custom dispose logic', { error });
    }

    // Dispose all managed resources
    await this.resourceManager.dispose();
  }

  /**
   * Alias for dispose() to support different naming conventions
   */
  async cleanup(): Promise<void> {
    await this.dispose();
  }

  /**
   * Alias for dispose() to support different naming conventions
   */
  async destroy(): Promise<void> {
    await this.dispose();
  }

  /**
   * Check if the service has been disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Override this method to implement custom disposal logic
   */
  protected async onDispose(): Promise<void> {
    // Default implementation does nothing
  }
}

/**
 * Utility for creating disposable wrappers around existing objects
 */
export class DisposableWrapper implements IDisposable {
  private disposed = false;

  constructor(
    private target: unknown,
    private disposeMethod: string | (() => void | Promise<void>) = 'dispose'
  ) {}

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    try {
      if (typeof this.disposeMethod === 'function') {
        await this.disposeMethod();
      } else if (typeof this.disposeMethod === 'string' && 
                 this.target && 
                 typeof (this.target as Record<string, unknown>)[this.disposeMethod] === 'function') {
        await (this.target as Record<string, () => Promise<void>>)[this.disposeMethod]();
      }
    } catch (error) {
      logger.warn('Error disposing wrapped object', { error });
    }
  }

  isDisposed(): boolean {
    return this.disposed;
  }
}

/**
 * Global disposable registry for tracking disposables across the application
 */
export class GlobalDisposableRegistry {
  private static disposables = new Set<IDisposable>();

  /**
   * Register a disposable for global cleanup
   */
  static register(disposable: IDisposable): void {
    this.disposables.add(disposable);
  }

  /**
   * Unregister a disposable
   */
  static unregister(disposable: IDisposable): boolean {
    return this.disposables.delete(disposable);
  }

  /**
   * Dispose all registered disposables
   */
  static async disposeAll(): Promise<void> {
    const errors: Error[] = [];

    for (const disposable of this.disposables) {
      try {
        await disposable.dispose();
      } catch (error) {
        errors.push(error as Error);
        logger.warn('Error disposing global resource', { error });
      }
    }

    this.disposables.clear();

    if (errors.length > 0) {
      logger.warn(`Disposed global registry with ${errors.length} errors`);
    }
  }

  /**
   * Get count of registered disposables
   */
  static getCount(): number {
    return this.disposables.size;
  }

  /**
   * Clear all disposables without disposing them (for testing)
   */
  static clear(): void {
    this.disposables.clear();
  }
}

/**
 * Decorator for automatically registering disposable services
 */
export function AutoDispose<T extends new (...args: unknown[]) => IDisposable>(target: T) {
  const originalConstructor = target;

  function newConstructor(...args: unknown[]) {
    const instance = new originalConstructor(...args);
    if (instance && typeof instance.dispose === 'function') {
      GlobalDisposableRegistry.register(instance);
    }
    return instance;
  }

  newConstructor.prototype = originalConstructor.prototype;
  return newConstructor as unknown as T;
}
