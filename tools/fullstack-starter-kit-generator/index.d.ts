import { ToolExecutor } from '../../services/routing/toolRegistry.js';
/**
 * Input schema for the Fullstack Starter Kit Generator tool
 */
export interface FullstackStarterKitInput {
  use_case: string;
  tech_stack_preferences?: {
    frontend?: string;
    backend?: string;
    database?: string;
    orm?: string;
    authentication?: string;
    deployment?: string;
    [key: string]: string | undefined;
  };
  request_recommendation?: boolean;
  include_optional_features?: string[];
}
export declare function initDirectories(): Promise<void>;
/**
 * Generate a fullstack starter kit with automatic validation.
 * This function now acts as the executor for the 'generate-fullstack-starter-kit' tool.
 * @param params The validated tool parameters.
 * @param config OpenRouter configuration.
 * @returns A Promise resolving to a CallToolResult object.
 */
export declare const generateFullstackStarterKit: ToolExecutor;
