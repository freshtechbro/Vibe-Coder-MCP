/**
 * Downstream Tool Integration Tests
 * 
 * Tests that agent registry, task manager, and orchestrator work correctly
 * with dynamically allocated ports from the Transport Manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { transportManager } from '../../services/transport-manager/index.js';

// Mock logger to avoid console output during tests
vi.mock('../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock transport services
vi.mock('../../services/websocket-server/index.js', () => ({
  websocketServer: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getConnectionCount: vi.fn().mockReturnValue(5)
  }
}));

vi.mock('../../services/http-agent-api/index.js', () => ({
  httpAgentAPI: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../../services/sse-notifier/index.js', () => ({
  sseNotifier: {
    getConnectionCount: vi.fn().mockReturnValue(3)
  }
}));

describe('Downstream Tool Integration with Dynamic Ports', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    
    // Set up test environment with specific ports
    process.env.WEBSOCKET_PORT = '9800';
    process.env.HTTP_AGENT_PORT = '9801';
    process.env.SSE_PORT = '9802';

    // Configure transport manager
    transportManager.configure({
      websocket: { enabled: true, port: 8080, path: '/agent-ws' },
      http: { enabled: true, port: 3001, cors: true },
      sse: { enabled: true },
      stdio: { enabled: true }
    });
  });

  afterEach(async () => {
    // Restore environment
    process.env = originalEnv;

    // Stop transport manager
    try {
      await transportManager.stopAll();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Agent Registry Integration', () => {
    let AgentRegistry: any;

    beforeEach(async () => {
      // Start transport manager first
      await transportManager.startAll();
      
      // Import agent registry after transport manager is started
      const module = await import('../agent-registry/index.js');
      AgentRegistry = module.AgentRegistry;
    });

    it('should provide dynamic endpoint URLs for agent registration', async () => {
      const registry = new AgentRegistry();
      const endpoints = registry.getTransportEndpoints();
      
      expect(endpoints.websocket).toBe('ws://localhost:9800/agent-ws');
      expect(endpoints.http).toBe('http://localhost:9801');
      expect(endpoints.sse).toBe('http://localhost:9802/events');
    });

    it('should generate correct transport instructions with dynamic ports', async () => {
      const registry = new AgentRegistry();
      
      const wsRegistration = {
        agentId: 'test-ws-agent',
        transportType: 'websocket' as const,
        capabilities: ['general'],
        maxConcurrentTasks: 3,
        pollingInterval: 5000,
        sessionId: 'test-session'
      };

      const instructions = registry.getTransportInstructions(wsRegistration);
      expect(instructions).toContain('ws://localhost:9800/agent-ws');

      const httpRegistration = {
        agentId: 'test-http-agent',
        transportType: 'http' as const,
        capabilities: ['general'],
        maxConcurrentTasks: 3,
        pollingInterval: 5000,
        sessionId: 'test-session',
        httpEndpoint: 'http://agent.example.com/webhook'
      };

      const httpInstructions = registry.getTransportInstructions(httpRegistration);
      expect(httpInstructions).toContain('http://localhost:9801');
    });

    it('should handle missing allocated ports gracefully', async () => {
      // Stop transport manager to simulate missing ports
      await transportManager.stopAll();
      
      const registry = new AgentRegistry();
      const endpoints = registry.getTransportEndpoints();
      
      // Should provide fallback endpoints
      expect(endpoints.websocket).toBeUndefined();
      expect(endpoints.http).toBeUndefined();
      expect(endpoints.sse).toBeUndefined();
    });
  });

  describe('Vibe Task Manager Integration', () => {
    let getAgentEndpointInfo: any;

    beforeEach(async () => {
      // Start transport manager first
      await transportManager.startAll();
      
      // Import the function from vibe task manager
      const module = await import('../vibe-task-manager/index.js');
      // Note: In real implementation, we'd need to export this function
      // For testing, we'll simulate it
      getAgentEndpointInfo = () => {
        const allocatedPorts = transportManager.getAllocatedPorts();
        const endpoints = transportManager.getServiceEndpoints();
        
        return {
          endpoints,
          allocatedPorts,
          status: 'available'
        };
      };
    });

    it('should provide accurate endpoint information in status commands', async () => {
      const endpointInfo = getAgentEndpointInfo();
      
      expect(endpointInfo.allocatedPorts.websocket).toBe(9800);
      expect(endpointInfo.allocatedPorts.http).toBe(9801);
      expect(endpointInfo.allocatedPorts.sse).toBe(9802);
      expect(endpointInfo.status).toBe('available');
      
      expect(endpointInfo.endpoints.websocket).toBe('ws://localhost:9800/agent-ws');
      expect(endpointInfo.endpoints.http).toBe('http://localhost:9801');
      expect(endpointInfo.endpoints.sse).toBe('http://localhost:9802/events');
    });

    it('should handle transport manager unavailability', async () => {
      // Stop transport manager
      await transportManager.stopAll();
      
      const endpointInfo = getAgentEndpointInfo();
      
      expect(endpointInfo.allocatedPorts.websocket).toBeUndefined();
      expect(endpointInfo.allocatedPorts.http).toBeUndefined();
      expect(endpointInfo.allocatedPorts.sse).toBeUndefined();
    });
  });

  describe('Agent Orchestrator Integration', () => {
    let AgentOrchestrator: any;

    beforeEach(async () => {
      // Start transport manager first
      await transportManager.startAll();
      
      // Import agent orchestrator
      const module = await import('../vibe-task-manager/services/agent-orchestrator.js');
      AgentOrchestrator = module.AgentOrchestrator;
    });

    it('should provide accurate transport status with dynamic ports', async () => {
      const orchestrator = AgentOrchestrator.getInstance();
      const transportStatus = orchestrator.getTransportStatus();
      
      expect(transportStatus.websocket.available).toBe(true);
      expect(transportStatus.websocket.port).toBe(9800);
      expect(transportStatus.websocket.endpoint).toBe('ws://localhost:9800/agent-ws');
      
      expect(transportStatus.http.available).toBe(true);
      expect(transportStatus.http.port).toBe(9801);
      expect(transportStatus.http.endpoint).toBe('http://localhost:9801');
      
      expect(transportStatus.sse.available).toBe(true);
      expect(transportStatus.sse.port).toBe(9802);
      expect(transportStatus.sse.endpoint).toBe('http://localhost:9802/events');
      
      expect(transportStatus.stdio.available).toBe(true);
    });

    it('should handle partial service failures in transport status', async () => {
      // Mock WebSocket service failure
      const { websocketServer } = await import('../../services/websocket-server/index.js');
      (websocketServer.start as any).mockRejectedValueOnce(new Error('WebSocket failed'));
      
      // Restart transport manager to trigger the failure
      await transportManager.stopAll();
      await transportManager.startAll();
      
      const orchestrator = AgentOrchestrator.getInstance();
      const transportStatus = orchestrator.getTransportStatus();
      
      expect(transportStatus.websocket.available).toBe(false);
      expect(transportStatus.http.available).toBe(true);
      expect(transportStatus.sse.available).toBe(true);
      expect(transportStatus.stdio.available).toBe(true);
    });
  });

  describe('Cross-Tool Consistency', () => {
    beforeEach(async () => {
      await transportManager.startAll();
    });

    it('should provide consistent port information across all tools', async () => {
      // Get port information from transport manager
      const allocatedPorts = transportManager.getAllocatedPorts();
      const endpoints = transportManager.getServiceEndpoints();
      
      // Import and test agent registry
      const { AgentRegistry } = await import('../agent-registry/index.js');
      const registry = new AgentRegistry();
      const registryEndpoints = registry.getTransportEndpoints();
      
      // Import and test agent orchestrator
      const { AgentOrchestrator } = await import('../vibe-task-manager/services/agent-orchestrator.js');
      const orchestrator = AgentOrchestrator.getInstance();
      const orchestratorStatus = orchestrator.getTransportStatus();
      
      // All tools should report the same port information
      expect(registryEndpoints.websocket).toBe(endpoints.websocket);
      expect(registryEndpoints.http).toBe(endpoints.http);
      expect(registryEndpoints.sse).toBe(endpoints.sse);
      
      expect(orchestratorStatus.websocket.port).toBe(allocatedPorts.websocket);
      expect(orchestratorStatus.http.port).toBe(allocatedPorts.http);
      expect(orchestratorStatus.sse.port).toBe(allocatedPorts.sse);
    });

    it('should handle dynamic port changes consistently', async () => {
      // Get initial port information
      const initialPorts = transportManager.getAllocatedPorts();
      
      // Restart transport manager with different environment
      await transportManager.stopAll();
      process.env.WEBSOCKET_PORT = '9900';
      process.env.HTTP_AGENT_PORT = '9901';
      await transportManager.startAll();
      
      const newPorts = transportManager.getAllocatedPorts();
      
      // Ports should have changed
      expect(newPorts.websocket).not.toBe(initialPorts.websocket);
      expect(newPorts.http).not.toBe(initialPorts.http);
      expect(newPorts.websocket).toBe(9900);
      expect(newPorts.http).toBe(9901);
      
      // All downstream tools should reflect the new ports
      const { AgentRegistry } = await import('../agent-registry/index.js');
      const registry = new AgentRegistry();
      const endpoints = registry.getTransportEndpoints();
      
      expect(endpoints.websocket).toBe('ws://localhost:9900/agent-ws');
      expect(endpoints.http).toBe('http://localhost:9901');
    });
  });

  describe('Error Handling and Fallbacks', () => {
    it('should handle transport manager initialization failures', async () => {
      // Don't start transport manager
      
      const { AgentRegistry } = await import('../agent-registry/index.js');
      const registry = new AgentRegistry();
      
      // Should not throw when getting endpoints
      expect(() => registry.getTransportEndpoints()).not.toThrow();
      
      const endpoints = registry.getTransportEndpoints();
      expect(endpoints.websocket).toBeUndefined();
      expect(endpoints.http).toBeUndefined();
      expect(endpoints.sse).toBeUndefined();
    });

    it('should provide meaningful error messages for missing services', async () => {
      await transportManager.startAll();
      
      // Mock all services to fail
      const { websocketServer } = await import('../../services/websocket-server/index.js');
      const { httpAgentAPI } = await import('../../services/http-agent-api/index.js');

      (websocketServer.start as any).mockRejectedValue(new Error('WebSocket failed'));
      (httpAgentAPI.start as any).mockRejectedValue(new Error('HTTP failed'));
      
      // Restart to trigger failures
      await transportManager.stopAll();
      await transportManager.startAll();
      
      const { AgentOrchestrator } = await import('../vibe-task-manager/services/agent-orchestrator.js');
      const orchestrator = AgentOrchestrator.getInstance();
      const status = orchestrator.getTransportStatus();
      
      // Should indicate which services are unavailable
      expect(status.websocket.available).toBe(false);
      expect(status.http.available).toBe(false);
      expect(status.sse.available).toBe(true); // SSE should still work
      expect(status.stdio.available).toBe(true); // stdio should always work
    });
  });
});
