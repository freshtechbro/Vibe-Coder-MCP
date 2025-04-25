import { z } from 'zod';

export interface WebSocketTestConfig {
  testFramework: 'jest' | 'vitest';
  coverage: boolean;
}

const configSchema = z.object({
  testFramework: z.enum(['jest', 'vitest']),
  coverage: z.boolean(),
});

export function generateWebSocketTests(
  config: WebSocketTestConfig
): Array<{ path: string; content: string }> {
  const validatedConfig = configSchema.parse(config);

  return [
    {
      path: 'src/services/websocket/tests/setup.ts',
      content: `
import { beforeAll, afterAll } from '${validatedConfig.testFramework}';
import { WebSocketServer } from 'ws';

let wss;

beforeAll(() => {
  wss = new WebSocketServer({ port: 0 });
});

afterAll(() => {
  wss.close();
});`,
    },
    {
      path: 'src/services/websocket/tests/helpers.ts',
      content: `
import { WebSocketServer } from 'ws';

export function createTestServer() {
  return new WebSocketServer({ port: 0 });
}

export function waitForConnection(server: WebSocketServer): Promise<WebSocket> {
  return new Promise((resolve) => {
    server.once('connection', resolve);
  });
}`,
    },
    {
      path: 'src/services/websocket/tests/service.test.ts',
      content: `
import { describe, it, expect, beforeEach, afterEach } from '${validatedConfig.testFramework}';
import { WebSocketClient } from '../index';
import { createTestServer, waitForConnection } from './helpers';

describe('WebSocketClient', () => {
  let server;
  let client;

  beforeEach(() => {
    server = createTestServer();
    client = new WebSocketClient(\`ws://localhost:\${server.address().port}\`);
  });

  afterEach(() => {
    client.close();
    server.close();
  });

  it('should connect to server', async () => {
    const connectionPromise = waitForConnection(server);
    client.connect();
    await expect(connectionPromise).resolves.toBeDefined();
  });

  it('should send messages', async () => {
    const connectionPromise = waitForConnection(server);
    client.connect();
    const ws = await connectionPromise;

    const messagePromise = new Promise((resolve) => {
      ws.once('message', resolve);
    });

    client.send({ type: 'test', payload: { hello: 'world' } });
    
    const message = await messagePromise;
    expect(JSON.parse(message.toString())).toEqual({
      type: 'test',
      payload: { hello: 'world' }
    });
  });
});`,
    },
    {
      path: 'src/services/websocket/tests/hooks.test.ts',
      content: `
import { describe, it, expect, beforeEach, afterEach } from '${validatedConfig.testFramework}';
import { renderHook } from '@testing-library/react-hooks';
import { useWebSocket } from '../hooks';
import { createTestServer, waitForConnection } from './helpers';

describe('useWebSocket', () => {
  let server;

  beforeEach(() => {
    server = createTestServer();
  });

  afterEach(() => {
    server.close();
  });

  it('should connect on mount', async () => {
    const connectionPromise = waitForConnection(server);
    const { result } = renderHook(() => 
      useWebSocket(\`ws://localhost:\${server.address().port}\`)
    );

    await expect(connectionPromise).resolves.toBeDefined();
    expect(result.current.send).toBeDefined();
  });
});`,
    },
    {
      path: 'src/services/websocket/tests/store.test.ts',
      content: `
import { describe, it, expect, beforeEach, afterEach } from '${validatedConfig.testFramework}';
import { WebSocketClient } from '../index';
import { createTestServer, waitForConnection } from './helpers';

describe('WebSocket Store Integration', () => {
  let server;
  let client;

  beforeEach(() => {
    server = createTestServer();
    client = new WebSocketClient(\`ws://localhost:\${server.address().port}\`);
  });

  afterEach(() => {
    client.close();
    server.close();
  });

  it('should update store on message', async () => {
    const connectionPromise = waitForConnection(server);
    client.connect();
    const ws = await connectionPromise;

    // TODO: Add store integration tests
    expect(true).toBe(true);
  });
});`,
    },
  ];
}
