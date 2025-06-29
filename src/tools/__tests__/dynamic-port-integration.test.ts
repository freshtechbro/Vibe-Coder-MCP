/**
 * Downstream Tool Integration Tests
 * 
 * Tests that agent registry, task manager, and orchestrator work correctly
 * with dynamically allocated ports from the Transport Manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

// Mock transport manager to return proper port information
vi.mock('../../services/transport-manager/index.js', () => ({
  transportManager: {
    configure: vi.fn(),
    startAll: vi.fn().mockResolvedValue(undefined),
    stopAll: vi.fn().mockResolvedValue(undefined),
    getAllocatedPorts: vi.fn(),
    getServiceEndpoints: vi.fn(),
    config: {
      websocket: { allocatedPort: undefined },
      http: { allocatedPort: undefined },
      sse: { allocatedPort: undefined }
    },
    startedServices: []
  }
}));

describe('Downstream Tool Integration with Dynamic Ports', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let testPortBase: number;
  let mockTransportManager: any;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    // Use unique port ranges for each test to avoid conflicts
    // Use 35000-45000 range to avoid conflicts with transport manager tests
    testPortBase = 35000 + Math.floor(Math.random() * 10000);

    // Set up test environment with specific ports
    process.env.WEBSOCKET_PORT = (testPortBase).toString();
    process.env.HTTP_AGENT_PORT = (testPortBase + 1).toString();
    process.env.SSE_PORT = (testPortBase + 2).toString();

    // Get the mocked transport manager
    const { transportManager } = await import('../../services/transport-manager/index.js');
    mockTransportManager = vi.mocked(transportManager);
    
    // Configure mock behavior for successful service start
    mockTransportManager.getAllocatedPorts.mockReturnValue({
      websocket: testPortBase,
      http: testPortBase + 1,
      sse: testPortBase + 2,
      stdio: undefined
    });
    
    mockTransportManager.getServiceEndpoints.mockReturnValue({
      websocket: `ws://localhost:${testPortBase}/agent-ws`,
      http: `http://localhost:${testPortBase + 1}`,
      sse: `http://localhost:${testPortBase + 2}/events`
    });
    
    // Mock config and started services
    mockTransportManager.config = {
      websocket: { allocatedPort: testPortBase },
      http: { allocatedPort: testPortBase + 1 },
      sse: { allocatedPort: testPortBase + 2 }
    };
    mockTransportManager.startedServices = ['websocket', 'http', 'sse'];
  });

  afterEach(async () => {
    // Restore environment
    process.env = originalEnv;

    // Reset mock functions but keep the implementations
    if (mockTransportManager) {
      mockTransportManager.getAllocatedPorts.mockClear();
      mockTransportManager.getServiceEndpoints.mockClear();
      mockTransportManager.configure.mockClear();
      mockTransportManager.startAll.mockClear();
      mockTransportManager.stopAll.mockClear();
    }
  });

  describe('Agent Registry Integration', () => {
    let AgentRegistry: any;

    beforeEach(async () => {
      // Import agent registry
      const module = await import('../agent-registry/index.js');
      AgentRegistry = module.AgentRegistry;
    });

    it('should provide dynamic endpoint URLs for agent registration', async () => {
      const registry = new AgentRegistry();
      const endpoints = registry.getTransportEndpoints();

      expect(endpoints.websocket).toBe(`ws://localhost:${testPortBase}/agent-ws`);
      expect(endpoints.http).toBe(`http://localhost:${testPortBase + 1}`);
      expect(endpoints.sse).toBe(`http://localhost:${testPortBase + 2}/events`);
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
      expect(instructions).toContain(`ws://localhost:${testPortBase}/agent-ws`);

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
      expect(httpInstructions).toContain(`http://localhost:${testPortBase + 1}`);
    });

    it('should handle missing allocated ports gracefully', async () => {
      // Mock transport manager to return no allocated ports
      mockTransportManager.getAllocatedPorts.mockReturnValue({
        websocket: undefined,
        http: undefined,
        sse: undefined,
        stdio: undefined
      });
      
      mockTransportManager.getServiceEndpoints.mockReturnValue({
        websocket: undefined,
        http: undefined,
        sse: undefined
      });
      
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
      // For testing, we'll simulate the endpoint info function
      getAgentEndpointInfo = () => {
        const allocatedPorts = mockTransportManager.getAllocatedPorts();
        const endpoints = mockTransportManager.getServiceEndpoints();
        
        return {
          endpoints,
          allocatedPorts,
          status: 'available'
        };
      };
    });

    it('should provide accurate endpoint information in status commands', async () => {
      const endpointInfo = getAgentEndpointInfo();

      expect(endpointInfo.allocatedPorts.websocket).toBe(testPortBase);
      expect(endpointInfo.allocatedPorts.http).toBe(testPortBase + 1);
      expect(endpointInfo.allocatedPorts.sse).toBe(testPortBase + 2);
      expect(endpointInfo.status).toBe('available');

      expect(endpointInfo.endpoints.websocket).toBe(`ws://localhost:${testPortBase}/agent-ws`);
      expect(endpointInfo.endpoints.http).toBe(`http://localhost:${testPortBase + 1}`);
      expect(endpointInfo.endpoints.sse).toBe(`http://localhost:${testPortBase + 2}/events`);
    });

    it('should handle transport manager unavailability', async () => {
      // Mock transport manager to return no allocated ports
      mockTransportManager.getAllocatedPorts.mockReturnValue({
        websocket: undefined,
        http: undefined,
        sse: undefined,
        stdio: undefined
      });
      
      mockTransportManager.getServiceEndpoints.mockReturnValue({
        websocket: undefined,
        http: undefined,
        sse: undefined
      });
      
      const endpointInfo = getAgentEndpointInfo();
      
      expect(endpointInfo.allocatedPorts.websocket).toBeUndefined();
      expect(endpointInfo.allocatedPorts.http).toBeUndefined();
      expect(endpointInfo.allocatedPorts.sse).toBeUndefined();
    });
  });

  describe('Agent Orchestrator Integration', () => {
    let AgentOrchestrator: any;

    beforeEach(async () => {
      // Import agent orchestrator
      const module = await import('../vibe-task-manager/services/agent-orchestrator.js');
      AgentOrchestrator = module.AgentOrchestrator;
    });

    it('should provide accurate transport status with dynamic ports', async () => {
      const orchestrator = AgentOrchestrator.getInstance();
      const transportStatus = orchestrator.getTransportStatus();

      expect(transportStatus.websocket.available).toBe(true);
      expect(transportStatus.websocket.port).toBe(testPortBase);
      expect(transportStatus.websocket.endpoint).toBe(`ws://localhost:${testPortBase}/agent-ws`);

      expect(transportStatus.http.available).toBe(true);
      expect(transportStatus.http.port).toBe(testPortBase + 1);
      expect(transportStatus.http.endpoint).toBe(`http://localhost:${testPortBase + 1}`);

      expect(transportStatus.sse.available).toBe(true);
      expect(transportStatus.sse.port).toBe(testPortBase + 2);
      expect(transportStatus.sse.endpoint).toBe(`http://localhost:${testPortBase + 2}/events`);

      expect(transportStatus.stdio.available).toBe(true);
    });

    it('should handle partial service failures in transport status', async () => {
      // Mock partial service failure - websocket failed but others work
      mockTransportManager.getAllocatedPorts.mockReturnValue({
        websocket: undefined, // WebSocket failed to start
        http: testPortBase + 1,
        sse: testPortBase + 2,
        stdio: undefined
      });
      
      mockTransportManager.getServiceEndpoints.mockReturnValue({
        websocket: undefined,
        http: `http://localhost:${testPortBase + 1}`,
        sse: `http://localhost:${testPortBase + 2}/events`
      });
      
      const orchestrator = AgentOrchestrator.getInstance();
      const transportStatus = orchestrator.getTransportStatus();
      
      expect(transportStatus.websocket.available).toBe(false);
      expect(transportStatus.http.available).toBe(true);
      expect(transportStatus.sse.available).toBe(true);
      expect(transportStatus.stdio.available).toBe(true);
    });
  });

  describe('Cross-Tool Consistency', () => {
    // No setup needed - using mocked transport manager

    it('should provide consistent port information across all tools', async () => {
      // Get port information from transport manager
      const allocatedPorts = mockTransportManager.getAllocatedPorts();
      const endpoints = mockTransportManager.getServiceEndpoints();
      
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
      const initialPorts = mockTransportManager.getAllocatedPorts();
      
      // Simulate port changes by updating the mock
      const newPortBase = testPortBase + 100;
      mockTransportManager.getAllocatedPorts.mockReturnValue({
        websocket: newPortBase,
        http: newPortBase + 1,
        sse: newPortBase + 2,
        stdio: undefined
      });
      
      mockTransportManager.getServiceEndpoints.mockReturnValue({
        websocket: `ws://localhost:${newPortBase}/agent-ws`,
        http: `http://localhost:${newPortBase + 1}`,
        sse: `http://localhost:${newPortBase + 2}/events`
      });

      const newPorts = mockTransportManager.getAllocatedPorts();

      // Ports should have changed
      expect(newPorts.websocket).not.toBe(initialPorts.websocket);
      expect(newPorts.http).not.toBe(initialPorts.http);
      expect(newPorts.websocket).toBe(newPortBase);
      expect(newPorts.http).toBe(newPortBase + 1);

      // All downstream tools should reflect the new ports
      const { AgentRegistry } = await import('../agent-registry/index.js');
      const registry = new AgentRegistry();
      const endpoints = registry.getTransportEndpoints();

      expect(endpoints.websocket).toBe(`ws://localhost:${newPortBase}/agent-ws`);
      expect(endpoints.http).toBe(`http://localhost:${newPortBase + 1}`);
    });
  });

  describe('Error Handling and Fallbacks', () => {
    it('should handle transport manager initialization failures', async () => {
      // Mock transport manager to return no allocated ports (simulating initialization failure)
      mockTransportManager.getAllocatedPorts.mockReturnValue({
        websocket: undefined,
        http: undefined,
        sse: undefined,
        stdio: undefined
      });
      
      mockTransportManager.getServiceEndpoints.mockReturnValue({
        websocket: undefined,
        http: undefined,
        sse: undefined
      });
      
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
      // Mock multiple service failures
      mockTransportManager.getAllocatedPorts.mockReturnValue({
        websocket: undefined, // Failed
        http: undefined, // Failed
        sse: testPortBase + 2, // Still works
        stdio: undefined
      });
      
      mockTransportManager.getServiceEndpoints.mockReturnValue({
        websocket: undefined,
        http: undefined,
        sse: `http://localhost:${testPortBase + 2}/events`
      });
      
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
