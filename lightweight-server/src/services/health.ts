/**
 * Health monitoring service for Repotools Lightweight Server
 * 
 * Monitors system health, resource usage, and service availability.
 * Provides health check endpoints and alerts for system issues.
 */

import { EventEmitter } from 'events';
import { cpus, totalmem, freemem, loadavg } from 'os';
import { promises as fs } from 'fs';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: ServiceHealth[];
  system: SystemMetrics;
  checks: HealthCheck[];
}

interface ServiceHealth {
  name: string;
  status: 'up' | 'down' | 'degraded';
  lastCheck: string;
  responseTime?: number;
  error?: string;
  metadata?: any;
}

interface SystemMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    usagePercent: number;
  };
  disk: {
    total: number;
    free: number;
    used: number;
    usagePercent: number;
  };
  process: {
    pid: number;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
}

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration: number;
  timestamp: string;
}

type HealthCheckFunction = () => Promise<Omit<HealthCheck, 'timestamp'>>;

class HealthService extends EventEmitter {
  private checks: Map<string, HealthCheckFunction> = new Map();
  private serviceStatuses: Map<string, ServiceHealth> = new Map();
  private checkInterval?: NodeJS.Timeout;
  private startTime: number;
  private lastCpuUsage?: NodeJS.CpuUsage;

  constructor() {
    super();
    this.startTime = Date.now();
    this.setupDefaultChecks();
  }

  public start(): void {
    logger.info('Starting health service...');

    // Run health checks periodically
    this.checkInterval = setInterval(() => {
      this.runHealthChecks();
    }, 30000); // Every 30 seconds

    // Initial health check
    this.runHealthChecks();

    logger.info('Health service started');
  }

  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    logger.info('Health service stopped');
  }

  private setupDefaultChecks(): void {
    // File system check
    this.registerCheck('filesystem', async () => {
      const start = Date.now();
      try {
        await fs.access(config.WORKSPACE_ROOT);
        return {
          name: 'filesystem',
          status: 'pass',
          message: 'Workspace accessible',
          duration: Date.now() - start,
        };
      } catch (error) {
        return {
          name: 'filesystem',
          status: 'fail',
          message: `Workspace inaccessible: ${(error as Error).message}`,
          duration: Date.now() - start,
        };
      }
    });

    // Memory usage check
    this.registerCheck('memory', async () => {
      const start = Date.now();
      const memoryUsage = process.memoryUsage();
      const totalMemory = totalmem();
      const usagePercent = (memoryUsage.rss / totalMemory) * 100;

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = `Memory usage: ${usagePercent.toFixed(1)}%`;

      if (usagePercent > 90) {
        status = 'fail';
        message += ' (critical)';
      } else if (usagePercent > 75) {
        status = 'warn';
        message += ' (high)';
      }

      return {
        name: 'memory',
        status,
        message,
        duration: Date.now() - start,
      };
    });

    // CPU usage check
    this.registerCheck('cpu', async () => {
      const start = Date.now();
      const loadAvg = loadavg();
      const cpuCount = cpus().length;
      const loadPercent = (loadAvg[0] / cpuCount) * 100;

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = `CPU load: ${loadPercent.toFixed(1)}%`;

      if (loadPercent > 90) {
        status = 'fail';
        message += ' (critical)';
      } else if (loadPercent > 75) {
        status = 'warn';
        message += ' (high)';
      }

      return {
        name: 'cpu',
        status,
        message,
        duration: Date.now() - start,
      };
    });

    // Disk space check
    this.registerCheck('disk', async () => {
      const start = Date.now();
      try {
        await fs.stat(config.WORKSPACE_ROOT);
        // Note: This is a simplified check. In production, you'd want to check actual disk space
        return {
          name: 'disk',
          status: 'pass',
          message: 'Disk space available',
          duration: Date.now() - start,
        };
      } catch (error) {
        return {
          name: 'disk',
          status: 'fail',
          message: `Disk check failed: ${(error as Error).message}`,
          duration: Date.now() - start,
        };
      }
    });
  }

  public registerCheck(name: string, checkFunction: HealthCheckFunction): void {
    this.checks.set(name, checkFunction);
    logger.debug(`Registered health check: ${name}`);
  }

  public unregisterCheck(name: string): boolean {
    const removed = this.checks.delete(name);
    if (removed) {
      logger.debug(`Unregistered health check: ${name}`);
    }
    return removed;
  }

  public registerService(name: string, status: Omit<ServiceHealth, 'name' | 'lastCheck'>): void {
    const serviceHealth: ServiceHealth = {
      name,
      lastCheck: new Date().toISOString(),
      ...status,
    };

    this.serviceStatuses.set(name, serviceHealth);
    logger.debug(`Registered service: ${name}`, { status: status.status });
  }

  public updateServiceStatus(name: string, status: Partial<Omit<ServiceHealth, 'name'>>): void {
    const existing = this.serviceStatuses.get(name);
    if (existing) {
      const updated: ServiceHealth = {
        ...existing,
        ...status,
        lastCheck: new Date().toISOString(),
      };
      this.serviceStatuses.set(name, updated);
    }
  }

  private async runHealthChecks(): Promise<void> {
    const checkResults: HealthCheck[] = [];

    for (const [name, checkFunction] of this.checks.entries()) {
      try {
        const result = await checkFunction();
        const check: HealthCheck = {
          ...result,
          timestamp: new Date().toISOString(),
        };
        checkResults.push(check);

        // Log warnings and failures
        if (check.status === 'warn') {
          logger.warn(`Health check warning: ${check.name} - ${check.message}`);
        } else if (check.status === 'fail') {
          logger.error(`Health check failed: ${check.name} - ${check.message}`);
        }
      } catch (error) {
        const check: HealthCheck = {
          name,
          status: 'fail',
          message: `Check error: ${(error as Error).message}`,
          duration: 0,
          timestamp: new Date().toISOString(),
        };
        checkResults.push(check);
        logger.error(`Health check error: ${name}`, error);
      }
    }

    // Emit health check results
    this.emit('healthChecks', checkResults);

    // Check for critical issues
    const criticalIssues = checkResults.filter(check => check.status === 'fail');
    if (criticalIssues.length > 0) {
      this.emit('criticalIssues', criticalIssues);
    }
  }

  private async getSystemMetrics(): Promise<SystemMetrics> {
    const memoryUsage = process.memoryUsage();
    const totalMemory = totalmem();
    const freeMemory = freemem();
    const usedMemory = totalMemory - freeMemory;

    // CPU usage calculation
    const currentCpuUsage = process.cpuUsage();
    let cpuPercent = 0;

    if (this.lastCpuUsage) {
      const userDiff = currentCpuUsage.user - this.lastCpuUsage.user;
      const systemDiff = currentCpuUsage.system - this.lastCpuUsage.system;
      const totalDiff = userDiff + systemDiff;
      cpuPercent = (totalDiff / 1000000) * 100; // Convert to percentage
    }

    this.lastCpuUsage = currentCpuUsage;

    return {
      cpu: {
        usage: cpuPercent,
        loadAverage: loadavg(),
        cores: cpus().length,
      },
      memory: {
        total: totalMemory,
        free: freeMemory,
        used: usedMemory,
        usagePercent: (usedMemory / totalMemory) * 100,
      },
      disk: {
        // Simplified - in production, use a proper disk space library
        total: 0,
        free: 0,
        used: 0,
        usagePercent: 0,
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage,
        cpuUsage: currentCpuUsage,
      },
    };
  }

  public async getStatus(): Promise<HealthStatus> {
    const systemMetrics = await this.getSystemMetrics();
    const services = Array.from(this.serviceStatuses.values());
    
    // Run health checks synchronously for status
    const checks: HealthCheck[] = [];
    for (const [name, checkFunction] of this.checks.entries()) {
      try {
        const result = await checkFunction();
        checks.push({
          ...result,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        checks.push({
          name,
          status: 'fail',
          message: `Check error: ${(error as Error).message}`,
          duration: 0,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Determine overall status
    const hasFailures = checks.some(check => check.status === 'fail') || 
                       services.some(service => service.status === 'down');
    const hasWarnings = checks.some(check => check.status === 'warn') || 
                       services.some(service => service.status === 'degraded');

    let overallStatus: HealthStatus['status'] = 'healthy';
    if (hasFailures) {
      overallStatus = 'unhealthy';
    } else if (hasWarnings) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: '1.0.0',
      services,
      system: systemMetrics,
      checks,
    };
  }

  // Utility methods for monitoring

  public getServiceStatus(name: string): ServiceHealth | undefined {
    return this.serviceStatuses.get(name);
  }

  public getAllServices(): ServiceHealth[] {
    return Array.from(this.serviceStatuses.values());
  }

  public getMetrics(): Promise<SystemMetrics> {
    return this.getSystemMetrics();
  }

  // Alert methods

  public onCriticalIssue(callback: (issues: HealthCheck[]) => void): void {
    this.on('criticalIssues', callback);
  }

  public onHealthCheck(callback: (checks: HealthCheck[]) => void): void {
    this.on('healthChecks', callback);
  }
}

export { HealthService, type HealthStatus, type ServiceHealth, type SystemMetrics, type HealthCheck };
