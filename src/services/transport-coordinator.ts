/**
 * Transport Service Coordinator
 * 
 * Centralized coordination for transport service initialization
 * Prevents redundant startup attempts and ensures proper sequencing
 */

import { transportManager } from './transport-manager/index.js';
import logger from '../logger.js';

export interface TransportCoordinatorConfig {
  websocket: {
    enabled: boolean;
    port: number;
    path: string;
  };
  http: {
    enabled: boolean;
    port: number;
    cors: boolean;
  };
  sse: {
    enabled: boolean;
  };
  stdio: {
    enabled: boolean;
  };
}

const DEFAULT_TRANSPORT_CONFIG: TransportCoordinatorConfig = {
  websocket: {
    enabled: true,
    port: 8080,
    path: '/agent-ws'
  },
  http: {
    enabled: true,
    port: 3001,
    cors: true
  },
  sse: {
    enabled: true
  },
  stdio: {
    enabled: true
  }
};

/**
 * Centralized transport service coordinator
 */
export class TransportCoordinator {
  private static instance: TransportCoordinator;
  private static isInitializing = false;
  private initializationPromise?: Promise<void>;
  private isInitialized = false;
  private config: TransportCoordinatorConfig;

  static getInstance(): TransportCoordinator {
    if (TransportCoordinator.isInitializing) {
      logger.warn('Circular initialization detected in TransportCoordinator, using safe fallback');
      return TransportCoordinator.createSafeFallback();
    }

    if (!TransportCoordinator.instance) {
      TransportCoordinator.isInitializing = true;
      try {
        TransportCoordinator.instance = new TransportCoordinator();
      } finally {
        TransportCoordinator.isInitializing = false;
      }
    }
    return TransportCoordinator.instance;
  }

  private static createSafeFallback(): TransportCoordinator {
    const fallback = Object.create(TransportCoordinator.prototype);
    fallback.config = { ...DEFAULT_TRANSPORT_CONFIG };
    fallback.isInitialized = false;
    fallback.initializationPromise = undefined;
    
    // Provide safe no-op methods
    fallback.ensureTransportsStarted = async () => {
      logger.warn('TransportCoordinator fallback: ensureTransportsStarted called during initialization');
    };
    
    return fallback;
  }

  constructor() {
    this.config = { ...DEFAULT_TRANSPORT_CONFIG };
  }

  /**
   * Configure transport settings
   */
  configure(config: Partial<TransportCoordinatorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      websocket: { ...this.config.websocket, ...config.websocket },
      http: { ...this.config.http, ...config.http },
      sse: { ...this.config.sse, ...config.sse },
      stdio: { ...this.config.stdio, ...config.stdio }
    };

    logger.debug({ config: this.config }, 'Transport coordinator configured');
  }

  /**
   * Ensure transport services are started (idempotent)
   * This is the main method that should be called by all components
   */
  async ensureTransportsStarted(): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) {
      logger.debug('Transport services already initialized');
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      logger.debug('Transport initialization in progress, waiting...');
      await this.initializationPromise;
      return;
    }

    // Start initialization
    this.initializationPromise = this.initializeTransports();
    
    try {
      await this.initializationPromise;
      this.isInitialized = true;
      logger.info('Transport services initialization completed');
    } catch (error) {
      logger.error('Transport services initialization failed:', error);
      throw error;
    } finally {
      this.initializationPromise = undefined;
    }
  }

  private async initializeTransports(): Promise<void> {
    logger.info('Initializing transport services through coordinator...');

    // Check current transport manager status
    const status = transportManager.getStatus();
    
    if (status.isStarted) {
      logger.debug('Transport manager already started');
      return;
    }

    if (status.startupInProgress) {
      logger.debug('Transport manager startup in progress, waiting...');
      await transportManager.startAll(); // This will wait for completion
      return;
    }

    // Configure and start transport services
    logger.debug('Configuring transport manager...');
    transportManager.configure({
      websocket: {
        enabled: this.config.websocket.enabled,
        port: this.config.websocket.port,
        path: this.config.websocket.path
      },
      http: {
        enabled: this.config.http.enabled,
        port: this.config.http.port,
        cors: this.config.http.cors
      },
      sse: {
        enabled: this.config.sse.enabled
      },
      stdio: {
        enabled: this.config.stdio.enabled
      }
    });

    logger.debug('Starting transport services...');
    await transportManager.startAll();
    logger.info('Transport services started successfully through coordinator');
  }

  /**
   * Get transport service status
   */
  getStatus(): {
    isInitialized: boolean;
    initializationInProgress: boolean;
    transportManagerStatus: {
      isStarted: boolean;
      isConfigured: boolean;
      startupInProgress: boolean;
      startedServices: string[];
      config: unknown;
      serviceDetails: Record<string, unknown>;
      websocket?: { running: boolean; port?: number; path?: string; connections?: number };
      http?: { running: boolean; port?: number; cors?: boolean };
      sse?: { running: boolean; connections?: number };
      stdio?: { running: boolean };
    };
  } {
    return {
      isInitialized: this.isInitialized,
      initializationInProgress: !!this.initializationPromise,
      transportManagerStatus: transportManager.getStatus()
    };
  }

  /**
   * Get allocated ports from transport manager
   */
  getAllocatedPorts(): Record<string, number | undefined> {
    return transportManager.getAllocatedPorts();
  }

  /**
   * Get transport endpoints
   */
  getTransportEndpoints(): Record<string, string> {
    const allocatedPorts = this.getAllocatedPorts();
    const endpoints: Record<string, string> = {};

    if (this.config.websocket.enabled && allocatedPorts.websocket !== undefined) {
      endpoints.websocket = `ws://localhost:${allocatedPorts.websocket}${this.config.websocket.path}`;
    }

    if (this.config.http.enabled && allocatedPorts.http !== undefined) {
      endpoints.http = `http://localhost:${allocatedPorts.http}`;
    }

    if (this.config.sse.enabled) {
      endpoints.sse = 'Integrated with MCP server';
    }

    if (this.config.stdio.enabled) {
      endpoints.stdio = 'stdio://mcp-server';
    }

    return endpoints;
  }

  /**
   * Reset coordinator state (for testing)
   */
  reset(): void {
    this.isInitialized = false;
    this.initializationPromise = undefined;
    this.config = { ...DEFAULT_TRANSPORT_CONFIG };
    logger.debug('Transport coordinator reset');
  }
}

// Export singleton instance
export const transportCoordinator = TransportCoordinator.getInstance();
