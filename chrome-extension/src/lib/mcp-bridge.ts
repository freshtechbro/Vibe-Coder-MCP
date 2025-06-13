/**
 * MCP Bridge - Communication layer between Chrome Extension and Local MCP Server
 * Handles WebSocket connections and message protocol conversion
 */

export interface MCPRequest {
  id: string;
  method: string;
  params: Record<string, any>;
}

export interface MCPResponse {
  id: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  jobId?: string;
}

export class MCPBridge {
  private ws: WebSocket | null = null;
  private connectionPromise: Promise<void> | null = null;
  private messageHandlers = new Map<string, (response: MCPResponse) => void>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(private serverUrl: string = 'ws://localhost:3000') {}

  /**
   * Connect to the local MCP server
   */
  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);

        this.ws.onopen = () => {
          console.log('Connected to MCP server');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const response: MCPResponse = JSON.parse(event.data);
            const handler = this.messageHandlers.get(response.id);
            if (handler) {
              handler(response);
              this.messageHandlers.delete(response.id);
            }
          } catch (error) {
            console.error('Failed to parse MCP response:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('Disconnected from MCP server');
          this.connectionPromise = null;
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('MCP WebSocket error:', error);
          reject(new Error('Failed to connect to MCP server'));
        };

      } catch (error) {
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Disconnect from the MCP server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connectionPromise = null;
  }

  /**
   * Check if connected to the server
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Execute a tool via the MCP server
   */
  async executeTool(toolName: string, params: Record<string, any>): Promise<ToolExecutionResult> {
    if (!this.isConnected()) {
      await this.connect();
    }

    const requestId = this.generateRequestId();
    const request: MCPRequest = {
      id: requestId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    };

    return new Promise((resolve, reject) => {
      // Set up response handler
      this.messageHandlers.set(requestId, (response: MCPResponse) => {
        if (response.error) {
          resolve({
            success: false,
            error: response.error.message
          });
        } else {
          resolve({
            success: true,
            data: response.result,
            jobId: response.result?.jobId
          });
        }
      });

      // Send request
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(request));
        
        // Set timeout for request
        setTimeout(() => {
          if (this.messageHandlers.has(requestId)) {
            this.messageHandlers.delete(requestId);
            resolve({
              success: false,
              error: 'Request timeout'
            });
          }
        }, 30000); // 30 second timeout
      } else {
        reject(new Error('WebSocket not connected'));
      }
    });
  }

  /**
   * Get available tools from the server
   */
  async getAvailableTools(): Promise<string[]> {
    if (!this.isConnected()) {
      await this.connect();
    }

    const requestId = this.generateRequestId();
    const request: MCPRequest = {
      id: requestId,
      method: 'tools/list',
      params: {}
    };

    return new Promise((resolve, reject) => {
      this.messageHandlers.set(requestId, (response: MCPResponse) => {
        if (response.error) {
          reject(new Error(response.error.message));
        } else {
          const tools = response.result?.tools?.map((tool: any) => tool.name) || [];
          resolve(tools);
        }
      });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(request));
      } else {
        reject(new Error('WebSocket not connected'));
      }
    });
  }

  /**
   * Poll for job result
   */
  async getJobResult(jobId: string): Promise<ToolExecutionResult> {
    return this.executeTool('get-job-result', { jobId });
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('Reconnection failed:', error);
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }
}

// Singleton instance
export const mcpBridge = new MCPBridge();
