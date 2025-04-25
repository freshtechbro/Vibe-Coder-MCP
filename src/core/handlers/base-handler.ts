import { z } from 'zod';

import { ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { ToolDefinition, ToolResult } from '../../types/tools.js';

// Export the handler configuration interface
export interface HandlerConfig {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
}

// Create a base handler that doesn't claim to implement ToolDefinition
// since we're changing the method signature visibility
export abstract class BaseHandler {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;

  constructor(config: HandlerConfig) {
    this.name = config.name;
    this.description = config.description;
    this.inputSchema = config.inputSchema;
  }

  // Public method that handles validation
  async handle(
    params: Record<string, unknown>,
    config: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    // Validation could be added here
    return this.execute(params, config, context);
  }

  // Protected method that derived classes implement
  protected abstract execute(
    params: Record<string, unknown>,
    config: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult>;

  // Add a method to get handler metadata
  getMetadata() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }

  // This method converts the handler to a ToolDefinition
  toToolDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
      execute: this.handle.bind(this),
    };
  }
}

// Re-export ToolResult for convenience
export { ToolResult };
