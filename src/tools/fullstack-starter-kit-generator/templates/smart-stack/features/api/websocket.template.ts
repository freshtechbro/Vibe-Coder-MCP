import { z } from 'zod';

export interface WebSocketConfig {
  port: number;
  path: string;
  auth: boolean;
  redis: boolean;
}

const configSchema = z.object({
  port: z.number(),
  path: z.string(),
  auth: z.boolean(),
  redis: z.boolean(),
});

export function generateWebSocket(
  config: WebSocketConfig
): Array<{ path: string; content: string }> {
  const validatedConfig = configSchema.parse(config);

  return [
    {
      path: 'api/websocket/server.ts',
      content: `
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { app } from '../server';
${validatedConfig.redis ? "import { createAdapter } from '@socket.io/redis-adapter';" : ''}
import { handleConnection } from './handlers';
import { authMiddleware } from './middleware/auth';

const server = createServer(app);
const wss = new WebSocketServer({ 
  server,
  path: '${validatedConfig.path}'
});

${
  validatedConfig.redis
    ? `
const pubClient = createRedisClient();
const subClient = pubClient.duplicate();

Promise.all([
  pubClient.connect(),
  subClient.connect()
]).then(() => {
  wss.adapter(createAdapter(pubClient, subClient));
});
`
    : ''
}

wss.on('connection', ${validatedConfig.auth ? 'authMiddleware(handleConnection)' : 'handleConnection'});

export { server, wss };`,
    },
    {
      path: 'api/websocket/events.ts',
      content: `
export enum WebSocketEvent {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  MESSAGE = 'message',
  ERROR = 'error'
}`,
    },
    {
      path: 'api/websocket/handlers/index.ts',
      content: `
import { WebSocket } from 'ws';
import { handleAuth } from './auth';
import { handleChat } from './chat';

export function handleConnection(ws: WebSocket) {
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'auth':
          await handleAuth(ws, message);
          break;
        case 'chat':
          await handleChat(ws, message);
          break;
        default:
          ws.send(JSON.stringify({ error: 'Unknown message type' }));
      }
    } catch (error) {
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });
}`,
    },
    {
      path: 'api/websocket/handlers/auth.ts',
      content: `
import { WebSocket } from 'ws';
import { verifyToken } from '../../lib/jwt';

export async function handleAuth(ws: WebSocket, message: any) {
  try {
    const { token } = message.payload;
    const user = await verifyToken(token);
    
    // @ts-expect-error: Adding user data to WebSocket instance
    ws.user = user;
    
    ws.send(JSON.stringify({ type: 'auth', success: true }));
  } catch (error) {
    ws.send(JSON.stringify({ type: 'auth', success: false }));
  }
}`,
    },
    {
      path: 'api/websocket/handlers/chat.ts',
      content: `
import { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';

export async function handleChat(ws: WebSocket, message: any) {
  const { text } = message.payload;
  
  // @ts-expect-error: Accessing user data from WebSocket instance
  const user = ws.user;
  
  // Broadcast to all clients
  (ws.server as WebSocketServer).clients.forEach((client) => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'chat',
        payload: {
          text,
          user: user?.name || 'Anonymous'
        }
      }));
    }
  });
}`,
    },
    {
      path: 'api/websocket/middleware/auth.ts',
      content: `
import { WebSocket } from 'ws';
import { verifyToken } from '../../lib/jwt';

export function authMiddleware(handler: (ws: WebSocket) => void) {
  return async (ws: WebSocket, request: any) => {
    try {
      const token = request.headers['sec-websocket-protocol'];
      if (!token) {
        ws.close(4001, 'Authentication required');
        return;
      }

      const user = await verifyToken(token);
      // @ts-expect-error: Adding user data to WebSocket instance
      ws.user = user;
      
      handler(ws);
    } catch (error) {
      ws.close(4002, 'Invalid token');
    }
  };
}`,
    },
    {
      path: 'api/websocket/types.ts',
      content: `
export interface WebSocketMessage {
  type: string;
  payload?: unknown;
}

export interface WebSocketUser {
  id: string;
  name: string;
  email: string;
}`,
    },
  ];
}
