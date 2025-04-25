import { z } from 'zod';

export interface RestApiConfig {
  basePath: string;
  endpoints: Array<{
    path: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    auth?: boolean;
  }>;
}

const configSchema = z.object({
  basePath: z.string(),
  endpoints: z.array(
    z.object({
      path: z.string(),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
      auth: z.boolean().optional(),
    })
  ),
});

export function generateRestApi(
  config: RestApiConfig
): Array<{ path: string; content: string }> {
  const validatedConfig = configSchema.parse(config);

  return [
    {
      path: 'api/server.ts',
      content: `
import express from 'express';
import cors from 'cors';
import { router } from './routes';

const app = express();

app.use(cors());
app.use(express.json());
app.use('${validatedConfig.basePath}', router);

export { app };`,
    },
    {
      path: 'api/routes/index.ts',
      content: `
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

${validatedConfig.endpoints
  .map(
    (endpoint) => `
router.${endpoint.method.toLowerCase()}('${endpoint.path}', ${endpoint.auth ? 'authMiddleware, ' : ''}async (req, res) => {
  try {
    // TODO: Implement endpoint logic
    res.json({ message: 'Not implemented' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});`
  )
  .join('\n')}

export { router };`,
    },
  ];
}
