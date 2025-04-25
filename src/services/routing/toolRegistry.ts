import { z } from 'zod';

import logger from '../../logger.js';
import { ToolDefinition, ToolResult } from '../../types/tools.js';
import {
  AppError,
  ValidationError,
  ToolExecutionError,
} from '../../utils/errors.js';

// Re-export the ToolDefinition interface for tests
export { ToolDefinition };

export interface ToolExecutionContext {
  jobId?: string;
  userId?: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition<any>>;

  constructor() {
    this.tools = new Map();
  }

  registerTool<T = Record<string, unknown>>(tool: ToolDefinition<T>): void {
    this.tools.set(tool.name, tool);
  }

  async executeTool<T = Record<string, unknown>>(
    toolName: string,
    params: Record<string, unknown>,
    config: T,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName) as ToolDefinition<T> | undefined;
    if (!tool) {
      throw new AppError(`Tool not found: ${toolName}`, { toolName });
    }

    let validatedParams: Record<string, unknown>;
    try {
      const inputSchema = z.object(tool.inputSchema).strict();
      validatedParams = inputSchema.parse(params);
      logger.debug(
        { toolName, params: validatedParams, context },
        'Executing tool with validated parameters'
      );

      const result = await tool.execute(validatedParams, config, context);

      if (
        !result ||
        !Array.isArray(result.content) ||
        result.content.length === 0
      ) {
        logger.warn(
          { toolName, result },
          'Tool returned empty or invalid result content'
        );
        throw new ToolExecutionError(
          `Tool '${toolName}' returned empty or invalid result content.`,
          { toolName, params: validatedParams, context, result }
        );
      }

      return result;
    } catch (error) {
      logger.error(
        { err: error, toolName, params, context },
        'Tool execution failed'
      );

      if (error instanceof z.ZodError) {
        throw new ValidationError(
          `Input validation failed for tool '${toolName}'`,
          {
            toolName,
            issues: error.errors,
            originalParams: params,
          }
        );
      } else if (error instanceof AppError) {
        throw error;
      } else if (error instanceof Error) {
        throw new ToolExecutionError(
          `Tool '${toolName}' encountered an error: ${error.message}`,
          {
            toolName,
            originalParams: params,
            context,
          },
          error
        );
      } else {
        throw new ToolExecutionError(
          `Tool '${toolName}' encountered an unknown error.`,
          {
            toolName,
            originalParams: params,
            context,
            thrownValue: String(error),
          }
        );
      }
    }
  }

  getTool(name: string): ToolDefinition<any> | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolDefinition<any>[] {
    return Array.from(this.tools.values());
  }

  clearRegistry(): void {
    this.tools.clear();
  }
}

export const toolRegistry = new ToolRegistry();

export function clearRegistryForTesting(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      'clearRegistryForTesting can only be called in test environment'
    );
  }
  toolRegistry.clearRegistry();
}
