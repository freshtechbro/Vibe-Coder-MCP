#!/usr/bin/env node

/**
 * Repotools Lightweight Server
 * 
 * A high-performance Express.js server that provides processing capabilities
 * for the Repotools Chrome extension. Handles file system access, tool execution,
 * and real-time communication via WebSockets.
 */

import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { config } from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import { errorHandler } from '@/middleware/errorHandler.js';
import { rateLimiter } from '@/middleware/rateLimiter.js';
import { validateApiKey } from '@/middleware/auth.js';
import { setupRoutes } from '@/routes/index.js';
import { WebSocketManager } from '@/services/websocket.js';
import { TaskManager } from '@/services/taskManager.js';
import { FileSystemService } from '@/services/fileSystem.js';
import { HealthService } from '@/services/health.js';

class RepotoolsServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wsServer: WebSocketServer;
  private wsManager!: WebSocketManager;
  private taskManager!: TaskManager;
  private fileSystemService!: FileSystemService;
  private healthService!: HealthService;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wsServer = new WebSocketServer({ 
      server: this.server,
      path: '/ws'
    });

    this.initializeServices();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  private initializeServices(): void {
    logger.info('Initializing services...');

    // Initialize core services
    this.fileSystemService = new FileSystemService();
    this.taskManager = new TaskManager();
    this.wsManager = new WebSocketManager(this.wsServer);
    this.healthService = new HealthService();

    // Connect services
    this.taskManager.setWebSocketManager(this.wsManager);
    
    logger.info('Services initialized successfully');
  }

  private setupMiddleware(): void {
    logger.info('Setting up middleware...');

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // CORS configuration for Chrome extension
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow Chrome extension origins and localhost
        if (!origin || 
            origin.startsWith('chrome-extension://') ||
            origin.startsWith('http://localhost:') ||
            origin.startsWith('https://localhost:')) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    }));

    // Compression and parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Logging
    if (config.NODE_ENV !== 'test') {
      this.app.use(morgan('combined', {
        stream: { write: (message) => logger.info(message.trim()) }
      }));
    }

    // Rate limiting
    this.app.use(rateLimiter);

    // API key validation for protected routes
    this.app.use('/api', validateApiKey);

    logger.info('Middleware setup complete');
  }

  private setupRoutes(): void {
    logger.info('Setting up routes...');

    // Health check endpoint (no auth required)
    this.app.get('/health', async (_req, res) => {
      const health = await this.healthService.getStatus();
      res.status(health.status === 'healthy' ? 200 : 503).json(health);
    });

    // API routes
    setupRoutes(this.app, {
      taskManager: this.taskManager,
      fileSystemService: this.fileSystemService,
      wsManager: this.wsManager,
    });

    // Serve static files for documentation
    if (config.NODE_ENV === 'development') {
      this.app.use('/docs', express.static('docs'));
    }

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
      });
    });

    logger.info('Routes setup complete');
  }

  private setupWebSocket(): void {
    logger.info('Setting up WebSocket server...');

    this.wsManager.initialize();

    // Handle WebSocket connections
    this.wsServer.on('connection', (ws, request) => {
      logger.info(`New WebSocket connection from ${request.socket.remoteAddress}`);
      this.wsManager.handleConnection(ws, request);
    });

    logger.info('WebSocket server setup complete');
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use(errorHandler);

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, _promise) => {
      logger.error('Unhandled Rejection:', reason);
      // Don't exit the process in production
      if (config.NODE_ENV !== 'production') {
        process.exit(1);
      }
    });

    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      // Graceful shutdown
      this.shutdown();
    });

    // Graceful shutdown signals
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      this.shutdown();
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      this.shutdown();
    });
  }

  public async start(): Promise<void> {
    try {
      // Initialize workspace
      await this.fileSystemService.initializeWorkspace();

      // Start server
      this.server.listen(config.PORT, config.HOST, () => {
        logger.info(`🚀 Repotools Server started successfully!`);
        logger.info(`📍 Server: http://${config.HOST}:${config.PORT}`);
        logger.info(`🔌 WebSocket: ws://${config.HOST}:${config.PORT}/ws`);
        logger.info(`🏥 Health: http://${config.HOST}:${config.PORT}/health`);
        logger.info(`📊 Environment: ${config.NODE_ENV}`);
        
        if (config.NODE_ENV === 'development') {
          logger.info(`📚 Docs: http://${config.HOST}:${config.PORT}/docs`);
        }
      });

      // Start background services
      this.taskManager.start();
      this.healthService.start();

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down server...');

    try {
      // Stop accepting new connections
      this.server.close();

      // Close WebSocket connections
      this.wsManager.shutdown();

      // Stop background services
      await this.taskManager.stop();
      this.healthService.stop();

      logger.info('Server shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  // Getter methods for testing
  public getApp(): express.Application {
    return this.app;
  }

  public getServer(): ReturnType<typeof createServer> {
    return this.server;
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new RepotoolsServer();
  server.start().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { RepotoolsServer };
