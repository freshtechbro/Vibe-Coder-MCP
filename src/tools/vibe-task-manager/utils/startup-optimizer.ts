/**
 * Startup Optimizer for Vibe Task Manager
 *
 * Implements performance optimizations for application startup:
 * - Service initialization ordering
 * - Connection pooling
 * - Lazy loading
 * - Preloading critical services
 * - Startup time monitoring
 */

import { ConfigLoader, PerformanceConfig } from './config-loader.js';
import { TaskManagerMemoryManager } from './memory-manager-integration.js';
import { PerformanceMonitor } from './performance-monitor.js';
import logger from '../../../logger.js';

/**
 * Service initialization priority levels
 */
export enum ServicePriority {
  CRITICAL = 0,    // Must load first (config, logging)
  HIGH = 1,        // Core services (storage, orchestrator)
  MEDIUM = 2,      // Feature services (NLP, decomposition)
  LOW = 3          // Optional services (monitoring, analytics)
}

/**
 * Service definition for startup optimization
 */
export interface ServiceDefinition {
  name: string;
  priority: ServicePriority;
  dependencies: string[];
  initFunction: () => Promise<void>;
  lazy: boolean;
  preload: boolean;
}

/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
  maxConnections: number;
  minConnections: number;
  acquireTimeout: number;
  idleTimeout: number;
  maxRetries: number;
}

/**
 * Connection object for pool management
 */
export interface PoolConnection {
  id: number;
  type: 'http' | 'websocket';
  created: Date;
  lastUsed: Date;
  isActive: boolean;
}

/**
 * Connection pool interface
 */
export interface ConnectionPool {
  config: ConnectionPoolConfig;
  connections: Map<number, PoolConnection>;
  available: PoolConnection[];
  busy: Set<number>;
  acquire(): Promise<PoolConnection>;
  release(connection: PoolConnection): Promise<void>;
}

/**
 * Startup metrics
 */
export interface StartupMetrics {
  totalStartupTime: number;
  configLoadTime: number;
  serviceInitTime: number;
  connectionPoolTime: number;
  servicesLoaded: number;
  servicesLazy: number;
  memoryUsage: number;
  targetMet: boolean;
}

/**
 * Enhanced startup optimizer for <50ms performance target
 */
export class StartupOptimizer {
  private static instance: StartupOptimizer;
  private services: Map<string, ServiceDefinition> = new Map();
  private initializedServices: Set<string> = new Set();
  private connectionPools: Map<string, ConnectionPool> = new Map();
  private performanceConfig: PerformanceConfig;
  private startupMetrics: StartupMetrics | null = null;
  private startTime: number = 0;

  private constructor() {
    this.performanceConfig = ConfigLoader.getInstance().getPerformanceConfig();
    this.registerCoreServices();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): StartupOptimizer {
    if (!StartupOptimizer.instance) {
      StartupOptimizer.instance = new StartupOptimizer();
    }
    return StartupOptimizer.instance;
  }

  /**
   * Register core services with optimized initialization order
   */
  private registerCoreServices(): void {
    // Critical services (must load first)
    this.registerService({
      name: 'config-loader',
      priority: ServicePriority.CRITICAL,
      dependencies: [],
      initFunction: async () => {
        const configLoader = ConfigLoader.getInstance();
        await configLoader.loadConfig();
        await configLoader.warmupCache();
      },
      lazy: false,
      preload: true
    });

    this.registerService({
      name: 'memory-manager',
      priority: ServicePriority.CRITICAL,
      dependencies: ['config-loader'],
      initFunction: async () => {
        const config = await ConfigLoader.getInstance().getConfig();
        if (config?.taskManager.performance.memoryManagement.enabled) {
          TaskManagerMemoryManager.getInstance(config.taskManager.performance.memoryManagement);
        }
      },
      lazy: false,
      preload: true
    });

    // High priority services
    this.registerService({
      name: 'performance-monitor',
      priority: ServicePriority.HIGH,
      dependencies: ['config-loader'],
      initFunction: async () => {
        const config = await ConfigLoader.getInstance().getConfig();
        if (config?.taskManager.performance.monitoring.enabled) {
          const monitorConfig = {
            ...config.taskManager.performance.monitoring,
            bottleneckDetection: {
              enabled: true,
              analysisInterval: 30000, // 30 seconds
              minSampleSize: 10
            },
            regressionDetection: {
              enabled: true,
              baselineWindow: 24, // 24 hours
              comparisonWindow: 1, // 1 hour
              significanceThreshold: 20 // 20% degradation
            }
          };
          PerformanceMonitor.getInstance(monitorConfig);
        }
      },
      lazy: false,
      preload: true
    });

    this.registerService({
      name: 'connection-pools',
      priority: ServicePriority.HIGH,
      dependencies: ['config-loader'],
      initFunction: async () => {
        await this.initializeConnectionPools();
      },
      lazy: false,
      preload: true
    });

    // Medium priority services (can be lazy loaded)
    this.registerService({
      name: 'execution-coordinator',
      priority: ServicePriority.MEDIUM,
      dependencies: ['config-loader', 'memory-manager'],
      initFunction: async () => {
        // Lazy initialization - will be loaded when needed
      },
      lazy: true,
      preload: this.performanceConfig.preloadCriticalServices.includes('execution-coordinator')
    });

    this.registerService({
      name: 'agent-orchestrator',
      priority: ServicePriority.MEDIUM,
      dependencies: ['config-loader', 'connection-pools'],
      initFunction: async () => {
        // Lazy initialization - will be loaded when needed
      },
      lazy: true,
      preload: this.performanceConfig.preloadCriticalServices.includes('agent-orchestrator')
    });
  }

  /**
   * Register a service for startup optimization
   */
  registerService(service: ServiceDefinition): void {
    this.services.set(service.name, service);
    logger.debug({
      serviceName: service.name,
      priority: service.priority,
      lazy: service.lazy
    }, 'Service registered for startup optimization');
  }

  /**
   * Initialize connection pools for agent communication
   */
  private async initializeConnectionPools(): Promise<void> {
    const poolConfig: ConnectionPoolConfig = {
      maxConnections: this.performanceConfig.connectionPoolSize,
      minConnections: Math.ceil(this.performanceConfig.connectionPoolSize / 2),
      acquireTimeout: 5000,
      idleTimeout: 30000,
      maxRetries: 3
    };

    // HTTP connection pool
    const httpPool: ConnectionPool = {
      config: poolConfig,
      connections: new Map<number, PoolConnection>(),
      available: [],
      busy: new Set<number>(),

      async acquire(): Promise<PoolConnection> {
        // Simplified connection pool implementation
        const now = new Date();
        return {
          id: Date.now(),
          type: 'http',
          created: now,
          lastUsed: now,
          isActive: true
        };
      },

      async release(connection: PoolConnection): Promise<void> {
        // Release connection back to pool
        connection.lastUsed = new Date();
        connection.isActive = false;
      }
    };

    this.connectionPools.set('http', httpPool);

    // WebSocket connection pool
    const wsPool: ConnectionPool = {
      config: poolConfig,
      connections: new Map<number, PoolConnection>(),
      available: [],
      busy: new Set<number>(),

      async acquire(): Promise<PoolConnection> {
        const now = new Date();
        return {
          id: Date.now(),
          type: 'websocket',
          created: now,
          lastUsed: now,
          isActive: true
        };
      },

      async release(connection: PoolConnection): Promise<void> {
        // Release connection back to pool
        connection.lastUsed = new Date();
        connection.isActive = false;
      }
    };

    this.connectionPools.set('websocket', wsPool);

    logger.debug({ poolConfig }, 'Connection pools initialized');
  }

  /**
   * Optimize startup sequence for <50ms target
   */
  async optimizeStartup(): Promise<StartupMetrics> {
    this.startTime = performance.now();

    try {
      logger.debug('Starting optimized startup sequence');

      // Phase 1: Critical services (parallel where possible)
      const criticalServices = this.getServicesByPriority(ServicePriority.CRITICAL);
      await this.initializeServicesInParallel(criticalServices);

      // Phase 2: High priority services
      const highPriorityServices = this.getServicesByPriority(ServicePriority.HIGH);
      await this.initializeServicesInParallel(highPriorityServices);

      // Phase 3: Preload specified services
      if (this.performanceConfig.preloadCriticalServices.length > 0) {
        const preloadServices = this.getPreloadServices();
        await this.initializeServicesInParallel(preloadServices);
      }

      // Calculate metrics
      const totalTime = performance.now() - this.startTime;
      const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB

      this.startupMetrics = {
        totalStartupTime: totalTime,
        configLoadTime: 0, // Will be updated by individual services
        serviceInitTime: totalTime,
        connectionPoolTime: 0,
        servicesLoaded: this.initializedServices.size,
        servicesLazy: this.getLazyServices().length,
        memoryUsage,
        targetMet: totalTime < this.performanceConfig.maxStartupTime
      };

      if (this.startupMetrics.targetMet) {
        logger.info({
          totalTime,
          target: this.performanceConfig.maxStartupTime,
          servicesLoaded: this.startupMetrics.servicesLoaded
        }, 'Startup optimization successful - target met');
      } else {
        logger.warn({
          totalTime,
          target: this.performanceConfig.maxStartupTime,
          overage: totalTime - this.performanceConfig.maxStartupTime
        }, 'Startup optimization target missed');
      }

      return this.startupMetrics;

    } catch (error) {
      const totalTime = performance.now() - this.startTime;
      logger.error({
        err: error,
        totalTime
      }, 'Startup optimization failed');

      throw error;
    }
  }

  /**
   * Get services by priority level
   */
  private getServicesByPriority(priority: ServicePriority): ServiceDefinition[] {
    return Array.from(this.services.values())
      .filter(service => service.priority === priority && !service.lazy);
  }

  /**
   * Get services marked for preloading
   */
  private getPreloadServices(): ServiceDefinition[] {
    return Array.from(this.services.values())
      .filter(service => service.preload && !this.initializedServices.has(service.name));
  }

  /**
   * Get lazy-loaded services
   */
  private getLazyServices(): ServiceDefinition[] {
    return Array.from(this.services.values())
      .filter(service => service.lazy);
  }

  /**
   * Initialize services in parallel where dependencies allow
   */
  private async initializeServicesInParallel(services: ServiceDefinition[]): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (const service of services) {
      if (this.initializedServices.has(service.name)) {
        continue;
      }

      // Check if dependencies are met
      const dependenciesMet = service.dependencies.every(dep =>
        this.initializedServices.has(dep)
      );

      if (dependenciesMet) {
        initPromises.push(this.initializeService(service));
      }
    }

    await Promise.all(initPromises);
  }

  /**
   * Initialize a single service
   */
  private async initializeService(service: ServiceDefinition): Promise<void> {
    const startTime = performance.now();

    try {
      await service.initFunction();
      this.initializedServices.add(service.name);

      const initTime = performance.now() - startTime;
      logger.debug({
        serviceName: service.name,
        initTime
      }, 'Service initialized');

    } catch (error) {
      logger.error({
        err: error,
        serviceName: service.name
      }, 'Service initialization failed');
      throw error;
    }
  }

  /**
   * Get connection pool by type
   */
  getConnectionPool(type: string): ConnectionPool | undefined {
    return this.connectionPools.get(type);
  }

  /**
   * Get startup metrics
   */
  getStartupMetrics(): StartupMetrics | null {
    return this.startupMetrics;
  }

  /**
   * Check if service is initialized
   */
  isServiceInitialized(serviceName: string): boolean {
    return this.initializedServices.has(serviceName);
  }

  /**
   * Lazy load a service on demand
   */
  async lazyLoadService(serviceName: string): Promise<void> {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not found`);
    }

    if (this.initializedServices.has(serviceName)) {
      return; // Already initialized
    }

    await this.initializeService(service);
  }
}
