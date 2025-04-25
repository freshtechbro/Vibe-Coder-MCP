// @ts-nocheck This is a template file that will be copied to the project and should not be type-checked in the source code
// Test framework imports will be available in the generated project
import { createServer } from 'http';
import { AddressInfo } from 'net';

import { Server } from 'socket.io';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createSocketClient,
  waitForConnection,
} from '../api/websocket/tests/helpers.js';

import { WebSocketHealth } from './health/websocket.js';
import { WebSocketMetrics } from './metrics/websocket.js';

describe('WebSocket Monitoring', () => {
  let httpServer: any;
  let io: Server;
  let metrics: WebSocketMetrics;
  let health: WebSocketHealth;

  beforeAll(() => {
    httpServer = createServer();
    io = new Server(httpServer);
    metrics = new WebSocketMetrics();
    health = new WebSocketHealth(io);
    metrics.attachToServer(io);
    httpServer.listen();
  });

  afterAll(async () => {
    await io.close();
    await new Promise<void>((resolve) => httpServer.close(resolve));
  });

  describe('Metrics', () => {
    it('should track connections', async () => {
      const { socket } = await createSocketClient(true);
      socket.connect();

      await waitForConnection(socket);

      const metricsData = await metrics.getMetrics();
      expect(metricsData).toContain('websocket_connections_current');
      expect(metricsData).toContain('status="connected"');

      socket.disconnect();
    });

    it('should track messages', async () => {
      const { socket } = await createSocketClient(true);
      socket.connect();

      await waitForConnection(socket);

      // Send a test message
      await new Promise<void>((resolve) => {
        socket.emit('chat:send', { content: 'Test message' }, () => resolve());
      });

      const metricsData = await metrics.getMetrics();
      expect(metricsData).toContain('websocket_messages_total');
      expect(metricsData).toContain('type="chat"');

      socket.disconnect();
    });

    it('should track errors', async () => {
      const { socket } = await createSocketClient(true);
      socket.connect();

      await waitForConnection(socket);

      // Trigger an error
      socket.emit('error', new Error('Test error'));

      const metricsData = await metrics.getMetrics();
      expect(metricsData).toContain('websocket_errors_total');
      expect(metricsData).toContain('type="system"');

      socket.disconnect();
    });

    it('should track message latency', async () => {
      const { socket } = await createSocketClient(true);
      socket.connect();

      await waitForConnection(socket);

      // Send a test message
      await new Promise<void>((resolve) => {
        socket.emit('chat:send', { content: 'Test message' }, () => resolve());
      });

      const metricsData = await metrics.getMetrics();
      expect(metricsData).toContain('websocket_message_duration_seconds');
      expect(metricsData).toContain('type="chat"');

      socket.disconnect();
    });
  });

  describe('Health Checks', () => {
    it('should report healthy status', async () => {
      const status = health.getStatus();
      expect(status.status).toBe('healthy');
      expect(status.connections).toBeDefined();
      expect(status.uptime).toBeGreaterThan(0);
      expect(status.memory).toBeDefined();
    });

    it('should monitor connection count', async () => {
      const { socket } = await createSocketClient(true);
      socket.connect();

      await waitForConnection(socket);

      const status = health.getStatus();
      expect(status.connections.current).toBeGreaterThan(0);
      expect(status.connections.total).toBeGreaterThan(0);
      expect(status.connections.peak).toBeGreaterThan(0);

      socket.disconnect();
    });

    it('should report server information', async () => {
      const status = health.getStatus();
      expect(status.server).toBeDefined();
      expect(status.server.version).toBeDefined();
      expect(status.server.uptime).toBeGreaterThan(0);
    });
  });
});
