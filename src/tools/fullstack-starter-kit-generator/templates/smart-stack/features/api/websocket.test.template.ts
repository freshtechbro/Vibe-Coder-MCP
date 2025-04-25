import { z } from 'zod';

export interface WebSocketServerTestConfig {
  testFramework: 'jest' | 'vitest';
  coverage: boolean;
  redis: boolean;
}

const configSchema = z.object({
  testFramework: z.enum(['jest', 'vitest']),
  coverage: z.boolean(),
  redis: z.boolean(),
});

export function generateWebSocketServerTests(
  config: WebSocketServerTestConfig
): Array<{ path: string; content: string }> {
  const validatedConfig = configSchema.parse(config);

  return [
    {
      path: 'api/websocket/tests/setup.ts',
      content: `
import { beforeAll, afterAll } from '${validatedConfig.testFramework}';
import { server } from '../server';
${validatedConfig.redis ? "import { createRedisClient } from '../../lib/redis';" : ''}

${validatedConfig.redis ? 'let redis;' : ''}

beforeAll(async () => {
  server.listen(0);
  ${
    validatedConfig.redis
      ? `
  redis = createRedisClient();
  await redis.connect();
  `
      : ''
  }
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  ${
    validatedConfig.redis
      ? `
  await redis.quit();
  `
      : ''
  }
});`,
    },
    {
      path: 'api/websocket/tests/helpers.ts',
      content: `
import { WebSocket } from 'ws';
import { createToken } from '../../lib/jwt';

export function createTestClient(port: number, token?: string) {
  const protocols = token ? [token] : undefined;
  return new WebSocket(\`ws://localhost:\${port}\`, protocols);
}

export function createAuthToken(user = { id: '1', name: 'Test User' }) {
  return createToken(user);
}

export function waitForMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}`,
    },
    {
      path: 'api/websocket/tests/auth.test.ts',
      content: `
import { describe, it, expect, beforeEach, afterEach } from '${validatedConfig.testFramework}';
import { WebSocket } from 'ws';
import { server } from '../server';
import { createTestClient, createAuthToken } from './helpers';

describe('WebSocket Auth', () => {
  let client: WebSocket;
  const port = (server.address() as any).port;

  afterEach(() => {
    client?.close();
  });

  it('should authenticate with valid token', (done) => {
    const token = createAuthToken();
    client = createTestClient(port, token);

    client.on('open', () => {
      client.send(JSON.stringify({ type: 'auth', payload: { token } }));
    });

    client.on('message', (data) => {
      const message = JSON.parse(data.toString());
      expect(message).toEqual({ type: 'auth', success: true });
      done();
    });
  });

  it('should reject invalid token', (done) => {
    client = createTestClient(port, 'invalid-token');

    client.on('close', (code) => {
      expect(code).toBe(4002);
      done();
    });
  });
});`,
    },
  ];
}
