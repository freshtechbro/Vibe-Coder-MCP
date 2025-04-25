import { z } from 'zod';

export interface WebSocketMetricsConfig {
  prometheus: boolean;
  grafana: boolean;
  customMetrics: Array<{
    name: string;
    type: 'counter' | 'gauge' | 'histogram';
    description: string;
    labels?: string[];
  }>;
}

const configSchema = z.object({
  prometheus: z.boolean(),
  grafana: z.boolean(),
  customMetrics: z.array(
    z.object({
      name: z.string(),
      type: z.enum(['counter', 'gauge', 'histogram']),
      description: z.string(),
      labels: z.array(z.string()).optional(),
    })
  ),
});

export function generateWebSocketMetrics(
  config: WebSocketMetricsConfig
): Array<{ path: string; content: string }> {
  const validatedConfig = configSchema.parse(config);

  return [
    {
      path: 'monitoring/metrics/websocket.ts',
      content: `
import { Counter, Gauge, Histogram } from 'prom-client';
import { WebSocketServer } from 'ws';

${validatedConfig.customMetrics
  .map(
    (metric) => `
const ${metric.name} = new ${metric.type.charAt(0).toUpperCase() + metric.type.slice(1)}({
  name: '${metric.name}',
  help: '${metric.description}',
  ${metric.labels ? `labelNames: [${metric.labels.map((l) => `'${l}'`).join(', ')}],` : ''}
});`
  )
  .join('\n')}

export function setupWebSocketMetrics(wss: WebSocketServer) {
  wss.on('connection', (ws) => {
    // Connection metrics
    connectionCount.inc();

    ws.on('message', (data) => {
      // Message metrics
      messageCount.inc();
      messageSize.observe(data.length);
    });

    ws.on('close', () => {
      // Connection metrics
      connectionCount.dec();
    });

    ws.on('error', () => {
      // Error metrics
      errorCount.inc();
    });
  });
}`,
    },
    {
      path: 'monitoring/health/websocket.ts',
      content: `
import { WebSocketServer } from 'ws';

export function checkWebSocketHealth(wss: WebSocketServer) {
  return {
    status: wss.clients.size > 0 ? 'healthy' : 'degraded',
    metrics: {
      connections: wss.clients.size,
      uptime: process.uptime()
    }
  };
}`,
    },
    {
      path: 'monitoring/dashboards/websocket.json',
      content: `{
  "title": "WebSocket Monitoring",
  "panels": [
    {
      "title": "Active Connections",
      "type": "gauge",
      "query": "websocket_connections"
    },
    {
      "title": "Message Rate",
      "type": "graph",
      "query": "rate(websocket_messages[5m])"
    },
    {
      "title": "Error Rate",
      "type": "graph",
      "query": "rate(websocket_errors[5m])"
    },
    {
      "title": "Message Size Distribution",
      "type": "heatmap",
      "query": "websocket_message_size_bytes"
    }
  ]
}`,
    },
  ];
}
