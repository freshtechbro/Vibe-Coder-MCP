/**
 * Initialization Monitor Utility
 * 
 * Tracks initialization performance and detects slow initialization patterns
 * to help identify potential issues with service startup and dependency loading.
 * 
 * Provides monitoring for:
 * - Service initialization timing
 * - Dependency loading performance
 * - Slow initialization detection
 * - Initialization failure tracking
 * - Performance metrics and reporting
 */

import logger from '../logger.js';

/**
 * Initialization phase information
 */
export interface InitializationPhase {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'completed' | 'failed';
  error?: Error;
  metadata?: Record<string, unknown>;
}

/**
 * Service initialization tracking
 */
export interface ServiceInitialization {
  serviceName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'completed' | 'failed';
  phases: InitializationPhase[];
  dependencies: string[];
  error?: Error;
  metadata?: Record<string, unknown>;
}

/**
 * Initialization statistics
 */
export interface InitializationStats {
  totalServices: number;
  completedServices: number;
  failedServices: number;
  pendingServices: number;
  averageInitTime: number;
  slowestService?: {
    name: string;
    duration: number;
  };
  fastestService?: {
    name: string;
    duration: number;
  };
  totalInitTime: number;
  criticalPath: string[];
}

/**
 * Monitor configuration
 */
export interface MonitorConfig {
  /** Threshold for slow initialization warning (ms) */
  slowInitThreshold: number;
  /** Threshold for critical slow initialization (ms) */
  criticalSlowThreshold: number;
  /** Whether to enable detailed logging */
  enableDetailedLogging: boolean;
  /** Whether to track dependency chains */
  trackDependencies: boolean;
  /** Maximum number of services to track */
  maxTrackedServices: number;
}

/**
 * Initialization Monitor implementation
 */
export class InitializationMonitor {
  private static instance: InitializationMonitor | null = null;
  private services = new Map<string, ServiceInitialization>();
  private globalStartTime?: number;
  private globalEndTime?: number;
  
  private readonly config: MonitorConfig = {
    slowInitThreshold: 5000, // 5 seconds
    criticalSlowThreshold: 15000, // 15 seconds
    enableDetailedLogging: true,
    trackDependencies: true,
    maxTrackedServices: 100
  };

  private constructor(config?: Partial<MonitorConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<MonitorConfig>): InitializationMonitor {
    if (!InitializationMonitor.instance) {
      InitializationMonitor.instance = new InitializationMonitor(config);
    }
    return InitializationMonitor.instance;
  }

  /**
   * Start tracking global initialization
   */
  startGlobalInitialization(): void {
    this.globalStartTime = Date.now();
    
    if (this.config.enableDetailedLogging) {
      logger.info('Global initialization monitoring started');
    }
  }

  /**
   * End tracking global initialization
   */
  endGlobalInitialization(): void {
    this.globalEndTime = Date.now();
    
    if (this.globalStartTime && this.config.enableDetailedLogging) {
      const totalTime = this.globalEndTime - this.globalStartTime;
      logger.info({ 
        totalInitTime: totalTime,
        servicesInitialized: this.services.size
      }, 'Global initialization completed');
      
      this.logInitializationSummary();
    }
  }

  /**
   * Start tracking service initialization
   */
  startServiceInitialization(
    serviceName: string, 
    dependencies: string[] = [],
    metadata?: Record<string, unknown>
  ): void {
    // Check if we're at the limit
    if (this.services.size >= this.config.maxTrackedServices) {
      logger.warn({ 
        serviceName, 
        maxServices: this.config.maxTrackedServices 
      }, 'Maximum tracked services reached, not tracking this service');
      return;
    }

    const startTime = Date.now();
    
    const serviceInit: ServiceInitialization = {
      serviceName,
      startTime,
      status: 'pending',
      phases: [],
      dependencies: [...dependencies],
      metadata
    };

    this.services.set(serviceName, serviceInit);

    if (this.config.enableDetailedLogging) {
      logger.debug({ 
        serviceName, 
        dependencies,
        metadata
      }, 'Started tracking service initialization');
    }
  }

  /**
   * End tracking service initialization
   */
  endServiceInitialization(serviceName: string, error?: Error): void {
    const service = this.services.get(serviceName);
    if (!service) {
      logger.warn({ serviceName }, 'Attempted to end tracking for unknown service');
      return;
    }

    const endTime = Date.now();
    const duration = endTime - service.startTime;

    service.endTime = endTime;
    service.duration = duration;
    service.status = error ? 'failed' : 'completed';
    service.error = error;

    // Check for slow initialization
    this.checkSlowInitialization(serviceName, duration);

    if (this.config.enableDetailedLogging) {
      const logLevel = error ? 'error' : 'debug';
      logger[logLevel]({ 
        serviceName, 
        duration,
        status: service.status,
        error: error?.message
      }, `Service initialization ${service.status}`);
    }
  }

  /**
   * Start tracking initialization phase
   */
  startPhase(
    serviceName: string, 
    phaseName: string,
    metadata?: Record<string, unknown>
  ): void {
    const service = this.services.get(serviceName);
    if (!service) {
      logger.warn({ serviceName, phaseName }, 'Attempted to start phase for unknown service');
      return;
    }

    const phase: InitializationPhase = {
      name: phaseName,
      startTime: Date.now(),
      status: 'pending',
      metadata
    };

    service.phases.push(phase);

    if (this.config.enableDetailedLogging) {
      logger.debug({ 
        serviceName, 
        phaseName,
        metadata
      }, 'Started initialization phase');
    }
  }

  /**
   * End tracking initialization phase
   */
  endPhase(serviceName: string, phaseName: string, error?: Error): void {
    const service = this.services.get(serviceName);
    if (!service) {
      logger.warn({ serviceName, phaseName }, 'Attempted to end phase for unknown service');
      return;
    }

    const phase = service.phases.find(p => p.name === phaseName && !p.endTime);
    if (!phase) {
      logger.warn({ serviceName, phaseName }, 'Attempted to end unknown or already ended phase');
      return;
    }

    const endTime = Date.now();
    phase.endTime = endTime;
    phase.duration = endTime - phase.startTime;
    phase.status = error ? 'failed' : 'completed';
    phase.error = error;

    if (this.config.enableDetailedLogging) {
      const logLevel = error ? 'warn' : 'debug';
      logger[logLevel]({ 
        serviceName, 
        phaseName,
        duration: phase.duration,
        status: phase.status,
        error: error?.message
      }, `Initialization phase ${phase.status}`);
    }
  }

  /**
   * Check for slow initialization and log warnings
   */
  private checkSlowInitialization(serviceName: string, duration: number): void {
    if (duration > this.config.criticalSlowThreshold) {
      logger.error({ 
        serviceName, 
        duration,
        threshold: this.config.criticalSlowThreshold
      }, 'Critical slow initialization detected');
    } else if (duration > this.config.slowInitThreshold) {
      logger.warn({ 
        serviceName, 
        duration,
        threshold: this.config.slowInitThreshold
      }, 'Slow initialization detected');
    }
  }

  /**
   * Get initialization statistics
   */
  getStatistics(): InitializationStats {
    const services = Array.from(this.services.values());
    const completedServices = services.filter(s => s.status === 'completed');
    const failedServices = services.filter(s => s.status === 'failed');
    const pendingServices = services.filter(s => s.status === 'pending');

    const completedDurations = completedServices
      .map(s => s.duration!)
      .filter(d => d !== undefined);

    const averageInitTime = completedDurations.length > 0 
      ? completedDurations.reduce((sum, d) => sum + d, 0) / completedDurations.length 
      : 0;

    let slowestService: { name: string; duration: number } | undefined;
    let fastestService: { name: string; duration: number } | undefined;

    if (completedServices.length > 0) {
      const sortedByDuration = completedServices
        .filter(s => s.duration !== undefined)
        .sort((a, b) => b.duration! - a.duration!);

      if (sortedByDuration.length > 0) {
        slowestService = {
          name: sortedByDuration[0].serviceName,
          duration: sortedByDuration[0].duration!
        };
        fastestService = {
          name: sortedByDuration[sortedByDuration.length - 1].serviceName,
          duration: sortedByDuration[sortedByDuration.length - 1].duration!
        };
      }
    }

    const totalInitTime = this.globalStartTime && this.globalEndTime 
      ? this.globalEndTime - this.globalStartTime 
      : 0;

    const criticalPath = this.calculateCriticalPath();

    return {
      totalServices: services.length,
      completedServices: completedServices.length,
      failedServices: failedServices.length,
      pendingServices: pendingServices.length,
      averageInitTime,
      slowestService,
      fastestService,
      totalInitTime,
      criticalPath
    };
  }

  /**
   * Calculate critical path for initialization
   */
  private calculateCriticalPath(): string[] {
    if (!this.config.trackDependencies) {
      return [];
    }

    // Simple critical path calculation based on dependencies
    const services = Array.from(this.services.values());
    const visited = new Set<string>();

    // Find services with no dependencies (root services)
    const rootServices = services.filter(s => s.dependencies.length === 0);
    
    // For now, return the longest initialization chain
    let longestChain: string[] = [];
    
    for (const root of rootServices) {
      const chain = this.findLongestChain(root.serviceName, visited, services);
      if (chain.length > longestChain.length) {
        longestChain = chain;
      }
    }

    return longestChain;
  }

  /**
   * Find longest dependency chain
   */
  private findLongestChain(
    serviceName: string, 
    visited: Set<string>, 
    services: ServiceInitialization[]
  ): string[] {
    if (visited.has(serviceName)) {
      return [];
    }

    visited.add(serviceName);
    const service = services.find(s => s.serviceName === serviceName);
    
    if (!service) {
      return [serviceName];
    }

    let longestSubChain: string[] = [];
    
    for (const dep of service.dependencies) {
      const subChain = this.findLongestChain(dep, new Set(visited), services);
      if (subChain.length > longestSubChain.length) {
        longestSubChain = subChain;
      }
    }

    return [serviceName, ...longestSubChain];
  }

  /**
   * Log initialization summary
   */
  private logInitializationSummary(): void {
    const stats = this.getStatistics();
    
    logger.info({
      totalServices: stats.totalServices,
      completed: stats.completedServices,
      failed: stats.failedServices,
      pending: stats.pendingServices,
      averageInitTime: Math.round(stats.averageInitTime),
      totalInitTime: stats.totalInitTime,
      slowestService: stats.slowestService,
      fastestService: stats.fastestService
    }, 'Initialization summary');

    if (stats.failedServices > 0) {
      const failedServices = Array.from(this.services.values())
        .filter(s => s.status === 'failed')
        .map(s => ({ name: s.serviceName, error: s.error?.message }));
      
      logger.warn({ failedServices }, 'Some services failed to initialize');
    }
  }

  /**
   * Get service details
   */
  getServiceDetails(serviceName: string): ServiceInitialization | undefined {
    return this.services.get(serviceName);
  }

  /**
   * Get all tracked services
   */
  getAllServices(): ServiceInitialization[] {
    return Array.from(this.services.values());
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.services.clear();
    this.globalStartTime = undefined;
    this.globalEndTime = undefined;
    
    if (this.config.enableDetailedLogging) {
      logger.debug('Initialization monitoring data cleared');
    }
  }

  /**
   * Reset singleton instance (for testing)
   */
  static reset(): void {
    InitializationMonitor.instance = null;
  }
}
