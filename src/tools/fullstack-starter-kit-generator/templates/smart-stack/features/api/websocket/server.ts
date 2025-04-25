import { createServer } from 'http';

import { WebSocket, WebSocketServer } from 'ws';

import logger from '../../../logger.js';
import { app } from '../server.js';

export class WebSocketHandler {
  private wss: InstanceType<typeof WebSocketServer>;
  private clients: Set<WebSocket> = new Set();

  constructor(server = createServer(app)) {
    this.wss = new WebSocketServer({ server });
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.wss.on('connection', this.handleConnection.bind(this));
  }

  private handleConnection(ws: WebSocket) {
    this.clients.add(ws);
    logger.info('Client connected');

    ws.addEventListener('message', (event) => {
      this.handleMessage(ws, event.data.toString());
    });

    ws.addEventListener('close', () => {
      this.clients.delete(ws);
      logger.info('Client disconnected');
    });

    ws.addEventListener('error', (error) => {
      logger.error({ err: error }, 'WebSocket error');
      this.clients.delete(ws);
    });
  }

  private handleMessage(ws: WebSocket, data: string) {
    try {
      const message = JSON.parse(data);
      logger.info({ message }, 'Received message');

      // Echo back to sender
      ws.send(
        JSON.stringify({
          type: 'echo',
          payload: message,
        })
      );

      // Broadcast to other clients
      this.broadcast(ws, message);
    } catch (error) {
      logger.error({ err: error }, 'Failed to handle message');
      ws.send(
        JSON.stringify({
          type: 'error',
          payload: 'Invalid message format',
        })
      );
    }
  }

  private broadcast(sender: WebSocket, message: unknown) {
    const broadcastMessage = JSON.stringify({
      type: 'broadcast',
      payload: message,
    });

    this.clients.forEach((client) => {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
        client.send(broadcastMessage);
      }
    });
  }

  public close() {
    this.wss.close();
  }
}
