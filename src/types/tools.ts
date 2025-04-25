/**
 * Types for tool configuration and matching
 */

/**
 * Structure of a tool in the mcp-config.json file
 */
export interface ToolConfig {
  description: string;
  use_cases: string[];
  input_patterns: string[];
}

/**
 * Structure of the entire mcp-config.json file
 */
export interface ToolsConfig {
  tools: {
    [toolName: string]: ToolConfig;
  };
}

/**
 * Result from the matching service
 */
export interface MatchResult {
  toolName: string;
  confidence: number;
  matchedPattern?: string;
}

import { z } from 'zod';

/**
 * Result of a tool execution
 */
export interface ToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError: boolean;
  errorDetails?: unknown;
  metadata?: Record<string, unknown>;
  success?: boolean;
  jobId?: string;
  message?: string;
}

export interface ToolDefinition<ConfigType = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  execute: (
    params: Record<string, unknown>,
    config: ConfigType,
    context: ToolExecutionContext
  ) => Promise<ToolResult>;
}

export interface ToolExecutionContext {
  jobId?: string;
  userId?: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}
