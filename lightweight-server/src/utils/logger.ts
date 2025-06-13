/**
 * Centralized logging utility for Repotools Lightweight Server
 * 
 * Provides structured logging with different levels and output formats.
 * Supports both console and file logging with rotation.
 */

import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '@/config/index.js';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: any;
  stack?: string;
}

class Logger {
  private logLevels: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };

  private currentLevel: number;
  private fileStream?: NodeJS.WritableStream;

  constructor() {
    this.currentLevel = this.logLevels[config.LOG_LEVEL] || this.logLevels.info;
    this.setupFileLogging();
  }

  private setupFileLogging(): void {
    if (config.NODE_ENV === 'test') return;

    try {
      const logDir = dirname(config.LOG_FILE);
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      this.fileStream = createWriteStream(config.LOG_FILE, { flags: 'a' });
    } catch (error) {
      console.warn('Failed to setup file logging:', error);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.logLevels[level] <= this.currentLevel;
  }

  private formatMessage(level: LogLevel, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const logEntry: LogEntry = {
      timestamp,
      level,
      message,
      ...(meta && { meta }),
    };

    return JSON.stringify(logEntry);
  }

  private formatConsoleMessage(level: LogLevel, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const colors = {
      error: '\x1b[31m', // Red
      warn: '\x1b[33m',  // Yellow
      info: '\x1b[36m',  // Cyan
      debug: '\x1b[90m', // Gray
    };
    const reset = '\x1b[0m';
    
    const color = colors[level] || '';
    const levelStr = level.toUpperCase().padEnd(5);
    
    let output = `${color}[${timestamp}] ${levelStr}${reset} ${message}`;
    
    if (meta) {
      output += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return output;
  }

  private writeLog(level: LogLevel, message: string, meta?: any): void {
    if (!this.shouldLog(level)) return;

    // Console output
    const consoleMessage = this.formatConsoleMessage(level, message, meta);
    if (level === 'error') {
      console.error(consoleMessage);
    } else if (level === 'warn') {
      console.warn(consoleMessage);
    } else {
      console.log(consoleMessage);
    }

    // File output
    if (this.fileStream) {
      const fileMessage = this.formatMessage(level, message, meta);
      this.fileStream.write(`${fileMessage  }\n`);
    }
  }

  public error(message: string, meta?: any): void {
    // Capture stack trace for errors
    const error = new Error();
    const stack = error.stack?.split('\n').slice(2).join('\n');
    
    this.writeLog('error', message, { ...meta, stack });
  }

  public warn(message: string, meta?: any): void {
    this.writeLog('warn', message, meta);
  }

  public info(message: string, meta?: any): void {
    this.writeLog('info', message, meta);
  }

  public debug(message: string, meta?: any): void {
    this.writeLog('debug', message, meta);
  }

  public log(level: LogLevel, message: string, meta?: any): void {
    this.writeLog(level, message, meta);
  }

  // Utility methods for common patterns
  public request(method: string, url: string, statusCode: number, duration: number): void {
    this.info(`${method} ${url} ${statusCode}`, { duration: `${duration}ms` });
  }

  public task(taskId: string, action: string, meta?: any): void {
    this.info(`Task ${taskId}: ${action}`, meta);
  }

  public websocket(action: string, clientId?: string, meta?: any): void {
    this.debug(`WebSocket ${action}`, { clientId, ...meta });
  }

  public fileSystem(action: string, path: string, meta?: any): void {
    this.debug(`FileSystem ${action}: ${path}`, meta);
  }

  // Performance logging
  public performance(operation: string, startTime: number, meta?: any): void {
    const duration = Date.now() - startTime;
    this.info(`Performance: ${operation} completed in ${duration}ms`, meta);
  }

  // Structured error logging
  public errorWithContext(error: Error, context: string, meta?: any): void {
    this.error(`${context}: ${error.message}`, {
      ...meta,
      errorName: error.name,
      stack: error.stack,
    });
  }

  // Close file stream
  public close(): void {
    if (this.fileStream) {
      this.fileStream.end();
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Graceful shutdown
process.on('exit', () => {
  logger.close();
});

export { logger, type LogLevel, type LogEntry };

