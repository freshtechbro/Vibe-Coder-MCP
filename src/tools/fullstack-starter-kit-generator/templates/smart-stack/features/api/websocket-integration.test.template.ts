import { z } from 'zod';

export interface WebSocketIntegrationTestConfig {
  testFramework: 'jest' | 'vitest';
  coverage: boolean;
  redis: boolean;
}

const configSchema = z.object({
  testFramework: z.enum(['jest', 'vitest']),
  coverage: z.boolean(),
  redis: z.boolean(),
});

export function generateWebSocketIntegrationTests(
  config: WebSocketIntegrationTestConfig
): Array<{ path: string; content: string }> {
  const validatedConfig = configSchema.parse(config);

  return [
    {
      path: 'api/websocket/tests/integration/setup.ts',
      content: `
import { beforeAll, afterAll } from '${validatedConfig.testFramework}';
import { app } from '../../../server';
import { createRedisClient } from '../../../lib/redis';

let server;
${validatedConfig.redis ? 'let redis;' : ''}

beforeAll(async () => {
  server = app.listen(0);
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
  await server.close();
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
      path: 'api/websocket/tests/integration/redis-adapter.test.ts',
      content: `
import { describe, it, expect, beforeEach, afterEach } from '${validatedConfig.testFramework}';
import { WebSocket } from 'ws';
import { createRedisAdapter } from '../../adapters/redis';

describe('Redis WebSocket Adapter', () => {
  let ws1;
  let ws2;
  ${validatedConfig.redis ? 'let adapter;' : ''}

  beforeEach(async () => {
    const port = parseInt(process.env.WS_PORT || '8080');
    ws1 = new WebSocket(\`ws://localhost:\${port}\`);
    ws2 = new WebSocket(\`ws://localhost:\${port}\`);
    ${
      validatedConfig.redis
        ? `
    adapter = createRedisAdapter();
    await adapter.connect();
    `
        : ''
    }
  });

  afterEach(async () => {
    ws1.close();
    ws2.close();
    ${
      validatedConfig.redis
        ? `
    await adapter.disconnect();
    `
        : ''
    }
  });

  it('should broadcast messages to all clients', (done) => {
    const message = { type: 'test', payload: { hello: 'world' } };
    
    ws2.on('message', (data) => {
      const received = JSON.parse(data.toString());
      expect(received).toEqual(message);
      done();
    });

    ws1.on('open', () => {
      ws1.send(JSON.stringify(message));
    });
  });
});`,
    },
  ];
}
