import { Response } from 'express';

import logger from '../../logger.js';
import { JobStatus } from '../job-manager/index.js';

class SSENotifier {
  private connections: Set<Response>;

  constructor() {
    this.connections = new Set();
  }

  public handleConnection = (
    req: { on: (event: string, callback: () => void) => void },
    res: Response
  ): void => {
    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Add connection to set
    this.connections.add(res);
    logger.debug('Client connected to SSE');

    // Handle client disconnect
    req.on('close', () => {
      this.connections.delete(res);
      logger.debug('Client disconnected from SSE');
    });
  };

  public notify(event: string, data: unknown): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const connection of this.connections) {
      try {
        connection.write(message);
      } catch (error) {
        logger.error({ err: error }, 'Failed to send SSE message');
        this.connections.delete(connection);
      }
    }
  }

  public sendProgress(
    sessionId: string,
    jobId: string,
    status: JobStatus,
    messageText: string
  ): void {
    this.notify('progress', { sessionId, jobId, status, message: messageText });
  }

  public closeAllConnections(): void {
    for (const connection of this.connections) {
      try {
        connection.end();
      } catch (error) {
        logger.error({ err: error }, 'Failed to close SSE connection');
      }
    }
    this.connections.clear();
    logger.info('All SSE connections closed');
  }
}

export const sseNotifier = new SSENotifier();

process.on('SIGINT', () => {
  sseNotifier.closeAllConnections();
  process.exit(0);
});
process.on('SIGTERM', () => {
  sseNotifier.closeAllConnections();
  process.exit(0);
});
