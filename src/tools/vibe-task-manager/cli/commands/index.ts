import { Command } from 'commander';
import { createCommand } from './create.js';
import { listCommand } from './list.js';
import { openCommand } from './open.js';
import { epicCommand } from './epic.js';
import { refineCommand } from './refine.js';
import { agentCommand } from './agent.js';
import { decomposeCommand } from './decompose.js';
import { searchCommand } from './search.js';
import { contextCommand } from './context.js';
import { parseCommand } from './parse.js';
import logger from '../../../../logger.js';

/**
 * Main CLI program for Vibe Task Manager
 */
export function createVibeTasksCLI(): Command {
  const program = new Command();

  program
    .name('vibe-tasks')
    .description('AI-native task management for software development projects')
    .version('1.0.0')
    .configureOutput({
      writeOut: (str) => process.stdout.write(str),
      writeErr: (str) => process.stderr.write(str),
      outputError: (str, write) => {
        logger.error({ cliError: str }, 'CLI command error');
        write(str);
      }
    });

  // Add global options
  program
    .option('-v, --verbose', 'Enable verbose logging')
    .option('-q, --quiet', 'Suppress non-error output')
    .option('--data-dir <path>', 'Custom data directory path')
    .option('--config <path>', 'Custom configuration file path');

  // Global error handling
  program.exitOverride((err) => {
    logger.error({ err: err.message, code: err.code }, 'CLI command failed');

    if (err.code === 'commander.help') {
      // Help was displayed, exit normally
      process.exit(0);
    } else if (err.code === 'commander.version') {
      // Version was displayed, exit normally
      process.exit(0);
    } else {
      // Actual error occurred
      process.exit(1);
    }
  });

  // Add commands
  program.addCommand(createCommand);
  program.addCommand(listCommand);
  program.addCommand(openCommand);
  program.addCommand(epicCommand);
  program.addCommand(refineCommand);
  program.addCommand(agentCommand);
  program.addCommand(decomposeCommand);
  program.addCommand(searchCommand);
  program.addCommand(contextCommand);
  program.addCommand(parseCommand);

  // Handle unknown commands
  program.on('command:*', (operands) => {
    logger.error({ unknownCommand: operands[0] }, 'Unknown command');
    console.error(`Unknown command: ${operands[0]}`);
    console.error('Run "vibe-tasks --help" to see available commands.');
    process.exit(1);
  });

  return program;
}

/**
 * Parse and execute CLI commands
 */
export async function executeVibeTasksCLI(args: string[] = process.argv): Promise<void> {
  try {
    const program = createVibeTasksCLI();

    // Set up global options handling
    program.hook('preAction', (thisCommand) => {
      const opts = thisCommand.optsWithGlobals();

      // Configure logging based on options
      if (opts.verbose) {
        logger.level = 'debug';
      } else if (opts.quiet) {
        logger.level = 'error';
      }

      logger.debug({ command: thisCommand.name(), options: opts }, 'Executing CLI command');
    });

    await program.parseAsync(args);

  } catch (error) {
    logger.error({ err: error }, 'CLI execution failed');

    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('An unexpected error occurred');
    }

    process.exit(1);
  }
}

/**
 * CLI utilities for common operations
 */
export class CLIUtils {
  /**
   * Format output for console display
   */
  static formatOutput(data: unknown, format: 'table' | 'json' | 'yaml' = 'table'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);

      case 'yaml':
        // Simple YAML-like output for basic objects
        if (Array.isArray(data)) {
          return data.map(item => `- ${this.formatObjectAsYaml(item)}`).join('\n');
        } else {
          return this.formatObjectAsYaml(data);
        }

      case 'table':
      default:
        if (Array.isArray(data)) {
          return this.formatArrayAsTable(data);
        } else {
          return this.formatObjectAsTable(data as Record<string, unknown>);
        }
    }
  }

  /**
   * Format array as table
   */
  private static formatArrayAsTable(data: unknown[]): string {
    if (data.length === 0) {
      return 'No items found.';
    }

    const firstItem = data[0] as Record<string, unknown>;
    const headers = Object.keys(firstItem);
    const maxWidths = headers.map(header =>
      Math.max(header.length, ...data.map(item => {
        const itemRecord = item as Record<string, unknown>;
        return String(itemRecord[header] || '').length;
      }))
    );

    // Header row
    const headerRow = headers.map((header, i) => header.padEnd(maxWidths[i])).join(' | ');
    const separator = maxWidths.map(width => '-'.repeat(width)).join('-|-');

    // Data rows
    const dataRows = data.map(item => {
      const itemRecord = item as Record<string, unknown>;
      return headers.map((header, i) => String(itemRecord[header] || '').padEnd(maxWidths[i])).join(' | ');
    });

    return [headerRow, separator, ...dataRows].join('\n');
  }

  /**
   * Format object as table
   */
  private static formatObjectAsTable(data: Record<string, unknown>): string {
    const entries = Object.entries(data);
    const maxKeyWidth = Math.max(...entries.map(([key]) => key.length));

    return entries
      .map(([key, value]) => `${key.padEnd(maxKeyWidth)} : ${value}`)
      .join('\n');
  }

  /**
   * Format object as YAML-like string
   */
  private static formatObjectAsYaml(data: unknown, indent = 0): string {
    const spaces = ' '.repeat(indent);

    if (typeof data === 'object' && data !== null) {
      return Object.entries(data)
        .map(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            return `${spaces}${key}:\n${this.formatObjectAsYaml(value, indent + 2)}`;
          } else {
            return `${spaces}${key}: ${value}`;
          }
        })
        .join('\n');
    } else {
      return `${spaces}${data}`;
    }
  }

  /**
   * Prompt user for confirmation
   */
  static async confirm(message: string, defaultValue = false): Promise<boolean> {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      const defaultText = defaultValue ? '[Y/n]' : '[y/N]';
      rl.question(`${message} ${defaultText}: `, (answer) => {
        rl.close();

        if (!answer.trim()) {
          resolve(defaultValue);
        } else {
          resolve(answer.toLowerCase().startsWith('y'));
        }
      });
    });
  }

  /**
   * Display error message and exit
   */
  static error(message: string, exitCode = 1): never {
    console.error(`Error: ${message}`);
    process.exit(exitCode);
  }

  /**
   * Display success message
   */
  static success(message: string): void {
    console.log(`✓ ${message}`);
  }

  /**
   * Display warning message
   */
  static warning(message: string): void {
    console.warn(`⚠ ${message}`);
  }

  /**
   * Display info message
   */
  static info(message: string): void {
    console.log(`ℹ ${message}`);
  }

  /**
   * Validate required parameters
   */
  static validateRequired(params: Record<string, unknown>, required: string[]): void {
    const missing = required.filter(key => !params[key]);

    if (missing.length > 0) {
      this.error(`Missing required parameters: ${missing.join(', ')}`);
    }
  }

  /**
   * Parse tags from string
   */
  static parseTags(tagsString?: string): string[] {
    if (!tagsString) return [];

    return tagsString
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
  }

  /**
   * Format date for display
   */
  static formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  }

  /**
   * Truncate text for display
   */
  static truncate(text: string, maxLength = 50): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Format bytes for display
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }


}
