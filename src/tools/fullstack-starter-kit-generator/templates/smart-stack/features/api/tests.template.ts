import { z } from 'zod';

export interface TestConfig {
  testFramework: 'jest' | 'vitest';
  coverage: boolean;
  e2e: boolean;
}

const configSchema = z.object({
  testFramework: z.enum(['jest', 'vitest']),
  coverage: z.boolean(),
  e2e: z.boolean(),
});

export function generateTests(
  config: TestConfig
): Array<{ path: string; content: string }> {
  const validatedConfig = configSchema.parse(config);

  return [
    {
      path: 'api/tests/setup.ts',
      content: `
import { beforeAll, afterAll } from '${validatedConfig.testFramework}';
import { app } from '../server';
import { createTestDatabase } from './helpers';

let server;

beforeAll(async () => {
  await createTestDatabase();
  server = app.listen(0);
});

afterAll(async () => {
  await server.close();
});`,
    },
    {
      path: 'api/tests/helpers.ts',
      content: `
import { prisma } from '../lib/prisma';

export async function createTestDatabase() {
  // TODO: Implement test database setup
}

export async function clearTestDatabase() {
  // TODO: Implement test database cleanup
}`,
    },
    {
      path: 'api/tests/auth.test.ts',
      content: `
import { describe, it, expect } from '${validatedConfig.testFramework}';
import request from 'supertest';
import { app } from '../server';

describe('Auth API', () => {
  it('should authenticate user', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password' });
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
  });
});`,
    },
    {
      path: 'api/tests/users.test.ts',
      content: `
import { describe, it, expect } from '${validatedConfig.testFramework}';
import request from 'supertest';
import { app } from '../server';

describe('Users API', () => {
  it('should create user', async () => {
    const response = await request(app)
      .post('/users')
      .send({ name: 'Test User', email: 'test@example.com' });
    
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
  });
});`,
    },
    {
      path: 'api/tests/roles.test.ts',
      content: `
import { describe, it, expect } from '${validatedConfig.testFramework}';
import request from 'supertest';
import { app } from '../server';

describe('Roles API', () => {
  it('should assign role to user', async () => {
    const response = await request(app)
      .post('/roles/assign')
      .send({ userId: 1, role: 'admin' });
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
  });
});`,
    },
  ];
}
