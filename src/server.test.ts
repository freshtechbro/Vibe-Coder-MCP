import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

import { HandlerFactory } from './core/handlers/handler-factory.js';
import { app } from './server.js';

describe('Server', () => {
  beforeAll(() => {
    // Clear any existing handlers
    HandlerFactory.getInstance().clearHandlers();
  });

  afterAll(() => {
    // Clean up
    HandlerFactory.getInstance().clearHandlers();
  });

  describe('Health Check', () => {
    it('should return ok status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(Array.isArray(response.body.handlers)).toBe(true);
    });
  });

  describe('Execute Endpoint', () => {
    it('should return 404 for unknown handler', async () => {
      const response = await request(app).post('/execute').send({
        handler: 'non-existent-handler',
        params: {},
      });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should validate request body', async () => {
      const response = await request(app).post('/execute').send({
        // Missing required fields
      });

      expect(response.status).toBe(400);
    });

    it('should execute fullstack starter kit handler', async () => {
      const response = await request(app)
        .post('/execute')
        .send({
          handler: 'fullstack-starter-kit',
          params: {
            projectName: 'test-project',
            description: 'A test project',
            scale: 'small',
            performance: 'standard',
            features: ['auth', 'api'],
            outputDir: './output',
            deployment: {
              platform: 'vercel',
              requirements: ['serverless'],
            },
          },
          config: {
            openRouterApiKey: 'test-key',
            openRouterBaseUrl: 'https://api.openrouter.ai',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].type).toBe('success');
    });
  });
});
