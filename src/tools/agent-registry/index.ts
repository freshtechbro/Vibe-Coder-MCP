/**
 * Agent Registry Tool - Universal Agent Registration System
 *
 * Supports both stdio and SSE transports for agent registration
 * Part of the Unified Communication Protocol implementation
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { sseNotifier } from '../../services/sse-notifier/index.js';
import { registerTool, ToolDefinition } from '../../services/routing/toolRegistry.js';
import { transportManager } from '../../services/transport-manager/index.js';
import { InitializationMonitor } from '../../utils/initialization-monitor.js';
import { dependencyContainer } from '../../services/dependency-container.js';
import { z } from 'zod';

// Agent registration interface
export interface AgentRegistration {
  agentId: string;
  capabilities: string[];
  transportType: 'stdio' | 'sse' | 'websocket' | 'http';
  sessionId: string;
  maxConcurrentTasks: number;
  pollingInterval?: number; // Only for stdio and http transports
  status?: 'online' | 'offline' | 'busy';
  registeredAt?: number;
  lastSeen?: number;
  currentTasks?: string[];
  // WebSocket specific properties
  websocketConnection?: WebSocket; // WebSocket connection reference
  // HTTP specific properties
  httpEndpoint?: string; // Agent's HTTP callback endpoint
  httpAuthToken?: string; // Authentication token for HTTP callbacks
}

// Agent registry singleton
class AgentRegistry {
  private static instance: AgentRegistry;
  private static isInitializing = false; // Initialization guard to prevent circular initialization
  private agents = new Map<string, AgentRegistration>();
  private sessionToAgent = new Map<string, string>(); // sessionId -> agentId mapping
  private integrationBridge: { registerAgent: (agent: Record<string, unknown>) => Promise<void> } | null = null; // Lazy loaded to avoid circular dependencies
  private isBridgeRegistration = false; // Flag to prevent circular registration

  static getInstance(): AgentRegistry {
    if (AgentRegistry.isInitializing) {
      console.warn('Circular initialization detected in AgentRegistry, using safe fallback');
      return AgentRegistry.createSafeFallback();
    }

    if (!AgentRegistry.instance) {
      const monitor = InitializationMonitor.getInstance();
      monitor.startServiceInitialization('AgentRegistry', [
        'SSENotifier',
        'TransportManager'
      ]);

      AgentRegistry.isInitializing = true;
      try {
        monitor.startPhase('AgentRegistry', 'constructor');
        AgentRegistry.instance = new AgentRegistry();
        monitor.endPhase('AgentRegistry', 'constructor');

        monitor.endServiceInitialization('AgentRegistry');
      } catch (error) {
        monitor.endPhase('AgentRegistry', 'constructor', error as Error);
        monitor.endServiceInitialization('AgentRegistry', error as Error);
        throw error;
      } finally {
        AgentRegistry.isInitializing = false;
      }
    }
    return AgentRegistry.instance;
  }

  /**
   * Create safe fallback instance to prevent recursion
   */
  private static createSafeFallback(): AgentRegistry {
    const fallback = Object.create(AgentRegistry.prototype);

    // Initialize with minimal safe properties
    fallback.agents = new Map();
    fallback.sessionToAgent = new Map();
    fallback.integrationBridge = null;
    fallback.isBridgeRegistration = false;

    // Provide safe no-op methods
    fallback.registerAgent = async () => {
      console.warn('AgentRegistry fallback: registerAgent called during initialization');
      return { success: false, message: 'Registry initializing' };
    };
    fallback.getAgent = async () => {
      console.warn('AgentRegistry fallback: getAgent called during initialization');
      return null;
    };
    fallback.getOnlineAgents = async () => {
      console.warn('AgentRegistry fallback: getOnlineAgents called during initialization');
      return [];
    };

    return fallback;
  }

  /**
   * Initialize integration bridge using dependency container
   */
  private async initializeIntegrationBridge(): Promise<void> {
    if (!this.integrationBridge) {
      this.integrationBridge = await dependencyContainer.getAgentIntegrationBridge() as { registerAgent: (agent: Record<string, unknown>) => Promise<void>; } | null;
      if (!this.integrationBridge) {
        console.warn('Integration bridge not available, using fallback');
      }
    }
  }

  async registerAgent(registration: AgentRegistration): Promise<void> {
    // Validate registration
    this.validateRegistration(registration);

    // Check for existing agent
    const existingAgent = this.agents.get(registration.agentId);
    if (existingAgent) {
      // Update existing agent
      await this.updateAgent(registration);
    } else {
      // Register new agent
      await this.createAgent(registration);
    }

    // Update session mapping
    this.sessionToAgent.set(registration.sessionId, registration.agentId);

    // Only trigger integration bridge if this is not already a bridge-initiated registration
    if (!this.isBridgeRegistration) {
      await this.initializeIntegrationBridge();
      if (this.integrationBridge) {
        try {
          await this.integrationBridge.registerAgent({
            id: registration.agentId,
            capabilities: registration.capabilities,
            status: registration.status || 'online',
            maxConcurrentTasks: registration.maxConcurrentTasks,
            currentTasks: registration.currentTasks || [],
            transportType: registration.transportType,
            sessionId: registration.sessionId,
            pollingInterval: registration.pollingInterval,
            registeredAt: registration.registeredAt || Date.now(),
            lastSeen: registration.lastSeen || Date.now(),
            lastHeartbeat: new Date(registration.lastSeen || Date.now()),
            performance: {
              tasksCompleted: 0,
              averageCompletionTime: 0,
              successRate: 1.0
            },
            httpEndpoint: registration.httpEndpoint,
            httpAuthToken: registration.httpAuthToken,
            websocketConnection: registration.websocketConnection,
            metadata: {
              version: '1.0.0',
              supportedProtocols: [registration.transportType],
              preferences: {
                transportType: registration.transportType,
                sessionId: registration.sessionId,
                pollingInterval: registration.pollingInterval,
                httpEndpoint: registration.httpEndpoint,
                httpAuthToken: registration.httpAuthToken
              }
            }
          });
          console.log(`Agent ${registration.agentId} registered in both registry and orchestrator via integration bridge`);
        } catch (bridgeError) {
          console.warn(`Integration bridge registration failed for agent ${registration.agentId}:`, bridgeError);
        }
      }
    }

    // Notify SSE clients if applicable
    if (registration.transportType === 'sse') {
      await this.notifyAgentRegistered(registration);
    }
  }

  private validateRegistration(registration: AgentRegistration): void {
    if (!registration.agentId || registration.agentId.trim() === '') {
      throw new Error('Agent ID is required');
    }
    if (!registration.capabilities || registration.capabilities.length === 0) {
      throw new Error('Agent capabilities are required');
    }
    if (!['stdio', 'sse'].includes(registration.transportType)) {
      throw new Error('Transport type must be stdio or sse');
    }
    if (!registration.sessionId || registration.sessionId.trim() === '') {
      throw new Error('Session ID is required');
    }
    if (registration.maxConcurrentTasks < 1 || registration.maxConcurrentTasks > 10) {
      throw new Error('Max concurrent tasks must be between 1 and 10');
    }
  }

  private async createAgent(registration: AgentRegistration): Promise<void> {
    const agentData: AgentRegistration = {
      ...registration,
      status: 'online',
      registeredAt: Date.now(),
      lastSeen: Date.now(),
      currentTasks: []
    };

    this.agents.set(registration.agentId, agentData);
    console.log(`Agent ${registration.agentId} registered with ${registration.transportType} transport`);
  }

  private async updateAgent(registration: AgentRegistration): Promise<void> {
    const existing = this.agents.get(registration.agentId)!;
    const updated: AgentRegistration = {
      ...existing,
      ...registration,
      lastSeen: Date.now(),
      status: 'online'
    };

    this.agents.set(registration.agentId, updated);
    console.log(`Agent ${registration.agentId} updated registration`);
  }

  private async notifyAgentRegistered(registration: AgentRegistration): Promise<void> {
    try {
      // Broadcast to all SSE clients
      await sseNotifier.broadcastEvent('agentRegistered', {
        agentId: registration.agentId,
        capabilities: registration.capabilities,
        status: 'online',
        transportType: registration.transportType,
        registeredAt: Date.now()
      });

      console.log(`SSE notification sent for agent ${registration.agentId} registration`);
    } catch (error) {
      console.error('Failed to send SSE notification for agent registration:', error);
      // Don't throw - registration should succeed even if SSE notification fails
    }
  }

  async getAgent(agentId: string): Promise<AgentRegistration | undefined> {
    return this.agents.get(agentId);
  }

  async getAgentBySession(sessionId: string): Promise<AgentRegistration | undefined> {
    const agentId = this.sessionToAgent.get(sessionId);
    return agentId ? this.agents.get(agentId) : undefined;
  }

  async getAllAgents(): Promise<AgentRegistration[]> {
    return Array.from(this.agents.values());
  }

  async getOnlineAgents(): Promise<AgentRegistration[]> {
    return Array.from(this.agents.values()).filter(agent => agent.status === 'online');
  }

  async updateAgentStatus(agentId: string, status: 'online' | 'offline' | 'busy'): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      agent.lastSeen = Date.now();

      // Notify SSE clients of status change
      if (agent.transportType === 'sse') {
        await this.notifyAgentStatusUpdate(agent);
      }
    }
  }

  private async notifyAgentStatusUpdate(agent: AgentRegistration): Promise<void> {
    try {
      await sseNotifier.broadcastEvent('agentStatusUpdate', {
        agentId: agent.agentId,
        status: agent.status,
        lastSeen: agent.lastSeen,
        currentTasks: agent.currentTasks?.length || 0
      });
    } catch (error) {
      console.error('Failed to send SSE notification for agent status update:', error);
    }
  }

  async unregisterAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      // Remove from maps
      this.agents.delete(agentId);
      this.sessionToAgent.delete(agent.sessionId);

      // Notify SSE clients
      if (agent.transportType === 'sse') {
        await this.notifyAgentUnregistered(agent);
      }

      console.log(`Agent ${agentId} unregistered`);
    }
  }

  private async notifyAgentUnregistered(agent: AgentRegistration): Promise<void> {
    try {
      await sseNotifier.broadcastEvent('agentUnregistered', {
        agentId: agent.agentId,
        unregisteredAt: Date.now()
      });
    } catch (error) {
      console.error('Failed to send SSE notification for agent unregistration:', error);
    }
  }

  // Get dynamic endpoint URLs using allocated ports from Transport Manager
  getTransportEndpoints(): { websocket?: string; http?: string; sse?: string } {
    const allocatedPorts = transportManager.getAllocatedPorts();
    const endpoints: { websocket?: string; http?: string; sse?: string } = {};

    if (allocatedPorts.websocket) {
      endpoints.websocket = `ws://localhost:${allocatedPorts.websocket}/agent-ws`;
    }

    if (allocatedPorts.http) {
      endpoints.http = `http://localhost:${allocatedPorts.http}`;
    }

    if (allocatedPorts.sse) {
      endpoints.sse = `http://localhost:${allocatedPorts.sse}/events`;
    }

    return endpoints;
  }

  // Get transport-specific instructions with dynamic port information
  getTransportInstructions(registration: AgentRegistration): string {
    const endpoints = this.getTransportEndpoints();

    switch (registration.transportType) {
      case 'stdio':
        return `Poll for tasks using 'get-agent-tasks' every ${registration.pollingInterval}ms`;

      case 'sse': {
        const sseEndpoint = endpoints.sse || 'http://localhost:3000/events';
        return `Connect to SSE endpoint: ${sseEndpoint}/{sessionId} for real-time task notifications`;
      }

      case 'websocket': {
        const wsEndpoint = endpoints.websocket || 'ws://localhost:8080/agent-ws';
        return `Connect to WebSocket endpoint: ${wsEndpoint} for real-time task notifications`;
      }

      case 'http': {
        const httpEndpoint = endpoints.http || 'http://localhost:3001';
        return `Register with HTTP API: ${httpEndpoint}/agents/register. ` +
               `Tasks will be sent to your endpoint: ${registration.httpEndpoint}. ` +
               `Poll for additional tasks at: ${httpEndpoint}/agents/${registration.agentId}/tasks every ${registration.pollingInterval}ms`;
      }

      default:
        return 'Transport-specific instructions not available';
    }
  }

  // Health check - mark agents as offline if not seen recently
  async performHealthCheck(): Promise<void> {
    const now = Date.now();
    const timeoutMs = 5 * 60 * 1000; // 5 minutes

    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.status === 'online' && (now - (agent.lastSeen || 0)) > timeoutMs) {
        await this.updateAgentStatus(agentId, 'offline');
        console.log(`Agent ${agentId} marked as offline due to inactivity`);
      }
    }
  }
}

// MCP Tool Definition
export const registerAgentTool = {
  name: 'register-agent',
  description: 'Register an AI agent with the task management system',
  inputSchema: {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        description: 'Unique agent identifier (e.g., claude-agent-001)'
      },
      capabilities: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of agent capabilities (e.g., code_generation, testing, debugging)'
      },
      transportType: {
        type: 'string',
        enum: ['stdio', 'sse', 'websocket', 'http'],
        description: 'Communication transport type'
      },
      sessionId: {
        type: 'string',
        description: 'MCP session identifier'
      },
      maxConcurrentTasks: {
        type: 'number',
        default: 1,
        minimum: 1,
        maximum: 10,
        description: 'Maximum number of concurrent tasks this agent can handle'
      },
      pollingInterval: {
        type: 'number',
        default: 5000,
        minimum: 1000,
        maximum: 30000,
        description: 'Polling interval in milliseconds (stdio and http transports only)'
      },
      httpEndpoint: {
        type: 'string',
        description: 'HTTP callback endpoint URL (required for http transport)'
      },
      httpAuthToken: {
        type: 'string',
        description: 'Authentication token for HTTP callbacks (optional for http transport)'
      }
    },
    required: ['agentId', 'capabilities', 'transportType', 'sessionId']
  }
};

// Tool Handler
export async function handleRegisterAgent(args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const registry = AgentRegistry.getInstance();

    // Prepare registration data
    const registration: AgentRegistration = {
      agentId: args.agentId as string,
      capabilities: args.capabilities as string[],
      transportType: args.transportType as 'stdio' | 'sse' | 'websocket' | 'http',
      sessionId: args.sessionId as string,
      maxConcurrentTasks: (args.maxConcurrentTasks as number) || 1,
      pollingInterval: (args.pollingInterval as number) || 5000,
      httpEndpoint: args.httpEndpoint as string | undefined,
      httpAuthToken: args.httpAuthToken as string | undefined
    };

    // Validate transport-specific requirements
    if (registration.transportType === 'http' && !registration.httpEndpoint) {
      throw new Error('HTTP endpoint is required for http transport');
    }

    // Register the agent
    await registry.registerAgent(registration);

    // Get dynamic transport instructions with allocated ports
    const transportInstructions = registry.getTransportInstructions(registration);
    const endpoints = registry.getTransportEndpoints();

    // Prepare endpoint information for response
    const endpointInfo = Object.entries(endpoints)
      .filter(([_, url]) => url)
      .map(([transport, url]) => `${transport.toUpperCase()}: ${url}`)
      .join('\n');

    return {
      content: [{
        type: 'text',
        text: `✅ Agent Registration Successful\n\n` +
              `Agent ID: ${registration.agentId}\n` +
              `Transport: ${registration.transportType}\n` +
              `Capabilities: ${registration.capabilities.join(', ')}\n` +
              `Max Concurrent Tasks: ${registration.maxConcurrentTasks}\n` +
              `Session: ${registration.sessionId}\n\n` +
              `🌐 Available Endpoints (Dynamic Port Allocation):\n${endpointInfo || 'No endpoints available yet'}\n\n` +
              `📋 Next Steps:\n${transportInstructions}\n\n` +
              `🔧 Available Commands:\n` +
              `- get-agent-tasks: Poll for new task assignments\n` +
              `- submit-task-response: Submit completed task results`
      }]
    };
  } catch (error) {
    console.error('Agent registration failed:', error);
    return {
      content: [{
        type: 'text',
        text: `❌ Agent Registration Failed\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
              `Please check your registration parameters and try again.`
      }],
      isError: true
    };
  }
}

// Export registry instance for use by other modules
export { AgentRegistry };

// Start health check interval
setInterval(() => {
  AgentRegistry.getInstance().performHealthCheck();
}, 60000); // Check every minute

// --- Tool Registration ---

// Define the input schema shape for Zod validation
const registerAgentInputSchemaShape = {
  agentId: z.string().min(1, { message: "Agent ID is required" }).describe("Unique agent identifier (e.g., claude-agent-001)"),
  capabilities: z.array(z.string()).min(1, { message: "At least one capability is required" }).describe("List of agent capabilities (e.g., code_generation, testing, debugging)"),
  transportType: z.enum(['stdio', 'sse', 'websocket', 'http']).describe("Communication transport type"),
  sessionId: z.string().min(1, { message: "Session ID is required" }).describe("MCP session identifier"),
  maxConcurrentTasks: z.number().min(1).max(10).default(1).describe("Maximum number of concurrent tasks this agent can handle"),
  pollingInterval: z.number().min(1000).max(30000).default(5000).describe("Polling interval in milliseconds (stdio and http transports only)"),
  httpEndpoint: z.string().url().optional().describe("HTTP callback endpoint URL (required for http transport)"),
  httpAuthToken: z.string().optional().describe("Authentication token for HTTP callbacks (optional for http transport)")
};

// Tool definition for the agent registry tool
const registerAgentToolDefinition: ToolDefinition = {
  name: "register-agent",
  description: "Register an AI agent with the task management system. Supports both stdio and SSE transports for universal agent communication.",
  inputSchema: registerAgentInputSchemaShape,
  executor: handleRegisterAgent
};

// Register the tool with the central registry
registerTool(registerAgentToolDefinition);
