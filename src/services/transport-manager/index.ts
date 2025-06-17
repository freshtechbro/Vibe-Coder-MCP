/**
 * Transport Manager - Unified Transport Service Orchestrator
 *
 * Manages all transport services for the unified communication protocol
 * Handles startup, shutdown, and coordination of stdio, SSE, WebSocket, and HTTP transports
 */

import logger from '../../logger.js';
import { sseNotifier } from '../sse-notifier/index.js';
import { websocketServer } from '../websocket-server/index.js';
import { httpAgentAPI } from '../http-agent-api/index.js';
import { PortRange, PortAllocator } from '../../utils/port-allocator.js';

// Transport configuration interface
export interface TransportConfig {
  sse: {
    enabled: boolean;
    port?: number;           // Optional: for dynamic allocation
    portRange?: PortRange;   // Optional: for port range specification
    allocatedPort?: number;  // Optional: tracks actual allocated port
    // SSE is integrated with MCP server, no separate port needed
  };
  websocket: {
    enabled: boolean;
    port: number;            // Existing: backwards compatibility
    portRange?: PortRange;   // New: for port range specification
    allocatedPort?: number;  // New: tracks actual allocated port
    path: string;
  };
  http: {
    enabled: boolean;
    port: number;            // Existing: backwards compatibility
    portRange?: PortRange;   // New: for port range specification
    allocatedPort?: number;  // New: tracks actual allocated port
    cors: boolean;
  };
  stdio: {
    enabled: boolean;
    // stdio is handled by MCP server directly
  };
}

// Default transport configuration
const DEFAULT_CONFIG: TransportConfig = {
  sse: {
    enabled: true
  },
  websocket: {
    enabled: true,
    port: 8080,
    path: '/agent-ws'
  },
  http: {
    enabled: true,
    port: 3011,
    cors: true
  },
  stdio: {
    enabled: true
  }
};

// Default port ranges for dynamic allocation
const DEFAULT_PORT_RANGES = {
  websocket: { start: 8080, end: 8090, service: 'websocket' },
  http: { start: 3011, end: 3030, service: 'http' },
  sse: { start: 3000, end: 3010, service: 'sse' }
};

/**
 * Read port ranges from environment variables with enhanced error handling
 * Single port variables (WEBSOCKET_PORT) take priority over range variables (WEBSOCKET_PORT_RANGE)
 * Handles malformed values gracefully with detailed error reporting
 * @returns Object with port ranges for each service
 */
function getPortRangesFromEnvironment(): { websocket: PortRange; http: PortRange; sse: PortRange } {
  logger.debug('Reading port ranges from environment variables with enhanced error handling');

  const envVarErrors: Array<{ variable: string; value: string; error: string }> = [];
  const envVarWarnings: Array<{ variable: string; value: string; warning: string }> = [];

  // Helper function to safely parse environment variable with detailed error handling
  function safeParsePortRange(
    primaryVar: string,
    primaryValue: string | undefined,
    fallbackVar: string,
    fallbackValue: string | undefined,
    defaultRange: PortRange,
    serviceName: string
  ): { range: PortRange; source: string } {
    // Try primary variable first
    if (primaryValue) {
      try {
        const range = PortAllocator.parsePortRange(primaryValue, defaultRange);

        // Check if parsing actually used the provided value or fell back to default
        if (range.start === defaultRange.start && range.end === defaultRange.end &&
            primaryValue !== `${defaultRange.start}-${defaultRange.end}` &&
            primaryValue !== defaultRange.start.toString()) {
          // Parsing fell back to default, which means the value was invalid
          envVarErrors.push({
            variable: primaryVar,
            value: primaryValue,
            error: 'Invalid format, using default range'
          });
          logger.warn({
            variable: primaryVar,
            value: primaryValue,
            defaultUsed: `${defaultRange.start}-${defaultRange.end}`,
            service: serviceName
          }, `Invalid environment variable format for ${primaryVar}, using default`);
        } else {
          logger.debug({
            variable: primaryVar,
            value: primaryValue,
            parsed: `${range.start}-${range.end}`,
            service: serviceName
          }, `Successfully parsed ${primaryVar}`);
        }

        return { range, source: primaryVar };
      } catch (error) {
        envVarErrors.push({
          variable: primaryVar,
          value: primaryValue,
          error: error instanceof Error ? error.message : 'Parse error'
        });
        logger.error({
          variable: primaryVar,
          value: primaryValue,
          error: error instanceof Error ? error.message : 'Unknown error',
          service: serviceName
        }, `Failed to parse ${primaryVar}, trying fallback`);
      }
    }

    // Try fallback variable
    if (fallbackValue) {
      try {
        const range = PortAllocator.parsePortRange(fallbackValue, defaultRange);

        // Check if parsing actually used the provided value or fell back to default
        if (range.start === defaultRange.start && range.end === defaultRange.end &&
            fallbackValue !== `${defaultRange.start}-${defaultRange.end}` &&
            fallbackValue !== defaultRange.start.toString()) {
          // Parsing fell back to default, which means the value was invalid
          envVarErrors.push({
            variable: fallbackVar,
            value: fallbackValue,
            error: 'Invalid format, using default range'
          });
          logger.warn({
            variable: fallbackVar,
            value: fallbackValue,
            defaultUsed: `${defaultRange.start}-${defaultRange.end}`,
            service: serviceName
          }, `Invalid environment variable format for ${fallbackVar}, using default`);
        } else {
          logger.debug({
            variable: fallbackVar,
            value: fallbackValue,
            parsed: `${range.start}-${range.end}`,
            service: serviceName
          }, `Successfully parsed ${fallbackVar}`);
        }

        return { range, source: fallbackVar };
      } catch (error) {
        envVarErrors.push({
          variable: fallbackVar,
          value: fallbackValue,
          error: error instanceof Error ? error.message : 'Parse error'
        });
        logger.error({
          variable: fallbackVar,
          value: fallbackValue,
          error: error instanceof Error ? error.message : 'Unknown error',
          service: serviceName
        }, `Failed to parse ${fallbackVar}, using default`);
      }
    }

    // Use default range
    logger.info({
      service: serviceName,
      defaultRange: `${defaultRange.start}-${defaultRange.end}`,
      reason: 'No valid environment variables found'
    }, `Using default port range for ${serviceName} service`);

    return { range: defaultRange, source: 'default' };
  }

  // WebSocket port configuration with error handling
  const websocketResult = safeParsePortRange(
    'WEBSOCKET_PORT',
    process.env.WEBSOCKET_PORT,
    'WEBSOCKET_PORT_RANGE',
    process.env.WEBSOCKET_PORT_RANGE,
    DEFAULT_PORT_RANGES.websocket,
    'websocket'
  );

  // HTTP port configuration with error handling
  const httpResult = safeParsePortRange(
    'HTTP_AGENT_PORT',
    process.env.HTTP_AGENT_PORT,
    'HTTP_AGENT_PORT_RANGE',
    process.env.HTTP_AGENT_PORT_RANGE,
    DEFAULT_PORT_RANGES.http,
    'http'
  );

  // SSE port configuration with error handling
  const sseResult = safeParsePortRange(
    'SSE_PORT',
    process.env.SSE_PORT,
    'SSE_PORT_RANGE',
    process.env.SSE_PORT_RANGE,
    DEFAULT_PORT_RANGES.sse,
    'sse'
  );

  // Log comprehensive environment variable summary
  logger.info({
    websocket: {
      source: websocketResult.source,
      range: `${websocketResult.range.start}-${websocketResult.range.end}`,
      envVars: {
        WEBSOCKET_PORT: process.env.WEBSOCKET_PORT || 'not set',
        WEBSOCKET_PORT_RANGE: process.env.WEBSOCKET_PORT_RANGE || 'not set'
      }
    },
    http: {
      source: httpResult.source,
      range: `${httpResult.range.start}-${httpResult.range.end}`,
      envVars: {
        HTTP_AGENT_PORT: process.env.HTTP_AGENT_PORT || 'not set',
        HTTP_AGENT_PORT_RANGE: process.env.HTTP_AGENT_PORT_RANGE || 'not set'
      }
    },
    sse: {
      source: sseResult.source,
      range: `${sseResult.range.start}-${sseResult.range.end}`,
      envVars: {
        SSE_PORT: process.env.SSE_PORT || 'not set',
        SSE_PORT_RANGE: process.env.SSE_PORT_RANGE || 'not set'
      }
    },
    errors: envVarErrors,
    warnings: envVarWarnings
  }, 'Port ranges configured from environment with enhanced error handling');

  // Log summary of environment variable issues
  if (envVarErrors.length > 0) {
    logger.warn({
      errorCount: envVarErrors.length,
      errors: envVarErrors,
      impact: 'Using default port ranges for affected services'
    }, 'Environment variable parsing errors detected');
  }

  if (envVarWarnings.length > 0) {
    logger.info({
      warningCount: envVarWarnings.length,
      warnings: envVarWarnings
    }, 'Environment variable parsing warnings');
  }

  return {
    websocket: websocketResult.range,
    http: httpResult.range,
    sse: sseResult.range
  };
}

/**
 * Validate port ranges for overlaps and conflicts
 * @param ranges - Object with port ranges for each service
 * @returns Validation result with warnings
 */
function validatePortRanges(ranges: { websocket: PortRange; http: PortRange; sse: PortRange }): {
  valid: boolean;
  warnings: string[];
  overlaps: Array<{ service1: string; service2: string; conflictRange: string }>;
} {
  const warnings: string[] = [];
  const overlaps: Array<{ service1: string; service2: string; conflictRange: string }> = [];

  // Check for overlaps between services
  const services = Object.entries(ranges);

  for (let i = 0; i < services.length; i++) {
    for (let j = i + 1; j < services.length; j++) {
      const [service1Name, range1] = services[i];
      const [service2Name, range2] = services[j];

      // Check if ranges overlap
      const overlapStart = Math.max(range1.start, range2.start);
      const overlapEnd = Math.min(range1.end, range2.end);

      if (overlapStart <= overlapEnd) {
        const conflictRange = overlapStart === overlapEnd ?
          `${overlapStart}` :
          `${overlapStart}-${overlapEnd}`;

        overlaps.push({
          service1: service1Name,
          service2: service2Name,
          conflictRange
        });

        warnings.push(
          `Port range overlap detected: ${service1Name} (${range1.start}-${range1.end}) ` +
          `and ${service2Name} (${range2.start}-${range2.end}) conflict on ports ${conflictRange}`
        );
      }
    }
  }

  // Log validation results
  if (overlaps.length > 0) {
    logger.warn({ overlaps, warnings }, 'Port range validation found conflicts');
  } else {
    logger.debug('Port range validation passed - no conflicts detected');
  }

  return {
    valid: overlaps.length === 0,
    warnings,
    overlaps
  };
}

// Transport manager singleton
class TransportManager {
  private static instance: TransportManager;
  private config: TransportConfig;
  private isStarted = false;
  private startedServices: string[] = [];
  private startupTimestamp?: number;

  static getInstance(): TransportManager {
    if (!TransportManager.instance) {
      TransportManager.instance = new TransportManager();
    }
    return TransportManager.instance;
  }

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Configure transport settings
   */
  configure(config: Partial<TransportConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      sse: { ...this.config.sse, ...config.sse },
      websocket: { ...this.config.websocket, ...config.websocket },
      http: { ...this.config.http, ...config.http },
      stdio: { ...this.config.stdio, ...config.stdio }
    };

    logger.info({ config: this.config }, 'Transport manager configured');
  }

  /**
   * Start all enabled transport services with dynamic port allocation
   */
  async startAll(): Promise<void> {
    if (this.isStarted) {
      logger.warn('Transport manager already started');
      return;
    }

    try {
      this.startupTimestamp = Date.now();
      logger.info('Starting unified communication protocol transport services with dynamic port allocation...');

      // 1. Get port ranges from environment variables
      const portRanges = getPortRangesFromEnvironment();

      // 2. Validate port ranges for conflicts
      const validation = validatePortRanges(portRanges);
      if (!validation.valid) {
        validation.warnings.forEach(warning => logger.warn(warning));
      }

      // 3. Allocate ports for services that need them
      const servicesToAllocate: PortRange[] = [];

      if (this.config.websocket.enabled) {
        servicesToAllocate.push(portRanges.websocket);
      }

      if (this.config.http.enabled) {
        servicesToAllocate.push(portRanges.http);
      }

      if (this.config.sse.enabled && this.config.sse.portRange) {
        servicesToAllocate.push(portRanges.sse);
      }

      // 4. Perform batch port allocation
      const allocationSummary = await PortAllocator.allocatePortsForServices(servicesToAllocate);

      // 5. Update configuration with allocated ports
      for (const [serviceName, allocation] of allocationSummary.allocations) {
        if (allocation.success) {
          if (serviceName === 'websocket') {
            this.config.websocket.allocatedPort = allocation.port;
          } else if (serviceName === 'http') {
            this.config.http.allocatedPort = allocation.port;
          } else if (serviceName === 'sse') {
            this.config.sse.allocatedPort = allocation.port;
          }
        }
      }

      // 6. Start services with allocated ports
      await this.startServicesWithAllocatedPorts(allocationSummary);

      this.isStarted = true;

      // 7. Log comprehensive startup summary
      this.logStartupSummary(allocationSummary);

    } catch (error) {
      logger.error({ err: error }, 'Failed to start transport services');

      // Attempt to stop any services that were started
      await this.stopAll().catch(stopError => {
        logger.error({ err: stopError }, 'Failed to cleanup after startup failure');
      });

      throw error;
    }
  }

  /**
   * Start individual services with their allocated ports using graceful degradation
   */
  private async startServicesWithAllocatedPorts(allocationSummary: any): Promise<void> {
    const serviceFailures: Array<{ service: string; reason: string; error?: any }> = [];
    const serviceSuccesses: Array<{ service: string; port?: number; note?: string }> = [];

    logger.info('Starting transport services with graceful degradation enabled');

    // Start stdio transport (handled by MCP server - just log)
    if (this.config.stdio.enabled) {
      try {
        logger.info('stdio transport: Enabled (handled by MCP server)');
        this.startedServices.push('stdio');
        serviceSuccesses.push({ service: 'stdio', note: 'MCP server managed' });
      } catch (error) {
        const failure = { service: 'stdio', reason: 'Startup failed', error };
        serviceFailures.push(failure);
        logger.error({ err: error }, 'stdio transport: Failed to start');
      }
    }

    // Start SSE transport (integrated with MCP server - just log)
    if (this.config.sse.enabled) {
      try {
        logger.info('SSE transport: Enabled (integrated with MCP server)');
        this.startedServices.push('sse');
        serviceSuccesses.push({ service: 'sse', note: 'MCP server integrated' });
      } catch (error) {
        const failure = { service: 'sse', reason: 'Startup failed', error };
        serviceFailures.push(failure);
        logger.error({ err: error }, 'SSE transport: Failed to start');
      }
    }

    // Start WebSocket transport with allocated port, retry logic, and graceful degradation
    if (this.config.websocket.enabled) {
      const allocation = allocationSummary.allocations.get('websocket');
      if (allocation && allocation.success) {
        try {
          await websocketServer.start(allocation.port);
          logger.info({
            port: allocation.port,
            path: this.config.websocket.path,
            attempted: allocation.attempted.length
          }, 'WebSocket transport: Started with allocated port');
          this.startedServices.push('websocket');
          serviceSuccesses.push({ service: 'websocket', port: allocation.port });
        } catch (error) {
          logger.warn({
            err: error,
            port: allocation.port,
            retryEnabled: true
          }, 'WebSocket transport: Initial startup failed, attempting retry with alternative ports');

          // Attempt retry with alternative ports
          const retryResult = await this.retryServiceStartup('websocket', {
            start: this.config.websocket.port,
            end: this.config.websocket.port + 10,
            service: 'websocket'
          });

          if (retryResult.success) {
            logger.info({
              port: retryResult.port,
              attempts: retryResult.attempts,
              path: this.config.websocket.path
            }, 'WebSocket transport: Started successfully after retry');
            this.startedServices.push('websocket');
            serviceSuccesses.push({ service: 'websocket', port: retryResult.port });
          } else {
            const failure = { service: 'websocket', reason: 'Service startup failed after retries', error };
            serviceFailures.push(failure);
            logger.error({
              attempts: retryResult.attempts,
              error: retryResult.error,
              gracefulDegradation: true
            }, 'WebSocket transport: Failed to start after retries, continuing with other transports');
          }
        }
      } else {
        // Try retry even if initial allocation failed
        logger.warn({
          allocation: allocation || 'none',
          retryEnabled: true
        }, 'WebSocket transport: Initial port allocation failed, attempting retry with alternative ports');

        const retryResult = await this.retryServiceStartup('websocket', {
          start: this.config.websocket.port,
          end: this.config.websocket.port + 10,
          service: 'websocket'
        });

        if (retryResult.success) {
          logger.info({
            port: retryResult.port,
            attempts: retryResult.attempts,
            path: this.config.websocket.path
          }, 'WebSocket transport: Started successfully after retry');
          this.startedServices.push('websocket');
          serviceSuccesses.push({ service: 'websocket', port: retryResult.port });
        } else {
          const failure = { service: 'websocket', reason: 'Port allocation and retries failed' };
          serviceFailures.push(failure);
          logger.warn({
            attempts: retryResult.attempts,
            error: retryResult.error,
            gracefulDegradation: true
          }, 'WebSocket transport: Failed to allocate port after retries, continuing with other transports');
        }
      }
    }

    // Start HTTP transport with allocated port, retry logic, and graceful degradation
    if (this.config.http.enabled) {
      const allocation = allocationSummary.allocations.get('http');
      if (allocation && allocation.success) {
        try {
          await httpAgentAPI.start(allocation.port);
          logger.info({
            port: allocation.port,
            cors: this.config.http.cors,
            attempted: allocation.attempted.length
          }, 'HTTP transport: Started with allocated port');
          this.startedServices.push('http');
          serviceSuccesses.push({ service: 'http', port: allocation.port });
        } catch (error) {
          logger.warn({
            err: error,
            port: allocation.port,
            retryEnabled: true
          }, 'HTTP transport: Initial startup failed, attempting retry with alternative ports');

          // Attempt retry with alternative ports
          const retryResult = await this.retryServiceStartup('http', {
            start: this.config.http.port,
            end: this.config.http.port + 20,
            service: 'http'
          });

          if (retryResult.success) {
            logger.info({
              port: retryResult.port,
              attempts: retryResult.attempts,
              cors: this.config.http.cors
            }, 'HTTP transport: Started successfully after retry');
            this.startedServices.push('http');
            serviceSuccesses.push({ service: 'http', port: retryResult.port });
          } else {
            const failure = { service: 'http', reason: 'Service startup failed after retries', error };
            serviceFailures.push(failure);
            logger.error({
              attempts: retryResult.attempts,
              error: retryResult.error,
              gracefulDegradation: true
            }, 'HTTP transport: Failed to start after retries, continuing with other transports');
          }
        }
      } else {
        // Try retry even if initial allocation failed
        logger.warn({
          allocation: allocation || 'none',
          retryEnabled: true
        }, 'HTTP transport: Initial port allocation failed, attempting retry with alternative ports');

        const retryResult = await this.retryServiceStartup('http', {
          start: this.config.http.port,
          end: this.config.http.port + 20,
          service: 'http'
        });

        if (retryResult.success) {
          logger.info({
            port: retryResult.port,
            attempts: retryResult.attempts,
            cors: this.config.http.cors
          }, 'HTTP transport: Started successfully after retry');
          this.startedServices.push('http');
          serviceSuccesses.push({ service: 'http', port: retryResult.port });
        } else {
          const failure = { service: 'http', reason: 'Port allocation and retries failed' };
          serviceFailures.push(failure);
          logger.warn({
            attempts: retryResult.attempts,
            error: retryResult.error,
            gracefulDegradation: true
          }, 'HTTP transport: Failed to allocate port after retries, continuing with other transports');
        }
      }
    }

    // Log graceful degradation summary
    this.logGracefulDegradationSummary(serviceSuccesses, serviceFailures);
  }

  /**
   * Log graceful degradation summary showing which services started and which failed
   */
  private logGracefulDegradationSummary(
    successes: Array<{ service: string; port?: number; note?: string }>,
    failures: Array<{ service: string; reason: string; error?: any }>
  ): void {
    const totalServices = successes.length + failures.length;
    const successRate = totalServices > 0 ? (successes.length / totalServices * 100).toFixed(1) : '0';

    logger.info({
      gracefulDegradation: {
        totalServices,
        successfulServices: successes.length,
        failedServices: failures.length,
        successRate: `${successRate}%`,
        availableTransports: successes.map(s => s.service),
        failedTransports: failures.map(f => f.service)
      },
      serviceDetails: {
        successes: successes.map(s => ({
          service: s.service,
          port: s.port || 'N/A',
          note: s.note || 'Network service'
        })),
        failures: failures.map(f => ({
          service: f.service,
          reason: f.reason,
          hasError: !!f.error
        }))
      }
    }, 'Graceful degradation summary: Transport services startup completed');

    // Log specific degradation scenarios
    if (failures.length > 0) {
      if (successes.length === 0) {
        logger.error('Critical: All transport services failed to start');
      } else if (failures.some(f => f.service === 'websocket') && failures.some(f => f.service === 'http')) {
        logger.warn('Network transports (WebSocket + HTTP) failed, continuing with SSE + stdio only');
      } else if (failures.some(f => f.service === 'websocket')) {
        logger.warn('WebSocket transport failed, continuing with HTTP + SSE + stdio');
      } else if (failures.some(f => f.service === 'http')) {
        logger.warn('HTTP transport failed, continuing with WebSocket + SSE + stdio');
      }
    } else {
      logger.info('All enabled transport services started successfully');
    }
  }

  /**
   * Log comprehensive startup summary with enhanced port allocation details
   */
  private logStartupSummary(allocationSummary: any): void {
    const successful: number[] = [];
    const attempted: number[] = [];
    const conflicts: number[] = [];
    const serviceDetails: Record<string, any> = {};

    // Collect detailed allocation information per service
    for (const [serviceName, allocation] of allocationSummary.allocations) {
      attempted.push(...allocation.attempted);

      serviceDetails[serviceName] = {
        requested: allocation.attempted[0], // First port attempted (from config/env)
        allocated: allocation.success ? allocation.port : null,
        attempts: allocation.attempted.length,
        attemptedPorts: allocation.attempted,
        success: allocation.success,
        conflicts: allocation.success ? [] : allocation.attempted
      };

      if (allocation.success) {
        successful.push(allocation.port);
      } else {
        conflicts.push(...allocation.attempted);
      }
    }

    // Calculate allocation statistics
    const allocationStats = {
      totalServicesRequested: allocationSummary.allocations.size,
      successfulAllocations: successful.length,
      failedAllocations: allocationSummary.allocations.size - successful.length,
      successRate: (successful.length / allocationSummary.allocations.size * 100).toFixed(1),
      totalPortsAttempted: attempted.length,
      uniquePortsAttempted: [...new Set(attempted)].length,
      conflictedPorts: [...new Set(conflicts)],
      conflictCount: [...new Set(conflicts)].length
    };

    // Enhanced service status with allocated ports
    const enhancedServiceStatus = {
      total: this.startedServices.length,
      started: this.startedServices,
      websocket: this.config.websocket.allocatedPort ?
        {
          port: this.config.websocket.allocatedPort,
          status: 'started',
          endpoint: `ws://localhost:${this.config.websocket.allocatedPort}${this.config.websocket.path}`,
          allocation: serviceDetails.websocket || null
        } :
        {
          status: 'failed',
          allocation: serviceDetails.websocket || null
        },
      http: this.config.http.allocatedPort ?
        {
          port: this.config.http.allocatedPort,
          status: 'started',
          endpoint: `http://localhost:${this.config.http.allocatedPort}`,
          allocation: serviceDetails.http || null
        } :
        {
          status: 'failed',
          allocation: serviceDetails.http || null
        },
      sse: {
        status: 'integrated',
        note: 'MCP server',
        port: this.config.sse.allocatedPort || 'N/A',
        allocation: serviceDetails.sse || null
      },
      stdio: {
        status: 'enabled',
        note: 'MCP server',
        allocation: 'N/A (no network port required)'
      }
    };

    // Log comprehensive startup summary
    logger.info({
      summary: 'Transport services startup completed with dynamic port allocation',
      services: enhancedServiceStatus,
      portAllocation: {
        statistics: allocationStats,
        attempted: [...new Set(attempted)],
        successful,
        conflicts: [...new Set(conflicts)],
        serviceDetails
      },
      performance: {
        startupTime: Date.now() - (this.startupTimestamp || Date.now()),
        servicesStarted: this.startedServices.length,
        portsAllocated: successful.length
      }
    }, 'Transport Manager: Startup Summary with Dynamic Port Allocation');

    // Log individual service allocation details for debugging
    for (const [serviceName, details] of Object.entries(serviceDetails)) {
      if (details.success) {
        logger.info({
          service: serviceName,
          requestedPort: details.requested,
          allocatedPort: details.allocated,
          attempts: details.attempts,
          status: 'success'
        }, `Port allocation successful: ${serviceName} service`);
      } else {
        logger.warn({
          service: serviceName,
          requestedPort: details.requested,
          attemptedPorts: details.attemptedPorts,
          attempts: details.attempts,
          conflicts: details.conflicts,
          status: 'failed'
        }, `Port allocation failed: ${serviceName} service`);
      }
    }

    // Log allocation summary statistics
    logger.info({
      successRate: `${allocationStats.successRate}%`,
      successful: allocationStats.successfulAllocations,
      failed: allocationStats.failedAllocations,
      totalAttempts: allocationStats.totalPortsAttempted,
      conflicts: allocationStats.conflictCount
    }, 'Port Allocation Summary Statistics');

    // Log detailed service status for each transport
    this.logDetailedServiceStatus();
  }

  /**
   * Log detailed status for each service with allocated ports and health information
   */
  private logDetailedServiceStatus(): void {
    logger.info('=== Transport Service Status Details ===');

    // WebSocket Service Status
    if (this.config.websocket.enabled) {
      const wsStatus = {
        service: 'WebSocket',
        enabled: true,
        allocatedPort: this.config.websocket.allocatedPort,
        configuredPort: this.config.websocket.port,
        path: this.config.websocket.path,
        endpoint: this.config.websocket.allocatedPort ?
          `ws://localhost:${this.config.websocket.allocatedPort}${this.config.websocket.path}` :
          'Not available',
        status: this.startedServices.includes('websocket') ? 'running' : 'failed',
        connections: this.startedServices.includes('websocket') ?
          websocketServer.getConnectionCount() : 0
      };

      logger.info(wsStatus, 'WebSocket Service Status');
    } else {
      logger.info({ service: 'WebSocket', enabled: false }, 'WebSocket Service Status: Disabled');
    }

    // HTTP Service Status
    if (this.config.http.enabled) {
      const httpStatus = {
        service: 'HTTP Agent API',
        enabled: true,
        allocatedPort: this.config.http.allocatedPort,
        configuredPort: this.config.http.port,
        cors: this.config.http.cors,
        endpoint: this.config.http.allocatedPort ?
          `http://localhost:${this.config.http.allocatedPort}` :
          'Not available',
        status: this.startedServices.includes('http') ? 'running' : 'failed'
      };

      logger.info(httpStatus, 'HTTP Agent API Service Status');
    } else {
      logger.info({ service: 'HTTP Agent API', enabled: false }, 'HTTP Agent API Service Status: Disabled');
    }

    // SSE Service Status
    if (this.config.sse.enabled) {
      const sseStatus = {
        service: 'SSE (Server-Sent Events)',
        enabled: true,
        allocatedPort: this.config.sse.allocatedPort || 'Integrated with MCP server',
        endpoint: this.config.sse.allocatedPort ?
          `http://localhost:${this.config.sse.allocatedPort}/events` :
          'Integrated with MCP server',
        status: this.startedServices.includes('sse') ? 'running' : 'integrated',
        connections: this.startedServices.includes('sse') ?
          sseNotifier.getConnectionCount() : 'N/A',
        note: 'Integrated with MCP server lifecycle'
      };

      logger.info(sseStatus, 'SSE Service Status');
    } else {
      logger.info({ service: 'SSE', enabled: false }, 'SSE Service Status: Disabled');
    }

    // Stdio Service Status
    if (this.config.stdio.enabled) {
      const stdioStatus = {
        service: 'Stdio (Standard Input/Output)',
        enabled: true,
        port: 'N/A (no network port required)',
        endpoint: 'stdio://mcp-server',
        status: this.startedServices.includes('stdio') ? 'running' : 'enabled',
        note: 'Handled by MCP server directly'
      };

      logger.info(stdioStatus, 'Stdio Service Status');
    } else {
      logger.info({ service: 'Stdio', enabled: false }, 'Stdio Service Status: Disabled');
    }

    logger.info('=== End Transport Service Status Details ===');
  }

  /**
   * Retry service startup with alternative port allocation
   * @param serviceName - Name of the service to retry
   * @param originalRange - Original port range that failed
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns Promise<{ success: boolean; port?: number; attempts: number; error?: string }>
   */
  private async retryServiceStartup(
    serviceName: 'websocket' | 'http',
    originalRange: PortRange,
    maxRetries: number = 3
  ): Promise<{ success: boolean; port?: number; attempts: number; error?: string }> {
    logger.info({
      service: serviceName,
      originalRange: `${originalRange.start}-${originalRange.end}`,
      maxRetries,
      operation: 'service_retry_start'
    }, `Starting service retry for ${serviceName}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug({
          service: serviceName,
          attempt,
          maxRetries,
          operation: 'service_retry_attempt'
        }, `Retry attempt ${attempt} for ${serviceName} service`);

        // Create expanded port range for retry (add 10 ports to the end)
        const retryRange: PortRange = {
          start: originalRange.end + 1,
          end: originalRange.end + 10,
          service: serviceName
        };

        // Try to allocate a port in the retry range
        const allocationResult = await PortAllocator.findAvailablePortInRange(retryRange);

        if (allocationResult.success) {
          // Try to start the service with the new port
          if (serviceName === 'websocket') {
            await websocketServer.start(allocationResult.port);
            this.config.websocket.allocatedPort = allocationResult.port;
          } else if (serviceName === 'http') {
            await httpAgentAPI.start(allocationResult.port);
            this.config.http.allocatedPort = allocationResult.port;
          }

          logger.info({
            service: serviceName,
            port: allocationResult.port,
            attempt,
            retryRange: `${retryRange.start}-${retryRange.end}`,
            operation: 'service_retry_success'
          }, `Service retry successful for ${serviceName} on attempt ${attempt}`);

          return {
            success: true,
            port: allocationResult.port,
            attempts: attempt
          };
        } else {
          logger.warn({
            service: serviceName,
            attempt,
            retryRange: `${retryRange.start}-${retryRange.end}`,
            operation: 'service_retry_port_failed'
          }, `Port allocation failed for ${serviceName} retry attempt ${attempt}`);
        }

      } catch (error) {
        logger.warn({
          service: serviceName,
          attempt,
          error: error instanceof Error ? error.message : 'Unknown error',
          operation: 'service_retry_error'
        }, `Service startup failed for ${serviceName} retry attempt ${attempt}`);

        // If this is the last attempt, we'll return the error
        if (attempt === maxRetries) {
          return {
            success: false,
            attempts: attempt,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      }

      // Wait before next retry (exponential backoff)
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      logger.debug({
        service: serviceName,
        attempt,
        backoffMs,
        operation: 'service_retry_backoff'
      }, `Waiting ${backoffMs}ms before next retry attempt`);

      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }

    return {
      success: false,
      attempts: maxRetries,
      error: `All ${maxRetries} retry attempts failed`
    };
  }

  /**
   * Stop all transport services
   */
  async stopAll(): Promise<void> {
    if (!this.isStarted) {
      logger.warn('Transport manager not started');
      return;
    }

    try {
      logger.info('Stopping unified communication protocol transport services...');

      // Stop WebSocket transport
      if (this.startedServices.includes('websocket')) {
        await websocketServer.stop();
        logger.info('WebSocket transport: Stopped');
      }

      // Stop HTTP transport
      if (this.startedServices.includes('http')) {
        await httpAgentAPI.stop();
        logger.info('HTTP transport: Stopped');
      }

      // SSE and stdio are handled by MCP server lifecycle
      if (this.startedServices.includes('sse')) {
        logger.info('SSE transport: Stopped (handled by MCP server)');
      }

      if (this.startedServices.includes('stdio')) {
        logger.info('stdio transport: Stopped (handled by MCP server)');
      }

      this.isStarted = false;
      this.startedServices = [];

      logger.info('All transport services stopped successfully');

    } catch (error) {
      logger.error({ err: error }, 'Failed to stop transport services');
      throw error;
    }
  }

  /**
   * Restart all transport services
   */
  async restart(): Promise<void> {
    logger.info('Restarting transport services...');
    await this.stopAll();
    await this.startAll();
    logger.info('Transport services restarted successfully');
  }

  /**
   * Get transport service status
   */
  getStatus(): {
    isStarted: boolean;
    startedServices: string[];
    config: TransportConfig;
    serviceDetails: Record<string, any>;
  } {
    const serviceDetails: Record<string, any> = {};

    if (this.startedServices.includes('websocket')) {
      serviceDetails.websocket = {
        port: this.config.websocket.port,
        path: this.config.websocket.path,
        connections: websocketServer.getConnectionCount(),
        connectedAgents: websocketServer.getConnectedAgents()
      };
    }

    if (this.startedServices.includes('http')) {
      serviceDetails.http = {
        port: this.config.http.port,
        cors: this.config.http.cors
      };
    }

    if (this.startedServices.includes('sse')) {
      serviceDetails.sse = {
        connections: sseNotifier.getConnectionCount(),
        enabled: true
      };
    }

    if (this.startedServices.includes('stdio')) {
      serviceDetails.stdio = {
        enabled: true,
        note: 'Handled by MCP server'
      };
    }

    return {
      isStarted: this.isStarted,
      startedServices: this.startedServices,
      config: this.config,
      serviceDetails
    };
  }

  /**
   * Check if a specific transport is enabled and running
   */
  isTransportRunning(transport: 'stdio' | 'sse' | 'websocket' | 'http'): boolean {
    return this.isStarted && this.startedServices.includes(transport);
  }

  /**
   * Get configuration for a specific transport
   */
  getTransportConfig(transport: keyof TransportConfig): any {
    return this.config[transport];
  }

  /**
   * Enable or disable a specific transport
   */
  setTransportEnabled(transport: keyof TransportConfig, enabled: boolean): void {
    this.config[transport].enabled = enabled;
    logger.info({ transport, enabled }, 'Transport enabled status updated');
  }

  /**
   * Get all allocated ports for services
   * @returns Object with service names and their allocated ports (only for successfully started services)
   */
  getAllocatedPorts(): Record<string, number | undefined> {
    return {
      websocket: this.startedServices.includes('websocket') ? this.config.websocket.allocatedPort : undefined,
      http: this.startedServices.includes('http') ? this.config.http.allocatedPort : undefined,
      sse: this.startedServices.includes('sse') ? this.config.sse.allocatedPort : undefined,
      stdio: undefined // stdio doesn't use network ports
    };
  }

  /**
   * Get allocated port for a specific service
   * @param serviceName - Name of the service
   * @returns Allocated port number or undefined if not allocated or service not started
   */
  getServicePort(serviceName: 'websocket' | 'http' | 'sse' | 'stdio'): number | undefined {
    switch (serviceName) {
      case 'websocket':
        return this.startedServices.includes('websocket') ? this.config.websocket.allocatedPort : undefined;
      case 'http':
        return this.startedServices.includes('http') ? this.config.http.allocatedPort : undefined;
      case 'sse':
        return this.startedServices.includes('sse') ? this.config.sse.allocatedPort : undefined;
      case 'stdio':
        return undefined; // stdio doesn't use network ports
      default:
        logger.warn({ serviceName }, 'Unknown service name for port query');
        return undefined;
    }
  }

  /**
   * Get service endpoint URLs with allocated ports (only for successfully started services)
   * @returns Object with service endpoint URLs
   */
  getServiceEndpoints(): Record<string, string | undefined> {
    const endpoints: Record<string, string | undefined> = {};

    if (this.startedServices.includes('websocket') && this.config.websocket.allocatedPort) {
      endpoints.websocket = `ws://localhost:${this.config.websocket.allocatedPort}${this.config.websocket.path}`;
    }

    if (this.startedServices.includes('http') && this.config.http.allocatedPort) {
      endpoints.http = `http://localhost:${this.config.http.allocatedPort}`;
    }

    if (this.startedServices.includes('sse') && this.config.sse.allocatedPort) {
      endpoints.sse = `http://localhost:${this.config.sse.allocatedPort}/events`;
    }

    endpoints.stdio = 'stdio://mcp-server'; // Conceptual endpoint for stdio

    return endpoints;
  }

  /**
   * Get health status of all transports
   */
  async getHealthStatus(): Promise<Record<string, { status: 'healthy' | 'unhealthy' | 'disabled'; details?: any }>> {
    const health: Record<string, { status: 'healthy' | 'unhealthy' | 'disabled'; details?: any }> = {};

    // Check stdio transport
    health.stdio = {
      status: this.config.stdio.enabled ? 'healthy' : 'disabled',
      details: { note: 'Handled by MCP server' }
    };

    // Check SSE transport
    health.sse = {
      status: this.config.sse.enabled ? 'healthy' : 'disabled',
      details: {
        connections: this.isTransportRunning('sse') ? sseNotifier.getConnectionCount() : 0
      }
    };

    // Check WebSocket transport
    if (this.config.websocket.enabled) {
      try {
        const connectionCount = websocketServer.getConnectionCount();
        health.websocket = {
          status: this.isTransportRunning('websocket') ? 'healthy' : 'unhealthy',
          details: {
            port: this.config.websocket.port,
            connections: connectionCount,
            connectedAgents: websocketServer.getConnectedAgents().length
          }
        };
      } catch (error) {
        health.websocket = {
          status: 'unhealthy',
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        };
      }
    } else {
      health.websocket = { status: 'disabled' };
    }

    // Check HTTP transport
    if (this.config.http.enabled) {
      try {
        health.http = {
          status: this.isTransportRunning('http') ? 'healthy' : 'unhealthy',
          details: {
            port: this.config.http.port,
            cors: this.config.http.cors
          }
        };
      } catch (error) {
        health.http = {
          status: 'unhealthy',
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        };
      }
    } else {
      health.http = { status: 'disabled' };
    }

    return health;
  }
}

// Export singleton instance
export const transportManager = TransportManager.getInstance();
export { TransportManager };
