/**
 * WebSocket Server for Real-time Agent Communication
 *
 * Provides bidirectional real-time communication for agents
 * Part of the Unified Communication Protocol WebSocket transport
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import logger from '../../logger.js';
import { AgentRegistry } from '../../tools/agent-registry/index.js';

// WebSocket message types
export interface WebSocketMessage {
  type: 'register' | 'task_assignment' | 'task_response' | 'heartbeat' | 'error';
  agentId?: string;
  sessionId?: string;
  data?: any;
  timestamp?: number;
}

// WebSocket connection info
interface WebSocketConnection {
  ws: WebSocket;
  agentId?: string;
  sessionId: string;
  lastSeen: number;
  authenticated: boolean;
}

// WebSocket server singleton
class WebSocketServerManager {
  private static instance: WebSocketServerManager;
  private server?: WebSocketServer;
  private httpServer?: any;
  private connections = new Map<string, WebSocketConnection>(); // sessionId -> connection
  private agentConnections = new Map<string, string>(); // agentId -> sessionId
  private port: number = 8080;
  private heartbeatInterval?: NodeJS.Timeout;

  static getInstance(): WebSocketServerManager {
    if (!WebSocketServerManager.instance) {
      WebSocketServerManager.instance = new WebSocketServerManager();
    }
    return WebSocketServerManager.instance;
  }

  async start(port: number = 8080): Promise<void> {
    try {
      // Validate port parameter (should be pre-allocated by Transport Manager)
      if (!port || port <= 0 || port > 65535) {
        throw new Error(`Invalid port provided: ${port}. Port should be pre-allocated by Transport Manager.`);
      }

      this.port = port;

      logger.debug({ port }, 'Starting WebSocket server with pre-allocated port');

      // Create HTTP server for WebSocket upgrade
      this.httpServer = createServer();

      // Create WebSocket server
      this.server = new WebSocketServer({
        server: this.httpServer,
        path: '/agent-ws'
      });

      // Set up WebSocket event handlers
      this.server.on('connection', this.handleConnection.bind(this));
      this.server.on('error', this.handleServerError.bind(this));

      // Start HTTP server with pre-allocated port
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.listen(port, (err?: Error) => {
          if (err) {
            // Enhanced error handling for port allocation failures
            if (err.message.includes('EADDRINUSE')) {
              const enhancedError = new Error(
                `Port ${port} is already in use. This should not happen with pre-allocated ports. ` +
                `Transport Manager port allocation may have failed.`
              );
              enhancedError.name = 'PortAllocationError';
              reject(enhancedError);
            } else {
              reject(err);
            }
          } else {
            resolve();
          }
        });
      });

      // Start heartbeat monitoring
      this.startHeartbeatMonitoring();

      logger.info({
        port,
        path: '/agent-ws',
        note: 'Using pre-allocated port from Transport Manager'
      }, 'WebSocket server started successfully');

    } catch (error) {
      logger.error({
        err: error,
        port,
        context: 'WebSocket server startup with pre-allocated port'
      }, 'Failed to start WebSocket server');

      // Re-throw with additional context for Transport Manager retry logic
      if (error instanceof Error) {
        error.message = `WebSocket server startup failed on pre-allocated port ${port}: ${error.message}`;
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      // Stop heartbeat monitoring
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }

      // Close all connections
      for (const [sessionId, connection] of this.connections.entries()) {
        connection.ws.close(1000, 'Server shutdown');
        this.connections.delete(sessionId);
      }

      // Close WebSocket server
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server!.close(() => resolve());
        });
      }

      // Close HTTP server
      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          this.httpServer!.close(() => resolve());
        });
      }

      logger.info('WebSocket server stopped');

    } catch (error) {
      logger.error({ err: error }, 'Error stopping WebSocket server');
      throw error;
    }
  }

  private handleConnection(ws: WebSocket, request: any): void {
    const sessionId = this.generateSessionId();
    const connection: WebSocketConnection = {
      ws,
      sessionId,
      lastSeen: Date.now(),
      authenticated: false
    };

    this.connections.set(sessionId, connection);

    logger.info({ sessionId, remoteAddress: request.socket.remoteAddress }, 'New WebSocket connection');

    // Set up connection event handlers
    ws.on('message', (data) => this.handleMessage(sessionId, data));
    ws.on('close', (code, reason) => this.handleDisconnection(sessionId, code, reason));
    ws.on('error', (error) => this.handleConnectionError(sessionId, error));
    ws.on('pong', () => this.handlePong(sessionId));

    // Send welcome message
    this.sendMessage(sessionId, {
      type: 'register',
      sessionId,
      data: {
        message: 'WebSocket connection established. Please register your agent.',
        timestamp: Date.now()
      }
    });
  }

  private async handleMessage(sessionId: string, data: any): Promise<void> {
    try {
      const connection = this.connections.get(sessionId);
      if (!connection) {
        logger.warn({ sessionId }, 'Message received for unknown connection');
        return;
      }

      // Update last seen
      connection.lastSeen = Date.now();

      // Parse message
      let message: WebSocketMessage;
      try {
        message = JSON.parse(data.toString());
      } catch {
        this.sendError(sessionId, 'Invalid JSON message format');
        return;
      }

      // Add timestamp if not present
      if (!message.timestamp) {
        message.timestamp = Date.now();
      }

      logger.debug({ sessionId, messageType: message.type }, 'WebSocket message received');

      // Handle message based on type
      switch (message.type) {
        case 'register':
          await this.handleAgentRegistration(sessionId, message);
          break;
        case 'task_response':
          await this.handleTaskResponse(sessionId, message);
          break;
        case 'heartbeat':
          await this.handleHeartbeat(sessionId, message);
          break;
        default:
          this.sendError(sessionId, `Unknown message type: ${message.type}`);
      }

    } catch (error) {
      logger.error({ err: error, sessionId }, 'Error handling WebSocket message');
      this.sendError(sessionId, 'Internal server error processing message');
    }
  }

  private async handleAgentRegistration(sessionId: string, message: WebSocketMessage): Promise<void> {
    try {
      const { agentId, capabilities, maxConcurrentTasks } = message.data || {};

      if (!agentId || !capabilities) {
        this.sendError(sessionId, 'Agent registration requires agentId and capabilities');
        return;
      }

      // Update connection with agent info
      const connection = this.connections.get(sessionId);
      if (!connection) {
        this.sendError(sessionId, 'Connection not found');
        return;
      }

      connection.agentId = agentId;
      connection.authenticated = true;

      // Register with agent registry
      const agentRegistry = AgentRegistry.getInstance();
      await agentRegistry.registerAgent({
        agentId,
        capabilities,
        transportType: 'websocket',
        sessionId,
        maxConcurrentTasks: maxConcurrentTasks || 1,
        websocketConnection: connection.ws
      });

      // Store agent connection mapping
      this.agentConnections.set(agentId, sessionId);

      // Send confirmation
      this.sendMessage(sessionId, {
        type: 'register',
        agentId,
        data: {
          success: true,
          message: 'Agent registered successfully via WebSocket',
          timestamp: Date.now()
        }
      });

      logger.info({ sessionId, agentId }, 'Agent registered via WebSocket');

    } catch (error) {
      logger.error({ err: error, sessionId }, 'Failed to register agent via WebSocket');
      this.sendError(sessionId, `Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleTaskResponse(sessionId: string, message: WebSocketMessage): Promise<void> {
    try {
      const connection = this.connections.get(sessionId);
      if (!connection?.agentId) {
        this.sendError(sessionId, 'Agent must be registered before submitting task responses');
        return;
      }

      // Import and use the agent response processor
      const { AgentResponseProcessor } = await import('../../tools/agent-response/index.js');
      const responseProcessor = AgentResponseProcessor.getInstance();

      // Process the task response
      await responseProcessor.processResponse({
        agentId: connection.agentId,
        taskId: message.data.taskId,
        status: message.data.status,
        response: message.data.response,
        completionDetails: message.data.completionDetails,
        receivedAt: Date.now()
      });

      // Send acknowledgment
      this.sendMessage(sessionId, {
        type: 'task_response',
        agentId: connection.agentId,
        data: {
          success: true,
          taskId: message.data.taskId,
          acknowledged: true,
          timestamp: Date.now()
        }
      });

      logger.info({
        sessionId,
        agentId: connection.agentId,
        taskId: message.data.taskId
      }, 'Task response received via WebSocket');

    } catch (error) {
      logger.error({ err: error, sessionId }, 'Failed to process task response via WebSocket');
      this.sendError(sessionId, `Task response processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleHeartbeat(sessionId: string, message: WebSocketMessage): Promise<void> {
    const connection = this.connections.get(sessionId);
    if (connection) {
      connection.lastSeen = Date.now();

      // Send heartbeat response
      this.sendMessage(sessionId, {
        type: 'heartbeat',
        agentId: connection.agentId,
        data: {
          timestamp: Date.now(),
          status: 'alive'
        }
      });
    }
  }

  private handleDisconnection(sessionId: string, code: number, reason: Buffer): void {
    const connection = this.connections.get(sessionId);

    if (connection?.agentId) {
      // Remove agent connection mapping
      this.agentConnections.delete(connection.agentId);

      // Update agent registry
      const agentRegistry = AgentRegistry.getInstance();
      agentRegistry.updateAgentStatus(connection.agentId, 'offline').catch(error => {
        logger.error({ err: error, agentId: connection.agentId }, 'Failed to update agent status on disconnect');
      });
    }

    // Remove connection
    this.connections.delete(sessionId);

    logger.info({
      sessionId,
      agentId: connection?.agentId,
      code,
      reason: reason.toString()
    }, 'WebSocket connection closed');
  }

  private handleConnectionError(sessionId: string, error: Error): void {
    logger.error({ err: error, sessionId }, 'WebSocket connection error');

    const connection = this.connections.get(sessionId);
    if (connection) {
      connection.ws.close(1011, 'Connection error');
    }
  }

  private handlePong(sessionId: string): void {
    const connection = this.connections.get(sessionId);
    if (connection) {
      connection.lastSeen = Date.now();
    }
  }

  private handleServerError(error: Error): void {
    logger.error({ err: error }, 'WebSocket server error');
  }

  // Public methods for sending messages to agents
  async sendTaskToAgent(agentId: string, taskPayload: any): Promise<boolean> {
    try {
      const sessionId = this.agentConnections.get(agentId);
      if (!sessionId) {
        logger.warn({ agentId }, 'No WebSocket connection found for agent');
        return false;
      }

      this.sendMessage(sessionId, {
        type: 'task_assignment',
        agentId,
        data: taskPayload
      });

      return true;

    } catch (error) {
      logger.error({ err: error, agentId }, 'Failed to send task via WebSocket');
      return false;
    }
  }

  private sendMessage(sessionId: string, message: WebSocketMessage): void {
    const connection = this.connections.get(sessionId);
    if (connection && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify(message));
    }
  }

  private sendError(sessionId: string, errorMessage: string): void {
    this.sendMessage(sessionId, {
      type: 'error',
      data: {
        error: errorMessage,
        timestamp: Date.now()
      }
    });
  }

  private generateSessionId(): string {
    return `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 60000; // 1 minute timeout

      for (const [sessionId, connection] of this.connections.entries()) {
        if (now - connection.lastSeen > timeout) {
          logger.warn({ sessionId, agentId: connection.agentId }, 'WebSocket connection timed out');
          connection.ws.close(1000, 'Connection timeout');
        } else if (connection.ws.readyState === WebSocket.OPEN) {
          // Send ping
          connection.ws.ping();
        }
      }
    }, 30000); // Check every 30 seconds
  }

  // Getters for monitoring
  getConnectionCount(): number {
    return this.connections.size;
  }

  getConnectedAgents(): string[] {
    return Array.from(this.agentConnections.keys());
  }

  isAgentConnected(agentId: string): boolean {
    return this.agentConnections.has(agentId);
  }
}

// Export singleton instance
export const websocketServer = WebSocketServerManager.getInstance();
export { WebSocketServerManager };
