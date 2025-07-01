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
  let testServers: { close: () => Promise<void> | void }[] = [];
  let originalEnv: NodeJS.ProcessEnv;
  let testPortBase: number;

  beforeEach(async () => {
    testServers = [];
    originalEnv = { ...process.env };

    // Use unique port ranges for each test to avoid conflicts
    // Generate a random base port in a safe range (25000-35000) - higher range to avoid conflicts
    testPortBase = 25000 + Math.floor(Math.random() * 10000);

    // Clear environment variables
    delete process.env.WEBSOCKET_PORT;
    delete process.env.WEBSOCKET_PORT_RANGE;
    delete process.env.HTTP_AGENT_PORT;
    delete process.env.HTTP_AGENT_PORT_RANGE;
    delete process.env.SSE_PORT;
    delete process.env.SSE_PORT_RANGE;

    // Reset mocks
    vi.clearAllMocks();

    // Reset transport manager state with unique test ports
    await transportManager.stopAll();
    transportManager.reset();
    transportManager.configure({
      websocket: { enabled: true, port: testPortBase, path: '/agent-ws' },
      http: { enabled: true, port: testPortBase + 1, cors: true },
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
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Environment Variable Handling', () => {
    it('should use single port environment variables with priority', async () => {
      const wsPort = testPortBase + 10;
      const httpPort = testPortBase + 11;

      // Set environment variables
      process.env.WEBSOCKET_PORT = wsPort.toString();
      process.env.WEBSOCKET_PORT_RANGE = `${testPortBase + 5}-${testPortBase + 20}`;
      process.env.HTTP_AGENT_PORT = httpPort.toString();

      transportManager.configure({
        websocket: { enabled: true, port: testPortBase + 100, path: '/agent-ws' },
        http: { enabled: true, port: testPortBase + 101, cors: true },
        sse: { enabled: true },
        stdio: { enabled: true }
      });

      await transportManager.startAll();

      const allocatedPorts = transportManager.getAllocatedPorts();

      expect(allocatedPorts.websocket).toBe(wsPort);
      expect(allocatedPorts.http).toBe(httpPort);
    });

    it('should fall back to range variables when single port not set', async () => {
      const wsRangeStart = testPortBase + 20;
      const wsRangeEnd = testPortBase + 30;
      const httpRangeStart = testPortBase + 31;
      const httpRangeEnd = testPortBase + 40;

      process.env.WEBSOCKET_PORT_RANGE = `${wsRangeStart}-${wsRangeEnd}`;
      process.env.HTTP_AGENT_PORT_RANGE = `${httpRangeStart}-${httpRangeEnd}`;

      await transportManager.startAll();

      const allocatedPorts = transportManager.getAllocatedPorts();
      expect(allocatedPorts.websocket).toBeGreaterThanOrEqual(wsRangeStart);
      expect(allocatedPorts.websocket).toBeLessThanOrEqual(wsRangeEnd);
      expect(allocatedPorts.http).toBeGreaterThanOrEqual(httpRangeStart);
      expect(allocatedPorts.http).toBeLessThanOrEqual(httpRangeEnd);
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
        new Promise<void>((resolve) => server1.listen(testPortBase, () => resolve())),
        new Promise<void>((resolve) => server2.listen(testPortBase + 1, () => resolve()))
      ]);

      transportManager.configure({
        websocket: { enabled: true, port: testPortBase, path: '/agent-ws' },
        http: { enabled: true, port: testPortBase + 1, cors: true },
        sse: { enabled: true },
        stdio: { enabled: true }
      });

      await transportManager.startAll();

      const allocatedPorts = transportManager.getAllocatedPorts();
      expect(allocatedPorts.websocket).not.toBe(testPortBase);
      expect(allocatedPorts.http).not.toBe(testPortBase + 1);
      expect(typeof allocatedPorts.websocket).toBe('number');
      expect(typeof allocatedPorts.http).toBe('number');
    });

    it('should handle port range conflicts', async () => {
      // Occupy multiple ports in a range
      const servers = [];
      const conflictRangeStart = testPortBase + 50;
      const conflictRangeEnd = testPortBase + 55;

      for (let port = conflictRangeStart; port <= conflictRangeEnd; port++) {
        const server = createServer();
        servers.push(server);
        testServers.push(server);
        await new Promise<void>((resolve) => server.listen(port, () => resolve()));
      }

      process.env.WEBSOCKET_PORT_RANGE = `${conflictRangeStart}-${conflictRangeEnd}`;
      process.env.HTTP_AGENT_PORT_RANGE = `${testPortBase + 56}-${testPortBase + 60}`;

      await transportManager.startAll();

      const allocatedPorts = transportManager.getAllocatedPorts();
      // WebSocket should find a port outside the occupied range or fail gracefully
      // HTTP should succeed in its range
      expect(typeof allocatedPorts.http).toBe('number');
      expect(allocatedPorts.http).toBeGreaterThanOrEqual(testPortBase + 56);
    });
  });

  describe('Graceful Degradation', () => {
    it('should continue with available transports when some fail', async () => {
      // Mock WebSocket service to fail
      const { websocketServer } = await import('../../websocket-server/index.js');
      (websocketServer.start as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('WebSocket startup failed'));

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

      (websocketServer.start as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('WebSocket failed'));
      (httpAgentAPI.start as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('HTTP failed'));

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
      (websocketServer.start as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Port in use'))
        .mockResolvedValue(undefined); // Succeed on subsequent calls

      await transportManager.startAll();

      const status = transportManager.getStatus();
      expect(status.startedServices).toContain('websocket');

      // Should have been called at least twice (initial + retry)
      expect((websocketServer.start as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should give up after maximum retries', async () => {
      // Mock service to always fail
      const { websocketServer } = await import('../../websocket-server/index.js');
      (websocketServer.start as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Always fails'));

      await transportManager.startAll();
      
      const status = transportManager.getStatus();
      expect(status.startedServices).not.toContain('websocket');
      
      // Should have been called multiple times (initial + retries)
      expect((websocketServer.start as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
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
      (websocketServer.start as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Always fails'));

      // Reset the transport manager to clear any previous state
      await transportManager.stopAll();
      transportManager.reset();
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
