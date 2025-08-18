#!/usr/bin/env node

/**
 * Vibe CLI - Unified Natural Language Interface
 * Uses CENTRALIZED configuration and security systems
 * Leverages existing process-request tool (DRY principle)
 */

import { executeTool } from '../services/routing/toolRegistry.js';
import { ToolExecutionContext } from '../services/routing/toolRegistry.js';
import { CLIConfig } from './types/index.js';
import { EnhancedCLIUtils } from './utils/cli-formatter.js';
import { 
  parseCliArgs, 
  extractRequestArgs, 
  generateSessionId,
  validateEnvironment
} from './utils/config-loader.js';
import { UnifiedCommandGateway } from './gateway/unified-command-gateway.js';
import { appInitializer } from './core/app-initializer.js';
import { detectCLIMode } from './utils/mode-detector.js';
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import logger from '../logger.js';

/**
 * Gracefully exit the process after flushing logs
 */
async function gracefulExit(code: number = 0): Promise<void> {
  try {
    // Wait for logger to flush
    if (logger && typeof logger.flush === 'function') {
      await new Promise<void>((resolve) => {
        logger.flush(() => resolve());
      });
    }
    // Give a small buffer for final cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (error) {
    console.error('Error during graceful exit:', error);
  } finally {
    process.exit(code);
  }
}

/**
 * Main CLI execution function with mode detection
 */
async function main(): Promise<void> {
  const args: string[] = process.argv.slice(2);
  const mode = detectCLIMode(args);
  
  // Handle different modes
  switch (mode) {
    case 'help':
      displayHelp();
      await gracefulExit(0);
      return;
      
    case 'interactive':
      await startInteractiveMode();
      return;
      
    case 'oneshot':
      await processOneShot(args);
      return;
  }
}

/**
 * Start interactive REPL mode
 */
async function startInteractiveMode(): Promise<void> {
  try {
    // Initialize core services first
    const openRouterConfig = await appInitializer.initializeCoreServices();
    
    // Dynamic import to avoid circular dependencies
    const { VibeInteractiveREPL } = await import('./interactive/repl.js');
    const repl = new VibeInteractiveREPL();
    await repl.start(openRouterConfig);
    
  } catch (error) {
    logger.error({ err: error }, 'Failed to start interactive mode');
    console.error(chalk.red('Failed to start interactive mode:'), error instanceof Error ? error.message : 'Unknown error');
    await gracefulExit(1);
  }
}

/**
 * Process one-shot command
 */
async function processOneShot(args: string[]): Promise<void> {
  // Parse CLI configuration
  const cliConfig: CLIConfig = parseCliArgs(args);
  const requestArgs: ReadonlyArray<string> = extractRequestArgs(args);
  
  if (requestArgs.length === 0) {
    // No request provided, show interactive prompt hint
    console.log(chalk.cyan('💡 Tip: Run `vibe` without arguments to start interactive mode'));
    console.log();
    displayUsageExample();
    await gracefulExit(0);
    return;
  }

  // Initialize core services BEFORE validation (same as interactive mode)
  try {
    await appInitializer.initializeCoreServices();
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize core services');
    console.error(chalk.red('Failed to initialize services:'), error instanceof Error ? error.message : 'Unknown error');
    await gracefulExit(1);
    return;
  }

  // Environment validation using centralized systems (AFTER initialization)
  const environmentValidation = await validateEnvironment();
  if (!environmentValidation.valid) {
    EnhancedCLIUtils.formatError('Environment validation failed:');
    environmentValidation.errors.forEach(error => {
      console.error(`  • ${error}`);
    });
    await gracefulExit(1);
    return;
  }

  const request: string = requestArgs.join(' ');
  let spinner: Ora | null = null;
  
  try {
    // Initialize spinner based on CLI config
    if (!cliConfig.quiet) {
      spinner = ora({
        text: 'Processing your request...',
        color: cliConfig.color ? 'cyan' : undefined
      }).start();
    }

    // Initialize configuration using NEW centralized initializer
    const openRouterConfig = await appInitializer.initializeCoreServices();
    
    // Initialize Unified Command Gateway for 95-99% accuracy
    const unifiedGateway = UnifiedCommandGateway.getInstance(openRouterConfig);
    const sessionId = generateSessionId();
    
    // Create unified command context
    const unifiedContext = {
      sessionId,
      userId: undefined,
      currentProject: undefined,
      currentTask: undefined,
      conversationHistory: [],
      userPreferences: {},
      activeWorkflow: undefined,
      workflowStack: [],
      toolHistory: [],
      preferredTools: {}
    };

    // Use UnifiedCommandGateway for enhanced accuracy (DRY compliant)
    const processingResult = await unifiedGateway.processUnifiedCommand(request, unifiedContext);
    
    let result;
    
    if (processingResult.success && !processingResult.metadata?.requiresConfirmation) {
      // High confidence - execute directly
      const executionResult = await unifiedGateway.executeUnifiedCommand(request, unifiedContext);
      result = executionResult.result;
    } else if (processingResult.success && processingResult.metadata?.requiresConfirmation) {
      // Requires confirmation - display processing result for user review
      result = {
        content: [{
          type: 'text',
          text: `Command: "${request}"\nSelected Tool: ${processingResult.selectedTool}\nConfidence: ${((processingResult.intent?.confidence || 0) * 100).toFixed(1)}%\n\nValidation:\n${processingResult.validationErrors.join('\n')}\n\nSuggestions:\n${processingResult.suggestions.join('\n')}\n\nUse --force to execute without confirmation.`
        }]
      };
    } else {
      // Processing failed - fallback to existing process-request tool (DRY principle)
      const context: ToolExecutionContext = {
        sessionId,
        transportType: 'cli',
        metadata: {
          startTime: Date.now(),
          cliVersion: '1.0.0',
          cliConfig: cliConfig,
          fallbackReason: 'Unified gateway processing failed'
        }
      };

      result = await executeTool(
        'process-request',
        { request },
        openRouterConfig,
        context
      );
    }

    // Success handling
    if (spinner) {
      spinner.succeed('Request processed successfully!');
    }

    // Format output based on CLI configuration
    await formatAndDisplayResult(result as { content: { [key: string]: unknown; type: string; text?: string | undefined; data?: string | undefined; mimeType?: string | undefined; }[]; }, cliConfig);
    
    await gracefulExit(0);

  } catch (error: unknown) {
    // Error handling with proper typing
    if (spinner) {
      spinner.fail('Request failed');
    }

    await handleCliError(error, cliConfig);
    await gracefulExit(1);
  }
}

/**
 * Format and display result based on CLI configuration
 */
async function formatAndDisplayResult(
  result: { content: Array<{ type: string; text?: string; data?: string; mimeType?: string; [key: string]: unknown }> },
  config: CLIConfig
): Promise<void> {
  try {
    if (config.outputFormat === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (config.outputFormat === 'yaml') {
      // Simple YAML-like output for CLI results
      console.log('result:');
      console.log('  content:');
      result.content.forEach((item, _index) => {
        console.log(`    - type: ${item.type}`);
        if (item.text) {
          console.log(`      text: |`);
          item.text.split('\n').forEach(line => {
            console.log(`        ${line}`);
          });
        }
        if (item.data) {
          console.log(`      data: ${item.data}`);
        }
        if (item.mimeType) {
          console.log(`      mimeType: ${item.mimeType}`);
        }
      });
      return;
    }

    // Default text format with beautiful styling
    const content = result.content[0];
    if (content && content.type === 'text' && content.text) {
      EnhancedCLIUtils.formatBox(
        content.text,
        '🤖 Vibe Coder Result'
      );
    } else if (content) {
      // Handle non-text content
      console.log(`Content type: ${content.type}`);
      if (content.data) {
        console.log('Data received (use --json for full output)');
      }
    } else {
      console.log('No content returned from request');
    }

  } catch (error) {
    console.error('Error formatting result:', error instanceof Error ? error.message : 'Unknown error');
    // Fallback to simple output
    console.log(JSON.stringify(result, null, 2));
  }
}

/**
 * Handle CLI errors with proper typing and formatting
 */
async function handleCliError(error: unknown, config: CLIConfig): Promise<void> {
  if (error instanceof Error) {
    EnhancedCLIUtils.formatError(error.message);
    
    if (config.verbose && error.stack) {
      console.log();
      console.log(chalk.gray('Stack trace:'));
      console.log(chalk.gray(error.stack));
    }
  } else {
    EnhancedCLIUtils.formatError('An unexpected error occurred');
    
    if (config.verbose) {
      console.log();
      console.log(chalk.gray('Error details:'));
      console.log(chalk.gray(String(error)));
    }
  }

  if (!config.quiet) {
    console.log();
    EnhancedCLIUtils.formatInfo('Try running with --verbose for more details');
  }
}

/**
 * Display comprehensive help information
 */
function displayHelp(): void {
  const helpText = `
${chalk.cyan.bold('🤖 Vibe CLI - Natural Language Development Assistant')}

${chalk.yellow('DESCRIPTION:')}
  Unified command-line interface for all Vibe Coder MCP tools.
  Process natural language requests and route them to the appropriate tool.

${chalk.yellow('USAGE:')}
  ${chalk.green('vibe')}                          ${chalk.gray('Start interactive mode (REPL)')}
  ${chalk.green('vibe')} ${chalk.blue('<request>')} ${chalk.gray('[options]')}   ${chalk.gray('Process one-shot request')}

${chalk.yellow('OPTIONS:')}
  ${chalk.green('-v, --verbose')}     Show detailed output and error traces
  ${chalk.green('-q, --quiet')}       Suppress non-error output  
  ${chalk.green('--format <type>')}   Output format: text, json, yaml (default: text)
  ${chalk.green('--json')}            Shorthand for --format json
  ${chalk.green('--yaml')}            Shorthand for --format yaml
  ${chalk.green('--no-color')}        Disable colored output
  ${chalk.green('-i, --interactive')} Force interactive mode
  ${chalk.green('-h, --help')}        Show this help message

${chalk.yellow('EXAMPLES:')}`;

  const examples = [
    ['vibe "research best practices for React hooks"', 'Research technical topics and best practices'],
    ['vibe "create a PRD for an e-commerce platform"', 'Generate Product Requirements Documents'],
    ['vibe "generate user stories for authentication"', 'Create user stories with acceptance criteria'],
    ['vibe "create task list from user stories"', 'Break down user stories into development tasks'],
    ['vibe "map the codebase structure"', 'Analyze and visualize code architecture'],
    ['vibe "create coding standards for TypeScript"', 'Generate development rules and guidelines'],
    ['vibe "create a React app with Node backend"', 'Generate full-stack project templates'],
    ['vibe "create context for implementing auth"', 'Curate AI-optimized context packages'],
    ['vibe "create project MyApp" --verbose', 'Task management with detailed output'],
    ['vibe "check job status 12345" --json', 'Get job results in JSON format']
  ];

  examples.forEach(([command, description]) => {
    EnhancedCLIUtils.formatExample(command, description);
  });

  const toolsText = `${chalk.yellow('AVAILABLE TOOLS:')}
  ${chalk.cyan('•')} Research Manager - Technical research and analysis
  ${chalk.cyan('•')} PRD Generator - Product requirements documents  
  ${chalk.cyan('•')} User Stories Generator - Agile user stories
  ${chalk.cyan('•')} Task List Generator - Development task lists
  ${chalk.cyan('•')} Rules Generator - Coding standards and guidelines
  ${chalk.cyan('•')} Starter Kit Generator - Full-stack project templates
  ${chalk.cyan('•')} Code Map Generator - Codebase analysis and mapping
  ${chalk.cyan('•')} Context Curator - AI-optimized context packages
  ${chalk.cyan('•')} Vibe Task Manager - Task management and tracking
  ${chalk.cyan('•')} Workflow Runner - Multi-step workflow execution
  ${chalk.cyan('•')} Agent Coordination - Multi-agent task distribution

${chalk.yellow('CONFIGURATION:')}
  Configuration is loaded from centralized systems:
  ${chalk.cyan('•')} OpenRouter API settings from environment variables
  ${chalk.cyan('•')} Security boundaries from unified security config
  ${chalk.cyan('•')} LLM model mappings from llm_config.json

${chalk.yellow('ENVIRONMENT VARIABLES:')}
  ${chalk.green('OPENROUTER_API_KEY')}    Required: Your OpenRouter API key
  ${chalk.green('OPENROUTER_BASE_URL')}   Optional: OpenRouter API base URL
  ${chalk.green('GEMINI_MODEL')}          Optional: Default Gemini model
  ${chalk.green('PERPLEXITY_MODEL')}      Optional: Default Perplexity model

${chalk.gray('For more information, visit: https://github.com/freshtechbro/Vibe-Coder-MCP')}
`;

  console.log(toolsText);

  console.log(helpText);
}

/**
 * Display usage examples for error cases
 */
function displayUsageExample(): void {
  console.log(`${chalk.yellow('Usage:')} ${chalk.green('vibe')} ${chalk.blue('"your natural language request"')}`);
  console.log(`${chalk.yellow('Example:')} ${chalk.green('vibe')} ${chalk.blue('"research best practices for React"')}`);
  console.log(`${chalk.gray('Run')} ${chalk.cyan('vibe --help')} ${chalk.gray('for more information')}`);
}

/**
 * Execute main function with proper error handling
 */
main().catch(async (error: unknown) => {
  console.error(chalk.red('🚨 Fatal error:'));
  if (error instanceof Error) {
    console.error(chalk.red(error.message));
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
  } else {
    console.error(chalk.red('Unknown error occurred'));
    console.error(chalk.gray(String(error)));
  }
  await gracefulExit(1);
});