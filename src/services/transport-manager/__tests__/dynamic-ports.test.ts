/**
 * Integration Tests for Transport Manager Dynamic Port Allocation
 * 
 * Tests the complete startup sequence with port conflicts, environment variables,
 * graceful degradation, retry logic, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'net';
import { transportManager } from '../index.js';

// Mock logger to avoid console output during tests
vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock WebSocket and HTTP services to avoid actual server startup
vi.mock('../../websocket-server/index.js', () => ({
  websocketServer: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getConnectionCount: vi.fn().mockReturnValue(0),
    getConnectedAgents: vi.fn().mockReturnValue([])
  }
}));

vi.mock('../../http-agent-api/index.js', () => ({
  httpAgentAPI: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../../sse-notifier/index.js', () => ({
  sseNotifier: {
    getConnectionCount: vi.fn().mockReturnValue(0)
  }
}));

describe('Transport Manager Dynamic Port Allocation', () => {
  let testServers: any[] = [];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    testServers = [];
    originalEnv = { ...process.env };

    // Clear environment variables
    delete process.env.WEBSOCKET_PORT;
    delete process.env.WEBSOCKET_PORT_RANGE;
    delete process.env.HTTP_AGENT_PORT;
    delete process.env.HTTP_AGENT_PORT_RANGE;
    delete process.env.SSE_PORT;
    delete process.env.SSE_PORT_RANGE;

    // Reset mocks
    const { websocketServer } = await import('../../websocket-server/index.js');
    const { httpAgentAPI } = await import('../../http-agent-api/index.js');
    vi.clearAllMocks();

    // Reset mock implementations to default
    (websocketServer.start as any).mockResolvedValue(undefined);
    (httpAgentAPI.start as any).mockResolvedValue(undefined);

    // Reset transport manager state
    await transportManager.stopAll();
    transportManager.configure({
      websocket: { enabled: true, port: 9900, path: '/agent-ws' },
      http: { enabled: true, port: 9901, cors: true },
      sse: { enabled: true },
      stdio: { enabled: true }
    });
  });

  afterEach(async () => {
    // Clean up test servers
    await Promise.all(testServers.map(server => 
      new Promise<void>((resolve) => {
        if (server.listening) {
          server.close(() => resolve());
        } else {
          resolve();
        }
      })
    ));
    testServers = [];

    // Restore environment
    process.env = originalEnv;

    // Stop transport manager
    try {
      await transportManager.stopAll();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Environment Variable Handling', () => {
    it('should use single port environment variables with priority', async () => {
      process.env.WEBSOCKET_PORT = '9910';
      process.env.WEBSOCKET_PORT_RANGE = '9900-9920';
      process.env.HTTP_AGENT_PORT = '9911';
      
      transportManager.configure({
        websocket: { enabled: true, port: 8080, path: '/agent-ws' },
        http: { enabled: true, port: 3011, cors: true },
        sse: { enabled: true },
        stdio: { enabled: true }
      });

      await transportManager.startAll();
      
      const allocatedPorts = transportManager.getAllocatedPorts();
      expect(allocatedPorts.websocket).toBe(9910);
      expect(allocatedPorts.http).toBe(9911);
    });

    it('should fall back to range variables when single port not set', async () => {
      process.env.WEBSOCKET_PORT_RANGE = '9920-9930';
      process.env.HTTP_AGENT_PORT_RANGE = '9931-9940';
      
      await transportManager.startAll();
      
      const allocatedPorts = transportManager.getAllocatedPorts();
      expect(allocatedPorts.websocket).toBeGreaterThanOrEqual(9920);
      expect(allocatedPorts.websocket).toBeLessThanOrEqual(9930);
      expect(allocatedPorts.http).toBeGreaterThanOrEqual(9931);
      expect(allocatedPorts.http).toBeLessThanOrEqual(9940);
    });

    it('should handle invalid environment variables gracefully', async () => {
      process.env.WEBSOCKET_PORT = 'invalid';
      process.env.HTTP_AGENT_PORT_RANGE = 'abc-def';
      process.env.SSE_PORT = '99999';
      
      // Should not throw and should use defaults
      await expect(transportManager.startAll()).resolves.not.toThrow();
      
      const allocatedPorts = transportManager.getAllocatedPorts();
      expect(typeof allocatedPorts.websocket).toBe('number');
      expect(typeof allocatedPorts.http).toBe('number');
    });
  });

  describe('Port Conflict Resolution', () => {
    it('should find alternative ports when configured ports are occupied', async () => {
      // Occupy the configured ports
      const server1 = createServer();
      const server2 = createServer();
      testServers.push(server1, server2);
      
      await Promise.all([
        new Promise<void>((resolve) => server1.listen(9900, () => resolve())),
        new Promise<void>((resolve) => server2.listen(9901, () => resolve()))
      ]);

      transportManager.configure({
        websocket: { enabled: true, port: 9900, path: '/agent-ws' },
        http: { enabled: true, port: 9901, cors: true },
        sse: { enabled: true },
        stdio: { enabled: true }
      });

      await transportManager.startAll();
      
      const allocatedPorts = transportManager.getAllocatedPorts();
      expect(allocatedPorts.websocket).not.toBe(9900);
      expect(allocatedPorts.http).not.toBe(9901);
      expect(typeof allocatedPorts.websocket).toBe('number');
      expect(typeof allocatedPorts.http).toBe('number');
    });

    it('should handle port range conflicts', async () => {
      // Occupy multiple ports in a range
      const servers = [];
      for (let port = 9950; port <= 9955; port++) {
        const server = createServer();
        servers.push(server);
        testServers.push(server);
        await new Promise<void>((resolve) => server.listen(port, () => resolve()));
      }

      process.env.WEBSOCKET_PORT_RANGE = '9950-9955';
      process.env.HTTP_AGENT_PORT_RANGE = '9956-9960';
      
      await transportManager.startAll();
      
      const allocatedPorts = transportManager.getAllocatedPorts();
      // WebSocket should find a port outside the occupied range or fail gracefully
      // HTTP should succeed in its range
      expect(typeof allocatedPorts.http).toBe('number');
      expect(allocatedPorts.http).toBeGreaterThanOrEqual(9956);
    });
  });

  describe('Graceful Degradation', () => {
    it('should continue with available transports when some fail', async () => {
      // Mock WebSocket service to fail
      const { websocketServer } = await import('../../websocket-server/index.js');
      (websocketServer.start as any).mockRejectedValueOnce(new Error('WebSocket startup failed'));

      await transportManager.startAll();
      
      const status = transportManager.getStatus();
      expect(status.isStarted).toBe(true);
      
      // Should have some services started even if WebSocket failed
      expect(status.startedServices.length).toBeGreaterThan(0);
      expect(status.startedServices).toContain('stdio');
      expect(status.startedServices).toContain('sse');
    });

    it('should handle all network services failing gracefully', async () => {
      // Mock all network services to fail
      const { websocketServer } = await import('../../websocket-server/index.js');
      const { httpAgentAPI } = await import('../../http-agent-api/index.js');

      (websocketServer.start as any).mockRejectedValue(new Error('WebSocket failed'));
      (httpAgentAPI.start as any).mockRejectedValue(new Error('HTTP failed'));

      await transportManager.startAll();
      
      const status = transportManager.getStatus();
      expect(status.isStarted).toBe(true);
      
      // Should still have stdio and SSE
      expect(status.startedServices).toContain('stdio');
      expect(status.startedServices).toContain('sse');
      expect(status.startedServices).not.toContain('websocket');
      expect(status.startedServices).not.toContain('http');
    });
  });

  describe('Service Retry Logic', () => {
    it('should retry service startup with alternative ports', async () => {
      // Mock WebSocket to fail first time, succeed on retry
      const { websocketServer } = await import('../../websocket-server/index.js');

      // Clear previous calls and set up specific mock behavior
      vi.clearAllMocks();
      (websocketServer.start as any)
        .mockRejectedValueOnce(new Error('Port in use'))
        .mockResolvedValue(undefined); // Succeed on subsequent calls

      await transportManager.startAll();

      const status = transportManager.getStatus();
      expect(status.startedServices).toContain('websocket');

      // Should have been called at least twice (initial + retry)
      expect((websocketServer.start as any).mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should give up after maximum retries', async () => {
      // Mock service to always fail
      const { websocketServer } = await import('../../websocket-server/index.js');
      (websocketServer.start as any).mockRejectedValue(new Error('Always fails'));

      await transportManager.startAll();
      
      const status = transportManager.getStatus();
      expect(status.startedServices).not.toContain('websocket');
      
      // Should have been called multiple times (initial + retries)
      expect((websocketServer.start as any).mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('Port Status Queries', () => {
    it('should provide accurate port information after startup', async () => {
      await transportManager.startAll();
      
      const allocatedPorts = transportManager.getAllocatedPorts();
      const endpoints = transportManager.getServiceEndpoints();
      
      expect(typeof allocatedPorts.websocket).toBe('number');
      expect(typeof allocatedPorts.http).toBe('number');
      expect(allocatedPorts.stdio).toBeUndefined();
      
      expect(endpoints.websocket).toContain(`ws://localhost:${allocatedPorts.websocket}`);
      expect(endpoints.http).toContain(`http://localhost:${allocatedPorts.http}`);
      expect(endpoints.stdio).toBe('stdio://mcp-server');
    });

    it('should return undefined for failed services', async () => {
      // Mock WebSocket to always fail (including retries)
      const { websocketServer } = await import('../../websocket-server/index.js');

      // Clear mocks and set up failure behavior
      vi.clearAllMocks();
      (websocketServer.start as any).mockRejectedValue(new Error('Always fails'));

      // Reset the transport manager to clear any previous state
      await transportManager.stopAll();
      transportManager.configure({
        websocket: { enabled: true, port: 9900, path: '/agent-ws' },
        http: { enabled: true, port: 9901, cors: true },
        sse: { enabled: true },
        stdio: { enabled: true }
      });

      await transportManager.startAll();

      const allocatedPorts = transportManager.getAllocatedPorts();
      expect(allocatedPorts.websocket).toBeUndefined();
      expect(typeof allocatedPorts.http).toBe('number');
    });
  });

  describe('Configuration Management', () => {
    it('should handle disabled services correctly', async () => {
      transportManager.configure({
        websocket: { enabled: false, port: 8080, path: '/agent-ws' },
        http: { enabled: false, port: 3001, cors: true },
        sse: { enabled: true },
        stdio: { enabled: true }
      });

      await transportManager.startAll();
      
      const status = transportManager.getStatus();
      expect(status.startedServices).not.toContain('websocket');
      expect(status.startedServices).not.toContain('http');
      expect(status.startedServices).toContain('sse');
      expect(status.startedServices).toContain('stdio');
    });

    it('should prevent multiple startups', async () => {
      await transportManager.startAll();
      
      // Second startup should be ignored
      await transportManager.startAll();
      
      const status = transportManager.getStatus();
      expect(status.isStarted).toBe(true);
    });
  });
});
