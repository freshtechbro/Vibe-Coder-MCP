/**
 * Service Lifecycle Manager
 * 
 * Centralized management of service startup, shutdown, and coordination
 * to prevent repeated initialization/disposal cycles and resource conflicts.
 */

import logger from '../../../logger.js';

export interface ServiceInstance {
  name: string;
  instance: any;
  isStarted: boolean;
  isDisposed: boolean;
  startMethod?: string;
  stopMethod?: string;
  disposeMethod?: string;
  resetStaticMethod?: string;
}

export interface ServiceDependency {
  service: string;
  dependsOn: string[];
}

/**
 * Centralized service lifecycle coordinator
 */
export class ServiceLifecycleManager {
  private static instance: ServiceLifecycleManager | null = null;
  private services = new Map<string, ServiceInstance>();
  private dependencies: ServiceDependency[] = [];
  private startupInProgress = false;
  private shutdownInProgress = false;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): ServiceLifecycleManager {
    if (!ServiceLifecycleManager.instance) {
      ServiceLifecycleManager.instance = new ServiceLifecycleManager();
    }
    return ServiceLifecycleManager.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  static resetInstance(): void {
    ServiceLifecycleManager.instance = null;
  }

  /**
   * Register a service for lifecycle management
   */
  registerService(config: Omit<ServiceInstance, 'isStarted' | 'isDisposed'>): void {
    const service: ServiceInstance = {
      ...config,
      isStarted: false,
      isDisposed: false
    };

    this.services.set(config.name, service);
    logger.debug(`Service registered: ${config.name}`);
  }

  /**
   * Register service dependencies
   */
  registerDependency(service: string, dependsOn: string[]): void {
    this.dependencies.push({ service, dependsOn });
    logger.debug(`Dependencies registered for ${service}: ${dependsOn.join(', ')}`);
  }

  /**
   * Start all services in dependency order
   */
  async startAllServices(): Promise<void> {
    if (this.startupInProgress) {
      logger.warn('Service startup already in progress, skipping');
      return;
    }

    if (this.shutdownInProgress) {
      logger.warn('Service shutdown in progress, cannot start services');
      return;
    }

    this.startupInProgress = true;

    try {
      const startOrder = this.calculateStartupOrder();
      logger.info(`Starting services in order: ${startOrder.join(' -> ')}`);

      for (const serviceName of startOrder) {
        await this.startService(serviceName);
      }

      logger.info('All services started successfully');
    } catch (error) {
      logger.error('Failed to start all services', { error });
      throw error;
    } finally {
      this.startupInProgress = false;
    }
  }

  /**
   * Stop all services in reverse dependency order
   */
  async stopAllServices(): Promise<void> {
    if (this.shutdownInProgress) {
      logger.warn('Service shutdown already in progress, skipping');
      return;
    }

    this.shutdownInProgress = true;

    try {
      const stopOrder = this.calculateStartupOrder().reverse();
      logger.info(`Stopping services in order: ${stopOrder.join(' -> ')}`);

      for (const serviceName of stopOrder) {
        await this.stopService(serviceName);
      }

      logger.info('All services stopped successfully');
    } catch (error) {
      logger.error('Failed to stop all services', { error });
      throw error;
    } finally {
      this.shutdownInProgress = false;
    }
  }

  /**
   * Dispose all services and reset state
   */
  async disposeAllServices(): Promise<void> {
    await this.stopAllServices();

    const disposeOrder = this.calculateStartupOrder().reverse();
    logger.info(`Disposing services in order: ${disposeOrder.join(' -> ')}`);

    for (const serviceName of disposeOrder) {
      await this.disposeService(serviceName);
    }

    // Clear all registrations
    this.services.clear();
    this.dependencies = [];

    logger.info('All services disposed and state cleared');
  }

  /**
   * Start a specific service
   */
  private async startService(serviceName: string): Promise<void> {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service not registered: ${serviceName}`);
    }

    if (service.isStarted || service.isDisposed) {
      logger.debug(`Service ${serviceName} already started or disposed, skipping`);
      return;
    }

    try {
      // Check dependencies are started
      const deps = this.dependencies.find(d => d.service === serviceName);
      if (deps) {
        for (const depName of deps.dependsOn) {
          const depService = this.services.get(depName);
          if (!depService?.isStarted) {
            throw new Error(`Dependency ${depName} not started for service ${serviceName}`);
          }
        }
      }

      // Start the service
      if (service.startMethod && typeof service.instance[service.startMethod] === 'function') {
        await service.instance[service.startMethod]();
      }

      service.isStarted = true;
      logger.info(`Service started: ${serviceName}`);
    } catch (error) {
      logger.error(`Failed to start service: ${serviceName}`, { error });
      throw error;
    }
  }

  /**
   * Stop a specific service
   */
  private async stopService(serviceName: string): Promise<void> {
    const service = this.services.get(serviceName);
    if (!service || !service.isStarted || service.isDisposed) {
      return;
    }

    try {
      if (service.stopMethod && typeof service.instance[service.stopMethod] === 'function') {
        await service.instance[service.stopMethod]();
      }

      service.isStarted = false;
      logger.info(`Service stopped: ${serviceName}`);
    } catch (error) {
      logger.error(`Failed to stop service: ${serviceName}`, { error });
      // Continue with other services
    }
  }

  /**
   * Dispose a specific service
   */
  private async disposeService(serviceName: string): Promise<void> {
    const service = this.services.get(serviceName);
    if (!service || service.isDisposed) {
      return;
    }

    try {
      // Stop first if still running
      if (service.isStarted) {
        await this.stopService(serviceName);
      }

      // Dispose the service
      if (service.disposeMethod && typeof service.instance[service.disposeMethod] === 'function') {
        await service.instance[service.disposeMethod]();
      }

      // Reset static state if method exists
      if (service.resetStaticMethod && typeof service.instance.constructor[service.resetStaticMethod] === 'function') {
        service.instance.constructor[service.resetStaticMethod]();
      }

      service.isDisposed = true;
      logger.info(`Service disposed: ${serviceName}`);
    } catch (error) {
      logger.error(`Failed to dispose service: ${serviceName}`, { error });
      // Continue with other services
    }
  }

  /**
   * Calculate service startup order based on dependencies
   */
  private calculateStartupOrder(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (serviceName: string) => {
      if (visited.has(serviceName)) {
        return;
      }

      if (visiting.has(serviceName)) {
        throw new Error(`Circular dependency detected involving service: ${serviceName}`);
      }

      visiting.add(serviceName);

      // Visit dependencies first
      const deps = this.dependencies.find(d => d.service === serviceName);
      if (deps) {
        for (const depName of deps.dependsOn) {
          visit(depName);
        }
      }

      visiting.delete(serviceName);
      visited.add(serviceName);
      order.push(serviceName);
    };

    // Visit all registered services
    for (const serviceName of this.services.keys()) {
      visit(serviceName);
    }

    return order;
  }

  /**
   * Get service status
   */
  getServiceStatus(serviceName: string): ServiceInstance | null {
    return this.services.get(serviceName) || null;
  }

  /**
   * Get all service statuses
   */
  getAllServiceStatuses(): Map<string, ServiceInstance> {
    return new Map(this.services);
  }

  /**
   * Check if all services are healthy
   */
  areAllServicesHealthy(): boolean {
    for (const service of this.services.values()) {
      if (!service.isStarted || service.isDisposed) {
        return false;
      }
    }
    return true;
  }
}
