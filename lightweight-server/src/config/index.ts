/**
 * Configuration management for Repotools Lightweight Server
 * 
 * Centralizes all configuration values with validation and type safety.
 * Supports environment variables with sensible defaults.
 */

import { config as dotenvConfig } from 'dotenv';
import { join } from 'path';
import { existsSync } from 'fs';

// Load environment variables
dotenvConfig();

interface ServerConfig {
  // Server
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  HOST: string;
  
  // CORS
  CORS_ORIGIN: string[];
  CORS_CREDENTIALS: boolean;
  
  // Security
  JWT_SECRET: string;
  API_KEY: string;
  
  // File System
  WORKSPACE_ROOT: string;
  MAX_FILE_SIZE: number;
  ALLOWED_EXTENSIONS: string[];
  
  // External Services
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GITHUB_TOKEN?: string;
  
  // Database
  DATABASE_URL: string;
  REDIS_URL?: string;
  
  // Logging
  LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';
  LOG_FILE: string;
  
  // Task Management
  MAX_CONCURRENT_TASKS: number;
  TASK_TIMEOUT: number;
  CLEANUP_INTERVAL: number;
  
  // WebSocket
  WS_PORT: number;
  WS_HEARTBEAT_INTERVAL: number;
  
  // Development
  DEBUG: string;
  ENABLE_SWAGGER: boolean;
  ENABLE_METRICS: boolean;
}

/**
 * Parse comma-separated string into array
 */
function parseArray(value: string | undefined, defaultValue: string[] = []): string[] {
  if (!value) return defaultValue;
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

/**
 * Parse file size string (e.g., "100MB") into bytes
 */
function parseFileSize(value: string | undefined, defaultBytes: number): number {
  if (!value) return defaultBytes;
  
  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };
  
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
  if (!match) return defaultBytes;
  
  const [, size, unit = 'B'] = match;
  return Math.floor(parseFloat(size) * (units[unit.toUpperCase()] || 1));
}

/**
 * Validate required environment variables
 */
function validateConfig(): void {
  const required = ['JWT_SECRET', 'API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Create workspace directory if it doesn't exist
 */
function ensureWorkspaceExists(workspaceRoot: string): void {
  if (!existsSync(workspaceRoot)) {
    try {
      require('fs').mkdirSync(workspaceRoot, { recursive: true });
    } catch (error) {
      console.warn(`Warning: Could not create workspace directory: ${workspaceRoot}`);
    }
  }
}

// Validate configuration in non-test environments
if (process.env.NODE_ENV !== 'test') {
  validateConfig();
}

// Build configuration object
const config: ServerConfig = {
  // Server
  NODE_ENV: (process.env.NODE_ENV as ServerConfig['NODE_ENV']) || 'development',
  PORT: parseInt(process.env.PORT || '3001', 10),
  HOST: process.env.HOST || 'localhost',
  
  // CORS
  CORS_ORIGIN: parseArray(process.env.CORS_ORIGIN, [
    'chrome-extension://*',
    'http://localhost:*',
    'https://localhost:*'
  ]),
  CORS_CREDENTIALS: process.env.CORS_CREDENTIALS === 'true',
  
  // Security
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  API_KEY: process.env.API_KEY || 'dev-api-key-change-in-production',
  
  // File System
  WORKSPACE_ROOT: process.env.WORKSPACE_ROOT || join(process.cwd(), 'workspace'),
  MAX_FILE_SIZE: parseFileSize(process.env.MAX_FILE_SIZE, 100 * 1024 * 1024), // 100MB
  ALLOWED_EXTENSIONS: parseArray(process.env.ALLOWED_EXTENSIONS, [
    '.js', '.ts', '.tsx', '.jsx',
    '.py', '.java', '.cpp', '.c', '.h', '.hpp',
    '.cs', '.php', '.rb', '.go', '.rs',
    '.swift', '.kt', '.scala', '.clj',
    '.hs', '.ml', '.fs', '.elm',
    '.dart', '.lua', '.r', '.m',
    '.pl', '.sh', '.sql',
    '.html', '.css', '.scss', '.sass', '.less',
    '.xml', '.json', '.yaml', '.yml',
    '.toml', '.ini', '.cfg', '.conf',
    '.md', '.txt', '.log'
  ]),
  
  // External Services
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  
  // Database
  DATABASE_URL: process.env.DATABASE_URL || 'sqlite:./data/repotools.db',
  REDIS_URL: process.env.REDIS_URL,
  
  // Logging
  LOG_LEVEL: (process.env.LOG_LEVEL as ServerConfig['LOG_LEVEL']) || 'info',
  LOG_FILE: process.env.LOG_FILE || './logs/repotools.log',
  
  // Task Management
  MAX_CONCURRENT_TASKS: parseInt(process.env.MAX_CONCURRENT_TASKS || '5', 10),
  TASK_TIMEOUT: parseInt(process.env.TASK_TIMEOUT || '300000', 10), // 5 minutes
  CLEANUP_INTERVAL: parseInt(process.env.CLEANUP_INTERVAL || '3600000', 10), // 1 hour
  
  // WebSocket
  WS_PORT: parseInt(process.env.WS_PORT || '3002', 10),
  WS_HEARTBEAT_INTERVAL: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10),
  
  // Development
  DEBUG: process.env.DEBUG || 'repotools:*',
  ENABLE_SWAGGER: process.env.ENABLE_SWAGGER === 'true',
  ENABLE_METRICS: process.env.ENABLE_METRICS === 'true',
};

// Ensure workspace exists
ensureWorkspaceExists(config.WORKSPACE_ROOT);

// Export configuration
export { config, type ServerConfig };

