/**
 * HTTP REST API for Agent Communication
 *
 * Provides RESTful endpoints for agent task management
 * Part of the Unified Communication Protocol HTTP transport
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import logger from '../../logger.js';
import { AgentRegistry } from '../../tools/agent-registry/index.js';
import { AgentTaskQueue } from '../../tools/agent-tasks/index.js';
import { AgentResponseProcessor } from '../../tools/agent-response/index.js';

// HTTP API interfaces
interface HTTPTaskRequest {
  agentId: string;
  taskId: string;
  taskPayload: any;
  priority?: 'low' | 'normal' | 'high';
  deadline?: number;
}

interface HTTPTaskResponse {
  agentId: string;
  taskId: string;
  status: 'DONE' | 'ERROR' | 'PARTIAL';
  response: string;
  completionDetails?: any;
}

interface HTTPAgentRegistration {
  agentId: string;
  capabilities: string[];
  httpEndpoint: string;
  httpAuthToken?: string;
  maxConcurrentTasks?: number;
  pollingInterval?: number;
}

// HTTP Agent API Server
class HTTPAgentAPIServer {
  private static instance: HTTPAgentAPIServer;
  private app: express.Application;
  private server?: any;
  private port: number = 3001;

  static getInstance(): HTTPAgentAPIServer {
    if (!HTTPAgentAPIServer.instance) {
      HTTPAgentAPIServer.instance = new HTTPAgentAPIServer();
    }
    return HTTPAgentAPIServer.instance;
  }

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS configuration
    this.app.use(cors({
      origin: true, // Allow all origins for development
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Agent-ID', 'X-Session-ID']
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logger.debug({
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      }, 'HTTP API request');
      next();
    });

    // Error handling middleware
    this.app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error({ err: error, url: req.url, method: req.method }, 'HTTP API error');
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Agent registration endpoint
    this.app.post('/agents/register', this.handleAgentRegistration.bind(this));

    // Agent task polling endpoint
    this.app.get('/agents/:agentId/tasks', this.handleGetTasks.bind(this));

    // Task response submission endpoint
    this.app.post('/agents/:agentId/tasks/:taskId/response', this.handleTaskResponse.bind(this));

    // Agent status endpoint
    this.app.get('/agents/:agentId/status', this.handleGetAgentStatus.bind(this));

    // Task delivery endpoint (for pushing tasks to agent HTTP endpoints)
    this.app.post('/tasks/deliver', this.handleTaskDelivery.bind(this));

    // Agent heartbeat endpoint
    this.app.post('/agents/:agentId/heartbeat', this.handleHeartbeat.bind(this));

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl
      });
    });
  }

  private async handleAgentRegistration(req: Request, res: Response): Promise<void> {
    try {
      const registration: HTTPAgentRegistration = req.body;

      // Validate required fields
      if (!registration.agentId || !registration.capabilities || !registration.httpEndpoint) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: agentId, capabilities, httpEndpoint'
        });
        return;
      }

      // Generate session ID for HTTP transport
      const sessionId = `http-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Register with agent registry
      const agentRegistry = AgentRegistry.getInstance();
      await agentRegistry.registerAgent({
        agentId: registration.agentId,
        capabilities: registration.capabilities,
        transportType: 'http',
        sessionId,
        maxConcurrentTasks: registration.maxConcurrentTasks || 1,
        pollingInterval: registration.pollingInterval || 5000,
        httpEndpoint: registration.httpEndpoint,
        httpAuthToken: registration.httpAuthToken
      });

      res.json({
        success: true,
        message: 'Agent registered successfully',
        agentId: registration.agentId,
        sessionId,
        transportType: 'http',
        pollingEndpoint: `/agents/${registration.agentId}/tasks`,
        responseEndpoint: `/agents/${registration.agentId}/tasks/{taskId}/response`
      });

      logger.info({ agentId: registration.agentId, httpEndpoint: registration.httpEndpoint }, 'Agent registered via HTTP API');

    } catch (error) {
      logger.error({ err: error }, 'Failed to register agent via HTTP API');
      res.status(500).json({
        success: false,
        error: 'Registration failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleGetTasks(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;
      const maxTasks = parseInt(req.query.maxTasks as string) || 1;

      // Validate agent exists
      const agentRegistry = AgentRegistry.getInstance();
      const agent = await agentRegistry.getAgent(agentId);
      if (!agent) {
        res.status(404).json({
          success: false,
          error: 'Agent not found'
        });
        return;
      }

      // Get tasks from queue
      const taskQueue = AgentTaskQueue.getInstance();
      const tasks = await taskQueue.getTasks(agentId, maxTasks);

      res.json({
        success: true,
        agentId,
        tasks: tasks.map(task => ({
          taskId: task.taskId,
          sentinelPayload: task.sentinelPayload,
          priority: task.priority,
          assignedAt: task.assignedAt,
          deadline: task.deadline,
          metadata: task.metadata
        })),
        remainingInQueue: await taskQueue.getQueueLength(agentId)
      });

      logger.debug({ agentId, tasksRetrieved: tasks.length }, 'Tasks retrieved via HTTP API');

    } catch (error) {
      logger.error({ err: error, agentId: req.params.agentId }, 'Failed to get tasks via HTTP API');
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve tasks',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleTaskResponse(req: Request, res: Response): Promise<void> {
    try {
      const { agentId, taskId } = req.params;
      const responseData: HTTPTaskResponse = req.body;

      // Validate required fields
      if (!responseData.status || !responseData.response) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: status, response'
        });
        return;
      }

      // Process the task response
      const responseProcessor = AgentResponseProcessor.getInstance();
      await responseProcessor.processResponse({
        agentId,
        taskId,
        status: responseData.status,
        response: responseData.response,
        completionDetails: responseData.completionDetails,
        receivedAt: Date.now()
      });

      res.json({
        success: true,
        message: 'Task response processed successfully',
        agentId,
        taskId,
        status: responseData.status,
        processedAt: new Date().toISOString()
      });

      logger.info({ agentId, taskId, status: responseData.status }, 'Task response received via HTTP API');

    } catch (error) {
      logger.error({ err: error, agentId: req.params.agentId, taskId: req.params.taskId }, 'Failed to process task response via HTTP API');
      res.status(500).json({
        success: false,
        error: 'Failed to process task response',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleGetAgentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;

      const agentRegistry = AgentRegistry.getInstance();
      const agent = await agentRegistry.getAgent(agentId);

      if (!agent) {
        res.status(404).json({
          success: false,
          error: 'Agent not found'
        });
        return;
      }

      const taskQueue = AgentTaskQueue.getInstance();
      const queueLength = await taskQueue.getQueueLength(agentId);

      res.json({
        success: true,
        agentId,
        status: agent.status,
        capabilities: agent.capabilities,
        transportType: agent.transportType,
        maxConcurrentTasks: agent.maxConcurrentTasks,
        currentTasks: agent.currentTasks?.length || 0,
        queueLength,
        lastSeen: agent.lastSeen,
        registeredAt: agent.registeredAt
      });

    } catch (error) {
      logger.error({ err: error, agentId: req.params.agentId }, 'Failed to get agent status via HTTP API');
      res.status(500).json({
        success: false,
        error: 'Failed to get agent status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleTaskDelivery(req: Request, res: Response): Promise<void> {
    try {
      const taskRequest: HTTPTaskRequest = req.body;

      // Validate required fields
      if (!taskRequest.agentId || !taskRequest.taskId || !taskRequest.taskPayload) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: agentId, taskId, taskPayload'
        });
        return;
      }

      // Get agent info
      const agentRegistry = AgentRegistry.getInstance();
      const agent = await agentRegistry.getAgent(taskRequest.agentId);

      if (!agent || agent.transportType !== 'http') {
        res.status(404).json({
          success: false,
          error: 'HTTP agent not found'
        });
        return;
      }

      // Deliver task to agent's HTTP endpoint
      const delivered = await this.deliverTaskToAgent(agent, taskRequest);

      if (delivered) {
        res.json({
          success: true,
          message: 'Task delivered successfully',
          agentId: taskRequest.agentId,
          taskId: taskRequest.taskId,
          deliveredAt: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to deliver task to agent endpoint'
        });
      }

    } catch (error) {
      logger.error({ err: error }, 'Failed to deliver task via HTTP API');
      res.status(500).json({
        success: false,
        error: 'Task delivery failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleHeartbeat(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;

      const agentRegistry = AgentRegistry.getInstance();
      await agentRegistry.updateAgentStatus(agentId, 'online');

      res.json({
        success: true,
        message: 'Heartbeat received',
        agentId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error({ err: error, agentId: req.params.agentId }, 'Failed to process heartbeat via HTTP API');
      res.status(500).json({
        success: false,
        error: 'Heartbeat processing failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async deliverTaskToAgent(agent: any, taskRequest: HTTPTaskRequest): Promise<boolean> {
    try {
      if (!agent.httpEndpoint) {
        return false;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (agent.httpAuthToken) {
        headers['Authorization'] = `Bearer ${agent.httpAuthToken}`;
      }

      // Use fetch to send task to agent's endpoint
      const response = await fetch(agent.httpEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          taskId: taskRequest.taskId,
          taskPayload: taskRequest.taskPayload,
          priority: taskRequest.priority || 'normal',
          deadline: taskRequest.deadline,
          assignedAt: Date.now()
        })
      });

      const success = response.ok;

      logger.info({
        agentId: agent.agentId,
        taskId: taskRequest.taskId,
        httpEndpoint: agent.httpEndpoint,
        success
      }, 'Task delivery attempt to agent HTTP endpoint');

      return success;

    } catch (error) {
      logger.error({ err: error, agentId: agent.agentId }, 'Failed to deliver task to agent HTTP endpoint');
      return false;
    }
  }

  async start(port: number = 3001): Promise<void> {
    try {
      // Validate port parameter (should be pre-allocated by Transport Manager)
      if (!port || port <= 0 || port > 65535) {
        throw new Error(`Invalid port provided: ${port}. Port should be pre-allocated by Transport Manager.`);
      }

      this.port = port;

      logger.debug({ port }, 'Starting HTTP Agent API server with pre-allocated port');

      await new Promise<void>((resolve, reject) => {
        this.server = this.app.listen(port, (err?: Error) => {
          if (err) {
            // Enhanced error handling for port allocation failures
            if (err.message.includes('EADDRINUSE')) {
              const enhancedError = new Error(
                `Port ${port} is already in use. This should not happen with pre-allocated ports. ` +
                `Transport Manager port allocation may have failed.`
              );
              enhancedError.name = 'PortAllocationError';
              reject(enhancedError);
            } else {
              reject(err);
            }
          } else {
            resolve();
          }
        });
      });

      logger.info({
        port,
        note: 'Using pre-allocated port from Transport Manager'
      }, 'HTTP Agent API server started successfully');

    } catch (error) {
      logger.error({
        err: error,
        port,
        context: 'HTTP Agent API server startup with pre-allocated port'
      }, 'Failed to start HTTP Agent API server');

      // Re-throw with additional context for Transport Manager retry logic
      if (error instanceof Error) {
        error.message = `HTTP Agent API server startup failed on pre-allocated port ${port}: ${error.message}`;
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server.close(() => resolve());
        });
      }

      logger.info('HTTP Agent API server stopped');

    } catch (error) {
      logger.error({ err: error }, 'Error stopping HTTP Agent API server');
      throw error;
    }
  }

  getPort(): number {
    return this.port;
  }
}

// Export singleton instance
export const httpAgentAPI = HTTPAgentAPIServer.getInstance();
export { HTTPAgentAPIServer };
