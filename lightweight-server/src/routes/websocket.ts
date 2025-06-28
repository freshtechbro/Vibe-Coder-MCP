/**
 * WebSocket management API routes for Repotools Lightweight Server
 * 
 * Provides REST endpoints for WebSocket connection management,
 * broadcasting, and real-time communication control.
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { asyncHandler } from '@/middleware/errorHandler.js';
import { logger } from '@/utils/logger.js';
import { WebSocketManager } from '@/services/websocket.js';

// Validation schemas
const broadcastSchema = Joi.object({
  type: Joi.string().required().max(100),
  data: Joi.any().optional(),
  excludeClientId: Joi.string().optional(),
});

const notificationSchema = Joi.object({
  level: Joi.string().valid('info', 'warning', 'error').required(),
  title: Joi.string().required().max(200),
  message: Joi.string().required().max(1000),
});

const clientMessageSchema = Joi.object({
  clientId: Joi.string().required(),
  type: Joi.string().required().max(100),
  data: Joi.any().optional(),
});

/**
 * Create WebSocket management routes
 */
export function createWebSocketRoutes(wsManager: WebSocketManager): Router {
  const router = Router();

  /**
   * GET /api/v1/ws/clients
   * Get list of connected WebSocket clients
   */
  router.get('/clients', asyncHandler(async (_req: Request, res: Response) => {
    try {
      const clients = wsManager.getConnectedClients();
      const clientCount = wsManager.getClientCount();

      res.json({
        success: true,
        data: {
          clients,
          clientCount,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Failed to get WebSocket clients');
      throw error;
    }
  }));

  /**
   * GET /api/v1/ws/status
   * Get WebSocket server status
   */
  router.get('/status', asyncHandler(async (_req: Request, res: Response) => {
    try {
      const clientCount = wsManager.getClientCount();
      const clients = wsManager.getConnectedClients();

      // Calculate connection statistics
      const connectionStats = {
        total: clientCount,
        byUserAgent: {} as Record<string, number>,
        byOrigin: {} as Record<string, number>,
      };

      clients.forEach(client => {
        const userAgent = client.metadata.userAgent || 'unknown';
        const origin = client.metadata.origin || 'unknown';
        
        connectionStats.byUserAgent[userAgent] = (connectionStats.byUserAgent[userAgent] || 0) + 1;
        connectionStats.byOrigin[origin] = (connectionStats.byOrigin[origin] || 0) + 1;
      });

      res.json({
        success: true,
        data: {
          status: 'active',
          connectionStats,
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Failed to get WebSocket status');
      throw error;
    }
  }));

  /**
   * POST /api/v1/ws/broadcast
   * Broadcast message to all connected clients
   */
  router.post('/broadcast', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = broadcastSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { type, data, excludeClientId } = value;

    try {
      const message = {
        type,
        data,
        timestamp: Date.now(),
      };

      const sentCount = wsManager.broadcast(message, excludeClientId);

      logger.info(`WebSocket broadcast sent`, {
        type,
        sentCount,
        excludeClientId,
      });

      res.json({
        success: true,
        message: 'Message broadcasted successfully',
        data: {
          type,
          sentCount,
          totalClients: wsManager.getClientCount(),
        },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'WebSocket broadcast failed', {
        type,
      });
      throw error;
    }
  }));

  /**
   * POST /api/v1/ws/notify
   * Send system notification to all clients
   */
  router.post('/notify', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = notificationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { level, title, message } = value;

    try {
      wsManager.sendSystemNotification({ level, title, message });

      logger.info(`System notification sent`, {
        level,
        title,
        clientCount: wsManager.getClientCount(),
      });

      res.json({
        success: true,
        message: 'Notification sent successfully',
        data: {
          level,
          title,
          sentTo: wsManager.getClientCount(),
        },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'System notification failed', {
        level,
        title,
      });
      throw error;
    }
  }));

  /**
   * POST /api/v1/ws/send
   * Send message to specific client
   */
  router.post('/send', asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = clientMessageSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { clientId, type, data } = value;

    try {
      const message = {
        type,
        data,
        timestamp: Date.now(),
      };

      const sent = wsManager.sendToClient(clientId, message);

      if (!sent) {
        return res.status(404).json({
          error: 'Client Not Found',
          message: 'Client not connected or invalid client ID',
        });
      }

      logger.info(`Message sent to client`, {
        clientId,
        type,
      });

      res.json({
        success: true,
        message: 'Message sent successfully',
        data: {
          clientId,
          type,
        },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Client message send failed', {
        clientId,
        type,
      });
      throw error;
    }
  }));

  /**
   * DELETE /api/v1/ws/clients/:clientId
   * Disconnect specific client
   */
  router.delete('/clients/:clientId', asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params;

    if (!clientId) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Client ID is required',
      });
    }

    try {
      const disconnected = wsManager.disconnectClient(clientId);

      if (!disconnected) {
        return res.status(404).json({
          error: 'Client Not Found',
          message: 'Client not connected or invalid client ID',
        });
      }

      logger.info(`Client disconnected via API`, { clientId });

      res.json({
        success: true,
        message: 'Client disconnected successfully',
        data: { clientId },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Client disconnection failed', {
        clientId,
      });
      throw error;
    }
  }));

  /**
   * GET /api/v1/ws/clients/:clientId
   * Get specific client information
   */
  router.get('/clients/:clientId', asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params;

    if (!clientId) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Client ID is required',
      });
    }

    try {
      const clients = wsManager.getConnectedClients();
      const client = clients.find(c => c.id === clientId);

      if (!client) {
        return res.status(404).json({
          error: 'Client Not Found',
          message: 'Client not connected or invalid client ID',
        });
      }

      res.json({
        success: true,
        data: { client },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'Client info retrieval failed', {
        clientId,
      });
      throw error;
    }
  }));

  /**
   * POST /api/v1/ws/ping
   * Send ping to all clients (health check)
   */
  router.post('/ping', asyncHandler(async (_req: Request, res: Response) => {
    try {
      const message = {
        type: 'ping',
        data: {
          serverTime: new Date().toISOString(),
          requestId: `ping-${Date.now()}`,
        },
        timestamp: Date.now(),
      };

      const sentCount = wsManager.broadcast(message);

      logger.info(`Ping sent to all clients`, { sentCount });

      res.json({
        success: true,
        message: 'Ping sent to all clients',
        data: {
          sentCount,
          totalClients: wsManager.getClientCount(),
          requestId: message.data.requestId,
        },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'WebSocket ping failed');
      throw error;
    }
  }));

  /**
   * GET /api/v1/ws/metrics
   * Get WebSocket metrics and statistics
   */
  router.get('/metrics', asyncHandler(async (_req: Request, res: Response) => {
    try {
      const clients = wsManager.getConnectedClients();
      const now = new Date();

      // Calculate connection duration statistics
      const connectionDurations = clients.map(client => {
        const lastSeen = new Date(client.lastSeen);
        return now.getTime() - lastSeen.getTime();
      });

      const avgConnectionDuration = connectionDurations.length > 0 
        ? connectionDurations.reduce((sum, duration) => sum + duration, 0) / connectionDurations.length
        : 0;

      const metrics = {
        connections: {
          total: wsManager.getClientCount(),
          averageDuration: avgConnectionDuration,
        },
        server: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
        },
        timestamp: now.toISOString(),
      };

      res.json({
        success: true,
        data: { metrics },
      });
    } catch (error) {
      logger.errorWithContext(error as Error, 'WebSocket metrics retrieval failed');
      throw error;
    }
  }));

  return router;
}
