/**
 * WebSocket service for real-time communication with Chrome extension
 * 
 * Manages WebSocket connections, handles real-time task updates,
 * and provides bidirectional communication between server and clients.
 */

import { WebSocketServer, WebSocket, RawData } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';

interface WebSocketClient {
  id: string;
  ws: WebSocket;
  isAlive: boolean;
  lastSeen: number;
  metadata: {
    userAgent?: string;
    ip?: string;
    origin?: string;
  };
}

interface WebSocketMessage {
  type: string;
  id?: string;
  data?: any;
  timestamp: number;
}

interface TaskUpdate {
  taskId: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  progress: number;
  message?: string;
  result?: any;
  error?: string;
}

class WebSocketManager {
  private clients: Map<string, WebSocketClient> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;
  constructor(_wsServer: WebSocketServer) {
  }

  public initialize(): void {
    logger.info('Initializing WebSocket manager...');

    // Start heartbeat to detect disconnected clients
    this.startHeartbeat();

    logger.info('WebSocket manager initialized');
  }

  public handleConnection(ws: WebSocket, request: IncomingMessage): void {
    const clientId = uuidv4();
    const client: WebSocketClient = {
      id: clientId,
      ws,
      isAlive: true,
      lastSeen: Date.now(),
      metadata: {
        userAgent: request.headers['user-agent'],
        ip: request.socket.remoteAddress,
        origin: request.headers.origin,
      },
    };

    this.clients.set(clientId, client);

    logger.websocket('Client connected', clientId, {
      totalClients: this.clients.size,
      userAgent: client.metadata.userAgent,
      ip: client.metadata.ip,
    });

    // Set up message handlers
    ws.on('message', (data) => {
      this.handleMessage(clientId, data);
    });

    ws.on('pong', () => {
      this.handlePong(clientId);
    });

    ws.on('close', (code, reason) => {
      this.handleDisconnection(clientId, code, reason);
    });

    ws.on('error', (error) => {
      this.handleError(clientId, error);
    });

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'welcome',
      data: {
        clientId,
        serverTime: new Date().toISOString(),
        version: '1.0.0',
      },
      timestamp: Date.now(),
    });
  }

  private handleMessage(clientId: string, data: RawData): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      
      logger.websocket('Message received', clientId, {
        type: message.type,
        messageId: message.id,
      });

      client.lastSeen = Date.now();

      // Handle different message types
      switch (message.type) {
        case 'ping':
          this.sendToClient(clientId, {
            type: 'pong',
            id: message.id,
            timestamp: Date.now(),
          });
          break;

        case 'subscribe':
          this.handleSubscription(clientId, message.data);
          break;

        case 'unsubscribe':
          this.handleUnsubscription(clientId, message.data);
          break;

        case 'task_control':
          this.handleTaskControl(clientId, message.data);
          break;

        default:
          logger.websocket('Unknown message type', clientId, {
            type: message.type,
          });
      }
    } catch (error) {
      logger.errorWithContext(error as Error, 'WebSocket message parsing', {
        clientId,
        dataLength: Buffer.isBuffer(data) ? data.length : data.toString().length,
      });

      this.sendToClient(clientId, {
        type: 'error',
        data: {
          message: 'Invalid message format',
        },
        timestamp: Date.now(),
      });
    }
  }

  private handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.isAlive = true;
      client.lastSeen = Date.now();
    }
  }

  private handleDisconnection(clientId: string, code: number, reason: Buffer): void {
    const client = this.clients.get(clientId);
    if (client) {
      logger.websocket('Client disconnected', clientId, {
        code,
        reason: reason.toString(),
        totalClients: this.clients.size - 1,
      });

      this.clients.delete(clientId);
    }
  }

  private handleError(clientId: string, error: Error): void {
    logger.errorWithContext(error, 'WebSocket client error', { clientId });
    
    // Remove client on error
    this.clients.delete(clientId);
  }

  private handleSubscription(clientId: string, data: any): void {
    // Handle subscription to specific events/channels
    logger.websocket('Client subscribed', clientId, data);
    
    this.sendToClient(clientId, {
      type: 'subscription_confirmed',
      data,
      timestamp: Date.now(),
    });
  }

  private handleUnsubscription(clientId: string, data: any): void {
    // Handle unsubscription from events/channels
    logger.websocket('Client unsubscribed', clientId, data);
    
    this.sendToClient(clientId, {
      type: 'unsubscription_confirmed',
      data,
      timestamp: Date.now(),
    });
  }

  private handleTaskControl(clientId: string, data: any): void {
    // Handle task control messages (pause, resume, cancel)
    logger.websocket('Task control received', clientId, data);
    
    // This would typically forward to TaskManager
    // For now, just acknowledge
    this.sendToClient(clientId, {
      type: 'task_control_acknowledged',
      data,
      timestamp: Date.now(),
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = config.WS_HEARTBEAT_INTERVAL * 2; // 2x heartbeat interval

      for (const [clientId, client] of this.clients.entries()) {
        // Check if client is still alive
        if (!client.isAlive || (now - client.lastSeen) > timeout) {
          logger.websocket('Client timeout', clientId, {
            lastSeen: new Date(client.lastSeen).toISOString(),
            timeoutMs: timeout,
          });

          client.ws.terminate();
          this.clients.delete(clientId);
          continue;
        }

        // Send ping
        client.isAlive = false;
        try {
          client.ws.ping();
        } catch (error) {
          logger.websocket('Ping failed', clientId);
          this.clients.delete(clientId);
        }
      }
    }, config.WS_HEARTBEAT_INTERVAL);
  }

  // Public methods for sending messages

  public sendToClient(clientId: string, message: WebSocketMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.errorWithContext(error as Error, 'Failed to send message to client', {
        clientId,
        messageType: message.type,
      });
      return false;
    }
  }

  public broadcast(message: WebSocketMessage, excludeClientId?: string): number {
    let sentCount = 0;

    for (const [clientId, _client] of this.clients.entries()) {
      if (excludeClientId && clientId === excludeClientId) {
        continue;
      }

      if (this.sendToClient(clientId, message)) {
        sentCount++;
      }
    }

    logger.websocket('Message broadcasted', undefined, {
      messageType: message.type,
      sentCount,
      totalClients: this.clients.size,
    });

    return sentCount;
  }

  public sendTaskUpdate(taskUpdate: TaskUpdate): void {
    const message: WebSocketMessage = {
      type: 'task_update',
      data: taskUpdate,
      timestamp: Date.now(),
    };

    this.broadcast(message);
  }

  public sendSystemNotification(notification: {
    level: 'info' | 'warning' | 'error';
    title: string;
    message: string;
  }): void {
    const message: WebSocketMessage = {
      type: 'system_notification',
      data: notification,
      timestamp: Date.now(),
    };

    this.broadcast(message);
  }

  // Management methods

  public getConnectedClients(): Array<{
    id: string;
    lastSeen: string;
    metadata: WebSocketClient['metadata'];
  }> {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      lastSeen: new Date(client.lastSeen).toISOString(),
      metadata: client.metadata,
    }));
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  public disconnectClient(clientId: string): boolean {
    const client = this.clients.get(clientId);
    if (client) {
      client.ws.close(1000, 'Disconnected by server');
      this.clients.delete(clientId);
      return true;
    }
    return false;
  }

  public shutdown(): void {
    logger.info('Shutting down WebSocket manager...');

    // Clear heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all client connections
    for (const [_clientId, client] of this.clients.entries()) {
      client.ws.close(1001, 'Server shutting down');
    }

    this.clients.clear();

    logger.info('WebSocket manager shutdown complete');
  }
}

export { WebSocketManager, type WebSocketClient, type WebSocketMessage, type TaskUpdate };
