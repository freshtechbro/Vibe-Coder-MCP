import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';

import { handlerFactory } from './core/handlers/handler-factory.js';
import logger from './logger.js';
import { ToolExecutionContext } from './services/routing/toolRegistry.js';
import { jobManager } from './services/job-manager/index.js'; // Import jobManager for job polling
import { sseNotifier } from './services/sse-notifier/index.js'; // Import SSE notifier

const app = express();

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// Request validation schema
const requestSchema = z.object({
  handlerName: z.string(),
  params: z.record(z.unknown()),
  config: z.record(z.unknown()).optional(),
  context: z.object({
    sessionId: z.string(),
    jobId: z.string().optional(),
    userId: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

// Execute handler endpoint
app.post('/execute', async (req, res) => {
  try {
    const {
      handlerName,
      params,
      config = {},
      context,
    } = requestSchema.parse(req.body);
    const handler = handlerFactory.getHandler(handlerName);

    if (!handler) {
      return res.status(404).json({
        error: `Handler '${handlerName}' not found`,
      });
    }

    const result = await handler.handle(
      params,
      config,
      context as ToolExecutionContext
    );
    return res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Handler execution failed');
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// --- Job Result Polling Endpoint ---
// GET /job/:jobId/result - Poll for job status/result
app.get('/job/:jobId/result', async (req, res) => {
  const { jobId } = req.params;
  const job = await jobManager.getJob(jobId);
  if (!job) {
    return res.status(404).json({ status: 'not_found', error: 'Job not found' });
  }
  return res.json({
    status: job.status,
    result: job.result ?? null,
    error: job.error ? (job.error.message || job.error) : null,
  });
});

// --- Server-Sent Events (SSE) Endpoint ---
// GET /events - Subscribe for real-time job status updates
app.get('/events', (req, res) => {
  sseNotifier.handleConnection(req, res);
});

// Get available handlers endpoint
app.get('/handlers', (_req, res) => {
  try {
    const handlers = handlerFactory.getAllHandlers().map((h) => ({
      name: h.name,
      description: h.description,
    }));
    return res.json(handlers);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get handlers');
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// Error handling
// Using underscore prefix to indicate intentionally unused parameters
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error({ err }, 'Server error');
    res.status(500).json({ error: 'Internal server error' });
  }
);

export function startServer(port: number): void {
  app.listen(port, () => {
    logger.info(`Server started on port ${port}`);
  });
}

export { app };
