/**
 * Agent Integration Bridge
 * 
 * Provides unified integration between Agent Registry and Agent Orchestrator
 * Implements synchronization, data model conversion, and unified registration
 */

import { AgentInfo, AgentCapability } from './agent-orchestrator.js';
import { AppError } from '../../../utils/errors.js';
import { dependencyContainer } from '../../../services/dependency-container.js';
import logger from '../../../logger.js';

// Import AgentRegistration type without importing the module
export interface AgentRegistration {
  agentId: string;
  capabilities: string[];
  transportType: 'stdio' | 'sse' | 'websocket' | 'http';
  sessionId: string;
  maxConcurrentTasks: number;
  pollingInterval?: number;
  status?: 'online' | 'offline' | 'busy';
  registeredAt?: number;
  lastSeen?: number;
  currentTasks?: string[];
  websocketConnection?: WebSocket;
  httpEndpoint?: string;
  httpAuthToken?: string;
}

/**
 * Unified agent interface that bridges registry and orchestrator models
 */
export interface UnifiedAgent {
  // Core identification
  id: string;
  name?: string;
  
  // Capabilities (unified format)
  capabilities: string[];
  
  // Status (unified format)
  status: 'online' | 'offline' | 'busy' | 'available' | 'error';
  
  // Task management
  maxConcurrentTasks: number;
  currentTasks: string[];
  
  // Communication
  transportType?: 'stdio' | 'sse' | 'websocket' | 'http';
  sessionId?: string;
  pollingInterval?: number;
  
  // Timing
  registeredAt: number;
  lastSeen: number;
  lastHeartbeat: Date;
  
  // Performance
  performance: {
    tasksCompleted: number;
    averageCompletionTime: number;
    successRate: number;
    lastTaskCompletedAt?: Date;
  };
  
  // Transport-specific
  httpEndpoint?: string;
  httpAuthToken?: string;
  websocketConnection?: WebSocket;
  
  // Metadata
  metadata: {
    version: string;
    supportedProtocols: string[];
    preferences: Record<string, unknown>;
  };
}


/**
 * Agent Integration Bridge Service
 * Manages synchronization between Agent Registry and Agent Orchestrator
 */
export class AgentIntegrationBridge {
  private static instance: AgentIntegrationBridge;
  private static isInitializing = false; // Initialization guard to prevent circular initialization
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private agentRegistry: any | null = null; // Dynamic import from dependency container
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private agentOrchestrator: any | null = null; // Dynamic import from dependency container
  private syncEnabled = true;
  private syncInterval?: NodeJS.Timeout;
  private registrationInProgress = new Set<string>(); // Prevent circular registration

  private constructor() {
    this.initializeDependencies();
  }

  static getInstance(): AgentIntegrationBridge {
    if (AgentIntegrationBridge.isInitializing) {
      logger.warn('Circular initialization detected in AgentIntegrationBridge, using safe fallback');
      return AgentIntegrationBridge.createSafeFallback();
    }

    if (!AgentIntegrationBridge.instance) {
      AgentIntegrationBridge.isInitializing = true;
      try {
        AgentIntegrationBridge.instance = new AgentIntegrationBridge();
      } finally {
        AgentIntegrationBridge.isInitializing = false;
      }
    }
    return AgentIntegrationBridge.instance;
  }

  /**
   * Create safe fallback instance to prevent recursion
   */
  private static createSafeFallback(): AgentIntegrationBridge {
    const fallback = Object.create(AgentIntegrationBridge.prototype);

    // Initialize with minimal safe properties
    fallback.agentRegistry = null;
    fallback.agentOrchestrator = null;
    fallback.syncEnabled = false;
    fallback.registrationInProgress = new Set();

    // Provide safe no-op methods
    fallback.registerAgent = async () => {
      logger.warn('AgentIntegrationBridge fallback: registerAgent called during initialization');
    };
    fallback.synchronizeAgents = async () => {
      logger.warn('AgentIntegrationBridge fallback: synchronizeAgents called during initialization');
    };
    fallback.getUnifiedAgent = async () => {
      logger.warn('AgentIntegrationBridge fallback: getUnifiedAgent called during initialization');
      return null;
    };
    fallback.startAutoSync = () => {
      logger.warn('AgentIntegrationBridge fallback: startAutoSync called during initialization');
    };

    return fallback;
  }

  /**
   * Initialize dependencies using dependency container
   */
  private async initializeDependencies(): Promise<void> {
    try {
      // Initialize agent registry using dependency container
      this.agentRegistry = await dependencyContainer.getAgentRegistry();
      if (!this.agentRegistry) {
        logger.warn('AgentRegistry not available');
      }

      // Import and initialize agent orchestrator
      const { AgentOrchestrator } = await import('./agent-orchestrator.js');
      this.agentOrchestrator = AgentOrchestrator.getInstance();
      
      logger.info('Agent integration bridge dependencies initialized');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize agent integration bridge dependencies');
      throw new AppError('Agent integration bridge initialization failed', { cause: error });
    }
  }

  /**
   * Convert Agent Registry format to Orchestrator format
   */
  convertRegistryToOrchestrator(registryAgent: AgentRegistration): Omit<AgentInfo, 'lastHeartbeat' | 'performance'> {
    // Map capabilities to orchestrator format
    const orchestratorCapabilities = this.mapCapabilities(registryAgent.capabilities);
    
    // Map status
    const orchestratorStatus = this.mapRegistryStatusToOrchestrator(registryAgent.status || 'online');
    
    return {
      id: registryAgent.agentId,
      name: registryAgent.agentId, // Use agentId as name if no name provided
      capabilities: orchestratorCapabilities,
      maxConcurrentTasks: registryAgent.maxConcurrentTasks,
      currentTasks: registryAgent.currentTasks || [],
      status: orchestratorStatus,
      metadata: {
        version: '1.0.0',
        supportedProtocols: [registryAgent.transportType],
        preferences: {
          transportType: registryAgent.transportType,
          sessionId: registryAgent.sessionId,
          pollingInterval: registryAgent.pollingInterval,
          httpEndpoint: registryAgent.httpEndpoint,
          httpAuthToken: registryAgent.httpAuthToken
        }
      }
    };
  }

  /**
   * Convert Orchestrator format to Registry format
   */
  convertOrchestratorToRegistry(orchestratorAgent: AgentInfo): AgentRegistration {
    // Extract transport info from metadata
    const transportType = orchestratorAgent.metadata.preferences?.transportType || 'stdio';
    const sessionId = orchestratorAgent.metadata.preferences?.sessionId || `session-${orchestratorAgent.id}`;
    
    // Map status
    const registryStatus = this.mapOrchestratorStatusToRegistry(orchestratorAgent.status);
    
    return {
      agentId: orchestratorAgent.id,
      capabilities: orchestratorAgent.capabilities.map(cap => cap.toString()),
      transportType: transportType as 'stdio' | 'sse' | 'websocket' | 'http',
      sessionId: sessionId as string,
      maxConcurrentTasks: orchestratorAgent.maxConcurrentTasks,
      pollingInterval: (orchestratorAgent.metadata?.preferences?.pollingInterval as number) || 5000,
      status: registryStatus,
      registeredAt: Date.now(),
      lastSeen: orchestratorAgent.lastHeartbeat.getTime(),
      currentTasks: orchestratorAgent.currentTasks,
      httpEndpoint: orchestratorAgent.metadata?.preferences?.httpEndpoint as string | undefined,
      httpAuthToken: orchestratorAgent.metadata?.preferences?.httpAuthToken as string | undefined
    };
  }

  /**
   * Map capabilities between formats
   */
  private mapCapabilities(capabilities: string[]): AgentCapability[] {
    const capabilityMap: Record<string, AgentCapability> = {
      'code_generation': 'general',
      'frontend': 'frontend',
      'backend': 'backend',
      'database': 'database',
      'testing': 'testing',
      'devops': 'devops',
      'deployment': 'devops',
      'documentation': 'documentation',
      'refactoring': 'refactoring',
      'debugging': 'debugging',
      'review': 'general',
      'research': 'general',
      'optimization': 'general',
      'analysis': 'general'
    };

    return capabilities.map(cap => capabilityMap[cap] || 'general');
  }

  /**
   * Map registry status to orchestrator status
   */
  private mapRegistryStatusToOrchestrator(registryStatus: string): AgentInfo['status'] {
    const statusMap: Record<string, AgentInfo['status']> = {
      'online': 'available',
      'offline': 'offline',
      'busy': 'busy'
    };

    return statusMap[registryStatus] || 'available';
  }

  /**
   * Map orchestrator status to registry status
   */
  private mapOrchestratorStatusToRegistry(orchestratorStatus: AgentInfo['status']): AgentRegistration['status'] {
    const statusMap: Record<AgentInfo['status'], AgentRegistration['status']> = {
      'available': 'online',
      'busy': 'busy',
      'offline': 'offline',
      'error': 'offline'
    };

    return statusMap[orchestratorStatus] || 'online';
  }

  /**
   * Unified agent registration that updates both systems
   */
  async registerAgent(agentData: Partial<UnifiedAgent> & { id: string; capabilities: string[] }): Promise<void> {
    // Prevent circular registration
    if (this.registrationInProgress.has(agentData.id)) {
      logger.debug({ agentId: agentData.id }, 'Agent registration already in progress, skipping to prevent circular registration');
      return;
    }

    this.registrationInProgress.add(agentData.id);

    try {
      // Ensure dependencies are initialized
      if (!this.agentRegistry || !this.agentOrchestrator) {
        await this.initializeDependencies();
      }

      // Create unified agent data with defaults
      const unifiedAgent: UnifiedAgent = {
        id: agentData.id,
        name: agentData.name || agentData.id,
        capabilities: agentData.capabilities,
        status: agentData.status || 'online',
        maxConcurrentTasks: agentData.maxConcurrentTasks || 1,
        currentTasks: agentData.currentTasks || [],
        transportType: agentData.transportType || 'stdio',
        sessionId: agentData.sessionId || `session-${agentData.id}`,
        pollingInterval: agentData.pollingInterval || 5000,
        registeredAt: agentData.registeredAt || Date.now(),
        lastSeen: agentData.lastSeen || Date.now(),
        lastHeartbeat: agentData.lastHeartbeat || new Date(),
        performance: agentData.performance || {
          tasksCompleted: 0,
          averageCompletionTime: 0,
          successRate: 1.0
        },
        httpEndpoint: agentData.httpEndpoint,
        httpAuthToken: agentData.httpAuthToken,
        websocketConnection: agentData.websocketConnection,
        metadata: agentData.metadata || {
          version: '1.0.0',
          supportedProtocols: [agentData.transportType || 'stdio'],
          preferences: {}
        }
      };

      // Register in agent registry (without triggering bridge)
      const registryData = this.convertUnifiedToRegistry(unifiedAgent);
      await this.registerInRegistryOnly(registryData);

      // Register in agent orchestrator (without triggering bridge)
      const orchestratorData = this.convertUnifiedToOrchestrator(unifiedAgent);
      await this.registerInOrchestratorOnly(orchestratorData);

      logger.info({ agentId: agentData.id }, 'Agent registered in both registry and orchestrator via integration bridge');

    } catch (error) {
      logger.error({ err: error, agentId: agentData.id }, 'Failed to register agent in unified system');
      throw new AppError('Unified agent registration failed', { cause: error });
    } finally {
      // Always remove from in-progress set
      this.registrationInProgress.delete(agentData.id);
    }
  }

  /**
   * Convert unified format to registry format
   */
  private convertUnifiedToRegistry(unifiedAgent: UnifiedAgent): AgentRegistration {
    return {
      agentId: unifiedAgent.id,
      capabilities: unifiedAgent.capabilities,
      transportType: unifiedAgent.transportType!,
      sessionId: unifiedAgent.sessionId!,
      maxConcurrentTasks: unifiedAgent.maxConcurrentTasks,
      pollingInterval: unifiedAgent.pollingInterval,
      status: unifiedAgent.status === 'available' ? 'online' : 
              unifiedAgent.status === 'error' ? 'offline' : (unifiedAgent.status as 'online' | 'offline' | 'busy'),
      registeredAt: unifiedAgent.registeredAt,
      lastSeen: unifiedAgent.lastSeen,
      currentTasks: unifiedAgent.currentTasks,
      httpEndpoint: unifiedAgent.httpEndpoint,
      httpAuthToken: unifiedAgent.httpAuthToken,
      websocketConnection: unifiedAgent.websocketConnection
    };
  }

  /**
   * Convert unified format to orchestrator format
   */
  private convertUnifiedToOrchestrator(unifiedAgent: UnifiedAgent): Omit<AgentInfo, 'lastHeartbeat' | 'performance'> {
    return {
      id: unifiedAgent.id,
      name: unifiedAgent.name!,
      capabilities: this.mapCapabilities(unifiedAgent.capabilities),
      maxConcurrentTasks: unifiedAgent.maxConcurrentTasks,
      currentTasks: unifiedAgent.currentTasks,
      status: unifiedAgent.status === 'online' ? 'available' : (unifiedAgent.status as 'available' | 'busy' | 'offline' | 'error'),
      metadata: unifiedAgent.metadata
    };
  }

  /**
   * Register agent in registry only (without triggering bridge)
   */
  private async registerInRegistryOnly(registryData: AgentRegistration): Promise<void> {
    if (!this.agentRegistry) {
      throw new AppError('Agent registry not initialized');
    }

    // Create a direct registration method that bypasses bridge
    const directRegister = async (data: AgentRegistration) => {
      // Call the original registry logic without bridge integration
      this.agentRegistry!.validateRegistration(data);

      const existingAgent = this.agentRegistry.agents?.get(data.agentId);
      if (existingAgent) {
        await this.agentRegistry.updateAgent(data);
      } else {
        await this.agentRegistry.createAgent(data);
      }

      this.agentRegistry.sessionToAgent?.set(data.sessionId, data.agentId);
    };

    await directRegister(registryData);
  }

  /**
   * Register agent in orchestrator only (without triggering bridge)
   */
  private async registerInOrchestratorOnly(orchestratorData: Omit<AgentInfo, 'lastHeartbeat' | 'performance'>): Promise<void> {
    if (!this.agentOrchestrator) {
      throw new AppError('Agent orchestrator not initialized');
    }

    // Direct registration in orchestrator without triggering bridge
    const fullAgentInfo = {
      ...orchestratorData,
      lastHeartbeat: new Date(),
      performance: {
        tasksCompleted: 0,
        averageCompletionTime: 0,
        successRate: 1.0
      }
    };

    this.agentOrchestrator.agents?.set(orchestratorData.id, fullAgentInfo);
  }

  /**
   * Synchronize agents between registry and orchestrator
   */
  async synchronizeAgents(): Promise<void> {
    if (!this.syncEnabled) return;

    try {
      // Ensure dependencies are initialized
      if (!this.agentRegistry || !this.agentOrchestrator) {
        await this.initializeDependencies();
      }

      // Get agents from both systems
      const registryAgents = await this.agentRegistry.getAllAgents();
      const orchestratorAgents = await this.agentOrchestrator.getAgents();

      // Create maps for efficient lookup
      const registryMap = new Map(registryAgents.map((agent: AgentRegistration) => [agent.agentId, agent]));
      const orchestratorMap = new Map(orchestratorAgents.map((agent: AgentInfo) => [agent.id, agent]));

      // Sync registry agents to orchestrator
      for (const registryAgent of registryAgents) {
        if (!orchestratorMap.has(registryAgent.agentId)) {
          const orchestratorData = this.convertRegistryToOrchestrator(registryAgent);
          await this.agentOrchestrator.registerAgent(orchestratorData);
          logger.debug({ agentId: registryAgent.agentId }, 'Synced registry agent to orchestrator');
        }
      }

      // Sync orchestrator agents to registry
      for (const orchestratorAgent of orchestratorAgents) {
        if (!registryMap.has(orchestratorAgent.id)) {
          const registryData = this.convertOrchestratorToRegistry(orchestratorAgent);
          await this.agentRegistry.registerAgent(registryData);
          logger.debug({ agentId: orchestratorAgent.id }, 'Synced orchestrator agent to registry');
        }
      }

      logger.debug('Agent synchronization completed');

    } catch (error) {
      logger.error({ err: error }, 'Failed to synchronize agents');
    }
  }

  /**
   * Start automatic synchronization
   */
  startAutoSync(intervalMs: number = 30000): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      this.synchronizeAgents().catch(error => {
        logger.error({ err: error }, 'Auto-sync failed');
      });
    }, intervalMs);

    logger.info({ intervalMs }, 'Agent auto-synchronization started');
  }

  /**
   * Stop automatic synchronization
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
      logger.info('Agent auto-synchronization stopped');
    }
  }

  /**
   * Immediately propagate agent status change to all systems
   */
  async propagateStatusChange(
    agentId: string,
    newStatus: 'online' | 'offline' | 'busy' | 'available' | 'error',
    source: 'registry' | 'orchestrator'
  ): Promise<void> {
    try {
      // Ensure dependencies are initialized
      if (!this.agentRegistry || !this.agentOrchestrator) {
        await this.initializeDependencies();
      }

      logger.debug({ agentId, newStatus, source }, 'Propagating status change');

      if (source === 'orchestrator') {
        // Update registry status
        const registryStatus = this.mapOrchestratorStatusToRegistry(newStatus as AgentInfo['status']);
        await this.agentRegistry.updateAgentStatus(agentId, registryStatus);
        logger.debug({ agentId, registryStatus }, 'Status propagated from orchestrator to registry');
      } else if (source === 'registry') {
        // Update orchestrator status
        const orchestratorStatus = this.mapRegistryStatusToOrchestrator(newStatus);
        const agent = this.agentOrchestrator.agents?.get(agentId);
        if (agent) {
          agent.status = orchestratorStatus;
          agent.lastHeartbeat = new Date();
          logger.debug({ agentId, orchestratorStatus }, 'Status propagated from registry to orchestrator');
        }
      }

      logger.info({ agentId, newStatus, source }, 'Agent status propagated successfully');

    } catch (error) {
      logger.error({ err: error, agentId, newStatus, source }, 'Failed to propagate status change');
    }
  }

  /**
   * Immediately propagate task assignment status change
   */
  async propagateTaskStatusChange(
    agentId: string,
    taskId: string,
    taskStatus: 'assigned' | 'in_progress' | 'completed' | 'failed',
    source: 'registry' | 'orchestrator'
  ): Promise<void> {
    try {
      // Ensure dependencies are initialized
      if (!this.agentRegistry || !this.agentOrchestrator) {
        await this.initializeDependencies();
      }

      logger.debug({ agentId, taskId, taskStatus, source }, 'Propagating task status change');

      // Update agent's current tasks list in both systems
      if (source === 'orchestrator') {
        // Update registry
        const registryAgent = await this.agentRegistry.getAgent(agentId);
        if (registryAgent) {
          if (taskStatus === 'assigned' || taskStatus === 'in_progress') {
            if (!registryAgent.currentTasks?.includes(taskId)) {
              registryAgent.currentTasks = [...(registryAgent.currentTasks || []), taskId];
            }
          } else if (taskStatus === 'completed' || taskStatus === 'failed') {
            registryAgent.currentTasks = (registryAgent.currentTasks || []).filter((id: string) => id !== taskId);
          }

          // Update agent status based on task load
          const taskCount = registryAgent.currentTasks?.length || 0;
          const maxTasks = registryAgent.maxConcurrentTasks || 1;
          const newStatus = taskCount >= maxTasks ? 'busy' : 'online';

          await this.agentRegistry.updateAgentStatus(agentId, newStatus);
        }
      } else if (source === 'registry') {
        // Update orchestrator
        const orchestratorAgent = this.agentOrchestrator.agents?.get(agentId);
        if (orchestratorAgent) {
          if (taskStatus === 'assigned' || taskStatus === 'in_progress') {
            if (!orchestratorAgent.currentTasks.includes(taskId)) {
              orchestratorAgent.currentTasks.push(taskId);
            }
          } else if (taskStatus === 'completed' || taskStatus === 'failed') {
            orchestratorAgent.currentTasks = orchestratorAgent.currentTasks.filter((id: string) => id !== taskId);
          }

          // Update agent status based on task load
          const taskCount = orchestratorAgent.currentTasks.length;
          const maxTasks = orchestratorAgent.maxConcurrentTasks || 1;
          orchestratorAgent.status = taskCount >= maxTasks ? 'busy' : 'available';
          orchestratorAgent.lastHeartbeat = new Date();
        }
      }

      logger.debug({ agentId, taskId, taskStatus, source }, 'Task status propagated successfully');

    } catch (error) {
      logger.error({ err: error, agentId, taskId, taskStatus, source }, 'Failed to propagate task status change');
    }
  }

  /**
   * Enable/disable synchronization
   */
  setSyncEnabled(enabled: boolean): void {
    this.syncEnabled = enabled;
    logger.info({ enabled }, 'Agent synchronization enabled/disabled');
  }

  /**
   * Get unified agent by ID from either system
   */
  async getUnifiedAgent(agentId: string): Promise<UnifiedAgent | null> {
    try {
      // Try registry first
      const registryAgent = await this.agentRegistry?.getAgent(agentId);
      if (registryAgent) {
        return this.convertRegistryToUnified(registryAgent);
      }

      // Try orchestrator
      const orchestratorAgents = await this.agentOrchestrator?.getAgents();
      const orchestratorAgent = orchestratorAgents?.find((agent: AgentInfo) => agent.id === agentId);
      if (orchestratorAgent) {
        return this.convertOrchestratorToUnified(orchestratorAgent);
      }

      return null;
    } catch (error) {
      logger.error({ err: error, agentId }, 'Failed to get unified agent');
      return null;
    }
  }

  /**
   * Convert registry agent to unified format
   */
  private convertRegistryToUnified(registryAgent: AgentRegistration): UnifiedAgent {
    return {
      id: registryAgent.agentId,
      name: registryAgent.agentId,
      capabilities: registryAgent.capabilities,
      status: registryAgent.status === 'online' ? 'available' : (registryAgent.status as 'available' | 'busy' | 'offline' | 'error'),
      maxConcurrentTasks: registryAgent.maxConcurrentTasks,
      currentTasks: registryAgent.currentTasks || [],
      transportType: registryAgent.transportType,
      sessionId: registryAgent.sessionId,
      pollingInterval: registryAgent.pollingInterval,
      registeredAt: registryAgent.registeredAt || Date.now(),
      lastSeen: registryAgent.lastSeen || Date.now(),
      lastHeartbeat: new Date(registryAgent.lastSeen || Date.now()),
      performance: {
        tasksCompleted: 0,
        averageCompletionTime: 0,
        successRate: 1.0
      },
      httpEndpoint: registryAgent.httpEndpoint,
      httpAuthToken: registryAgent.httpAuthToken,
      websocketConnection: registryAgent.websocketConnection,
      metadata: {
        version: '1.0.0',
        supportedProtocols: [registryAgent.transportType],
        preferences: {}
      }
    };
  }

  /**
   * Convert orchestrator agent to unified format
   */
  private convertOrchestratorToUnified(orchestratorAgent: AgentInfo): UnifiedAgent {
    return {
      id: orchestratorAgent.id,
      name: orchestratorAgent.name,
      capabilities: orchestratorAgent.capabilities.map(cap => cap.toString()),
      status: orchestratorAgent.status === 'available' ? 'online' : (orchestratorAgent.status as 'online' | 'offline' | 'busy'),
      maxConcurrentTasks: orchestratorAgent.maxConcurrentTasks,
      currentTasks: orchestratorAgent.currentTasks,
      transportType: (orchestratorAgent.metadata?.preferences?.transportType as 'stdio' | 'sse' | 'websocket' | 'http') || 'stdio',
      sessionId: orchestratorAgent.metadata?.preferences?.sessionId as string | undefined,
      pollingInterval: orchestratorAgent.metadata?.preferences?.pollingInterval as number | undefined,
      registeredAt: Date.now(),
      lastSeen: orchestratorAgent.lastHeartbeat.getTime(),
      lastHeartbeat: orchestratorAgent.lastHeartbeat,
      performance: orchestratorAgent.performance,
      httpEndpoint: orchestratorAgent.metadata?.preferences?.httpEndpoint as string | undefined,
      httpAuthToken: orchestratorAgent.metadata?.preferences?.httpAuthToken as string | undefined,
      metadata: orchestratorAgent.metadata
    };
  }
}
