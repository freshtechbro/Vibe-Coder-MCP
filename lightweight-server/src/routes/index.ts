/**
 * Main router setup for Repotools Lightweight Server
 * 
 * Configures all API routes and middleware for the server.
 * Provides a centralized routing configuration.
 */

import { Application } from 'express';
import { logger } from '@/utils/logger.js';

// Import route modules
import { createTaskRoutes } from '@/routes/tasks.js';
import { createFileRoutes } from '@/routes/files.js';
import { createWebSocketRoutes } from '@/routes/websocket.js';
import { createSystemRoutes } from '@/routes/system.js';

// Import services
import { TaskManager } from '@/services/taskManager.js';
import { FileSystemService } from '@/services/fileSystem.js';
import { WebSocketManager } from '@/services/websocket.js';

interface ServiceDependencies {
  taskManager: TaskManager;
  fileSystemService: FileSystemService;
  wsManager: WebSocketManager;
}

/**
 * Setup all API routes with service dependencies
 */
export function setupRoutes(app: Application, services: ServiceDependencies): void {
  logger.info('Setting up API routes...');

  const { taskManager, fileSystemService, wsManager } = services;

  // API version prefix
  const apiPrefix = '/api/v1';

  // Task management routes
  app.use(`${apiPrefix}/tasks`, createTaskRoutes(taskManager, wsManager));

  // File system routes
  app.use(`${apiPrefix}/files`, createFileRoutes(fileSystemService));

  // WebSocket management routes
  app.use(`${apiPrefix}/ws`, createWebSocketRoutes(wsManager));

  // System and health routes
  app.use(`${apiPrefix}/system`, createSystemRoutes());

  // API documentation route
  app.get(`${apiPrefix}`, (_req, res) => {
    res.json({
      name: 'Repotools Lightweight Server API',
      version: '1.0.0',
      description: 'API for Chrome extension backend services',
      endpoints: {
        tasks: `${apiPrefix}/tasks`,
        files: `${apiPrefix}/files`,
        websocket: `${apiPrefix}/ws`,
        system: `${apiPrefix}/system`,
        health: '/health',
      },
      documentation: '/docs',
      timestamp: new Date().toISOString(),
    });
  });

  logger.info('API routes setup complete');
}
