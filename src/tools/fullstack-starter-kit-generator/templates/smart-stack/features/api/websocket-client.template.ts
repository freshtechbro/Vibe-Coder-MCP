import { z } from 'zod';

export interface WebSocketClientConfig {
  url: string;
  reconnect: boolean;
  heartbeat: boolean;
}

const configSchema = z.object({
  url: z.string().url(),
  reconnect: z.boolean(),
  heartbeat: z.boolean(),
});

export function generateWebSocketClient(
  config: WebSocketClientConfig
): Array<{ path: string; content: string }> {
  const validatedConfig = configSchema.parse(config);

  return [
    {
      path: 'src/services/websocket/index.ts',
      content: `
import { WebSocketMessage, WebSocketOptions } from './types';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(
    private url: string = '${validatedConfig.url}',
    private options: WebSocketOptions = {
      reconnect: ${validatedConfig.reconnect},
      heartbeat: ${validatedConfig.heartbeat}
    }
  ) {}

  connect() {
    this.ws = new WebSocket(this.url);
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    if (!this.ws) return;

    this.ws.onopen = () => {
      if (this.options.heartbeat) {
        this.startHeartbeat();
      }
    };

    this.ws.onclose = () => {
      if (this.options.reconnect) {
        this.scheduleReconnect();
      }
    };
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'heartbeat' });
    }, 30000);
  }

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 5000);
  }

  send(message: WebSocketMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
  }
}`,
    },
    {
      path: 'src/services/websocket/types.ts',
      content: `
export interface WebSocketOptions {
  reconnect?: boolean;
  heartbeat?: boolean;
}

export interface WebSocketMessage {
  type: string;
  payload?: unknown;
}`,
    },
    {
      path: 'src/services/websocket/hooks.ts',
      content: `
import { useEffect, useRef } from 'react';
import { WebSocketClient } from './index';
import { WebSocketMessage } from './types';

export function useWebSocket(url: string) {
  const clientRef = useRef<WebSocketClient | null>(null);

  useEffect(() => {
    clientRef.current = new WebSocketClient(url);
    clientRef.current.connect();

    return () => {
      clientRef.current?.close();
    };
  }, [url]);

  return {
    send: (message: WebSocketMessage) => {
      clientRef.current?.send(message);
    }
  };
}`,
    },
  ];
}
