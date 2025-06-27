/**
 * Dependency Container - Centralized Dependency Injection
 * 
 * Manages dependencies between agent modules to prevent circular imports
 * Implements singleton pattern with lazy loading and safe initialization
 */

import { ImportCycleBreaker } from '../utils/import-cycle-breaker.js';
import logger from '../logger.js';

export interface AgentDependencies {
  agentRegistry?: any;
  agentTaskQueue?: any;
  agentResponseProcessor?: any;
  agentIntegrationBridge?: any;
}

/**
 * Centralized dependency container for agent modules
 */
export class DependencyContainer {
  private static instance: DependencyContainer;
  private static isInitializing = false;
  private dependencies: AgentDependencies = {};
  private initializationPromises = new Map<string, Promise<any>>();

  static getInstance(): DependencyContainer {
    if (DependencyContainer.isInitializing) {
      logger.warn('Circular initialization detected in DependencyContainer, using safe fallback');
      return DependencyContainer.createSafeFallback();
    }

    if (!DependencyContainer.instance) {
      DependencyContainer.isInitializing = true;
      try {
        DependencyContainer.instance = new DependencyContainer();
      } finally {
        DependencyContainer.isInitializing = false;
      }
    }
    return DependencyContainer.instance;
  }

  private static createSafeFallback(): DependencyContainer {
    const fallback = Object.create(DependencyContainer.prototype);
    fallback.dependencies = {};
    fallback.initializationPromises = new Map();
    
    // Provide safe no-op methods
    fallback.getAgentRegistry = async () => null;
    fallback.getAgentTaskQueue = async () => null;
    fallback.getAgentResponseProcessor = async () => null;
    fallback.getAgentIntegrationBridge = async () => null;
    
    return fallback;
  }

  /**
   * Get AgentRegistry instance with safe loading
   */
  async getAgentRegistry(): Promise<any | null> {
    if (this.dependencies.agentRegistry) {
      return this.dependencies.agentRegistry;
    }

    // Check if initialization is already in progress
    if (this.initializationPromises.has('agentRegistry')) {
      return this.initializationPromises.get('agentRegistry');
    }

    // Start initialization
    const initPromise = this.initializeAgentRegistry();
    this.initializationPromises.set('agentRegistry', initPromise);
    
    try {
      const registry = await initPromise;
      this.dependencies.agentRegistry = registry;
      return registry;
    } finally {
      this.initializationPromises.delete('agentRegistry');
    }
  }

  private async initializeAgentRegistry(): Promise<any | null> {
    try {
      const registryModule = await ImportCycleBreaker.safeImport<{ AgentRegistry: any }>('../tools/agent-registry/index.js');
      if (registryModule?.AgentRegistry) {
        return registryModule.AgentRegistry.getInstance();
      }
      logger.warn('AgentRegistry not available due to circular dependency');
      return null;
    } catch (error) {
      logger.error('Failed to initialize AgentRegistry:', error);
      return null;
    }
  }

  /**
   * Get AgentTaskQueue instance with safe loading
   */
  async getAgentTaskQueue(): Promise<any | null> {
    if (this.dependencies.agentTaskQueue) {
      return this.dependencies.agentTaskQueue;
    }

    if (this.initializationPromises.has('agentTaskQueue')) {
      return this.initializationPromises.get('agentTaskQueue');
    }

    const initPromise = this.initializeAgentTaskQueue();
    this.initializationPromises.set('agentTaskQueue', initPromise);
    
    try {
      const taskQueue = await initPromise;
      this.dependencies.agentTaskQueue = taskQueue;
      return taskQueue;
    } finally {
      this.initializationPromises.delete('agentTaskQueue');
    }
  }

  private async initializeAgentTaskQueue(): Promise<any | null> {
    try {
      const taskQueueModule = await ImportCycleBreaker.safeImport<{ AgentTaskQueue: any }>('../tools/agent-tasks/index.js');
      if (taskQueueModule?.AgentTaskQueue) {
        return taskQueueModule.AgentTaskQueue.getInstance();
      }
      logger.warn('AgentTaskQueue not available due to circular dependency');
      return null;
    } catch (error) {
      logger.error('Failed to initialize AgentTaskQueue:', error);
      return null;
    }
  }

  /**
   * Get AgentResponseProcessor instance with safe loading
   */
  async getAgentResponseProcessor(): Promise<any | null> {
    if (this.dependencies.agentResponseProcessor) {
      return this.dependencies.agentResponseProcessor;
    }

    if (this.initializationPromises.has('agentResponseProcessor')) {
      return this.initializationPromises.get('agentResponseProcessor');
    }

    const initPromise = this.initializeAgentResponseProcessor();
    this.initializationPromises.set('agentResponseProcessor', initPromise);
    
    try {
      const responseProcessor = await initPromise;
      this.dependencies.agentResponseProcessor = responseProcessor;
      return responseProcessor;
    } finally {
      this.initializationPromises.delete('agentResponseProcessor');
    }
  }

  private async initializeAgentResponseProcessor(): Promise<any | null> {
    try {
      const responseModule = await ImportCycleBreaker.safeImport<{ AgentResponseProcessor: any }>('../tools/agent-response/index.js');
      if (responseModule?.AgentResponseProcessor) {
        return responseModule.AgentResponseProcessor.getInstance();
      }
      logger.warn('AgentResponseProcessor not available due to circular dependency');
      return null;
    } catch (error) {
      logger.error('Failed to initialize AgentResponseProcessor:', error);
      return null;
    }
  }

  /**
   * Get AgentIntegrationBridge instance with safe loading
   */
  async getAgentIntegrationBridge(): Promise<any | null> {
    if (this.dependencies.agentIntegrationBridge) {
      return this.dependencies.agentIntegrationBridge;
    }

    if (this.initializationPromises.has('agentIntegrationBridge')) {
      return this.initializationPromises.get('agentIntegrationBridge');
    }

    const initPromise = this.initializeAgentIntegrationBridge();
    this.initializationPromises.set('agentIntegrationBridge', initPromise);
    
    try {
      const bridge = await initPromise;
      this.dependencies.agentIntegrationBridge = bridge;
      return bridge;
    } finally {
      this.initializationPromises.delete('agentIntegrationBridge');
    }
  }

  private async initializeAgentIntegrationBridge(): Promise<any | null> {
    try {
      const bridgeModule = await ImportCycleBreaker.safeImport<{ AgentIntegrationBridge: any }>('../tools/vibe-task-manager/services/agent-integration-bridge.js');
      if (bridgeModule?.AgentIntegrationBridge) {
        return bridgeModule.AgentIntegrationBridge.getInstance();
      }
      logger.warn('AgentIntegrationBridge not available due to circular dependency');
      return null;
    } catch (error) {
      logger.error('Failed to initialize AgentIntegrationBridge:', error);
      return null;
    }
  }

  /**
   * Clear all cached dependencies (useful for testing)
   */
  clearCache(): void {
    this.dependencies = {};
    this.initializationPromises.clear();
  }

  /**
   * Get current dependency status for debugging
   */
  getDependencyStatus(): Record<string, boolean> {
    return {
      agentRegistry: !!this.dependencies.agentRegistry,
      agentTaskQueue: !!this.dependencies.agentTaskQueue,
      agentResponseProcessor: !!this.dependencies.agentResponseProcessor,
      agentIntegrationBridge: !!this.dependencies.agentIntegrationBridge
    };
  }
}

// Export singleton instance
export const dependencyContainer = DependencyContainer.getInstance();
