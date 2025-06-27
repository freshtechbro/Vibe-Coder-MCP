/**
 * Singleton Reset Manager for Test Isolation
 * Provides comprehensive singleton reset mechanisms for different singleton patterns
 */

import logger from '../../../../logger.js';

/**
 * Singleton reset configuration
 */
interface SingletonResetConfig {
  name: string;
  getInstance: () => any;
  resetMethod?: string;
  staticInstanceProperty?: string;
  staticResetMethod?: string;
  customResetFn?: () => Promise<void> | void;
}

/**
 * Registry of singleton configurations for reset
 */
const singletonConfigs = new Map<string, SingletonResetConfig>();

/**
 * Known singleton classes in the vibe-task-manager
 */
const KNOWN_SINGLETONS = {
  TimeoutManager: {
    module: '../../utils/timeout-manager.js',
    className: 'TimeoutManager',
    staticInstanceProperty: 'instance',
    resetMethod: 'reset'
  },
  AgentOrchestrator: {
    module: '../../services/agent-orchestrator.js',
    className: 'AgentOrchestrator',
    staticInstanceProperty: 'instance',
    resetMethod: 'cleanup'
  },
  AgentIntegrationBridge: {
    module: '../../services/agent-integration-bridge.js',
    className: 'AgentIntegrationBridge',
    staticInstanceProperty: 'instance',
    resetMethod: 'cleanup'
  },
  DecompositionService: {
    module: '../../services/decomposition-service.js',
    className: 'DecompositionService',
    staticInstanceProperty: 'instance',
    resetMethod: 'cleanup'
  },
  WorkflowStateManager: {
    module: '../../services/workflow-state-manager.js',
    className: 'WorkflowStateManager',
    staticInstanceProperty: 'instance',
    resetMethod: 'cleanup'
  },
  WorkflowAwareAgentManager: {
    module: '../../services/workflow-aware-agent-manager.js',
    className: 'WorkflowAwareAgentManager',
    staticInstanceProperty: 'instance',
    resetMethod: 'cleanup'
  },
  AdaptiveTimeoutManager: {
    module: '../../services/adaptive-timeout-manager.js',
    className: 'AdaptiveTimeoutManager',
    staticInstanceProperty: 'instance',
    resetMethod: 'cleanup'
  },
  CodeMapIntegrationService: {
    module: '../../integrations/code-map-integration.js',
    className: 'CodeMapIntegrationService',
    staticInstanceProperty: 'instance',
    resetMethod: 'clearCache'
  },
  OpenRouterConfigManager: {
    module: '../../../../utils/openrouter-config-manager.js',
    className: 'OpenRouterConfigManager',
    staticInstanceProperty: 'instance',
    resetMethod: 'clearCache'
  }
};

/**
 * Register a singleton for reset
 */
export function registerSingletonForReset(config: SingletonResetConfig): void {
  singletonConfigs.set(config.name, config);
  logger.debug({ name: config.name }, 'Singleton registered for reset');
}

/**
 * Register a known singleton by name
 */
export async function registerKnownSingleton(name: keyof typeof KNOWN_SINGLETONS): Promise<void> {
  const config = KNOWN_SINGLETONS[name];
  if (!config) {
    throw new Error(`Unknown singleton: ${name}`);
  }

  try {
    const module = await import(config.module);
    const SingletonClass = module[config.className];
    
    if (!SingletonClass || typeof SingletonClass.getInstance !== 'function') {
      logger.warn({ name, module: config.module }, 'Singleton class not found or missing getInstance method');
      return;
    }

    registerSingletonForReset({
      name,
      getInstance: () => SingletonClass.getInstance(),
      staticInstanceProperty: config.staticInstanceProperty,
      resetMethod: config.resetMethod,
      customResetFn: () => {
        // Reset static instance property
        if (config.staticInstanceProperty && SingletonClass[config.staticInstanceProperty]) {
          SingletonClass[config.staticInstanceProperty] = null;
        }
        
        // Reset initialization flag if it exists
        if ('isInitializing' in SingletonClass) {
          SingletonClass.isInitializing = false;
        }
      }
    });
  } catch (error) {
    logger.warn({ err: error, name }, 'Failed to register known singleton');
  }
}

/**
 * Reset a specific singleton
 */
export async function resetSingleton(name: string): Promise<boolean> {
  const config = singletonConfigs.get(name);
  if (!config) {
    logger.warn({ name }, 'Singleton not found in registry');
    return false;
  }

  try {
    // Get the current instance
    let instance: any = null;
    try {
      instance = config.getInstance();
    } catch (error) {
      // Instance might not exist yet, which is fine
      logger.debug({ name }, 'No instance to reset');
    }

    // Call instance reset method if available
    if (instance) {
      if (config.resetMethod && typeof instance[config.resetMethod] === 'function') {
        await instance[config.resetMethod]();
      } else if (typeof instance.reset === 'function') {
        await instance.reset();
      } else if (typeof instance.cleanup === 'function') {
        await instance.cleanup();
      }
    }

    // Execute custom reset function
    if (config.customResetFn) {
      await config.customResetFn();
    }

    logger.debug({ name }, 'Singleton reset successfully');
    return true;
  } catch (error) {
    logger.error({ err: error, name }, 'Failed to reset singleton');
    return false;
  }
}

/**
 * Reset all registered singletons
 */
export async function resetAllSingletons(): Promise<{
  total: number;
  successful: number;
  failed: string[];
}> {
  const results = {
    total: singletonConfigs.size,
    successful: 0,
    failed: [] as string[]
  };

  for (const [name] of singletonConfigs) {
    const success = await resetSingleton(name);
    if (success) {
      results.successful++;
    } else {
      results.failed.push(name);
    }
  }

  logger.debug(results, 'All singletons reset completed');
  return results;
}

/**
 * Auto-register all known singletons
 */
export async function autoRegisterKnownSingletons(): Promise<void> {
  const registrationPromises = Object.keys(KNOWN_SINGLETONS).map(name =>
    registerKnownSingleton(name as keyof typeof KNOWN_SINGLETONS)
  );

  await Promise.allSettled(registrationPromises);
  logger.debug({ count: Object.keys(KNOWN_SINGLETONS).length }, 'Auto-registration of known singletons completed');
}

/**
 * Clear singleton registry
 */
export function clearSingletonRegistry(): void {
  singletonConfigs.clear();
  logger.debug('Singleton registry cleared');
}

/**
 * Get registered singleton names
 */
export function getRegisteredSingletons(): string[] {
  return Array.from(singletonConfigs.keys());
}

/**
 * Check if a singleton is registered
 */
export function isSingletonRegistered(name: string): boolean {
  return singletonConfigs.has(name);
}

/**
 * Enhanced singleton reset for TimeoutManager specifically
 */
export async function resetTimeoutManager(): Promise<void> {
  try {
    const { TimeoutManager } = await import('../../utils/timeout-manager.js');
    
    // Get current instance if it exists
    const instance = TimeoutManager.getInstance();
    
    // Reset configuration
    if (instance && typeof (instance as any).config !== 'undefined') {
      (instance as any).config = null;
    }
    
    // Reset static instance
    if ('instance' in TimeoutManager) {
      (TimeoutManager as any).instance = null;
    }
    
    logger.debug('TimeoutManager reset successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to reset TimeoutManager');
    throw error;
  }
}

/**
 * Enhanced singleton reset for AgentOrchestrator specifically
 */
export async function resetAgentOrchestrator(): Promise<void> {
  try {
    const { AgentOrchestrator } = await import('../../services/agent-orchestrator.js');
    
    // Get current instance if it exists
    let instance: any = null;
    try {
      instance = AgentOrchestrator.getInstance();
    } catch (error) {
      // Instance might not exist
    }
    
    // Call cleanup if available
    if (instance && typeof instance.cleanup === 'function') {
      await instance.cleanup();
    }
    
    // Reset static properties
    if ('instance' in AgentOrchestrator) {
      (AgentOrchestrator as any).instance = null;
    }
    
    if ('isInitializing' in AgentOrchestrator) {
      (AgentOrchestrator as any).isInitializing = false;
    }
    
    logger.debug('AgentOrchestrator reset successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to reset AgentOrchestrator');
    throw error;
  }
}

/**
 * Comprehensive test cleanup for all singletons
 */
export async function performSingletonTestCleanup(): Promise<void> {
  try {
    logger.debug('Starting comprehensive singleton test cleanup');
    
    // Reset specific critical singletons first
    await resetTimeoutManager();
    await resetAgentOrchestrator();
    
    // Reset all other registered singletons
    const results = await resetAllSingletons();
    
    if (results.failed.length > 0) {
      logger.warn({ failed: results.failed }, 'Some singletons failed to reset');
    }
    
    logger.debug({ 
      total: results.total, 
      successful: results.successful, 
      failed: results.failed.length 
    }, 'Comprehensive singleton test cleanup completed');
  } catch (error) {
    logger.error({ err: error }, 'Failed to perform comprehensive singleton test cleanup');
    throw error;
  }
}
